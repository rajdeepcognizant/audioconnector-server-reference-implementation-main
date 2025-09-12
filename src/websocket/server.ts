import WS, { WebSocket } from "ws";

import express, { Express, Request } from "express";

import { verifyRequestSignature } from "../auth/authenticator";

import { Session } from "../common/session";

import { getPort } from "../common/environment-variables";

import { SecretService } from "../services/secret-service";

import { Buffer } from "buffer";

import speech from "@google-cloud/speech";

const speechClient = new speech.SpeechClient();

export class Server {

  private app: Express | undefined;

  private httpServer: any;

  private wsServer: any;

  private sessionMap: Map<WebSocket, Session> = new Map();

  private secretService = new SecretService();

  start() {

    console.log(`Starting server on port: ${getPort()}`);

    this.app = express();

    this.httpServer = this.app.listen(getPort());

    this.wsServer = new WebSocket.Server({

      noServer: true,

    });

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

            this.wsServer.handleUpgrade(request, socket, head, (ws: WebSocket) => {

              console.log("Authentication was successful.");

              this.wsServer.emit("connection", ws, request);

            });

          }

        );

      }

    );

    this.wsServer.on("connection", (ws: WebSocket, request: Request) => {

      console.log("New WebSocket connection established.");

      //  Google STT streaming config

      const requestConfig = {

        config: {

          encoding: "LINEAR16",   // adjust based on your client audio format

          sampleRateHertz: 16000, // must match client audio sample rate

          languageCode: "en-US",

        },

        interimResults: true,

      };

      //Create Google streaming recognize stream

      const recognizeStream = speechClient

        .streamingRecognize(requestConfig)

        .on("error", (err) => {

          console.error("Google STT Error:", err);

          ws.send(JSON.stringify({ error: "Speech recognition failed" }));

        })

        .on("data", (data) => {

          const transcript = data.results[0]?.alternatives[0]?.transcript;

          if (transcript) {

            console.log("Transcript:", transcript);

            ws.send(

              JSON.stringify({

                transcript,

                isFinal: data.results[0]?.isFinal,

              })

            );

          }

        });

      ws.on("message", (data: WS.RawData, isBinary: boolean) => {

        if (isBinary) {

          // 🔹 forward audio chunk to Google

          recognizeStream.write(data as Buffer);

        } else {

          console.log("Non-binary message received:", data.toString());

        }

      });

      ws.on("close", () => {

        console.log("WebSocket closed, ending recognition stream.");

        recognizeStream.end();

        this.deleteConnection(ws);

      });

      ws.on("error", (error: Error) => {

        console.error("WebSocket error:", error);

        recognizeStream.end();

        ws.close();

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

    } catch { }

    console.log("Deleting session.");

    this.sessionMap.delete(ws);

  }

}
