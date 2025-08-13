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
import { fetchTotalVolume, getLeaderboardEntry } from "./userProfiles";

const DEALER_API = process.env.DEALER_API as string;

const authenticatedCache = new NodeCache({
  stdTTL: 75,
  checkperiod: 5,
});

export const verifyIfCanChat = async (wallet: string) => {
  if (isAllowedToChat(wallet)) return;

  try {
    const leaderboardEntry = getLeaderboardEntry(wallet);

    //always add and keep high players
    if (leaderboardEntry && leaderboardEntry.totalBetAmount >= 250) {
      addWalletToChat(wallet);
      return true;
    }

    const response = await axios.get(
      `https://api.stats.degencoinflip.com/v1/users/${wallet}/stats?timeFrame=1w`
    );
    const totalBetAmount = response.data.payload?.summary?.totalBetAmount;
    if (totalBetAmount && totalBetAmount >= 0.009) {
      addWalletToChat(wallet);
      return true;
    }
  } catch (e) {
    logger.error(`Error fetching wallet history of player ${wallet}`);
    logger.error(e);
    return false;
  }

  return false;
};

export const verifyJwt = async (
  authToken: string
): Promise<ChatProfile | undefined> => {
  try {
    const decoded = jwt.decode(authToken.replace("Bearer ", ""));
    const walletId = decoded["cognito:username"] as string;

    const fromCache = authenticatedCache.get(authToken) as ChatProfile;
    if (fromCache) {
      verifyIfCanChat(walletId);
      return fromCache;
    } else {
      const newChatProfile: ChatProfile = await axios
        .get(`${DEALER_API}/player-check`, {
          headers: {
            Authorization: authToken,
            "Content-Type": "application/json",
          },
        })
        .then(async (response) => {
          if (response.data.payload.isSuccessful === true) {
            const newChatProfile = response.data.payload.profile as ChatProfile;

            logger.info(
              `[JWT] New user authenticated ${walletId} Nickname: ${newChatProfile.nickname}`
            );

            //Ensure walletid is set
            newChatProfile.walletId = walletId;
            return newChatProfile;
          } else {
            logger.info(`[JWT] user connection failure ${walletId}`);
            return undefined;
          }
        })
        .catch(() => {
          logger.info(`[JWT] user connection failure ${walletId}`);
          //logger.error(err);
          return undefined;
        });

      if (newChatProfile) {
        newChatProfile.role = getRole(walletId);
        newChatProfile.authToken = authToken;

        //No await to avoid
        verifyIfCanChat(walletId);
        const updateAuthCachePromise = updateAuthCache(
          authToken,
          newChatProfile
        );

        //Wait 5 sec to give a bit time to fetch the profile
        const timeoutPromise = await new Promise((resolve) =>
          setTimeout(resolve, 5000)
        );

        await Promise.race([timeoutPromise, updateAuthCachePromise]);
        return authenticatedCache.get(authToken);
      }

      return undefined;
    }
  } catch (err) {
    logger.error("[JWT] unknown error");
    return undefined;
  }
};

const updateAuthCache = async (authToken: string, chatProfile: ChatProfile) => {
  try {
    const leaderboardEntry = getLeaderboardEntry(chatProfile.walletId);
    if (
      !leaderboardEntry ||
      leaderboardEntry.timestamp <
        DateTime.now().minus({ minutes: 5 }).toMillis()
    ) {
      await fetchTotalVolume(chatProfile.walletId);
      chatProfile.role = getRole(chatProfile.walletId);
    }

    authenticatedCache.set(authToken, chatProfile);
  } catch (err) {
    logger.info(
      `[Leaderboard] Update of player failed ${chatProfile.walletId}`
    );
  }
};

export const getRole = (wallet: string) => {
  if (isAdmin(wallet)) {
    return "ADMIN";
  } else if (isMod(wallet)) {
    return "MOD";
  } else if (isHelpfulDegen(wallet)) {
    return "HELPFUL_DEGEN";
  } else {
    const leaderboardEntry = getLeaderboardEntry(wallet);

    if (leaderboardEntry) {
      if (leaderboardEntry.totalBetAmount > 10000) {
        return "TIER6";
      } else if (leaderboardEntry.totalBetAmount > 5000) {
        return "TIER5";
      } else if (leaderboardEntry.totalBetAmount > 2500) {
        return "TIER4";
      } else if (leaderboardEntry.totalBetAmount > 1000) {
        return "TIER3";
      } else if (leaderboardEntry.totalBetAmount > 500) {
        return "TIER2";
      } else if (leaderboardEntry.totalBetAmount > 100) {
        return "TIER1";
      } else {
        return "MEMBER";
      }
    }
  }
  return "MEMBER";
};
