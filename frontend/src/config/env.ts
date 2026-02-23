export type LogLevel = "debug" | "info" | "warn" | "error";

const DEFAULT_API_BASE_URL = "http://localhost:5000";
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const defaultLogLevel: LogLevel = import.meta.env.MODE === "test" ? "warn" : (import.meta.env.DEV ? "debug" : "warn");
const configuredLogLevel = (import.meta.env.VITE_LOG_LEVEL || defaultLogLevel).toLowerCase();

export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL,
  socketUrl: import.meta.env.VITE_SOCKET_URL ?? import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL,
  logLevel: configuredLogLevel in LOG_LEVEL_PRIORITY ? (configuredLogLevel as LogLevel) : "warn",
} as const;
