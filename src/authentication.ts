import NodeCache from "node-cache";
import jwt from "jsonwebtoken";
import axios from "axios";
import { logger } from "./logger";

const authenticatedCache = new NodeCache({
  stdTTL: 40000,
  checkperiod: 3600,
}); //Remember aprox 12 hours

export const verifyJwt = async (
  authToken: string
): Promise<string | undefined> => {
  try {
    const decoded = jwt.decode(authToken);
    const walletId = decoded["cognito:username"] as string;

    if (authenticatedCache.get(authToken)) {
      return walletId;
    } else {
      return await axios
        .get(
          "https://dev-api.dealer.degencoinflip.com/v1/authentication-check",
          {
            headers: {
              Authorization: authToken,
              "Content-Type": "application/json",
            },
          }
        )
        .then((response) => {
          if (response.data.payload.isSuccessful === true) {
            logger.info(`[JWT] New user authenticated ${walletId}`);
            authenticatedCache.set(authToken, walletId);
            return walletId;
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
