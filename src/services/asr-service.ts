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

import EventEmitter from "events";
import { SpeechClient } from "@google-cloud/speech";

export class ASRService {
  private emitter = new EventEmitter();
  private state = "None";
  private speechClient = new SpeechClient();
  private recognizeStream: any;

  constructor() {
    this.initStream();
  }

  private initStream() {
    this.recognizeStream = this.speechClient
      .streamingRecognize({
        config: {
          encoding: "LINEAR16",
          sampleRateHertz: 16000,
          languageCode: "en-US",
        },
        interimResults: true,
        singleUtterance: false,
      })
      .on("error", (err: any) => {
        this.state = "Error";
        this.emitter.emit("error", err.message);
      })
      .on("data", (data: any) => {
        const result = data.results[0];
        const transcript = result?.alternatives[0]?.transcript || "";
        const confidence = result?.alternatives[0]?.confidence || 0;

        if (result?.isFinal) {
          this.state = "Complete";
          this.emitter.emit(
            "final-transcript",
            new Transcript(transcript, confidence)
          );
        } else {
          this.state = "Processing";
          this.emitter.emit(
            "transcript",
            new Transcript(transcript, confidence)
          );
        }
      });
  }

  on(event: string, listener: (...args: any[]) => void): ASRService {
    this.emitter.addListener(event, listener);
    return this;
  }

  getState(): string {
    return this.state;
  }

  processAudio(data: Uint8Array): ASRService {
    if (this.state === "Complete") {
      this.emitter.emit("error", "Speech recognition has already completed.");
      return this;
    }

    this.recognizeStream.write({ audioContent: data });
    return this;
  }

  close(): void {
    if (this.recognizeStream) {
      this.recognizeStream.end();
      this.state = "Closed";
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
