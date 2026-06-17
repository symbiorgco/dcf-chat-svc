import type { ChatProfile } from "./utils/types";

const playerList = new Map<number, ChatProfile>();

export const getConnectedPlayerPrivateMode = (walletId: string): boolean | undefined => {
  for (const profile of playerList.values()) {
    if (profile.walletId === walletId) {
      return profile.privateMode;
    }
  }
  return undefined;
};

export const setConnectedPlayer = (id: number, profile: ChatProfile): void => {
  playerList.set(id, profile);
};

export const deleteConnectedPlayer = (id: number): void => {
  playerList.delete(id);
};

export const getAllConnectedPlayers = (): ChatProfile[] => Array.from(playerList.values());

export const clearConnectedPlayers = (): void => {
  playerList.clear();
};
