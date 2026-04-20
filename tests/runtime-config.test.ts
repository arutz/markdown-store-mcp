import assert from "node:assert/strict";
import test from "node:test";

import { resolveRuntimeConfig } from "../src/runtime-config.ts";

test("resolveRuntimeConfig uses the documented defaults", () => {
  const config = resolveRuntimeConfig([], {});

  assert.equal(config.transport, "http");
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 3000);
  assert.equal(config.endpointPath, "/mcp");
});

test("resolveRuntimeConfig gives CLI flags precedence over env vars", () => {
  const config = resolveRuntimeConfig(
    ["--transport", "stdio", "--host", "127.0.0.1", "--port", "4100"],
    {
      MARKDOWN_STORE_TRANSPORT: "http",
      MARKDOWN_STORE_HOST: "0.0.0.0",
      MARKDOWN_STORE_PORT: "3000",
    }
  );

  assert.equal(config.transport, "stdio");
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 4100);
});

test("resolveRuntimeConfig rejects unsupported transports", () => {
  assert.throws(() => resolveRuntimeConfig(["--transport", "tcp"], {}), /transport/i);
});

test("resolveRuntimeConfig rejects invalid port values", () => {
  assert.throws(() => resolveRuntimeConfig(["--port", "abc"], {}), /port/i);
});

test("resolveRuntimeConfig rejects non-localhost HTTP binding", () => {
  assert.throws(() => resolveRuntimeConfig(["--host", "0.0.0.0"], {}), /127\.0\.0\.1/i);
});
