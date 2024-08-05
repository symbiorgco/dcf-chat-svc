import { pino } from "pino";
import * as dotenv from "dotenv";
dotenv.config();

const transport = pino.transport({
  target: "pino-pretty",
  options: {
    destination: `./app.log`,
    translateTime: "UTC:yyyy-mm-dd HH:MM:ss.l",
  },
});

const baseLogger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
  },
  transport
);

export const logger = baseLogger.child({ name: "chat-backend" });
