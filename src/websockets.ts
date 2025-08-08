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
  recentChatMessages,
  removeChatMessage,
  timeoutUser,
  unbanUser,
  verifyMessage,
} from "./chat";
import NodeCache from "node-cache";
import { logBan, logTimeout, logUnban } from "./utils/modLogging";
import { getLeaderboardEntry } from "./userProfiles";
import axios from "axios";

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
    role: "BOT",
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

const sendSystemMessage = (msg: string, ws: any, bot: boolean = false) => {
  currentId++;
  const errorMsg: ChatDataMessage = {
    type: "ANNOUNCEMENT",
    message: msg || " ",
    username: bot ? "Baby Coin" : "SYSTEM",
    wallet: bot ? "BOT" : "SYSTEM",
    color: CHAT_COLOR.ORANGE,
    timestamp: Date.now(),
    id: `${idPrefix}${currentId}B`,
    role: "PRIVATE",
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

const broadcastBotMessage = (msg: string, channel: number) => {
  try {
    currentId++;
    const broadcastMsg: ChatDataMessage = {
      type: "MSG",
      message: msg,
      username: "Baby Coin",
      wallet: "BOT", // TODO hide for normal users?
      timestamp: Date.now(),
      color: CHAT_COLOR.ORANGE,
      role: "BOT",
      id: `${idPrefix}${currentId}`,
      channel: channel,
      icon: "https://app.degencoinflip.com/logo192.png",
    };

    addChatMessage(broadcastMsg, channel);
    broadcastMessage(Buffer.from(JSON.stringify(broadcastMsg)));
  } catch (err) {
    logger.error("Error sending system message: ", err);
  }
};

export interface GameResult {
  createdAt: string;
  gameNumber: number;
  roomId: number;
  roundId: number;
  playerCount: number;
  players: Record<string, Player>;
  gameResult: number | string | null;
  hash: string;
}

export interface Player {
  lamports: string;
  reward: string;
  choice: string;
  pubkey: string;
  username: string;
}

const handleCommand = async (
  command: string,
  ws: WebSocket,
  channel: number,
  chatProfile: ChatProfile
) => {
  try {
    if (command.startsWith("q")) {
      const subCommand = command.substring(1).trim();
      //Question command
      //sendSystemMessage(`You asked Q: ${subCommand}`, ws, true);

      /////// TODO make more generic
      currentId++;
      let color: CHAT_COLOR = getColorForRole("MEMBER");
      if (chatProfile.role === "HELPFUL_DEGEN") {
        const leaderboardEntry = getLeaderboardEntry(chatProfile.walletId);

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
        message: `Baby Coin, ${subCommand}`,
        username: chatProfile.nickname,
        wallet: chatProfile.walletId, // TODO hide for normal users?
        timestamp: Date.now(),
        color: color,
        role: chatProfile.role,
        id: `${idPrefix}${currentId}`,
        channel: channel,
        icon: chatProfile.profileImageUrl,
      };

      addChatMessage(broadcastMsg, channel);
      broadcastMessage(Buffer.from(JSON.stringify(broadcastMsg)));

      /// END TODO

      const response = await askAI(
        subCommand + " and limit your reply to max 175 characters."
      );
      if (response && response.text) {
        const reply = response.text;
        console.log(`Used /q: ${subCommand} - AI Response: ${reply}`);
        broadcastBotMessage(reply, channel);
      } else {
        sendSystemMessage("Unable to handle command", ws, true);
      }
    } else if (command.startsWith("chat")) {
      const subCommand = command.substring(4).trim();

      //Chat command
      sendSystemMessage(`used /chat: ${subCommand}`, ws, true);

      const parsedChatMessages = recentChatMessages.get(0).map((msg) => ({
        id: msg.id,
        wallet: msg.wallet.slice(0, 8),
        username: msg.username,
        message: msg.message,
      }));

      const response = await askAI(
        subCommand +
          " And provide 1 wallet ID if applicable. " +
          JSON.stringify(parsedChatMessages)
      );
      if (response && response.text) {
        const reply = response.text;
        console.log(`A: used /chat: ${subCommand} - AI Response: ${reply}`);
        //broadcastBotMessage(reply, channel);
        sendSystemMessage(reply, ws, true);
      } else {
        sendSystemMessage("Unable to handle command", ws, true);
      }
    } else if (command.startsWith("game")) {
      //Game history
      const subCommand = command.substring(4).trim();

      //Game command
      sendSystemMessage(`used /game: ${subCommand}`, ws, true);

      const response = await axios.get(
        `https://api.dealer.degencoinflip.com/v1/game/2/room/1/rounds?limit=300`
      );
      const totalGames = response.data.payload as GameResult[];

      const parsedGames = totalGames.map((game) => {
        if (!game.gameResult) return;
        return {
          mutliplier: game.gameResult,
          players: Object.values(game.players).map((player) => ({
            pubkey: player.pubkey.slice(0, 8),
            result:
              (Number.parseFloat(
                (
                  BigInt(player.reward.split(".")[0]) / BigInt(1_000_000)
                ).toString()
              ) -
                Number.parseFloat(
                  (
                    BigInt(player.lamports.split(".")[0]) / BigInt(1_000_000)
                  ).toString()
                )) /
              1000,
            username: player.username,
          })),
          roundId: game.roundId,
        };
      });

      const responseAI = await askAI(
        subCommand +
          ". And provide 1 wallet ID if applicable. This is the data of last 300 rounds of the crash game: " +
          JSON.stringify(parsedGames)
      );
      if (responseAI && responseAI.text) {
        const reply = responseAI.text;
        console.log(`A: used /game: ${subCommand} - AI Response: ${reply}`);
        //broadcastBotMessage(reply, channel);
        sendSystemMessage(reply, ws, true);
      } else {
        sendSystemMessage("Unable to handle command", ws, true);
      }
    } else {
      sendSystemMessage("Unknown command", ws, true);
    }
  } catch (err) {
    console.log("Error handling command: ", err);
    logger.error("Error handling command: ", err);
    sendSystemMessage("Error handling command", ws, true);
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
                        handleCommand(
                          verifiedMessage.msg.substring(1),
                          ws,
                          msg.channel,
                          chatProfile
                        );
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
