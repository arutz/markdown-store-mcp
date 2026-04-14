# Repository Guide for Agents

## Current Repo State

- This repository is a small TypeScript MCP server named `markdown-store-mcp`.
- The current implementation is still the weather example server:
  - source entrypoint: `src/index.ts`
  - compiled output: `build/index.js`
  - runtime transport: stdio via `@modelcontextprotocol/server`
  - external API usage: `api.weather.gov`
- There is one planning/spec document under `docs/superpowers/specs/2026-04-14-agent-first-markdown-docs-system-design.md`.
- There are currently no test scripts in `package.json`.

## Source of Truth

- Edit `src/` and docs files, not `build/`.
- Treat `build/` as generated output from TypeScript compilation.
- If code changes affect runtime behavior, regenerate `build/` by running the build script.
- Do not hand-edit files under `node_modules/`.

## Required Change Workflow

When you change code or documentation, formatting is part of the change. Do not treat prettier as optional cleanup.

Run the relevant targets after making changes:

1. `npm run prettier:format`
2. `npm run typecheck`
3. `npm run build`

Use `npm run prettier:check` when you want a verification pass in addition to or instead of formatting.

If you only changed Markdown or prose, still run `npm run prettier:format`. If you changed TypeScript, run the full formatting, typecheck, and build flow.

## Package Scripts

- `npm run build`
  - Runs `tsc`
  - Compiles `src/` into `build/`
- `npm run prettier:format`
  - Runs `prettier --write .`
  - This is part of making a change, not a final polish step
- `npm run prettier:check`
  - Runs `prettier --check .`
  - Useful for validation
- `npm run typecheck`
  - Runs `tsc --noEmit`
  - Validates the TypeScript source without writing output

## Formatting and Style

- Prettier is configured in `.prettierrc`.
- Editor settings are in `.editorconfig`.
- Current formatting conventions include:
  - 2-space indentation
  - semicolons
  - double quotes
  - `printWidth` 100
  - LF line endings
- Markdown files allow long lines; do not reflow text unnecessarily unless the edit benefits from it.

## Project Structure

- `src/`
  - authored TypeScript source
- `build/`
  - generated JavaScript output
  - ignored by git
- `docs/superpowers/specs/`
  - planning/spec material for the intended markdown-store direction
- `package.json`
  - npm scripts and package metadata
- `tsconfig.json`
  - TypeScript compilation settings

## Practical Guidance

- Keep changes focused and consistent with the current repo state unless the task explicitly asks for a larger refactor.
- If you update source code in `src/index.ts`, make sure the generated build output is refreshed via `npm run build`.
- Prefer small, explicit edits over broad rewrites.
- Preserve the existing formatting conventions and always run prettier as part of the change.
