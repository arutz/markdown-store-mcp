# Localhost HTTP Transport And Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a localhost-only HTTP runtime that becomes the default process mode, keep `stdio` available behind an explicit flag, and emit structured JSON logs for tool calls and MCP protocol traffic.

**Architecture:** Keep `DocumentService` and tool registration as the shared MCP core, then add a thin runtime layer that parses CLI and env configuration, selects either HTTP or `stdio`, and wires a single structured logger through startup, protocol transport, and tool execution. Use the MCP SDK's `WebStandardStreamableHTTPServerTransport` for the daemon mode and wrap transports plus tool registration instead of duplicating tool logic.

**Tech Stack:** TypeScript ESM, Node.js built-ins (`node:http`, `node:stream`, `node:util`, `node:test`), `@modelcontextprotocol/server`, existing repo scripts (`prettier`, `tsc`, Node test runner)

---

## Concrete Decisions Locked In By This Plan

### Runtime Flags And Environment Variables

Use these runtime knobs:

- CLI `--transport <http|stdio>`
- CLI `--host <hostname>`
- CLI `--port <number>`
- env `MARKDOWN_STORE_TRANSPORT`
- env `MARKDOWN_STORE_HOST`
- env `MARKDOWN_STORE_PORT`

Precedence:

1. CLI flags
2. environment variables
3. defaults

Defaults:

- `transport=http`
- `host=127.0.0.1`
- `port=3000`

### HTTP Endpoint Shape

Expose the MCP endpoint on:

- `http://127.0.0.1:3000/mcp`

The server remains localhost-only in this iteration.

### Log Event Schema

Every JSON log line must contain:

```json
{
  "ts": "2026-04-20T19:30:00.000Z",
  "level": "info",
  "event": "tool_call",
  "transport": "http"
}
```

Additional event-specific fields:

- `tool_call`: `tool_name`, `args`, `outcome`, `duration_ms`
- `mcp_message`: `direction`, `method`, `request_id`, `payload`
- `server_start`: `host`, `port`, `endpoint`
- `server_stop`: `reason`
- `startup_failure`: `error`

### Truncation Policy

Truncate each top-level argument or payload value independently to 250 characters.

Examples:

- short strings remain unchanged
- long strings become `"aaaa...<truncated>"`
- arrays and objects become serialized strings first, then truncated at the top-level field boundary

## Planned File Structure

### Runtime And Logging Files

- Modify: `src/index.ts`
- Modify: `src/server.ts`
- Create: `src/runtime-config.ts`
- Create: `src/http-server.ts`
- Create: `src/lib/structured-logger.ts`
- Create: `src/lib/logging-transport.ts`
- Create: `src/lib/tool-logging.ts`

### Test Files

- Create: `tests/runtime-config.test.ts`
- Create: `tests/structured-logger.test.ts`
- Create: `tests/logging-transport.test.ts`
- Create: `tests/http-runtime.test.ts`

### Documentation Files

- Modify: `README.md`

## Task 1: Add Runtime Config Parsing

**Files:**

- Create: `tests/runtime-config.test.ts`
- Create: `src/runtime-config.ts`

- [ ] **Step 1: Write the failing runtime config tests**

```ts
// tests/runtime-config.test.ts
import assert from "node:assert/strict";
import test from "node:test";

import { resolveRuntimeConfig } from "../src/runtime-config.ts";

test("resolveRuntimeConfig defaults to localhost HTTP", () => {
  const config = resolveRuntimeConfig([], {});

  assert.equal(config.transport, "http");
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 3000);
  assert.equal(config.endpointPath, "/mcp");
});

test("resolveRuntimeConfig lets CLI flags override env", () => {
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
  assert.throws(
    () => resolveRuntimeConfig(["--transport", "tcp"], {}),
    /transport must be "http" or "stdio"/i
  );
});

test("resolveRuntimeConfig rejects invalid port values", () => {
  assert.throws(
    () => resolveRuntimeConfig(["--port", "abc"], {}),
    /port must be a positive integer/i
  );
});

test("resolveRuntimeConfig rejects non-localhost HTTP binding", () => {
  assert.throws(
    () => resolveRuntimeConfig(["--host", "0.0.0.0"], {}),
    /host must be 127\\.0\\.0\\.1 for HTTP mode/i
  );
});
```

- [ ] **Step 2: Run the focused test to confirm it fails**

Run:

