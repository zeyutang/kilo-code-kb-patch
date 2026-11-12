// Finding the Kilo Code install this editor loads, and its version.

import vscode = require("vscode");
import fs = require("fs");
import path = require("path");
import os = require("os");
import { extensionContext } from "../host/context";

const KILO_EXT_ID = "kilocode.kilo-code";

// Last-resort extensions roots by editor fork, relative to the home directory.
// Used only when the running editor cannot be asked (Kilo Code disabled) and
// this extension is not installed next to it. Every fork keeps its own folder,
// which is why no single path can be hardcoded (VSCodium users hit exactly
// that: Kilo-Org/kilocode#8641).
export const KNOWN_EXT_DIRS = [
  ".vscode/extensions", // VS Code
  ".vscode-insiders/extensions", // VS Code Insiders
  ".vscode-oss/extensions", // VSCodium and other OSS builds
  ".cursor/extensions", // Cursor
  ".windsurf/extensions", // Windsurf
  ".vscode-server/extensions", // VS Code remote server
  ".vscodium-server/extensions", // VSCodium remote server
];

// Kilo extension dirs are named "kilocode.kilo-code-<version>[-<platform>]",
// e.g. "kilocode.kilo-code-7.4.11-darwin-arm64". Pull out the leading dotted
// numeric version as an array of ints so it can be compared and displayed.
export function parseKiloVersion(dirName: string): number[] {
  const m = dirName.match(/kilocode\.kilo-code-(\d+(?:\.\d+)*)/);
  return m ? m[1].split(".").map((n) => parseInt(n, 10)) : [];
}

// Numeric, component-wise version compare. Must NOT be a string sort: as
// strings "7.4.11" < "7.4.9" (they differ at the patch digit, "1" vs "9"), which
// would wrongly rank 7.4.9 above 7.4.11 and pick the older build as "latest".
export function compareKiloVersions(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// Candidate extensions roots, most authoritative first:
//   1. The folder the running editor loaded Kilo Code from (host API). Exact
//      for every fork, portable installs, and --extensions-dir.
//   2. The folder this extension itself is installed in. Kilo Code normally
//      sits next to it, and this signal survives Kilo Code being disabled. In
//      a development host it is the checkout's parent, which contains no Kilo
//      install and falls through.
//   3. Known per-fork default folders.
// Deduplicated, existing directories only, priority order preserved.
export function candidateExtensionRoots(): string[] {
  const roots: string[] = [];
  const kilo = vscode.extensions.getExtension(KILO_EXT_ID);
  if (kilo) roots.push(path.dirname(kilo.extensionUri.fsPath));
  if (extensionContext) {
    roots.push(path.dirname(extensionContext.extensionUri.fsPath));
  }
  for (const rel of KNOWN_EXT_DIRS) {
    roots.push(path.join(os.homedir(), rel));
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const root of roots) {
    const resolved = path.resolve(root);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    if (fs.existsSync(resolved)) out.push(resolved);
  }
  return out;
}

// The first candidate root containing a Kilo Code install wins, so the running
// editor's own install always beats another fork's leftover copy. Within that
// root, the newest version is chosen (numeric compare; see
// compareKiloVersions). An unreadable root falls through instead of failing
// the whole search.
export function findLatestKiloExt(): string | undefined {
  for (const root of candidateExtensionRoots()) {
    let entries: string[];
    try {
      entries = fs.readdirSync(root);
    } catch {
      continue;
    }
    const dirs = entries.filter((d) => d.startsWith("kilocode.kilo-code-"));
    if (dirs.length === 0) continue;
    dirs.sort((a, b) =>
      compareKiloVersions(parseKiloVersion(a), parseKiloVersion(b)),
    );
    return path.join(root, dirs[dirs.length - 1]);
  }
  return undefined;
}

export function extractVersion(extPath: string): string {
  const parts = parseKiloVersion(path.basename(extPath));
  return parts.length > 0 ? parts.join(".") : "unknown";
}
