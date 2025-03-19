import axios from "axios";

let LEADERBOARD: Map<string, number> = new Map();

export const fetchTotalVolume = async (wallet: string) => {
  const response = await axios.get(
    `https://api.stats.degencoinflip.com/v1/users/${wallet}/stats?timeFrame=1y`
  );
  const totalBetAmount = response.data.payload?.summary?.totalBetAmount;

  LEADERBOARD.set(wallet, totalBetAmount);
}

export const getLeaderboardEntry = (
  walletId: string
): number | undefined => {
  const found = LEADERBOARD.get(walletId);
  if (found) {
    return found;
  } else {
    return 0
  };
};
