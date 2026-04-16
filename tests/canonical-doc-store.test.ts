import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import test from "node:test";
import { join } from "node:path";

import {
  buildCanonicalPath,
  normalizeCreateInput,
  type CanonicalDocument,
} from "../src/domain/document.ts";
import { resolveConfig } from "../src/config.ts";
import { serializeFrontmatter } from "../src/lib/frontmatter.ts";
import { CanonicalDocStore } from "../src/repository/canonical-doc-store.ts";
import { makeTempRepo } from "./helpers/temp-repo.ts";

test("resolveConfig requires MARKDOWN_STORE_REPO", () => {
  const originalRepo = process.env.MARKDOWN_STORE_REPO;
  delete process.env.MARKDOWN_STORE_REPO;

  try {
    assert.throws(() => resolveConfig(), /MARKDOWN_STORE_REPO is required/i);
  } finally {
    process.env.MARKDOWN_STORE_REPO = originalRepo;
  }
});

test("resolveConfig reads repo settings from the environment", async () => {
  const originalRepo = process.env.MARKDOWN_STORE_REPO;
  const originalContentDir = process.env.MARKDOWN_STORE_CONTENT_DIR;
  const originalIndexDbPath = process.env.MARKDOWN_STORE_DB_PATH;
  const tempRepo = await makeTempRepo();

  process.env.MARKDOWN_STORE_REPO = tempRepo.repoRoot;
  delete process.env.MARKDOWN_STORE_CONTENT_DIR;
  delete process.env.MARKDOWN_STORE_DB_PATH;

  try {
    const config = resolveConfig();

    assert.equal(config.repoRoot, tempRepo.repoRoot);
    assert.equal(config.contentDir, "content");
    assert.equal(config.indexDbPath, ".markdown-store/markdown.db");
  } finally {
    process.env.MARKDOWN_STORE_REPO = originalRepo;
    process.env.MARKDOWN_STORE_CONTENT_DIR = originalContentDir;
    process.env.MARKDOWN_STORE_DB_PATH = originalIndexDbPath;
    await tempRepo.removeTempRepo();
  }
});

test("CanonicalDocStore.write writes markdown inside the configured repo and getById reads it back", async () => {
  const tempRepo = await makeTempRepo();
  const store = new CanonicalDocStore({
    repoRoot: tempRepo.repoRoot,
    contentDir: "content",
    indexDbPath: ".markdown-store/markdown.db",
  });
  const document = normalizeCreateInput(
    {
      title: "Agent First Markdown Docs",
      doc_type: "spec",
      content: "# Agent First Markdown Docs\n\nHello world.",
      tags: ["agents", "architecture"],
    },
    "2026-04-14T17:00:00.000Z"
  );

  try {
    await store.write(document);

    const expectedPath = join(tempRepo.repoRoot, buildCanonicalPath(document.metadata));
    const written = await readFile(expectedPath, "utf8");
    assert.match(written, /---/);
    assert.match(written, /title: Agent First Markdown Docs/);
    assert.match(written, /Hello world\./);

    const loaded = await store.getById(document.metadata.id);
    assert.equal(loaded?.metadata.id, document.metadata.id);
    assert.equal(loaded?.metadata.title, document.metadata.title);
    assert.equal(loaded?.content.trimEnd(), document.content);
    assert.equal(loaded?.canonicalPath, buildCanonicalPath(document.metadata));
  } finally {
    await tempRepo.removeTempRepo();
  }
});

test("CanonicalDocStore.write rejects overwriting an existing canonical document", async () => {
  const tempRepo = await makeTempRepo();
  const store = new CanonicalDocStore({
    repoRoot: tempRepo.repoRoot,
    contentDir: "content",
    indexDbPath: ".markdown-store/markdown.db",
  });
  const document = normalizeCreateInput(
    {
      title: "Write Path Safety",
      doc_type: "adr",
      content: "# Write Path Safety\n\nContent.",
      tags: ["safety"],
    },
    "2026-04-14T17:00:00.000Z"
  );

  try {
    await store.write(document);

    await assert.rejects(() => store.write(document), /duplicate canonical document id/i);
  } finally {
    await tempRepo.removeTempRepo();
  }
});

