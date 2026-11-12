// The Show Status page: its markup, and the one panel per window that shows it
// and is redrawn whenever the state it reports moves.

import vscode = require("vscode");
import path = require("path");
import type { FeatureState } from "../core/features";
import { extractVersion, findLatestKiloExt } from "../install/locate";
import { RESTART_OFFERS } from "./restart";
import { computeBonusStatus } from "../bonuses/session";
import type { BonusState, BonusStatus } from "../bonuses/session";
import { computeStatus } from "../core/status";
import type { FileStatus, Verdict } from "../core/status";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// The page itself, as one string. Built apart from the panel that shows it, so
// the same markup serves a page being opened and a page being redrawn.
function statusHtml(
  version: string,
  verdict: Verdict,
  files: FileStatus[],
  bonuses: BonusStatus[],
): string {
  const verdictClass =
    verdict === "fully patched"
      ? "ok"
      : verdict === "not patched" || verdict === "version not recognized"
        ? "bad"
        : "warn";

  // Each feature state gets a distinct mark, color, and hint so an unpatched or
  // stale-pattern row reads differently from a patched one at a glance.
  const marks: Record<
    FeatureState,
    { mark: string; cls: string; hint: string }
  > = {
    patched: { mark: "✓", cls: "ok", hint: "" },
    unpatched: { mark: "○", cls: "warn", hint: "not applied — run Apply" },
    missing: {
      mark: "✗",
      cls: "bad",
      hint: "no matching code — patch needs update",
    },
    unneeded: {
      mark: "○",
      cls: "off",
      hint: "not needed on this Kilo Code build",
    },
  };

  const sections = files
    .map((f) => {
      let rows: string;
      // A retired file is absent and still has rows (see RETIRED_FILES), so
      // the row list decides what to draw and `found` only picks the wording
      // when there is nothing to list.
      if (f.features.length === 0) {
        rows = `<div class="row muted">${
          f.found ? "no matching patch points" : "file not found in dist/"
        }</div>`;
      } else {
        rows = f.features
          .map((ft) => {
            const m = marks[ft.state];
            const hint = m.hint
              ? `<span class="hint">${escapeHtml(m.hint)}</span>`
              : "";
            return `<div class="row"><span class="mark ${
              m.cls
            }">${m.mark}</span><span class="label">${escapeHtml(
              ft.label,
            )}</span>${hint}</div>`;
          })
          .join("");
      }
      return `<section><h2>${escapeHtml(f.filename)}</h2>${rows}</section>`;
    })
    .join("");

  // Bonus rows use their own marks. "off" is a neutral white circle (the item is
  // simply not enabled); it never reads as a problem. These rows do not feed the
  // verdict badge above.
  const bonusMarks: Record<
    BonusState,
    { mark: string; cls: string; hint: string }
  > = {
    on: { mark: "✓", cls: "ok", hint: "" },
    off: { mark: "○", cls: "off", hint: "" },
    // The pending hint names the restart the row needs, so it is built below.
    pending: { mark: "○", cls: "warn", hint: "" },
    // The same words a core row uses for the same state.
    unapplied: { mark: "○", cls: "warn", hint: marks.unpatched.hint },
    unavailable: {
      mark: "✗",
      cls: "bad",
      hint: "no matching code — patch needs update",
    },
  };
  const bonusRows = bonuses
    .map((b) => {
      const m = bonusMarks[b.state];
      const text =
        b.state === "pending"
          ? `${RESTART_OFFERS[b.needs].verb.toLowerCase()} to apply`
          : m.hint;
      const hint = text ? `<span class="hint">${escapeHtml(text)}</span>` : "";
      return `<div class="row"><span class="mark ${
        m.cls
      }">${m.mark}</span><span class="label">${escapeHtml(
        b.label,
      )}</span>${hint}</div>`;
    })
    .join("");
  const bonusSection = bonusRows
    ? `<section><h2>Bonus <span class="sub">(opt-in, does not affect status)</span></h2>${bonusRows}</section>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>
  body {
    font-family: var(--vscode-font-family);
    font-size: calc(var(--vscode-font-size) * 1.2);
    color: var(--vscode-foreground);
    padding: 28px 32px;
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 14px;
    margin-bottom: 26px;
  }
  header .version { font-size: 1.6em; font-weight: 600; }
  .badge {
    padding: 4px 14px;
    border-radius: 12px;
    font-size: 0.95em;
    font-weight: 600;
    white-space: nowrap;
  }
  .badge.ok { background: #1a7f37; color: #fff; }
  .badge.warn { background: var(--vscode-editorWarning-foreground, #d29922); color: #000; }
  .badge.bad { background: var(--vscode-testing-iconFailed, #f85149); color: #fff; }
  section { margin-bottom: 24px; }
  h2 {
    font-size: 1.05em;
    font-weight: 600;
    opacity: 0.7;
    margin: 0 0 12px;
    font-family: var(--vscode-editor-font-family, monospace);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    white-space: nowrap;
    padding: 5px 0;
  }
  .mark { width: 1em; text-align: center; font-weight: 700; }
  .mark.ok { color: var(--vscode-testing-iconPassed, #3fb950); }
  .mark.warn { color: var(--vscode-editorWarning-foreground, #d29922); }
  .mark.bad { color: var(--vscode-testing-iconFailed, #f85149); }
  .mark.off { color: var(--vscode-foreground); opacity: 0.6; }
  .hint { opacity: 0.6; font-style: italic; font-size: 0.85em; }
  .sub { font-weight: 400; font-size: 0.8em; opacity: 0.85; font-family: var(--vscode-font-family); }
  .muted { opacity: 0.6; font-style: italic; }
</style>
</head>
<body>
  <header>
    <span class="version">Kilo Code v${escapeHtml(version)}</span>
    <span class="badge ${verdictClass}">${escapeHtml(verdict)}</span>
  </header>
  ${sections}
  ${bonusSection}
</body>
</html>`;
}

