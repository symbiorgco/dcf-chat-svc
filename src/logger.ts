import { pino } from "pino";
import * as dotenv from "dotenv";
dotenv.config();

const transport = pino.transport({
  targets: [
    {
      target: "pino-pretty",
      options: {
        destination: `./app.log`,
        translateTime: "UTC:yyyy-mm-dd HH:MM:ss.l",
      },
    },
    {
      target: "pino-axiom",
      options: {
        orgId: "web-omega-r4fd", // Can be found on settings page
        token: "xaat-1f474563-86eb-4eda-ade5-0cb4f4b85612", // Can be generated on settings > API Tokens
        dataset: "dcf_chat", // Can be created on /datasets
      },
    },
  ],
});

const baseLogger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
  },
  transport
);

export const logger = baseLogger.child({ name: "chat-backend" });
