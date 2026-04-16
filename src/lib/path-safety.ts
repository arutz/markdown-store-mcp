/// <reference types="node" />

import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

export function assertWithinRepo(repoRoot: string, targetPath: string): string {
  const resolvedRepoRoot = resolve(repoRoot);
  const resolvedTargetPath = resolve(targetPath);
  const relativePath = relative(resolvedRepoRoot, resolvedTargetPath);

  if (relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath))) {
    return resolvedTargetPath;
  }

  throw new Error(`Path "${targetPath}" is outside the canonical repo root "${resolvedRepoRoot}"`);
}

export async function assertRealPathWithinRepo(
  repoRoot: string,
  targetPath: string
): Promise<string> {
  const [resolvedRepoRoot, resolvedTargetPath] = await Promise.all([
    realpath(repoRoot),
    realpath(targetPath),
  ]);
  const relativePath = relative(resolvedRepoRoot, resolvedTargetPath);

  if (relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath))) {
    return resolvedTargetPath;
  }

  throw new Error(
    `Real path "${resolvedTargetPath}" is outside the canonical repo root "${resolvedRepoRoot}"`
  );
}
