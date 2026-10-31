import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../../..");
const skip = new Set(["node_modules", ".git", "target", ".next", "dist", "coverage"]);

function files(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (skip.has(entry)) continue;
    const path = join(dir, entry);
    const info = statSync(path);
    if (info.isDirectory()) found.push(...files(path));
    else if (/\.(ts|tsx|rs|md|json|toml|yml|yaml|mjs|css|example)$/.test(entry)) found.push(path);
  }
  return found;
}

describe("secret scan", () => {
  it("does not commit private keys or live API tokens", () => {
    const hits: string[] = [];
    for (const path of files(root)) {
      const text = readFileSync(path, "utf8");
      if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) hits.push(path);
      if (/ed25519:[1-9A-HJ-NP-Za-km-z]{40,}/.test(text)) hits.push(path);
      if (/\bsk-[A-Za-z0-9]{20,}/.test(text)) hits.push(path);
    }
    expect(hits).toEqual([]);
  });
});
