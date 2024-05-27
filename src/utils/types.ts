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
