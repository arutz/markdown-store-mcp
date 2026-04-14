import z from "zod";

import { slugifyValue } from "../lib/slug.ts";

const safeSegmentPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function safeSegmentSchema(fieldName: string) {
  return z
    .string()
    .min(1)
    .regex(safeSegmentPattern, {
      message: `Invalid ${fieldName}. Expected a slug-like segment.`,
    })
    .transform((value) => value.toLowerCase());
}

const docIdSchema = safeSegmentSchema("id");
const docTypeSchema = safeSegmentSchema("doc_type");

const provenanceSchema = z.object({
  source_repo: z.string().min(1).optional(),
  source_path: z.string().min(1).optional(),
  source_ref: z.string().min(1).optional(),
  source_commit: z.string().min(1).optional(),
  imported_at: z.string().datetime().optional(),
});

export const docMetadataSchema = z.object({
  id: docIdSchema,
  title: z.string().min(1),
  tags: z.array(z.string()).default([]),
  doc_type: docTypeSchema,
  source: z.enum(["canonical", "imported"]).default("canonical"),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  ...provenanceSchema.shape,
});

export const createDocInputSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1),
  tags: z.array(z.string()).default([]),
  doc_type: docTypeSchema,
  source: z.enum(["canonical", "imported"]).default("canonical"),
  content: z.string().min(1),
});

export type DocMetadata = z.infer<typeof docMetadataSchema>;
export type CreateDocInput = z.infer<typeof createDocInputSchema>;

export interface CanonicalDocument {
  canonicalPath: string;
  metadata: DocMetadata;
  content: string;
}

export function buildCanonicalPath(metadata: Pick<DocMetadata, "id" | "doc_type">): string {
  return `content/${metadata.doc_type}/${metadata.id}.md`;
}

export function isInactive(metadata: Pick<DocMetadata, "tags">): boolean {
  return metadata.tags.includes("inactive");
}

export function normalizeCreateInput(input: CreateDocInput, nowIso: string): CanonicalDocument {
  const parsedInput = createDocInputSchema.parse(input);
  const id = parsedInput.id ? slugifyValue(parsedInput.id) : slugifyValue(parsedInput.title);
  const metadata: DocMetadata = docMetadataSchema.parse({
    id,
    title: parsedInput.title,
    tags: parsedInput.tags,
    doc_type: parsedInput.doc_type,
    source: parsedInput.source,
    created_at: nowIso,
    updated_at: nowIso,
  });

  return {
    canonicalPath: buildCanonicalPath(metadata),
    metadata,
    content: parsedInput.content,
  };
}