test("CanonicalDocStore.write rejects mismatched canonical paths", async () => {
  const tempRepo = await makeTempRepo();
  const store = new CanonicalDocStore({
    repoRoot: tempRepo.repoRoot,
    contentDir: "content",
    indexDbPath: ".markdown-store/markdown.db",
  });
  const document = normalizeCreateInput(
    {
      title: "Write Path Safety",
      doc_type: "adr",
      content: "# Write Path Safety\n\nContent.",
      tags: ["safety"],
    },
    "2026-04-14T17:00:00.000Z"
  );
  const mismatchedDocument: CanonicalDocument = {
    ...document,
    canonicalPath: "content/spec/write-path-safety.md",
  };

  try {
    await assert.rejects(() => store.write(mismatchedDocument), /canonical path/i);
  } finally {
    await tempRepo.removeTempRepo();
  }
});

test("CanonicalDocStore.write rejects escaped canonical paths", async () => {
  const tempRepo = await makeTempRepo();
  const store = new CanonicalDocStore({
    repoRoot: tempRepo.repoRoot,
    contentDir: "content",
    indexDbPath: ".markdown-store/markdown.db",
  });

  try {
    await assert.rejects(
      () =>
        store.write({
          canonicalPath: "../notes/escaped.md",
          metadata: normalizeCreateInput(
            {
              title: "Escaped",
              doc_type: "adr",
              content: "# Escaped\n",
              tags: [],
            },
            "2026-04-14T17:00:00.000Z"
          ).metadata,
          content: "# Escaped\n",
        }),
      /canonical path/i
    );
  } finally {
    await tempRepo.removeTempRepo();
  }
});

test("CanonicalDocStore.getById returns null when the content directory does not exist yet", async () => {
  const tempRepo = await makeTempRepo();
  const store = new CanonicalDocStore({
    repoRoot: tempRepo.repoRoot,
    contentDir: "content",
    indexDbPath: ".markdown-store/markdown.db",
  });

  try {
    await rm(join(tempRepo.repoRoot, "content"), { recursive: true, force: true });

    const loaded = await store.getById("agent-first-markdown-docs");
    assert.equal(loaded, null);
  } finally {
    await tempRepo.removeTempRepo();
  }
});

test("CanonicalDocStore.write rejects duplicate ids across doc_type folders", async () => {
  const tempRepo = await makeTempRepo();
  const store = new CanonicalDocStore({
    repoRoot: tempRepo.repoRoot,
    contentDir: "content",
    indexDbPath: ".markdown-store/markdown.db",
  });
  const adrDocument = normalizeCreateInput(
    {
      title: "Duplicate Id",
      doc_type: "adr",
      content: "# Duplicate Id\n\nADR.",
      tags: ["architecture"],
    },
    "2026-04-14T17:00:00.000Z"
  );
  const specDocument = normalizeCreateInput(
    {
      title: "Duplicate Id",
      doc_type: "spec",
      content: "# Duplicate Id\n\nSpec.",
      tags: ["architecture"],
    },
    "2026-04-14T17:00:00.000Z"
  );

  try {
    await store.write(adrDocument);

    await assert.rejects(() => store.write(specDocument), /duplicate canonical document id/i);
  } finally {
    await tempRepo.removeTempRepo();
  }
});

test("CanonicalDocStore.write rejects a symlinked content root that resolves outside the repo", async () => {
  const tempRepo = await makeTempRepo();
  const outsideDir = await mkdtemp(join(tmpdir(), "markdown-store-outside-"));
  const contentDir = join(tempRepo.repoRoot, "content");
  const store = new CanonicalDocStore({
    repoRoot: tempRepo.repoRoot,
    contentDir: "content",
    indexDbPath: ".markdown-store/markdown.db",
  });
  const document = normalizeCreateInput(
    {
      title: "Symlink Escape",
      doc_type: "adr",
      content: "# Symlink Escape\n",
      tags: [],
    },
    "2026-04-14T17:00:00.000Z"
  );

  try {
    await rm(contentDir, { recursive: true, force: true });
    await symlink(outsideDir, contentDir, "junction");

    await assert.rejects(() => store.write(document), /outside the canonical repo/i);
  } finally {
    await rm(outsideDir, { recursive: true, force: true });
    await tempRepo.removeTempRepo();
  }
});

