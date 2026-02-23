import { env, type LogLevel } from "../config/env";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const activeLevel: LogLevel = env.logLevel;

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[activeLevel];
}

function nowIso(): string {
  return new Date().toISOString();
}

export const logger = {
  debug(message: string, context?: unknown): void {
    if (!shouldLog("debug")) {
      return;
    }
    console.debug(`[KitchenSync][${nowIso()}] ${message}`, context ?? "");
  },
  info(message: string, context?: unknown): void {
    if (!shouldLog("info")) {
      return;
    }
    console.info(`[KitchenSync][${nowIso()}] ${message}`, context ?? "");
  },
  warn(message: string, context?: unknown): void {
    if (!shouldLog("warn")) {
      return;
    }
    console.warn(`[KitchenSync][${nowIso()}] ${message}`, context ?? "");
  },
  error(message: string, context?: unknown): void {
    if (!shouldLog("error")) {
      return;
    }
    console.error(`[KitchenSync][${nowIso()}] ${message}`, context ?? "");
  },
};
