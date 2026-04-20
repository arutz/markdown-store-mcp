import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";

import { MarkdownDB } from "mddb";

import type { ResolvedConfig } from "../config.ts";

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

export class MarkdownDbIndexer implements DocumentIndexer {
  private readonly config: ResolvedConfig;
  private clientPromise: Promise<MarkdownDB> | null = null;

  constructor(config: ResolvedConfig) {
    this.config = config;
  }

  async reindex(): Promise<void> {
    const client = await this.getClient();
    await client.indexFolder({
      folderPath: join(this.config.repoRoot, this.config.contentDir),
    });
  }

  async search(filters: {
    tags?: string[];
    doc_type?: string;
    source?: string;
  }): Promise<SearchResultRow[]> {
    const client = await this.getClient();
    const frontmatterFilters: Record<string, string> = {};

    if (filters.doc_type) {
      frontmatterFilters.doc_type = filters.doc_type;
    }

    if (filters.source) {
      frontmatterFilters.source = filters.source;
    }

    const rows = await client.getFiles({
      tags: filters.tags,
      frontmatter: Object.keys(frontmatterFilters).length > 0 ? frontmatterFilters : undefined,
    });

    return rows.map((row) => ({
      canonicalPath: toCanonicalPath(this.config, String(row.file_path ?? "")),
      metadata: (row.metadata as Record<string, unknown> | null) ?? {},
    }));
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
    await assertSqliteBindingAvailable();

    const client = new MarkdownDB({
      client: "sqlite3",
      connection: {
        filename: dbFile,
      },
      useNullAsDefault: true,
    });

    return client.init();
  }
}

function toCanonicalPath(config: ResolvedConfig, rawFilePath: string): string {
  const normalizedContentDir = config.contentDir.split(/[/\\]+/).join("/");
  const normalizedPath = rawFilePath.split(/[/\\]+/).join("/");

  if (normalizedPath.startsWith("./")) {
    return toCanonicalPath(config, normalizedPath.slice(2));
  }

  if (
    normalizedPath === normalizedContentDir ||
    normalizedPath.startsWith(`${normalizedContentDir}/`)
  ) {
    return normalizedPath;
  }

  if (isAbsolute(rawFilePath)) {
    return relative(config.repoRoot, rawFilePath)
      .split(/[/\\]+/)
      .join("/");
  }

  return join(config.contentDir, rawFilePath)
    .split(/[/\\]+/)
    .join("/");
}

async function assertSqliteBindingAvailable(): Promise<void> {
  try {
    await import("sqlite3");
  } catch {
    throw new Error(
      "sqlite3 native binding is unavailable. Run npm install in the markdown-store worktree."
    );
  }
}
