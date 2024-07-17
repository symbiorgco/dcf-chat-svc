export interface ChatDataRequestMessage {
  type: string;
  message: string;
}

export enum CHAT_COLOR {
  WHITE = 0,
  ORANGE = 1,
}

export interface ChatDataMessage {
  type: string;
  message: string;
  username: string;
  timestamp: number;
  wallet?: string;
  color?: number;
  id: string;
}

export interface ChatProfile {
  walletId: string;
  profileImageUrl: string;
  nickname: string;
  role: string;
}

export interface VerifiedMessage {
  msg: string;
  error: boolean;
  errorMessage: string;
}
