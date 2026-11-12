// What Apply Patches, Restore Originals and Show Status do to one install, and
// what a launch checks before it asks.

import vscode = require("vscode");
import fs = require("fs");
import path = require("path");
import os = require("os");
import { RULES } from "../rules";
import { RETIRED_FILES } from "./features";
import type { FeatureKey, FilePatches, PatchDef } from "./features";
import { PATCHES } from "../patterns";
import { WEBVIEW_PATCHES } from "../patterns/webview";
import { BONUS_SETTING_DEFAULTS, forceSettingOff } from "../host/settings";
import {
  candidateExtensionRoots,
  extractVersion,
  findLatestKiloExt,
} from "../install/locate";
import {
  CHAT_CSS_CORE,
  CHAT_SCRIPT_CORE,
  CHAT_SCRIPT_FILE,
  CHAT_STYLE_FILE,
  blockResult,
} from "../blocks/machinery";
import {
  chatCssCoreStatus,
  coreCssDecision,
  reconcileChatStyle,
} from "../blocks/chat-style";
import {
  chatScriptCoreStatus,
  reconcileChatScript,
} from "../blocks/chat-script";
import { applyPatches, restorePatches } from "./splice";
import type { PatchResult } from "./splice";
import {
  asPatchDef,
  bonusDerivationsToKeep,
  readDerivedRecord,
  readDerivedRecordAt,
  recordedFor,
  withDerivedRecord,
} from "./record";
import type { DerivedPatch } from "./record";
import { DERIVABLE, admissible, derivedGuard, patchSetFor } from "./derive";
import { reconcileOpenInTabTitle } from "../bonuses/open-in-tab";
import { reconcileDerivableBonus } from "../bonuses/splices";
import { offerRestart } from "../host/restart";
import {
  computeBonusStatus,
  noteBonusChanges,
  reconcileBonuses,
} from "../bonuses/session";
import { noBonusChanges } from "../bonuses/registry";
import type { BonusChanges } from "../bonuses/registry";
import { computeStatus } from "./status";
import { refreshStatusPanel, showStatusPanel } from "../host/status-view";
import { clearSettled, isSettled, markSettled } from "../install/fingerprint";

// Restore Originals flips the bonus settings off and reverts their files in one
// batch. Suspend the config-change listener for the duration so it cannot fire
// mid-batch and re-reconcile a bonus whose setting has not been flipped yet (for
// example re-applying the still-enabled title rename right after its file was
// reverted). Once the batch ends, settings and files agree, so any late change
// event reconciles to a no-op.
export let suspendReconcile = false;

// Resolves to whether a restart offer was shown (something was applied or
// restored), so activation's Apply path knows if the held bonus-restart
// notification is already covered by this one or must still be surfaced.
// `pending` is what that held notification would have said: those files moved
// earlier in this session, so the offer here must be strong enough for them.
export async function runPatch(
  mode: "apply" | "restore" | "status",
  pending?: BonusChanges,
): Promise<boolean> {
  const extPath = findLatestKiloExt();
  if (!extPath) {
    const home = os.homedir();
    const searched = candidateExtensionRoots()
      .map((r) => (r.startsWith(home) ? `~${r.slice(home.length)}` : r))
      .join(", ");
    vscode.window.showErrorMessage(
      `Kilo Code KB Patch: Could not find a kilocode.kilo-code-* install. Searched: ${
        searched || "(no extensions folder found)"
      }`,
    );
    return false;
  }
  return patchInstall(extPath, mode, pending);
}

