# Agent-First Markdown Docs System Design

**Date:** 2026-04-14
**Status:** Approved for planning

## Goal

Design a separate, self-managed documentation system whose primary consumer is AI agents rather than human readers. The system must use simple Markdown as the canonical content format, store documents in a dedicated repository, support indexing and structured querying, and expose document-management operations through an MCP server.

Human browsing is desirable, but it is explicitly secondary and out of scope for the initial implementation.

## Requirements

### Functional requirements

- Use a separate repository as the canonical documentation store
- Store documents as Markdown files with lightweight front matter
- Support creating new canonical documents
- Support importing existing Markdown files into the canonical repository
- Support reading documents by identifier or canonical path
- Support searching documents by full text and metadata
- Support updating document content and metadata
- Support deactivating documents without deleting them
- Support reactivating previously deactivated documents
- Support deleting documents from the canonical repository
- Exclude inactive documents from normal read and search operations
- Reindex documents after every write operation

### Usability requirements

- Avoid introducing a specialized authoring format that requires significant additional learning
- Keep the document format understandable and editable as plain Markdown
- Keep metadata minimal and predictable
- Expose a small, explicit MCP interface that agents can use reliably

### Operational requirements

- Keep the system self-managed to reduce privacy and compliance concerns
- Avoid SaaS dependency as a core requirement
- Use a file-based storage model rather than a database-first wiki product
- Permit optional later addition of a lightweight frontend for browsing and search

### Safety requirements

- MCP tools must operate only on the canonical documentation repository
- MCP tools must not delete external source files
- Destructive operations must be explicit and limited to canonical documents
- Deactivation must be non-destructive and reversible

## Chosen approach

Use a separate Git repository containing Markdown files as the canonical store, index that repository with `MarkdownDB`, and expose document operations through a custom MCP server.

This approach was chosen because it provides:

- plain Markdown as the long-term portable source of truth
- a self-managed and privacy-friendly storage model
- structured querying without replacing the file-based authoring model
- a stable tool surface for AI agents
- optional later support for a lightweight human-facing search and reading UI

Alternatives considered:

1. Separate repository plus custom indexing without `MarkdownDB`
   This would reduce dependency surface, but it would also require rebuilding search and metadata-query capabilities that `MarkdownDB` already provides.
2. Wiki or portal platforms such as BookStack, Wiki.js, or Backstage
   These improve human-facing browsing and administration, but they are less aligned with an agent-first file-based architecture and introduce more platform-specific behavior.
3. SaaS documentation platforms
   These may offer polished authoring and browsing, but they are less compatible with the project's self-managed privacy posture.

## System architecture

### Canonical repository

The documentation system uses a dedicated repository rather than storing canonical documentation inside product repositories.

Properties of the canonical repository:

- all approved documents live in one place
- documents are stored as ordinary Markdown files
- front matter provides the minimum required structured metadata

This design avoids mixing canonical documentation storage with the branch history and layout of unrelated product repositories.

### Index layer

`MarkdownDB` is used as the indexing and query layer for the current state of canonical documents.

Responsibilities of the index layer:

- parse Markdown files
- extract front matter and tags
- support full-text and metadata filtering
- provide a queryable view of active documents

Non-responsibilities of the index layer:

- it is not the canonical store
- it does not define document history behavior
- it does not define the public agent contract

### MCP layer

The MCP server is the only interface agents should use to manage and retrieve canonical documents.

Responsibilities of the MCP layer:

- expose stable document-management operations
- enforce active versus inactive visibility rules
- normalize identifiers and metadata
- trigger reindexing after write operations
- enforce that operations remain within the canonical repository boundary

Agents should not interact directly with raw files or with `MarkdownDB` internals.

### Optional UI

A small frontend for human browsing and search may be added later, but it should read from the same canonical repository and index. It must not become the source of truth.

## Document lifecycle

Each canonical document has one of three practical states:

- `active`
- `inactive`
- `deleted`

### Active

Active documents are indexed, searchable, and retrievable through normal MCP read and query operations.

### Inactive

Inactive documents remain in the canonical repository but are excluded from normal reads and searches. Deactivation is intentionally lightweight. The implementation may represent inactivity using:

- an `inactive` tag in front matter

The MCP layer must enforce the visibility rule based on that tag and exclude inactive documents from normal reads and searches.

### Deleted

Deleted documents are physically removed from the canonical repository and from the index. This is a destructive action and must be represented by an explicit delete operation.

## Import provenance metadata

Document history behavior is out of scope for this design iteration. The system may still store lightweight source-traceability metadata on imported documents so agents can understand where an imported document came from.

Recommended metadata for imported documents:

- `source_repo`
- `source_path`
- `source_ref` or `source_commit`
- `imported_at`

This keeps import traceability lightweight without introducing a history feature or a history-specific MCP contract.

## Metadata model

The metadata model should stay intentionally small in the first version.

