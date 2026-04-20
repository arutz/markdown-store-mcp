import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";

import type { JSONRPCMessage, Transport } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server";

import { buildServer } from "../src/server.ts";
import { startStdioRuntime } from "../src/index.ts";
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

test("logging transport records startup failures distinctly", async () => {
  const writes: string[] = [];
  const logger = createStructuredLogger({
    write: (chunk: string) => {
      writes.push(chunk);
    },
  });
  const startError = new Error("start failed");

  const innerTransport = {
    onclose: undefined as (() => void) | undefined,
    onerror: undefined as ((error: Error) => void) | undefined,
    onmessage: undefined as ((message: unknown) => void) | undefined,
    async start() {
      throw startError;
    },
    async send(message: unknown) {
      void message;
    },
    async close() {},
  };

  const wrapped = createLoggingTransport(innerTransport as never, logger, "stdio");

  await assert.rejects(wrapped.start(), startError);

  const parsed = writes.map((line) => JSON.parse(line));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.event, "transport_error");
  assert.equal(parsed[0]?.transport, "stdio");
  assert.equal(parsed[0]?.phase, "startup");
  assert.match(String(parsed[0]?.error), /start failed/);
});

test("logging transport records failed outbound sends distinctly", async () => {
  const writes: string[] = [];
  const logger = createStructuredLogger({
    write: (chunk: string) => {
      writes.push(chunk);
    },
  });
  const sendError = new Error("send failed");

  const innerTransport = {
    onclose: undefined as (() => void) | undefined,
    onerror: undefined as ((error: Error) => void) | undefined,
    onmessage: undefined as ((message: unknown) => void) | undefined,
    async start() {},
    async send() {
      throw sendError;
    },
    async close() {},
  };

  const wrapped = createLoggingTransport(innerTransport as never, logger, "stdio");

  await assert.rejects(
    wrapped.send({
      jsonrpc: "2.0",
      id: "1",
      method: "initialize",
      params: { protocolVersion: "2025-11-05" },
    } as never),
    sendError
  );

  const parsed = writes.map((line) => JSON.parse(line));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.event, "transport_error");
  assert.equal(parsed[0]?.transport, "stdio");
  assert.equal(parsed[0]?.phase, "outbound");
  assert.equal(parsed[0]?.request_id, "1");
  assert.match(String(parsed[0]?.error), /send failed/);
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

test("stdio startup wiring uses a wrapped transport and logs server start", async () => {
  const writes: string[] = [];
  const stdout = new PassThrough();
  stdout.setEncoding("utf8");
  stdout.on("data", (chunk: string) => {
    writes.push(chunk);
  });
  const server = {
    connectCalls: [] as unknown[],
    async connect(transport: unknown) {
      this.connectCalls.push(transport);
    },
  };

  await startStdioRuntime(server as never, {
    stdout,
  });

  assert.equal(server.connectCalls.length, 1);
  assert.equal(server.connectCalls[0] instanceof StdioServerTransport, false);
  assert.equal(typeof (server.connectCalls[0] as { send?: unknown }).send, "function");

  const parsed = writes.map((line) => JSON.parse(line));
  assert.equal(parsed[0]?.event, "server_start");
  assert.equal(parsed[0]?.transport, "stdio");
});

test("buildServer emits tool_call logs when invoked through public MCP transport behavior", async () => {
  const writes: string[] = [];
  const logger = createStructuredLogger({
    write: (chunk: string) => {
      writes.push(chunk);
    },
  });
  const service = {
    async createDoc(input: {
      id?: string;
      title: string;
      tags: string[];
      doc_type: string;
      content: string;
      source: "canonical";
    }) {
      return {
        canonicalPath: `content/${input.doc_type}/doc.md`,
        metadata: {
          id: input.id ?? "doc-id",
          title: input.title,
          tags: input.tags,
          doc_type: input.doc_type,
          status: "active",
          source: input.source,
        },
      };
    },
    async getDoc() {
      return null;
    },
    async importDoc() {
      throw new Error("not implemented");
    },
    async searchDocs() {
      return [];
    },
    async updateDoc() {
      throw new Error("not implemented");
    },
    async deactivateDoc() {
      throw new Error("not implemented");
    },
    async reactivateDoc() {
      throw new Error("not implemented");
    },
    async deleteDoc() {
      throw new Error("not implemented");
    },
  };
  const sentMessages: JSONRPCMessage[] = [];
  const transport = createTestTransport((message) => {
    sentMessages.push(message);
  });
  const server = buildServer(service as never, logger, "stdio");

  await server.connect(transport);

  transport.onmessage?.({
    jsonrpc: "2.0",
    id: "init-1",
    method: "initialize",
    params: {
      protocolVersion: "2025-11-05",
      capabilities: {},
      clientInfo: {
        name: "test-client",
        version: "1.0.0",
      },
    },
  } as never);
  await flushAsyncWork();

  transport.onmessage?.({
    jsonrpc: "2.0",
    method: "notifications/initialized",
  } as never);
  await flushAsyncWork();

  transport.onmessage?.({
    jsonrpc: "2.0",
    id: "call-1",
    method: "tools/call",
    params: {
      name: "create_doc",
      arguments: {
        title: "Doc",
        tags: [],
        doc_type: "note",
        content: "z".repeat(400),
      },
    },
  } as never);
  await flushAsyncWork();

  assert.equal(
    sentMessages.some((message) => "id" in message && message.id === "call-1"),
    true
  );

  const parsed = writes.map((line) => JSON.parse(line));
  assert.equal(
    parsed.some((entry) => entry.event === "tool_call" && entry.outcome === "started"),
    true
  );
  assert.equal(
    parsed.some(
      (entry) =>
        entry.event === "tool_call" &&
        entry.tool_name === "create_doc" &&
        /<truncated>$/.test(String(entry.args?.content))
    ),
    true
  );
  assert.equal(
    parsed.some((entry) => entry.event === "tool_call" && entry.outcome === "completed"),
    true
  );
});

function createTestTransport(onSend: (message: JSONRPCMessage) => void): Transport {
  return {
    onclose: undefined,
    onerror: undefined,
    onmessage: undefined,
    async start() {},
    async send(message: JSONRPCMessage) {
      onSend(message);
    },
    async close() {},
  };
}

async function flushAsyncWork(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
