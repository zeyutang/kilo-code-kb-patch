// Writing and reversing literal edits: a file's core patches, and the direction
// one bonus variant has to move to agree with its setting.

import fs = require("fs");
import path = require("path");
import { replaceLiteral } from "../rules";
import type { PatchDef, WebviewVariant } from "./features";

// Which way a reconcile has to move one variant, given the bytes on disk: the
// text to replace and what to put there, or nothing when the file already
// agrees with the setting. "Already patched" is tested before "is pristine",
// because the attach button's patched text contains its original as a suffix.
export function variantEdit(
  content: string,
  variant: WebviewVariant,
  enabled: boolean,
): { from: string; to: string } | undefined {
  const isPatched = content.includes(variant.patched);
  // An older form of this variant is an edit that is present but out of date.
  // It must be rewritten in place, never treated as pristine, or enabling would
  // add a second copy alongside it.
  const stale = isPatched
    ? undefined
    : variant.previous?.find((p) => content.includes(p));
  if (enabled === isPatched && !stale) return undefined;
  return {
    from: stale ?? (enabled ? variant.original : variant.patched),
    to: enabled ? variant.patched : variant.original,
  };
}

export interface PatchResult {
  filename: string;
  applied: string[];
  skipped: string[];
  reverted: string[];
  noChanges: boolean;
}

// `guard`, when given, sees the assembled bytes and can refuse the write. It is
// how a derived edit earns its way onto disk; a reviewed pattern needs no such
// gate and is not charged for one.
export function applyPatches(
  filePath: string,
  patches: PatchDef[],
  guard?: (modified: string) => boolean,
  // Runs on the assembled bytes before the guard sees them, so the derived
  // record lands in the same write as the edits it describes.
  finalize?: (modified: string) => string,
): PatchResult {
  const content = fs.readFileSync(filePath, "utf8");
  let modified = content;
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const p of patches) {
    if (modified.includes(p.patched)) {
      skipped.push(`${p.description} (already patched)`);
      continue;
    }
    if (modified.includes(p.original)) {
      modified = replaceLiteral(modified, p.original, p.patched);
      applied.push(p.description);
      continue;
    }
    if (p.previous && modified.includes(p.previous)) {
      modified = replaceLiteral(modified, p.previous, p.patched);
      applied.push(`${p.description} (upgraded)`);
      continue;
    }
    skipped.push(`${p.description} (pattern not found)`);
  }

  if (finalize) modified = finalize(modified);

  if (modified !== content && guard && !guard(modified)) {
    return {
      filename: path.basename(filePath),
      applied: [],
      skipped: [
        ...skipped,
        ...applied.map((a) => `${a} (rejected before write)`),
      ],
      reverted: [],
      noChanges: true,
    };
  }

  if (modified !== content) {
    fs.writeFileSync(filePath, modified, "utf8");
  }

  return {
    filename: path.basename(filePath),
    applied,
    skipped,
    reverted: [],
    noChanges: modified === content,
  };
}

export function restorePatches(
  filePath: string,
  patches: PatchDef[],
  finalize?: (modified: string) => string,
): PatchResult {
  const content = fs.readFileSync(filePath, "utf8");
  let modified = content;
  const reverted: string[] = [];
  const skipped: string[] = [];

  for (const p of patches) {
    if (modified.includes(p.patched)) {
      modified = replaceLiteral(modified, p.patched, p.original);
      reverted.push(p.description);
      continue;
    }
    if (p.previous && modified.includes(p.previous)) {
      modified = replaceLiteral(modified, p.previous, p.original);
      reverted.push(`${p.description} (previous version)`);
      continue;
    }
    if (modified.includes(p.original)) {
      skipped.push(`${p.description} (already original)`);
      continue;
    }
    skipped.push(`${p.description} (neither pattern found)`);
  }

  if (finalize) modified = finalize(modified);

  if (modified !== content) {
    fs.writeFileSync(filePath, modified, "utf8");
  }

  return {
    filename: path.basename(filePath),
    applied: [],
    skipped,
    reverted,
    noChanges: modified === content,
  };
}
