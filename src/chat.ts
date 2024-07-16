import { ChatDataMessage, VerifiedMessage } from "./utils/types";
import Filter from "bad-words";
import badWords from "./bad-words.json";

const MAX_MESSAGES_HISTORY = 25;

export let recentChatMessages: ChatDataMessage[] = [];

const filter = new Filter();
filter.addWords(...badWords.words);

const MAX_CHARS = 150;

export const verifyMessage = (msg: string): VerifiedMessage => {
  //Rule 1 Char count
  const msgWordCounted = msg.substring(0, MAX_CHARS);

  //Rule 2 regex
  const msgRegex = msgWordCounted
    .replace(/[^\x20-\x7E\ud000-\udfff]/gi, "?")
    .replace(/\x2E/gi, " ");

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
