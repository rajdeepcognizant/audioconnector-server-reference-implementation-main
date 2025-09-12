// import EventEmitter from 'events';

// /*
// * This class provides ASR support for the incoming audio from the Client.
// * The following events are expected from the session:
// *
// *   Name; error
// *   Parameters: Error message string or error object.
// *
// *   Name: transcript
// *   Parameters: `Transcript` object.
// *
// *   Name: final-transcript
// *   Parameters: `Transcript` object.
// *
// * The current usage of this class requires that a new instance be created once
// * the final transcript has been received.
// */
// export class ASRService {
//     private emitter = new EventEmitter();
//     private state = 'None';
//     private byteCount = 0;

//     on(event: string, listener: (...args: any[]) => void): ASRService {
//         this.emitter?.addListener(event, listener);
//         return this;
//     }

//     getState(): string {
//         return this.state;
//     }

//     /*
//     * For this implementation, we are just going to count the number of bytes received.
//     * Once we get "enough" bytes, we'll treat this as a completion. In a real-world
//     * scenario, an actual ASR engine should be invoked to process the audio bytes.
//     */
//     processAudio(data: Uint8Array): ASRService {
//         if (this.state === 'Complete') {
//             this.emitter.emit('error', 'Speech recognition has already completed.');
//             return this;
//         }

//         this.byteCount += data.length;

//         /*
//         * If we get enough audio bytes, mark this instance as complete, send out the event,
//         * and reset the count to help prevent issues if this instance is attempted to be reused.
//         *
//         * 40k bytes equates to 5 seconds of 8khz PCMU audio.
//         */
//         if (this.byteCount >= 40000) {
//             this.state = 'Complete';
//             this.emitter.emit('final-transcript', {
//                 text: 'I would like to check my account balance.',
//                 confidence: 1.0
//             });
//             this.byteCount = 0;
//             return this;
//         }

//         this.state = 'Processing';
//         return this;
//     }
// }

// export class Transcript {
//     text: string;
//     confidence: number;

//     constructor(text: string, confidence: number) {
//         this.text = text;
//         this.confidence = confidence;
//     }
// }

import { EventEmitter } from "events";
import { SpeechClient } from "@google-cloud/speech";
import { protos } from "@google-cloud/speech";

export class ASRService {
  private emitter = new EventEmitter();
  private state = "None";
  private client: SpeechClient;
  private stream: any;
  private isStreaming = false;

  constructor() {
    this.client = new SpeechClient();
  }

  on(event: string, listener: (...args: any[]) => void): ASRService {
    this.emitter?.addListener(event, listener);
    return this;
  }

  getState(): string {
    return this.state;
  }

  /**
   * Initializes the streaming connection to Google Speech-to-Text.
   */
  startStreaming(): void {
    if (this.isStreaming) {
      this.emitter.emit("error", "Streaming is already in progress.");
      return;
    }

    const request = {
      config: {
        encoding:
          protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.MULAW,
        sampleRateHertz: 8000,
        languageCode: "en-US",
      },
      interimResults: true,
    };

    this.stream = this.client
      .streamingRecognize(request)
      .on("error", (err: Error) => {
        this.isStreaming = false;
        this.state = "Error";
        this.emitter.emit("error", err.message);
      })
      .on("data", (data: any) => {
        const transcript = data.results[0]?.alternatives[0]?.transcript;
        if (transcript && data.results[0].isFinal) {
          this.state = "Complete";
          this.emitter.emit("final-transcript", {
            text: transcript,
            confidence: data.results[0].alternatives[0].confidence,
          });
          this.isStreaming = false;
        } else if (transcript) {
          // Emit interim results if needed
          this.emitter.emit("interim-transcript", {
            text: transcript,
            confidence: data.results[0].alternatives[0].confidence,
          });
        }
      });

    this.isStreaming = true;
    this.state = "Processing";
  }

  /**
   * Sends a chunk of audio data to the Google Speech-to-Text stream.
   */
  processAudio(data: Uint8Array): ASRService {
    if (!this.isStreaming) {
      // Automatically start the stream if not already started.
      // In a real-world scenario, you might want to call startStreaming explicitly.
      this.startStreaming();
    }

    this.stream.write({ audioContent: Buffer.from(data) });
    return this;
  }

  /**
   * Closes the streaming connection.
   */
  stopStreaming(): void {
    if (this.isStreaming) {
      this.stream.end();
      this.isStreaming = false;
    }
  }
}

export class Transcript {
  text: string;
  confidence: number;

  constructor(text: string, confidence: number) {
    this.text = text;
    this.confidence = confidence;
  }
}
