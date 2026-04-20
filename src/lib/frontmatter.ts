import matter from "gray-matter";

import { type CanonicalDocument, docMetadataSchema } from "../domain/document.ts";

export interface ParsedFrontmatter<
  TMetadata extends Record<string, unknown> = Record<string, unknown>,
> {
  metadata: TMetadata;
  content: string;
}

export function serializeFrontmatter(metadata: Record<string, unknown>, content: string): string {
  return matter.stringify(content, withoutUndefinedValues(metadata));
}

export function parseFrontmatter(source: string, canonicalPath: string): CanonicalDocument {
  const parsed = matter(source);

  return {
    canonicalPath,
    metadata: docMetadataSchema.parse(parsed.data),
    content: parsed.content.trimEnd(),
  };
}

function withoutUndefinedValues(metadata: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== undefined));
}
