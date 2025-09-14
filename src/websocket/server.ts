import WS, { WebSocket } from 'ws';
import express, { Express, Request } from 'express';
import { verifyRequestSignature } from '../auth/authenticator';
import { Session } from '../common/session';
import { getPort } from '../common/environment-variables';
import { SecretService } from '../services/secret-service';

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
            noServer: true
        });

        this.httpServer.on('upgrade', (request: Request, socket: any, head: any) => {
            console.log(`Received a connection request from ${request.url}.`);
            //console.log(`method: ${request.method}.`);
            //console.log('headers: '+JSON.stringify(request.headers));
            //console.log('trailers: '+JSON.stringify(request.trailers));
            //console.log('Body: '+JSON.stringify(request.body));

            verifyRequestSignature(request, this.secretService)
                .then(verifyResult => {
                    /*if (verifyResult.code !== 'VERIFIED') {
                        console.log('Authentication failed, closing the connection.');
                        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                        socket.destroy();
                        return;
                    }*/

                    this.wsServer.handleUpgrade(request, socket, head, (ws: WebSocket) => {
                        console.log('Authentication was successful.');
                        this.wsServer.emit('connection', ws, request);
                    });
                });
        });

        this.wsServer.on('connection', (ws: WebSocket, request: Request) => {
            ws.on('close', () => {
                const session = this.sessionMap.get(ws);
                console.log('WebSocket connection closed.');
                this.deleteConnection(ws);
            });

            ws.on('error', (error: Error) => {
                const session = this.sessionMap.get(ws);
                console.log(`WebSocket Error: ${error}`);
                ws.close();
            });

            ws.on('message', (data: WS.RawData, isBinary: boolean) => {
                if (ws.readyState !== WebSocket.OPEN) {
                    return;
                }

                const session = this.sessionMap.get(ws);

                if (!session) {
                    const dummySession: Session = new Session(ws, request.headers['audiohook-session-id'] as string, request.url);
                    console.log('Session does not exist.');
                    dummySession.sendDisconnect('error', 'Session does not exist.', {});
                    return;
                }

                if (isBinary) {
                    //const binaryString = this.uint8ArrayToBinaryString(data as Uint8Array); 
                    //console.log(this.formatBinaryString(binaryString, 8));
                    //console.log(`channelId: ${channelId}`);
                    //console.log(`transactionId: ${transactionId}`);
                    session.processBinaryMessage(data as Uint8Array);
                } else {
                    console.log(`data: ${data}`);
                    //console.log(`data: ${data.parameters.inputVariables.Callid}`);
                    //console.log(`data: ${data.parameters.inputVariables.custnum}`);
                    session.processTextMessage(data.toString());
                }
            });

            this.createConnection(ws, request);
        });
    }

    private uint8ArrayToBinaryString(uint8Array: Uint8Array): string {
        let binaryString = '';
    
        for (let i = 0; i < uint8Array.length; i++) {
            // แปลงแต่ละ byte เป็นเลขฐานสองแล้วเติมให้ครบ 8 หลักด้วย padStart
            binaryString += uint8Array[i].toString(2).padStart(8, '0');
        }
    
        return binaryString;
    }

    private formatBinaryString(binaryString: string, length: number): string {
        return binaryString.padStart(length, '0');
    }

    private createConnection(ws: WebSocket, request:Request) {
        let session: Session | undefined = this.sessionMap.get(ws);

        if (session) {
            return;
        }

        session = new Session(ws, request.headers['audiohook-session-id'] as string, request.url);
        console.log('Creating a new session.');
        this.sessionMap.set(ws, session);
    }

    private deleteConnection(ws: WebSocket) {
        const session: Session | undefined = this.sessionMap.get(ws);

        if (!session) {
            return;
        }

        try {
            session.close();
        } catch {
        }

        console.log('Deleting session.');
        this.sessionMap.delete(ws);
    }
}