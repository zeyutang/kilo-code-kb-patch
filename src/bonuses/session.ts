// One reconcile pass over every bonus, what this host is still waiting to
// restart for, and the bonus rows of the status view.

import vscode = require("vscode");
import fs = require("fs");
import path = require("path");
import {
  chatFontFamily,
  chatMathRenderingEnabled,
  chatRawMarkdownEnabled,
  clampSetting,
} from "../host/settings";
import {
  CHAT_SCRIPT_FILE,
  CHAT_STYLE_FILE,
  stripChatCss,
} from "../blocks/machinery";
import {
  chatCssApplied,
  chatCssRules,
  readChatStyleValues,
  reconcileChatStyle,
} from "../blocks/chat-style";
import type { DerivedBonusKey } from "./registry";
import { readDerivedRecord } from "../core/record";
import type { DerivedPatch } from "../core/record";
import { deriveBonus } from "../core/derive";
import {
  OPEN_IN_TAB_RENAMED,
  OPEN_IN_TAB_TITLE_RE,
  reconcileOpenInTabTitle,
} from "./open-in-tab";
import {
  bonusVariantIn,
  reconcileAttachFileButton,
  reconcileMathRendering,
  reconcileRawMarkdownToggle,
} from "./splices";
import type { RestartScope } from "../host/restart";

// Bonus (opt-in) items are reported in their own status section and never feed
// the verdict. "on": enabled and in effect. "off": not enabled, with nothing of
// it left in the session, drawn as a neutral white circle. "pending": the files
// on disk agree with the setting, but the window the user is looking at was
// built before they did, so the change is not in effect yet. Pending covers a
// bonus just switched on and one just switched off alike, since either way what
// is on screen still says otherwise. "unapplied": enabled, and this Kilo build
// has the code for it, but the files on disk do not carry the edit, so no
// restart would show it. That is the bonus counterpart of a core row's
// "unpatched", it takes the same hint, and Apply Patches is what writes it.
// It used to read "pending" too, which told the reader to restart for an edit
// that was never written. "unavailable": enabled but this Kilo build has no
// matching code. `needs` is the restart that puts a change into effect, and
// the pending hint names it.
export type BonusState = "on" | "off" | "pending" | "unapplied" | "unavailable";
export interface BonusStatus {
  label: string;
  state: BonusState;
  needs: RestartScope;
}

// Which bonus files a reconcile pass actually rewrote. Anything true here is a
// change the running session does not reflect until the restart it needs (see
// RestartScope): the window for `title`, the extension host for the rest.
export interface BonusChanges {
  title: boolean;
  attach: boolean;
  math: boolean;
  typography: boolean;
  rawMarkdown: boolean;
}

// The bonus files this extension host has rewritten since it started. Kilo
// reads its bundle and stylesheet when its view is rebuilt, which is what the
// restart offered alongside these changes does, so a file rewritten after that
// point is on disk but not yet in the session on screen. The status page reports
// those rows as pending rather than done.
//
// Tracked at this layer rather than inside the individual reconcilers, which
// stay pure disk operations that a caller with no session to speak of (the
// offline harness) can use for exactly what they say they do. The flags need no
// clearing: the restart that settles them ends the host that holds them.
const bonusAwaitingRestart: BonusChanges = {
  title: false,
  attach: false,
  math: false,
  typography: false,
  rawMarkdown: false,
};

// Fold one reconcile pass's result into what this session is still waiting on.
export function noteBonusChanges(changed: BonusChanges): void {
  const keys = Object.keys(bonusAwaitingRestart) as (keyof BonusChanges)[];
  for (const key of keys) {
    if (changed[key]) bonusAwaitingRestart[key] = true;
  }
}

// A row's state once the session is accounted for. A bonus whose file this host
// rewrote reads pending until the restart that puts it into effect, whether it
// was switched on or off. The "unavailable" and "unapplied" readings are about
// what is on disk rather than the session, so they stand either way.
function pendingIfUnseen(state: BonusState, awaiting: boolean): BonusState {
  return awaiting && (state === "on" || state === "off") ? "pending" : state;
}

// Whether the last reconcile pass stopped short: a reconciler threw, which for
// these means a file it could not read or write. Such a pass has not found the
// bonuses in agreement with their settings, so it cannot be what an install is
// recorded as settled on (see markSettled), or the launch shortcut would skip
// every later attempt at the write that failed.
export let bonusReconcileFailed = false;

// What a host restart does to the state above, for the offline harness: the
// flags live and die with the host, and the harness has one process where the
// editor has a host per session.
export function forgetSession(): void {
  const keys = Object.keys(bonusAwaitingRestart) as (keyof BonusChanges)[];
  for (const key of keys) bonusAwaitingRestart[key] = false;
  bonusReconcileFailed = false;
}

// One reconcile pass over every bonus. Each reconciler fails safe on its own
// (an unreadable file reads as "unchanged"), so a broken manifest cannot stop
// the webview bundle from reconciling or vice versa.
//
// The math bonus spans two files, a bundle splice for the extensions and a
// stylesheet block for their size, so either one moving counts as that bonus
// having changed.
export function reconcileBonuses(extPath: string): BonusChanges {
  let title = false;
  let attach = false;
  let math = false;
  let typography = false;
  let rawMarkdown = false;
  let failed = false;
  try {
    title = reconcileOpenInTabTitle(extPath);
  } catch {
    failed = true;
  }
  try {
    attach = reconcileAttachFileButton(extPath);
  } catch {
    failed = true;
  }
  try {
    math = reconcileMathRendering(extPath);
  } catch {
    failed = true;
  }
  try {
    rawMarkdown = reconcileRawMarkdownToggle(extPath);
  } catch {
    failed = true;
  }
  try {
    const css = reconcileChatStyle(extPath);
    typography = css.typography;
    math = math || css.math;
    rawMarkdown = rawMarkdown || css["raw-markdown"];
  } catch {
    failed = true;
  }
  bonusReconcileFailed = failed;
  const changed = { title, attach, math, typography, rawMarkdown };
  noteBonusChanges(changed);
  return changed;
}

