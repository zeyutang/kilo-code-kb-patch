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
      // --- v7.4.11+ patterns. 7.4.11 re-minified only the document-level Escape
      //     handler's event variable (re→ae); every other webview keyboard scope kept
      //     symbols that still match the patterns below — chat input/Escape via the
      //     v7.4.9+ block (Zm/ze/ua/ot), the permission skip predicate via the v7.3.63+
      //     block (K?!1:L(H), event q), and the permission reject/approve handlers via
      //     the v7.4.7+ block (j/O, z-dispatch, $). Re-derived from the 7.4.11 bundle. ---
      {
        original:
          'ae.key!=="Escape"||!t.submitting()&&t.status()==="idle"||ae.defaultPrevented||(ae.preventDefault(),t.abort())',
        patched:
          'ae.key!=="Escape"||!t.submitting()&&t.status()==="idle"||ae.defaultPrevented||!ae.shiftKey&&ae.target?.value?.trim()||(ae.preventDefault(),t.abort())',
        description:
          "Document Escape: bare Escape does not abort when textarea has non-whitespace content; Shift+Escape aborts (v7.4.11+)",
      },
      // --- v7.4.9+ patterns. 7.4.9 re-minified the chat-input scope again and the whole
      //     permission scope. Chat: Enter-check Wm→Zm, chat abort-guard it→ot (event ze and
      //     send ua unchanged from 7.4.8). Permission: the skip-predicate N=(q,U) kept event
      //     q but renamed its in-textarea guard to K (K=!!U?.closest("textarea.prompt-input"))
      //     and its element helper to Q(U); the reject (j) and approve (O) handlers now match
      //     the $-dispatch v7.3.63+ patterns below, so only the skip-predicate is repeated
      //     here. Document-level Escape event ie/Z→re. Re-derived from the 7.4.9 bundle. ---
      {
        original: "Zm(ze)&&!ze.shiftKey&&(ze.preventDefault(),ua())",
        patched: "Zm(ze)&&ze.metaKey&&(ze.preventDefault(),ua())",
        description: "Chat input: Enter→newline, Cmd+Enter→send (v7.4.9+)",
      },
      {
        original:
          'if(ze.key==="Escape"&&ot()){ze.preventDefault(),ze.stopPropagation(),t.abort();return}',
        patched:
          'if(ze.key==="Escape"&&ot()&&(ze.shiftKey||!ze.target?.value?.trim())){ze.preventDefault(),ze.stopPropagation(),t.abort();return}',
        description:
          "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.4.9+)",
      },
      {
        original: "K?!1:Q(U)",
        patched:
          'K?q.target?.value?.trim()?(q.key==="Enter"&&!q.metaKey||q.key===" "||q.key==="Escape"&&!q.shiftKey&&!q.ctrlKey):!1:Q(U)',
        description:
          "Permission N(): when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v7.4.9+)",
      },
      {
        original:
          're.key!=="Escape"||!t.submitting()&&t.status()==="idle"||re.defaultPrevented||(re.preventDefault(),t.abort())',
        patched:
          're.key!=="Escape"||!t.submitting()&&t.status()==="idle"||re.defaultPrevented||!re.shiftKey&&re.target?.value?.trim()||(re.preventDefault(),t.abort())',
        description:
          "Document Escape: bare Escape does not abort when textarea has non-whitespace content; Shift+Escape aborts (v7.4.9+)",
      },
      // --- v7.4.8+ patterns. 7.4.8 re-minified only the chat-input scope and renamed
      //     one permission symbol; the permission-button and document-level handlers kept
      //     the symbols they had, so those keep matching the v7.3.63+/v7.4.7+ patterns
      //     below and are not repeated here. Changed: chat event $e→ze, Enter-check Vm→Wm,
      //     send da→ua, chat abort-guard ot→it; permission skip-predicate argument H→G.
      //     Re-derived from the 7.4.8 bundle. ---
      {
        original: "Wm(ze)&&!ze.shiftKey&&(ze.preventDefault(),ua())",
        patched: "Wm(ze)&&ze.metaKey&&(ze.preventDefault(),ua())",
        description: "Chat input: Enter→newline, Cmd+Enter→send (v7.4.8+)",
      },
      {
        original:
          'if(ze.key==="Escape"&&it()){ze.preventDefault(),ze.stopPropagation(),t.abort();return}',
        patched:
          'if(ze.key==="Escape"&&it()&&(ze.shiftKey||!ze.target?.value?.trim())){ze.preventDefault(),ze.stopPropagation(),t.abort();return}',
        description:
          "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v7.4.8+)",
      },
      {
        original: "U?!1:L(G)",
        patched:
          'U?q.target?.value?.trim()?(q.key==="Enter"&&!q.metaKey||q.key===" "||q.key==="Escape"&&!q.shiftKey&&!q.ctrlKey):!1:L(G)',
        description:
          "Permission N(): when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v7.4.8+)",
      },
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
      // --- v7.4.8+ patterns. 7.4.8 renamed only the Enter-check helper LA→NA; the event
      //     variables and the save/send/abort calls are unchanged. ---
      {
        original:
          'NA(Q)&&!Q.shiftKey?(Q.preventDefault(),y()):Q.key==="Escape"&&w()',
        patched:
          'NA(Q)&&Q.metaKey?(Q.preventDefault(),y()):Q.key==="Escape"&&w()',
        description: "KiloClaw edit: Enter→newline, Cmd+Enter→save (v7.4.8+)",
      },
      {
        original: 'NA(D)&&!D.shiftKey&&(D.preventDefault(),v())',
        patched: 'NA(D)&&D.metaKey&&(D.preventDefault(),v())',
        description: "KiloClaw chat: Enter→newline, Cmd+Enter→send (v7.4.8+)",
      },
      // --- pre-7.4.8 patterns (Enter-check helper LA) ---
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

