import assert from "node:assert/strict";
import { createServer } from "node:http";
import net from "node:net";
import test from "node:test";

import { once } from "node:events";

import { resolveConfig } from "../src/config.ts";
import { startHttpServer, writeNodeResponse } from "../src/http-server.ts";
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

test("HTTP runtime cleans up the connected MCP server when listen fails", async () => {
  const blocker = createServer((_, res) => {
    res.statusCode = 204;
    res.end();
  });
  await new Promise<void>((resolve, reject) => {
    blocker.once("error", reject);
    blocker.listen(0, "127.0.0.1", () => resolve());
  });

  const blockerAddress = blocker.address();
  const port =
    typeof blockerAddress === "object" && blockerAddress !== null ? blockerAddress.port : 0;
  const writes: string[] = [];
  const fakeServer = {
    closeCalls: 0,
    transportCloseCalls: 0,
    async connect(transport: { close: () => Promise<void> }) {
      const originalClose = transport.close.bind(transport);
      transport.close = async () => {
        this.transportCloseCalls += 1;
        await originalClose();
      };
    },
    async close() {
      this.closeCalls += 1;
    },
  };
  const logger = createStructuredLogger({
    write: (chunk: string) => {
      writes.push(chunk);
    },
  });

  try {
    await assert.rejects(
      startHttpServer(
        fakeServer as never,
        {
          transport: "http",
          host: "127.0.0.1",
          port,
          endpointPath: "/mcp",
        },
        logger
      ),
      /EADDRINUSE/i
    );

    assert.equal(fakeServer.closeCalls, 1);
    assert.equal(fakeServer.transportCloseCalls, 1);
    assert.equal(
      writes.some((line) => JSON.parse(line).event === "server_start"),
      false
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      blocker.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});

test("writeNodeResponse settles and tears down the readable when the client disconnects", async () => {
  let responseSettled = false;
  let streamCancelled = false;
  const server = createServer((_, res) => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("hello"));
        },
        cancel() {
          streamCancelled = true;
        },
      }),
      {
        status: 200,
        headers: {
          "content-type": "text/plain",
        },
      }
    );

    void writeNodeResponse(res, response).then(() => {
      responseSettled = true;
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  const socket = net.createConnection({
    host: "127.0.0.1",
    port,
  });

  try {
    socket.write("GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n");
    await once(socket, "data");
    socket.destroy();

    await waitFor(() => responseSettled);
    await waitFor(() => streamCancelled);
  } finally {
    socket.destroy();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});

test("HTTP runtime always closes the listener even when MCP shutdown fails", async () => {
  const logger = createStructuredLogger({
    write: () => {},
  });
  const fakeServer = {
    async connect() {},
    async close() {
      throw new Error("shutdown failed");
    },
  };
  const runtime = await startHttpServer(
    fakeServer as never,
    {
      transport: "http",
      host: "127.0.0.1",
      port: 0,
      endpointPath: "/mcp",
    },
    logger
  );

  await assert.rejects(runtime.close(), /shutdown failed/);

  const reboundServer = createServer((_, res) => {
    res.statusCode = 204;
    res.end();
  });

  try {
    await new Promise<void>((resolve, reject) => {
      reboundServer.once("error", reject);
      reboundServer.listen(runtime.port, "127.0.0.1", () => resolve());
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      reboundServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();

  while (!predicate()) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
