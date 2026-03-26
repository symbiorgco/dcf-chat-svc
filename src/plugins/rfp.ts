import axios from "axios";
import { GameResult } from "../websockets";
import { askAI, recentChatMessagesForAI } from "./ai";

export const grantRFP = async (
  wallets: string[],
  solAmount
): Promise<boolean> => {
  const rfpBody = {
    reason: "Baby Bot",
    solAmount: solAmount,
    walletIds: wallets,
    secretKey: process.env.RFP_SECRET_KEY as string,
  };

  try {
    console.log(`RFP rain ${solAmount} SOL starting...`);

    const response = await axios.post(
      `${process.env.AEGIS_URL}/campaigns/${process.env.RFP_CAMPAIGN}/risk-free-plays/secret`,
      rfpBody,
      {
        headers: { "Content-Type": "application/json" },
      }
    );
    if (response.data.payload) {
      console.log(
        `RFP rain ${solAmount} SOL succeeded...${response.data.payload}`
      );
      return true;
    }
    return false;
  } catch (err) {
    console.log(err);
    console.log(`RFP rain ${solAmount} SOL errored...`);
    return false;
  }
};

const MIN_BET_LAMPORTS = 10_000_000; // 0.01 SOL

const getPlayersWithMostRoundsPlayed = (
  gameResult: GameResult[],
  delta: number
): string[] => {
  const playerRoundCount = new Map<string, number>();

  gameResult.forEach((game) => {
    Object.values(game.players).forEach((player) => {
      if (Number.parseInt(player.lamports) >= MIN_BET_LAMPORTS) {
        playerRoundCount.set(
          player.pubkey,
          (playerRoundCount.get(player.pubkey) || 0) + 1
        );
      }
    });
  });

  let mostRounds = 0;

  playerRoundCount.forEach((rounds) => {
    if (rounds > mostRounds) {
      mostRounds = rounds;
    }
  });

  const playersWithMostRounds: string[] = [];

  playerRoundCount.forEach((value, player) => {
    if (value >= mostRounds - delta) {
      playersWithMostRounds.push(player);
    }
  });

  console.log(`Most rounds: ${playersWithMostRounds}`);

  return playersWithMostRounds;
};

const getPlayerWithMostLostRounds = (
  gameResult: GameResult[],
  delta: number
): string[] => {
  const playerLostCount = new Map<string, number>();

  gameResult.forEach((game) => {
    Object.values(game.players).forEach((player) => {
      if (
        Number.parseInt(player.lamports) >= MIN_BET_LAMPORTS &&
        (Number.parseInt(player.reward) || 0) === 0
      ) {
        playerLostCount.set(
          player.pubkey,
          (playerLostCount.get(player.pubkey) || 0) + 1
        );
      }
    });
  });

  let mostLost = 0;

  playerLostCount.forEach((lost) => {
    if (lost > mostLost) {
      mostLost = lost;
    }
  });

  let playersWithMostLost: string[] = [];

  playerLostCount.forEach((lost, player) => {
    if (lost >= mostLost - delta) {
      playersWithMostLost.push(player);
    }
  });

  return playersWithMostLost;
};

export const pickPlayersForRFP = async (): Promise<string[]> => {
  try {
    const limit = 30;
    const response = await axios.get(
      `https://api.dealer.degencoinflip.com/v1/game/2/room/1/rounds?limit=${limit}`
    );
    const totalGames = response.data.payload as GameResult[];

    const mostRoundPlayers = getPlayersWithMostRoundsPlayed(totalGames, 3);
    const mostLostRoundsPlayers = getPlayerWithMostLostRounds(totalGames, 3);

    let msgId = 0;
    const parsedChatMessages = recentChatMessagesForAI.map((msg) => ({
      id: msgId++,
      wallet: msg.wallet.slice(0, 8),
      message: msg.message,
    }));

    const responseAI = await askAI(
      "Select between one to three Wallet IDs of chat participants who were the most empathic, cheerful or engaged with the community. Only supply max three wallet IDs. This is the chat log: " +
        JSON.stringify(parsedChatMessages)
    );

    let selectedWalletIds: string[] = [];
    if (responseAI && responseAI.text) {
      console.log(`AI Response: ${responseAI.text}`);

      const foundMessages = recentChatMessagesForAI.filter(
        (msg) => msg.wallet && responseAI.text.includes(msg.wallet.slice(0, 8))
      );
      if (foundMessages && foundMessages.length > 0) {
        selectedWalletIds.push(...foundMessages.map((msg) => msg.wallet));
      }
    }

    //Clear chat msgs
    recentChatMessagesForAI.splice(0, recentChatMessagesForAI.length);

    let allWallets = [
      ...mostRoundPlayers,
      ...mostLostRoundsPlayers,
      ...Array.from(new Set(selectedWalletIds)),
    ];

    console.log(allWallets);

    //Return only valid
    return allWallets.filter((wallet) => wallet && wallet.length > 12);
  } catch (err) {
    console.log(err);
    return [];
  }
};