```bash
node --test --experimental-strip-types tests/runtime-config.test.ts
```

Expected: FAIL with `Cannot find module '../src/runtime-config.ts'`.

- [ ] **Step 3: Implement runtime config parsing**

```ts
// src/runtime-config.ts
import { parseArgs } from "node:util";

export type RuntimeTransport = "http" | "stdio";

export interface RuntimeConfig {
  transport: RuntimeTransport;
  host: string;
  port: number;
  endpointPath: "/mcp";
}

export function resolveRuntimeConfig(
  argv: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env
): RuntimeConfig {
  const parsed = parseArgs({
    args: argv,
    options: {
      transport: { type: "string" },
      host: { type: "string" },
      port: { type: "string" },
    },
    allowPositionals: false,
  });

  const transportValue = parsed.values.transport ?? env.MARKDOWN_STORE_TRANSPORT ?? "http";
  if (transportValue !== "http" && transportValue !== "stdio") {
    throw new Error('Runtime transport must be "http" or "stdio"');
  }

  const host = parsed.values.host ?? env.MARKDOWN_STORE_HOST ?? "127.0.0.1";
  const rawPort = parsed.values.port ?? env.MARKDOWN_STORE_PORT ?? "3000";
  const port = Number.parseInt(rawPort, 10);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("Runtime port must be a positive integer");
  }

  if (transportValue === "http" && host !== "127.0.0.1") {
    throw new Error("Runtime host must be 127.0.0.1 for HTTP mode");
  }

  return {
    transport: transportValue,
    host,
    port,
    endpointPath: "/mcp",
  };
}
```

- [ ] **Step 4: Run the focused runtime config test and typecheck**

Run:

```bash
node --test --experimental-strip-types tests/runtime-config.test.ts
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/runtime-config.test.ts src/runtime-config.ts
git commit -m "feat: add runtime transport config parsing"
```

## Task 2: Add Structured JSON Logging And Truncation

**Files:**

- Create: `tests/structured-logger.test.ts`
- Create: `src/lib/structured-logger.ts`

- [ ] **Step 1: Write the failing logger tests**

```ts
// tests/structured-logger.test.ts
import assert from "node:assert/strict";
import test from "node:test";

import { createStructuredLogger, truncateTopLevelValues } from "../src/lib/structured-logger.ts";

test("truncateTopLevelValues truncates each top-level field independently", () => {
  const payload = truncateTopLevelValues({
    short: "ok",
    long: "x".repeat(260),
    nested: { title: "Nested", body: "y".repeat(260) },
  });

  assert.equal(payload.short, "ok");
  assert.match(String(payload.long), /<truncated>$/);
  assert.ok(String(payload.long).length <= 250);
  assert.match(String(payload.nested), /<truncated>$/);
  assert.ok(String(payload.nested).length <= 250);
});

test("structured logger writes newline-delimited JSON", () => {
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
  const parsed = JSON.parse(writes[0] ?? "");
  assert.equal(parsed.level, "info");
  assert.equal(parsed.event, "server_start");
  assert.equal(parsed.transport, "http");
  assert.equal(parsed.host, "127.0.0.1");
  assert.equal(parsed.port, 3000);
});

test("structured logger falls back when payload serialization throws", () => {
  const writes: string[] = [];
  const logger = createStructuredLogger({
    write: (chunk: string) => {
      writes.push(chunk);
    },
  });

  const circular: { self?: unknown } = {};
  circular.self = circular;

  logger.debug("mcp_message", {
    transport: "stdio",
    payload: circular,
  });

  const parsed = JSON.parse(writes[0] ?? "");
  assert.equal(parsed.level, "debug");
  assert.equal(parsed.event, "log_fallback");
  assert.match(String(parsed.error), /serialize/i);
});
```

- [ ] **Step 2: Run the logger tests to confirm they fail**

Run:

```bash
node --test --experimental-strip-types tests/structured-logger.test.ts
```

Expected: FAIL with `Cannot find module '../src/lib/structured-logger.ts'`.

- [ ] **Step 3: Implement the logger and truncation helpers**

```ts
// src/lib/structured-logger.ts
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

export function truncateTopLevelValues(
  payload: Record<string, unknown> = {}
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, truncateValue(value)])
  );
}

function truncateValue(value: unknown): unknown {
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

  return truncateString(JSON.stringify(value));
}

function truncateString(value: string): string {
  if (value.length <= MAX_FIELD_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_FIELD_LENGTH - 12)}<truncated>`;
}

