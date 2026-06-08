import pino, { type TransportTargetOptions } from "pino";
import * as dotenv from "dotenv";
dotenv.config();

const targets: TransportTargetOptions[] = [
  {
    target: "pino-pretty",
    options: {
      destination: `./app.log`,
      translateTime: "UTC:yyyy-mm-dd HH:MM:ss.l",
    },
  },
];

const axiomOrgId = process.env.AXIOM_ORG_ID;
const axiomToken = process.env.AXIOM_TOKEN;
const axiomDataset = process.env.AXIOM_DATASET;

if (axiomOrgId && axiomToken && axiomDataset) {
  targets.push({
    target: "pino-axiom",
    options: {
      orgId: axiomOrgId,
      token: axiomToken,
      dataset: axiomDataset,
    },
  });
}

const transport = pino.transport({
  targets,
});

const baseLogger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
  },
  transport
);

export const logger = baseLogger.child({ name: "chat-backend" });
