import { CHAT_COLOR, ChatDataMessage, VerifiedMessage } from "./utils/types";
import Filter from "bad-words";
import badWords from "./bad-words.json";
import { logger } from "./logger";
import fs from "fs";
import NodeCache from "node-cache";

const MAX_MESSAGES_HISTORY = 75;
import admins from "./admins.json";
import mods from "./mods.json";
import helpfulDegens from "./helpful_degens.json";
import { recentChatMessagesForAI } from "./plugins/ai";

export let recentChatMessages = new Map<number, ChatDataMessage[]>();
const chatMessageAuthorWallets = new Map<string, string>();

export enum CHAT_CHANNEL {
  CRASH = 0,
  DOZER = 1,
  TOWERS = 2,
  COINFLIP = 3,
  GENERAL = 4,
  ANNOUNCEMENTS = 999,
}

recentChatMessages.set(CHAT_CHANNEL.CRASH, []); // Crash
recentChatMessages.set(CHAT_CHANNEL.DOZER, []); // Dozer
recentChatMessages.set(CHAT_CHANNEL.TOWERS, []); // Towers
recentChatMessages.set(CHAT_CHANNEL.COINFLIP, []); // Coinflip
recentChatMessages.set(CHAT_CHANNEL.GENERAL, []); // General
recentChatMessages.set(CHAT_CHANNEL.ANNOUNCEMENTS, []); // Announcements

const filter = new Filter({ emptyList: true });
filter.addWords(...badWords.words);

const BANNED_USER_FILE = "./banned.json";

export let bannedUsers = JSON.parse(
  fs.readFileSync(BANNED_USER_FILE, "utf-8"),
) as string[];

const timedOutCache = new NodeCache({
  stdTTL: 1800,
  checkperiod: 900,
});

const allowedUsers = new NodeCache({
  stdTTL: 300800,
  checkperiod: 3600,
});

const MAX_CHARS = 150;

const getChatMessageKey = (id: string, channel: number) => `${channel}:${id}`;

export const isAdmin = (walletId: string) => {
  if (admins.includes(walletId)) {
    return true;
  } else {
    return false;
  }
};

export const isMod = (walletId: string) => {
  if (mods.includes(walletId)) {
    return true;
  } else {
    return false;
  }
};

export const isHelpfulDegen = (walletId: string) => {
  if (helpfulDegens.includes(walletId)) {
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
  skipFiltering = false,
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
    const msgRegex = msgWordCounted.replace(
      /[^\x20-\x7E\u2019\ud000-\udfff]/gi,
      "?",
    );

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

export const addChatMessage = (
  msg: ChatDataMessage,
  channel: number = 0,
  authorWallet?: string,
) => {
  const recentMsg = recentChatMessages.get(channel);
  if (!recentMsg) {
    logger.warn(
      `Channel doesnt exist: ${authorWallet ?? msg.wallet} - CH${channel} - ${
        msg.username
      }: ${msg.message}`,
    );
    return;
  }

  if (recentMsg.length >= MAX_MESSAGES_HISTORY) {
    const removedMsg = recentMsg.shift();
    if (removedMsg) {
      chatMessageAuthorWallets.delete(
        getChatMessageKey(removedMsg.id, channel),
      );
    }
  }
  recentMsg.push(msg);
  if (authorWallet) {
    chatMessageAuthorWallets.set(
      getChatMessageKey(msg.id, channel),
      authorWallet,
    );
  }
  recentChatMessagesForAI.push(msg);
  logger.info(
    `CHAT: ${authorWallet ?? msg.wallet} - CH${channel} - ${msg.username}: ${
      msg.message
    }`,
  );
};

export const getChatMessageAuthorWallet = (
  id: string,
  channel: number = 0,
): string | undefined =>
  chatMessageAuthorWallets.get(getChatMessageKey(id, channel));

export const removeChatMessage = (id: string, channel: number = 0): boolean => {
  const recentMsg = recentChatMessages.get(channel);
  if (!recentMsg) {
    logger.warn(`Channel doesnt exist: CH${channel}`);
    return;
  }
  const indexToRemove = recentMsg.findIndex((msg) => msg.id === id);
  if (indexToRemove != -1) {
    console.log(`Remove msg ${id}`);
    recentMsg.splice(indexToRemove, 1);
    chatMessageAuthorWallets.delete(getChatMessageKey(id, channel));
    return true;
  } else {
    console.log(`Didnt remove msg ${id}`);
    return false;
  }
};

export const banUser = (wallet: string, adminWallet: string): boolean => {
  if (!bannedUsers.includes(wallet)) {
    bannedUsers.push(wallet);
    logger.info(`BANNED ${wallet} by ${adminWallet}`);
    fs.writeFileSync(BANNED_USER_FILE, JSON.stringify(bannedUsers), "utf-8");
    return true;
  }
  return false;
};

export const unbanUser = (wallet: string, adminWallet: string): boolean => {
  if (bannedUsers.includes(wallet)) {
    const index = bannedUsers.findIndex((user) => user === wallet);
    if (index >= 0) {
      bannedUsers.splice(index, 1);
      logger.info(`UNBANNED ${wallet} by ${adminWallet}`);
      fs.writeFileSync(BANNED_USER_FILE, JSON.stringify(bannedUsers), "utf-8");
      return true;
    }
  }
  return false;
};

export const timeoutUser = (wallet: string): boolean => {
  if (!timedOutCache.has(wallet)) {
    timedOutCache.set(wallet, true);
    logger.info(`TIMED-OUT ${wallet} for 30 minutes`);
    return true;
  }
  return false;
};

export const isAllowedToChat = (wallet: string) => {
  if (
    allowedUsers.has(wallet) ||
    isAdmin(wallet) ||
    isMod(wallet) ||
    isHelpfulDegen(wallet)
  ) {
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
    case "HELPFUL_DEGEN":
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
