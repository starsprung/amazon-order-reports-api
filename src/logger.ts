import * as winston from 'winston';

export const createLogger = (level: LogLevel): winston.Logger => {
  const logger = winston.createLogger({
    format: winston.format.combine(
      winston.format.metadata(),
      winston.format.timestamp(),
      winston.format.json()
    )
  });

  logger.add(
    new winston.transports.Console(
      level === 'none'
        ? { silent: true }
        : {
            level
          }
    )
  );

  return logger;
};

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  ERROR = 'error',
  NONE = 'none',
  SILLY = 'silly'
}

export { Logger } from 'winston';
