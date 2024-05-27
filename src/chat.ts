import { ChatDataMessage } from "./utils/types";

export interface VerifiedMessage {
  msg: string;
  error: boolean;
  errorMessage: string;
}

export const allChatMessages: ChatDataMessage[] = [];

export const verifyMessage = (msg: string): VerifiedMessage => {
  //// TODO Parse the message
  const verifiedMessage: VerifiedMessage = {
    msg,
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
