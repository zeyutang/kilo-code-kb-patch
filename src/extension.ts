// The entry point: activation, which registers the commands and the settings
// listener and then asks whether to apply, and the __test surface the offline
// harness loads (tools/lib/load.js). What each command does is in
// core/commands.ts.

import vscode = require("vscode");
import {
  FEATURE_GATES,
  FEATURE_LABELS,
  MENTION_SPACED_TRIGGER,
  RETIRED_FILES,
} from "./core/features";
import { PATCHES } from "./patterns";
import { ATTACH_FILE_BUTTONS } from "./patterns/attach-button";
import { MATH_EXTENSIONS } from "./patterns/math-rendering";
import { RAW_MARKDOWN_TOGGLES } from "./patterns/raw-markdown";
import { setExtensionContext } from "./host/context";
import {
  BONUS_SETTING_DEFAULTS,
  KATEX_DEFAULT_EM,
  SETTINGS,
} from "./host/settings";
import {
  KNOWN_EXT_DIRS,
  compareKiloVersions,
  extractVersion,
  findLatestKiloExt,
  parseKiloVersion,
} from "./install/locate";
import {
  CHAT_CSS_BLOCKS,
  CHAT_CSS_CORE,
  CHAT_SCRIPT_CORE,
  CHAT_SCRIPT_FILE,
  CHAT_STYLE_FILE,
  stripChatCss,
  stripChatScript,
} from "./blocks/machinery";
import {
  CHAT_SCROLL_ANCHORS,
  CHAT_SCROLL_RULE,
  CHAT_STYLE_ANCHORS,
  HEADING_LADDER,
  KATEX_UNPOSITIONING,
  MATH_CLIP_ANCHORS,
  MATH_CLIP_RULE,
  RAW_MARKDOWN_RULES,
  chatCssApplied,
  chatCssBlock,
  chatCssCoreStatus,
  chatCssRules,
  coreCssDecision,
  headingRules,
  readChatStyleValues,
  readMathClip,
  readPromptSizing,
  reconcileChatStyle,
} from "./blocks/chat-style";
import {
  CHAT_SCROLL_SCRIPT_ANCHORS,
  HOVER_GUARD_ANCHORS,
  chatScriptBlock,
  chatScrollScript,
  hoverGuardAnchorsPresent,
  hoverGuardScript,
  readScrollThreshold,
  reconcileChatScript,
} from "./blocks/chat-script";
import { applyPatches, restorePatches } from "./core/splice";
import {
  BONUS_RULES,
  BONUS_VARIANTS,
  DERIVABLE_BONUSES,
  DERIVED_BONUS_MARKERS,
} from "./bonuses/registry";
import {
  bonusDerivationsToKeep,
  readDerivedRecord,
  readDerivedRecordAt,
  recordedFor,
  withDerivedRecord,
} from "./core/record";
import type { DerivedPatch } from "./core/record";
import {
  DERIVABLE,
  admissibility,
  deriveBonus,
  deriveFor,
  derivedGuard,
  patchSetFor,
} from "./core/derive";
import {
  OPEN_IN_TAB_ORIGINAL,
  OPEN_IN_TAB_RENAMED,
  OPEN_IN_TAB_TITLE_RE,
  reconcileOpenInTabTitle,
} from "./bonuses/open-in-tab";
import {
  reconcileDerivableBonus,
  shippedBonusVariant,
} from "./bonuses/splices";
import { notifyBonusRestart } from "./host/restart";
import {
  computeBonusStatus,
  forgetSession,
  reconcileBonuses,
} from "./bonuses/session";
import { computeStatus } from "./core/status";
import {
  refreshStatusPanel,
  replaceStaleStatusPanel,
} from "./host/status-view";
import {
  clearSettled,
  installFingerprint,
  isSettled,
  markSettled,
  ownBuildIdentity,
} from "./install/fingerprint";
import {
  patchInstall,
  runPatch,
  startupPass,
  suspendReconcile,
  webviewNeedsPatching,
} from "./core/commands";

