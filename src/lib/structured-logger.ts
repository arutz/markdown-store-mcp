export type LogLevel = "debug" | "info" | "error";

export interface StructuredLogSink {
  write: (line: string) => void;
}

export interface StructuredLogger {
  debug: (event: string, payload?: Record<string, unknown>) => void;
  info: (event: string, payload?: Record<string, unknown>) => void;
  error: (event: string, payload?: Record<string, unknown>) => void;
}

const MAX_FIELD_LENGTH = 250;
const TRUNCATED_SUFFIX = "<truncated>";

export function truncateTopLevelValues(
  payload: Record<string, unknown> = {}
): Record<string, unknown> {
  const truncatedPayload: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    truncatedPayload[key] = truncateTopLevelValue(value);
  }

  return truncatedPayload;
}

export function createStructuredLogger(sink: StructuredLogSink): StructuredLogger {
  return {
    debug: (event, payload) => writeStructuredLog(sink, "debug", event, payload),
    info: (event, payload) => writeStructuredLog(sink, "info", event, payload),
    error: (event, payload) => writeStructuredLog(sink, "error", event, payload),
  };
}

function writeStructuredLog(
  sink: StructuredLogSink,
  level: LogLevel,
  event: string,
  payload: Record<string, unknown> = {}
): void {
  try {
    sink.write(
      `${JSON.stringify({
        ts: new Date().toISOString(),
        level,
        event,
        ...truncateTopLevelValues(payload),
      })}\n`
    );
  } catch (error) {
    sink.write(
      `${JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        event: "log_fallback",
        error: describeLogError(error),
      })}\n`
    );
  }
}

function truncateTopLevelValue(value: unknown): unknown {
  if (typeof value === "string") {
    return truncateString(value);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return truncateString(value.toString());
  }

  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    return serialized;
  }

  return truncateString(serialized);
}

function truncateString(value: string): string {
  if (value.length <= MAX_FIELD_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_FIELD_LENGTH - TRUNCATED_SUFFIX.length)}${TRUNCATED_SUFFIX}`;
}

function describeLogError(error: unknown): string {
  if (error instanceof Error) {
    return `Failed to serialize log event: ${error.message}`;
  }

  return "Failed to serialize log event";
}
