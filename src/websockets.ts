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
import {
  addChatMessage,
  banUser,
  isBanned,
  removeChatMessage,
  verifyMessage,
} from "./chat";
import NodeCache from "node-cache";

import admins from "./admins.json";
const server = http.createServer();
export const wssAuthenticated = new WebSocketServer({ noServer: true });

server.on("upgrade", async function upgrade(request, socket, head) {
  let chatProfile: ChatProfile = undefined;

  try {
    const headers = request.headers;

    chatProfile = await verifyJwt(headers["sec-websocket-protocol"] as string);

    if (!chatProfile) {
      logger.info(`[JWT] error player connecting not verified`);
      socket.destroy();
      return;
    }

    wssAuthenticated.handleUpgrade(request, socket, head, function done(ws) {
      wssAuthenticated.emit("connection", ws, request, chatProfile);
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
export let viewers = 0;

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

const intervalCache = new NodeCache({
  stdTTL: 1, // 1 message per second
  checkperiod: 10,
});

const isAdmin = (walletId: string) => {
  if (admins.includes(walletId)) {
    return true;
  } else {
    return false;
  }
};

let idPrefix = "prefix";
let currentId = 0;

wssAuthenticated.on(
  "connection",
  function connection(ws, request, chatProfile: ChatProfile) {
    try {
      logger.info(
        `[WS] Player connected ${chatProfile.walletId} ${chatProfile.nickname}`
      );
      const chatProfileMSG: ChatDataMessage = {
        type: "PROFILE",
        message: chatProfile.role,
        username: chatProfile.nickname,
        timestamp: Date.now(),
        id: "",
      };
      ws.send(Buffer.from(JSON.stringify(chatProfileMSG)), { binary: false });
      ws.on("message", function message(data) {
        try {
          const msg = JSON.parse(data.toString()) as ChatDataRequestMessage;
          if (msg.type === "MSG" && !intervalCache.get(chatProfile.walletId)) {
            intervalCache.set(chatProfile.walletId, true);
            if (!isBanned(chatProfile.walletId)) {
              if (msg.message.length > 0) {
                const verifiedMessage = verifyMessage(msg.message);
                if (verifiedMessage.error) {
                  //// REPLY ERROR TO THE USER
                  logger.info("Received errored message");
                } else {
                  currentId++;
                  const broadcastMsg: ChatDataMessage = {
                    type: "MSG",
                    message: verifiedMessage.msg,
                    username: chatProfile.nickname,
                    wallet: chatProfile.walletId, // TODO hide for normal users?
                    timestamp: Date.now(),
                    id: `${idPrefix}${currentId}`,
                  };
                  addChatMessage(broadcastMsg);
                  broadcastMessage(Buffer.from(JSON.stringify(broadcastMsg)));
                }
              } else {
                logger.info("Received length 0");
              }
            }
          } else if (msg.type === "BAN") {
            if (isAdmin(chatProfile.walletId)) {
              banUser(chatProfile.walletId);
            }
          } else if (msg.type === "REMOVE") {
            if (isAdmin(chatProfile.walletId)) {
              const idToRemove = msg.message;
              const broadcastMsg: ChatDataMessage = {
                type: "REMOVE",
                message: "",
                username: "",
                timestamp: Date.now(),
                id: idToRemove,
              };
              if (removeChatMessage(idToRemove)) {
                broadcastMessage(Buffer.from(JSON.stringify(broadcastMsg)));
              }
            }
          }
        } catch (err) {
          logger.error("received: %s", data);
          logger.error(err);
        }
      });
    } catch (err) {
      logger.error(err);
    }
  }
);

const updateViewers = () => {
  viewers = wssAuthenticated.clients.size + wssViewers.clients.size;
  logger.info(`[STATS] Total connected clients: ${viewers}`);
};

const heartbeat = async () => {
  const broadcastMsg: ChatDataMessage = {
    type: "PING",
    message: "",
    username: "",
    id: "",
    timestamp: Date.now(),
  };
  broadcastMessage(Buffer.from(JSON.stringify(broadcastMsg)));
};

export const initWebsockets = () => {
  const rnd = Math.floor(Math.random() * 1000000);
  idPrefix = `${rnd}-`;

  server.listen(Number.parseInt(process.env.PORT_WS_AUTH));

  // Stats Timers
  setInterval(() => {
    updateViewers();
  }, 30000);

  // Stats Timers
  setInterval(() => {
    heartbeat();
  }, 55000);
};
