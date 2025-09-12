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
import speech, { protos } from "@google-cloud/speech";

/*
 * This class provides ASR support for the incoming audio from the Client.
 * The following events are expected from the session:
 *
 *   Name; error
 *   Parameters: Error message string or error object.
 *
 *   Name: transcript
 *   Parameters: `Transcript` object.
 *
 *   Name: final-transcript
 *   Parameters: `Transcript` object.
 *
 * The current usage of this class requires that a new instance be created once
 * the final transcript has been received.
 */
export class ASRService {
  private recognizeStream: NodeJS.WritableStream | null = null;
  private emitter = new EventEmitter();
  private state = "None";
  private byteCount = 0;
  private processingText = false;
  private client = new speech.SpeechClient();
  private request = {
    config: {
      encoding: "MULAW" as const, // Explicitly cast to enum value
      sampleRateHertz: 8000,
      audioChannelCount: 1,
      enableSeparateRecognitionPerChannel: false,
      languageCode: "en-US",
      model: "default",
      enableWordTimeOffsets: true,
    },
    interimResults: true,
  };
  private empty_buffer = Buffer.alloc(1, 0);
  private finalTranscript = "";

  startStream() {
    this.recognizeStream = this.client.streamingRecognize(this.request);
    this.recognizeStream.on("data", this.speechCallback.bind(this));
    this.recognizeStream.on("error", (error) => {
      console.error("Error during speech recognition:", error);
    });

    this.recognizeStream.on("end", () => {
      console.log("Speech recognition ended");
      this.processingText = false;

      this.state = "Complete";
      if (!this.emitter) this.emitter = new EventEmitter();
      this.emitter.emit("final-transcript", {
        text: this.finalTranscript,
        confidence: 1.0,
      });
    });
  }

  speechCallback(
    data: protos.google.cloud.speech.v1.StreamingRecognizeResponse
  ) {
    var audioText = "";
    const results = data.results || [];
    for (const result of results) {
      if (result.alternatives != null) {
        const transcript = result.alternatives[0].transcript;
        console.log(`Transcription: ${transcript}`);
        audioText += transcript;
        if (transcript) this.finalTranscript = transcript;
      }
    }
  }

  constructor() {
    console.log("Start Initial Speech");
    //this.client = new speech.SpeechClient();
    this.startStream();
    console.log("End Initial Speech");
  }

  on(event: string, listener: (...args: any[]) => void): ASRService {
    this.emitter?.addListener(event, listener);
    return this;
  }

  getState(): string {
    return this.state;
  }

  /*
   * For this implementation, we are just going to count the number of bytes received.
   * Once we get "enough" bytes, we'll treat this as a completion. In a real-world
   * scenario, an actual ASR engine should be invoked to process the audio bytes.
   */
  processAudio(data: Uint8Array): ASRService {
    if (this.state === "Complete") {
      this.emitter.emit("error", "Speech recognition has already completed.");
      return this;
    }

    /*const silenceThreshold = 0.01; 
        const isSilent = this.isSilence(data, silenceThreshold, 0.9);

        if (isSilent) {
            console.log('Detected silence');
        } else {
            console.log('Detected sound');
        }
        */
    if (data && data.length > 0) {
      if (this.recognizeStream != null && this.processingText === false) {
        //console.log('Write Chunk!!!');
        this.recognizeStream.write(data);
      }
      this.byteCount += data.length;
    } else {
      // no data coming from stream, write 0's into stream
      console.log("Nothing to write, buffer empty, writing dummy chunk");
      if (this.recognizeStream != null) {
        this.recognizeStream.write(this.empty_buffer);
      }
    }
    console.log("byteCount:", this.byteCount);

    /*
     * If we get enough audio bytes, mark this instance as complete, send out the event,
     * and reset the count to help prevent issues if this instance is attempted to be reused.
     *
     * 40k bytes equates to 5 seconds of 8khz PCMU audio.
     */
    if (this.byteCount >= 40000) {
      if (this.recognizeStream != null) {
        this.processingText = true;
        console.log("End Chunk!!!");
        try {
          this.recognizeStream.end();
        } catch (error) {
          console.log(`error: ${error}`);
        }
        this.recognizeStream.removeListener("data", this.speechCallback);
        //this.recognizeStream.destroy();
        this.recognizeStream = null;

        this.startStream();
      }

      this.byteCount = 0;
      return this;
    }
    this.state = "Processing";
    return this;
  }

  detectSilence(audioData: Uint8Array, threshold: number): boolean {
    //Alway sound. threshold 0.01
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i] * audioData[i];
    }
    const average = sum / audioData.length;
    return average < threshold;
  }

  calculateRMS(audioData: Uint8Array, threshold: number): boolean {
    //Alway sound. threshold 0.01
    let sumSquares = 0;
    for (let i = 0; i < audioData.length; i++) {
      sumSquares += audioData[i] * audioData[i];
    }

    var isSlient = false;
    if (Math.sqrt(sumSquares / audioData.length) < threshold) isSlient = true;
    return isSlient;
  }

  calculateZCR(audioData: Uint8Array, threshold: number): boolean {
    //Alway silence. threshold 0.1
    let zeroCrossings = 0;
    for (let i = 1; i < audioData.length; i++) {
      if (
        (audioData[i - 1] > 0 && audioData[i] < 0) ||
        (audioData[i - 1] < 0 && audioData[i] > 0)
      ) {
        zeroCrossings++;
      }
    }
    var isSlient = false;
    if (zeroCrossings / audioData.length < threshold) isSlient = true;
    return isSlient;
  }

  isSilence(
    audioData: Uint8Array,
    silenceThreshold: number,
    durationThreshold: number
  ): boolean {
    //Alway sound. threshold 0.01, duration 0.9
    let silentSamples = 0;
    for (let i = 0; i < audioData.length; i++) {
      if (Math.abs(audioData[i]) < silenceThreshold) {
        silentSamples++;
      }
    }
    return silentSamples / audioData.length > durationThreshold;
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
