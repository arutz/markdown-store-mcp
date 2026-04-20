# Localhost HTTP Transport And Logging Design

**Date:** 2026-04-20
**Status:** Approved for planning

## Goal

Design an updated runtime model for the Markdown Store MCP server so it can run as a localhost HTTP daemon by default while still supporting `stdio` as an explicit compatibility mode.

The design must also add simple structured observability for both tool calls and lower-level MCP protocol traffic, emitted as JSON logs on stdout.

## Requirements

### Functional requirements

- Run the MCP server as a local HTTP server process by default
- Keep `stdio` transport available as an explicit runtime option
- Use one shared MCP server and document-service core regardless of transport
- Bind the HTTP listener to localhost only
- Continue exposing the existing MCP tool surface without transport-specific behavior changes

### Observability requirements

- Emit structured JSON log lines to stdout
- Log every tool call with the tool name and provided arguments
- Truncate each logged top-level argument value to 250 characters
- Emit debug logs for MCP protocol calls in addition to tool-call logs
- Keep log formatting deterministic and centralized

### Operational requirements

- Support selecting transport through CLI flags
- Provide clear defaults so the binary can run as a local daemon with no extra flags
- Fail fast with clear startup errors when runtime configuration is invalid or the HTTP port cannot be bound
- Keep the HTTP mode small and self-managed rather than introducing a heavier web framework

### Safety requirements

- The HTTP server must bind only to `127.0.0.1` in this phase
- Logging must not break MCP request handling even if log serialization fails
- Tool errors must continue to be returned through MCP responses rather than only appearing in logs
- Logging should avoid dumping unbounded payloads or full document bodies beyond the agreed truncation policy

## Chosen approach

Use a single binary with a shared MCP core and two transport modes:

- default `http` mode bound to `127.0.0.1`
- explicit `stdio` mode selected with a CLI flag

Add a small runtime/bootstrap layer that selects the transport, starts the local HTTP listener when needed, and wires structured logging around:

- tool execution
- inbound MCP protocol messages
- outbound MCP protocol messages
- startup and shutdown lifecycle events

This approach was chosen because it preserves compatibility with process-based MCP integrations while making the server usable as a local sidecar daemon without forking the domain or tool logic.

Alternatives considered:

1. Separate binaries for HTTP and `stdio`
   This would keep each entrypoint simple, but it would spread startup behavior and documentation across multiple commands and increase maintenance overhead.
2. HTTP-only runtime
   This would simplify startup behavior, but it would drop compatibility with clients that still expect `stdio`.
3. Directly exposing a non-localhost network port
   This was rejected for now because the server has write access to the canonical repository and does not yet need the authentication and operational controls expected of a shared network service.

## System architecture

### Shared MCP core

The existing shared core remains the center of the design:

- config resolution
- canonical document store
- indexer
- document service
- MCP tool registration

The core should not branch on transport. Whether a request arrives over HTTP or `stdio`, the same tool registration and service behavior should execute.

### Runtime bootstrap

The process entrypoint should become a thin bootstrap layer responsible for:

- parsing runtime config from CLI arguments and environment variables
- constructing shared services once
- selecting the requested transport
- starting the chosen transport
- emitting startup logs

This keeps runtime concerns separate from MCP tool registration and document operations.

### HTTP transport mode

HTTP mode should:

- be the default when no transport flag is provided
- bind to `127.0.0.1`
- listen on a configurable port with a stable default
- use the MCP SDK's streamable HTTP transport
- accept normal MCP initialize and tool-call flows through the HTTP endpoint

This is intentionally a local daemon mode, not a public service design.

### Stdio transport mode

`stdio` mode should remain available for compatibility and preserve the current process-oriented integration style.

Its responsibilities are unchanged:

- connect the MCP server to `StdioServerTransport`
- process requests through the same shared MCP core
- participate in the same structured logging model where practical

## Configuration model

The runtime configuration should add transport-focused fields while preserving the current document-store settings.

Recommended runtime fields:

- `transport`
- `host`
- `port`
- existing markdown store path settings

