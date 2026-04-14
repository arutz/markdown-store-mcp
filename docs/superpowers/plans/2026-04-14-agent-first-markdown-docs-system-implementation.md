# Agent-First Markdown Docs System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-managed MCP server that stores canonical Markdown documents in a separate repository, with an MVP that first ships `create_doc` and `get_doc`.

**Architecture:** Replace the starter weather server with a modular document server that validates document metadata with `zod`, reads and writes canonical Markdown files via a repository layer, and rebuilds a local `MarkdownDB` index after every write. The MVP keeps reads deterministic by loading documents directly from the canonical repository while still wiring the reindexing hook needed for later search and lifecycle tools.

**Tech Stack:** TypeScript, Node.js, `@modelcontextprotocol/server`, `zod`, `gray-matter`, `mddb`, Node built-in test runner with `tsx`

---

## Delivery Phases

### Phase 1: MVP

Tasks 1 through 4 produce the first usable release:

- canonical repo config and safety guards
- normalized front matter and canonical path rules
- `create_doc`
- `get_doc`
- automatic reindex hook after writes

The MVP is complete once an agent can create an active canonical document in the external repository and read it back by id or canonical path.

### Phase 2: Full v1

Tasks 5 and 6 extend the MVP to the rest of the approved lifecycle:

- `import_doc`
- `search_docs`
- `update_doc`
- `deactivate_doc`
- `reactivate_doc`
- `delete_doc`

## Concrete Decisions Locked In By This Plan

### Canonical Repository Layout

Use a dedicated external repository with this structure:

```text
<canonical-repo>/
  content/
    <doc_type>/
      <id>.md
  .markdown-store/
    markdown.db
```

The MCP server will only operate inside the configured `<canonical-repo>` root.

### Front Matter Schema

Every canonical document uses this front matter shape:

```yaml
---
id: agent-first-markdown-docs
title: Agent-First Markdown Docs
tags:
  - agents
  - architecture
doc_type: spec
source: canonical
created_at: 2026-04-14T18:00:00.000Z
updated_at: 2026-04-14T18:00:00.000Z
source_repo: openai/example
source_path: docs/spec.md
source_ref: refs/heads/main
source_commit: abc123
imported_at: 2026-04-14T18:10:00.000Z
---
```

Required fields for net-new documents:

- `id`
- `title`
- `tags`
- `doc_type`
- `source`
- `created_at`
- `updated_at`

Optional provenance fields are only populated for imported documents.

Inactive documents are represented by adding the `inactive` tag to `tags`. No separate `status` front matter field is introduced in v1.

### Canonical Path Rule

Canonical path is always:

```text
content/<doc_type>/<id>.md
```

`id` is the stable slug. If the caller omits `id`, derive it from `title`.

### Reindex Strategy

For v1, every write operation triggers a full rebuild of the `content/` folder into `.markdown-store/markdown.db` using `mddb`. This is slower than incremental indexing but dramatically simpler and safer for the first release.

## Planned File Structure

### Runtime Files

- Modify: `package.json`
- Modify: `src/index.ts`
- Create: `src/server.ts`
- Create: `src/config.ts`
- Create: `src/domain/document.ts`
- Create: `src/lib/slug.ts`
- Create: `src/lib/frontmatter.ts`
- Create: `src/lib/path-safety.ts`
- Create: `src/lib/indexer.ts`
- Create: `src/repository/canonical-doc-store.ts`
- Create: `src/services/document-service.ts`
- Create: `src/tools/create-doc.ts`
- Create: `src/tools/get-doc.ts`
- Create: `src/tools/import-doc.ts`
- Create: `src/tools/search-docs.ts`
- Create: `src/tools/update-doc.ts`
- Create: `src/tools/deactivate-doc.ts`
- Create: `src/tools/reactivate-doc.ts`
- Create: `src/tools/delete-doc.ts`

### Test Files

- Create: `tests/helpers/temp-repo.ts`
- Create: `tests/document-model.test.ts`
- Create: `tests/canonical-doc-store.test.ts`
- Create: `tests/create-doc.test.ts`
- Create: `tests/get-doc.test.ts`
- Create: `tests/import-search.test.ts`
- Create: `tests/lifecycle.test.ts`
- Create: `tests/fixtures/source-doc.md`

### Documentation Files

- Create: `README.md`

## Task 1: Define Canonical Document Rules

**Files:**
- Modify: `package.json`
- Create: `tests/document-model.test.ts`
- Create: `src/domain/document.ts`
- Create: `src/lib/slug.ts`

- [ ] **Step 1: Write the failing document normalization test**

```ts
// tests/document-model.test.ts
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCanonicalPath,
  isInactive,
  normalizeCreateInput,
} from "../src/domain/document.js";

test("normalizeCreateInput derives id, metadata, and canonical path", () => {
  const nowIso = "2026-04-14T18:00:00.000Z";

  const normalized = normalizeCreateInput(
    {
      title: "Agent First Markdown Docs",
      doc_type: "spec",
      content: "# Agent First Markdown Docs",
      tags: ["agents", "architecture"],
    },
    nowIso,
  );

  assert.equal(normalized.metadata.id, "agent-first-markdown-docs");
  assert.equal(normalized.metadata.source, "canonical");
  assert.equal(normalized.metadata.created_at, nowIso);
  assert.equal(normalized.metadata.updated_at, nowIso);
  assert.deepEqual(normalized.metadata.tags, ["agents", "architecture"]);
  assert.equal(
    buildCanonicalPath(normalized.metadata),
    "content/spec/agent-first-markdown-docs.md",
  );
  assert.equal(isInactive(normalized.metadata), false);
});
```

