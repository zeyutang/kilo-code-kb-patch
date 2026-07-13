import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const EXT_DIR = path.join(os.homedir(), ".vscode/extensions");

interface PatchDef {
  original: string;
  patched: string;
  previous?: string;
  description: string;
}

interface FilePatches {
  filename: string;
  patches: PatchDef[];
}

const PATCHES: FilePatches[] = [
  {
    filename: "webview.js",
    patches: [
      // --- v7.4.7+ patterns. 7.4.7 re-minified webview.js wholesale, so every 7.4.0/
      //     7.3.x symbol below stopped matching. New symbols: chat uses Vm (Enter-check),
      //     $e (event), da (send), ot (abort guard); permission uses N (skip predicate),
      //     j/O (handlers), z (dispatch), $ (bare-Enter check), ie (document event).
      //     Re-derived from the 7.4.7 bundle. ---
      {
        original: 'Vm($e)&&!$e.shiftKey&&($e.preventDefault(),da())',
        patched: 'Vm($e)&&$e.metaKey&&($e.preventDefault(),da())',
        description: "Chat input: Enter→newline, Cmd+Enter→send (v7.4.7+)",
      },
      {
        original:
          'if($e.key==="Escape"&&ot()){$e.preventDefault(),$e.stopPropagation(),t.abort();return}',
        patched:
          'if($e.key==="Escape"&&ot()&&($e.shiftKey||!$e.target?.value?.trim())){$e.preventDefault(),$e.stopPropagation(),t.abort();return}',
        description:
          "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.4.7+)",
      },
      {
        original: "U?!1:L(H)",
        patched:
          'U?q.target?.value?.trim()?(q.key==="Enter"&&!q.metaKey||q.key===" "||q.key==="Escape"&&!q.shiftKey&&!q.ctrlKey):!1:L(H)',
        description:
          "Permission N(): when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v7.4.7+)",
      },
      {
        original: 'j=q=>{if(q.key==="Escape"){z(q,"reject");return}}',
        patched:
          'j=q=>{if(q.key==="Escape"&&(q.shiftKey||!q.target?.value?.trim())){z(q,"reject");return}}',
        description:
          "Permission j: bare Escape rejects only when textarea empty/whitespace-only; Shift+Escape always rejects (v7.4.7+)",
      },
      {
        original: 'if($(q)){z(q,"once");return}}};',
        patched:
          'if($(q)||q.key===" "&&!q.metaKey&&!q.ctrlKey&&!q.target?.value?.trim()||q.key==="Enter"&&q.metaKey){z(q,"once");return}}};',
        description:
          "Permission O: Cmd+Enter approves always; Space approves when empty/whitespace-only (v7.4.7+)",
      },
      {
        original:
          'ie.key!=="Escape"||!t.submitting()&&t.status()==="idle"||ie.defaultPrevented||(ie.preventDefault(),t.abort())',
        patched:
          'ie.key!=="Escape"||!t.submitting()&&t.status()==="idle"||ie.defaultPrevented||!ie.shiftKey&&ie.target?.value?.trim()||(ie.preventDefault(),t.abort())',
        description:
          "Document Escape: bare Escape does not abort when textarea has non-whitespace content; Shift+Escape aborts (v7.4.7+)",
      },
      // --- v7.4.0+ chat patterns (Ge event, Om Enter-check, Ea send). 7.4.0 added a
      //     bare-Escape "dismiss autocomplete" branch to the chat keydown handler, which
      //     re-minified this scope's symbols; the permission and document-level patterns
      //     below are unchanged from 7.3.63 and match both releases. ---
      {
        original:
          'Om(Ge)&&!Ge.shiftKey&&(Ge.preventDefault(),Ea())',
        patched:
          'Om(Ge)&&Ge.metaKey&&(Ge.preventDefault(),Ea())',
        description: "Chat input: Enter→newline, Cmd+Enter→send (v7.4.0+)",
      },
      {
        original:
          'if(Ge.key==="Escape"&&Fe()){Ge.preventDefault(),Ge.stopPropagation(),t.abort();return}',
        patched:
          'if(Ge.key==="Escape"&&Fe()&&(Ge.shiftKey||!Ge.target?.value?.trim())){Ge.preventDefault(),Ge.stopPropagation(),t.abort();return}',
        description:
          "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.4.0+)",
      },
      // --- v7.3.63 chat patterns (Ne event, $m Enter-check, Oa send) ---
      {
        original:
          '$m(Ne)&&!Ne.shiftKey&&(Ne.preventDefault(),Oa())',
        patched:
          '$m(Ne)&&Ne.metaKey&&(Ne.preventDefault(),Oa())',
        description: "Chat input: Enter→newline, Cmd+Enter→send (v7.3.63)",
      },
      {
        original:
          'if(Ne.key==="Escape"&&Fe()){Ne.preventDefault(),Ne.stopPropagation(),t.abort();return}',
        patched:
          'if(Ne.key==="Escape"&&Fe()&&(Ne.shiftKey||!Ne.target?.value?.trim())){Ne.preventDefault(),Ne.stopPropagation(),t.abort();return}',
        description:
          "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.3.63)",
      },
      // --- v7.3.63+ permission and document-level patterns (z, q, H, j, O, Z).
      //     These symbols are unchanged in 7.4.0, so one pattern covers both. ---
      {
        original: "K?!1:L(H)",
        patched:
          'K?q.target?.value?.trim()?(q.key==="Enter"&&!q.metaKey||q.key===" "||q.key==="Escape"&&!q.shiftKey&&!q.ctrlKey):!1:L(H)',
        description:
          "Permission P(): when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v7.3.63+)",
      },
      {
        original:
          'j=q=>{if(q.key==="Escape"){$(q,"reject");return}}',
        patched:
          'j=q=>{if(q.key==="Escape"&&(q.shiftKey||!q.target?.value?.trim())){$(q,"reject");return}}',
        description:
          "Permission j: bare Escape rejects only when textarea empty/whitespace-only; Shift+Escape always rejects (v7.3.63+)",
      },
      {
        original:
          'if(z(q)){$(q,"once");return}}};',
        patched:
          'if(z(q)||q.key===" "&&!q.metaKey&&!q.ctrlKey&&!q.target?.value?.trim()||q.key==="Enter"&&q.metaKey){$(q,"once");return}}};',
        description:
          "Permission O: Cmd+Enter approves always; Space approves when empty/whitespace-only (v7.3.63+)",
      },
      {
        original:
          'Z.key!=="Escape"||!t.submitting()&&t.status()==="idle"||Z.defaultPrevented||(Z.preventDefault(),t.abort())',
        patched:
          'Z.key!=="Escape"||!t.submitting()&&t.status()==="idle"||Z.defaultPrevented||!Z.shiftKey&&Z.target?.value?.trim()||(Z.preventDefault(),t.abort())',
        description:
          "Document Escape: bare Escape does not abort when textarea has non-whitespace content; Shift+Escape aborts (v7.3.63+)",
      },
      // --- v7.3.50-7.3.54 patterns (legacy minified symbols: Fm, je, Ce, ge, G, S, P, M, N, ee) ---
      {
        original:
          'Fm(je)&&!je.shiftKey&&(je.preventDefault(),Ce())',
        patched:
          'Fm(je)&&je.metaKey&&(je.preventDefault(),Ce())',
        description: "Chat input: Enter→newline, Cmd+Enter→send (v7.3.50-54)",
      },
      {
        original:
          'if(je.key==="Escape"&&ge()){je.preventDefault(),je.stopPropagation(),t.abort();return}',
        previous:
          'if(je.key==="Escape"&&ge()&&(je.shiftKey||!je.target?.value)){je.preventDefault(),je.stopPropagation(),t.abort();return}',
        patched:
          'if(je.key==="Escape"&&ge()&&(je.shiftKey||!je.target?.value?.trim())){je.preventDefault(),je.stopPropagation(),t.abort();return}',
        description:
          "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.3.50-54)",
      },
      {
        original: "G?!1:S(j)",
        previous:
          'z.target?.value?(z.key==="Enter"&&!z.metaKey||z.key===" "||z.key==="Escape"&&!z.shiftKey&&!z.ctrlKey):!1',
        patched:
          'z.target?.value?.trim()?(z.key==="Enter"&&!z.metaKey||z.key===" "||z.key==="Escape"&&!z.shiftKey&&!z.ctrlKey):!1',
        description:
          "Permission L(): when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v7.3.50-54)",
      },
      {
        original:
          'P=z=>{if(z.key==="Escape"){N(z,"reject");return}}',
        previous:
          'P=z=>{if(z.key==="Escape"&&(z.shiftKey||!z.target?.value)){N(z,"reject");return}}',
        patched:
          'P=z=>{if(z.key==="Escape"&&(z.shiftKey||!z.target?.value?.trim())){N(z,"reject");return}}',
        description:
          "Permission P: bare Escape rejects only when textarea empty/whitespace-only; Shift+Escape always rejects (v7.3.50-54)",
      },
      {
        original:
          'if(M(z)){N(z,"once");return}}};',
        previous:
          'if(M(z)||z.key===" "&&!z.metaKey&&!z.ctrlKey&&!z.target?.value||z.key==="Enter"&&z.metaKey){N(z,"once");return}if(z.key==="Escape"&&z.shiftKey){N(z,"reject");return}}};',
        patched:
          'if(M(z)||z.key===" "&&!z.metaKey&&!z.ctrlKey&&!z.target?.value?.trim()||z.key==="Enter"&&z.metaKey){N(z,"once");return}if(z.key==="Escape"&&z.shiftKey){N(z,"reject");return}}};',
        description:
          "Permission O: Cmd+Enter approves always; Space approves when empty/whitespace-only; Shift+Escape rejects always (v7.3.50-54)",
      },
      {
        original:
          'ee.key!=="Escape"||!t.submitting()&&t.status()==="idle"||ee.defaultPrevented||(ee.preventDefault(),t.abort())',
        previous:
          'ee.key!=="Escape"||!t.submitting()&&t.status()==="idle"||ee.defaultPrevented||!ee.shiftKey&&ee.target?.value||(ee.preventDefault(),t.abort())',
        patched:
          'ee.key!=="Escape"||!t.submitting()&&t.status()==="idle"||ee.defaultPrevented||!ee.shiftKey&&ee.target?.value?.trim()||(ee.preventDefault(),t.abort())',
        description:
          "Document Escape: bare Escape does not abort when textarea has non-whitespace content; Shift+Escape aborts (v7.3.50-54)",
      },
    ],
  },
  {
    filename: "kiloclaw.js",
    patches: [
      {
        original:
          'LA(Q)&&!Q.shiftKey?(Q.preventDefault(),y()):Q.key==="Escape"&&w()',
        patched:
          'LA(Q)&&Q.metaKey?(Q.preventDefault(),y()):Q.key==="Escape"&&w()',
        description: "KiloClaw edit: Enter→newline, Cmd+Enter→save",
      },
      {
        original:
          'LA(D)&&!D.shiftKey&&(D.preventDefault(),v())',
        patched: 'LA(D)&&D.metaKey&&(D.preventDefault(),v())',
        description: "KiloClaw chat: Enter→newline, Cmd+Enter→send",
      },
    ],
  },
];

