import { v4 as uuid } from "uuid";
import { WebSocket } from "ws";
import { JsonStringMap, MediaParameter } from "../protocol/core";
import {
  ClientMessage,
  DisconnectParameters,
  DisconnectReason,
  EventParameters,
  SelectParametersForType,
  ServerMessage,
  ServerMessageBase,
  ServerMessageType,
} from "../protocol/message";
import {
  BotTurnDisposition,
  EventEntityBargeIn,
  EventEntityBotTurnResponse,
} from "../protocol/voice-bots";
import { MessageHandlerRegistry } from "../websocket/message-handlers/message-handler-registry";
import { BotService, BotResource, BotResponse } from "../services/bot-service";
import { ASRService, Transcript } from "../services/asr-service";
import { DTMFService } from "../services/dtmf-service";
import { SpeechClient } from '@google-cloud/speech';
import { Buffer } from 'buffer';

export class Session {
  private MAXIMUM_BINARY_MESSAGE_SIZE = 64000;
  private disconnecting = false;
  private closed = false;
  private ws;

  private messageHandlerRegistry = new MessageHandlerRegistry();
  private botService = new BotService();
  private asrService: ASRService | null = null;
  private dtmfService: DTMFService | null = null;
  private url;
  private clientSessionId;
  private conversationId: string | undefined;
  private lastServerSequenceNumber = 0;
  private lastClientSequenceNumber = 0;
  private inputVariables: JsonStringMap = {};
  private selectedMedia: MediaParameter | undefined;
  private selectedBot: BotResource | null = null;
  private isCapturingDTMF = false;
  private isAudioPlaying = false;
  private participant: string | undefined;

  // Instantiate the Speech-to-Text client
  private speechClient: SpeechClient;

  constructor(ws: WebSocket, sessionId: string, url: string) {
    this.ws = ws;
    this.clientSessionId = sessionId;
    this.url = url;
    this.speechClient = new SpeechClient();
  }

  close() {
    if (this.closed) {
      return;
    }

    try {
      this.ws.close();
    } catch {}

    this.closed = true;
  }

  setConversationId(conversationId: string) {
    this.conversationId = conversationId;
    console.log(`Conversation Id: ${conversationId}.`);
  }

  setInputVariables(inputVariables: JsonStringMap) {
    this.inputVariables = inputVariables;
    console.log(`inputVariables: ${inputVariables}.`);
  }

  setSelectedMedia(selectedMedia: MediaParameter) {
    this.selectedMedia = selectedMedia;
    console.log(`selectedMedia: ${selectedMedia}.`);
  }

  setIsAudioPlaying(isAudioPlaying: boolean) {
    this.isAudioPlaying = isAudioPlaying;
    console.log(`isAudioPlaying: ${isAudioPlaying}.`);
  }

  processTextMessage(data: string) {
    if (this.closed) {
      return;
    }

    const message = JSON.parse(data);
    const jsonMessage = JSON.parse(data);
    console.log("Received Text Message:", message);
    if(jsonMessage.type === "open"){
      console.log('jsonMessage',jsonMessage);
      console.log('message',message);
      console.log('jsonMessage.parameters',jsonMessage.parameters);
    }
    if (jsonMessage.type === "open" && jsonMessage.parameters.inputVariables) {
      this.participant = jsonMessage.parameters.inputVariables.Participant;
      console.log(`New session opened for Participant: ${this.participant}`);
    }
    if (message.seq !== this.lastClientSequenceNumber + 1) {
      console.log(`Invalid client sequence number: ${message.seq}.`);
      this.sendDisconnect("error", "Invalid client sequence number.", {});
      return;
    }

    this.lastClientSequenceNumber = message.seq;

    if (message.serverseq > this.lastServerSequenceNumber) {
      console.log(`Invalid server sequence number: ${message.serverseq}.`);
      this.sendDisconnect("error", "Invalid server sequence number.", {});
      return;
    }

    if (message.id !== this.clientSessionId) {
      console.log(`Invalid Client Session ID: ${message.id}.`);
      this.sendDisconnect("error", "Invalid ID specified.", {});
      return;
    }

    const handler = this.messageHandlerRegistry.getHandler(message.type);

    if (!handler) {
      console.log(`Cannot find a message handler for '${message.type}'.`);
      return;
    }

    handler.handleMessage(message as ClientMessage, this);
  }

  createMessage<Type extends ServerMessageType, Message extends ServerMessage>(
    type: Type,
    parameters: SelectParametersForType<Type, Message>
  ): ServerMessage {
    const message: ServerMessageBase<Type, typeof parameters> = {
      id: this.clientSessionId as string,
      version: "2",
      seq: ++this.lastServerSequenceNumber,
      clientseq: this.lastClientSequenceNumber,
      type,
      parameters,
    };

    return message as ServerMessage;
  }

  send(message: ServerMessage) {
    if (message.type === "event") {
      console.log(
        `Sending an ${message.type} message: ${message.parameters.entities[0].type}.`
      );
    } else {
      console.log(`Sending a ${message.type} message.`);
    }

    this.ws.send(JSON.stringify(message));
  }

