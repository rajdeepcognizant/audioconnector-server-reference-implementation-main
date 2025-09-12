import WS, { WebSocket } from "ws";
import express, { Express, Request } from "express";
import { verifyRequestSignature } from "../auth/authenticator";
import { Session } from "../common/session";
import { getPort } from "../common/environment-variables";
import { SecretService } from "../services/secret-service";
import { Buffer } from 'buffer';
import { SpeechClient } from '@google-cloud/speech';

export class Server {
  private app: Express | undefined;
  private httpServer: any;
  private wsServer: any;
  private sessionMap: Map<WebSocket, Session> = new Map();
  private secretService = new SecretService();

  private speechClient: SpeechClient;
  private streamingRecognizeStream: any; // A stream to handle the audio data

  constructor() {
    // Instantiate the Speech-to-Text client.
    // The library automatically handles authentication if the GOOGLE_APPLICATION_CREDENTIALS
    // environment variable is set to the path of your service account key file.
    this.speechClient = new SpeechClient();
  }

  start() {
    console.log(`Starting server on ports: ${getPort()}`);

    this.app = express();
    this.httpServer = this.app.listen(getPort());
    this.wsServer = new WebSocket.Server({
      noServer: true,
    });
    // req,socket,head, req.header = upgrade, Connection : websocket
    this.httpServer.on(
      "upgrade",
      (request: Request, socket: any, head: any) => {
        console.log(`Received a connection request from ${request.url}.`);

        verifyRequestSignature(request, this.secretService).then(
          (verifyResult) => {
            if (verifyResult.code !== "VERIFIED") {
              console.log("Authentication failed, closing the connection.");
              socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
              socket.destroy();
              return;
            }

            this.wsServer.handleUpgrade(
              request,
              socket,
              head,
              (ws: WebSocket) => {
                console.log("Authentication was successful.");
                this.wsServer.emit("connection", ws, request);
              }
            );
          }
        );
      }
    );

    this.wsServer.on("connection", (ws: WebSocket, request: Request) => {

       // Create the streaming recognition request when a new connection is established
       const requestConfig = {
        config: {
          encoding: "LINEAR16", // Change this to your audio encoding
          sampleRateHertz: 16000, // Change this to your audio sample rate
          languageCode: "en-US", // Change to the appropriate language
        },
        interimResults: false, // Set to true to get results while the user is speaking
      };

      this.streamingRecognizeStream = this.speechClient
        .streamingRecognize(requestConfig)
        .on("error", console.error)
        .on("data", (data) => {
          // Here, you receive the transcription results from Google
          console.log(
            `Transcription: ${
              data.results[0] && data.results[0].alternatives[0]
                ? data.results[0].alternatives[0].transcript
                : "No transcription."
            }`
          );
        });

      ws.on("close", () => {
        const session = this.sessionMap.get(ws);
        console.log("WebSocket connection closed.");
        this.deleteConnection(ws);
          // End the recognition stream when the connection closes
          this.streamingRecognizeStream.end();
      });

      ws.on("error", (error: Error) => {
        const session = this.sessionMap.get(ws);
        console.log(`WebSocket Error: ${error}`);
        ws.close();
      });

      ws.on("message", (data: WS.RawData, isBinary: boolean) => {
        console.log("base64",typeof data)
        console.log("WebSocket message received." + data);
        if (ws.readyState !== WebSocket.OPEN) {
          return;
        }

        const session = this.sessionMap.get(ws);

        if (!session) {
          const dummySession: Session = new Session(
            ws,
            request.headers["audiohook-session-id"] as string,
            request.url
          );
          console.log("Session does not exist.");
          dummySession.sendDisconnect("error", "Session does not exist.", {});
          return;
        }

        if (isBinary) {
          session.processBinaryMessage(data as Uint8Array);
          console.log("processBinaryMessage::Audio Data" + data);

          this.streamingRecognizeStream.write(data);
          // Cast data to Buffer to access .subarray()
        // const bufferData = data as Buffer;
        // session.processBinaryMessage(bufferData);
        // console.log("processBinaryMessage::Audio Data" + bufferData);

        // // Convert the first 100 bytes to a Base64 string for inspection
        // const audioChunk = bufferData.subarray(0, 100);
        // const base64Audio = Buffer.from(audioChunk).toString('base64');
        // console.log("processBinaryMessage::Base64 Audio Data:", base64Audio);
        } else {
          session.processTextMessage(data.toString());
          console.log("processTextMessage:: Audio Data" + data);
        }
      });

      this.createConnection(ws, request);
    });
  }

  private createConnection(ws: WebSocket, request: Request) {
    let session: Session | undefined = this.sessionMap.get(ws);

    if (session) {
      return;
    }

    session = new Session(
      ws,
      request.headers["audiohook-session-id"] as string,
      request.url
    );
    console.log("Creating a new session.");
    this.sessionMap.set(ws, session);
  }

  private deleteConnection(ws: WebSocket) {
    const session: Session | undefined = this.sessionMap.get(ws);

    if (!session) {
      return;
    }

    try {
      session.close();
    } catch {}

    console.log("Deleting session.");
    this.sessionMap.delete(ws);
  }
}
