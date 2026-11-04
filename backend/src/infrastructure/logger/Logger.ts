export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface StructuredLog {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlationId?: string;
  context?: string;
  data?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class LoggerService {
  private formatLog(
    level: LogLevel,
    message: string,
    context?: string,
    data?: Record<string, unknown>,
    err?: Error,
    correlationId?: string
  ): StructuredLog {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      correlationId,
      context,
      data,
      ...(err && {
        error: {
          name: err.name,
          message: err.message,
          stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
        }
      })
    };
  }

  public info(message: string, context?: string, data?: Record<string, unknown>, correlationId?: string): void {
    const log = this.formatLog('info', message, context, data, undefined, correlationId);
    console.log(JSON.stringify(log));
  }

  public warn(message: string, context?: string, data?: Record<string, unknown>, correlationId?: string): void {
    const log = this.formatLog('warn', message, context, data, undefined, correlationId);
    console.warn(JSON.stringify(log));
  }

  public error(message: string, err?: Error, context?: string, data?: Record<string, unknown>, correlationId?: string): void {
    const log = this.formatLog('error', message, context, data, err, correlationId);
    console.error(JSON.stringify(log));
  }

  public debug(message: string, context?: string, data?: Record<string, unknown>): void {
    if (process.env.NODE_ENV !== 'production') {
      const log = this.formatLog('debug', message, context, data);
      console.debug(JSON.stringify(log));
    }
  }
}

export const logger = new LoggerService();
