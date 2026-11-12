// What a change on disk needs before the session on screen shows it, and the
// notifications that offer that restart.

import vscode = require("vscode");
import type { BonusChanges } from "../bonuses/session";

// What the running session needs before a change on disk shows. Kilo's webview
// bundle and stylesheet are fetched afresh when its sidebar view is rebuilt,
// and an extension-host restart does that: the view is torn down with the host
// and re-resolved once Kilo registers it again, and the webview's resource
// cache revalidates by mtime and size, so a rewritten file is not served stale.
// Its manifest is not re-read: the workbench keeps the description it scanned
// at window startup, and a host restart re-adds extensions from that same
// in-memory copy. So the editor-title bonus needs the window and everything
// else the lighter restart, which leaves editors, terminals and the layout in
// place. (A chat opened with "Open in Tab" is a webview panel, which a host
// restart neither closes nor rebuilds; it shows the new bundle when reopened.)
export type RestartScope = "extensions" | "window";

// "Restart Extensions" is the label VS Code puts on its own restart button.
export const RESTART_OFFERS: Record<
  RestartScope,
  { verb: string; label: string; command: string }
> = {
  extensions: {
    verb: "Restart extensions",
    label: "Restart Extensions",
    command: "workbench.action.restartExtensionHost",
  },
  window: {
    verb: "Reload window",
    label: "Reload Window",
    command: "workbench.action.reloadWindow",
  },
};

// One notification with the one button that applies `scope`. The message ends
// with the instruction, so callers pass the sentence before it.
export function offerRestart(message: string, scope: RestartScope): void {
  const offer = RESTART_OFFERS[scope];
  vscode.window
    .showInformationMessage(`${message} ${offer.verb} to apply.`, offer.label)
    .then((choice) => {
      if (choice === offer.label) {
        vscode.commands.executeCommand(offer.command);
      }
    });
}

// The restart a set of bonus changes needs: the manifest is the one file only
// a window reload re-reads.
function bonusRestartScope(changed: BonusChanges): RestartScope {
  return changed.title ? "window" : "extensions";
}

// Offer the restart that pending bonus changes still need, as one notification
// however many items changed. Callers decide when: right away on a settings
// change, but at activation only after the apply-patches prompt (if any) is
// settled. A bare restart button shown next to that prompt invites restarting
// first, which re-activates this extension before the keyboard patches were
// ever applied.
export function notifyBonusRestart(changed: BonusChanges): void {
  const items = [
    ...(changed.title ? ["editor title icon"] : []),
    ...(changed.attach ? ["attach-file button"] : []),
    ...(changed.math ? ["math rendering"] : []),
    ...(changed.typography ? ["chat typography"] : []),
    ...(changed.rawMarkdown ? ["markdown source button"] : []),
  ];
  if (items.length === 0) return;
  // Two items read as "a and b"; three or more as "a, b and c".
  const list =
    items.length <= 2
      ? items.join(" and ")
      : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
  offerRestart(
    `Kilo Code KB Patch: ${list} updated.`,
    bonusRestartScope(changed),
  );
}