// Status for the bonus items, for the status panel only. Each item's state
// comes from its setting first (not enabled -> "off"), then from whether the file
// actually reflects it. Bonus state never affects the verdict.
export function computeBonusStatus(extPath: string): BonusStatus[] {
  const cfg = vscode.workspace.getConfiguration("kiloCodeKbPatch");
  const read = (p: string) =>
    fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";

  // The three bundle splices read the same file, and each may be working off
  // a derivation this file records rather than a shipped variant, so the
  // bundle and its record are read once for all of them, and only when one
  // of them is switched on.
  let bundle: { content: string; record: DerivedPatch[] } | undefined;
  // The state of one bundle splice that is switched on. `rest` is whatever
  // else the bonus needs on disk besides its splice (a stylesheet block).
  const splice = (key: DerivedBonusKey, rest: () => boolean): BonusState => {
    if (!bundle) {
      const content = read(path.join(extPath, "dist", CHAT_SCRIPT_FILE));
      bundle = { content, record: readDerivedRecord(content) };
    }
    const variant = bonusVariantIn(bundle.content, bundle.record, key);
    if (variant) {
      return bundle.content.includes(variant.patched) && rest()
        ? "on"
        : "unapplied";
    }
    // Nothing names an edit for this build yet. Whether one can be worked out
    // from it is what separates a bonus waiting to be applied from one this
    // build has no code for: reading "unavailable" here would tell the reader
    // to wait for a release over an edit Apply Patches would write.
    return deriveBonus(key, bundle.content) ? "unapplied" : "unavailable";
  };

  let attach: BonusState = "off";
  if (cfg.get<boolean>("addAttachFileButton", false)) {
    attach = splice("attach-button", () => true);
  }

  let openInTab: BonusState = "off";
  if (cfg.get<boolean>("renameOpenInTab", false)) {
    const match = read(path.join(extPath, "package.json")).match(
      OPEN_IN_TAB_TITLE_RE,
    );
    openInTab = !match
      ? "unavailable"
      : match[0].includes(JSON.stringify(OPEN_IN_TAB_RENAMED))
        ? "on"
        : "unapplied";
  }

  // The math bonus spans a bundle splice and a stylesheet block, so it reads
  // "on" only when both agree with the settings. Its size is part of it rather
  // than a row of its own: with the bonus off there is nothing to size.
  let math: BonusState = "off";
  if (chatMathRenderingEnabled()) {
    math = splice("math-rendering", () => chatCssApplied(extPath, "math"));
  }

  // Like math, this bonus spans a bundle splice and a stylesheet block, and
  // the block is unconditional once the setting is on, so "on" means both are
  // in place.
  let rawMarkdown: BonusState = "off";
  if (chatRawMarkdownEnabled()) {
    rawMarkdown = splice("raw-markdown", () =>
      chatCssApplied(extPath, "raw-markdown"),
    );
  }

  // Typography is requested from the settings alone, so a build whose own
  // declarations could not be read still gets a row, and it reads "unavailable"
  // rather than silently "off".
  let typography: BonusState = "off";
  const scale = clampSetting("chatHistoryFontSizeEm", 1, 0.5, 3);
  const scalesText = scale !== 1;
  if (scalesText || chatFontFamily() !== "") {
    const css = read(path.join(extPath, "dist", CHAT_STYLE_FILE));
    const pristine = css === undefined ? undefined : stripChatCss(css);
    // The family needs nothing read out of the build, so "unavailable" has to
    // name the part that actually failed: a build whose declarations no longer
    // parse breaks the size knob specifically, and reporting "on" because the
    // family rule still got written would hide it.
    typography =
      pristine === undefined ||
      chatCssRules("typography", pristine).length === 0 ||
      (scalesText && readChatStyleValues(pristine) === undefined)
        ? "unavailable"
        : chatCssApplied(extPath, "typography")
          ? "on"
          : "unapplied";
  }

  return [
    {
      label: "Prompt toolbar: + button opens the file picker",
      state: pendingIfUnseen(attach, bonusAwaitingRestart.attach),
      needs: "extensions",
    },
    {
      label: 'Editor title: group the "Open in Tab" icon',
      state: pendingIfUnseen(openInTab, bonusAwaitingRestart.title),
      needs: "window",
    },
    {
      label: "Chat: render $...$ and \\[...\\] math",
      state: pendingIfUnseen(math, bonusAwaitingRestart.math),
      needs: "extensions",
    },
    {
      label: "Chat history: size and font of the agent's response",
      state: pendingIfUnseen(typography, bonusAwaitingRestart.typography),
      needs: "extensions",
    },
    {
      label: "Chat: button to read a reply's markdown source",
      state: pendingIfUnseen(rawMarkdown, bonusAwaitingRestart.rawMarkdown),
      needs: "extensions",
    },
  ];
}
