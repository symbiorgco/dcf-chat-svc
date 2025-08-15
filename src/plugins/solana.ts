import {
  Connection,
  ParsedInstruction,
  ParsedTransactionWithMeta,
  PublicKey,
} from "@solana/web3.js";

const connection = new Connection(process.env.SOLANA_RPC as string);

export const performWithRetries = async (task, retries = 3, timeout = 6900) => {
  let elapsedTime = 0;
  let lastError;

  while (retries > 0) {
    try {
      const result = await task();
      if (result !== undefined) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }
    retries--;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    elapsedTime += 1000;
    if (elapsedTime >= timeout) {
      break;
    }
  }
  if (lastError) {
    throw lastError;
  }
  return null;
};

export const tryAndGetParsedTransaction = async (
  signature
): Promise<ParsedTransactionWithMeta | null> => {
  return performWithRetries(async () => {
    return await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });
  });
};

type TXResult = {
  pubkey: string;
  sol: number;
};

export const verifyTransaction = async (
  maxSecondsOld: number,
  signature: string
): Promise<TXResult | undefined> => {
  try {
    console.log("Verifying transaction:", signature);
    let iteration = 0;
    const MAX_ITERARIONS = 4;
    let transactionResult: ParsedTransactionWithMeta;
    for (iteration = 0; iteration < MAX_ITERARIONS; iteration++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      transactionResult = await tryAndGetParsedTransaction(signature);
      if (transactionResult) {
        break;
      }
    }
    console.log(transactionResult);
    if (!transactionResult) {
      console.log("TX did not return in time");

      return undefined;
    }

    if (transactionResult.meta.err) {
      console.log("TX errored");

      return undefined;
    }

    if (transactionResult.blockTime) {
      const isRecent =
        transactionResult.blockTime > Date.now() / 1000 - maxSecondsOld;
      if (!isRecent) {
        console.log("TX to old");
        return undefined;
      }
    }
    const parsedInstructions = transactionResult.transaction.message
      .instructions as ParsedInstruction[];
    const solTransferInstructions = parsedInstructions.filter(
      (instruction) => instruction.program === "system"
    );
    const parsedReceivers: { pubkey: PublicKey; lamports: number }[] =
      solTransferInstructions.map((instruction) => {
        return {
          pubkey: new PublicKey(instruction.parsed.info.destination),
          lamports: instruction.parsed.info.lamports,
        };
      });

    const balatoWallet = parsedReceivers.find(
      (receiver) =>
        receiver.pubkey.toBase58() ==
        "BALAtShCVWPEMw6huA1PWTyFSGDbE4WUHcYMthriBxy4"
    );

    if (!balatoWallet) {
      console.log("No balato wallet found");
      return undefined;
    }

    if (balatoWallet.lamports < 500_000) {
      console.log("Balato wallet did not receive enough");
      return undefined;
    }

    for (const receiver of parsedReceivers) {
      if (
        receiver.pubkey.toBase58() ===
        "BALAtShCVWPEMw6huA1PWTyFSGDbE4WUHcYMthriBxy4"
      ) {
        continue;
      }
      if (receiver.lamports >= 1_000_000) {
        console.log("Successful received");
        return {
          pubkey: receiver.pubkey.toBase58(),
          sol: receiver.lamports / 1_000_000_000,
        };
      }
    }

    console.log("Did not find receiver");

    // Todo check if the TX contains sol sends
  } catch (error) {
    console.error("Error verifying transaction:", error);
    return undefined;
  }
  return undefined;
};
