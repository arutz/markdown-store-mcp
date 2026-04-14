import { McpServer } from "@modelcontextprotocol/server";

import type { DocumentService } from "./services/document-service.ts";
import { registerCreateDocTool } from "./tools/create-doc.ts";

export function buildServer(service: DocumentService): McpServer {
  const server = new McpServer({
    name: "markdown-store",
    version: "1.0.0",
  });

  registerCreateDocTool(server, service);

  return server;
}
