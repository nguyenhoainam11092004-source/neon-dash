/**
 * Minimal levelled logger.
 *
 * Gameplay code must never call `console` directly: routing everything through
 * one place means the log level can be turned down for production, and a future
 * crash reporter has a single hook to attach to.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

export interface LogEntry {
  level: Exclude<LogLevel, 'silent'>;
  scope: string;
  message: string;
  detail?: unknown;
  timestamp: number;
}

type LogSink = (entry: LogEntry) => void;

class LoggerImpl {
  private level: LogLevel = import.meta.env?.DEV ? 'debug' : 'warn';
  private readonly sinks: LogSink[] = [];
  /** Ring buffer of recent entries, surfaced by the in-game debug overlay. */
  private readonly history: LogEntry[] = [];
  private readonly historyLimit = 200;

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  /** Registers an extra destination, e.g. an on-screen console or a reporter. */
  addSink(sink: LogSink): () => void {
    this.sinks.push(sink);
    return () => {
      const index = this.sinks.indexOf(sink);
      if (index >= 0) this.sinks.splice(index, 1);
    };
  }

  getHistory(): readonly LogEntry[] {
    return this.history;
  }

  debug(scope: string, message: string, detail?: unknown): void {
    this.write('debug', scope, message, detail);
  }

  info(scope: string, message: string, detail?: unknown): void {
    this.write('info', scope, message, detail);
  }

  warn(scope: string, message: string, detail?: unknown): void {
    this.write('warn', scope, message, detail);
  }

  error(scope: string, message: string, detail?: unknown): void {
    this.write('error', scope, message, detail);
  }

  private write(
    level: Exclude<LogLevel, 'silent'>,
    scope: string,
    message: string,
    detail?: unknown,
  ): void {
    const entry: LogEntry = { level, scope, message, detail, timestamp: Date.now() };

    this.history.push(entry);
    if (this.history.length > this.historyLimit) this.history.shift();

    for (const sink of this.sinks) {
      // A broken sink must never take the game down with it.
      try {
        sink(entry);
      } catch {
        /* ignored on purpose */
      }
    }

    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) return;

    const prefix = `[${scope}]`;
    if (level === 'error') console.error(prefix, message, detail ?? '');
    else if (level === 'warn') console.warn(prefix, message, detail ?? '');
    else console.info(prefix, message, detail ?? '');
  }
}

export const logger = new LoggerImpl();

/**
 * Installs global handlers so nothing escapes silently.
 *
 * Unhandled rejections in particular are easy to produce with async asset and
 * API code, and by default they only appear in the devtools console.
 */
export function installGlobalErrorHandlers(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    logger.error('window', event.message, {
      source: event.filename,
      line: event.lineno,
      column: event.colno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    logger.error(
      'promise',
      reason instanceof Error ? reason.message : 'Unhandled promise rejection',
      reason,
    );
  });
}