// The view type given to createWebviewPanel. A tab reports it back through
// TabInputWebview.viewType with the workbench's own "mainThreadWebview-" prefix
// in front of it, so the tab matching below accepts either spelling.
const STATUS_VIEW_TYPE = "kiloCodeKbPatchStatus";

// The one status page this window has open, if any. Held so a second Show
// Status redraws that page instead of stacking another tab beside it, and so
// anything that moves the state the page reports can redraw it in place.
let statusPanel: vscode.WebviewPanel | undefined;

// The native modal dialog has a fixed, narrow width that wraps long rows, so the
// status view uses a webview panel where the width is under our control and each
// feature stays on one line.
export function showStatusPanel(
  version: string,
  verdict: Verdict,
  files: FileStatus[],
  bonuses: BonusStatus[],
  show: { column: vscode.ViewColumn; preserveFocus: boolean } = {
    column: vscode.ViewColumn.Active,
    preserveFocus: false,
  },
): void {
  const html = statusHtml(version, verdict, files, bonuses);
  if (statusPanel) {
    statusPanel.webview.html = html;
    statusPanel.reveal(statusPanel.viewColumn, show.preserveFocus);
    return;
  }
  const panel = vscode.window.createWebviewPanel(
    STATUS_VIEW_TYPE,
    "Kilo Code KB Patch",
    { viewColumn: show.column, preserveFocus: show.preserveFocus },
    { enableScripts: false },
  );
  statusPanel = panel;
  panel.onDidDispose(() => {
    if (statusPanel === panel) statusPanel = undefined;
  });
  // The files move without us asking too: a Kilo update resets them, an Apply
  // in another window rewrites them. Redrawing whenever the page comes back
  // into view costs one pass over the bundle, and keeps a page the user tabs
  // back to from reporting whatever happened to be true when it was drawn.
  panel.onDidChangeViewState((e) => {
    if (e.webviewPanel.visible) refreshStatusPanel();
  });
  panel.webview.html = html;
}

// Redraw the open status page from what is on disk now. A no-op when no page is
// open, so callers can say this after anything that rewrites a patched file
// without first checking whether anyone is looking.
export function refreshStatusPanel(): void {
  if (!statusPanel) return;
  const extPath = findLatestKiloExt();
  if (!extPath) return;
  const { files, verdict } = computeStatus(path.join(extPath, "dist"));
  statusPanel.webview.html = statusHtml(
    extractVersion(extPath),
    verdict,
    files,
    computeBonusStatus(extPath),
  );
}

// Whether a tab is one of our status pages, in either spelling of the view type
// (see STATUS_VIEW_TYPE).
function isStatusTab(tab: vscode.Tab): boolean {
  const input = tab.input;
  return (
    input instanceof vscode.TabInputWebview &&
    (input.viewType === STATUS_VIEW_TYPE ||
      input.viewType.endsWith(`-${STATUS_VIEW_TYPE}`))
  );
}

// An extension-host restart leaves the status page on screen and takes our
// handle to it: the workbench keeps the webview and the HTML it last rendered,
// and re-resolves only a panel it restored itself, never one an extension
// created. So the page sits there reporting the state from before the restart,
// which is the state the restart was meant to change.
//
// Nothing else leaves a status tab behind. No serializer is registered for the
// view type, which is what tells the workbench the tab cannot be persisted, so
// a window reload drops it instead of restoring it. A status tab present at
// activation therefore belongs to the previous host, and is replaced here by
// one drawn from the state on disk now.
export function replaceStaleStatusPanel(): void {
  const stale = vscode.window.tabGroups.all.flatMap((g) =>
    g.tabs.filter(isStatusTab),
  );
  if (stale.length === 0) return;
  const extPath = findLatestKiloExt();
  if (extPath) {
    const { files, verdict } = computeStatus(path.join(extPath, "dist"));
    // Drawn before the old tabs close, and without taking focus. A status tab
    // sitting alone in a split group takes the group with it when it closes,
    // and the column named here would be gone by the time the replacement
    // asked for it.
    showStatusPanel(
      extractVersion(extPath),
      verdict,
      files,
      computeBonusStatus(extPath),
      { column: stale[0].group.viewColumn, preserveFocus: true },
    );
  }
  void vscode.window.tabGroups.close(stale, true);
}
