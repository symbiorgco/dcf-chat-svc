import axios from "axios";
import { GameResult } from "../websockets";
import { askAI, recentChatMessagesForAI } from "./ai";

export const grantRFP = (wallets: string[], solAmount) => {
  console.log("GRANT RFP", wallets, solAmount);
};

const getPlayersWithMostRoundsPlayed = (gameResult: GameResult[]): string[] => {
  const playerRoundCount = new Map<string, number>();

  gameResult.forEach((game) => {
    Object.values(game.players).forEach((player) => {
      playerRoundCount.set(
        player.pubkey,
        (playerRoundCount.get(player.pubkey) || 0) + 1
      );
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
    if (value === mostRounds) {
      playersWithMostRounds.push(player);
    }
  });

  console.log(`Most rounds: ${playersWithMostRounds}`);

  return playersWithMostRounds;
};

const getPlayerWithMostLostRounds = (gameResult: GameResult[]): string[] => {
  const playerLostCount = new Map<string, number>();

  gameResult.forEach((game) => {
    Object.values(game.players).forEach((player) => {
      if (Number.parseInt(player.reward) || 0 === 0) {
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
    if (lost === mostLost) {
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

    const mostRoundPlayers = getPlayersWithMostRoundsPlayed(totalGames);
    const mostLostRoundsPlayers = getPlayerWithMostLostRounds(totalGames);

    let msgId = 0;
    const parsedChatMessages = recentChatMessagesForAI.map((msg) => ({
      id: msgId++,
      wallet: msg.wallet.slice(0, 8),
      message: msg.message,
    }));

    const responseAI = await askAI(
      "Select the Wallet ID of one chat participant who was the most empathic, cheerful or engaged with the community. Only supply one wallet ID. This is the chat log: " +
        JSON.stringify(parsedChatMessages)
    );

    let selectedWalletId = "";
    if (responseAI && responseAI.text) {
      console.log(`AI Response: ${responseAI.text}`);

      const found = recentChatMessagesForAI.find(
        (msg) => msg.wallet && responseAI.text.includes(msg.wallet.slice(0, 8))
      );
      if (found && found.wallet) {
        selectedWalletId = found.wallet;
      }
    }

    //Clear chat msgs
    recentChatMessagesForAI.splice(0, recentChatMessagesForAI.length);

    let allWallets = [
      ...mostRoundPlayers,
      ...mostLostRoundsPlayers,
      selectedWalletId,
    ];

    console.log(allWallets);

    //Return only valid
    return allWallets.filter((wallet) => wallet && wallet.length > 12);
  } catch (err) {
    console.log(err);
    return [];
  }
};