// A single logical behavior can have several minified variants (one per Kilo
// version). Collapse them so the status view shows each behavior once, using a
// version-agnostic label, rather than one line per per-version variant.
const FEATURE_ORDER = [
  "chat-input",
  "chat-escape",
  "perm-keys",
  "perm-escape",
  "perm-approve",
  "doc-escape",
  "kiloclaw-edit",
  "kiloclaw-chat",
] as const;

const FEATURE_LABELS: Record<string, string> = {
  "chat-input": "Chat input: Enter adds a newline, Cmd+Enter sends",
  "chat-escape": "Chat Escape: aborts only when the input is empty",
  "perm-keys": "Permission prompt: typing keys stay in the input",
  "perm-escape": "Permission Escape: rejects only when the input is empty",
  "perm-approve": "Permission approve: Cmd+Enter always, Space when empty",
  "doc-escape": "Document Escape: non-empty input is not aborted",
  "kiloclaw-edit": "KiloClaw edit: Cmd+Enter saves",
  "kiloclaw-chat": "KiloClaw chat: Cmd+Enter sends",
};

function featureKey(description: string): string {
  if (description.startsWith("Chat input")) return "chat-input";
  if (description.startsWith("Chat Escape")) return "chat-escape";
  if (description.startsWith("Document Escape")) return "doc-escape";
  if (description.startsWith("KiloClaw edit")) return "kiloclaw-edit";
  if (description.startsWith("KiloClaw chat")) return "kiloclaw-chat";
  if (
    description.includes("P()") ||
    description.includes("L()") ||
    description.includes("N()")
  )
    return "perm-keys";
  if (description.includes("approves")) return "perm-approve";
  if (description.includes("rejects")) return "perm-escape";
  return "other";
}

