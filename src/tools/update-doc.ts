import type { McpServer } from "@modelcontextprotocol/server";
import z from "zod";

import type { DocumentService } from "../services/document-service.ts";

const updateDocToolSchema = z.object({
  identifier: z.string().min(1),
  title: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).optional(),
  content: z.string().min(1).optional(),
});

export function registerUpdateDocTool(server: McpServer, service: DocumentService): void {
  server.registerTool(
    "update_doc",
    {
      title: "Update Document",
      description: "Update canonical markdown content and metadata",
      inputSchema: updateDocToolSchema,
    },
    async (input) => {
      const parsed = updateDocToolSchema.parse(input);
      const updated = await service.updateDoc(parsed.identifier, {
        title: parsed.title,
        tags: parsed.tags,
        content: parsed.content,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(updated, null, 2),
          },
        ],
      };
    }
  );
}