// What a command does to one Kilo install. Apart from runPatch, which only
// finds the install, so the offline harness can run a command against a copy
// in the order the command really takes. An order written out again beside it
// proves that order: Restore Originals wrote reverted derivations back into
// the bundle through two releases while the harness restored the other way
// round.
export async function patchInstall(
  extPath: string,
  mode: "apply" | "restore" | "status",
  pending?: BonusChanges,
): Promise<boolean> {
  const version = extractVersion(extPath);
  const distDir = path.join(extPath, "dist");

  if (mode === "status") {
    // Status always does the real work: it is what someone runs precisely
    // when they doubt the state, so it must not read a cached claim about it.
    const { files, verdict } = computeStatus(distDir);
    showStatusPanel(version, verdict, files, computeBonusStatus(extPath));
    return false;
  }

  const results: PatchResult[] = [];

  // The record lives in webview.js but covers every file, so nothing is
  // written until the whole set is known: webview.js cannot carry a record of
  // kiloclaw.js's derivations that have not been worked out yet.
  const record = readDerivedRecordAt(distDir);
  const plans: {
    fp: FilePatches;
    fpath: string;
    patches: PatchDef[];
    derived: DerivedPatch[];
    remembered: DerivedPatch[];
  }[] = [];
  for (const fp of PATCHES) {
    const fpath = path.join(distDir, fp.filename);
    if (!fs.existsSync(fpath)) {
      results.push({
        filename: fp.filename,
        applied: [],
        skipped: [
          RETIRED_FILES.has(fp.filename)
            ? "not shipped by this Kilo Code build"
            : "file not found in dist/",
        ],
        reverted: [],
        noChanges: true,
      });
      continue;
    }
    plans.push({
      fp,
      fpath,
      ...patchSetFor(fp.filename, fpath, version, fp.patches, mode, record),
    });
  }

  // Apply keeps every derivation still doing a job and adds the new ones;
  // Restore keeps none, so the block goes with the edits.
  //
  // A derived bonus splice is recorded here too, and this write would drop it
  // otherwise: the bonus reconcilers run outside runPatch (from activation and
  // from a settings change), so on Apply its entry has to be carried across
  // rather than recomputed, or the edit is left on disk with nothing naming
  // it. A shipped variant that now describes the same edit byte-for-byte
  // retires the entry, which is the same convergence patchSetFor applies to
  // the core ones.
  const nextRecord =
    mode === "apply"
      ? [
          ...bonusDerivationsToKeep(record, distDir),
          ...plans.flatMap((p) => [...p.remembered, ...p.derived]),
        ]
      : [];
  const recordWriter = (filename: string) =>
    filename === CHAT_SCRIPT_FILE
      ? (modified: string) => withDerivedRecord(modified, nextRecord)
      : undefined;

  for (const plan of plans) {
    if (mode === "apply") {
      results.push(
        applyPatches(
          plan.fpath,
          plan.patches,
          plan.derived.length > 0
            ? derivedGuard(plan.fp.filename, plan.derived)
            : undefined,
          recordWriter(plan.fp.filename),
        ),
      );
    } else {
      results.push(
        restorePatches(
          plan.fpath,
          plan.patches,
          recordWriter(plan.fp.filename),
        ),
      );
    }
  }

  // The core blocks are applied with the bundle splices (and removed with them
  // below); the bonus blocks in the stylesheet follow the settings.
  if (mode === "apply") {
    results.push(
      blockResult(
        CHAT_STYLE_FILE,
        CHAT_CSS_CORE,
        reconcileChatStyle(extPath, coreCssDecision(true)),
        "apply",
      ),
      blockResult(
        CHAT_SCRIPT_FILE,
        CHAT_SCRIPT_CORE,
        reconcileChatScript(extPath, true),
        "apply",
      ),
    );
  }

  // Restore Originals also turns the bonuses off. Write each present setting
  // back to its off value so it stays off, then reconcile (the reconcilers read
  // the settings, so this reverts every bonus now and stops the next activation
  // from re-applying them). The listener is suspended so its own reconcile
  // cannot double-fire mid-batch; the final settings and files agree.
  let bonusReverted = 0;
  // Only the manifest needs the window, which either command can move: Apply
  // when the editor-title rename is asked for and not yet written, Restore
  // when it puts the title back.
  let manifestChanged = pending?.title ?? false;

  // Apply Patches also brings every bonus in line with its setting. Activation
  // does that before it offers to apply, but only on a launch the settled
  // fingerprint did not skip, and this command can be run on one it did, or
  // against a Kilo build that arrived after this host started. Recording the
  // install as settled below claims the bonuses agree as well, so that is
  // established here rather than assumed: left to activation, an install could
  // be recorded as settled with a bonus unwritten, and every launch after
  // would skip the pass that writes it.
  let bonusApplied = 0;
  if (mode === "apply") {
    const changed = reconcileBonuses(extPath);
    bonusApplied = Object.values(changed).filter(Boolean).length;
    manifestChanged = manifestChanged || changed.title;
  }

  if (mode === "restore") {
    suspendReconcile = true;
    try {
      for (const [key, off] of BONUS_SETTING_DEFAULTS) {
        await forceSettingOff(key, off);
      }
      const reverted = noBonusChanges();
      // `record` as read at the top of this run, for each bundle splice: the
      // core restore above has already rewritten webview.js without its record
      // block, so a derived splice could not be named from the file any more.
      if (reconcileDerivableBonus(extPath, "attach-button", record)) {
        bonusReverted++;
        reverted.attach = true;
      }
      if (reconcileOpenInTabTitle(extPath)) {
        bonusReverted++;
        manifestChanged = true;
        reverted.title = true;
      }
      if (reconcileDerivableBonus(extPath, "math-rendering", record)) {
        bonusReverted++;
        reverted.math = true;
      }
      if (reconcileDerivableBonus(extPath, "raw-markdown", record)) {
        bonusReverted++;
        reverted.rawMarkdown = true;
      }
      const css = reconcileChatStyle(extPath, coreCssDecision(false));
      if (css.typography || css.math || css["raw-markdown"]) bonusReverted++;
      reverted.typography = css.typography;
      reverted.math = reverted.math || css.math;
      reverted.rawMarkdown = reverted.rawMarkdown || css["raw-markdown"];
      // What Restore just took off disk is still on screen until the restart
      // the notification below offers.
      noteBonusChanges(reverted);
      results.push(
        blockResult(CHAT_STYLE_FILE, CHAT_CSS_CORE, css, "restore"),
        blockResult(
          CHAT_SCRIPT_FILE,
          CHAT_SCRIPT_CORE,
          reconcileChatScript(extPath, false),
          "restore",
        ),
      );
    } finally {
      suspendReconcile = false;
    }
  }

  // Apply leaves the install in the state activation would otherwise re-derive
  // from scratch; Restore leaves it in one we make no claim about.
  if (mode === "apply") markSettled(extPath);
  else clearSettled();

  // Every file this run was going to move has moved, so a status page open
  // beside the notification below reports the result rather than the state the
  // command was run from.
  refreshStatusPanel();

  const totalApplied =
    results.reduce((s, r) => s + r.applied.length + r.reverted.length, 0) +
    bonusReverted +
    bonusApplied;

  const verb = mode === "apply" ? "Patched" : "Restored";

  if (totalApplied > 0) {
    offerRestart(
      `Kilo Code KB Patch: ${verb} ${totalApplied} patch(es) on v${version}.`,
      manifestChanged ? "window" : "extensions",
    );
    return true;
  }
  // Nothing changed. Report it in terms of this build's features, not the raw
  // pattern list: a skipped-pattern count sweeps in every other version's
  // variants (dozens per feature), and on an already patched install it reads
  // as a failure ("No patches applied (74 skipped)") when the true state is
  // that there is nothing left to do.
  const { files, verdict } = computeStatus(distDir);
  if (mode === "restore") {
    vscode.window.showInformationMessage(
      `Kilo Code KB Patch: Nothing to restore on v${version}. Files are already original.`,
    );
    return false;
  }
  if (verdict === "fully patched") {
    vscode.window.showInformationMessage(
      `Kilo Code KB Patch: v${version} is already fully patched. Nothing to apply.`,
    );
    return false;
  }
  if (verdict === "version not recognized") {
    vscode.window.showWarningMessage(
      `Kilo Code KB Patch: No known patterns match v${version}. Update KB Patch to support it.`,
    );
    return false;
  }
  // Apply changed nothing yet the build is not fully patched: the remaining
  // features' patterns do not match this Kilo version.
  const missing = files
    .filter((f) => f.found)
    .flatMap((f) => f.features)
    .filter((ft) => ft.state === "missing").length;
  vscode.window.showWarningMessage(
    `Kilo Code KB Patch: ${missing} feature(s) on v${version} have no matching pattern. Update KB Patch to cover them.`,
  );
  return false;
}