export function createStructuredLogger(sink: StructuredLogSink): StructuredLogger {
  return {
    debug: (event, payload) => writeLog(sink, "debug", event, payload),
    info: (event, payload) => writeLog(sink, "info", event, payload),
    error: (event, payload) => writeLog(sink, "error", event, payload),
  };
}

function writeLog(
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
        level,
        event: "log_fallback",
        error: error instanceof Error ? error.message : "Failed to serialize log event",
      })}\n`
    );
  }
}
```

- [ ] **Step 4: Run the logger tests and typecheck**

Run:

```bash
node --test --experimental-strip-types tests/structured-logger.test.ts
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/structured-logger.test.ts src/lib/structured-logger.ts
git commit -m "feat: add structured runtime logger"
```

## Task 3: Add Protocol Logging And Tool Logging Wrappers

**Files:**

- Create: `tests/logging-transport.test.ts`
- Create: `src/lib/logging-transport.ts`
- Create: `src/lib/tool-logging.ts`
- Modify: `src/server.ts`

- [ ] **Step 1: Write the failing transport and tool logging tests**

```ts
// tests/logging-transport.test.ts
import assert from "node:assert/strict";
import test from "node:test";

import { createStructuredLogger } from "../src/lib/structured-logger.ts";
import { createLoggingTransport } from "../src/lib/logging-transport.ts";
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

  const wrapped = createLoggingTransport(innerTransport, logger, "stdio");
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
  });

  const parsed = writes.map((line) => JSON.parse(line));
  assert.equal(parsed[0]?.event, "mcp_message");
  assert.equal(parsed[0]?.direction, "inbound");
  assert.equal(parsed[1]?.direction, "outbound");
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
  assert.match(String(parsed[0]?.args?.content), /<truncated>$/);
  assert.equal(parsed[1]?.event, "tool_call");
  assert.equal(parsed[1]?.outcome, "completed");
});
```

- [ ] **Step 2: Run the focused logging wrapper test to confirm it fails**

Run:

```bash
node --test --experimental-strip-types tests/logging-transport.test.ts
```

Expected: FAIL with missing logging wrapper modules.

- [ ] **Step 3: Implement transport logging, tool logging, and server wiring**

```ts
// src/lib/logging-transport.ts
import type { Transport } from "@modelcontextprotocol/server";

import type { StructuredLogger } from "./structured-logger.ts";

export function createLoggingTransport(
  inner: Transport,
  logger: StructuredLogger,
  transportName: "http" | "stdio"
): Transport {
  const wrapped: Transport = {
    onclose: undefined,
    onerror: undefined,
    onmessage: undefined,
    async start() {
      inner.onclose = () => wrapped.onclose?.();
      inner.onerror = (error) => {
        logger.error("transport_error", {
          transport: transportName,
          error: error.message,
        });
        wrapped.onerror?.(error);
      };
      inner.onmessage = (message, extra) => {
        logger.debug("mcp_message", describeMessage("inbound", transportName, message));
        wrapped.onmessage?.(message, extra);
      };
      await inner.start();
    },
    async send(message, options) {
      logger.debug("mcp_message", describeMessage("outbound", transportName, message));
      return inner.send(message, options);
    },
    async close() {
      await inner.close?.();
    },
  };

  return wrapped;
}

function describeMessage(
  direction: "inbound" | "outbound",
  transport: "http" | "stdio",
  message: unknown
): Record<string, unknown> {
  const record = (message ?? {}) as {
    id?: string | number;
    method?: string;
    params?: unknown;
    result?: unknown;
    error?: unknown;
  };

  return {
    direction,
    transport,
    request_id: record.id ?? null,
    method: record.method ?? null,
    payload: record.params ?? record.result ?? record.error ?? null,
  };
}
```