// "patched": the patched text is present. "unpatched": the original text is
// present (Apply will fix it). "missing": no known variant of this feature was
// found, so its minified symbols changed for this Kilo version and the pattern
// needs re-targeting. "missing" is what the status view must surface rather than
// dropping the row, so an out-of-date pattern is visible instead of silent.
type FeatureState = "patched" | "unpatched" | "missing";
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

// Collapse a file's per-version patch variants into one state per logical
// feature, and list every feature the file is meant to cover (not just the ones
// whose text happens to be present). A feature with a matching patched/original
// variant is "patched"/"unpatched"; a feature whose every variant is absent is
// "missing" so the status view can show it rather than omitting the row.
function statusForFile(
  content: string,
  patches: PatchDef[]
): { label: string; state: FeatureState }[] {
  const byFeature = new Map<string, FeatureState>();
  const intended = new Set<string>();

  for (const p of patches) {
    const key = featureKey(p.description);
    intended.add(key);
    if (
      content.includes(p.patched) ||
      (p.previous && content.includes(p.previous))
    ) {
      byFeature.set(key, "patched");
    } else if (content.includes(p.original)) {
      if (byFeature.get(key) !== "patched") byFeature.set(key, "unpatched");
    }
  }

  return FEATURE_ORDER.filter((k) => intended.has(k)).map((k) => ({
    label: FEATURE_LABELS[k],
    state: byFeature.get(k) ?? "missing",
  }));
}

function computeVerdict(files: FileStatus[]): Verdict {
  const states = files
    .filter((f) => f.found)
    .flatMap((f) => f.features.map((ft) => ft.state));

  if (states.length === 0) return "version not recognized";

  const patched = states.filter((s) => s === "patched").length;
  const missing = states.filter((s) => s === "missing").length;

  // Every intended feature is missing: nothing in this build matches any known
  // pattern, so the whole version is unrecognized (a re-minify we have not caught
  // up to), not merely unpatched.
  if (missing === states.length) return "version not recognized";
  if (patched === states.length) return "fully patched";
  if (patched === 0) return "not patched";
  return "partially patched";
}

