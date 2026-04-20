import { McpServer } from "@modelcontextprotocol/server";

import type { DocumentService } from "./services/document-service.ts";
import { registerCreateDocTool } from "./tools/create-doc.ts";
import { registerDeactivateDocTool } from "./tools/deactivate-doc.ts";
import { registerDeleteDocTool } from "./tools/delete-doc.ts";
import { registerGetDocTool } from "./tools/get-doc.ts";
import { registerImportDocTool } from "./tools/import-doc.ts";
import { registerReactivateDocTool } from "./tools/reactivate-doc.ts";
import { registerSearchDocsTool } from "./tools/search-docs.ts";
import { registerUpdateDocTool } from "./tools/update-doc.ts";

export function buildServer(service: DocumentService): McpServer {
  const server = new McpServer({
    name: "markdown-store",
    version: "1.0.0",
  });

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
