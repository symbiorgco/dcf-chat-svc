export interface ChatDataRequestMessage {
  type: string;
  message: string;
}

export interface ChatDataMessage {
  type: string;
  message: string;
  username: string;
  timestamp: number;
}

export interface ChatProfile {
  walletId: string;
  profileImageUrl: string;
  nickname: string;
}

export interface VerifiedMessage {
  msg: string;
  error: boolean;
  errorMessage: string;
}
