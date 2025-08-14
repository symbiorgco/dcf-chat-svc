import { Connection } from "@solana/web3.js";

const connection = new Connection(process.env.SOLANA_RPC as string);

export const verifyTransaction = async (
  maxSecondsOld: number,
  signature: string
) => {
  try {
    const reply = await connection.getParsedTransaction(signature, {
      commitment: "confirmed",
    });
    if (!reply) {
      return false;
    }

    if (reply.blockTime) {
      const isRecent = reply.blockTime > Date.now() / 1000 - maxSecondsOld;
      return isRecent;
    }

    if (reply.meta.err) {
      return false;
    }
    // Todo check if the TX contains sol sends
  } catch (error) {
    console.error("Error verifying transaction:", error);
    return false;
  }
  return false;
};