- [ ] **Step 2: Add a test runner and verify the test fails**

Update `package.json` to add `tsx` and a real test script:

```json
{
  "name": "markdown-store-mcp",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "markdown-store-mcp": "./build/index.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "node --import tsx --test tests",
    "prettier:format": "prettier --write .",
    "prettier:check": "prettier --check .",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/server": "^2.0.0-alpha.2",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@types/node": "^24.3.0",
    "prettier": "^3.8.2",
    "tsx": "^4.20.3",
    "typescript": "^6.0.2"
  }
}
```

Run:

```bash
npm install
node --import tsx --test tests/document-model.test.ts
```

Expected: FAIL with `Cannot find module '../src/domain/document.js'`.

- [ ] **Step 3: Implement document schemas, normalization, and slugging**

```ts
// src/lib/slug.ts
export function slugifyValue(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}
```

```ts
// src/domain/document.ts
import z from "zod";

import { slugifyValue } from "../lib/slug.js";

export const docMetadataSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  tags: z.array(z.string()).default([]),
  doc_type: z.string().min(1),
  source: z.enum(["canonical", "imported"]).default("canonical"),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  source_repo: z.string().min(1).optional(),
  source_path: z.string().min(1).optional(),
  source_ref: z.string().min(1).optional(),
  source_commit: z.string().min(1).optional(),
  imported_at: z.string().datetime().optional(),
});

export const createDocInputSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1),
  tags: z.array(z.string()).default([]),
  doc_type: z.string().min(1),
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

export function buildCanonicalPath(metadata: Pick<DocMetadata, "doc_type" | "id">): string {
  return `content/${metadata.doc_type}/${metadata.id}.md`;
}

export function isInactive(metadata: Pick<DocMetadata, "tags">): boolean {
  return metadata.tags.includes("inactive");
}

export function normalizeCreateInput(input: CreateDocInput, nowIso: string): CanonicalDocument {
  const parsedInput = createDocInputSchema.parse(input);
  const id = parsedInput.id ? slugifyValue(parsedInput.id) : slugifyValue(parsedInput.title);

  const metadata = docMetadataSchema.parse({
    ...parsedInput,
    id,
    created_at: nowIso,
    updated_at: nowIso,
  });

  return {
    canonicalPath: buildCanonicalPath(metadata),
    metadata,
    content: parsedInput.content,
  };
}
```

- [ ] **Step 4: Run the focused test and typecheck**

Run:

```bash
node --import tsx --test tests/document-model.test.ts
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tests/document-model.test.ts src/domain/document.ts src/lib/slug.ts
git commit -m "feat: define canonical markdown document model"
```

## Task 2: Build Repository-Safe Markdown Persistence

**Files:**
- Modify: `package.json`
- Create: `tests/helpers/temp-repo.ts`
- Create: `tests/canonical-doc-store.test.ts`
- Create: `src/config.ts`
- Create: `src/lib/frontmatter.ts`
- Create: `src/lib/path-safety.ts`
- Create: `src/repository/canonical-doc-store.ts`

- [ ] **Step 1: Write failing repository tests for write, read, and path safety**

```ts
// tests/helpers/temp-repo.ts
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export async function makeTempRepo(): Promise<string> {
  return mkdtemp(join(tmpdir(), "markdown-store-"));
}

export async function removeTempRepo(repoRoot: string): Promise<void> {
  await rm(repoRoot, { recursive: true, force: true });
}
```

```ts
// tests/canonical-doc-store.test.ts
import test from "node:test";
import assert from "node:assert/strict";

import { resolveConfig } from "../src/config.js";
import { normalizeCreateInput } from "../src/domain/document.js";
import { CanonicalDocStore } from "../src/repository/canonical-doc-store.js";
import { makeTempRepo, removeTempRepo } from "./helpers/temp-repo.js";

test("CanonicalDocStore writes markdown inside the configured repo and reads it back", async () => {
  const repoRoot = await makeTempRepo();

  try {
    const config = resolveConfig({
      MARKDOWN_STORE_REPO: repoRoot,
    });
    const store = new CanonicalDocStore(config);
    const document = normalizeCreateInput(
      {
        title: "Write Path Safety",
        doc_type: "adr",
        content: "# Write Path Safety",
        tags: ["safety"],
      },
      "2026-04-14T18:05:00.000Z",
    );

    await store.write(document);
    const loaded = await store.getById("write-path-safety");

    assert.ok(loaded);
    assert.equal(loaded?.canonicalPath, "content/adr/write-path-safety.md");
    assert.equal(loaded?.content, "# Write Path Safety");
  } finally {
    await removeTempRepo(repoRoot);
  }
});

test("CanonicalDocStore rejects attempts to escape the repo root", async () => {
  const repoRoot = await makeTempRepo();

  try {
    const config = resolveConfig({
      MARKDOWN_STORE_REPO: repoRoot,
    });
    const store = new CanonicalDocStore(config);

    await assert.rejects(
      () => store.getByPath("../outside.md"),
      /outside the canonical repository/i,
    );
  } finally {
    await removeTempRepo(repoRoot);
  }
});
```

- [ ] **Step 2: Install `gray-matter` and verify the tests fail**

Run:

```bash
npm install gray-matter
node --import tsx --test tests/canonical-doc-store.test.ts
```

Expected: FAIL with `Cannot find module '../src/config.js'` or `../src/repository/canonical-doc-store.js`.

- [ ] **Step 3: Implement config resolution, front matter parsing, repo safety, and the store**

