import { StdioServerTransport } from "@modelcontextprotocol/server";
import { process } from "@modelcontextprotocol/server/_shims";
import { fileURLToPath } from "node:url";

import { resolveConfig } from "./config.ts";
import { MarkdownDbIndexer } from "./lib/indexer.ts";
import { createLoggingTransport } from "./lib/logging-transport.ts";
import { createStructuredLogger } from "./lib/structured-logger.ts";
import { CanonicalDocStore } from "./repository/canonical-doc-store.ts";
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
  const config = resolveConfig();
  const service = new DocumentService(new CanonicalDocStore(config), new MarkdownDbIndexer(config));
  const logger = createRuntimeLogger();
  const server = buildServer(service, logger, "stdio");

  await startStdioRuntime(server);
}

if (isMainModule(import.meta.url)) {
  main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
  });
}

function isMainModule(moduleUrl: string): boolean {
  const entrypoint = process.argv[1];
  return typeof entrypoint === "string" && fileURLToPath(moduleUrl) === entrypoint;
}
