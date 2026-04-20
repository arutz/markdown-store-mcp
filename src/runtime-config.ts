import { parseArgs } from "node:util";

export type RuntimeTransport = "http" | "stdio";

export interface RuntimeConfig {
  transport: RuntimeTransport;
  host: string;
  port: number;
  endpointPath: "/mcp";
}

export function resolveRuntimeConfig(
  argv: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env
): RuntimeConfig {
  const parsed = parseArgs({
    args: argv,
    options: {
      transport: { type: "string" },
      host: { type: "string" },
      port: { type: "string" },
    },
    allowPositionals: false,
  });

  const transportValue = resolveTransport(parsed.values.transport, env.MARKDOWN_STORE_TRANSPORT);
  const host = parsed.values.host ?? env.MARKDOWN_STORE_HOST ?? "127.0.0.1";
  const port = resolvePort(parsed.values.port ?? env.MARKDOWN_STORE_PORT ?? "3000");

  if (transportValue === "http" && host !== "127.0.0.1") {
    throw new Error("host must be 127.0.0.1 for HTTP mode");
  }

  return {
    transport: transportValue,
    host,
    port,
    endpointPath: "/mcp",
  };
}

function resolveTransport(
  cliValue: string | undefined,
  envValue: string | undefined
): RuntimeTransport {
  const value = cliValue ?? envValue ?? "http";
  if (value !== "http" && value !== "stdio") {
    throw new Error('transport must be "http" or "stdio"');
  }

  return value;
}

function resolvePort(rawPort: string | undefined): number {
  const portValue = rawPort ?? "";
  if (!/^\d+$/.test(portValue)) {
    throw new Error("port must be a positive integer");
  }

  const port = Number(portValue);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("port must be a positive integer");
  }

  return port;
}
