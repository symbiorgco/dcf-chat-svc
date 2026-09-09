import { verifyJwt } from "../authentication";
import { isAdmin } from "../chat";
import { ChatProfile } from "../utils/types";

type HeaderValue = string | string[] | undefined;

type AnnouncementAuthInput = {
  authKey?: HeaderValue;
  internalKey?: HeaderValue;
  internalSecret?: string;
  verifyJwtFn?: (authToken?: string) => Promise<ChatProfile | undefined>;
  isAdminWallet?: (walletId: string) => boolean;
};

const firstHeaderValue = (value: HeaderValue): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

export const isSendAnnouncementAuthorized = async ({
  authKey,
  internalKey,
  internalSecret = process.env.INTERNAL_KEY,
  verifyJwtFn = verifyJwt,
  isAdminWallet = isAdmin,
}: AnnouncementAuthInput): Promise<boolean> => {
  const authHeader = firstHeaderValue(authKey);

  if (!authHeader || authHeader.length === 0) {
    const internalHeader = firstHeaderValue(internalKey);
    return Boolean(internalSecret && internalHeader === internalSecret);
  }

  const chatProfile = await verifyJwtFn(authHeader);
  return Boolean(chatProfile && isAdminWallet(chatProfile.walletId));
};