Recommended fields:

- `id`
- `title`
- `tags`
- `doc_type`
- `source`
- `created_at`
- `updated_at`

Additional provenance fields may be added for imported documents when relevant:

- `source_repo`
- `source_path`
- `source_ref`
- `source_commit`
- `imported_at`

The implementation may derive some fields automatically as long as the resulting metadata remains predictable for agents and humans.

## MCP tool set

The first version of the MCP interface should focus on canonical document operations only.

### Core v1 tools

#### `create_doc`

Creates a new canonical Markdown document from provided content and metadata.

Intended behavior:

- validate required metadata
- generate or normalize the canonical id or slug
- write the Markdown file into the canonical repository
- update the index
- return the canonical id, path, and normalized metadata

This tool is intended for net-new canonical documents.

#### `import_doc`

Imports an existing Markdown file into the canonical repository.

Intended behavior:

- read a source Markdown file
- normalize metadata and tags for canonical use
- write the resulting file into the canonical repository
- update the index
- return the canonical id, path, normalized metadata, and any warnings

This tool does not delete the source file. Its description may recommend that the caller consider deleting or archiving the original source after verifying the imported copy, but the MCP server must not perform that deletion.

#### `get_doc`

Retrieves a single canonical document by id, slug, or canonical path.

Intended behavior:

- return content and metadata for one active canonical document
- reject or hide inactive documents in normal mode

#### `search_docs`

Searches active canonical documents by full text and structured filters.

Intended behavior:

- support full-text search
- support filtering by tags, type, status, source, and date fields
- return ranked matches with summary information and metadata
- exclude inactive documents by default

#### `update_doc`

Updates the content and/or metadata of an existing canonical document.

Intended behavior:

- load the current canonical document
- apply content changes and/or partial metadata updates
- validate the result
- save the document
- reindex it
- return updated metadata and canonical identifiers

#### `deactivate_doc`

Marks a canonical document as inactive without deleting it.

Intended behavior:

- add the inactive marker to the document metadata
- save the document
- reindex it
- ensure it no longer appears in normal reads and searches

#### `reactivate_doc`

Restores a previously inactive document to active use.

Intended behavior:

- remove the inactive marker
- save the document
- reindex it
- make it visible again to normal reads and searches

#### `delete_doc`

Permanently removes a canonical document from the repository.

Intended behavior:

- delete the canonical file
- remove it from the index
- return confirmation including the removed id and path

This tool is destructive and must operate only inside the canonical repository.

### Optional v2 tools

The following tools are useful extensions but are not required for the first implementation:

- `list_docs`
- `list_related_docs`
- `validate_doc`

## Cross-tool behavior rules

The following rules apply across the MCP interface:

- all operations must be restricted to the canonical documentation repository
- all write operations must trigger reindexing for the affected document
- inactive documents must be excluded from normal read and search operations
- destructive operations must be explicit
- import must never delete the original source file
- tools should return canonical identifiers and paths so agents can chain calls safely

## Transfer workflow

"Transfer" is a workflow, not a first-class MCP tool.

Recommended workflow:

1. call `import_doc` to copy an existing Markdown document into the canonical repository
2. verify the imported canonical document
3. optionally delete or archive the original source outside the MCP interface

This keeps the MCP surface non-destructive with respect to external repositories and files.

## Repository structure expectations

The implementation should define a predictable canonical repository structure, but the exact folder taxonomy may be chosen during planning.

The structure should support:

- stable canonical paths
- straightforward authoring and review
- efficient indexing
- room for future browsing UI generation

Whatever taxonomy is chosen, it should prioritize document purpose over accidental source-repository layout.

## Validation strategy

The implementation should be validated with the narrowest checks that prove the system contract.

### Storage and indexing validation

- create a new canonical document successfully
- import an existing Markdown document successfully
- verify the indexed document is queryable after each write
- verify metadata normalization behaves predictably

### Lifecycle validation

- verify active documents are readable and searchable
- verify deactivated documents remain stored but disappear from normal reads and searches
- verify reactivated documents return to normal visibility
- verify deleted documents are removed from both storage and index

### MCP contract validation

- verify tool outputs return stable canonical ids and paths
- verify operations cannot escape the canonical repository boundary
- verify import does not delete source files
- verify destructive operations are explicit and limited to canonical documents

## Out of scope

The following items are intentionally out of scope for the first implementation:

- automatic deletion of source files after import
- a human-facing frontend or portal as a required first-phase deliverable
- document history features, including `get_doc_history`
- migration of all existing repository documentation into the canonical repository
- advanced workflow automation beyond the agreed MCP tool set

## Open follow-up for planning

The implementation planning phase should make the following concrete decisions:

- the exact front matter schema
- the exact folder taxonomy in the canonical repository
- the exact reindexing strategy after writes
- whether optional v2 tools are deferred entirely or partially included in the first release
