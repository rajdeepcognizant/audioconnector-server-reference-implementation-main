/*
* This class provies TTS support for BotResource.
* This is a "dummy" implementation that will need to be replaced
* with an actual TTS engine.
* 
* See `bot-service` in this folder for more information.
*/
import * as textToSpeech from '@google-cloud/text-to-speech';
import { protos } from '@google-cloud/text-to-speech';
const client = new textToSpeech.TextToSpeechClient();

export class TTSService {
    // 5 seconds of silence.
    static silence: number[] = [];

    /*
    * For this implementation, we're just going to generate silence.
    A real-world implementation would use a TTS engine.
    */
    static {
        for (let x = 0; x < 40000; x++) {
            TTSService.silence[x] = 0;
        }
    }

    async getAudioBytes(data: string): Promise<Uint8Array> {
        const client = new textToSpeech.TextToSpeechClient();

        const request: protos.google.cloud.texttospeech.v1.ISynthesizeSpeechRequest = {
            input: { text: data },
            voice: {
                languageCode: 'th-TH', // เลือกภาษาของเสียงที่ต้องการ
                ssmlGender: 'MALE', // เลือกเพศของเสียง (MALE, FEMALE, NEUTRAL)
            },
            audioConfig: {
                audioEncoding: 'MULAW', // รูปแบบของไฟล์เสียงที่ต้องการ (MP3, OGG_OPUS, LINEAR16, etc.)
                speakingRate: 1.0,      //0.25-4
                pitch: 0,              //-20.0-20.0
                volumeGainDb: 0,        //-96.0-16.0
                sampleRateHertz: 8000,
                effectsProfileId: ['telephony-class-application'] //telephony-class-application, handset-class-device, headphone-class-device
            },
        };
    
        // เรียกใช้งาน Text-to-Speech API
        const [response] = await client.synthesizeSpeech(request);

        if (response.audioContent) {
            // แปลง Buffer เป็น Uint8Array
            const audioArray = new Uint8Array(response.audioContent as Buffer);
            return Promise.resolve(audioArray);
        } else {
            throw new Error('Failed to synthesize speech.');
        }
        //return Promise.resolve(Uint8Array.from(TTSService.silence));
    }
}