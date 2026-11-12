// The derivation record: an appended block in webview.js naming every derived
// edit on disk, so that Restore can reverse what no shipped entry names.

import fs = require("fs");
import path = require("path");
import { isFeatureKey } from "./features";
import type { FeatureKey, PatchDef } from "./features";
import {
  CHAT_SCRIPT_FILE,
  DERIVED_BLOCK,
  patchBlock,
  patchBlockRe,
} from "../blocks/machinery";
import { BONUS_VARIANTS } from "../bonuses/registry";
import type { DerivedBonusKey } from "../bonuses/registry";

// One derivation, recorded in the bundle it patches. `feature` also carries the
// derivable bonuses, which is what lets Restore reverse a bonus edit no
// shipped entry names, and what makes "already patched by derivation"
// recognizable on the next launch.
export interface DerivedPatch {
  feature: FeatureKey | DerivedBonusKey;
  filename: string;
  original: string;
  patched: string;
  description: string;
}

// A recorded derivation of a core patch, which is the only kind the core
// apply/status path may be handed. Stated as a type so that handing it a bonus
// entry is a compile error rather than an opt-in edit applied to someone who
// never asked for it.
export type DerivedCorePatch = DerivedPatch & { feature: FeatureKey };

// Derivations are recorded in the bundle they patch, as one more appended
// block, so the record cannot be separated from the thing it describes: it
// survives a kb-patch reinstall, a new profile and a machine move, and Restore
// removes it with the edits. globalState was the obvious home and the wrong
// one, since losing it leaves an install patched by bytes nothing can name,
// and Restore then reverts nothing.
//
// The payload is base64 so the patched text never appears verbatim in the
// file. A second literal copy would break both the guard's "landed exactly
// once" check and the replace() that Restore does.
//
// One record, in webview.js, covering every file: kiloclaw.js has no block
// machinery of its own, and the harness already strips webview.js's blocks to
// recover pristine bytes.
function derivedRecordBlock(patches: DerivedPatch[]): string {
  const payload = Buffer.from(JSON.stringify(patches), "utf8").toString(
    "base64",
  );
  return patchBlock(
    DERIVED_BLOCK,
    `/* Patterns this extension derived for this build, so Restore can reverse
` +
      `   them. Remove with "Kilo Code KB Patch: Restore Originals". */
` +
      `/* ${payload} */`,
  );
}

export function readDerivedRecordAt(distDir: string): DerivedPatch[] {
  try {
    return readDerivedRecord(
      fs.readFileSync(path.join(distDir, CHAT_SCRIPT_FILE), "utf8"),
    );
  } catch {
    return [];
  }
}

export function readDerivedRecord(js: string): DerivedPatch[] {
  const block = patchBlockRe(DERIVED_BLOCK).exec(js)?.[0];
  if (!block) return [];
  const payload = /\/\* ([A-Za-z0-9+/=]+) \*\//.exec(block)?.[1];
  if (!payload) return [];
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    return Array.isArray(parsed) ? (parsed as DerivedPatch[]) : [];
  } catch {
    return [];
  }
}

export function asPatchDef(p: DerivedCorePatch): PatchDef {
  return {
    feature: p.feature,
    original: p.original,
    patched: p.patched,
    description: p.description,
  };
}

function isCorePatch(p: DerivedPatch): p is DerivedCorePatch {
  return isFeatureKey(p.feature);
}

// Whether a record entry still describes something this file carries. A record
// that outlives what it describes is inert rather than wrong.
function stillApplies(p: DerivedPatch, content: string): boolean {
  return content.includes(p.patched) || content.includes(p.original);
}

// The recorded *core* derivations for one file. Bonus entries are filtered out
// here rather than at each call site, because every caller feeds the core
// apply/status path, which applies what it is given unconditionally: a bonus
// entry leaking in would splice an opt-in edit into a build whose owner never
// asked for it. `recordedBonus` is the door bonus entries come through.
export function recordedFor(
  record: DerivedPatch[],
  filename: string,
  content: string,
): DerivedCorePatch[] {
  return record.filter(
    (p): p is DerivedCorePatch =>
      isCorePatch(p) && p.filename === filename && stillApplies(p, content),
  );
}

// The recorded derivation for one bonus, if this bundle still carries it.
export function recordedBonus(
  record: DerivedPatch[],
  key: DerivedBonusKey,
  content: string,
): DerivedPatch | undefined {
  return record.find(
    (p) =>
      p.feature === key &&
      p.filename === CHAT_SCRIPT_FILE &&
      stillApplies(p, content),
  );
}

// The bonus entries a rewritten record has to carry over: those whose edit is
// still here and which no shipped variant has caught up to. Written for Apply,
// which rewrites the whole record while the bonus reconcilers that own these
// entries run outside it.
export function bonusDerivationsToKeep(
  record: DerivedPatch[],
  distDir: string,
): DerivedPatch[] {
  if (!record.some((p) => !isFeatureKey(p.feature))) return [];
  let content: string;
  try {
    content = fs.readFileSync(path.join(distDir, CHAT_SCRIPT_FILE), "utf8");
  } catch {
    return [];
  }
  // Walks the record rather than the known bonuses, so an entry written by a
  // newer kb-patch for a bonus this build has never heard of is carried over
  // instead of dropped. Dropping it would leave that edit on disk with nothing
  // able to name it, which is the one state Restore cannot undo, and a
  // downgrade is the ordinary way to arrive there.
  return record.filter((p) => {
    if (isFeatureKey(p.feature) || !stillApplies(p, content)) return false;
    const variants = BONUS_VARIANTS[p.feature as DerivedBonusKey];
    if (!variants) return true;
    // A reviewed variant describing the same edit byte-for-byte makes the
    // entry redundant: the bonus reconciler recognizes those bytes on its own
    // from here, and keeping it would leave this install carrying a record
    // block a freshly applied one does not have.
    return !variants.some(
      (v) => v.original === p.original && v.patched === p.patched,
    );
  });
}

// Put `record` into the bundle, replacing whatever record was there, or take
// the block out entirely when there is nothing left to record.
export function withDerivedRecord(js: string, record: DerivedPatch[]): string {
  const stripped = js.replace(patchBlockRe(DERIVED_BLOCK), "");
  return record.length > 0 ? stripped + derivedRecordBlock(record) : stripped;
}
