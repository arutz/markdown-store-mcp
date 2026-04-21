# Markdown Store MCP

An MCP server for agent-first canonical Markdown documents stored in a separate repository.

## Required environment

- `MARKDOWN_STORE_REPO`: absolute path to the canonical docs repository
- `MARKDOWN_STORE_CONTENT_DIR` (optional): defaults to `content`
- `MARKDOWN_STORE_DB_PATH` (optional): defaults to `.markdown-store/markdown.db`
- `MARKDOWN_STORE_TRANSPORT` (optional): `http` or `stdio`, defaults to `http`
- `MARKDOWN_STORE_HOST` (optional): defaults to `127.0.0.1`
- `MARKDOWN_STORE_PORT` (optional): defaults to `3000`

## Runtime modes

Build the server first:

```bash
npm run build
```

Default localhost HTTP daemon:

```bash
MARKDOWN_STORE_REPO=/absolute/path/to/docs-repo node build/index.js
```

Explicit `stdio` mode:

```bash
MARKDOWN_STORE_REPO=/absolute/path/to/docs-repo node build/index.js --transport stdio
```

Default local MCP endpoint:

- `http://127.0.0.1:3000/mcp`

## Logging

The server emits newline-delimited JSON to stdout for:

- startup and shutdown lifecycle events
- MCP protocol traffic
- tool-call monitoring

Each logged top-level argument or payload value is truncated to 250 characters.

## v1 MCP tools

- `create_doc`
- `get_doc`
- `import_doc`
- `search_docs`
- `update_doc`
- `deactivate_doc`
- `reactivate_doc`
- `delete_doc`