  sendAudio(bytes: Uint8Array) {
    if (bytes.length <= this.MAXIMUM_BINARY_MESSAGE_SIZE) {
      console.log(`Sending ${bytes.length} binary bytes in 1 message.`);
      this.ws.send(bytes, { binary: true });
    } else {
      let currentPosition = 0;

      while (currentPosition < bytes.length) {
        const sendBytes = bytes.slice(
          currentPosition,
          currentPosition + this.MAXIMUM_BINARY_MESSAGE_SIZE
        );

        console.log(
          `Sending ${sendBytes.length} binary bytes in chunked message.`
        );
        this.ws.send(sendBytes, { binary: true });
        currentPosition += this.MAXIMUM_BINARY_MESSAGE_SIZE;
      }
    }
  }

  sendBargeIn() {
    const bargeInEvent: EventEntityBargeIn = {
      type: "barge_in",
      data: {},
    };
    const message = this.createMessage("event", {
      entities: [bargeInEvent],
    } as SelectParametersForType<"event", EventParameters>);

    this.send(message);
  }

  sendTurnResponse(
    disposition: BotTurnDisposition,
    text: string | undefined,
    confidence: number | undefined
  ) {
    const botTurnResponseEvent: EventEntityBotTurnResponse = {
      type: "bot_turn_response",
      data: {
        disposition,
        text,
        confidence,
      },
    };
    const message = this.createMessage("event", {
      entities: [botTurnResponseEvent],
    } as SelectParametersForType<"event", EventParameters>);

    this.send(message);
  }

  sendDisconnect(
    reason: DisconnectReason,
    info: string,
    outputVariables: JsonStringMap
  ) {
    this.disconnecting = true;

    const disconnectParameters: DisconnectParameters = {
      reason,
      info,
      outputVariables,
    };
    const message = this.createMessage("disconnect", disconnectParameters);

    this.send(message);
    console.log(`Disconnect triggered by endpoint: Reason=${reason}, Info=${info}`);
  }

  sendClosed() {
    const message = this.createMessage("closed", {});
    this.send(message);
  }

  checkIfBotExists(): Promise<boolean> {
    return this.botService
      .getBotIfExists(this.url, this.inputVariables)
      .then((selectedBot: BotResource | null) => {
        this.selectedBot = selectedBot;
        return this.selectedBot != null;
      });
  }

  processBotStart() {
    if (!this.selectedBot) {
      return;
    }

    this.selectedBot.getInitialResponse().then((response: BotResponse) => {
      if (response.text) {
        this.sendTurnResponse(
          response.disposition,
          response.text,
          response.confidence
        );
      }

      if (response.audioBytes) {
        this.sendAudio(response.audioBytes);
      }
    });
  }

  processBinaryMessage(data: Uint8Array) {
    console.log("Received Binary Audio Message of length:", data.length);
    if (this.disconnecting || this.closed || !this.selectedBot) {
      return;
    }

    const base64Audio = Buffer.from(data).toString('base64');

    if (this.participant) {
      console.log(
        `Incoming Audio Data for ${this.participant}: ${data.length} bytes`
      );
    } else {
      console.log(
        `Incoming Audio Data (unknown participant): ${data.length} bytes`
      );
    }

    if (this.isCapturingDTMF) {
      return;
    }

    if (this.isAudioPlaying) {
      this.asrService = null;
      this.dtmfService = null;
      return;
    }

    // Define the request configuration for the Speech-to-Text API
    const request = {
      audio: {
        content: base64Audio,
      },
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: 16000,
        languageCode: 'en-US',
      },
    };

    // Call the Google Speech-to-Text API to get the transcription
    this.speechClient
      .recognize(request)
      .then(([response]) => {
        const transcription = response.results
          ?.map(result => result.alternatives?.[0].transcript)
          .join('\n');

        if (transcription) {
          console.log(`Transcription: ${transcription}`);
          this.selectedBot
            ?.getBotResponse(transcription)
            .then((botResponse: BotResponse) => {
              if (botResponse.text) {
                this.sendTurnResponse(
                  botResponse.disposition,
                  botResponse.text,
                  botResponse.confidence
                );
              }
              if (botResponse.audioBytes) {
                this.sendAudio(botResponse.audioBytes);
              }
              if (botResponse.endSession) {
                this.sendDisconnect("completed", "", {});
              }
            });
        }
      })
      .catch(error => {
        console.error("Error with Google Speech-to-Text API:", error);
        // Fallback or error handling can be placed here
      });
  }

  processDTMF(digit: string) {
    if (this.disconnecting || this.closed || !this.selectedBot) {
      return;
    }

    if (this.isAudioPlaying) {
      this.asrService = null;
      this.dtmfService = null;
      return;
    }

    if (!this.isCapturingDTMF) {
      this.isCapturingDTMF = true;
      this.asrService = null;
    }

    if (!this.dtmfService || this.dtmfService.getState() === "Complete") {
      this.dtmfService = new DTMFService()
        .on("error", (error: any) => {
          const message = "Error during DTMF Capture.";
          console.log(`${message}: ${error}`);
          this.sendDisconnect("error", message, {});
        })
        .on("final-digits", (digits) => {
          this.selectedBot
            ?.getBotResponse(digits)
            .then((response: BotResponse) => {
              if (response.text) {
                this.sendTurnResponse(
                  response.disposition,
                  response.text,
                  response.confidence
                );
              }

              if (response.audioBytes) {
                this.sendAudio(response.audioBytes);
              }

              if (response.endSession) {
                this.sendDisconnect("completed", "", {});
              }

              this.isCapturingDTMF = false;
            });
        });
    }

    this.dtmfService.processDigit(digit);
  }
}