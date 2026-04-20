import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { resolveConfig } from "../src/config.ts";
import { MarkdownDbIndexer } from "../src/lib/indexer.ts";
import { CanonicalDocStore } from "../src/repository/canonical-doc-store.ts";
import { DocumentService } from "../src/services/document-service.ts";
import { makeTempRepo } from "./helpers/temp-repo.ts";

const sourceDocPath = fileURLToPath(new URL("./fixtures/source-doc.md", import.meta.url));

test("importDoc preserves source traceability metadata and searchDocs excludes inactive docs", async () => {
  const tempRepo = await makeTempRepo();
  const searchRows: Array<{
    canonicalPath: string;
    metadata: Record<string, unknown>;
  }> = [];

  try {
    const config = resolveConfig({
      MARKDOWN_STORE_REPO: tempRepo.repoRoot,
    });
    const service = new DocumentService(new CanonicalDocStore(config), {
      reindex: async () => undefined,
      search: async () => searchRows,
    });

    const imported = await service.importDoc(
      {
        source_path: sourceDocPath,
        source_repo: "achim/notes",
        source_ref: "refs/heads/main",
        source_commit: "abc123",
      },
      "2026-04-14T18:20:00.000Z"
    );

    assert.equal(imported.metadata.source, "imported");
    assert.equal(imported.metadata.source_repo, "achim/notes");
    assert.equal(imported.metadata.imported_at, "2026-04-14T18:20:00.000Z");
    assert.equal(imported.metadata.source_path, sourceDocPath);

    const inactive = await service.createDoc(
      {
        title: "Inactive Search Result",
        doc_type: "guide",
        tags: ["inactive"],
        content: "# Inactive Search Result\n\nThis also mentions the transfer workflow.",
      },
      "2026-04-14T18:21:00.000Z"
    );
    searchRows.splice(0, searchRows.length, imported, inactive);

    const matches = await service.searchDocs({
      query: "transfer workflow",
    });

    assert.equal(matches.length, 1);
    assert.equal(matches[0]?.metadata.id, imported.metadata.id);
    assert.notEqual(matches[0]?.metadata.id, inactive.metadata.id);
  } finally {
    await tempRepo.removeTempRepo();
  }
});

test("importDoc allows omitted optional provenance fields", async () => {
  const tempRepo = await makeTempRepo();

  try {
    const config = resolveConfig({
      MARKDOWN_STORE_REPO: tempRepo.repoRoot,
    });
    const service = new DocumentService(new CanonicalDocStore(config), {
      reindex: async () => undefined,
      search: async () => [],
    });

    const imported = await service.importDoc(
      {
        source_path: sourceDocPath,
        source_repo: "achim/notes",
      },
      "2026-04-14T18:22:00.000Z"
    );

    assert.equal(imported.metadata.source_repo, "achim/notes");
    assert.equal(imported.metadata.source_ref, undefined);
    assert.equal(imported.metadata.source_commit, undefined);
  } finally {
    await tempRepo.removeTempRepo();
  }
});

test("searchDocs works with the real MarkdownDbIndexer and still hides inactive docs", async () => {
  const tempRepo = await makeTempRepo();
  const config = resolveConfig({
    MARKDOWN_STORE_REPO: tempRepo.repoRoot,
  });
  const indexer = new MarkdownDbIndexer(config);

  try {
    const service = new DocumentService(new CanonicalDocStore(config), indexer);

    const imported = await service.importDoc(
      {
        source_path: sourceDocPath,
        source_repo: "achim/notes",
      },
      "2026-04-14T18:23:00.000Z"
    );

    await service.createDoc(
      {
        title: "Inactive Indexed Result",
        doc_type: "guide",
        tags: ["inactive"],
        content: "# Inactive Indexed Result\n\nThis also mentions the transfer workflow.",
      },
      "2026-04-14T18:24:00.000Z"
    );

    const matches = await service.searchDocs({
      query: "transfer workflow",
    });

    assert.deepEqual(
      matches.map((document) => document.metadata.id),
      [imported.metadata.id]
    );
  } finally {
    const client = await (
      indexer as unknown as {
        getClient: () => Promise<{ _destroyDb: () => void }>;
      }
    ).getClient();
    client._destroyDb();
    await tempRepo.removeTempRepo();
  }
});
