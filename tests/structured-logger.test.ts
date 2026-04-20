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
  assert.match(String(parsed.error), /serialize/i);
});
