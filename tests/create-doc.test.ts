import assert from "node:assert/strict";
import test from "node:test";

import { resolveConfig } from "../src/config.ts";
import { CanonicalDocStore } from "../src/repository/canonical-doc-store.ts";
import { DocumentService } from "../src/services/document-service.ts";
import { registerCreateDocTool } from "../src/tools/create-doc.ts";
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

test("createDoc rolls back the document when reindexing fails", async () => {
  const tempRepo = await makeTempRepo();

  try {
    const config = resolveConfig({
      MARKDOWN_STORE_REPO: tempRepo.repoRoot,
    });
    const service = new DocumentService(new CanonicalDocStore(config), {
      reindex: async () => {
        throw new Error("reindex failed");
      },
    });

    await assert.rejects(
      service.createDoc(
        {
          title: "Rollback Spec",
          doc_type: "spec",
          tags: ["rollback"],
          content: "# Rollback Spec",
        },
        "2026-04-15T08:00:00.000Z"
      ),
      /reindex failed/
    );

    assert.equal(await service.getDoc("rollback-spec", { includeInactive: true }), null);
  } finally {
    await tempRepo.removeTempRepo();
  }
});

interface RegisteredToolServer {
  registerTool: (
    name: string,
    _config: unknown,
    handler: (input: unknown) => Promise<{
      content: Array<{
        type: "text";
        text: string;
      }>;
    }>
  ) => void;
}

interface RegisteredTool {
  handler: (input: unknown) => Promise<{
    content: Array<{
      type: "text";
      text: string;
    }>;
  }>;
}

test("registerCreateDocTool returns an error payload when createDoc fails", async () => {
  const tempRepo = await makeTempRepo();

  try {
    const config = resolveConfig({
      MARKDOWN_STORE_REPO: tempRepo.repoRoot,
    });
    const service = new DocumentService(new CanonicalDocStore(config), {
      reindex: async () => {
        throw new Error("sqlite binding missing");
      },
    });

    const registeredTools: Record<string, RegisteredTool | undefined> = {};
    const fakeServer: RegisteredToolServer = {
      registerTool: (name, _config, handler) => {
        registeredTools[name] = { handler };
      },
    };

    registerCreateDocTool(fakeServer as never, service);

    const response = await registeredTools.create_doc?.handler({
      title: "Broken Create",
      doc_type: "spec",
      tags: [],
      content: "# Broken Create",
    });
    const payload = JSON.parse(response?.content[0]?.text ?? "{}") as {
      error?: string;
    };

    assert.equal(payload.error, "sqlite binding missing");
    assert.equal(await service.getDoc("broken-create", { includeInactive: true }), null);
  } finally {
    await tempRepo.removeTempRepo();
  }
});
