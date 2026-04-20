import type { McpServer } from "@modelcontextprotocol/server";
import z from "zod";

import type { DocumentService } from "../services/document-service.ts";

const searchDocsToolSchema = z.object({
  query: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).optional(),
  doc_type: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
});

export function registerSearchDocsTool(server: McpServer, service: DocumentService): void {
  server.registerTool(
    "search_docs",
    {
      title: "Search Documents",
      description: "Search active canonical documents by content and metadata",
      inputSchema: searchDocsToolSchema,
    },
    async (input) => {
      const parsed = searchDocsToolSchema.parse(input);
      const results = await service.searchDocs(parsed);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              results.map((document) => ({
                id: document.metadata.id,
                canonical_path: document.canonicalPath,
                title: document.metadata.title,
                tags: document.metadata.tags,
              })),
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
