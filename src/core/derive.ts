// Apply-time derivation: which features no shipped variant answers, what a
// rule's output has to satisfy before it may write, and the patch set each
// file is handed.

import fs = require("fs");
import vm = require("vm");
import { ID, RULES, countIn, esc } from "../rules";
import type { DeriveResult } from "../rules";
import { FEATURE_GATES } from "./features";
import type { FeatureKey, PatchDef } from "./features";
import { CHAT_SCRIPT_FILE } from "../blocks/machinery";
import { BONUS_RULES, DERIVED_BONUS_MARKERS } from "../bonuses/registry";
import type { DerivedBonusKey } from "../bonuses/registry";
import { asPatchDef, recordedFor } from "./record";
import type { DerivedCorePatch, DerivedPatch } from "./record";

// --- Apply-time derivation ---------------------------------------------------
//
// Every shipped pattern in src/patterns/ was produced by a shape rule in
// src/rules/, re-derived from the build it targets. Those rules also run here,
// so a Kilo release that only re-minifies is patched on the spot instead of
// waiting for a kb-patch release: of the twelve retargets between 7.4.20 and
// 7.6.1, nine changed nothing but these literals.
//
// The shipped literals stay the fast path, and they are the reviewed one: a
// build someone has actually tested gets the bytes that were tested. Derivation
// only answers for a feature no shipped variant recognizes, which before this
// was the state that left a user on stock Kilo until a release landed.
//
// What a derivation has to satisfy before it is allowed to write, standing in
// for the human who used to read every pattern before it shipped:
//   - its shape matches exactly once in the whole bundle (src/rules/), and
//     the derived original then occurs exactly once as literal bytes
//   - every symbol it reports is a whole token of the text it matched, or of a
//     hop the rule matched within HOP_LIMIT bytes of the edit, so the edit
//     cannot name something the build binds elsewhere; this is the 7.4.22
//     aliasing failure and the 7.6.2 drift stated as properties rather than
//     review steps
//   - the feature's gate agrees the build has the behavior being fixed
//   - the assembled file parses
//   - re-applying is a no-op and reversing reproduces the original bytes
export const DERIVABLE: readonly FeatureKey[] = [
  "chat-input",
  "chat-escape",
  "mention-escape",
  "chat-history",
  "perm-keys",
  "perm-escape",
  "perm-approve",
  "doc-escape",
  "kiloclaw-edit",
  "kiloclaw-chat",
];

// A feature is unresolved when nothing known names a site for it in this
// build: no variant's original, patched or previous text is present. That is
// the same reading statusForFile calls "missing", and the only state
// derivation is allowed to answer.
export function resolveFeatures(
  content: string,
  patches: PatchDef[],
): { resolved: Map<FeatureKey, PatchDef>; unresolved: Set<FeatureKey> } {
  // Grouped and short-circuited per feature. Asking every variant separately
  // is the O(variants) x 21 MB scan that cost activation 500 ms before 1.24.1,
  // and it would land on the apply path here; the array is newest-first, so
  // the variant that answers sits at index 0 or 1 on a recognized build.
  const byFeature = new Map<FeatureKey, PatchDef[]>();
  for (const p of patches) {
    const variants = byFeature.get(p.feature);
    if (variants) variants.push(p);
    else byFeature.set(p.feature, [p]);
  }
  const resolved = new Map<FeatureKey, PatchDef>();
  const unresolved = new Set<FeatureKey>();
  for (const [key, variants] of byFeature) {
    const answer = variants.find(
      (p) =>
        content.includes(p.patched) ||
        content.includes(p.original) ||
        (p.previous !== undefined && content.includes(p.previous)),
    );
    if (answer) resolved.set(key, answer);
    else unresolved.add(key);
  }
  return { resolved, unresolved };
}

export function unresolvedFeatures(
  content: string,
  patches: PatchDef[],
): Set<FeatureKey> {
  return resolveFeatures(content, patches).unresolved;
}

// How far from the edit a rule may reach for a symbol its anchor does not
// contain. The furthest any admitted hop sits on a build checked (7.4.17
// through 7.8.9) is the attach button's mention row, 4.5 KB before the
// toolbar, while the 7.6.2 drift that bound the permission dialog's button
// instead of the toolbar's walked 18 KB. So this bound is not a tuning knob: it
// is the line between "the same component" and "wherever the next match
// happened to be".
export const HOP_LIMIT = 8192;

