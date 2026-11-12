// The core behaviors (their order, labels and gates) and the types the pattern
// tables, the status view and derivation share.

import { katexContainsTwin } from "../blocks/chat-style";

export interface PatchDef {
  // Which logical behavior this pattern implements. Declared rather than
  // inferred from `description`: the status view groups every version's variant
  // of a behavior under one row, and a variant it cannot place is dropped from
  // the view and from the verdict, which would report a feature as fine (or as
  // absent) when it is neither. Typing it against FEATURE_ORDER turns that into
  // a compile error instead.
  feature: FeatureKey;
  original: string;
  patched: string;
  previous?: string;
  // Free-form, for humans and for the apply/restore logs only. Naming the
  // release's minified symbol here is useful documentation, not a classifier.
  description: string;
}

export interface FilePatches {
  filename: string;
  patches: PatchDef[];
}

// A patch target Kilo may legitimately stop shipping. Kilo retired KiloClaw in
// 7.7.3, dropping dist/kiloclaw.js and dist/kiloclaw.css along with the
// commands and every occurrence of the name, so from that build on the two
// features that patched that bundle have nothing to patch.
//
// That is a fact about the build rather than a broken install or a pattern
// gone stale, and saying so costs two things otherwise. The status view would
// show a bare "file not found" where it can instead report those features as
// "not needed", and the launch fingerprint, which refuses to record an install
// it cannot fully stat, would never settle: every launch on every 7.7.3
// install would pay the full ~100 ms check for an answer that cannot change.
// The variants themselves stay, because 7.7.2 and earlier still ship the file.
export const RETIRED_FILES = new Set(["kiloclaw.js"]);

// A single logical behavior can have several minified variants (one per Kilo
// version). Collapse them so the status view shows each behavior once, using a
// version-agnostic label, rather than one line per per-version variant.
export const FEATURE_ORDER = [
  "chat-input",
  "chat-escape",
  "mention-escape",
  "chat-history",
  "chat-scroll",
  "math-clip",
  "hover-guard",
  "perm-keys",
  "perm-escape",
  "perm-approve",
  "doc-escape",
  "kiloclaw-edit",
  "kiloclaw-chat",
] as const;

// The set of behaviors the status view knows how to display. Every PatchDef must
// name one of these, so adding a patch for a new behavior without registering it
// here fails to compile rather than vanishing from the status view at runtime.
export type FeatureKey = (typeof FEATURE_ORDER)[number];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  "chat-input": "Chat input: Enter adds a newline, Cmd/Ctrl+Enter sends",
  "chat-escape": "Chat Escape: aborts only when the input is empty",
  "mention-escape": "Mention menu Escape: stays closed while you keep typing",
  "chat-history": "Chat history: Cmd/Ctrl+Up/Down, not bare Up/Down",
  "chat-scroll": "Chat scroll: history stays at the bottom while you type",
  "math-clip": "Math clip: math in chat adds no empty scroll space",
  "hover-guard":
    "Hover guard: the hidden cursor highlights nothing while you type",
  "perm-keys": "Permission prompt: typing keys stay in the input",
  "perm-escape": "Permission Escape: acts only when the input is empty",
  "perm-approve": "Permission approve: Cmd/Ctrl+Enter always, Space when empty",
  "doc-escape": "Document Escape: non-empty input is not aborted",
  "kiloclaw-edit": "KiloClaw edit: Cmd/Ctrl+Enter saves",
  "kiloclaw-chat": "KiloClaw chat: Cmd/Ctrl+Enter sends",
};

// The @-mention trigger Kilo has shipped since 7.5.11, which lets a query run
// across spaces (Kilo-Org/kilocode#13592). A regex literal survives
// minification, so it doubles as the fingerprint of the behavior the
// mention-escape feature answers.
export const MENTION_SPACED_TRIGGER = "/(?:^|\\s)@(?![^\\n]*\\s@)([^\\n]*)$/";

// A feature that fixes something Kilo only does from a certain release on is
// not "missing" on the builds before it: there is nothing there to patch. Nor
// is one whose fix Kilo has since shipped itself, on the builds after that. A
// gate says whether a build has the Kilo behavior the feature answers, read
// off the file the feature patches and keyed on text the minifier cannot
// rename, and a feature with no gate is wanted on every build. The status view
// reports a gated-out feature as "unneeded", which draws neutrally and stays
// out of the verdict.
export const FEATURE_GATES: Partial<
  Record<FeatureKey, (content: string) => boolean>
> = {
  "mention-escape": (content) => content.includes(MENTION_SPACED_TRIGGER),
  "math-clip": (css) => !katexContainsTwin(css),
};

// "patched": the patched text is present. "unpatched": the original text is
// present (Apply will fix it). "missing": no known variant of this feature was
// found, so its minified symbols changed for this Kilo version and the pattern
// needs re-targeting. "missing" is what the status view must surface rather than
// dropping the row, so an out-of-date pattern is visible instead of silent.
// "unneeded": the feature's gate says this build does not have the Kilo
// behavior it fixes, either because it predates the behavior or because it
// already carries the fix, so no variant is expected to match.
export type FeatureState = "patched" | "unpatched" | "missing" | "unneeded";

// One release's form of an opt-in webview.js edit. Both bonuses that splice
// that bundle (the attach button and the math extensions) are lists of these,
// newest first, and share one reconciler (see bonuses/splices.ts).
export interface WebviewVariant {
  original: string;
  patched: string;
  // Earlier patched forms of this same variant, newest first. Applying
  // original→patched on top of an older form would leave the old edit in place
  // and inject a second one (the attach button's patched string even ends with
  // its own original, so it would not be recognised as patched at all).
  // Listing the old forms lets an upgrade rewrite the existing edit instead.
  previous?: string[];
}

export function isFeatureKey(key: string): key is FeatureKey {
  return (FEATURE_ORDER as readonly string[]).includes(key);
}
