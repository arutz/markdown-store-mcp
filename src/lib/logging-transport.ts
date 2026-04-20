import type {
  JSONRPCMessage,
  MessageExtraInfo,
  Transport,
  TransportSendOptions,
} from "@modelcontextprotocol/server";

import {
  preserveStructuredLogRecord,
  truncateTopLevelValues,
  type StructuredLogger,
} from "./structured-logger.ts";

import type { RuntimeTransport } from "../runtime-config.ts";

export function createLoggingTransport(
  inner: Transport,
  logger: StructuredLogger,
  transportName: RuntimeTransport
): Transport {
  const wrapped: Transport = {
    onclose: undefined,
    onerror: undefined,
    onmessage: undefined,
    async start() {
      inner.onclose = () => {
        wrapped.onclose?.();
      };
      inner.onerror = (error) => {
        logger.error("transport_error", {
          transport: transportName,
          error,
        });
        wrapped.onerror?.(error);
      };
      inner.onmessage = (message, extra) => {
        logger.debug("mcp_message", describeMessage("inbound", transportName, message));
        wrapped.onmessage?.(message, extra);
      };

      await inner.start();
    },
    async send(message: JSONRPCMessage, options?: TransportSendOptions) {
      try {
        await inner.send(message, options);
      } catch (error) {
        logger.error("transport_error", {
          transport: transportName,
          phase: "outbound",
          request_id: describeRequestId(message),
          error,
        });
        throw error;
      }

      logger.debug("mcp_message", describeMessage("outbound", transportName, message));
    },
    async close() {
      await inner.close();
    },
  };

  return wrapped;
}

function describeMessage(
  direction: "inbound" | "outbound",
  transport: RuntimeTransport,
  message: JSONRPCMessage
): Record<string, unknown> {
  const record = message as {
    id?: string | number;
    method?: string;
    params?: unknown;
    result?: unknown;
    error?: unknown;
  };

  return {
    direction,
    transport,
    method: record.method ?? null,
    request_id: record.id ?? null,
    payload: describePayload(record.params ?? record.result ?? record.error ?? null),
  };
}

function describePayload(payload: unknown): unknown {
  if (isPlainRecord(payload)) {
    return preserveStructuredLogRecord(truncateTopLevelValues(payload));
  }

  return payload;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describeRequestId(message: JSONRPCMessage): string | number | null {
  const record = message as {
    id?: string | number;
  };

  return record.id ?? null;
}