export function activate(context: vscode.ExtensionContext): void {
  setExtensionContext(context);

  context.subscriptions.push(
    vscode.commands.registerCommand("kiloCodeKbPatch.apply", () =>
      runPatch("apply"),
    ),
    vscode.commands.registerCommand("kiloCodeKbPatch.restore", () =>
      runPatch("restore"),
    ),
    vscode.commands.registerCommand("kiloCodeKbPatch.status", () =>
      runPatch("status"),
    ),
  );

  // Ahead of every early return below, because this window may be carrying a
  // status page frozen by the same host restart that brought us back.
  replaceStaleStatusPanel();

  // Auto-patch on activation if not yet patched
  const extPath = findLatestKiloExt();
  if (!extPath) return;

  // Registered before the fingerprint check below, so a settings change is
  // still honoured on a launch that skipped the startup reconcile.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (suspendReconcile) return;
      if (!e.affectsConfiguration("kiloCodeKbPatch")) return;
      notifyBonusRestart(reconcileBonuses(extPath));
      markSettled(extPath);
      refreshStatusPanel();
    }),
  );

  const pass = startupPass(extPath);
  if (pass.settled) return;
  const startupBonuses = pass.bonuses;
  if (!pass.needsPatching) {
    notifyBonusRestart(startupBonuses);
    return;
  }

  // A Kilo update resets every patched file at once, so the apply prompt and
  // the bonus restart offer would land together, and the bonus restart button
  // clicked first restarts a session whose keyboard patches were never
  // applied. Show only the Apply/Ignore prompt now. Apply's completion
  // notification carries the restart, sized for the bonus changes too (the
  // manifest among them needs the window); on Ignore or dismissal those
  // changes still need their restart, so the held offer surfaces then.
  vscode.window
    .showInformationMessage(
      `Kilo Code KB Patch: v${extractVersion(extPath)} detected, apply patches?`,
      "Apply",
      "Ignore",
    )
    .then((choice) => {
      if (choice === "Apply") {
        runPatch("apply", startupBonuses).then((offered) => {
          if (!offered) notifyBonusRestart(startupBonuses);
        });
      } else {
        notifyBonusRestart(startupBonuses);
      }
    });
}

export function deactivate(): void {}

// Exposed for the offline test harness only; the extension host ignores extra
// exports, so this has no effect at runtime.
export const __test = {
  PATCHES,
  RETIRED_FILES,
  // The offline harness has no extension host, so it supplies its own context
  // to exercise the derivation record that Apply writes and Restore reads.
  setExtensionContext,
  webviewNeedsPatching,
  FEATURE_LABELS,
  FEATURE_GATES,
  MENTION_SPACED_TRIGGER,
  computeStatus,
  applyPatches,
  restorePatches,
  reconcileOpenInTabTitle,
  OPEN_IN_TAB_TITLE_RE,
  OPEN_IN_TAB_ORIGINAL,
  OPEN_IN_TAB_RENAMED,
  // The bundle splices by the per-bonus names the harness has always called
  // them by, each the generic reconciler or lookup with its key.
  reconcileAttachFileButton: (extPath: string, record?: DerivedPatch[]) =>
    reconcileDerivableBonus(extPath, "attach-button", record),
  matchingAttachFileButton: (content: string) =>
    shippedBonusVariant(content, "attach-button"),
  ATTACH_FILE_BUTTONS,
  MATH_EXTENSIONS,
  matchingMathExtension: (content: string) =>
    shippedBonusVariant(content, "math-rendering"),
  reconcileMathRendering: (extPath: string, record?: DerivedPatch[]) =>
    reconcileDerivableBonus(extPath, "math-rendering", record),
  // Every splice by its key, for the harness's passes over all of them.
  DERIVABLE_BONUSES,
  BONUS_RULES,
  BONUS_VARIANTS,
  DERIVED_BONUS_MARKERS,
  reconcileDerivableBonus,
  deriveBonus,
  shippedBonusVariant,
  bonusDerivationsToKeep,
  RAW_MARKDOWN_TOGGLES,
  matchingRawMarkdownToggle: (content: string) =>
    shippedBonusVariant(content, "raw-markdown"),
  reconcileRawMarkdownToggle: (extPath: string, record?: DerivedPatch[]) =>
    reconcileDerivableBonus(extPath, "raw-markdown", record),
  RAW_MARKDOWN_RULES,
  CHAT_STYLE_FILE,
  CHAT_CSS_BLOCKS,
  stripChatCss,
  CHAT_SCRIPT_FILE,
  CHAT_SCRIPT_CORE,
  stripChatScript,
  CHAT_SCROLL_SCRIPT_ANCHORS,
  readScrollThreshold,
  chatScrollScript,
  HOVER_GUARD_ANCHORS,
  hoverGuardAnchorsPresent,
  hoverGuardScript,
  chatScriptBlock,
  reconcileChatScript,
  CHAT_STYLE_ANCHORS,
  KATEX_DEFAULT_EM,
  HEADING_LADDER,
  headingRules,
  readChatStyleValues,
  chatCssRules,
  chatCssBlock,
  chatCssApplied,
  reconcileChatStyle,
  CHAT_CSS_CORE,
  CHAT_SCROLL_RULE,
  CHAT_SCROLL_ANCHORS,
  readPromptSizing,
  MATH_CLIP_RULE,
  MATH_CLIP_ANCHORS,
  readMathClip,
  KATEX_UNPOSITIONING,
  coreCssDecision,
  chatCssCoreStatus,
  BONUS_SETTING_DEFAULTS,
  SETTINGS,
  computeBonusStatus,
  DERIVABLE,
  installFingerprint,
  ownBuildIdentity,
  isSettled,
  markSettled,
  clearSettled,
  patchInstall,
  startupPass,
  reconcileBonuses,
  forgetSession,
  admissibility,
  deriveFor,
  derivedGuard,
  readDerivedRecord,
  readDerivedRecordAt,
  withDerivedRecord,
  recordedFor,
  patchSetFor,
  parseKiloVersion,
  compareKiloVersions,
  KNOWN_EXT_DIRS,
  extractVersion,
};
