import type { CanonicalDocument, CreateDocInput } from "../domain/document.ts";
import { isInactive, normalizeCreateInput } from "../domain/document.ts";
import type { DocumentIndexer } from "../lib/indexer.ts";
import { CanonicalDocStore } from "../repository/canonical-doc-store.ts";

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
    await this.indexer.reindex();

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
}
