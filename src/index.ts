import { StdioServerTransport } from "@modelcontextprotocol/server";
import { process } from "@modelcontextprotocol/server/_shims";
import { fileURLToPath } from "node:url";

import { resolveConfig } from "./config.ts";
import { startHttpServer } from "./http-server.ts";
import { MarkdownDbIndexer } from "./lib/indexer.ts";
import { createLoggingTransport } from "./lib/logging-transport.ts";
import { createStructuredLogger } from "./lib/structured-logger.ts";
import { CanonicalDocStore } from "./repository/canonical-doc-store.ts";
import { resolveRuntimeConfig } from "./runtime-config.ts";
import { buildServer } from "./server.ts";
import { DocumentService } from "./services/document-service.ts";

export function createRuntimeLogger(stdout: Pick<NodeJS.WriteStream, "write"> = process.stdout) {
  return createStructuredLogger({
    write: (line: string) => {
      stdout.write(line);
    },
  });
}

export async function startStdioRuntime(
  server: { connect: (transport: StdioServerTransport) => Promise<void> },
  options: {
    stdout?: Pick<NodeJS.WriteStream, "write">;
  } = {}
): Promise<void> {
  const logger = createRuntimeLogger(options.stdout);
  const transport = createLoggingTransport(new StdioServerTransport(), logger, "stdio");

  await server.connect(transport as StdioServerTransport);
  logger.info("server_start", {
    transport: "stdio",
  });
}

export async function main() {
  const runtime = resolveRuntimeConfig();
  const config = resolveConfig();
  const service = new DocumentService(new CanonicalDocStore(config), new MarkdownDbIndexer(config));
  const logger = createRuntimeLogger();
  const server = buildServer(service, logger, runtime.transport);

  if (runtime.transport === "http") {
    await startHttpServer(server, runtime, logger);
    return;
  }

  await startStdioRuntime(server);
}

if (isMainModule(import.meta.url)) {
  main().catch((error) => {
    const logger = createRuntimeLogger();
    logger.error("startup_failure", {
      transport: "unknown",
      error,
    });
    process.exit(1);
  });
}

function isMainModule(moduleUrl: string): boolean {
  const entrypoint = process.argv[1];
  return typeof entrypoint === "string" && fileURLToPath(moduleUrl) === entrypoint;
}
