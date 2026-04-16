import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCanonicalPath,
  docMetadataSchema,
  isInactive,
  normalizeCreateInput,
} from "../src/domain/document.ts";

test("normalizeCreateInput derives canonical document metadata", () => {
  const nowIso = "2026-04-14T17:00:00.000Z";
  const normalized = normalizeCreateInput(
    {
      title: "Agent First Markdown Docs",
      doc_type: "spec",
      content: "# Agent First Markdown Docs\n\nHello world.",
      tags: ["agents", "architecture"],
    },
    nowIso
  );

  assert.equal(normalized.metadata.id, "agent-first-markdown-docs");
  assert.equal(normalized.metadata.source, "canonical");
  assert.equal(normalized.metadata.created_at, nowIso);
  assert.equal(normalized.metadata.updated_at, nowIso);
  assert.deepEqual(normalized.metadata.tags, ["agents", "architecture"]);
  assert.equal(
    buildCanonicalPath(normalized.metadata),
    "content/spec/agent-first-markdown-docs.md"
  );
  assert.equal(isInactive(normalized.metadata), false);
});

test("normalizeCreateInput rejects unsafe doc_type segments", () => {
  assert.throws(
    () =>
      normalizeCreateInput(
        {
          title: "Agent First Markdown Docs",
          doc_type: "../outside",
          content: "# Agent First Markdown Docs\n\nHello world.",
          tags: ["agents", "architecture"],
        },
        "2026-04-14T17:00:00.000Z"
      ),
    /invalid doc_type/i
  );
});

test("normalizeCreateInput rejects values that cannot be slugged", () => {
  assert.throws(
    () =>
      normalizeCreateInput(
        {
          id: "!!!",
          title: "!!!",
          doc_type: "spec",
          content: "# !!!\n\nHello world.",
          tags: ["agents", "architecture"],
        },
        "2026-04-14T17:00:00.000Z"
      ),
    /cannot derive a slug/i
  );
});

test("docMetadataSchema rejects unsafe ids", () => {
  assert.throws(
    () =>
      docMetadataSchema.parse({
        id: "../outside",
        title: "Agent First Markdown Docs",
        tags: [],
        doc_type: "spec",
        source: "canonical",
        created_at: "2026-04-14T17:00:00.000Z",
        updated_at: "2026-04-14T17:00:00.000Z",
      }),
    /invalid id/i
  );
});
