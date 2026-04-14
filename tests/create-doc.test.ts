import assert from "node:assert/strict";
import test from "node:test";

import { resolveConfig } from "../src/config.ts";
import { CanonicalDocStore } from "../src/repository/canonical-doc-store.ts";
import { DocumentService } from "../src/services/document-service.ts";
import { makeTempRepo } from "./helpers/temp-repo.ts";

test("createDoc writes the document and triggers a reindex", async () => {
  const tempRepo = await makeTempRepo();
  const reindexCalls: string[] = [];

  try {
    const config = resolveConfig({
      MARKDOWN_STORE_REPO: tempRepo.repoRoot,
    });
    const service = new DocumentService(new CanonicalDocStore(config), {
      reindex: async () => {
        reindexCalls.push("reindex");
      },
    });

    const created = await service.createDoc(
      {
        title: "Create Doc MVP",
        doc_type: "spec",
        tags: ["mvp"],
        content: "# Create Doc MVP",
      },
      "2026-04-14T18:10:00.000Z"
    );

    assert.equal(created.canonicalPath, "content/spec/create-doc-mvp.md");
    assert.equal(created.metadata.id, "create-doc-mvp");
    assert.equal(reindexCalls.length, 1);

    const loaded = await service.getDoc("create-doc-mvp", { includeInactive: true });
    assert.equal(loaded?.content, "# Create Doc MVP");
  } finally {
    await tempRepo.removeTempRepo();
  }
});
