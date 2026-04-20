import type { RuntimeTransport } from "../runtime-config.ts";
import {
  preserveStructuredLogRecord,
  truncateTopLevelValues,
  type StructuredLogger,
} from "./structured-logger.ts";

export function wrapToolHandler<Args, Result, Context>(
  toolName: string,
  transportName: RuntimeTransport,
  logger: StructuredLogger,
  handler: (input: Args, context: Context) => Promise<Result> | Result
): (input: Args, context: Context) => Promise<Result> {
  return async (input: Args, context: Context) => {
    const startedAt = Date.now();
    const args = describeArgs(input);

    logger.info("tool_call", {
      transport: transportName,
      tool_name: toolName,
      args,
      outcome: "started",
    });

    try {
      const result = await handler(input, context);
      logger.info("tool_call", {
        transport: transportName,
        tool_name: toolName,
        args,
        outcome: "completed",
        duration_ms: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      logger.error("tool_call", {
        transport: transportName,
        tool_name: toolName,
        args,
        outcome: "failed",
        duration_ms: Date.now() - startedAt,
        error,
      });
      throw error;
    }
  };
}

function describeArgs(input: unknown): unknown {
  if (isPlainRecord(input)) {
    return preserveStructuredLogRecord(truncateTopLevelValues(input));
  }

  return input ?? {};
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