```ts
// src/lib/tool-logging.ts
import type { ToolCallback } from "@modelcontextprotocol/server";

import type { StructuredLogger } from "./structured-logger.ts";
import { truncateTopLevelValues } from "./structured-logger.ts";

export function wrapToolHandler<Args extends Record<string, unknown> | undefined>(
  toolName: string,
  transportName: "http" | "stdio",
  logger: StructuredLogger,
  handler: ToolCallback<never>
): ToolCallback<never> {
  return async (input: Args, ctx: unknown) => {
    const startedAt = Date.now();
    logger.info("tool_call", {
      transport: transportName,
      tool_name: toolName,
      args: truncateTopLevelValues((input ?? {}) as Record<string, unknown>),
      outcome: "started",
    });

    try {
      const result = await handler(input as never, ctx as never);
      logger.info("tool_call", {
        transport: transportName,
        tool_name: toolName,
        args: truncateTopLevelValues((input ?? {}) as Record<string, unknown>),
        outcome: "completed",
        duration_ms: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      logger.error("tool_call", {
        transport: transportName,
        tool_name: toolName,
        args: truncateTopLevelValues((input ?? {}) as Record<string, unknown>),
        outcome: "failed",
        duration_ms: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Unknown tool failure",
      });
      throw error;
    }
  };
}
```

```ts
// src/server.ts
import { McpServer } from "@modelcontextprotocol/server";

import type { StructuredLogger } from "./lib/structured-logger.ts";
import { wrapToolHandler } from "./lib/tool-logging.ts";
import type { RuntimeTransport } from "./runtime-config.ts";
import type { DocumentService } from "./services/document-service.ts";
import { registerCreateDocTool } from "./tools/create-doc.ts";
import { registerDeactivateDocTool } from "./tools/deactivate-doc.ts";
import { registerDeleteDocTool } from "./tools/delete-doc.ts";
import { registerGetDocTool } from "./tools/get-doc.ts";
import { registerImportDocTool } from "./tools/import-doc.ts";
import { registerReactivateDocTool } from "./tools/reactivate-doc.ts";
import { registerSearchDocsTool } from "./tools/search-docs.ts";
import { registerUpdateDocTool } from "./tools/update-doc.ts";

export function buildServer(
  service: DocumentService,
  logger: StructuredLogger,
  transportName: RuntimeTransport
): McpServer {
  const server = new McpServer({
    name: "markdown-store",
    version: "1.0.0",
  });

  const registrar = {
    registerTool(name: string, config: unknown, handler: (...args: unknown[]) => Promise<unknown>) {
      return server.registerTool(
        name,
        config as never,
        wrapToolHandler(name, transportName, logger, handler as never)
      );
    },
  } as McpServer;

  registerCreateDocTool(registrar, service);
  registerDeactivateDocTool(registrar, service);
  registerDeleteDocTool(registrar, service);
  registerGetDocTool(registrar, service);
  registerImportDocTool(registrar, service);
  registerReactivateDocTool(registrar, service);
  registerSearchDocsTool(registrar, service);
  registerUpdateDocTool(registrar, service);

  return server;
}
```

- [ ] **Step 4: Run the logging wrapper tests and typecheck**

Run:

```bash
node --test --experimental-strip-types tests/logging-transport.test.ts
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/logging-transport.test.ts src/lib/logging-transport.ts src/lib/tool-logging.ts src/server.ts
git commit -m "feat: add protocol and tool logging wrappers"
```

## Task 4: Add Localhost HTTP Runtime And Make It The Default

**Files:**

- Create: `tests/http-runtime.test.ts`
- Create: `src/http-server.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write the failing HTTP runtime smoke test**

```ts
// tests/http-runtime.test.ts
import assert from "node:assert/strict";
import test from "node:test";

import { resolveConfig } from "../src/config.ts";
import { startHttpServer } from "../src/http-server.ts";
import { createStructuredLogger } from "../src/lib/structured-logger.ts";
import { MarkdownDbIndexer } from "../src/lib/indexer.ts";
import { CanonicalDocStore } from "../src/repository/canonical-doc-store.ts";
import { buildServer } from "../src/server.ts";
import { DocumentService } from "../src/services/document-service.ts";
import { makeTempRepo } from "./helpers/temp-repo.ts";

