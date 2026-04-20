import assert from "node:assert/strict";
import test from "node:test";

import { createLoggingTransport } from "../src/lib/logging-transport.ts";
import { createStructuredLogger } from "../src/lib/structured-logger.ts";
import { wrapToolHandler } from "../src/lib/tool-logging.ts";

test("logging transport emits debug events for inbound and outbound MCP messages", async () => {
  const writes: string[] = [];
  const logger = createStructuredLogger({
    write: (chunk: string) => {
      writes.push(chunk);
    },
  });

  const innerTransport = {
    onclose: undefined as (() => void) | undefined,
    onerror: undefined as ((error: Error) => void) | undefined,
    onmessage: undefined as ((message: unknown) => void) | undefined,
    async start() {},
    async send(message: unknown) {
      void message;
    },
    async close() {},
  };

  const wrapped = createLoggingTransport(innerTransport as never, logger, "stdio");
  wrapped.onmessage = () => undefined;

  await wrapped.start();
  innerTransport.onmessage?.({
    jsonrpc: "2.0",
    id: "1",
    method: "initialize",
    params: { protocolVersion: "2025-11-05" },
  });
  await wrapped.send({
    jsonrpc: "2.0",
    id: "1",
    result: { protocolVersion: "2025-11-05" },
  } as never);

  const parsed = writes.map((line) => JSON.parse(line));
  assert.equal(parsed[0]?.event, "mcp_message");
  assert.equal(parsed[0]?.direction, "inbound");
  assert.equal(parsed[0]?.method, "initialize");
  assert.equal(parsed[1]?.event, "mcp_message");
  assert.equal(parsed[1]?.direction, "outbound");
  assert.equal(parsed[1]?.request_id, "1");
});

test("wrapToolHandler emits info logs with truncated arguments", async () => {
  const writes: string[] = [];
  const logger = createStructuredLogger({
    write: (chunk: string) => {
      writes.push(chunk);
    },
  });

  const handler = wrapToolHandler(
    "create_doc",
    "http",
    logger,
    async (input: { title: string; content: string }) => ({
      content: [{ type: "text" as const, text: JSON.stringify({ ok: true }) }],
      structuredContent: input.title,
    })
  );

  await handler({
    title: "Doc",
    content: "z".repeat(400),
  } as never);

  const parsed = writes.map((line) => JSON.parse(line));
  assert.equal(parsed[0]?.event, "tool_call");
  assert.equal(parsed[0]?.tool_name, "create_doc");
  assert.equal(parsed[0]?.outcome, "started");
  assert.match(String(parsed[0]?.args?.content), /<truncated>$/);
  assert.equal(parsed[1]?.event, "tool_call");
  assert.equal(parsed[1]?.outcome, "completed");
});
