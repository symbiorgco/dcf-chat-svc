import axios from "axios";

let LEADERBOARD: Map<string, LeaderboardEntry> = new Map();

interface LeaderboardEntry {
  walletId: string;
  totalBetAmount: number;
  timestamp: number;
}

export const fetchTotalVolume = async (wallet: string) => {
  const response = await axios.get(
    `https://api.stats.degencoinflip.com/v1/users/${wallet}/stats?timeFrame=1y`
  );
  const totalBetAmount = response.data.payload?.summary?.totalBetAmount;

  const leaderboardEntry: LeaderboardEntry = {
    walletId: wallet,
    totalBetAmount: totalBetAmount,
    timestamp: Date.now(),
  };

  LEADERBOARD.set(wallet, leaderboardEntry);
};

export const getLeaderboardEntry = (
  walletId: string
): LeaderboardEntry | undefined => {
  const found = LEADERBOARD.get(walletId);
  if (found) {
    return found;
  } else {
    return undefined;
  }
};
