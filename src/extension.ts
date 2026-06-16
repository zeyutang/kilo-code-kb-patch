import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const EXT_DIR = path.join(os.homedir(), ".vscode/extensions");

interface PatchDef {
  original: string;
  patched: string;
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
          'Pe.key==="Enter"&&!Pe.shiftKey&&!Pe.isComposing&&(Pe.preventDefault(),ve())',
        patched:
          'Pe.key==="Enter"&&Pe.metaKey&&!Pe.isComposing&&(Pe.preventDefault(),ve())',
        description: "Chat input: Enter→newline, Cmd+Enter→send",
      },
      {
        original: "H?!1:S(j)",
        patched:
          'H?(j?.closest("textarea.prompt-input")?.value?.trim()?(z.key==="Enter"&&!z.metaKey||z.key===" "||z.key==="Escape"&&!z.metaKey&&!z.ctrlKey):!1):S(j)',
        description:
          "Permission L(): bare Enter/Escape→approve/reject when input empty; blocked when input has content",
      },
      {
        original: 'if(M(z)){N(z,"once");return}',
        patched:
          'if(M(z)||z.key===" "&&!z.metaKey&&!z.ctrlKey&&j?.closest("textarea.prompt-input")?.value?.trim()===""){N(z,"once");return}',
        description:
          "Permission $: Space also approves when chat textarea is empty",
      },
    ],
  },
  {
    filename: "kiloclaw.js",
    patches: [
      {
        original:
          'Q.key==="Enter"&&!Q.shiftKey?(Q.preventDefault(),y())',
        patched: 'Q.key==="Enter"&&Q.metaKey?(Q.preventDefault(),y())',
        description: "KiloClaw chat (pattern 1): Enter→newline, Cmd+Enter→send",
      },
      {
        original:
          'I.key==="Enter"&&!I.shiftKey&&(I.preventDefault(),v())',
        patched: 'I.key==="Enter"&&I.metaKey&&(I.preventDefault(),v())',
        description: "KiloClaw chat (pattern 2): Enter→newline, Cmd+Enter→send",
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
    if (modified.includes(p.original) && p.patched !== p.original) {
      if (modified.includes(p.patched)) {
        skipped.push(`${p.description} (already patched)`);
        continue;
      }
      modified = modified.replace(p.original, p.patched);
      applied.push(p.description);
    } else if (modified.includes(p.patched)) {
      skipped.push(`${p.description} (already patched)`);
    } else {
      skipped.push(`${p.description} (pattern not found)`);
    }
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
    } else if (modified.includes(p.original)) {
      skipped.push(`${p.description} (already original)`);
    } else {
      skipped.push(`${p.description} (neither pattern found)`);
    }
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
      "Kilo Code Patch: Could not find kilocode.kilo-code-* in ~/.vscode/extensions/"
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
        `Kilo Code Patch: ${verb} ${totalApplied} patch(es) on v${version}. Reload window to take effect.`,
        "Reload Window"
      )
      .then((choice) => {
        if (choice === "Reload Window") {
          vscode.commands.executeCommand("workbench.action.reloadWindow");
        }
      });
  } else {
    vscode.window.showWarningMessage(
      `Kilo Code Patch: No patches ${action} (${totalSkipped} skipped). v${version}`
    );
  }
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("kiloCodePatch.apply", () =>
      runPatch("apply")
    ),
    vscode.commands.registerCommand("kiloCodePatch.restore", () =>
      runPatch("restore")
    ),
    vscode.commands.registerCommand("kiloCodePatch.status", () =>
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
    (p) => content.includes(p.original) && !content.includes(p.patched)
  );

  if (needsPatching) {
    const version = extractVersion(extPath);
    vscode.window
      .showInformationMessage(
        `Kilo Code Patch: v${version} detected — apply keyboard patches?`,
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
