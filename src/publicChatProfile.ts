export const ANONYMOUS_DEGEN_NAME = "Anonymous Degen";
export const ANONYMOUS_WALLET_ID = "ANONYMOUS";

export type PublicChatProfileInput = {
  nickname: string;
  profileImageUrl?: string;
  walletId: string;
  privateMode?: boolean;
};

export type PublicChatProfile = {
  nickname: string;
  profileImageUrl?: string;
  walletId: string;
};

export const toPublicChatProfile = (
  chatProfile: PublicChatProfileInput,
): PublicChatProfile => {
  if (chatProfile.privateMode === true) {
    return {
      nickname: ANONYMOUS_DEGEN_NAME,
      walletId: ANONYMOUS_WALLET_ID,
    };
  }

  return {
    nickname: chatProfile.nickname,
    profileImageUrl: chatProfile.profileImageUrl,
    walletId: chatProfile.walletId,
  };
};
