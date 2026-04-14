import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { MarkdownDB } from "mddb";

import type { ResolvedConfig } from "../config.ts";

export interface DocumentIndexer {
  reindex(): Promise<void>;
}

export class MarkdownDbIndexer implements DocumentIndexer {
  private clientPromise: Promise<MarkdownDB> | null = null;

  constructor(private readonly config: ResolvedConfig) {}

  async reindex(): Promise<void> {
    const client = await this.getClient();
    await client.indexFolder({
      folderPath: join(this.config.repoRoot, this.config.contentDir),
    });
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
      useNullAsDefault: true,
    });

    return client.init();
  }
}
