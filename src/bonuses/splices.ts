// Reconciling each bundle splice with its setting: the reviewed variant where
// one answers for the build, else the recorded or freshly derived edit.

import fs = require("fs");
import path = require("path");
import { replaceLiteral } from "../rules";
import type { DeriveResult } from "../rules";
import type { WebviewVariant } from "../core/features";
import { CHAT_SCRIPT_FILE } from "../blocks/machinery";
import { variantEdit } from "../core/splice";
import {
  BONUS_ENABLED,
  BONUS_RULES,
  BONUS_VARIANTS,
  RULE_CHECKED_BONUSES,
} from "./registry";
import type { DerivedBonusKey } from "./registry";
import {
  readDerivedRecord,
  recordedBonus,
  withDerivedRecord,
} from "../core/record";
import type { DerivedPatch } from "../core/record";
import { deriveBonus, derivedGuard } from "../core/derive";

// The reviewed variant of one bonus that answers for this build, or undefined
// when none does (a future Kilo re-minify), which sends the reconciler to
// derivation. An entry is found by any of its texts: for the two buttons each
// patched string contains its own original, so a patched build shows both,
// while for the math extensions the two are mutually exclusive. The rule runs
// at most once, and only once some entry's text is found, so a build no entry
// recognizes pays nothing here.
export function shippedBonusVariant(
  content: string,
  key: DerivedBonusKey,
): WebviewVariant | undefined {
  const checked = RULE_CHECKED_BONUSES.includes(key);
  let derived: DeriveResult | undefined;
  for (const v of BONUS_VARIANTS[key]) {
    const present =
      content.includes(v.patched) ||
      content.includes(v.original) ||
      v.previous?.some((p) => content.includes(p));
    if (!present) continue;
    if (!checked) return v;
    if (derived === undefined) {
      try {
        derived = BONUS_RULES[key].derive(content);
      } catch {
        derived = {};
      }
    }
    if (derived.original === undefined) return v;
    if (derived.original === v.original && derived.patched === v.patched) {
      return v;
    }
  }
  return undefined;
}

// Whether the edit a record entry describes is on disk now. webview.js is
// passed in, since the caller holds it; the record covers kiloclaw.js too, so
// an entry for another file is checked against that file.
function carried(
  p: DerivedPatch,
  js: string,
  distDir: string,
  others: Map<string, string>,
): boolean {
  if (p.filename === CHAT_SCRIPT_FILE) return js.includes(p.patched);
  let content = others.get(p.filename);
  if (content === undefined) {
    try {
      content = fs.readFileSync(path.join(distDir, p.filename), "utf8");
    } catch {
      content = "";
    }
    others.set(p.filename, content);
  }
  return content.includes(p.patched);
}

// Apply or remove one derivable bonus to match its setting. Returns true only
// when the file actually changed. Fails safe: a missing bundle, or a build no
// shipped variant matches and the rule cannot read, is a silent no-op.
//
// A reviewed variant wins wherever one matches, as everywhere else: a build
// someone has tested gets the bytes that were tested, and there is then
// nothing to record. The derived path is reached only when no shipped variant
// does, and it writes the record in the same write as the edit, because an
// edit this bundle carries and nothing can name is the one state Restore
// cannot undo.
export function reconcileDerivableBonus(
  extPath: string,
  key: DerivedBonusKey,
  // Passed in on the restore path, which rewrites the core files (dropping the
  // record block) before this runs, so reading it here would be too late.
  record?: DerivedPatch[],
): boolean {
  const enabled = BONUS_ENABLED[key]();
  const distDir = path.join(extPath, "dist");
  const webviewPath = path.join(distDir, CHAT_SCRIPT_FILE);
  if (!fs.existsSync(webviewPath)) return false;
  const content = fs.readFileSync(webviewPath, "utf8");
  const known = record ?? readDerivedRecord(content);
  const remembered = recordedBonus(known, key, content);
  const others = new Map<string, string>();
  // Whatever else the record names is carried into a rewrite while its edit is
  // still on disk, and dropped once it is not. That matters on Restore, which
  // hands this the record as it stood before the core edits were reversed:
  // carrying those entries over wrote a record of reverted edits back into the
  // restored bundle, so Restore Originals left it different from what Kilo
  // shipped wherever both the core patches and a bonus had been derived.
  const keep = (updated: string, p: DerivedPatch) =>
    p.feature !== key && carried(p, updated, distDir, others);

  const shipped = shippedBonusVariant(content, key);
  if (shipped) {
    // A derivation of this bonus that differs from the reviewed edit is an
    // older form of it, from a kb-patch whose rule wrote the edit differently.
    // The two buttons keep their anchor beside the insertion, so applying the
    // reviewed edit on top would add a second button. The derived one is
    // reversed first instead, the way a variant's `previous` forms are.
    const stale =
      remembered !== undefined &&
      !(
        remembered.original === shipped.original &&
        remembered.patched === shipped.patched
      ) &&
      content.includes(remembered.patched);
    const base = stale
      ? replaceLiteral(content, remembered.patched, remembered.original)
      : content;
    const edit = variantEdit(base, shipped, enabled);
    let updated = edit ? replaceLiteral(base, edit.from, edit.to) : base;
    if (stale) {
      updated = withDerivedRecord(
        updated,
        known.filter((p) => keep(updated, p)),
      );
    }
    if (updated === content) return false;
    fs.writeFileSync(webviewPath, updated, "utf8");
    return true;
  }

  // Deriving is for turning the bonus on. With the setting off and nothing
  // remembered, there is no edit of ours here to take away.
  const variant =
    remembered ?? (enabled ? deriveBonus(key, content) : undefined);
  if (!variant) return false;
  const edit = variantEdit(content, variant, enabled);
  if (!edit) return false;
  const updated = replaceLiteral(content, edit.from, edit.to);
  if (updated === content) return false;

  // Enabling records the derivation and disabling takes it out. Filtered by
  // feature rather than by identity, so the result holds one entry for this
  // bonus whatever the record arrived with.
  const rest = known.filter((p) => keep(updated, p));
  const next = enabled ? [...rest, variant] : rest;
  const written = withDerivedRecord(updated, next);
  // Removing our own edit puts Kilo's bytes back, so only the adding direction
  // has to earn the write: it must have landed exactly once, and the assembled
  // bundle must still parse.
  if (enabled && !derivedGuard(CHAT_SCRIPT_FILE, [variant])(written)) {
    return false;
  }
  fs.writeFileSync(webviewPath, written, "utf8");
  return true;
}

// The edit a bonus row is read against: the shipped variant that matches this
// build, else the derivation this same bundle records. Without the second, a
// bonus that is working by derivation would read "unavailable" on exactly the
// builds where it is working.
export function bonusVariantIn(
  content: string,
  record: DerivedPatch[],
  key: DerivedBonusKey,
): WebviewVariant | undefined {
  return (
    shippedBonusVariant(content, key) ?? recordedBonus(record, key, content)
  );
}