test("CanonicalDocStore.getById rejects a symlinked content root that resolves outside the repo", async () => {
  const tempRepo = await makeTempRepo();
  const outsideDir = await mkdtemp(join(tmpdir(), "markdown-store-outside-"));
  const contentDir = join(tempRepo.repoRoot, "content");
  const store = new CanonicalDocStore({
    repoRoot: tempRepo.repoRoot,
    contentDir: "content",
    indexDbPath: ".markdown-store/markdown.db",
  });
  const document = normalizeCreateInput(
    {
      title: "Symlink Read Escape",
      doc_type: "adr",
      content: "# Symlink Read Escape\n",
      tags: [],
    },
    "2026-04-14T17:00:00.000Z"
  );

  try {
    await rm(contentDir, { recursive: true, force: true });
    await symlink(outsideDir, contentDir, "junction");
    await mkdir(join(outsideDir, "adr"), { recursive: true });
    await writeFile(
      join(outsideDir, "adr", "symlink-read-escape.md"),
      serializeFrontmatter(document.metadata, document.content),
      "utf8"
    );

    await assert.rejects(() => store.getById(document.metadata.id), /outside the canonical repo/i);
  } finally {
    await rm(outsideDir, { recursive: true, force: true });
    await tempRepo.removeTempRepo();
  }
});

test("CanonicalDocStore round-trips documents under a non-default content directory", async () => {
  const tempRepo = await makeTempRepo();
  const store = new CanonicalDocStore({
    repoRoot: tempRepo.repoRoot,
    contentDir: "docs/content",
    indexDbPath: ".markdown-store/markdown.db",
  });
  const document = normalizeCreateInput(
    {
      title: "Write Path Safety",
      doc_type: "adr",
      content: "# Write Path Safety\n\nContent.",
      tags: ["safety"],
    },
    "2026-04-14T17:00:00.000Z"
  );
  const expectedPath = join(tempRepo.repoRoot, "docs/content/adr/write-path-safety.md");

  try {
    await store.write(document);

    const written = await readFile(expectedPath, "utf8");
    assert.match(written, /Write Path Safety/);

    const loaded = await store.getById(document.metadata.id);
    assert.equal(loaded?.canonicalPath, "content/adr/write-path-safety.md");
    assert.equal(loaded?.metadata.id, document.metadata.id);
    assert.equal(loaded?.content.trimEnd(), document.content);

    const byPath = await store.getByPath("content/adr/write-path-safety.md");
    assert.equal(byPath?.canonicalPath, "content/adr/write-path-safety.md");
  } finally {
    await tempRepo.removeTempRepo();
  }
});

test("CanonicalDocStore.getByPath rejects paths outside the canonical repo", async () => {
  const tempRepo = await makeTempRepo();
  const store = new CanonicalDocStore({
    repoRoot: tempRepo.repoRoot,
    contentDir: "content",
    indexDbPath: ".markdown-store/markdown.db",
  });

  try {
    await assert.rejects(() => store.getByPath("../outside.md"), /canonical path/i);
  } finally {
    await tempRepo.removeTempRepo();
  }
});

test("CanonicalDocStore.getByPath rejects non-canonical repo-relative markdown paths", async () => {
  const tempRepo = await makeTempRepo();
  const store = new CanonicalDocStore({
    repoRoot: tempRepo.repoRoot,
    contentDir: "content",
    indexDbPath: ".markdown-store/markdown.db",
  });

  try {
    await mkdir(join(tempRepo.repoRoot, "notes"), { recursive: true });
    await writeFile(join(tempRepo.repoRoot, "notes", "outside.md"), "# Outside\n", "utf8");

    await assert.rejects(() => store.getByPath("notes/outside.md"), /canonical path/i);
  } finally {
    await tempRepo.removeTempRepo();
  }
});