type FeatureState = "patched" | "unpatched";
type Verdict =
  | "fully patched"
  | "partially patched"
  | "not patched"
  | "version not recognized";

interface FileStatus {
  filename: string;
  found: boolean;
  features: { label: string; state: FeatureState }[];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// The native modal dialog has a fixed, narrow width that wraps long rows, so the
// status view uses a webview panel where the width is under our control and each
// feature stays on one line.
function showStatusPanel(
  version: string,
  verdict: Verdict,
  files: FileStatus[]
): void {
  const panel = vscode.window.createWebviewPanel(
    "kiloCodeKbPatchStatus",
    "Kilo Code KB Patch",
    vscode.ViewColumn.Active,
    { enableScripts: false }
  );

  const verdictClass =
    verdict === "fully patched"
      ? "ok"
      : verdict === "not patched" || verdict === "version not recognized"
      ? "bad"
      : "warn";

  const sections = files
    .map((f) => {
      let rows: string;
      if (!f.found) {
        rows = `<div class="row muted">file not found in dist/</div>`;
      } else if (f.features.length === 0) {
        rows = `<div class="row muted">no matching patch points</div>`;
      } else {
        rows = f.features
          .map((ft) => {
            const cls = ft.state === "patched" ? "ok" : "bad";
            const mark = ft.state === "patched" ? "✓" : "✗";
            return `<div class="row"><span class="mark ${cls}">${mark}</span><span class="label">${escapeHtml(
              ft.label
            )}</span></div>`;
          })
          .join("");
      }
      return `<section><h2>${escapeHtml(f.filename)}</h2>${rows}</section>`;
    })
    .join("");

  panel.webview.html = `<!DOCTYPE html>
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
  .mark.bad { color: var(--vscode-testing-iconFailed, #f85149); }
  .muted { opacity: 0.6; font-style: italic; }
</style>
</head>
<body>
  <header>
    <span class="version">Kilo Code v${escapeHtml(version)}</span>
    <span class="badge ${verdictClass}">${escapeHtml(verdict)}</span>
  </header>
  ${sections}
</body>
</html>`;
}

function findLatestKiloExt(): string | undefined {
  if (!fs.existsSync(EXT_DIR)) return undefined;
  const dirs = fs
    .readdirSync(EXT_DIR)
    .filter((d) => d.startsWith("kilocode.kilo-code-"))
    .sort();
  return dirs.length > 0 ? path.join(EXT_DIR, dirs[dirs.length - 1]) : undefined;
}

function extractVersion(extPath: string): string {
  const base = path.basename(extPath);
  const match = base.match(/kilocode\.kilo-code-(.+)$/);
  return match ? match[1] : "unknown";
}

interface PatchResult {
  filename: string;
  applied: string[];
  skipped: string[];
  reverted: string[];
  noChanges: boolean;
}

function applyPatches(filePath: string, patches: PatchDef[]): PatchResult {
  const content = fs.readFileSync(filePath, "utf8");
  let modified = content;
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const p of patches) {
    if (modified.includes(p.patched)) {
      skipped.push(`${p.description} (already patched)`);
      continue;
    }
    if (modified.includes(p.original)) {
      modified = modified.replace(p.original, p.patched);
      applied.push(p.description);
      continue;
    }
    if (p.previous && modified.includes(p.previous)) {
      modified = modified.replace(p.previous, p.patched);
      applied.push(`${p.description} (upgraded)`);
      continue;
    }
    skipped.push(`${p.description} (pattern not found)`);
  }