// Whether `text` contains `name` as a whole identifier rather than inside a
// longer one. The earlier substring test passed a one-character name whenever
// it sat inside some word of the span (the raw-text accessor `o` passed on the
// `o` of `onClick`), which is the property failing while the check reads it as
// holding.
function hasToken(text: string, name: string): boolean {
  return new RegExp(`(^|[^\\w$])${esc(name)}([^\\w$]|$)`).test(text);
}

const IDENTIFIER = new RegExp(`^${ID}$`);

type Admission =
  | {
      edit: {
        original: string;
        patched: string;
        description?: (version: string) => string;
      };
    }
  | { refused: string };

// One rule's output, admitted only if it satisfies every property above that
// can be judged from the rule alone. The file-level ones (parses, reverses)
// are checked once on the assembled result by deriveFor. A refusal says why,
// for the harness; the extension only asks whether there is an edit.
export function admissibility(
  rule: { key: string; derive: (c: string) => DeriveResult },
  content: string,
): Admission {
  const gate = FEATURE_GATES[rule.key as FeatureKey];
  if (gate && !gate(content)) {
    return { refused: "this build predates the behavior it fixes" };
  }

  let result: DeriveResult;
  try {
    result = rule.derive(content);
  } catch (e) {
    return { refused: `the rule threw: ${String(e)}` };
  }
  if (result.error) return { refused: result.error };
  if (result.matches !== undefined) {
    return { refused: `${result.matches} matches for its shape` };
  }
  if (
    result.original === undefined ||
    result.patched === undefined ||
    result.patched === result.original
  ) {
    return { refused: "the rule derived no edit" };
  }
  if (countIn(content, result.original) !== 1) {
    return { refused: "the derived original is not unique" };
  }
  if (content.includes(result.patched)) {
    return { refused: "this build already carries the edit" };
  }

  // Locality: every hop the rule read a symbol from is really there, and near
  // enough to the edit to be the same component.
  const at = content.indexOf(result.original);
  const hops = result.hops ?? [];
  for (const h of hops) {
    if (!content.startsWith(h.text, h.index)) {
      return { refused: "a hop the rule reported is not in this build" };
    }
    const distance = Math.abs(h.index - at);
    if (distance > HOP_LIMIT) {
      return {
        refused: `it reads a symbol ${distance} bytes from the edit (limit ${HOP_LIMIT})`,
      };
    }
  }
  // Self-containment: every name the edit writes is a whole token of the text
  // the rule matched, the anchor or a hop, so the edit cannot bind a symbol
  // this build spells differently elsewhere. A captured expression (a guard,
  // a handler body) is not a name and is only required to be present.
  const evidence = [result.original, ...hops.map((h) => h.text)];
  for (const [name, symbol] of Object.entries(result.symbols ?? {})) {
    if (typeof symbol !== "string") continue;
    const found = IDENTIFIER.test(symbol)
      ? evidence.some((text) => hasToken(text, symbol))
      : evidence.some((text) => text.includes(symbol));
    if (!found) {
      return { refused: `it names ${name} (${symbol}) from outside its match` };
    }
  }
  return {
    edit: {
      original: result.original,
      patched: result.patched,
      description: result.description,
    },
  };
}

export function admissible(
  rule: { key: string; derive: (c: string) => DeriveResult },
  content: string,
):
  | {
      original: string;
      patched: string;
      description?: (version: string) => string;
    }
  | undefined {
  const admission = admissibility(rule, content);
  return "edit" in admission ? admission.edit : undefined;
}

// Derived patterns for one file: what the rules can add for features no
// shipped or remembered variant recognizes. The whole set is proved on an
// in-memory copy before any of it is offered, so a bundle is never written in a
// state no one has checked.
export function deriveFor(
  filename: string,
  content: string,
  version: string,
  known: PatchDef[],
  // The caller has usually resolved this already; recomputing it costs a
  // second pass over every stale variant, which on an unrecognized build is
  // the single most expensive thing here.
  wantedFeatures?: Set<FeatureKey>,
  // Core only, by construction: the loop below walks RULES filtered by
  // DERIVABLE, which is typed against FEATURE_ORDER. A bonus derivation comes
  // from deriveBonus and goes nowhere near the core patch set.
): DerivedCorePatch[] {
  const wanted = wantedFeatures ?? unresolvedFeatures(content, known);
  if (wanted.size === 0) return [];

  const found: DerivedCorePatch[] = [];
  for (const rule of RULES) {
    if (rule.file !== filename) continue;
    if (!DERIVABLE.includes(rule.key as FeatureKey)) continue;
    if (!wanted.has(rule.key as FeatureKey)) continue;
    const edit = admissible(rule, content);
    if (!edit) continue;
    // A rule with several live forms says what the matched one does, which
    // the rule-level description cannot (mention-escape's 7.7.0+ form only
    // clears Kilo's own record rather than writing one).
    const describe = edit.description ?? rule.description;
    found.push({
      feature: rule.key as FeatureKey,
      filename,
      original: edit.original,
      patched: edit.patched,
      description: `${describe(version)} [derived]`,
    });
  }
  if (found.length === 0) return [];

  // Invertibility, which is what Restore depends on, without a second pass
  // over 21 MB: each edit rewrites bytes that occur once, so reversing it is
  // exact as long as the text it leaves behind is also unique and does not
  // collide with another edit's.
  const texts = new Set<string>();
  for (const p of found) {
    if (countIn(content, p.patched) !== 0) return [];
    if (texts.has(p.original) || texts.has(p.patched)) return [];
    texts.add(p.original);
    texts.add(p.patched);
  }
  // Whether the assembled file parses is checked on the bytes applyPatches is
  // about to write, so that assembly happens once. See derivedGuard.
  return found;
}

