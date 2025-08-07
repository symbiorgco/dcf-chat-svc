import "dotenv/config";

import { WebSocketServer, WebSocket } from "ws";
import { askAI } from "./plugins/ai";
import {
  CHAT_COLOR,
  ChatDataMessage,
  ChatDataRequestMessage,
  ChatProfile,
} from "./utils/types";
import { logger } from "./logger";
import http from "http";
import { getRole, verifyIfCanChat, verifyJwt } from "./authentication";
import {
  addChatMessage,
  banUser,
  getColorForRole,
  isAdmin,
  isAllowedToChat,
  isBanned,
  isHelpfulDegen,
  isMod,
  isTimedOut,
  removeChatMessage,
  timeoutUser,
  unbanUser,
  verifyMessage,
} from "./chat";
import NodeCache from "node-cache";
import { logBan, logTimeout, logUnban } from "./utils/modLogging";
import { getLeaderboardEntry } from "./userProfiles";

const server = http.createServer();
export const wssAuthenticated = new WebSocketServer({
  noServer: true,
  maxPayload: 512,
});

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
  maxPayload: 512,
});

export let viewers = 0;
const playerList = new Map<number, ChatProfile>();
export let playerProfiles = [];

export const broadcastMessage = (msg: Buffer) => {
  wssAuthenticated.clients.forEach(async (client) => {
    try {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg, { binary: false });
      }
    } catch (err) {}
  });
  // Send to viewers
  wssViewers.clients.forEach(async (client) => {
    try {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg, { binary: false });
      }
    } catch (err) {}
  });
};

const intervalCache = new NodeCache({
  stdTTL: 1, // 1 message per second
  checkperiod: 10,
});

let idPrefix = "prefix";
let currentId = 0;

export const sendAnnouncement = (
  msg: string,
  wallet: string,
  sendToAll: boolean
) => {
  currentId++;
  const channel = 999;
  const announcement: ChatDataMessage = {
    type: "ANNOUNCEMENT",
    message: msg,
    username: "Baby Coin",
    wallet,
    color: CHAT_COLOR.ORANGE,
    timestamp: Date.now(),
    id: `${idPrefix}${currentId}`,
    role: "",
    channel: channel,
    icon: "https://app.degencoinflip.com/logo192.png",
  };

  const msgBuffer = Buffer.from(JSON.stringify(announcement));

  logger.info(
    `Announcement ${msg} - ${wallet} - ${
      sendToAll ? "To all" : "To Wallet only"
    }`
  );

  if (sendToAll) {
    addChatMessage(announcement, channel);
    broadcastMessage(msgBuffer);
  } else {
    wssAuthenticated.clients.forEach(async (client) => {
      try {
        client.emit("announcement", msgBuffer, wallet);
      } catch (err) {}
    });
  }
};

const sendSystemMessage = (msg: string, ws: any, systemUsername?: string) => {
  currentId++;
  const errorMsg: ChatDataMessage = {
    type: "ANNOUNCEMENT",
    message: msg || " ",
    username: systemUsername || "SYSTEM",
    wallet: "SYSTEM",
    color: CHAT_COLOR.ORANGE,
    timestamp: Date.now(),
    id: `${idPrefix}${currentId}B`,
    role: "SYSTEM",
    channel: 999,
    icon: "https://app.degencoinflip.com/logo192.png",
  };
  try {
    ws.send(Buffer.from(JSON.stringify(errorMsg)), {
      binary: false,
    });
  } catch (err) {
    logger.error("Error sending system message: ", err);
  }
};

const handleCommand = async (command: string, ws: WebSocket) => {
  try {
    const subCommand = command.substring(1);
    sendSystemMessage(`Command: ${subCommand}`, ws, "Baby Coin");
    const response = await askAI(subCommand);
    if (response && response.text) {
      const reply = response.text;
      console.log("AI Response: ", reply);
      sendSystemMessage(reply, ws, "Baby Coin");
    } else {
      sendSystemMessage("Unable to handle command", ws, "Baby Coin");
    }
  } catch (err) {
    logger.error("Error handling command: ", err);
    sendSystemMessage("Error handling command", ws, "Baby Coin");
  }
};