// Whether any core webview.js patch is still waiting to be applied.
//
// Grouped by feature and stopped per feature rather than run flat over the
// array, because each test is one full scan of a ~20 MB bundle and the array
// grows by about six variants every time Kilo re-minifies. Flat, a *fully
// patched* install is the worst case rather than the cheapest: no entry
// reports work, so nothing short-circuits and every variant is scanned. That
// was 236 scans and ~520 ms of the ~620 ms activation by v1.24.0, against
// ~190 ms when the array held 40 variants, and it grew about 30 ms per
// release with no ceiling. Per feature the scan stops at the variant that
// matches, so the cost tracks the number of behaviors (which changes when one
// is added) instead of the number of variants (which changes every retarget).
//
// Stopping there is the rule applyPatches already follows: it takes the first
// variant that matches and leaves the rest alone. So once a feature's match is
// found, later variants of that feature cannot describe work Apply would do,
// and a feature whose match reads "already patched" is finished. The aliasing
// sweep run each release proves the stronger property this rests on, that
// exactly one variant of each feature matches any given build.
export function webviewNeedsPatching(
  content: string,
  extra: PatchDef[] = [],
): boolean {
  // Remembered derivations come first. On a build patched by derivation none
  // of the stored variants can match, so consulting them first makes every
  // launch re-scan 21 MB for ~240 patterns that cannot answer: 543 ms rather
  // than 14 ms, measured on 7.6.2, which is the pre-1.24.1 regression aimed at
  // exactly the users this path exists for. At most one variant of a feature
  // matches a build, so which one is looked at first is free.
  const byFeature = new Map<FeatureKey, PatchDef[]>();
  for (const patch of [...extra, ...WEBVIEW_PATCHES.patches]) {
    const variants = byFeature.get(patch.feature);
    if (variants) variants.push(patch);
    else byFeature.set(patch.feature, [patch]);
  }
  // A feature nothing here names a site for at all is the state a re-minify
  // leaves behind, and it is collected from this same loop rather than a
  // second pass: asking each variant separately would put the O(variants)
  // scan back on the activation path.
  const unresolved = new Set<FeatureKey>();
  for (const [key, variants] of byFeature) {
    let resolved = false;
    for (const p of variants) {
      if (content.includes(p.patched)) {
        resolved = true;
        break;
      }
      if (content.includes(p.original)) return true;
      if (p.previous && content.includes(p.previous)) return true;
    }
    if (!resolved) unresolved.add(key);
  }

  // Before derivation this state was silent: no variant matched, so nothing
  // reported work and the user stayed on stock Kilo until a release landed.
  // Deriving to answer it costs about 200 ms, paid only on a build no shipped
  // variant recognizes, which is also the only build that can reach here.
  for (const key of unresolved) {
    if (!DERIVABLE.includes(key)) continue;
    const rule = RULES.find(
      (r) => r.key === key && r.file === WEBVIEW_PATCHES.filename,
    );
    if (rule && admissible(rule, content)) return true;
  }
  return false;
}

