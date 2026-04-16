import matter from "gray-matter";

import { type CanonicalDocument, docMetadataSchema } from "../domain/document.ts";

export interface ParsedFrontmatter<
  TMetadata extends Record<string, unknown> = Record<string, unknown>,
> {
  metadata: TMetadata;
  content: string;
}

export function serializeFrontmatter(metadata: Record<string, unknown>, content: string): string {
  return matter.stringify(content, metadata);
}

export function parseFrontmatter(source: string, canonicalPath: string): CanonicalDocument {
  const parsed = matter(source);

  return {
    canonicalPath,
    metadata: docMetadataSchema.parse(parsed.data),
    content: parsed.content.trimEnd(),
  };
}