test("HTTP runtime binds to localhost and serves MCP on /mcp", async () => {
  const tempRepo = await makeTempRepo();
  const writes: string[] = [];

  try {
    const logger = createStructuredLogger({
      write: (chunk: string) => {
        writes.push(chunk);
      },
    });
    const config = resolveConfig({
      MARKDOWN_STORE_REPO: tempRepo.repoRoot,
    });
    const service = new DocumentService(
      new CanonicalDocStore(config),
      new MarkdownDbIndexer(config)
    );
    const mcpServer = buildServer(service, logger, "http");

    const runtime = await startHttpServer(
      mcpServer,
      {
        transport: "http",
        host: "127.0.0.1",
        port: 0,
        endpointPath: "/mcp",
      },
      logger
    );

    const initializeResponse = await fetch(`http://127.0.0.1:${runtime.port}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
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
      }),
    });

    assert.equal(initializeResponse.status, 200);
    assert.ok(initializeResponse.headers.get("mcp-session-id"));
    assert.equal(
      writes.some((line) => JSON.parse(line).event === "server_start"),
      true
    );

    await runtime.close();
  } finally {
    await tempRepo.removeTempRepo();
  }
});
```

- [ ] **Step 2: Run the focused HTTP runtime test to confirm it fails**

Run:

```bash
node --test --experimental-strip-types tests/http-runtime.test.ts
```

Expected: FAIL with `Cannot find module '../src/http-server.ts'`.

- [ ] **Step 3: Implement the HTTP server bootstrap and runtime selection**

```ts
// src/http-server.ts
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import type { McpServer } from "@modelcontextprotocol/server";

import type { StructuredLogger } from "./lib/structured-logger.ts";
import { createLoggingTransport } from "./lib/logging-transport.ts";
import type { RuntimeConfig } from "./runtime-config.ts";

export interface StartedHttpServer {
  server: ReturnType<typeof createServer>;
  port: number;
  close: () => Promise<void>;
}

export async function startHttpServer(
  server: McpServer,
  runtime: RuntimeConfig,
  logger: StructuredLogger
): Promise<StartedHttpServer> {
  const rawHttpTransport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });
  const httpTransport = createLoggingTransport(rawHttpTransport, logger, "http");

  await server.connect(httpTransport);

  const nodeServer = createServer(async (req, res) => {
    if ((req.url ?? "") !== runtime.endpointPath) {
      res.statusCode = 404;
      res.end("Not Found");
      return;
    }

    const request = await toWebRequest(req, runtime);
    const response = await rawHttpTransport.handleRequest(request);
    await writeNodeResponse(res, response);
  });

  nodeServer.listen(runtime.port, runtime.host);
  await new Promise<void>((resolve, reject) => {
    nodeServer.once("error", reject);
    nodeServer.once("listening", () => resolve());
  });
  const address = nodeServer.address();
  const port = typeof address === "object" && address !== null ? address.port : runtime.port;
  logger.info("server_start", {
    transport: "http",
    host: runtime.host,
    port,
    endpoint: `http://${runtime.host}:${port}${runtime.endpointPath}`,
  });

  return {
    server: nodeServer,
    port,
    close: () =>
      new Promise((resolve, reject) => {
        nodeServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          logger.info("server_stop", {
            transport: "http",
            reason: "close_called",
          });
          resolve();
        });
      }),
  };
}

async function toWebRequest(req: IncomingMessage, runtime: RuntimeConfig): Promise<Request> {
  const body =
    req.method === "GET" || req.method === "DELETE" ? undefined : await readIncomingMessage(req);
  const localPort = req.socket.localPort ?? runtime.port;

  return new Request(`http://${runtime.host}:${localPort}${req.url ?? runtime.endpointPath}`, {
    method: req.method,
    headers: req.headers as HeadersInit,
    body,
    duplex: "half",
  });
}

async function readIncomingMessage(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function writeNodeResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (!response.body) {
    res.end();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    Readable.fromWeb(response.body as never)
      .on("error", reject)
      .pipe(res)
      .on("finish", () => resolve());
  });
}
```

```ts
// src/index.ts
import { StdioServerTransport } from "@modelcontextprotocol/server";
import { process } from "@modelcontextprotocol/server/_shims";

import { resolveConfig } from "./config.ts";
import { startHttpServer } from "./http-server.ts";
import { createLoggingTransport } from "./lib/logging-transport.ts";
import { createStructuredLogger } from "./lib/structured-logger.ts";
import { MarkdownDbIndexer } from "./lib/indexer.ts";
import { CanonicalDocStore } from "./repository/canonical-doc-store.ts";
import { resolveRuntimeConfig } from "./runtime-config.ts";
import { buildServer } from "./server.ts";
import { DocumentService } from "./services/document-service.ts";

