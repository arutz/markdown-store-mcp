import assert from "node:assert/strict";
import test from "node:test";

import { resolveConfig } from "../src/config.ts";
import { CanonicalDocStore } from "../src/repository/canonical-doc-store.ts";
import { DocumentService } from "../src/services/document-service.ts";
import { makeTempRepo } from "./helpers/temp-repo.ts";

test("update, deactivate, reactivate, and delete obey canonical lifecycle rules", async () => {
  const tempRepo = await makeTempRepo();

  try {
    const config = resolveConfig({
      MARKDOWN_STORE_REPO: tempRepo.repoRoot,
    });
    const service = new DocumentService(new CanonicalDocStore(config), {
      reindex: async () => undefined,
      search: async () => [],
    });

    await service.createDoc(
      {
        title: "Lifecycle Doc",
        doc_type: "guide",
        tags: ["lifecycle"],
        content: "# Lifecycle Doc",
      },
      "2026-04-14T18:30:00.000Z"
    );

    const updated = await service.updateDoc(
      "lifecycle-doc",
      {
        content: "# Lifecycle Doc\n\nUpdated body",
        tags: ["lifecycle", "updated"],
      },
      "2026-04-14T18:31:00.000Z"
    );
    assert.deepEqual(updated.metadata.tags, ["lifecycle", "updated"]);
    assert.equal(updated.metadata.updated_at, "2026-04-14T18:31:00.000Z");

    await service.deactivateDoc("lifecycle-doc", "2026-04-14T18:32:00.000Z");
    assert.equal(await service.getDoc("lifecycle-doc"), null);

    await service.reactivateDoc("lifecycle-doc", "2026-04-14T18:33:00.000Z");
    assert.equal((await service.getDoc("lifecycle-doc"))?.metadata.id, "lifecycle-doc");

    await service.deleteDoc("lifecycle-doc");
    assert.equal(await service.getDoc("lifecycle-doc", { includeInactive: true }), null);
  } finally {
    await tempRepo.removeTempRepo();
  }
});
