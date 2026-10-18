const isDev = process.env.NODE_ENV !== "production";

export const logger = {
  info: (message, ...args) => {
    if (isDev) console.log(`[INFO] ${message}`, ...args);
  },
  error: (message, ...args) => {
    console.error(`[ERROR] ${message}`, ...args);
  },
  warn: (message, ...args) => {
    if (isDev) console.warn(`[WARN] ${message}`, ...args);
  },
};
