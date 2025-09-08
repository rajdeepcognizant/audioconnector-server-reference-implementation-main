const WebSocket = require("ws");
const Session = require("../common/session");

const wss = new WebSocket.Server({ port: 8080 });
const sessions = {};

wss.on("connection", (ws) => {
  console.log("New WebSocket connection established");

  ws.on("message", async (data) => {
    try {
      const msg = JSON.parse(data);

      // Handle 'open' message to initialize session
      if (msg.type === "open") {
        const sessionId = msg.id;
        const session = new Session(sessionId, ws);
        sessions[sessionId] = session;
        console.log(`Session opened: ${sessionId}`);
        return;
      }

      // Handle 'audio' message to process audio chunk
      if (msg.type === "audio") {
        const session = sessions[msg.id];
        if (!session) {
          console.warn(`No session found for ID: ${msg.id}`);
          return;
        }

        session.handleAudio({
          speaker: msg.speaker || "customer",
          audioChunk: Buffer.from(msg.audio, "base64"),
        });
        return;
      }

      console.warn(`Unknown message type: ${msg.type}`);
    } catch (error) {
      console.error("Error processing message:", error);
    }
  });

  ws.on("close", () => {
    console.log("WebSocket connection closed");
    // Optionally clean up sessions
  });
});

console.log("AudioConnector WebSocket server is running on port 8080");
