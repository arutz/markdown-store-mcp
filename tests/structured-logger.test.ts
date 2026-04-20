import assert from "node:assert/strict";
import test from "node:test";

import { createStructuredLogger, truncateTopLevelValues } from "../src/lib/structured-logger.ts";

test("truncateTopLevelValues leaves short primitives unchanged and truncates top-level objects", () => {
  const payload = truncateTopLevelValues({
    short: "ok",
    count: 42,
    truthy: true,
    long: "x".repeat(260),
    nested: { title: "Nested", body: "y".repeat(260) },
    items: ["a", "b", "z".repeat(260)],
  });

  assert.equal(payload.short, "ok");
  assert.equal(payload.count, 42);
  assert.equal(payload.truthy, true);
  assert.equal(typeof payload.long, "string");
  assert.ok(String(payload.long).length <= 250);
  assert.match(String(payload.long), /<truncated>$/);
  assert.equal(typeof payload.nested, "string");
  assert.ok(String(payload.nested).length <= 250);
  assert.match(String(payload.nested), /<truncated>$/);
  assert.equal(typeof payload.items, "string");
  assert.ok(String(payload.items).length <= 250);
  assert.match(String(payload.items), /<truncated>$/);
});

test("structured logger writes newline-delimited JSON with common fields", () => {
  const writes: string[] = [];
  const logger = createStructuredLogger({
    write: (chunk: string) => {
      writes.push(chunk);
    },
  });

  logger.info("server_start", {
    transport: "http",
    host: "127.0.0.1",
    port: 3000,
  });

  assert.equal(writes.length, 1);
  assert.ok(writes[0]?.endsWith("\n"));

  const parsed = JSON.parse(writes[0] ?? "");
  assert.equal(parsed.level, "info");
  assert.equal(parsed.event, "server_start");
  assert.equal(parsed.transport, "http");
  assert.equal(parsed.host, "127.0.0.1");
  assert.equal(parsed.port, 3000);
  assert.equal(typeof parsed.ts, "string");
});

test("structured logger preserves required metadata when payload collides", () => {
  const writes: string[] = [];
  const logger = createStructuredLogger({
    write: (chunk: string) => {
      writes.push(chunk);
    },
  });

  logger.info("server_start", {
    level: "debug",
    event: "payload_event",
    ts: "payload-ts",
    transport: "http",
  });

  const parsed = JSON.parse(writes[0] ?? "");
  assert.equal(parsed.level, "info");
  assert.equal(parsed.event, "server_start");
  assert.notEqual(parsed.ts, "payload-ts");
  assert.equal(parsed.transport, "http");
});

test("structured logger supports debug info and error levels", () => {
  const writes: string[] = [];
  const logger = createStructuredLogger({
    write: (chunk: string) => {
      writes.push(chunk);
    },
  });

  logger.debug("debug_event", { transport: "stdio" });
  logger.info("info_event", { transport: "stdio" });
  logger.error("error_event", { transport: "stdio" });

  const levels = writes.map((line) => JSON.parse(line).level);
  assert.deepEqual(levels, ["debug", "info", "error"]);
});

test("structured logger preserves error payload context", () => {
  const writes: string[] = [];
  const logger = createStructuredLogger({
    write: (chunk: string) => {
      writes.push(chunk);
    },
  });

  logger.error("startup_failure", {
    error: new Error("boom"),
  });

  const parsed = JSON.parse(writes[0] ?? "");
  assert.equal(parsed.level, "error");
  assert.equal(parsed.event, "startup_failure");
  assert.match(String(parsed.error), /Error/);
  assert.match(String(parsed.error), /boom/);
  assert.match(String(parsed.error), /Error: boom/);
  assert.match(String(parsed.error), /at TestContext/);
});

test("structured logger falls back safely if payload serialization throws", () => {
  const writes: string[] = [];
  const logger = createStructuredLogger({
    write: (chunk: string) => {
      writes.push(chunk);
    },
  });

  const circular: { self?: unknown } = {};
  circular.self = circular;

  assert.doesNotThrow(() => {
    logger.debug("mcp_message", {
      transport: "stdio",
      payload: circular,
    });
  });

  assert.equal(writes.length, 1);
  const parsed = JSON.parse(writes[0] ?? "");
  assert.equal(parsed.level, "error");
  assert.equal(parsed.event, "log_fallback");
  assert.ok(String(parsed.error).length <= 250);
  assert.match(String(parsed.error), /serialize/i);
});

test("structured logger swallows sink write failures during fallback", () => {
  let attempts = 0;
  const logger = createStructuredLogger({
    write: () => {
      attempts += 1;
      throw new Error("sink write failed");
    },
  });

  assert.doesNotThrow(() => {
    logger.debug("mcp_message", { transport: "stdio" });
  });

  assert.equal(attempts, 2);
});

test("structured logger truncates fallback errors", () => {
  const writes: string[] = [];
  const logger = createStructuredLogger({
    write: (chunk: string) => {
      writes.push(chunk);
    },
  });

  const problematic = {
    toJSON() {
      throw new Error("x".repeat(400));
    },
  };

  logger.info("server_start", {
    transport: "http",
    payload: problematic,
  });

  const parsed = JSON.parse(writes[0] ?? "");
  assert.equal(parsed.level, "error");
  assert.equal(parsed.event, "log_fallback");
  assert.ok(String(parsed.error).length <= 250);
  assert.match(String(parsed.error), /<truncated>$/);
});
