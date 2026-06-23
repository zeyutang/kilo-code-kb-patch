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
      {
        original:
          'Fm(je)&&!je.shiftKey&&(je.preventDefault(),Ce())',
        patched:
          'Fm(je)&&je.metaKey&&(je.preventDefault(),Ce())',
        description: "Chat input: Enter→newline, Cmd+Enter→send",
      },
      {
        original:
          'if(je.key==="Escape"&&ge()){je.preventDefault(),je.stopPropagation(),t.abort();return}',
        previous:
          'if(je.key==="Escape"&&ge()&&(je.shiftKey||!je.target?.value)){je.preventDefault(),je.stopPropagation(),t.abort();return}',
        patched:
          'if(je.key==="Escape"&&ge()&&(je.shiftKey||!je.target?.value?.trim())){je.preventDefault(),je.stopPropagation(),t.abort();return}',
        description:
          "Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts",
      },
      {
        original: "G?!1:S(j)",
        previous:
          'z.target?.value?(z.key==="Enter"&&!z.metaKey||z.key===" "||z.key==="Escape"&&!z.shiftKey&&!z.ctrlKey):!1',
        patched:
          'z.target?.value?.trim()?(z.key==="Enter"&&!z.metaKey||z.key===" "||z.key==="Escape"&&!z.shiftKey&&!z.ctrlKey):!1',
        description:
          "Permission L(): when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus",
      },
      {
        original:
          'P=z=>{if(z.key==="Escape"){N(z,"reject");return}}',
        previous:
          'P=z=>{if(z.key==="Escape"&&(z.shiftKey||!z.target?.value)){N(z,"reject");return}}',
        patched:
          'P=z=>{if(z.key==="Escape"&&(z.shiftKey||!z.target?.value?.trim())){N(z,"reject");return}}',
        description:
          "Permission P: bare Escape rejects only when textarea empty/whitespace-only; Shift+Escape always rejects",
      },
      {
        original:
          'if(M(z)){N(z,"once");return}}};',
        previous:
          'if(M(z)||z.key===" "&&!z.metaKey&&!z.ctrlKey&&!z.target?.value||z.key==="Enter"&&z.metaKey){N(z,"once");return}if(z.key==="Escape"&&z.shiftKey){N(z,"reject");return}}};',
        patched:
          'if(M(z)||z.key===" "&&!z.metaKey&&!z.ctrlKey&&!z.target?.value?.trim()||z.key==="Enter"&&z.metaKey){N(z,"once");return}if(z.key==="Escape"&&z.shiftKey){N(z,"reject");return}}};',
        description:
          "Permission O: Cmd+Enter approves always; Space approves when empty/whitespace-only; Shift+Escape rejects always",
      },
      {
        original:
          'ee.key!=="Escape"||!t.submitting()&&t.status()==="idle"||ee.defaultPrevented||(ee.preventDefault(),t.abort())',
        previous:
          'ee.key!=="Escape"||!t.submitting()&&t.status()==="idle"||ee.defaultPrevented||!ee.shiftKey&&ee.target?.value||(ee.preventDefault(),t.abort())',
        patched:
          'ee.key!=="Escape"||!t.submitting()&&t.status()==="idle"||ee.defaultPrevented||!ee.shiftKey&&ee.target?.value?.trim()||(ee.preventDefault(),t.abort())',
        description:
          "Document Escape: bare Escape does not abort when textarea has non-whitespace content; Shift+Escape aborts",
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

function checkStatus(
  filePath: string,
  patches: PatchDef[]
): { patched: string[]; original: string[]; missing: string[] } {
  const content = fs.readFileSync(filePath, "utf8");
  const patched: string[] = [];
  const original: string[] = [];
  const missing: string[] = [];

  for (const p of patches) {
    if (content.includes(p.patched)) {
      patched.push(p.description);
    } else if (p.previous && content.includes(p.previous)) {
      patched.push(`${p.description} (previous version)`);
    } else if (content.includes(p.original)) {
      original.push(p.description);
    } else {
      missing.push(p.description);
    }
  }

  return { patched, original, missing };
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
    const lines: string[] = [`Kilo Code v${version}`, ""];

    for (const fp of PATCHES) {
      const fpath = path.join(distDir, fp.filename);
      if (!fs.existsSync(fpath)) {
        lines.push(`${fp.filename}: NOT FOUND`);
        continue;
      }
      const s = checkStatus(fpath, fp.patches);
      lines.push(`${fp.filename}:`);
      for (const d of s.patched) lines.push(`  PATCHED: ${d}`);
      for (const d of s.original) lines.push(`  ORIGINAL: ${d}`);
      for (const d of s.missing) lines.push(`  MISSING: ${d}`);
    }

    vscode.window.showInformationMessage(lines.join("\n"), { modal: true });
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
