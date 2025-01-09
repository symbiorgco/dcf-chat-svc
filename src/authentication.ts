import "dotenv/config";

import NodeCache from "node-cache";
import jwt from "jsonwebtoken";
import axios from "axios";
import { logger } from "./logger";
import { ChatProfile } from "./utils/types";
import { DateTime } from "luxon";
import {
  addWalletToChat,
  isAdmin,
  isAllowedToChat,
  isHelpfulDegen,
  isMod,
} from "./chat";
import { getLeaderboardEntry } from "./userProfiles";

const DEALER_API = process.env.DEALER_API as string;

const authenticatedCache = new NodeCache({
  stdTTL: 75,
  checkperiod: 1200,
});

export const verifyIfCanChat = async (wallet: string, authToken: string) => {
  if (isAllowedToChat(wallet)) return;

  //Quick fix, add players
  const leaderboardEntry = getLeaderboardEntry(wallet);
  if (leaderboardEntry && leaderboardEntry.volume > 0.25 * 1_000_000_000) {
    addWalletToChat(wallet);
    return;
  }

  const startTime = DateTime.utc().minus({ days: 7 }).toISO();

  try {
    const response = await axios.get(
      `${DEALER_API}/game/2/walletHistory?walletId=${wallet?.toString()}&startTime=${startTime}&limit=10`
    );

    const items: any[] = response.data.payload;

    if (items.length > 2) {
      addWalletToChat(wallet);

      return;
    }
  } catch (e) {
    logger.error(
      `Error fetching crash wallet history of player ${wallet?.toString()}`
    );
  }

  try {
    const response = await axios.get(
      `https://api.dozer.degencoinflip.com/v1/playercheck/get`,
      {
        headers: {
          Authorization: authToken,
          "Content-Type": "application/json",
        },
      }
    );

    const item = response.data.payload;

    if (item.isPlayer) {
      addWalletToChat(wallet);

      return;
    }
  } catch (e) {
    logger.error(
      `Error fetching dozer wallet history of player ${wallet?.toString()}`
    );
    logger.error(e);
  }
};

export const verifyJwt = async (
  authToken: string
): Promise<ChatProfile | undefined> => {
  try {
    const decoded = jwt.decode(authToken.replace("Bearer ", ""));
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

            if (isAdmin(newChatProfile.walletId)) {
              newChatProfile.role = "ADMIN";
            } else if (isMod(newChatProfile.walletId)) {
              newChatProfile.role = "MOD";
            } else if (isHelpfulDegen(newChatProfile.walletId)) {
              newChatProfile.role = "HELPFUL_DEGEN";
            } else {
              const leaderboardEntry = getLeaderboardEntry(
                newChatProfile.walletId
              );

              if (leaderboardEntry) {
                if (leaderboardEntry.volume > 10000 * 1_000_000_000) {
                  newChatProfile.role = "TIER6";
                } else if (leaderboardEntry.volume > 5000 * 1_000_000_000) {
                  newChatProfile.role = "TIER5";
                } else if (leaderboardEntry.volume > 2500 * 1_000_000_000) {
                  newChatProfile.role = "TIER4";
                } else if (leaderboardEntry.volume > 1000 * 1_000_000_000) {
                  newChatProfile.role = "TIER3";
                } else if (leaderboardEntry.volume > 500 * 1_000_000_000) {
                  newChatProfile.role = "TIER2";
                } else if (leaderboardEntry.volume > 100 * 1_000_000_000) {
                  newChatProfile.role = "TIER1";
                } else {
                  newChatProfile.role = "MEMBER";
                }
              } else {
                newChatProfile.role = "MEMBER";
              }
            }

            authenticatedCache.set(authToken, newChatProfile);
            verifyIfCanChat(newChatProfile.walletId, authToken);

            newChatProfile.authToken = authToken;
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