  if (modified !== content) {
    fs.writeFileSync(filePath, modified, "utf8");
  }

  return {
    filename: path.basename(filePath),
    applied,
    skipped,
    reverted: [],
    noChanges: modified === content,
  };
}

function restorePatches(filePath: string, patches: PatchDef[]): PatchResult {
  const content = fs.readFileSync(filePath, "utf8");
  let modified = content;
  const reverted: string[] = [];
  const skipped: string[] = [];

  for (const p of patches) {
    if (modified.includes(p.patched)) {
      modified = modified.replace(p.patched, p.original);
      reverted.push(p.description);
      continue;
    }
    if (p.previous && modified.includes(p.previous)) {
      modified = modified.replace(p.previous, p.original);
      reverted.push(`${p.description} (previous version)`);
      continue;
    }
    if (modified.includes(p.original)) {
      skipped.push(`${p.description} (already original)`);
      continue;
    }
    skipped.push(`${p.description} (neither pattern found)`);
  }

  if (modified !== content) {
    fs.writeFileSync(filePath, modified, "utf8");
  }

  return {
    filename: path.basename(filePath),
    applied: [],
    skipped,
    reverted,
    noChanges: modified === content,
  };
}

async function runPatch(mode: "apply" | "restore" | "status"): Promise<void> {
  const extPath = findLatestKiloExt();
  if (!extPath) {
    vscode.window.showErrorMessage(
      "Kilo Code KB Patch: Could not find kilocode.kilo-code-* in ~/.vscode/extensions/"
    );
    return;
  }

  const version = extractVersion(extPath);
  const distDir = path.join(extPath, "dist");

  if (mode === "status") {
    const files: FileStatus[] = [];
    const states: FeatureState[] = [];

    for (const fp of PATCHES) {
      const fpath = path.join(distDir, fp.filename);
      if (!fs.existsSync(fpath)) {
        files.push({ filename: fp.filename, found: false, features: [] });
        continue;
      }

      const content = fs.readFileSync(fpath, "utf8");
      // Collapse per-version variants into one state per logical feature.
      // A variant whose text is absent belongs to a different Kilo version, so
      // it is skipped rather than reported as missing.
      const byFeature = new Map<string, FeatureState>();
      for (const p of fp.patches) {
        const key = featureKey(p.description);
        if (content.includes(p.patched) || (p.previous && content.includes(p.previous))) {
          byFeature.set(key, "patched");
        } else if (content.includes(p.original)) {
          if (byFeature.get(key) !== "patched") byFeature.set(key, "unpatched");
        }
      }

      const features = FEATURE_ORDER.filter((k) => byFeature.has(k)).map((k) => {
        const state = byFeature.get(k)!;
        states.push(state);
        return { label: FEATURE_LABELS[k], state };
      });
      files.push({ filename: fp.filename, found: true, features });
    }

    // A found file that yields zero features has no matching patch points: its
    // minified symbols changed and its patterns need re-targeting for this Kilo
    // version. Such a file contributes nothing to `states`, so it must be counted
    // separately — otherwise an unrecognized webview.js would be invisible to the
    // verdict and a patched kiloclaw.js alone would read as "fully patched".
    const unrecognizedFiles = files.filter(
      (f) => f.found && f.features.length === 0
    ).length;

    let verdict: Verdict;
    if (states.length === 0) verdict = "version not recognized";
    else if (unrecognizedFiles > 0) verdict = "partially patched";
    else if (states.every((s) => s === "patched")) verdict = "fully patched";
    else if (states.every((s) => s === "unpatched")) verdict = "not patched";
    else verdict = "partially patched";

    showStatusPanel(version, verdict, files);
    return;
  }

  const results: PatchResult[] = [];

  for (const fp of PATCHES) {
    const fpath = path.join(distDir, fp.filename);
    if (!fs.existsSync(fpath)) {
      results.push({
        filename: fp.filename,
        applied: [],
        skipped: ["file not found in dist/"],
        reverted: [],
        noChanges: true,
      });
      continue;
    }

    if (mode === "apply") {
      results.push(applyPatches(fpath, fp.patches));
    } else {
      results.push(restorePatches(fpath, fp.patches));
    }
  }

  const totalApplied = results.reduce(
    (s, r) => s + r.applied.length + r.reverted.length,
    0
  );
  const totalSkipped = results.reduce((s, r) => s + r.skipped.length, 0);

  const action = mode === "apply" ? "applied" : "restored";
  const verb = mode === "apply" ? "Patched" : "Restored";

  if (totalApplied > 0) {
    vscode.window
      .showInformationMessage(
        `Kilo Code KB Patch: ${verb} ${totalApplied} patch(es) on v${version}. Reload window to take effect.`,
        "Reload Window"
      )
      .then((choice) => {
        if (choice === "Reload Window") {
          vscode.commands.executeCommand("workbench.action.reloadWindow");
        }
      });
  } else {
    vscode.window.showWarningMessage(
      `Kilo Code KB Patch: No patches ${action} (${totalSkipped} skipped). v${version}`
    );
  }
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("kiloCodeKbPatch.apply", () =>
      runPatch("apply")
    ),
    vscode.commands.registerCommand("kiloCodeKbPatch.restore", () =>
      runPatch("restore")
    ),
    vscode.commands.registerCommand("kiloCodeKbPatch.status", () =>
      runPatch("status")
    )
  );

  // Auto-patch on activation if not yet patched
  const extPath = findLatestKiloExt();
  if (!extPath) return;

  const distDir = path.join(extPath, "dist");
  const webviewPath = path.join(distDir, "webview.js");
  if (!fs.existsSync(webviewPath)) return;

  const content = fs.readFileSync(webviewPath, "utf8");
  const needsPatching = PATCHES[0].patches.some(
    (p) =>
      !content.includes(p.patched) &&
      (content.includes(p.original) ||
        (p.previous && content.includes(p.previous)))
  );

  if (needsPatching) {
    const version = extractVersion(extPath);
    vscode.window
      .showInformationMessage(
        `Kilo Code KB Patch: v${version} detected, apply keyboard patches?`,
        "Apply",
        "Ignore"
      )
      .then((choice) => {
        if (choice === "Apply") {
          runPatch("apply");
        }
      });
  }
}

export function deactivate(): void {}