function computeStatus(distDir: string): {
  files: FileStatus[];
  verdict: Verdict;
} {
  const files: FileStatus[] = [];
  for (const fp of PATCHES) {
    const fpath = path.join(distDir, fp.filename);
    if (!fs.existsSync(fpath)) {
      files.push({ filename: fp.filename, found: false, features: [] });
      continue;
    }
    const content = fs.readFileSync(fpath, "utf8");
    files.push({
      filename: fp.filename,
      found: true,
      features: statusForFile(content, fp.patches),
    });
  }
  return { files, verdict: computeVerdict(files) };
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

  // Each feature state gets a distinct mark, color, and hint so an unpatched or
  // stale-pattern row reads differently from a patched one at a glance.
  const marks: Record<FeatureState, { mark: string; cls: string; hint: string }> =
    {
      patched: { mark: "✓", cls: "ok", hint: "" },
      unpatched: { mark: "○", cls: "warn", hint: "not applied — run Apply" },
      missing: {
        mark: "✗",
        cls: "bad",
        hint: "no matching code — patch needs update",
      },
    };

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
            const m = marks[ft.state];
            const hint = m.hint
              ? `<span class="hint">${escapeHtml(m.hint)}</span>`
              : "";
            return `<div class="row"><span class="mark ${
              m.cls
            }">${m.mark}</span><span class="label">${escapeHtml(
              ft.label
            )}</span>${hint}</div>`;
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
  .mark.warn { color: var(--vscode-editorWarning-foreground, #d29922); }
  .mark.bad { color: var(--vscode-testing-iconFailed, #f85149); }
  .hint { opacity: 0.6; font-style: italic; font-size: 0.85em; }
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

// Kilo extension dirs are named "kilocode.kilo-code-<version>[-<platform>]",
// e.g. "kilocode.kilo-code-7.4.11-darwin-arm64". Pull out the leading dotted
// numeric version as an array of ints so it can be compared and displayed.
function parseKiloVersion(dirName: string): number[] {
  const m = dirName.match(/kilocode\.kilo-code-(\d+(?:\.\d+)*)/);
  return m ? m[1].split(".").map((n) => parseInt(n, 10)) : [];
}

// Numeric, component-wise version compare. Must NOT be a string sort: as
// strings "7.4.11" < "7.4.9" (they differ at the patch digit, "1" vs "9"), which
// would wrongly rank 7.4.9 above 7.4.11 and pick the older build as "latest".
function compareKiloVersions(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function findLatestKiloExt(): string | undefined {
  if (!fs.existsSync(EXT_DIR)) return undefined;
  const dirs = fs
    .readdirSync(EXT_DIR)
    .filter((d) => d.startsWith("kilocode.kilo-code-"));
  if (dirs.length === 0) return undefined;
  dirs.sort((a, b) =>
    compareKiloVersions(parseKiloVersion(a), parseKiloVersion(b))
  );
  return path.join(EXT_DIR, dirs[dirs.length - 1]);
}

function extractVersion(extPath: string): string {
  const parts = parseKiloVersion(path.basename(extPath));
  return parts.length > 0 ? parts.join(".") : "unknown";
}

// Restore Originals flips the bonus settings off and reverts their files in one
// batch. Suspend the config-change listener for the duration so it cannot fire
// mid-batch and re-reconcile a bonus whose setting has not been flipped yet (for
// example re-applying the still-enabled title rename right after its file was
// reverted). Once the batch ends, settings and files agree, so any late change
// event reconciles to a no-op.
let suspendReconcile = false;

// --- Bonus editor-title icon knob -------------------------------------------
// Kilo's editor/title action `kilo-code.new.openInTab` ("Open in Tab") rides on
// every editor's title bar. VSCode sorts same-group, same-order title actions by
// their raw title (localeCompare), so retitling this command relocates the icon.
// "Kilo Code: Open" sorts just after Claude Code's "Claude Code: Open", grouping
// the two AI "Open" icons together.
//
// This is an opt-in bonus setting, declared in the extension's package.json (the
// contributes.configuration block) so VS Code lists it in the Settings UI and
// allows config.update to write it. It never appears in the status webview,
// which stays keyboard-only.
const OPEN_IN_TAB_ORIGINAL = "Open in Tab";
const OPEN_IN_TAB_RENAMED = "Kilo Code: Open";

// Anchored on the unique command id. The command definition is the only place
// where "title" immediately follows this id (the menu contribution is followed
// by "group"/"when"), so this matches exactly once and stays idempotent no
// matter what the title currently is. Capture group 1 is everything up to and
// including `"title": `, so only the quoted value is rewritten.
const OPEN_IN_TAB_TITLE_RE =
  /("command":\s*"kilo-code\.new\.openInTab"\s*,\s*"title":\s*)"(?:[^"\\]|\\.)*"/;

function desiredOpenInTabTitle(): string {
  const rename = vscode.workspace
    .getConfiguration("kiloCodeKbPatch")
    .get<boolean>("renameOpenInTab", false);
  return rename ? OPEN_IN_TAB_RENAMED : OPEN_IN_TAB_ORIGINAL;
}

// Rewrite the openInTab title in Kilo's manifest to match the bonus setting.
// Returns true only when the file actually changed. Fails safe: a missing
// manifest or a manifest whose shape a future Kilo has changed (pattern not
// found) is a silent no-op rather than an error.
function reconcileOpenInTabTitle(extPath: string): boolean {
  const pkgPath = path.join(extPath, "package.json");
  if (!fs.existsSync(pkgPath)) return false;
  const content = fs.readFileSync(pkgPath, "utf8");
  if (!OPEN_IN_TAB_TITLE_RE.test(content)) return false;
  const desired = desiredOpenInTabTitle();
  const updated = content.replace(
    OPEN_IN_TAB_TITLE_RE,
    (_match, prefix: string) => `${prefix}${JSON.stringify(desired)}`
  );
  if (updated === content) return false;
  fs.writeFileSync(pkgPath, updated, "utf8");
  return true;
}

// Reconcile, and only when the manifest actually changed offer a reload so the
// manifest re-scan picks up the new title. That change plus this transient
// prompt are the only surfaces; the status webview never lists this knob.
function syncOpenInTabTitle(extPath: string): void {
  let changed = false;
  try {
    changed = reconcileOpenInTabTitle(extPath);
  } catch {
    return;
  }
  if (!changed) return;
  vscode.window
    .showInformationMessage(
      "Kilo Code KB Patch: editor title icon updated. Reload window to apply.",
      "Reload Window"
    )
    .then((choice) => {
      if (choice === "Reload Window") {
        vscode.commands.executeCommand("workbench.action.reloadWindow");
      }
    });
}

// --- Bonus: attach-file "+" button ------------------------------------------
// Adds a "+" button to the prompt input's action toolbar
// (.prompt-input-hint-actions) that opens Kilo's file picker directly, instead
// of the type-"@" then "Browse files..." mention flow. It is injected just
// before the indexing (database) button so it lands at the left edge of the icon
// cluster.
//
// The button reuses Kilo's own tooltip (Gn), ghost button (_t), and sprite-icon
// (tn, name:"plus") components, plus the already-localized
// "prompt.action.attachFile" label (defined in every locale but otherwise
// unused). onClick reaches four in-scope PromptInput locals: the textarea ref k,
// the mention controller h, its value setter L, and the post-input sync an. It
// inserts "@" at the caret (execCommand, so a real input event fires) then calls
// h.selectMention({type:"file-picker"},k,L,an), the exact call the mention menu's
// own "Browse files..." row makes; the host replies with filePickerResult and
// the chosen path is spliced in over the "@".
//
// Opt-in: off unless "kiloCodeKbPatch.addAttachFileButton" is true in
// settings.json. The symbols are 7.4.11-specific (absent in 7.4.9) and, like
// every webview.js pattern, may change when a future Kilo re-minifies the bundle.
const ATTACH_FILE_BUTTON = {
  original:
    'R(Re,C(de,{get when(){return He()},get children(){return C(Gn,{get value(){return r.status().message||r.label()}',
  patched:
    'R(Re,C(Gn,{get value(){return u.t("prompt.action.attachFile")},placement:"top",get children(){return C(_t,{variant:"ghost",size:"small",onClick:()=>{if(!k)return;k.focus();let _v=k.value,_s=k.selectionStart??_v.length,_b=_v.substring(0,_s);document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");h.selectMention({type:"file-picker"},k,L,an)},get"aria-label"(){return u.t("prompt.action.attachFile")},get children(){return C(tn,{name:"plus",size:"small"})}})}}),null),R(Re,C(de,{get when(){return He()},get children(){return C(Gn,{get value(){return r.status().message||r.label()}',
};

function addAttachFileButtonEnabled(): boolean {
  return vscode.workspace
    .getConfiguration("kiloCodeKbPatch")
    .get<boolean>("addAttachFileButton", false);
}

// Apply or remove the attach-file button in Kilo's webview bundle to match the
// setting. Returns true only when the file actually changed. The patched text
// contains the original as a suffix, so "already patched" is tested before "is
// pristine". Fails safe: a missing bundle, or a pattern a future Kilo has
// re-minified (neither text present), is a silent no-op.
function reconcileAttachFileButton(extPath: string): boolean {
  const webviewPath = path.join(extPath, "dist", "webview.js");
  if (!fs.existsSync(webviewPath)) return false;
  const content = fs.readFileSync(webviewPath, "utf8");
  const enabled = addAttachFileButtonEnabled();
  const isPatched = content.includes(ATTACH_FILE_BUTTON.patched);
  if (enabled === isPatched) return false;

  let updated = content;
  if (enabled) {
    if (content.includes(ATTACH_FILE_BUTTON.original)) {
      updated = content.replace(
        ATTACH_FILE_BUTTON.original,
        ATTACH_FILE_BUTTON.patched
      );
    }
  } else {
    updated = content.replace(
      ATTACH_FILE_BUTTON.patched,
      ATTACH_FILE_BUTTON.original
    );
  }
  if (updated === content) return false;
  fs.writeFileSync(webviewPath, updated, "utf8");
  return true;
}

// Reconcile, and only when the bundle actually changed offer a reload so Kilo's
// webview re-loads with (or without) the button.
function syncAttachFileButton(extPath: string): void {
  let changed = false;
  try {
    changed = reconcileAttachFileButton(extPath);
  } catch {
    return;
  }
  if (!changed) return;
  vscode.window
    .showInformationMessage(
      "Kilo Code KB Patch: attach-file button updated. Reload window to apply.",
      "Reload Window"
    )
    .then((choice) => {
      if (choice === "Reload Window") {
        vscode.commands.executeCommand("workbench.action.reloadWindow");
      }
    });
}

// Flip a bonus setting to false, but only in the scopes where the user has
// actually set it (globalValue/workspaceValue/workspaceFolderValue defined), so
// Restore Originals turns the bonus off for good without writing settings
// entries the user never added. An absent or already-false entry is left alone.
async function forceSettingOff(key: string): Promise<void> {
  const config = vscode.workspace.getConfiguration("kiloCodeKbPatch");
  const info = config.inspect<boolean>(key);
  if (!info) return;
  const scopes: [boolean | undefined, vscode.ConfigurationTarget][] = [
    [info.globalValue, vscode.ConfigurationTarget.Global],
    [info.workspaceValue, vscode.ConfigurationTarget.Workspace],
    [info.workspaceFolderValue, vscode.ConfigurationTarget.WorkspaceFolder],
  ];
  for (const [value, target] of scopes) {
    if (value !== undefined && value !== false) {
      await config.update(key, false, target);
    }
  }
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
    const { files, verdict } = computeStatus(distDir);
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

  // Restore Originals also turns the bonuses off. Flip each present setting to
  // false so it stays off, then reconcile (the reconcilers read the settings, so
  // this reverts the button and title now and stops the next activation from
  // re-applying them). The listener is suspended so its own reconcile cannot
  // double-fire mid-batch; the final settings and files agree.
  let bonusReverted = 0;
  if (mode === "restore") {
    suspendReconcile = true;
    try {
      await forceSettingOff("addAttachFileButton");
      await forceSettingOff("renameOpenInTab");
      if (reconcileAttachFileButton(extPath)) bonusReverted++;
      if (reconcileOpenInTabTitle(extPath)) bonusReverted++;
    } finally {
      suspendReconcile = false;
    }
  }

  const totalApplied =
    results.reduce((s, r) => s + r.applied.length + r.reverted.length, 0) +
    bonusReverted;
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

  // Reconcile the bonus knobs on startup (self-heals after a Kilo update resets
  // the files) and whenever one of our settings changes. The settings are
  // registered in package.json, so affectsConfiguration reports them reliably and
  // limits the reconcile (which reads the webview bundle) to relevant changes.
  syncOpenInTabTitle(extPath);
  syncAttachFileButton(extPath);
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (suspendReconcile) return;
      if (!e.affectsConfiguration("kiloCodeKbPatch")) return;
      syncOpenInTabTitle(extPath);
      syncAttachFileButton(extPath);
    })
  );

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

// Exposed for the offline test harness only; the extension host ignores extra
// exports, so this has no effect at runtime.
export const __test = {
  PATCHES,
  computeStatus,
  applyPatches,
  restorePatches,
  showStatusPanel,
  reconcileOpenInTabTitle,
  OPEN_IN_TAB_TITLE_RE,
  OPEN_IN_TAB_ORIGINAL,
  OPEN_IN_TAB_RENAMED,
  reconcileAttachFileButton,
  ATTACH_FILE_BUTTON,
  forceSettingOff,
  parseKiloVersion,
  compareKiloVersions,
  findLatestKiloExt,
  extractVersion,
};
