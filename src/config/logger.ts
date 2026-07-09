import pino from "pino";
import { loadConfig } from "./env.js";

const config = loadConfig();

export const logger = pino({
  level: config.LOG_LEVEL,
  base: null,
  timestamp: pino.stdTimeFunctions.isoTime
});

export type Logger = typeof logger;
