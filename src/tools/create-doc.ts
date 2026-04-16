import type { McpServer } from "@modelcontextprotocol/server";
import z from "zod";

import type { DocumentService } from "../services/document-service.ts";

const createDocToolSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1),
  tags: z.array(z.string()).default([]),
  doc_type: z.string().min(1),
  content: z.string().min(1),
});

export function registerCreateDocTool(server: McpServer, service: DocumentService): void {
  server.registerTool(
    "create_doc",
    {
      title: "Create Document",
      description: "Create a new canonical markdown document in the configured repository",
      inputSchema: createDocToolSchema,
    },
    async (input) => {
      try {
        const parsed = createDocToolSchema.parse(input);
        const created = await service.createDoc({
          ...parsed,
          source: "canonical",
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  id: created.metadata.id,
                  canonical_path: created.canonicalPath,
                  metadata: created.metadata,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create document";

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: message,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    }
  );
}
