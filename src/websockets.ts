import "dotenv/config";

import { WebSocketServer, WebSocket } from "ws";
import {
  ChatDataMessage,
  ChatDataRequestMessage,
  ChatProfile,
} from "./utils/types";
import { logger } from "./logger";
import http from "http";
import { verifyJwt } from "./authentication";
import { addChatMessage, verifyMessage } from "./chat";

const server = http.createServer();
export const wssAuthenticated = new WebSocketServer({ noServer: true });

server.on("upgrade", async function upgrade(request, socket, head) {
  let verifiedWalletId: ChatProfile = undefined;

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

export const wssViewers = new WebSocketServer({
  port: Number.parseInt(process.env.PORT_WS_VIEW),
});
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
    const chatProfile = wallet as ChatProfile;
    logger.info(
      `[WS] Player connected ${chatProfile.walletId} ${chatProfile.nickname}`
    );
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
              username: chatProfile.nickname,
              timestamp: Date.now(),
            };
            addChatMessage(broadcastMsg);
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
  server.listen(Number.parseInt(process.env.PORT_WS_AUTH));

  // Stats Timers
  setInterval(() => {
    updateViewers();
  }, 30000);
};
