import axios from "axios";
import { logger } from "./logger";

type LeaderboardEntry = {
  walletId: string;
  volume: number;
};

let LEADERBOARD: LeaderboardEntry[] = [];

const fetchLeaderboard = async () => {
  try {
    await axios
      .get("https://api.degencointracker.com/v1/monthly-volume-leaderboard")
      .then((result) => {
        const newLeaderboard = result.data.payload as LeaderboardEntry[];
        if (newLeaderboard.length > 0) {
          logger.info(`Found ${newLeaderboard.length} leaderboard entries`);
          LEADERBOARD = newLeaderboard;
        }
      });
  } catch (err) {
    logger.error("Cannot fetch new leaderboard");
  }
};

export const getLeaderboardEntry = (walletId: string) => {
  const found = LEADERBOARD.find((entry) => entry.walletId === walletId);
  if (found) {
    return found;
  }
};

fetchLeaderboard();

setInterval(() => {
  fetchLeaderboard();
}, 3600000); //Fetch leaderboard every hour
