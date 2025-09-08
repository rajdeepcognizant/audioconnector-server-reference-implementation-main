// src/services/transcribe-translate-service.ts

import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  TranscriptResultStream,
} from "@aws-sdk/client-transcribe-streaming";
import {
  TranslateClient,
  TranslateTextCommand,
} from "@aws-sdk/client-translate";
import { PassThrough, Duplex } from "stream";

export class TranscribeTranslateService {
  private transcribeClient: TranscribeStreamingClient;
  private translateClient: TranslateClient;
  private audioStream: PassThrough;
  private transcriptionStream: any;
  private isTranscriptionActive: boolean = false;

  constructor() {
    this.audioStream = new PassThrough({ highWaterMark: 1024 });

    // Initialize AWS SDK clients.
    // The SDK automatically looks for credentials in your environment variables
    // (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION).
    this.transcribeClient = new TranscribeStreamingClient({
      region: process.env.AWS_REGION || "us-east-1",
    });

    this.translateClient = new TranslateClient({
      region: process.env.AWS_REGION || "us-east-1",
    });
  }

  public async startTranscriptionSession() {
    if (this.isTranscriptionActive) {
      return;
    }
    this.isTranscriptionActive = true;
    try {
      const command = new StartStreamTranscriptionCommand({
        LanguageCode: "en-US",
        MediaEncoding: "pcm",
        MediaSampleRateHertz: 8000,
        AudioStream: this.createAudioStreamIterator(),
      });

      this.transcriptionStream = await this.transcribeClient.send(command);

      // Listen for transcription results
      for await (const event of this.transcriptionStream
        .TranscriptResultStream as AsyncIterable<TranscriptResultStream>) {
        if (event.TranscriptEvent) {
          const results = event.TranscriptEvent.Transcript?.Results;
          if (results && results.length > 0) {
            for (const result of results) {
              if (
                result.IsPartial === false &&
                result.Alternatives &&
                result.Alternatives.length > 0
              ) {
                const transcript = result.Alternatives[0].Transcript;
                if (transcript) {
                  console.log(`Transcription: ${transcript}`);
                  await this.translateText(transcript);
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Transcription stream error:", error);
    } finally {
      this.isTranscriptionActive = false;
    }
  }

  private async *createAudioStreamIterator() {
    for await (const chunk of this.audioStream) {
      yield { AudioEvent: { AudioChunk: chunk } };
    }
  }

  public processAudioChunk(audioChunk: Uint8Array) {
    // Write audio chunk to the PassThrough stream
    this.audioStream.write(audioChunk);
  }

  public endSession() {
    this.audioStream.end();
  }

  private async translateText(text: string) {
    const targetLanguages = ["nl", "es", "el"]; // Dutch, Spanish, Greek
    for (const targetLang of targetLanguages) {
      try {
        const translateCommand = new TranslateTextCommand({
          SourceLanguageCode: "en",
          TargetLanguageCode: targetLang,
          Text: text,
        });

        const translateResponse = await this.translateClient.send(
          translateCommand
        );
        const translatedText = translateResponse.TranslatedText;

        console.log(`Translation (${targetLang}): ${translatedText}`);
      } catch (error) {
        console.error(`Translation error for ${targetLang}:`, error);
      }
    }
  }
}
