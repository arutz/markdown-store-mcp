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

const noopLogger: StructuredLogger = {
  debug() {},
  info() {},
  error() {},
};

export function buildServer(
  service: DocumentService,
  logger: StructuredLogger = noopLogger,
  transportName: RuntimeTransport = "stdio"
): McpServer {
  const server = new McpServer({
    name: "markdown-store",
    version: "1.0.0",
  });

  const originalRegisterTool = server.registerTool.bind(server);
  server.registerTool = ((name, config, handler) =>
    originalRegisterTool(
      name,
      config,
      wrapToolHandler(name, transportName, logger, handler as never) as never
    )) as typeof server.registerTool;

  registerCreateDocTool(server, service);
  registerDeactivateDocTool(server, service);
  registerDeleteDocTool(server, service);
  registerGetDocTool(server, service);
  registerImportDocTool(server, service);
  registerReactivateDocTool(server, service);
  registerSearchDocsTool(server, service);
  registerUpdateDocTool(server, service);

  return server;
}
