import { createServer, type IncomingMessage, type Server as NodeHttpServer } from "node:http";
import { Readable } from "node:stream";

import { McpServer, WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";

import { createLoggingTransport } from "./lib/logging-transport.ts";
import type { StructuredLogger } from "./lib/structured-logger.ts";
import type { RuntimeConfig } from "./runtime-config.ts";

export interface StartedHttpServer {
  close: () => Promise<void>;
  port: number;
  server: NodeHttpServer;
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
    try {
      if (!matchesEndpoint(req, runtime)) {
        res.statusCode = 404;
        res.end("Not Found");
        return;
      }

      const request = await toWebRequest(req, runtime);
      const response = await rawHttpTransport.handleRequest(request);
      await writeNodeResponse(res, response);
    } catch (error) {
      logger.error("transport_error", {
        transport: "http",
        phase: "request_handler",
        error,
      });

      if (!res.headersSent) {
        res.statusCode = 500;
      }

      res.end();
    }
  });

  try {
    await listen(nodeServer, runtime);
  } catch (error) {
    await cleanupFailedStartup(server, httpTransport, nodeServer);
    throw error;
  }

  const port = resolveListeningPort(nodeServer, runtime.port);
  logger.info("server_start", {
    transport: "http",
    host: runtime.host,
    port,
    endpoint: `http://${runtime.host}:${port}${runtime.endpointPath}`,
  });

  return {
    server: nodeServer,
    port,
    close: async () => {
      const [serverCloseResult, listenerCloseResult] = await Promise.allSettled([
        server.close(),
        nodeServer.listening ? closeNodeServer(nodeServer) : Promise.resolve(),
      ]);

      if (serverCloseResult.status === "rejected") {
        throw serverCloseResult.reason;
      }

      if (listenerCloseResult.status === "rejected") {
        throw listenerCloseResult.reason;
      }

      logger.info("server_stop", {
        transport: "http",
        reason: "close_called",
      });
    },
  };
}

function matchesEndpoint(req: IncomingMessage, runtime: RuntimeConfig): boolean {
  const localPort = req.socket.localPort ?? runtime.port ?? 80;
  const requestPath = new URL(
    req.url ?? runtime.endpointPath,
    `http://${runtime.host}:${localPort}`
  ).pathname;

  return requestPath === runtime.endpointPath;
}

async function toWebRequest(req: IncomingMessage, runtime: RuntimeConfig): Promise<Request> {
  const localPort = req.socket.localPort ?? runtime.port;
  const body = shouldReadBody(req.method) ? await readIncomingMessage(req) : undefined;
  const requestBody = body ? new Uint8Array(body) : undefined;
  const requestInit: RequestInit & {
    duplex?: "half";
  } = {
    method: req.method,
    headers: toHeaders(req),
    body: requestBody,
    duplex: requestBody ? "half" : undefined,
  };

  return new Request(
    `http://${runtime.host}:${localPort}${req.url ?? runtime.endpointPath}`,
    requestInit
  );
}

function shouldReadBody(method: string | undefined): boolean {
  return method !== "GET" && method !== "HEAD" && method !== "DELETE";
}

async function readIncomingMessage(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function toHeaders(req: IncomingMessage): Headers {
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        headers.append(key, entry);
      }
      continue;
    }

    if (typeof value === "string") {
      headers.set(key, value);
    }
  }

  return headers;
}

export async function writeNodeResponse(
  res: import("node:http").ServerResponse,
  response: Response
): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (!response.body) {
    res.end();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const readable = Readable.fromWeb(response.body as never);
    let settled = false;

    const cleanup = () => {
      readable.off("error", handleError);
      res.off("error", handleError);
      res.off("finish", settleWithResolve);
      res.off("close", handleClose);
    };
    const settleWithResolve = () => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve();
    };
    const settleWithReject = (error: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      reject(error);
    };
    const handleClose = () => {
      if (settled) {
        return;
      }

      readable.destroy();
      settleWithResolve();
    };
    const handleError = (error: Error) => {
      readable.destroy();
      settleWithReject(error);
    };

    readable.on("error", handleError);
    res.on("error", handleError);
    res.on("finish", settleWithResolve);
    res.on("close", handleClose);
    readable.pipe(res);
  });
}

async function listen(server: NodeHttpServer, runtime: RuntimeConfig): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(runtime.port, runtime.host);
  });
}

function resolveListeningPort(server: NodeHttpServer, fallbackPort: number): number {
  const address = server.address();

  return typeof address === "object" && address !== null ? address.port : fallbackPort;
}

async function closeNodeServer(server: NodeHttpServer): Promise<void> {
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

async function cleanupFailedStartup(
  server: Pick<McpServer, "close">,
  transport: {
    close: () => Promise<void>;
  },
  nodeServer: NodeHttpServer
): Promise<void> {
  await Promise.allSettled([
    server.close(),
    transport.close(),
    nodeServer.listening ? closeNodeServer(nodeServer) : Promise.resolve(),
  ]);
}
