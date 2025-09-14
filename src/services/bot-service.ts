import { JsonStringMap } from "../protocol/core";
import { BotTurnDisposition } from "../protocol/voice-bots";
import { TTSService } from "./tts-service";
import { makeApiCall } from './api-service';

/*
* This class provides support for retreiving a Bot Resource based on the supplied
* connection URL and input variables.
* 
* For the purposes of this example, we are just returning a "dummy" resource, and
* a real implemetation will need to be provided.
*/
export class BotService {
    getBotIfExists(connectionUrl: string, inputVariables: JsonStringMap): Promise<BotResource | null> {
        return Promise.resolve(new BotResource());
    }
}

interface ApiResponse {
    endChat: boolean;
    message: string;
    status: string;
}

/*
* This class provides support for the various methods needed to interact with an Bot.
*/
export class BotResource {
    private ttsService = new TTSService();
    private channelId: String | undefined;
    private transactionId: String | undefined;

    /*
    * This method is used to retrieve the initial response from the Bot.
    * 
    * This is a "dummy" implementation that will need to be replaced.
    */
    getInitialResponse(connectionUrl: string, inputVariables: JsonStringMap): Promise<BotResponse> {
        //this.channelId = '020966903';
        this.channelId = inputVariables.dnis;
        this.transactionId = inputVariables.custnum;

        //const message = 'Hello and welcome to AudioConnector.';
        const message = 'สวัสดีครับ ต้องการติดต่อสอบถามเรื่องใดคะ';
        /*
        * The TTS Service has a "dummy" implementation that will need
        * to be replaced.
        * 
        * See `tts-service` in this folder for more information.
        */
        return this.ttsService.getAudioBytes(message)
            .then(audioBytes => new BotResponse('match', message)
                .withConfidence(1.0)
                .withAudioBytes(audioBytes));
    }

    /*
    * This method is used to retrieve the a response from the Bot
    * based on the provided input. For this implementation, the
    * input is either the Caller's audio's transcript, or captured
    * DTMF digits.
    * 
    * This is a "dummy" implementation that will need to be replaced.
    */
    async getBotResponse(data: string): Promise<BotResponse> {
        //const message = 'ขอบคุณที่ติดต่อเข้ามาครับ';
        console.log(`User: ${data}`);
        const url = 'https://bo-bot-service-29514950838.us-central1.run.app/callback'
        const requestBody = {
            channelId: this.channelId,
            transactionId: this.transactionId,
            message: data,
        };
        const resStr = await makeApiCall(url, requestBody);
        const resObj: ApiResponse = JSON.parse(resStr);
        //if(res.status === 'success')
        const message = resObj.message;
        console.log(`AI: ${message}`);

        return this.ttsService.getAudioBytes(message)
            .then(audioBytes => new BotResponse('match', message)
                .withConfidence(1.0)
                .withEndSession(false)
                .withAudioBytes(audioBytes));
        /*return this.ttsService.getAudioBytes(message)
            .then(audioBytes => new BotResponse('match', message)
                .withConfidence(1.0)
                .withEndSession(false));*/
    }
}

export class BotResponse {
    disposition: BotTurnDisposition;
    text: string;
    confidence?: number;
    audioBytes?: Uint8Array;
    endSession?: boolean;

    constructor(disposition: BotTurnDisposition, text: string) {
        this.disposition = disposition;
        this.text = text;
    }

    withConfidence(confidence: number): BotResponse {
        this.confidence = confidence;
        return this;
    }

    withAudioBytes(audioBytes: Uint8Array): BotResponse {
        this.audioBytes = audioBytes;
        return this;
    }

    withEndSession(endSession: boolean): BotResponse {
        this.endSession = endSession;
        return this;
    }
}