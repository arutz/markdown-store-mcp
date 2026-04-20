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