// What a launch does to one Kilo install before anything is asked of the user:
// nothing when the fingerprint says the install is settled, and otherwise the
// bonus reconcile followed by the question of whether Apply has work to do.
// Apart from activate, which finds the install and does the asking, so the
// offline harness can take a launch against a copy.
type StartupPass =
  | { settled: true }
  | { settled: false; bonuses: BonusChanges; needsPatching: boolean };

export function startupPass(extPath: string, ownDir?: string): StartupPass {
  // Nothing Kilo owns has moved, our settings are the same, and we are the
  // same build: the full check ran on an earlier launch and found nothing to
  // do, and none of its inputs have changed since.
  if (isSettled(extPath, ownDir)) return { settled: true };

  // Reconcile the bonus knobs on startup (self-heals after a Kilo update resets
  // the files) and whenever one of our settings changes. The settings are
  // registered in package.json, so affectsConfiguration reports them reliably and
  // limits the reconcile (which reads the webview bundle) to relevant changes.
  // On the settings path the restart offer shows right away; the startup
  // result is held until the apply-patches decision is settled.
  const bonuses = reconcileBonuses(extPath);
  refreshStatusPanel();

  // Read after the bonus reconcile, which may itself rewrite webview.js, so the
  // needs-patching check sees the reconciled bundle.
  const webviewPath = path.join(extPath, "dist", CHAT_SCRIPT_FILE);
  const content = fs.existsSync(webviewPath)
    ? fs.readFileSync(webviewPath, "utf8")
    : "";
  const cssPath = path.join(extPath, "dist", CHAT_STYLE_FILE);
  const cssNeedsPatching =
    fs.existsSync(cssPath) &&
    chatCssCoreStatus(fs.readFileSync(cssPath, "utf8")).some(
      (f) => f.state === "unpatched",
    );
  const scriptNeedsPatching =
    content !== "" &&
    chatScriptCoreStatus(content).some((f) => f.state === "unpatched");
  const needsPatching =
    webviewNeedsPatching(
      content,
      recordedFor(
        readDerivedRecord(content),
        WEBVIEW_PATCHES.filename,
        content,
      ).map(asPatchDef),
    ) ||
    cssNeedsPatching ||
    scriptNeedsPatching;

  // The full check just ran and found nothing left to do, which is the one
  // place that claim can be recorded.
  if (!needsPatching) markSettled(extPath, ownDir);
  return { settled: false, bonuses, needsPatching };
}
