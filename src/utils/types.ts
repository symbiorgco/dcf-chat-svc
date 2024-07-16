export interface ChatDataRequestMessage {
  type: string;
  message: string;
}

export interface ChatDataMessage {
  type: string;
  message: string;
  username: string;
  timestamp: number;
  wallet?: string;
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
