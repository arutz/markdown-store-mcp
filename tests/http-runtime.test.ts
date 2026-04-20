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
  let runtime:
    | {
        close: () => Promise<void>;
        port: number;
      }
    | undefined;
  let initializeResponse: Response | undefined;

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
    const server = buildServer(service, logger, "http");

    runtime = await startHttpServer(
      server,
      {
        transport: "http",
        host: "127.0.0.1",
        port: 0,
        endpointPath: "/mcp",
      },
      logger
    );

    initializeResponse = await fetch(`http://127.0.0.1:${runtime.port}/mcp`, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
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
      writes.some((line) => {
        const parsed = JSON.parse(line);
        return (
          parsed.event === "server_start" &&
          parsed.transport === "http" &&
          parsed.host === "127.0.0.1" &&
          parsed.endpoint === `http://127.0.0.1:${runtime?.port}/mcp`
        );
      }),
      true
    );
  } finally {
    await initializeResponse?.body?.cancel();
    await runtime?.close();
    assert.equal(
      writes.some((line) => {
        const parsed = JSON.parse(line);
        return parsed.event === "server_stop" && parsed.transport === "http";
      }),
      true
    );
    await tempRepo.removeTempRepo();
  }
});
