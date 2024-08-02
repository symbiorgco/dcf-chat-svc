import { CHAT_COLOR, ChatDataMessage, VerifiedMessage } from "./utils/types";
import Filter from "bad-words";
import badWords from "./bad-words.json";
import { logger } from "./logger";
import fs from "fs";
import NodeCache from "node-cache";

const MAX_MESSAGES_HISTORY = 25;
import admins from "./admins.json";

export let recentChatMessages: ChatDataMessage[] = [];

const filter = new Filter({ emptyList: true });
filter.addWords(...badWords.words);

const BANNED_USER_FILE = "./banned.json";

export let bannedUsers = JSON.parse(
  fs.readFileSync(BANNED_USER_FILE, "utf-8")
) as string[];

const timedOutCache = new NodeCache({
  stdTTL: 600,
  checkperiod: 900,
});

const allowedUsers = new NodeCache({
  stdTTL: 43200,
  checkperiod: 3600,
});

const MAX_CHARS = 150;

export const isAdmin = (walletId: string) => {
  if (admins.includes(walletId)) {
    return true;
  } else {
    return false;
  }
};

export const isBanned = (wallet: string): boolean => {
  return bannedUsers.includes(wallet);
};

export const verifyMessage = (
  msg: string,
  skipFiltering = false
): VerifiedMessage => {
  try {
    //Rule 1 Char count
    const msgWordCounted = msg.substring(0, MAX_CHARS);

    //Rule 2 big word count
    if (!skipFiltering) {
      let words = msgWordCounted.split(" ");
      for (const word of words) {
        if (word.length > 42) {
          const erroredMessage: VerifiedMessage = {
            msg: "",
            error: true,
            errorMessage: "Please dont spam or send public keys",
          };
          return erroredMessage;
        }
      }
    }

    //Rule 2 regex
    const msgRegex = msgWordCounted.replace(/[^\x20-\x7E\ud000-\udfff]/gi, "?");

    //Rule 3 filter bad words
    let filteredMessage;

    try {
      if (skipFiltering) {
        filteredMessage = msgRegex;
      } else {
        filteredMessage = filter.clean(msgRegex);
      }
    } catch (err) {
      filteredMessage = msgRegex;
    }

    const verifiedMessage: VerifiedMessage = {
      msg: filteredMessage,
      error: false,
      errorMessage: "None",
    };
    return verifiedMessage;
  } catch (err) {
    const erroredMessage: VerifiedMessage = {
      msg: "",
      error: true,
      errorMessage: "Error",
    };
    return erroredMessage;
  }
};

export const addChatMessage = (msg: ChatDataMessage) => {
  if (recentChatMessages.length >= MAX_MESSAGES_HISTORY) {
    recentChatMessages.shift();
  }
  recentChatMessages.push(msg);
  logger.info(`${msg.wallet} - ${msg.username}: ${msg.message}`);
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

export const banUser = (wallet: string): boolean => {
  if (!bannedUsers.includes(wallet)) {
    bannedUsers.push(wallet);
    logger.info(`BANNED ${wallet}`);
    fs.writeFileSync(BANNED_USER_FILE, JSON.stringify(bannedUsers), "utf-8");
    return true;
  }
  return false;
};

export const unbanUser = (wallet: string): boolean => {
  if (bannedUsers.includes(wallet)) {
    const index = bannedUsers.findIndex((user) => user === wallet);
    if (index >= 0) {
      bannedUsers.splice(index, 1);
      logger.info(`UNBANNED ${wallet}`);
      fs.writeFileSync(BANNED_USER_FILE, JSON.stringify(bannedUsers), "utf-8");
      return true;
    }
  }
  return false;
};

export const timeoutUser = (wallet: string): boolean => {
  if (!timedOutCache.has(wallet)) {
    timedOutCache.set(wallet, true);
    logger.info(`TIMED-OUT ${wallet}`);
    return true;
  }
  return false;
};

export const isAllowedToChat = (wallet: string) => {
  if (allowedUsers.has(wallet) || isAdmin(wallet)) {
    return true;
  } else {
    return false;
  }
};

export const isTimedOut = (wallet: string) => {
  return timedOutCache.has(wallet);
};

export const addWalletToChat = (wallet: string) => {
  if (!allowedUsers.has(wallet)) {
    logger.info(`Add wallet ${wallet} to be able to chat`);
    allowedUsers.set(wallet, true);
  }
};

export const getColorForRole = (role: string): CHAT_COLOR => {
  switch (role) {
    case "ADMIN":
      return CHAT_COLOR.ORANGE;
    case "MOD":
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
