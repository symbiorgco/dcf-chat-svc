import { toPublicChatProfile } from "./publicChatProfile";
import type { PublicChatProfileInput } from "./publicChatProfile";

export type TipAnnouncementMetadata = {
  type: "tip";
  amount: string;
  from: string;
  to: string;
};

export type TipAnnouncementProjection = {
  message: string;
  metadata: TipAnnouncementMetadata;
};

export type PublicPersonaProfileInput = {
  nickname: string;
  profileImageUrl?: string;
  privateMode?: boolean;
};

export type RfpWinnerInput = {
  walletId: string;
  profile?: PublicPersonaProfileInput;
};

export const buildPublicTipAnnouncement = (
  sender: PublicChatProfileInput,
  recipient: PublicChatProfileInput,
  solAmount: number,
): TipAnnouncementProjection => {
  const publicSender = toPublicChatProfile(sender);
  const publicRecipient = toPublicChatProfile(recipient);
  const amount = solAmount.toFixed(3);

  return {
    message: `${publicSender.nickname} tipped ${amount} SOL to ${publicRecipient.nickname}!`,
    metadata: {
      type: "tip",
      amount,
      from: publicSender.nickname,
      to: publicRecipient.nickname,
    },
  };
};

export const getPublicRfpWinnerNames = (
  winners: RfpWinnerInput[],
): string[] =>
  winners.map(({ walletId, profile }) => {
    if (!profile) {
      return "UNKNOWN";
    }

    return toPublicChatProfile({
      ...profile,
      walletId,
    }).nickname;
  });
