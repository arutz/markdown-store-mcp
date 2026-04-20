import type { McpServer } from "@modelcontextprotocol/server";
import z from "zod";

import type { DocumentService } from "../services/document-service.ts";

const deleteDocToolSchema = z.object({
  identifier: z.string().min(1),
});

export function registerDeleteDocTool(server: McpServer, service: DocumentService): void {
  server.registerTool(
    "delete_doc",
    {
      title: "Delete Document",
      description: "Permanently remove a canonical document from the configured repository",
      inputSchema: deleteDocToolSchema,
    },
    async (input) => {
      const result = await service.deleteDoc(deleteDocToolSchema.parse(input).identifier);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );
}
