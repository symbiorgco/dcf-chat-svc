import { ChatDataMessage } from "./utils/types";
import Filter from "bad-words";
import badWords from "./bad-words.json";

export interface VerifiedMessage {
  msg: string;
  error: boolean;
  errorMessage: string;
}

export const allChatMessages: ChatDataMessage[] = [];

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
  if (allChatMessages.length > 20) {
    allChatMessages.shift();
  }
  allChatMessages.push(msg);
};
