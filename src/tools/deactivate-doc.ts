import type { McpServer } from "@modelcontextprotocol/server";
import z from "zod";

import type { DocumentService } from "../services/document-service.ts";

const deactivateDocToolSchema = z.object({
  identifier: z.string().min(1),
});

export function registerDeactivateDocTool(server: McpServer, service: DocumentService): void {
  server.registerTool(
    "deactivate_doc",
    {
      title: "Deactivate Document",
      description: "Mark a canonical document inactive without deleting it",
      inputSchema: deactivateDocToolSchema,
    },
    async (input) => {
      const result = await service.deactivateDoc(deactivateDocToolSchema.parse(input).identifier);

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
