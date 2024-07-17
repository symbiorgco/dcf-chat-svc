import "dotenv/config";

import NodeCache from "node-cache";
import jwt from "jsonwebtoken";
import axios from "axios";
import { logger } from "./logger";
import { ChatProfile } from "./utils/types";
import admins from "./admins.json";
import { DateTime } from "luxon";
import { addWalletToChat, isAllowedToChat } from "./chat";

const DEALER_API = process.env.DEALER_API as string;

const authenticatedCache = new NodeCache({
  stdTTL: 90,
  checkperiod: 1200,
});

const verifyIfCanChat = async (wallet: string, authToken: string) => {
  if (isAllowedToChat(wallet)) return;

  const startTime = DateTime.utc().minus({ years: 1 }).toISO();
  let debugPayload = "";
  try {
    const response = await axios.get(
      `${
        process.env.DEALER_API
      }/game/2/walletHistory?walletId=${wallet?.toString()}&startTime=${startTime}`,
      {
        headers: { Authorization: authToken },
      }
    );

    debugPayload = JSON.stringify(response.data.payload);

    const items: [] = response.data.payload;

    if (items.length > 0) {
      addWalletToChat(wallet);
    }
  } catch (e) {
    logger.error(
      `Error fetching wallet history of player ${wallet?.toString()}`
    );
  }
};

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

            if (admins.includes(newChatProfile.walletId)) {
              newChatProfile.role = "ADMIN";
            } else {
              newChatProfile.role = "MEMBER";
            }

            authenticatedCache.set(authToken, newChatProfile);
            verifyIfCanChat(newChatProfile.walletId, authToken);

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
