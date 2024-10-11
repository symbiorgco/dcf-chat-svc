export interface ChatDataRequestMessage {
  type: string;
  message: string;
}

export enum CHAT_COLOR {
  WHITE = 0,
  ORANGE = 1,
  LIGHT_GREEN = 2,
  DARK_GREEN = 3,
  LIGHT_BLUE = 4,
  DARK_BLUE = 5,
  PURPLE = 6,
  PINK = 7,
}

export interface ChatDataMessage {
  type: string;
  message: string;
  username: string;
  timestamp: number;
  wallet?: string;
  color?: number;
  id: string;
  role: string;
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
