// The bonus splices that derive at apply, keyed by their rule names: each
// one's rule, reviewed variants, marker and setting.

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
export const DERIVABLE_BONUSES = [
  "attach-button",
  "math-rendering",
  "raw-markdown",
] as const;
export type DerivedBonusKey = (typeof DERIVABLE_BONUSES)[number];

export const BONUS_RULES: Record<DerivedBonusKey, BonusRule> = {
  "attach-button": ATTACH_RULE,
  "math-rendering": MATH_RULE,
  "raw-markdown": RAW_MARKDOWN_RULE,
};

// The reviewed variants for each derivable bonus, which are what a derivation
// defers to and what eventually retires a recorded one.
export const BONUS_VARIANTS: Record<DerivedBonusKey, WebviewVariant[]> = {
  "attach-button": ATTACH_FILE_BUTTONS,
  "math-rendering": MATH_EXTENSIONS,
  "raw-markdown": RAW_MARKDOWN_TOGGLES,
};

// Text that only the bonus's own patched form contains, checked before its rule
// is allowed to run. This is not belt-and-braces. The math patch appends
// extensions whose last renderer ends in exactly the bytes the rule anchors
// on, so deriving against a bundle this patch already wrote would match the
// tail of its own injection and splice a second copy inside the first. The two
// buttons keep their anchor intact beside the insertion, so a bundle carrying
// an older form of either (a caption since changed, say) would otherwise read
// as pristine and gain a second button.
export const DERIVED_BONUS_MARKERS: Record<DerivedBonusKey, string> = {
  "attach-button": 'selectMention({type:"file-picker"}',
  "math-rendering": 'name:"kbpKatexInlineDollar"',
  "raw-markdown": '"data-slot":"kbp-raw-markdown-toggle"',
};

// The setting each derivable bonus follows.
export const BONUS_ENABLED: Record<DerivedBonusKey, () => boolean> = {
  "attach-button": () => addAttachFileButtonEnabled(),
  "math-rendering": () => chatMathRenderingEnabled(),
  "raw-markdown": () => chatRawMarkdownEnabled(),
};

// The two buttons' reviewed entries cannot pin every name their edit writes by
// their anchor alone. The attach button's anchor is the toolbar, while the
// mention controller, the textarea, its setter and sync, and the icon-button
// it renders with are read from elsewhere; the toggle's raw-text accessor
// likewise. Kilo 7.7.6, 7.7.7 and 7.7.9 are the case in point: they ship the
// toolbar anchor byte for byte while naming a different controller and setter
// (h and Z, then A and W), so an entry recognized by its anchor alone would
// give one of them the other's button, which renders and then throws when
// clicked. An entry of either therefore applies only where the rule, run on
// this build, derives that same edit, or cannot read the build at all, in
// which case the reviewed entry is all there is to go on.
//
// Math needs no such check: its anchor holds every name its edit writes. It
// could not take one either, since its rule run on a patched bundle matches
// the tail of the injected extensions instead (see DERIVED_BONUS_MARKERS).
export const RULE_CHECKED_BONUSES: readonly DerivedBonusKey[] = [
  "attach-button",
  "raw-markdown",
];
