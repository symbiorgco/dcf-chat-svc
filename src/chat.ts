import { CHAT_COLOR, ChatDataMessage, VerifiedMessage } from "./utils/types";
import Filter from "bad-words";
import badWords from "./bad-words.json";
import { logger } from "./logger";
import fs from "fs";
import NodeCache from "node-cache";

const MAX_MESSAGES_HISTORY = 25;

export let recentChatMessages: ChatDataMessage[] = [];

const filter = new Filter();
filter.addWords(...badWords.words);

const BANNED_USER_FILE = "./banned.json";

export let bannedUsers = JSON.parse(
  fs.readFileSync(BANNED_USER_FILE, "utf-8")
) as string[];

const timedOutCache = new NodeCache({
  stdTTL: 600,
  checkperiod: 900,
});

const allowedUsers: string[] = [];

const MAX_CHARS = 150;

export const isBanned = (wallet: string): boolean => {
  return bannedUsers.includes(wallet);
};

export const verifyMessage = (msg: string): VerifiedMessage => {
  //Rule 1 Char count
  const msgWordCounted = msg.substring(0, MAX_CHARS);

  //Rule 2 regex
  const msgRegex = msgWordCounted.replace(/[^\x20-\x7E\ud000-\udfff]/gi, "?");

  //Rule 3 filter bad words
  let filteredMessage;
  try {
    filteredMessage = filter.clean(msgRegex);
  } catch (err) {
    filteredMessage = msgRegex;
  }

  const verifiedMessage: VerifiedMessage = {
    msg: filteredMessage,
    error: false,
    errorMessage: "None",
  };
  return verifiedMessage;
};

export const addChatMessage = (msg: ChatDataMessage) => {
  if (recentChatMessages.length >= MAX_MESSAGES_HISTORY) {
    recentChatMessages.shift();
  }
  recentChatMessages.push(msg);
};

export const removeChatMessage = (id: string): boolean => {
  const indexToRemove = recentChatMessages.findIndex((msg) => msg.id === id);
  if (indexToRemove != -1) {
    console.log(`Remove msg ${id}`);
    recentChatMessages.splice(indexToRemove, 1);
    return true;
  } else {
    console.log(`Didnt remove msg ${id}`);
    return false;
  }
};

export const banUser = (wallet: string) => {
  if (!bannedUsers.includes(wallet)) {
    bannedUsers.push(wallet);
    logger.info(`BANNED ${wallet}`);
    fs.writeFileSync(BANNED_USER_FILE, JSON.stringify(bannedUsers), "utf-8");
  }
};

export const timeoutUser = (wallet: string) => {
  if (!timedOutCache.has(wallet)) {
    timedOutCache.set(wallet, true);
    logger.info(`TIMED-OUT ${wallet}`);
  }
};

export const isAllowedToChat = (wallet: string) => {
  return allowedUsers.includes(wallet);
};

export const isTimedOut = (wallet: string) => {
  return timedOutCache.has(wallet);
};

export const addWalletToChat = (wallet: string) => {
  if (!allowedUsers.includes(wallet)) {
    logger.info(`Add wallet ${wallet} to be able to chat`);
    allowedUsers.push(wallet);
  }
};

export const getColorForRole = (role: string): CHAT_COLOR => {
  switch (role) {
    case "ADMIN":
      return CHAT_COLOR.ORANGE;
    case "MEMBER":
      return CHAT_COLOR.WHITE;
    case "TIER1":
      return CHAT_COLOR.LIGHT_GREEN;
    case "TIER2":
      return CHAT_COLOR.DARK_GREEN;
    case "TIER3":
      return CHAT_COLOR.LIGHT_BLUE;
    case "TIER4":
      return CHAT_COLOR.DARK_BLUE;
    case "TIER5":
      return CHAT_COLOR.PURPLE;
    case "TIER6":
      return CHAT_COLOR.PINK;
    default:
      return CHAT_COLOR.WHITE;
  }
};