let uniqueId = 0;

wssAuthenticated.on(
  "connection",
  function connection(ws, request, chatProfile: ChatProfile) {
    uniqueId++;
    const playerId = uniqueId;
    try {
      logger.info(
        `[WS] Player connected ${chatProfile.walletId} ${chatProfile.nickname} ${playerId}`
      );
      playerList.set(playerId, chatProfile);
      const chatProfileMSG: ChatDataMessage = {
        type: "PROFILE",
        message: chatProfile.role,
        username: chatProfile.nickname,
        timestamp: Date.now(),
        id: "",
        role: chatProfile.role,
      };
      ws.send(Buffer.from(JSON.stringify(chatProfileMSG)), { binary: false });
      ws.on("announcement", function announcement(announcement, wallet) {
        try {
          if (wallet === chatProfile.walletId) {
            ws.send(announcement, {
              binary: false,
            });
          }
        } catch (err) {}
      });
      ws.on("close", function close() {
        logger.info(
          `[WS] Player disconnected ${chatProfile.walletId} ${chatProfile.nickname} ${playerId}`
        );
        playerList.delete(playerId);
      });
      ws.on("error", function error(err) {
        logger.error(
          `[WS] Player error ${chatProfile.walletId} ${chatProfile.nickname} ${playerId}`
        );
        playerList.delete(playerId);
      });
      ws.on("message", function message(data) {
        try {
          const msg = JSON.parse(data.toString()) as ChatDataRequestMessage;
          if (msg.type === "MSG" && !intervalCache.get(chatProfile.walletId)) {
            intervalCache.set(chatProfile.walletId, true);

            // Check if allowed to chat
            if (isAllowedToChat(chatProfile.walletId)) {
              if (!isBanned(chatProfile.walletId)) {
                if (msg.message.length > 0) {
                  if (isTimedOut(chatProfile.walletId)) {
                    sendSystemMessage("You are timed out for 30 minutes.", ws);
                  } else {
                    if (chatProfile.role === "MEMBER") {
                      //Check if needed to update role
                      //TODO should not be needed
                      chatProfile.role = getRole(chatProfile.walletId);
                    }

                    const verifiedMessage = verifyMessage(
                      msg.message,
                      isAdmin(chatProfile.walletId) ||
                        isMod(chatProfile.walletId)
                    );

                    if (verifiedMessage.error) {
                      sendSystemMessage(
                        `Error sending your message: ${verifiedMessage.errorMessage}`,
                        ws
                      );
                    } else {
                      if (
                        isAdmin(chatProfile.walletId) &&
                        verifiedMessage.msg.startsWith("/")
                      ) {
                        // Only admins can use commands
                        // Handle command async
                        handleCommand(verifiedMessage.msg, ws);
                      } else {
                        // Handle normal message
                        currentId++;

                        let color: CHAT_COLOR = getColorForRole("MEMBER");
                        if (chatProfile.role === "HELPFUL_DEGEN") {
                          const leaderboardEntry = getLeaderboardEntry(
                            chatProfile.walletId
                          );

                          if (leaderboardEntry) {
                            if (leaderboardEntry.totalBetAmount > 10000) {
                              color = getColorForRole("TIER6");
                            } else if (leaderboardEntry.totalBetAmount > 5000) {
                              color = getColorForRole("TIER5");
                            } else if (leaderboardEntry.totalBetAmount > 2500) {
                              color = getColorForRole("TIER4");
                            } else if (leaderboardEntry.totalBetAmount > 1000) {
                              color = getColorForRole("TIER3");
                            } else if (leaderboardEntry.totalBetAmount > 500) {
                              color = getColorForRole("TIER2");
                            } else if (leaderboardEntry.totalBetAmount > 100) {
                              color = getColorForRole("TIER1");
                            }
                          }
                        } else {
                          color = getColorForRole(chatProfile.role);
                        }

                        const broadcastMsg: ChatDataMessage = {
                          type: "MSG",
                          message: verifiedMessage.msg,
                          username: chatProfile.nickname,
                          wallet: chatProfile.walletId, // TODO hide for normal users?
                          timestamp: Date.now(),
                          color: color,
                          role: chatProfile.role,
                          id: `${idPrefix}${currentId}`,
                          channel: msg.channel,
                          icon: chatProfile.profileImageUrl,
                        };
                        addChatMessage(broadcastMsg, msg.channel);
                        broadcastMessage(
                          Buffer.from(JSON.stringify(broadcastMsg))
                        );
                      }
                    }
                  }
                } else {
                  logger.info("Received length 0");
                }
              } else {
                sendSystemMessage("You are banned.", ws);
              }
            } else {
              sendSystemMessage(
                "Spam protection. You need to play at least 0.05 SOL last 7 days to chat. Refresh or try again",
                ws
              );

              verifyIfCanChat(chatProfile.walletId, chatProfile.authToken);
            }
          } else if (msg.type === "BAN") {
            if (
              isAdmin(chatProfile.walletId) ||
              isMod(chatProfile.walletId) ||
              isHelpfulDegen(chatProfile.walletId)
            ) {
              const banned = banUser(msg.message, chatProfile.walletId);
              if (banned) {
                logBan(chatProfile.nickname, msg.message);
              }
              sendSystemMessage(
                `Banned wallet ${msg.message}: ${banned ? "TRUE" : "FALSE"}`,
                ws
              );
            }
          } else if (msg.type === "REMOVE") {
            if (
              isAdmin(chatProfile.walletId) ||
              isMod(chatProfile.walletId) ||
              isHelpfulDegen(chatProfile.walletId)
            ) {
              const idToRemove = msg.message;
              const channel = msg.channel;
              const broadcastMsg: ChatDataMessage = {
                type: "REMOVE",
                message: "",
                username: "",
                timestamp: Date.now(),
                id: idToRemove,
                role: "SYSTEM",
                channel,
              };
              if (removeChatMessage(idToRemove, channel)) {
                broadcastMessage(Buffer.from(JSON.stringify(broadcastMsg)));
              }
            }
          } else if (msg.type === "TIMEOUT") {
            if (
              isAdmin(chatProfile.walletId) ||
              isMod(chatProfile.walletId) ||
              isHelpfulDegen(chatProfile.walletId)
            ) {
              const timedOut = timeoutUser(msg.message);
              if (timedOut) {
                logTimeout(chatProfile.nickname, msg.message);
              }
              sendSystemMessage(
                `Timed out wallet ${msg.message}: ${
                  timedOut ? "TRUE" : "FALSE"
                }`,
                ws
              );
            }
          } else if (msg.type === "UNBAN") {
            if (
              isAdmin(chatProfile.walletId) ||
              isMod(chatProfile.walletId) ||
              isHelpfulDegen(chatProfile.walletId)
            ) {
              const unbanned = unbanUser(msg.message, chatProfile.walletId);
              if (unbanned) {
                logUnban(chatProfile.nickname, msg.message);
              }
              sendSystemMessage(
                `Unbanned wallet ${msg.message}: ${
                  unbanned ? "TRUE" : "FALSE"
                }`,
                ws
              );
            }
          }
        } catch (err) {
          logger.error("received: %s", data);
          logger.error(err);
        }
      });
    } catch (err) {
      playerList.delete(playerId);
      logger.error(err);
    }
  }
);

const updateViewers = () => {
  viewers = wssAuthenticated.clients.size + wssViewers.clients.size + 8; // +8 for bots
  try {
    const players = Array.from(playerList.values());
    const filteredArr = players.reduce((acc, current) => {
      const x = acc.find((item) => item.walletId === current.walletId);
      if (!x) {
        return acc.concat([current]);
      } else {
        return acc;
      }
    }, []);
    playerProfiles = filteredArr.map((profile) => {
      return {
        nickname: profile.nickname,
        role: profile.role,
        profileImageUrl: profile.profileImageUrl,
      };
    });

    logger.info(
      `[STATS] Total connected clients: ${viewers} - Players: ${filteredArr.length}`
    );
  } catch (err) {
    logger.error("Error updating viewers: ", err);
  }
};

const heartbeat = async () => {
  const broadcastMsg: ChatDataMessage = {
    type: "PING",
    message: "",
    username: "",
    id: "",
    timestamp: Date.now(),
    role: "SYSTEM",
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
