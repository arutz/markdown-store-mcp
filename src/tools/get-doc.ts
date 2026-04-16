import type { McpServer } from "@modelcontextprotocol/server";
import z from "zod";

import type { DocumentService } from "../services/document-service.ts";

const getDocToolSchema = z.object({
  identifier: z.string().min(1),
  include_inactive: z.boolean().default(false),
});

export function registerGetDocTool(server: McpServer, service: DocumentService): void {
  server.registerTool(
    "get_doc",
    {
      title: "Get Document",
      description: "Read an active canonical markdown document by id or canonical path",
      inputSchema: getDocToolSchema,
    },
    async (input) => {
      const parsed = getDocToolSchema.parse(input);
      const document = await service.getDoc(parsed.identifier, {
        includeInactive: parsed.include_inactive,
      });

      if (!document) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: "Document not found",
                  identifier: parsed.identifier,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: document.metadata.id,
                canonical_path: document.canonicalPath,
                metadata: document.metadata,
                content: document.content,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