// One bonus splice worked out from the build, for a bonus whose rule is
// self-contained (see DERIVABLE_BONUSES). Same admissibility bar as a core
// derivation, plus the marker check that keeps the rule away from bytes this
// patch already wrote. The caller still has to prove the assembled file parses
// and that the edit landed once, which derivedGuard does.
export function deriveBonus(
  key: DerivedBonusKey,
  content: string,
): DerivedPatch | undefined {
  if (content.includes(DERIVED_BONUS_MARKERS[key])) return undefined;
  const edit = admissible(BONUS_RULES[key], content);
  if (!edit) return undefined;
  return {
    feature: key,
    filename: CHAT_SCRIPT_FILE,
    original: edit.original,
    patched: edit.patched,
    description: `${key} [derived]`,
  };
}

// The gate applyPatches runs before writing a file any derivation touched: the
// result has to parse, and each derived edit has to have landed exactly once so
// Restore can reverse it. A splice can be unique and still leave the bundle
// unparseable, which is not worth discovering on a user's install.
export function derivedGuard(
  filename: string,
  derived: DerivedPatch[],
): (modified: string) => boolean {
  return (modified) => {
    for (const p of derived) {
      if (countIn(modified, p.patched) !== 1) return false;
    }
    try {
      new vm.Script(modified, { filename });
    } catch {
      return false;
    }
    return true;
  };
}

// The patterns to hand apply/restore for one file: everything shipped, plus
// what earlier runs derived and this file still shows, plus anything newly
// derivable. Deriving is skipped for restore, which only ever needs to
// recognize what is already there.
export function patchSetFor(
  filename: string,
  filePath: string,
  version: string,
  shipped: PatchDef[],
  mode: "apply" | "restore",
  record: DerivedPatch[] = [],
): {
  patches: PatchDef[];
  derived: DerivedPatch[];
  remembered: DerivedPatch[];
} {
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return { patches: shipped, derived: [], remembered: [] };
  }

  // A derivation the shipped set now describes byte-for-byte is redundant.
  // The record exists so Restore can reverse edits no entry names, and a
  // retarget is exactly when entries arrive for what the previous release had
  // to derive: an install that derived five patches under 2.0.3 on Kilo 7.7.1
  // gets shipped entries for all five here. Keeping them would leave such an
  // install carrying a record block a freshly applied one does not have, which
  // is a real divergence between the two even though both restore cleanly.
  // The test is byte-identity on both sides, so nothing is dropped unless the
  // shipped entry reverses precisely the same edit.
  const remembered = recordedFor(record, filename, content).filter(
    (p) =>
      !shipped.some(
        (s) => s.original === p.original && s.patched === p.patched,
      ),
  );
  // Remembered first, for the same reason as in webviewNeedsPatching: on a
  // build only derivation can answer for, the stored variants are 21 MB of
  // scanning each that cannot match.
  const known = [...remembered.map(asPatchDef), ...shipped];
  // Only the variant that answers for each feature is passed on. The stored
  // array holds every release's variant of every behavior, and at most one of
  // them can match a given build (the invariant the per-release aliasing sweep
  // proves and applyPatches already rests on), so handing over all 128 makes
  // the applier re-scan 21 MB for 118 patterns that cannot match.
  const { resolved, unresolved } = resolveFeatures(content, known);
  const fresh =
    mode === "apply" && unresolved.size > 0
      ? deriveFor(filename, content, version, known, unresolved)
      : [];
  return {
    patches: [...resolved.values(), ...fresh.map(asPatchDef)],
    derived: fresh,
    // What the rewritten record has to keep: entries still doing a job here.
    remembered,
  };
}
