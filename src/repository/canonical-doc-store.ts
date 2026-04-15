/// <reference types="node" />

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import { buildCanonicalPath, type CanonicalDocument } from "../domain/document.ts";
import { parseFrontmatter, serializeFrontmatter } from "../lib/frontmatter.ts";
import { assertRealPathWithinRepo, assertWithinRepo } from "../lib/path-safety.ts";
import type { ResolvedConfig } from "../config.ts";

export interface StoredCanonicalDocument {
  canonicalPath: string;
  metadata: CanonicalDocument["metadata"];
  content: string;
}

export class CanonicalDocStore {
  private readonly config: ResolvedConfig;

  constructor(config: ResolvedConfig) {
    this.config = config;
  }

  async write(document: CanonicalDocument): Promise<void> {
    const canonicalPath = normalizeCanonicalPath(document.canonicalPath);
    const expectedCanonicalPath = buildCanonicalPath(document.metadata);
    if (canonicalPath !== expectedCanonicalPath) {
      throw new Error(
        `Canonical path "${canonicalPath}" does not match metadata-derived path "${expectedCanonicalPath}"`
      );
    }

    if (await this.hasDocumentWithId(document.metadata.id)) {
      throw new Error(`Duplicate canonical document id "${document.metadata.id}"`);
    }

    const targetPath = this.resolveWritePath(canonicalPath);

    await mkdir(dirname(targetPath), { recursive: true });
    await assertRealPathWithinRepo(this.config.repoRoot, dirname(targetPath));
    await writeFile(targetPath, serializeFrontmatter(document.metadata, document.content), {
      encoding: "utf8",
      flag: "wx",
    });
  }

  async getById(id: string): Promise<StoredCanonicalDocument | null> {
    const matches = await this.findDocumentsById(id);

    if (matches.length === 0) {
      return null;
    }

    if (matches.length > 1) {
      throw new Error(
        `Ambiguous canonical document id "${id}" matches multiple documents: ` +
          `${matches.map((document) => `"${document.canonicalPath}"`).join(", ")}`
      );
    }

    return matches[0];
  }

  async getByPath(relativePath: string): Promise<StoredCanonicalDocument | null> {
    const canonicalPath = normalizeCanonicalPath(relativePath);
    const absolutePath = this.resolveContentPath(canonicalPath);

    return this.readStoredDocument(absolutePath);
  }

  async deleteByPath(relativePath: string): Promise<void> {
    const canonicalPath = normalizeCanonicalPath(relativePath);
    const absolutePath = this.resolveContentPath(canonicalPath);

    try {
      await assertRealPathWithinRepo(this.config.repoRoot, dirname(absolutePath));
      await rm(absolutePath, { force: true });
    } catch (error) {
      if (isFileMissingError(error)) {
        return;
      }

      throw error;
    }
  }

  private async *listMarkdownFiles(directory: string): AsyncGenerator<string> {
    let entries;
    try {
      await assertRealPathWithinRepo(this.config.repoRoot, directory);
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (isFileMissingError(error)) {
        return;
      }

      throw error;
    }

    for (const entry of entries) {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        yield* this.listMarkdownFiles(entryPath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".md")) {
        yield entryPath;
      }
    }
  }

  private async readStoredDocument(filePath: string): Promise<StoredCanonicalDocument | null> {
    try {
      await assertRealPathWithinRepo(this.config.repoRoot, filePath);
      const source = await readFile(filePath, "utf8");
      const document = parseFrontmatter(source, this.toCanonicalPath(filePath));

      return {
        canonicalPath: document.canonicalPath,
        metadata: document.metadata,
        content: document.content,
      };
    } catch (error) {
      if (isFileMissingError(error)) {
        return null;
      }

      throw error;
    }
  }

  private contentRootPath(): string {
    return assertWithinRepo(
      this.config.repoRoot,
      join(this.config.repoRoot, this.config.contentDir)
    );
  }

  private resolveWritePath(canonicalPath: string): string {
    const contentRelativePath = stripCanonicalContentPrefix(canonicalPath);
    const targetPath = join(this.contentRootPath(), contentRelativePath);

    return assertWithinRepo(this.config.repoRoot, targetPath);
  }

  private resolveContentPath(relativePath: string): string {
    const absolutePath = join(this.contentRootPath(), stripCanonicalContentPrefix(relativePath));

    return assertWithinRepo(this.config.repoRoot, absolutePath);
  }

  private async findDocumentsById(id: string): Promise<StoredCanonicalDocument[]> {
    const matches: StoredCanonicalDocument[] = [];

    for await (const filePath of this.listMarkdownFiles(this.contentRootPath())) {
      const storedDocument = await this.readStoredDocument(filePath);
      if (storedDocument?.metadata.id === id) {
        matches.push(storedDocument);
      }
    }

    return matches;
  }

  private async hasDocumentWithId(id: string): Promise<boolean> {
    return (await this.findDocumentsById(id)).length > 0;
  }

  private toCanonicalPath(filePath: string): string {
    const contentRoot = this.contentRootPath();
    const relativeToContentRoot = toRepoRelativePath(contentRoot, filePath);

    if (relativeToContentRoot.startsWith("..") || relativeToContentRoot === ".") {
      throw new Error(`Path "${filePath}" is outside the canonical content root`);
    }

    return `content/${relativeToContentRoot}`;
  }
}

function isFileMissingError(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function toRepoRelativePath(repoRoot: string, absolutePath: string): string {
  return relative(repoRoot, absolutePath)
    .split(/[/\\]+/)
    .join("/");
}

function stripCanonicalContentPrefix(canonicalPath: string): string {
  const normalizedPath = normalizeCanonicalPath(canonicalPath);

  if (normalizedPath === "content") {
    return "";
  }

  if (normalizedPath.startsWith("content/")) {
    return normalizedPath.slice("content/".length);
  }

  throw new Error(`Canonical path must start with "content/": "${canonicalPath}"`);
}

function normalizeCanonicalPath(canonicalPath: string): string {
  const normalizedPath = canonicalPath.split(/[/\\]+/).join("/");

  if (normalizedPath === "content") {
    return normalizedPath;
  }

  if (!normalizedPath.startsWith("content/")) {
    throw new Error(`Canonical path must start with "content/": "${canonicalPath}"`);
  }

  if (
    normalizedPath.includes("/../") ||
    normalizedPath.startsWith("../") ||
    normalizedPath.endsWith("/..")
  ) {
    throw new Error(
      `Canonical path must not escape the canonical content root: "${canonicalPath}"`
    );
  }

  return normalizedPath;
}