```ts
// src/config.ts
import { resolve } from "node:path";

export interface MarkdownStoreConfig {
  repoRoot: string;
  contentDir: string;
  indexDbPath: string;
}

export function resolveConfig(
  env: NodeJS.ProcessEnv = process.env,
): MarkdownStoreConfig {
  const repoRoot = env.MARKDOWN_STORE_REPO;

  if (!repoRoot) {
    throw new Error("MARKDOWN_STORE_REPO must point to the canonical docs repository");
  }

  const resolvedRepoRoot = resolve(repoRoot);
  const contentDir = env.MARKDOWN_STORE_CONTENT_DIR ?? "content";
  const indexDbPath = env.MARKDOWN_STORE_DB_PATH ?? ".markdown-store/markdown.db";

  return {
    repoRoot: resolvedRepoRoot,
    contentDir,
    indexDbPath,
  };
}
```

```ts
// src/lib/path-safety.ts
import { resolve, sep } from "node:path";

export function assertWithinRepo(repoRoot: string, candidatePath: string): string {
  const resolvedRoot = resolve(repoRoot);
  const resolvedCandidate = resolve(repoRoot, candidatePath);

  if (
    resolvedCandidate !== resolvedRoot &&
    !resolvedCandidate.startsWith(`${resolvedRoot}${sep}`)
  ) {
    throw new Error(`Path '${candidatePath}' is outside the canonical repository`);
  }

  return resolvedCandidate;
}
```

```ts
// src/lib/frontmatter.ts
import matter from "gray-matter";

import type { CanonicalDocument, DocMetadata } from "../domain/document.js";
import { docMetadataSchema } from "../domain/document.js";

export function serializeDocument(document: CanonicalDocument): string {
  return matter.stringify(document.content, document.metadata);
}

export function parseDocument(
  rawMarkdown: string,
  canonicalPath: string,
): CanonicalDocument {
  const parsed = matter(rawMarkdown);
  const metadata = docMetadataSchema.parse(parsed.data as DocMetadata);

  return {
    canonicalPath,
    metadata,
    content: parsed.content.trimEnd(),
  };
}
```

```ts
// src/repository/canonical-doc-store.ts
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { MarkdownStoreConfig } from "../config.js";
import type { CanonicalDocument } from "../domain/document.js";
import { parseDocument, serializeDocument } from "../lib/frontmatter.js";
import { assertWithinRepo } from "../lib/path-safety.js";

export class CanonicalDocStore {
  constructor(private readonly config: MarkdownStoreConfig) {}

  async write(document: CanonicalDocument): Promise<void> {
    const absolutePath = assertWithinRepo(this.config.repoRoot, document.canonicalPath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, serializeDocument(document), "utf8");
  }

  async getById(id: string): Promise<CanonicalDocument | null> {
    const contentRoot = assertWithinRepo(this.config.repoRoot, this.config.contentDir);

    const walk = async (dir: string): Promise<string[]> => {
      const entries = await readdir(dir, { withFileTypes: true });
      const nested = await Promise.all(
        entries.map(async (entry) => {
          const next = join(dir, entry.name);
          if (entry.isDirectory()) {
            return walk(next);
          }
          return next.endsWith(".md") ? [next] : [];
        }),
      );

      return nested.flat();
    };

    const files = await walk(contentRoot);
    const match = files.find(
      (filePath) => filePath.endsWith(`/${id}.md`) || filePath.endsWith(`\\${id}.md`),
    );

    if (!match) {
      return null;
    }

    const raw = await readFile(match, "utf8");
    const canonicalPath = match.slice(this.config.repoRoot.length + 1).replace(/\\/g, "/");
    return parseDocument(raw, canonicalPath);
  }

  async getByPath(canonicalPath: string): Promise<CanonicalDocument | null> {
    const absolutePath = assertWithinRepo(this.config.repoRoot, canonicalPath);

    try {
      const raw = await readFile(absolutePath, "utf8");
      return parseDocument(raw, canonicalPath.replace(/\\/g, "/"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }
}
```

- [ ] **Step 4: Run the repository tests and typecheck**

Run:

```bash
node --import tsx --test tests/canonical-doc-store.test.ts
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tests/helpers/temp-repo.ts tests/canonical-doc-store.test.ts src/config.ts src/lib/frontmatter.ts src/lib/path-safety.ts src/repository/canonical-doc-store.ts
git commit -m "feat: persist canonical markdown docs safely"
```

## Task 3: Ship `create_doc`

**Files:**
- Modify: `package.json`
- Create: `tests/create-doc.test.ts`
- Create: `src/lib/indexer.ts`
- Create: `src/services/document-service.ts`
- Create: `src/tools/create-doc.ts`
- Create: `src/server.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write the failing `create_doc` service test**

```ts
// tests/create-doc.test.ts
import test from "node:test";
import assert from "node:assert/strict";

import { resolveConfig } from "../src/config.js";
import { CanonicalDocStore } from "../src/repository/canonical-doc-store.js";
import { DocumentService } from "../src/services/document-service.js";
import { makeTempRepo, removeTempRepo } from "./helpers/temp-repo.js";

