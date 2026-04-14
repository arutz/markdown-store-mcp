import { StdioServerTransport } from "@modelcontextprotocol/server";
import { process } from "@modelcontextprotocol/server/_shims";

import { resolveConfig } from "./config.ts";
import { MarkdownDbIndexer } from "./lib/indexer.ts";
import { CanonicalDocStore } from "./repository/canonical-doc-store.ts";
import { buildServer } from "./server.ts";
import { DocumentService } from "./services/document-service.ts";

async function main() {
  const config = resolveConfig();
  const service = new DocumentService(new CanonicalDocStore(config), new MarkdownDbIndexer(config));
  const server = buildServer(service);
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error("Markdown Store MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