async function main() {
  const runtime = resolveRuntimeConfig();
  const logger = createStructuredLogger({
    write: (line: string) => {
      process.stdout.write(line);
    },
  });
  const config = resolveConfig();
  const service = new DocumentService(new CanonicalDocStore(config), new MarkdownDbIndexer(config));
  const server = buildServer(service, logger, runtime.transport);

  if (runtime.transport === "http") {
    await startHttpServer(server, runtime, logger);
    return;
  }

  const transport = createLoggingTransport(new StdioServerTransport(), logger, "stdio");
  await server.connect(transport);
  logger.info("server_start", {
    transport: "stdio",
  });
}

main().catch((error) => {
  const logger = createStructuredLogger({
    write: (line: string) => {
      process.stdout.write(line);
    },
  });
  logger.error("startup_failure", {
    transport: "unknown",
    error: error instanceof Error ? error.message : "Fatal startup error",
  });
  process.exit(1);
});
```

- [ ] **Step 4: Run the HTTP smoke test, then the whole suite**

Run:

```bash
node --test --experimental-strip-types tests/http-runtime.test.ts
npm test
npm run typecheck
```

Expected: all commands PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/http-runtime.test.ts src/http-server.ts src/index.ts
git commit -m "feat: default to localhost HTTP runtime"
```

## Task 5: Update README And Run Full Verification

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Update the README to document the new runtime model**

````md
# Markdown Store MCP

An MCP server for agent-first canonical Markdown documents stored in a separate repository.

## Required environment

- `MARKDOWN_STORE_REPO`: absolute path to the canonical docs repository
- `MARKDOWN_STORE_CONTENT_DIR` (optional): defaults to `content`
- `MARKDOWN_STORE_DB_PATH` (optional): defaults to `.markdown-store/markdown.db`
- `MARKDOWN_STORE_TRANSPORT` (optional): `http` or `stdio`, defaults to `http`
- `MARKDOWN_STORE_HOST` (optional): defaults to `127.0.0.1`
- `MARKDOWN_STORE_PORT` (optional): defaults to `3000`

## Runtime modes

Default localhost daemon:

```bash
MARKDOWN_STORE_REPO=/absolute/path/to/docs-repo node build/index.js
```
````

Explicit stdio mode:

```bash
MARKDOWN_STORE_REPO=/absolute/path/to/docs-repo node build/index.js --transport stdio
```

Local HTTP endpoint:

- `http://127.0.0.1:3000/mcp`

## Logging

The server emits newline-delimited JSON to stdout for:

- startup and shutdown lifecycle events
- MCP protocol traffic at debug level
- tool-call monitoring with truncated top-level argument values

Each logged top-level argument or payload field is truncated to 250 characters.

## MCP tools

- `create_doc`
- `get_doc`
- `import_doc`
- `search_docs`
- `update_doc`
- `deactivate_doc`
- `reactivate_doc`
- `delete_doc`

````

- [ ] **Step 2: Format the repo and run final verification**

Run:

```bash
npm run prettier:format
npm test
npm run typecheck
npm run build
````

Expected: all commands PASS.

- [ ] **Step 3: Commit**

```bash
git add README.md src/index.ts src/server.ts src/runtime-config.ts src/http-server.ts src/lib/structured-logger.ts src/lib/logging-transport.ts src/lib/tool-logging.ts tests/runtime-config.test.ts tests/structured-logger.test.ts tests/logging-transport.test.ts tests/http-runtime.test.ts
git commit -m "feat: add localhost HTTP runtime and structured logs"
```

## Spec Coverage Check

- Default localhost HTTP daemon: covered by Tasks 1 and 4
- Explicit `stdio` fallback: covered by Tasks 1 and 4
- Shared MCP core across transports: covered by Task 3 server wiring and Task 4 runtime bootstrap
- Structured JSON stdout logging: covered by Task 2
- Tool-call monitoring with truncated arguments: covered by Task 3
- Debug logs for MCP protocol traffic: covered by Task 3
- Startup failure and lifecycle logging: covered by Tasks 2 and 4
- README/runtime documentation: covered by Task 5

## Placeholder Scan

- No `TODO`, `TBD`, or deferred implementation markers remain in the task list.
- Every code-producing step includes a concrete file path and code block.
- Every validation step includes an exact command and expected result.

## Type Consistency Check

- Runtime transport stays `http | stdio` in every task.
- The HTTP endpoint stays `/mcp` in runtime config, bootstrap, tests, and README.
- Structured log records always use `ts`, `level`, `event`, and `transport` as the common fields.
- Tool logging truncation stays “top-level values only, 250 chars each” across tests and implementation.
