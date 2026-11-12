// The bonuses, one entry each: what the status page, the restart notice and a
// restart need to know of a bonus, and, for the ones that splice the bundle,
// what apply-time derivation needs to know of the splice.

import { ATTACH_RULE, MATH_RULE, RAW_MARKDOWN_RULE } from "../rules";
import type { BonusRule } from "../rules";
import type { WebviewVariant } from "../core/features";
import { ATTACH_FILE_BUTTONS } from "../patterns/attach-button";
import { MATH_EXTENSIONS } from "../patterns/math-rendering";
import { RAW_MARKDOWN_TOGGLES } from "../patterns/raw-markdown";
import {
  addAttachFileButtonEnabled,
  chatMathRenderingEnabled,
  chatRawMarkdownEnabled,
} from "../host/settings";
import type { RestartScope } from "../host/restart";

interface Bonus {
  // The bonus's row on the status page.
  label: string;
  // Its name in the restart notice, which lists what a pass "updated".
  notice: string;
  // The restart that puts a change to it into effect (see RestartScope).
  needs: RestartScope;
}

// Keyed by the names a reconcile pass reports its changes under. They live in
// memory only, unlike the splice keys below, which the derivation record
// carries on disk.
export const BONUSES = {
  attach: {
    label: "Prompt toolbar: + button opens the file picker",
    notice: "attach-file button",
    needs: "extensions",
  },
  title: {
    label: 'Editor title: group the "Open in Tab" icon',
    notice: "editor title icon",
    needs: "window",
  },
  math: {
    label: "Chat: render $...$ and \\[...\\] math",
    notice: "math rendering",
    needs: "extensions",
  },
  typography: {
    label: "Chat history: size and font of the agent's response",
    notice: "chat typography",
    needs: "extensions",
  },
  rawMarkdown: {
    label: "Chat: button to read a reply's markdown source",
    notice: "markdown source button",
    needs: "extensions",
  },
} satisfies Record<string, Bonus>;
export type BonusKey = keyof typeof BONUSES;

// The order the status page lists the bonuses in.
export const STATUS_ORDER: readonly BonusKey[] = [
  "attach",
  "title",
  "math",
  "typography",
  "rawMarkdown",
];

// The order the restart notice names them in, which differs from the status
// page's.
export const NOTICE_ORDER: readonly BonusKey[] = [
  "title",
  "attach",
  "math",
  "typography",
  "rawMarkdown",
];

// Which bonus files a reconcile pass actually rewrote. Anything true here is a
// change the running session does not reflect until the restart it needs (see
// RestartScope): the window for `title`, the extension host for the rest.
export type BonusChanges = Record<BonusKey, boolean>;

// A pass that rewrote nothing.
export function noBonusChanges(): BonusChanges {
  return {
    title: false,
    attach: false,
    math: false,
    typography: false,
    rawMarkdown: false,
  };
}

interface Splice {
  rule: BonusRule;
  // The reviewed variants, which are what a derivation defers to and what
  // eventually retires a recorded one.
  variants: WebviewVariant[];
  // Text that only the bonus's own patched form contains, checked before its
  // rule is allowed to run. This is not belt-and-braces. The math patch
  // appends extensions whose last renderer ends in exactly the bytes the rule
  // anchors on, so deriving against a bundle this patch already wrote would
  // match the tail of its own injection and splice a second copy inside the
  // first. The two buttons keep their anchor intact beside the insertion, so a
  // bundle carrying an older form of either (a caption since changed, say)
  // would otherwise read as pristine and gain a second button.
  marker: string;
  // The setting the bonus follows.
  enabled: () => boolean;
  // The two buttons' reviewed entries cannot pin every name their edit writes
  // by their anchor alone. The attach button's anchor is the toolbar, while
  // the mention controller, the textarea, its setter and sync, and the
  // icon-button it renders with are read from elsewhere; the toggle's raw-text
  // accessor likewise. Kilo 7.7.6, 7.7.7 and 7.7.9 are the case in point: they
  // ship the toolbar anchor byte for byte while naming a different controller
  // and setter (h and Z, then A and W), so an entry recognized by its anchor
  // alone would give one of them the other's button, which renders and then
  // throws when clicked. An entry of either therefore applies only where the
  // rule, run on this build, derives that same edit, or cannot read the build
  // at all, in which case the reviewed entry is all there is to go on.
  //
  // Math needs no such check: its anchor holds every name its edit writes. It
  // could not take one either, since its rule run on a patched bundle matches
  // the tail of the injected extensions instead (see `marker`).
  ruleChecked: boolean;
}

// The three bonus splices are held to the same bar as the core patches (see
// core/derive.ts). The math extensions name only symbols inside the text their
// rule matched. The attach button and the markdown-source toggle each name
// symbols their anchor does not contain (the button the mention controller,
// the textarea, its setter and sync, and the neighbouring icon-button; the
// toggle the part's raw-text accessor), which used to keep them on reviewed
// literals alone. Their rules now read each of those from a hop pinned to the
// same component by properties no re-minify can move (see
// src/rules/bonus.js), and admission checks that every hop lies near the edit,
// so a hop that drifts into another component refuses rather than binding the
// wrong name. The attach button's pre-7.6.0 text-button form still
// reaches megabytes away for its sprite component and is refused on that
// ground, which is fine: every build that has it ships a reviewed entry.
//
// Keyed by their rule names, which the derivation record writes to disk.
export const SPLICES = {
  "attach-button": {
    rule: ATTACH_RULE,
    variants: ATTACH_FILE_BUTTONS,
    marker: 'selectMention({type:"file-picker"}',
    enabled: () => addAttachFileButtonEnabled(),
    ruleChecked: true,
  },
  "math-rendering": {
    rule: MATH_RULE,
    variants: MATH_EXTENSIONS,
    marker: 'name:"kbpKatexInlineDollar"',
    enabled: () => chatMathRenderingEnabled(),
    ruleChecked: false,
  },
  "raw-markdown": {
    rule: RAW_MARKDOWN_RULE,
    variants: RAW_MARKDOWN_TOGGLES,
    marker: '"data-slot":"kbp-raw-markdown-toggle"',
    enabled: () => chatRawMarkdownEnabled(),
    ruleChecked: true,
  },
} satisfies Record<string, Splice>;
export type DerivedBonusKey = keyof typeof SPLICES;

// One field of every splice, keyed like SPLICES, which is how the derivation
// code and the harness read them.
function field<T>(pick: (splice: Splice) => T): Record<DerivedBonusKey, T> {
  return Object.fromEntries(
    Object.entries(SPLICES).map(([key, splice]) => [key, pick(splice)]),
  ) as Record<DerivedBonusKey, T>;
}

export const DERIVABLE_BONUSES = Object.keys(
  SPLICES,
) as readonly DerivedBonusKey[];
export const BONUS_RULES = field((s) => s.rule);
export const BONUS_VARIANTS = field((s) => s.variants);
export const DERIVED_BONUS_MARKERS = field((s) => s.marker);
export const BONUS_ENABLED = field((s) => s.enabled);
export const RULE_CHECKED_BONUSES: readonly DerivedBonusKey[] =
  DERIVABLE_BONUSES.filter((key) => SPLICES[key].ruleChecked);