Recommended behavior:

- default `transport` to `http`
- default `host` to `127.0.0.1`
- default `port` to a fixed localhost port
- allow CLI flags to override defaults
- allow environment variables as a fallback for non-CLI launches

The design should keep the configuration surface intentionally small so local usage stays easy to understand.

## Logging design

All monitoring output should be newline-delimited JSON written to stdout.

### Log event structure

Every log event should include a common base shape:

- timestamp
- level
- event
- transport when known

Additional fields should be attached per event type.

### Tool-call logs

Tool-call log events should be emitted at `info` level and include:

- tool name
- truncated input arguments
- success or error outcome
- optional duration in milliseconds

The logged arguments should preserve object structure where possible, but each top-level value must be truncated to 250 characters before serialization.

### MCP protocol debug logs

Protocol logs should be emitted at `debug` level and include:

- direction such as `inbound` or `outbound`
- JSON-RPC method when present
- request or response id when present
- truncated params or payload summary

These logs are intended to make transport and protocol behavior observable without overwhelming the normal monitoring stream.

### Lifecycle logs

Lifecycle events should be emitted for:

- process startup
- transport selection
- HTTP bind success
- shutdown
- fatal startup failure

These records make the daemon mode easier to operate and diagnose.

### Truncation and serialization policy

Truncation should happen in one shared logging utility rather than ad hoc in tool handlers or transport code.

Required behavior:

- truncate each top-level argument value to 250 characters
- preserve primitive values where they are already shorter than the limit
- avoid recursive unbounded serialization of very large nested payloads
- fall back safely if serialization itself throws

If logging fails, the server should emit a minimal fallback log event rather than failing the request.

## Request and message flow

### Tool execution flow

For a tool call, the runtime should:

1. receive the MCP request through the selected transport
2. emit an inbound protocol debug log
3. dispatch the request to the existing MCP server and tool handler
4. emit a tool-call `info` log around the actual tool execution
5. emit the corresponding outbound protocol debug log for the MCP response

This keeps the two log streams complementary:

- protocol logs explain MCP traffic
- tool-call logs explain application behavior

### Error flow

If a tool or transport operation fails:

- the existing MCP error behavior should remain authoritative
- logs should record the failure with structured context
- startup failures should exit the process clearly
- request-level failures should not crash the process by default

## Testing strategy

The design should be validated with targeted tests instead of broad end-to-end infrastructure.

### Runtime and configuration tests

- verify that the default transport is HTTP
- verify that `--transport stdio` selects the legacy mode
- verify localhost host and port config parsing
- verify invalid runtime config fails clearly

### Logging tests

- verify tool-call events are emitted as JSON lines
- verify protocol debug events are emitted as JSON lines
- verify top-level argument truncation to 250 characters
- verify logging fallback behavior when serialization fails

### HTTP transport tests

- verify the HTTP server binds to localhost
- verify initialize requests are accepted through HTTP
- verify a representative tool call succeeds through HTTP
- verify protocol logs are emitted for HTTP request handling

### Compatibility tests

- verify existing `stdio` behavior still works
- verify existing tool/service tests continue passing unchanged

## Documentation changes

The README should be updated to describe:

- HTTP as the default runtime mode
- how to opt into `stdio`
- localhost binding behavior
- the available runtime flags and environment variables
- the structured JSON logging behavior

This is especially important because the runtime model becomes part of how users deploy and connect to the server.

## Out of scope

The following items are intentionally out of scope for this design iteration:

- exposing the server to non-localhost network interfaces
- authentication or authorization for remote clients
- persistent external log sinks or log shipping
- a richer metrics stack beyond stdout JSON logs
- changing the document-service or tool semantics beyond transport and observability wiring

## Open follow-up for planning

The implementation planning phase should make the following concrete decisions:

- the exact CLI flag names and environment variable names
- the default localhost port number
- the concrete HTTP route shape for the MCP endpoint
- whether outbound protocol logging should occur at the transport wrapper, server wrapper, or both
- the exact JSON schema for log events so tests can assert it precisely
