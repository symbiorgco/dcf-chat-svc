import "dotenv/config";

import NodeCache from "node-cache";
import jwt from "jsonwebtoken";
import axios from "axios";
import { logger } from "./logger";
import { ChatProfile } from "./utils/types";

const DEALER_API = process.env.DEALER_API as string;

const authenticatedCache = new NodeCache({
  stdTTL: 40000,
  checkperiod: 3600,
}); //Remember aprox 12 hours

export const verifyJwt = async (
  authToken: string
): Promise<ChatProfile | undefined> => {
  try {
    const decoded = jwt.decode(authToken);
    const walletId = decoded["cognito:username"] as string;

    const fromCache = authenticatedCache.get(authToken) as ChatProfile;
    if (fromCache) {
      return fromCache;
    } else {
      return await axios
        .get(`${DEALER_API}/player-check`, {
          headers: {
            Authorization: authToken,
            "Content-Type": "application/json",
          },
        })
        .then((response) => {
          if (response.data.payload.isSuccessful === true) {
            const newChatProfile = response.data.payload.profile as ChatProfile;
            logger.info(
              `[JWT] New user authenticated ${newChatProfile.walletId} Nickname: ${newChatProfile.nickname}`
            );
            authenticatedCache.set(authToken, newChatProfile);
            return newChatProfile;
          } else {
            logger.info(`[JWT] user connection failure ${walletId}`);
            return undefined;
          }
        })
        .catch((err) => {
          logger.info(`[JWT] user connection failure ${walletId}`);
          logger.error(err);
          return undefined;
        });
    }
  } catch (err) {
    logger.error("[JWT] unknown error");
    return undefined;
  }
};
