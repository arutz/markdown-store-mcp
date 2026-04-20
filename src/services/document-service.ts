import { readFile } from "node:fs/promises";

import matter from "gray-matter";

import type { CanonicalDocument, CreateDocInput } from "../domain/document.ts";
import { isInactive, normalizeCreateInput } from "../domain/document.ts";
import type { DocumentIndexer } from "../lib/indexer.ts";
import { CanonicalDocStore } from "../repository/canonical-doc-store.ts";

export interface ImportDocInput {
  source_path: string;
  source_repo?: string;
  source_ref?: string;
  source_commit?: string;
}

export interface SearchDocsInput {
  query?: string;
  tags?: string[];
  doc_type?: string;
  source?: string;
}

export class DocumentService {
  private readonly store: CanonicalDocStore;
  private readonly indexer: DocumentIndexer;

  constructor(store: CanonicalDocStore, indexer: DocumentIndexer) {
    this.store = store;
    this.indexer = indexer;
  }

  async createDoc(
    input: CreateDocInput,
    nowIso = new Date().toISOString()
  ): Promise<CanonicalDocument> {
    const document = normalizeCreateInput(input, nowIso);

    await this.store.write(document);
    try {
      await this.indexer.reindex();
    } catch (error) {
      await this.store.deleteByPath(document.canonicalPath);
      throw error;
    }

    return document;
  }

  async getDoc(
    identifier: string,
    options: { includeInactive?: boolean } = {}
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

  async importDoc(
    input: ImportDocInput,
    nowIso = new Date().toISOString()
  ): Promise<CanonicalDocument> {
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
      nowIso
    );

    imported.metadata.source_repo = input.source_repo;
    imported.metadata.source_path = input.source_path;
    imported.metadata.source_ref = input.source_ref;
    imported.metadata.source_commit = input.source_commit;
    imported.metadata.imported_at = nowIso;

    await this.store.write(imported);
    try {
      await this.indexer.reindex();
    } catch (error) {
      await this.store.deleteByPath(imported.canonicalPath);
      throw error;
    }

    return imported;
  }

  async searchDocs(input: SearchDocsInput): Promise<CanonicalDocument[]> {
    const candidates = await this.indexer.search({
      tags: input.tags,
      doc_type: input.doc_type,
      source: input.source,
    });
    const documents = await Promise.all(
      candidates.map((candidate) => this.getDoc(candidate.canonicalPath))
    );
    const query = input.query?.toLowerCase();

    return documents
      .filter((document): document is CanonicalDocument => Boolean(document))
      .filter((document) =>
        query
          ? document.content.toLowerCase().includes(query) ||
            document.metadata.title.toLowerCase().includes(query)
          : true
      );
  }

  async updateDoc(
    identifier: string,
    updates: {
      content?: string;
      title?: string;
      tags?: string[];
    },
    nowIso = new Date().toISOString()
  ): Promise<CanonicalDocument> {
    const current = await this.store.requireByIdentifier(identifier);
    const next: CanonicalDocument = {
      canonicalPath: current.canonicalPath,
      content: updates.content ?? current.content,
      metadata: {
        ...current.metadata,
        title: updates.title ?? current.metadata.title,
        tags: updates.tags ?? current.metadata.tags,
        updated_at: nowIso,
      },
    };

    await this.store.deleteByPath(current.canonicalPath);
    try {
      await this.store.write(next);
      await this.indexer.reindex();
    } catch (error) {
      await this.restoreDocument(current);
      throw error;
    }

    return next;
  }

  async deactivateDoc(
    identifier: string,
    nowIso = new Date().toISOString()
  ): Promise<CanonicalDocument> {
    const current = await this.store.requireByIdentifier(identifier);
    const tags = current.metadata.tags.includes("inactive")
      ? current.metadata.tags
      : [...current.metadata.tags, "inactive"];

    return this.updateDoc(identifier, { tags }, nowIso);
  }

  async reactivateDoc(
    identifier: string,
    nowIso = new Date().toISOString()
  ): Promise<CanonicalDocument> {
    const current = await this.store.requireByIdentifier(identifier);

    return this.updateDoc(
      identifier,
      {
        tags: current.metadata.tags.filter((tag) => tag !== "inactive"),
      },
      nowIso
    );
  }

  async deleteDoc(identifier: string): Promise<{
    id: string;
    canonicalPath: string;
  }> {
    const current = await this.store.requireByIdentifier(identifier);
    await this.store.deleteByPath(current.canonicalPath);

    try {
      await this.indexer.reindex();
    } catch (error) {
      await this.restoreDocument(current);
      throw error;
    }

    return {
      id: current.metadata.id,
      canonicalPath: current.canonicalPath,
    };
  }

  private async restoreDocument(document: CanonicalDocument): Promise<void> {
    try {
      await this.store.deleteByPath(document.canonicalPath);
      await this.store.write(document);
      await this.indexer.reindex();
    } catch {
      // Surface the original failure; this best-effort restore keeps the service conservative.
    }
  }
}
