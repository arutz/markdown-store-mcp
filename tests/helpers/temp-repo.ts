import { mkdir, rm } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TempRepo {
  repoRoot: string;
  removeTempRepo: () => Promise<void>;
}

export async function makeTempRepo(): Promise<TempRepo> {
  const repoRoot = await mkdtemp(join(tmpdir(), "markdown-store-mcp-"));
  await mkdir(join(repoRoot, "content"), { recursive: true });
  await mkdir(join(repoRoot, ".markdown-store"), { recursive: true });

  return {
    repoRoot,
    removeTempRepo: async () => {
      await rm(repoRoot, { recursive: true, force: true });
    },
  };
}