test("createDoc writes the document and triggers a reindex", async () => {
  const repoRoot = await makeTempRepo();
  const reindexCalls: string[] = [];

  try {
    const config = resolveConfig({
      MARKDOWN_STORE_REPO: repoRoot,
    });
    const service = new DocumentService(
      new CanonicalDocStore(config),
      {
        reindex: async () => {
          reindexCalls.push("reindex");
        },
      },
    );

    const created = await service.createDoc(
      {
        title: "Create Doc MVP",
        doc_type: "spec",
        tags: ["mvp"],
        content: "# Create Doc MVP",
      },
      "2026-04-14T18:10:00.000Z",
    );

    assert.equal(created.canonicalPath, "content/spec/create-doc-mvp.md");
    assert.equal(created.metadata.id, "create-doc-mvp");
    assert.equal(reindexCalls.length, 1);

    const loaded = await service.getDoc("create-doc-mvp", { includeInactive: true });
    assert.equal(loaded?.content, "# Create Doc MVP");
  } finally {
    await removeTempRepo(repoRoot);
  }
});
```

- [ ] **Step 2: Install `mddb` and verify the test fails**

Run:

```bash
npm install mddb
node --import tsx --test tests/create-doc.test.ts
```

Expected: FAIL with `Cannot find module '../src/services/document-service.js'`.

- [ ] **Step 3: Implement the indexer, service, MCP tool, and server bootstrap**

```ts
// src/lib/indexer.ts
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { MarkdownDB } from "mddb";

import type { MarkdownStoreConfig } from "../config.js";

export interface DocumentIndexer {
  reindex(): Promise<void>;
}

export class MarkdownDbIndexer implements DocumentIndexer {
  private clientPromise: Promise<MarkdownDB> | null = null;

  constructor(private readonly config: MarkdownStoreConfig) {}

  async reindex(): Promise<void> {
    const client = await this.getClient();
    const contentRoot = join(this.config.repoRoot, this.config.contentDir);
    await client.indexFolder(contentRoot);
  }

  private async getClient(): Promise<MarkdownDB> {
    if (!this.clientPromise) {
      this.clientPromise = this.createClient();
    }

    return this.clientPromise;
  }

  private async createClient(): Promise<MarkdownDB> {
    const dbFile = join(this.config.repoRoot, this.config.indexDbPath);
    await mkdir(dirname(dbFile), { recursive: true });

    const client = new MarkdownDB({
      client: "sqlite3",
      connection: {
        filename: dbFile,
      },
    });

    return client.init();
  }
}
```

```ts
// src/services/document-service.ts
import type { CanonicalDocument, CreateDocInput } from "../domain/document.js";
import { isInactive, normalizeCreateInput } from "../domain/document.js";
import type { DocumentIndexer } from "../lib/indexer.js";
import { CanonicalDocStore } from "../repository/canonical-doc-store.js";

export class DocumentService {
  constructor(
    private readonly store: CanonicalDocStore,
    private readonly indexer: DocumentIndexer,
  ) {}

  async createDoc(input: CreateDocInput, nowIso = new Date().toISOString()): Promise<CanonicalDocument> {
    const document = normalizeCreateInput(input, nowIso);
    await this.store.write(document);
    await this.indexer.reindex();
    return document;
  }

  async getDoc(
    identifier: string,
    options: { includeInactive?: boolean } = {},
  ): Promise<CanonicalDocument | null> {
    const document =
      identifier.includes("/") || identifier.endsWith(".md")
        ? await this.store.getByPath(identifier)
        : await this.store.getById(identifier);

    if (!document) {
      return null;
    }

    if (!options.includeInactive && isInactive(document.metadata)) {
      return null;
    }

    return document;
  }
}
```

```ts
// src/tools/create-doc.ts
import type { McpServer } from "@modelcontextprotocol/server";
import z from "zod";

import type { DocumentService } from "../services/document-service.js";

const createDocToolSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1),
  tags: z.array(z.string()).default([]),
  doc_type: z.string().min(1),
  content: z.string().min(1),
});

