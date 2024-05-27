export interface VerifiedMessage {
  msg: string;
  error: boolean;
  errorMessage: string;
}

export const verifyMessage = (msg: string): VerifiedMessage => {
  //// TODO Parse the message
  const verifiedMessage: VerifiedMessage = {
    msg,
    error: false,
    errorMessage: "None",
  };
  return verifiedMessage;
};
