/// <reference types="node" />

import { resolve } from "node:path";

export interface ResolvedConfig {
  repoRoot: string;
  contentDir: string;
  indexDbPath: string;
}

export function resolveConfig(env: NodeJS.ProcessEnv = process.env): ResolvedConfig {
  const repoRootEnv = env.MARKDOWN_STORE_REPO;
  if (!repoRootEnv) {
    throw new Error("MARKDOWN_STORE_REPO is required");
  }

  const repoRoot = resolve(repoRootEnv);
  const contentDir = env.MARKDOWN_STORE_CONTENT_DIR ?? "content";
  const indexDbPath = env.MARKDOWN_STORE_DB_PATH ?? ".markdown-store/markdown.db";

  return {
    repoRoot,
    contentDir,
    indexDbPath,
  };
}
