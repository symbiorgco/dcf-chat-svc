import { ChatDataMessage } from "./utils/types";
import Filter from "bad-words";
import badWords from "./bad-words.json";
/*import fs from "fs";
const HISTORY_FILE = "/usr/app/chat-history.json";

const allChatMessages = JSON.parse(
  fs.readFileSync(HISTORY_FILE, "utf-8")
) as ChatDataMessage[];

const stream = fs.createWriteStream(HISTORY_FILE, { flags: "a" });

export let recentChatMessages: ChatDataMessage[] = allChatMessages.slice(
  -MAX_MESSAGES_HISTORY
);*/

const MAX_MESSAGES_HISTORY = 25;

export let recentChatMessages: ChatDataMessage[] = [];

export interface VerifiedMessage {
  msg: string;
  error: boolean;
  errorMessage: string;
}

const filter = new Filter();
filter.addWords(...badWords.words);

const MAX_CHARS = 150;

export const verifyMessage = (msg: string): VerifiedMessage => {
  //// TODO Parse the message
  //Rule 1 Char count
  const msgWordCounted = msg.substring(0, MAX_CHARS);

  //Rule 2 regex
  //const msgRegex = msg.replace(/[^\wèéòàùì\s]/gi, '');
  const msgRegex = msgWordCounted.replace(/[^\x20-\x7E]/g, "?");

  //Rule 3 filter bad words
  const filteredMessage = filter.clean(msgRegex);

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

  //Write to file
  //stream.write(JSON.stringify(msg), "utf-8");
};