export function registerCreateDocTool(server: McpServer, service: DocumentService): void {
  server.registerTool(
    "create_doc",
    {
      title: "Create Document",
      description: "Create a new canonical markdown document in the configured repository",
      inputSchema: createDocToolSchema,
    },
    async (input) => {
      const created = await service.createDoc(createDocToolSchema.parse(input));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: created.metadata.id,
                canonical_path: created.canonicalPath,
                metadata: created.metadata,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
```

```ts
// src/server.ts
import { McpServer } from "@modelcontextprotocol/server";

import type { DocumentService } from "./services/document-service.js";
import { registerCreateDocTool } from "./tools/create-doc.js";

export function buildServer(service: DocumentService): McpServer {
  const server = new McpServer({
    name: "markdown-store",
    version: "1.0.0",
  });

  registerCreateDocTool(server, service);

  return server;
}
```

```ts
// src/index.ts
import { StdioServerTransport } from "@modelcontextprotocol/server";
import { process } from "@modelcontextprotocol/server/_shims";

import { resolveConfig } from "./config.js";
import { MarkdownDbIndexer } from "./lib/indexer.js";
import { CanonicalDocStore } from "./repository/canonical-doc-store.js";
import { buildServer } from "./server.js";
import { DocumentService } from "./services/document-service.js";

async function main() {
  const config = resolveConfig();
  const service = new DocumentService(
    new CanonicalDocStore(config),
    new MarkdownDbIndexer(config),
  );
  const server = buildServer(service);
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error("Markdown Store MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
```

- [ ] **Step 4: Run the `create_doc` test, then the full suite so far**

Run:

```bash
node --import tsx --test tests/create-doc.test.ts
npm test
npm run typecheck
```

Expected: all commands PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tests/create-doc.test.ts src/lib/indexer.ts src/services/document-service.ts src/tools/create-doc.ts src/server.ts src/index.ts
git commit -m "feat: add create_doc tool"
```

## Task 4: Ship `get_doc` And Close The MVP

**Files:**
- Create: `tests/get-doc.test.ts`
- Create: `src/tools/get-doc.ts`
- Modify: `src/server.ts`

- [ ] **Step 1: Write failing tests for get-by-id, get-by-path, and inactive filtering**

```ts
// tests/get-doc.test.ts
import test from "node:test";
import assert from "node:assert/strict";

import { resolveConfig } from "../src/config.js";
import { CanonicalDocStore } from "../src/repository/canonical-doc-store.js";
import { DocumentService } from "../src/services/document-service.js";
import { makeTempRepo, removeTempRepo } from "./helpers/temp-repo.js";

test("getDoc returns an active document by id and canonical path", async () => {
  const repoRoot = await makeTempRepo();

  try {
    const config = resolveConfig({
      MARKDOWN_STORE_REPO: repoRoot,
    });
    const service = new DocumentService(
      new CanonicalDocStore(config),
      { reindex: async () => undefined },
    );

    await service.createDoc(
      {
        title: "Get Doc MVP",
        doc_type: "spec",
        tags: ["mvp"],
        content: "# Get Doc MVP",
      },
      "2026-04-14T18:15:00.000Z",
    );

    const byId = await service.getDoc("get-doc-mvp");
    const byPath = await service.getDoc("content/spec/get-doc-mvp.md");

    assert.equal(byId?.metadata.title, "Get Doc MVP");
    assert.equal(byPath?.metadata.id, "get-doc-mvp");
  } finally {
    await removeTempRepo(repoRoot);
  }
});

test("getDoc hides inactive documents unless explicitly requested", async () => {
  const repoRoot = await makeTempRepo();

  try {
    const config = resolveConfig({
      MARKDOWN_STORE_REPO: repoRoot,
    });
    const service = new DocumentService(
      new CanonicalDocStore(config),
      { reindex: async () => undefined },
    );

    await service.createDoc(
      {
        title: "Hidden Doc",
        doc_type: "note",
        tags: ["inactive"],
        content: "# Hidden Doc",
      },
      "2026-04-14T18:16:00.000Z",
    );

    assert.equal(await service.getDoc("hidden-doc"), null);

    const included = await service.getDoc("hidden-doc", { includeInactive: true });
    assert.equal(included?.metadata.id, "hidden-doc");
  } finally {
    await removeTempRepo(repoRoot);
  }
});
```

- [ ] **Step 2: Verify the new test fails**

Run:

```bash
node --import tsx --test tests/get-doc.test.ts
```

Expected: FAIL because the MCP-facing `get_doc` tool does not exist yet.

- [ ] **Step 3: Implement the MCP `get_doc` tool and register it**

```ts
// src/tools/get-doc.ts
import type { McpServer } from "@modelcontextprotocol/server";
import z from "zod";

import type { DocumentService } from "../services/document-service.js";

const getDocToolSchema = z.object({
  identifier: z.string().min(1),
  include_inactive: z.boolean().default(false),
});

export function registerGetDocTool(server: McpServer, service: DocumentService): void {
  server.registerTool(
    "get_doc",
    {
      title: "Get Document",
      description: "Read an active canonical markdown document by id or canonical path",
      inputSchema: getDocToolSchema,
    },
    async (input) => {
      const parsed = getDocToolSchema.parse(input);
      const document = await service.getDoc(parsed.identifier, {
        includeInactive: parsed.include_inactive,
      });

      if (!document) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: "Document not found",
                  identifier: parsed.identifier,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: document.metadata.id,
                canonical_path: document.canonicalPath,
                metadata: document.metadata,
                content: document.content,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
```

```ts
// src/server.ts
import { McpServer } from "@modelcontextprotocol/server";

import type { DocumentService } from "./services/document-service.js";
import { registerCreateDocTool } from "./tools/create-doc.js";
import { registerGetDocTool } from "./tools/get-doc.js";

export function buildServer(service: DocumentService): McpServer {
  const server = new McpServer({
    name: "markdown-store",
    version: "1.0.0",
  });

  registerCreateDocTool(server, service);
  registerGetDocTool(server, service);

  return server;
}
```

- [ ] **Step 4: Run the focused test, then the whole MVP suite**

Run:

```bash
node --import tsx --test tests/get-doc.test.ts
npm test
npm run typecheck
```

Expected: all commands PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/get-doc.test.ts src/tools/get-doc.ts src/server.ts
git commit -m "feat: add get_doc tool"
```

MVP exit criteria:

- `create_doc` writes a canonical Markdown file into the configured external repository
- `create_doc` triggers a MarkdownDB rebuild
- `get_doc` returns active documents by id or canonical path
- inactive documents are hidden by default

## Task 5: Add `import_doc` And `search_docs`

**Files:**
- Create: `tests/fixtures/source-doc.md`
- Create: `tests/import-search.test.ts`
- Modify: `tests/create-doc.test.ts`
- Modify: `tests/get-doc.test.ts`
- Create: `src/tools/import-doc.ts`
- Create: `src/tools/search-docs.ts`
- Modify: `src/lib/indexer.ts`
- Modify: `src/services/document-service.ts`
- Modify: `src/server.ts`

- [ ] **Step 1: Write failing tests for import provenance and active-only search**

```md
<!-- tests/fixtures/source-doc.md -->
---
title: Imported Source Doc
tags:
  - imported
doc_type: guide
---

# Imported Source Doc

This imported document explains the transfer workflow.
```

```ts
// tests/import-search.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { resolveConfig } from "../src/config.js";
import { CanonicalDocStore } from "../src/repository/canonical-doc-store.js";
import { DocumentService } from "../src/services/document-service.js";
import { makeTempRepo, removeTempRepo } from "./helpers/temp-repo.js";

const sourceDocPath = fileURLToPath(new URL("./fixtures/source-doc.md", import.meta.url));

test("importDoc preserves provenance and searchDocs excludes inactive docs", async () => {
  const repoRoot = await makeTempRepo();

  try {
    const config = resolveConfig({
      MARKDOWN_STORE_REPO: repoRoot,
    });
    const service = new DocumentService(
      new CanonicalDocStore(config),
      { reindex: async () => undefined, search: async () => [] },
    );

    const imported = await service.importDoc(
      {
        source_path: sourceDocPath,
        source_repo: "achim/notes",
        source_ref: "refs/heads/main",
        source_commit: "abc123",
      },
      "2026-04-14T18:20:00.000Z",
    );

    assert.equal(imported.metadata.source, "imported");
    assert.equal(imported.metadata.source_repo, "achim/notes");
    assert.equal(imported.metadata.imported_at, "2026-04-14T18:20:00.000Z");

    const matches = await service.searchDocs({
      query: "transfer workflow",
    });

    assert.equal(matches.length, 1);
    assert.equal(matches[0]?.metadata.id, imported.metadata.id);
  } finally {
    await removeTempRepo(repoRoot);
  }
});
```

- [ ] **Step 2: Verify the import/search test fails**

Run:

```bash
node --import tsx --test tests/import-search.test.ts
```

Expected: FAIL because `importDoc` and `searchDocs` do not exist.

- [ ] **Step 3: Extend the indexer and service to support import and search**

Add these interfaces to `src/lib/indexer.ts`:

```ts
export interface SearchResultRow {
  canonicalPath: string;
  metadata: Record<string, unknown>;
}

export interface DocumentIndexer {
  reindex(): Promise<void>;
  search(filters: {
    tags?: string[];
    doc_type?: string;
    source?: string;
  }): Promise<SearchResultRow[]>;
}
```

Then add this implementation method to `MarkdownDbIndexer`:

```ts
import { relative } from "node:path";

  async search(filters: {
    tags?: string[];
    doc_type?: string;
    source?: string;
  }): Promise<SearchResultRow[]> {
    const client = await this.getClient();
    const rows = await client.getFiles({
      tags: filters.tags,
      filetypes: filters.doc_type ? [filters.doc_type] : undefined,
      frontmatter: filters.source ? { source: filters.source } : undefined,
    });

    return rows.map((row: Record<string, unknown>) => ({
      canonicalPath: relative(
        this.config.repoRoot,
        String(row.file_path ?? row.path ?? ""),
      ).replace(/\\/g, "/"),
      metadata: (row.metadata as Record<string, unknown>) ?? {},
    }));
  }
```

Because `DocumentIndexer` now includes `search`, update the earlier test doubles in `tests/create-doc.test.ts` and `tests/get-doc.test.ts` to include a stub:

```ts
{
  reindex: async () => undefined,
  search: async () => [],
}
```

Create these service methods in `src/services/document-service.ts`:

```ts
import { readFile } from "node:fs/promises";
import matter from "gray-matter";

type ImportDocInput = {
  source_path: string;
  source_repo?: string;
  source_ref?: string;
  source_commit?: string;
};

type SearchDocsInput = {
  query?: string;
  tags?: string[];
  doc_type?: string;
  source?: string;
};

  async importDoc(input: ImportDocInput, nowIso = new Date().toISOString()) {
    const rawSource = await readFile(input.source_path, "utf8");
    const parsed = matter(rawSource);

    const imported = normalizeCreateInput(
      {
        id: typeof parsed.data.id === "string" ? parsed.data.id : undefined,
        title: String(parsed.data.title ?? "Imported Document"),
        doc_type: String(parsed.data.doc_type ?? "imported"),
        tags: Array.isArray(parsed.data.tags) ? parsed.data.tags.map(String) : [],
        source: "imported",
        content: parsed.content.trim(),
      },
      nowIso,
    );

    imported.metadata.source_repo = input.source_repo;
    imported.metadata.source_path = input.source_path;
    imported.metadata.source_ref = input.source_ref;
    imported.metadata.source_commit = input.source_commit;
    imported.metadata.imported_at = nowIso;

    await this.store.write(imported);
    await this.indexer.reindex();

    return imported;
  }

  async searchDocs(input: SearchDocsInput) {
    const candidates = await this.indexer.search({
      tags: input.tags,
      doc_type: input.doc_type,
      source: input.source,
    });

    const loaded = await Promise.all(
      candidates.map((candidate) => this.getDoc(candidate.canonicalPath)),
    );

    return loaded
      .filter((document): document is NonNullable<typeof document> => Boolean(document))
      .filter((document) =>
        input.query
          ? document.content.toLowerCase().includes(input.query.toLowerCase()) ||
            document.metadata.title.toLowerCase().includes(input.query.toLowerCase())
          : true,
      );
  }
```

Finally add MCP tools and server registration:

```ts
// src/tools/import-doc.ts
import type { McpServer } from "@modelcontextprotocol/server";
import z from "zod";

import type { DocumentService } from "../services/document-service.js";

const importDocSchema = z.object({
  source_path: z.string().min(1),
  source_repo: z.string().optional(),
  source_ref: z.string().optional(),
  source_commit: z.string().optional(),
});

export function registerImportDocTool(server: McpServer, service: DocumentService): void {
  server.registerTool(
    "import_doc",
    {
      title: "Import Document",
      description: "Import an existing markdown file into the canonical repository without deleting the source",
      inputSchema: importDocSchema,
    },
    async (input) => {
      const imported = await service.importDoc(importDocSchema.parse(input));
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: imported.metadata.id,
                canonical_path: imported.canonicalPath,
                metadata: imported.metadata,
                warnings: [],
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
```

```ts
// src/tools/search-docs.ts
import type { McpServer } from "@modelcontextprotocol/server";
import z from "zod";

import type { DocumentService } from "../services/document-service.js";

const searchDocsSchema = z.object({
  query: z.string().optional(),
  tags: z.array(z.string()).optional(),
  doc_type: z.string().optional(),
  source: z.string().optional(),
});

export function registerSearchDocsTool(server: McpServer, service: DocumentService): void {
  server.registerTool(
    "search_docs",
    {
      title: "Search Documents",
      description: "Search active canonical documents by content and metadata",
      inputSchema: searchDocsSchema,
    },
    async (input) => {
      const results = await service.searchDocs(searchDocsSchema.parse(input));
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              results.map((document) => ({
                id: document.metadata.id,
                canonical_path: document.canonicalPath,
                title: document.metadata.title,
                tags: document.metadata.tags,
              })),
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
```

Register both in `src/server.ts`.

- [ ] **Step 4: Run the import/search tests**

Run:

```bash
node --import tsx --test tests/import-search.test.ts
npm test
npm run typecheck
```

Expected: all commands PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/source-doc.md tests/import-search.test.ts tests/create-doc.test.ts tests/get-doc.test.ts src/lib/indexer.ts src/services/document-service.ts src/tools/import-doc.ts src/tools/search-docs.ts src/server.ts
git commit -m "feat: add import and search tools"
```

## Task 6: Complete The Lifecycle Tools

**Files:**
- Create: `tests/lifecycle.test.ts`
- Create: `src/tools/update-doc.ts`
- Create: `src/tools/deactivate-doc.ts`
- Create: `src/tools/reactivate-doc.ts`
- Create: `src/tools/delete-doc.ts`
- Modify: `src/services/document-service.ts`
- Modify: `src/repository/canonical-doc-store.ts`
- Modify: `src/server.ts`
- Create: `README.md`

- [ ] **Step 1: Write failing lifecycle tests**

```ts
// tests/lifecycle.test.ts
import test from "node:test";
import assert from "node:assert/strict";

import { resolveConfig } from "../src/config.js";
import { CanonicalDocStore } from "../src/repository/canonical-doc-store.js";
import { DocumentService } from "../src/services/document-service.js";
import { makeTempRepo, removeTempRepo } from "./helpers/temp-repo.js";

test("update, deactivate, reactivate, and delete obey canonical lifecycle rules", async () => {
  const repoRoot = await makeTempRepo();

  try {
    const config = resolveConfig({
      MARKDOWN_STORE_REPO: repoRoot,
    });
    const service = new DocumentService(
      new CanonicalDocStore(config),
      { reindex: async () => undefined, search: async () => [] },
    );

    await service.createDoc(
      {
        title: "Lifecycle Doc",
        doc_type: "guide",
        tags: ["lifecycle"],
        content: "# Lifecycle Doc",
      },
      "2026-04-14T18:30:00.000Z",
    );

    const updated = await service.updateDoc("lifecycle-doc", {
      content: "# Lifecycle Doc\n\nUpdated body",
      tags: ["lifecycle", "updated"],
    });
    assert.deepEqual(updated.metadata.tags, ["lifecycle", "updated"]);

    await service.deactivateDoc("lifecycle-doc");
    assert.equal(await service.getDoc("lifecycle-doc"), null);

    await service.reactivateDoc("lifecycle-doc");
    assert.equal((await service.getDoc("lifecycle-doc"))?.metadata.id, "lifecycle-doc");

    await service.deleteDoc("lifecycle-doc");
    assert.equal(await service.getDoc("lifecycle-doc", { includeInactive: true }), null);
  } finally {
    await removeTempRepo(repoRoot);
  }
});
```

- [ ] **Step 2: Verify the lifecycle test fails**

Run:

```bash
node --import tsx --test tests/lifecycle.test.ts
```

Expected: FAIL because the lifecycle methods do not exist.

- [ ] **Step 3: Implement the store helpers needed for updates and deletes**

Add these methods to `src/repository/canonical-doc-store.ts`:

```ts
import { rm } from "node:fs/promises";

  async deleteByPath(canonicalPath: string): Promise<void> {
    const absolutePath = assertWithinRepo(this.config.repoRoot, canonicalPath);
    await rm(absolutePath, { force: true });
  }

  async requireByIdentifier(identifier: string): Promise<CanonicalDocument> {
    const document =
      identifier.includes("/") || identifier.endsWith(".md")
        ? await this.getByPath(identifier)
        : await this.getById(identifier);

    if (!document) {
      throw new Error(`Document '${identifier}' was not found`);
    }

    return document;
  }
```

- [ ] **Step 4: Implement lifecycle methods in the service**

Add these methods to `src/services/document-service.ts`:

```ts
  async updateDoc(
    identifier: string,
    updates: { content?: string; title?: string; tags?: string[] },
    nowIso = new Date().toISOString(),
  ) {
    const current = await this.store.requireByIdentifier(identifier);
    const next = {
      ...current,
      content: updates.content ?? current.content,
      metadata: {
        ...current.metadata,
        title: updates.title ?? current.metadata.title,
        tags: updates.tags ?? current.metadata.tags,
        updated_at: nowIso,
      },
    };

    await this.store.write(next);
    await this.indexer.reindex();
    return next;
  }

  async deactivateDoc(identifier: string, nowIso = new Date().toISOString()) {
    const current = await this.store.requireByIdentifier(identifier);
    const tags = current.metadata.tags.includes("inactive")
      ? current.metadata.tags
      : [...current.metadata.tags, "inactive"];

    return this.updateDoc(identifier, { tags }, nowIso);
  }

  async reactivateDoc(identifier: string, nowIso = new Date().toISOString()) {
    const current = await this.store.requireByIdentifier(identifier);
    const tags = current.metadata.tags.filter((tag) => tag !== "inactive");

    return this.updateDoc(identifier, { tags }, nowIso);
  }

  async deleteDoc(identifier: string) {
    const current = await this.store.requireByIdentifier(identifier);
    await this.store.deleteByPath(current.canonicalPath);
    await this.indexer.reindex();

    return {
      id: current.metadata.id,
      canonicalPath: current.canonicalPath,
    };
  }
```

- [ ] **Step 5: Add MCP tools and a short operator README**

Create the lifecycle tools:

```ts
// src/tools/update-doc.ts
import type { McpServer } from "@modelcontextprotocol/server";
import z from "zod";

import type { DocumentService } from "../services/document-service.js";

const updateDocSchema = z.object({
  identifier: z.string().min(1),
  title: z.string().optional(),
  tags: z.array(z.string()).optional(),
  content: z.string().optional(),
});

export function registerUpdateDocTool(server: McpServer, service: DocumentService): void {
  server.registerTool(
    "update_doc",
    {
      title: "Update Document",
      description: "Update canonical markdown content and metadata",
      inputSchema: updateDocSchema,
    },
    async (input) => {
      const parsed = updateDocSchema.parse(input);
      const updated = await service.updateDoc(parsed.identifier, parsed);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(updated, null, 2) }],
      };
    },
  );
}
```

```ts
// src/tools/deactivate-doc.ts
import type { McpServer } from "@modelcontextprotocol/server";
import z from "zod";

import type { DocumentService } from "../services/document-service.js";

const deactivateDocSchema = z.object({
  identifier: z.string().min(1),
});

export function registerDeactivateDocTool(server: McpServer, service: DocumentService): void {
  server.registerTool(
    "deactivate_doc",
    {
      title: "Deactivate Document",
      description: "Mark a canonical document inactive without deleting it",
      inputSchema: deactivateDocSchema,
    },
    async (input) => {
      const result = await service.deactivateDoc(deactivateDocSchema.parse(input).identifier);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
```

```ts
// src/tools/reactivate-doc.ts
import type { McpServer } from "@modelcontextprotocol/server";
import z from "zod";

import type { DocumentService } from "../services/document-service.js";

const reactivateDocSchema = z.object({
  identifier: z.string().min(1),
});

export function registerReactivateDocTool(server: McpServer, service: DocumentService): void {
  server.registerTool(
    "reactivate_doc",
    {
      title: "Reactivate Document",
      description: "Remove the inactive marker from a canonical document",
      inputSchema: reactivateDocSchema,
    },
    async (input) => {
      const result = await service.reactivateDoc(reactivateDocSchema.parse(input).identifier);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
```

```ts
// src/tools/delete-doc.ts
import type { McpServer } from "@modelcontextprotocol/server";
import z from "zod";

import type { DocumentService } from "../services/document-service.js";

const deleteDocSchema = z.object({
  identifier: z.string().min(1),
});

export function registerDeleteDocTool(server: McpServer, service: DocumentService): void {
  server.registerTool(
    "delete_doc",
    {
      title: "Delete Document",
      description: "Permanently remove a canonical document from the configured repository",
      inputSchema: deleteDocSchema,
    },
    async (input) => {
      const result = await service.deleteDoc(deleteDocSchema.parse(input).identifier);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
```

Create a short `README.md`:

```md
# Markdown Store MCP

An MCP server for agent-first canonical Markdown documents stored in a separate repository.

## Required environment

- `MARKDOWN_STORE_REPO`: absolute path to the canonical docs repository
- `MARKDOWN_STORE_CONTENT_DIR` (optional): defaults to `content`
- `MARKDOWN_STORE_DB_PATH` (optional): defaults to `.markdown-store/markdown.db`

## v1 MCP tools

- `create_doc`
- `get_doc`
- `import_doc`
- `search_docs`
- `update_doc`
- `deactivate_doc`
- `reactivate_doc`
- `delete_doc`
```

Register every remaining tool in `src/server.ts`.

- [ ] **Step 6: Run the lifecycle tests and final verification**

Run:

```bash
node --import tsx --test tests/lifecycle.test.ts
npm test
npm run build
npm run typecheck
```

Expected: all commands PASS.

- [ ] **Step 7: Commit**

```bash
git add tests/lifecycle.test.ts src/repository/canonical-doc-store.ts src/services/document-service.ts src/tools/update-doc.ts src/tools/deactivate-doc.ts src/tools/reactivate-doc.ts src/tools/delete-doc.ts src/server.ts README.md
git commit -m "feat: complete markdown document lifecycle tools"
```

## Spec Coverage Check

- Separate repository as canonical store: covered by Tasks 2 through 6 via `MARKDOWN_STORE_REPO` and repo-bound path enforcement
- Markdown with lightweight front matter: covered by Tasks 1 and 2
- `create_doc` and `get_doc`: covered by Tasks 3 and 4
- `import_doc`, `search_docs`, `update_doc`, `deactivate_doc`, `reactivate_doc`, `delete_doc`: covered by Tasks 5 and 6
- Inactive documents excluded by default: covered by Tasks 4 and 6
- Reindex after every write: covered by Tasks 3, 5, and 6
- No destructive external-file behavior: covered by Task 5 import behavior and Task 6 delete scoping

## Placeholder Scan

This plan intentionally avoids `TODO`, `TBD`, and deferred design markers. The phase boundary is explicit: MVP ends after Task 4.

## Type Consistency Check

- Canonical path stays `content/<doc_type>/<id>.md` throughout all tasks
- inactive state is always encoded as the `inactive` tag
- `DocumentService` remains the single orchestration layer for write + reindex behavior
