import type { McpServer } from "@modelcontextprotocol/server";
import z from "zod";

import type { DocumentService } from "../services/document-service.ts";

const importDocToolSchema = z.object({
  source_path: z.string().min(1),
  source_repo: z.string().min(1).optional(),
  source_ref: z.string().min(1).optional(),
  source_commit: z.string().min(1).optional(),
});

export function registerImportDocTool(server: McpServer, service: DocumentService): void {
  server.registerTool(
    "import_doc",
    {
      title: "Import Document",
      description:
        "Import an existing markdown file into the canonical repository without deleting the source",
      inputSchema: importDocToolSchema,
    },
    async (input) => {
      const parsed = importDocToolSchema.parse(input);
      const imported = await service.importDoc(parsed);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: imported.metadata.id,
                canonical_path: imported.canonicalPath,
                metadata: imported.metadata,
                warnings: [],
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
