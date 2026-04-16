import assert from "node:assert/strict";
import test from "node:test";

import { resolveConfig } from "../src/config.ts";
import { CanonicalDocStore } from "../src/repository/canonical-doc-store.ts";
import { DocumentService } from "../src/services/document-service.ts";
import { makeTempRepo } from "./helpers/temp-repo.ts";

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

test("getDoc returns an active document by id and canonical path", async () => {
  const tempRepo = await makeTempRepo();

  try {
    const config = resolveConfig({
      MARKDOWN_STORE_REPO: tempRepo.repoRoot,
    });
    const service = new DocumentService(new CanonicalDocStore(config), {
      reindex: async () => undefined,
    });

    await service.createDoc(
      {
        title: "Get Doc MVP",
        doc_type: "spec",
        tags: ["mvp"],
        content: "# Get Doc MVP",
      },
      "2026-04-14T18:15:00.000Z"
    );

    const byId = await service.getDoc("get-doc-mvp");
    const byPath = await service.getDoc("content/spec/get-doc-mvp.md");

    assert.equal(byId?.metadata.title, "Get Doc MVP");
    assert.equal(byPath?.metadata.id, "get-doc-mvp");
  } finally {
    await tempRepo.removeTempRepo();
  }
});

test("getDoc hides inactive documents unless explicitly requested", async () => {
  const tempRepo = await makeTempRepo();

  try {
    const config = resolveConfig({
      MARKDOWN_STORE_REPO: tempRepo.repoRoot,
    });
    const service = new DocumentService(new CanonicalDocStore(config), {
      reindex: async () => undefined,
    });

    await service.createDoc(
      {
        title: "Hidden Doc",
        doc_type: "note",
        tags: ["inactive"],
        content: "# Hidden Doc",
      },
      "2026-04-14T18:16:00.000Z"
    );

    assert.equal(await service.getDoc("hidden-doc"), null);

    const included = await service.getDoc("hidden-doc", { includeInactive: true });
    assert.equal(included?.metadata.id, "hidden-doc");
  } finally {
    await tempRepo.removeTempRepo();
  }
});

test("registerGetDocTool registers get_doc and returns document payload", async () => {
  const tempRepo = await makeTempRepo();

  try {
    const config = resolveConfig({
      MARKDOWN_STORE_REPO: tempRepo.repoRoot,
    });
    const service = new DocumentService(new CanonicalDocStore(config), {
      reindex: async () => undefined,
    });

    await service.createDoc(
      {
        title: "Tool Readback",
        doc_type: "spec",
        tags: ["mvp"],
        content: "# Tool Readback",
      },
      "2026-04-14T18:17:00.000Z"
    );

    const module = (await import("../src/tools/get-doc.ts").catch(() => null)) as {
      registerGetDocTool?: (server: RegisteredToolServer, service: DocumentService) => void;
    } | null;

    assert.ok(module?.registerGetDocTool, "expected registerGetDocTool to exist");

    const registeredTools: Record<string, RegisteredTool | undefined> = {};
    const fakeServer: RegisteredToolServer = {
      registerTool: (name, _config, handler) => {
        registeredTools[name] = { handler };
      },
    };

    module.registerGetDocTool(fakeServer, service);
    const tool = registeredTools.get_doc;

    assert.ok(tool, "expected get_doc to be registered");

    const response = await tool.handler({
      identifier: "tool-readback",
    });
    const payload = JSON.parse(response.content[0]?.text ?? "{}") as {
      id: string;
      canonical_path: string;
      content: string;
    };

    assert.equal(payload.id, "tool-readback");
    assert.equal(payload.canonical_path, "content/spec/tool-readback.md");
    assert.equal(payload.content, "# Tool Readback");
  } finally {
    await tempRepo.removeTempRepo();
  }
});
