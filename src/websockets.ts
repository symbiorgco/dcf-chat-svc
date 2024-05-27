import { WebSocketServer, WebSocket } from "ws";
import { ChatDataMessage, ChatDataRequestMessage } from "./utils/types";
import { logger } from "./logger";
import http from "http";
import { verifyJwt } from "./authentication";
import { verifyMessage } from "./chat";

const server = http.createServer();
export const wssAuthenticated = new WebSocketServer({ noServer: true });

server.on("upgrade", async function upgrade(request, socket, head) {
  let verifiedWalletId: string = undefined;

  try {
    const headers = request.headers;

    verifiedWalletId = await verifyJwt(
      headers["sec-websocket-protocol"] as string
    );

    if (!verifiedWalletId) {
      logger.info(`[JWT] error player connecting not verified`);
      socket.destroy();
      return;
    }

    wssAuthenticated.handleUpgrade(request, socket, head, function done(ws) {
      wssAuthenticated.emit("connection", ws, request, verifiedWalletId);
    });
  } catch (err) {
    logger.error(`[JWT] error player connecting`);
    logger.error(err);
    socket.destroy();
    return;
  }
});

export const wssViewers = new WebSocketServer({ port: 8201 });
export let viewers = 5;

export const broadcastMessage = (msg: Buffer) => {
  wssAuthenticated.clients.forEach(async (client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg, { binary: false });
    }
  });
  // Send to viewers
  wssViewers.clients.forEach(async (client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg, { binary: false });
    }
  });
};

wssAuthenticated.on("connection", function connection(ws, request, wallet) {
  try {
    const walletId = wallet as string;
    logger.info(`[WS] Player connected ${walletId}`);
    ws.on("message", function message(data) {
      try {
        const msg = JSON.parse(data.toString()) as ChatDataRequestMessage;
        if (msg.type === "MSG") {
          const verifiedMessage = verifyMessage(msg.message);
          if (verifiedMessage.error) {
            //// REPLY ERROR TO THE USER
            logger.info("Received errored message");
          } else {
            const broadcastMsg: ChatDataMessage = {
              type: "MSG",
              message: verifiedMessage.msg,
              username: "USERNAME",
              timestamp: Date.now(),
            };

            broadcastMessage(Buffer.from(JSON.stringify(broadcastMsg)));
          }
        }
      } catch (err) {
        console.log("received: %s", data);
      }
    });
  } catch (err) {
    logger.error(err);
  }
});

const updateViewers = () => {
  viewers = wssAuthenticated.clients.size + 7 + wssViewers.clients.size;
  logger.info(`[STATS] Total connected clients: ${viewers}`);
};

export const initWebsockets = () => {
  server.listen(8200);

  // Stats Timers
  setInterval(() => {
    updateViewers();
  }, 30000);
};
