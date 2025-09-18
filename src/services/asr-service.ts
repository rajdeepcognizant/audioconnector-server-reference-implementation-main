import EventEmitter from "events";
import speech, { protos } from "@google-cloud/speech";

export class ASRService {
  private recognizeStream: NodeJS.WritableStream | null = null;
  private emitter = new EventEmitter();
  private state = "None";
  private finalTranscript = "";
  private client = new speech.SpeechClient();
  private request = {
    config: {
      encoding: "MULAW" as const,
      sampleRateHertz: 8000,
      audioChannelCount: 1,
      enableSeparateRecognitionPerChannel: false,
      languageCode: "en-US",
      model: "default",
      enableWordTimeOffsets: true,
    },
    interimResults: true,
  };

  startStream() {
    this.recognizeStream = this.client
      .streamingRecognize(this.request)
      .on("error", (error) => {
        console.error("Error during speech recognition:", error);
        this.emitter.emit("error", error);
      })
      .on("data", this.speechCallback.bind(this));
  }

  endStream() {
    if (this.recognizeStream) {
      console.log("Ending speech recognition stream.");
      this.recognizeStream.end();
      this.recognizeStream = null;
    }
  }

  speechCallback(
    data: protos.google.cloud.speech.v1.StreamingRecognizeResponse
  ) {
    const results = data.results || [];
    for (const result of results) {
      if (result.alternatives && result.alternatives[0]) {
        const transcript = result.alternatives[0].transcript;
        if (transcript) {
          this.finalTranscript = transcript;
        }

        if (result.isFinal) {
          console.log(`Final Transcription: ${this.finalTranscript}`);
          this.state = "Complete";
          this.emitter.emit("final-transcript", {
            text: this.finalTranscript,
            confidence: 1.0,
          });
          this.finalTranscript = ""; // Reset for the next turn
        } else {
          console.log(`Interim Transcription: ${transcript}`);
          this.emitter.emit("transcript", {
            text: transcript,
            confidence: 1.0, // Interim results may not have a confidence score
          });
        }
      }
    }
  }

  constructor() {
    this.startStream();
  }

  on(event: string, listener: (...args: any[]) => void): ASRService {
    this.emitter.addListener(event, listener);
    return this;
  }

  getState(): string {
    return this.state;
  }

  processAudio(data: Uint8Array): ASRService {
    if (this.recognizeStream && data.length > 0) {
      this.recognizeStream.write(data);
    }
    return this;
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