import type { McpServer } from "@modelcontextprotocol/server";
import z from "zod";

import type { DocumentService } from "../services/document-service.ts";

const reactivateDocToolSchema = z.object({
  identifier: z.string().min(1),
});

export function registerReactivateDocTool(server: McpServer, service: DocumentService): void {
  server.registerTool(
    "reactivate_doc",
    {
      title: "Reactivate Document",
      description: "Remove the inactive marker from a canonical document",
      inputSchema: reactivateDocToolSchema,
    },
    async (input) => {
      const result = await service.reactivateDoc(reactivateDocToolSchema.parse(input).identifier);

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
