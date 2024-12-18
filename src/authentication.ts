import "dotenv/config";

import NodeCache from "node-cache";
import jwt from "jsonwebtoken";
import axios from "axios";
import { logger } from "./logger";
import { ChatProfile } from "./utils/types";
import admins from "./admins.json";
import mods from "./mods.json";
import { DateTime } from "luxon";
import { addWalletToChat, isAllowedToChat } from "./chat";
import { getLeaderboardEntry } from "./userProfiles";

const DEALER_API = process.env.DEALER_API as string;

const authenticatedCache = new NodeCache({
  stdTTL: 75,
  checkperiod: 1200,
});

const verifyIfCanChat = async (wallet: string, authToken: string) => {
  if (isAllowedToChat(wallet)) return;

  //Quick fix, add players
  const leaderboardEntry = getLeaderboardEntry(wallet);
  if (leaderboardEntry && leaderboardEntry.volume > 0.25 * 1_000_000_000) {
    addWalletToChat(wallet);
    return;
  }

  const startTime = DateTime.utc().minus({ days: 7 }).toISO();
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

    if (items.length > 2) {
      addWalletToChat(wallet);

      return;
    }
  } catch (e) {
    logger.error(
      `Error fetching wallet history of player ${wallet?.toString()}`
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

    debugPayload = JSON.stringify(response.data.payload);

    const item = response.data.payload;

    logger.info(debugPayload);
    if (item.isPlayer) {
      addWalletToChat(wallet);

      return;
    }
  } catch (e) {
    logger.error(
      `Error fetching wallet history of player ${wallet?.toString()}`
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

            if (admins.includes(newChatProfile.walletId)) {
              newChatProfile.role = "ADMIN";
            } else if (mods.includes(newChatProfile.walletId)) {
              newChatProfile.role = "MOD";
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
