// The settled-launch fingerprint, which lets a launch skip a check whose
// inputs have not changed since it last found nothing to do.

import fs = require("fs");
import path = require("path");
import { RETIRED_FILES } from "../core/features";
import { PATCHES } from "../patterns";
import { extensionContext } from "../host/context";
import { BONUS_SETTING_DEFAULTS, config } from "../host/settings";
import { CHAT_STYLE_FILE } from "../blocks/machinery";
import { bonusReconcileFailed } from "../bonuses/session";

// --- Settled-state fingerprint -----------------------------------------------
//
// Everything activation does is one question: is this install already in the
// state our patches and settings imply? Answering it reads Kilo's 21 MB bundle
// four times and scans it for anchors and variants, which is 148 ms of
// synchronous work on the extension host at every launch, and the answer is
// "yes, nothing to do" every time after the first.
//
// The answer can only change if Kilo's files changed, our settings changed, or
// kb-patch itself changed. All three are readable without opening a bundle:
// stat() calls on Kilo's files and on our own, and the settings we contribute.
// When that fingerprint matches the one recorded the last time the question
// was answered in full, the answer is still the same.
//
// This is a cache, not a source of truth. Anything that does not match falls
// through to the full check, so the worst case is what activation costs today,
// and Show Status never consults it at all.
const SETTLED_KEY = "settledFingerprint.v1";
// Every file the patch set touches: the bundles PATCHES names, and the
// stylesheet the blocks are appended to.
const FINGERPRINT_FILES = [
  ...PATCHES.map((fp) => fp.filename),
  CHAT_STYLE_FILE,
];

// kb-patch's own code, named by the files that hold it rather than by its
// version alone. The version says which release this is, and a build can
// change without it: a package installed to test a release before the version
// is bumped, which is how every release here is tested, or a reinstall. Keyed
// on the version, the fingerprint kept matching under such a build, so the
// launch skipped the reconcile that build existed to run, the bonuses it
// could newly apply were never written, and Show Status asked for a restart
// that changed nothing.
const OWN_BUILD_FILES = ["extension.js", "rules.js"];

export function ownBuildIdentity(dir: string = __dirname): string | undefined {
  const parts: string[] = [];
  for (const name of OWN_BUILD_FILES) {
    try {
      const s = fs.statSync(path.join(dir, name));
      parts.push(`${name}:${s.size}:${s.mtimeMs}`);
    } catch {
      // Code we cannot identify is code we cannot vouch for having run.
      return undefined;
    }
  }
  return parts.join(",");
}

export function installFingerprint(
  extPath: string,
  // Where this build's code lives. Only the harness passes one, to stand a
  // rebuilt kb-patch next to the one that recorded the fingerprint.
  ownDir?: string,
): string | undefined {
  const own = ownBuildIdentity(ownDir);
  if (own === undefined) return undefined;
  const parts: string[] = [
    extensionContext?.extension?.packageJSON?.version ?? "?",
    own,
    path.basename(extPath),
  ];
  for (const name of FINGERPRINT_FILES) {
    try {
      const s = fs.statSync(path.join(extPath, "dist", name));
      parts.push(`${name}:${s.size}:${s.mtimeMs}`);
    } catch {
      // A file we cannot stat means we cannot claim the install is settled,
      // unless Kilo has simply stopped shipping it (see RETIRED_FILES). Its
      // absence is recorded as a value of its own, so the shortcut survives on
      // such a build and still gives way the moment the file comes back.
      if (!RETIRED_FILES.has(name)) return undefined;
      parts.push(`${name}:absent`);
    }
  }
  // The bonus settings decide what the reconcilers would write, so a change to
  // one of them has to invalidate the record even though no file moved.
  // BONUS_SETTING_DEFAULTS keys are bare, as every other reader here expects,
  // so the section has to be named or each lookup misses and a settings change
  // leaves the record standing.
  const settings = config();
  for (const [key, off] of BONUS_SETTING_DEFAULTS) {
    parts.push(`${key}=${String(settings.get(key, off))}`);
  }
  return parts.join("|");
}

export function isSettled(extPath: string, ownDir?: string): boolean {
  const now = installFingerprint(extPath, ownDir);
  return (
    now !== undefined &&
    now === extensionContext?.globalState.get<string>(SETTLED_KEY)
  );
}

// Recorded only where the full check has just run and found nothing left to
// do. Recording it anywhere else would be a claim we have not verified.
//
// A reconcile pass that stopped short is such a claim, and it takes the
// record with it rather than leaving it alone: when the write that failed was
// the only one the pass had to make, nothing on disk moved, so a fingerprint
// recorded earlier still matches and would go on skipping the retry.
export function markSettled(extPath: string, ownDir?: string): void {
  if (bonusReconcileFailed) {
    clearSettled();
    return;
  }
  const now = installFingerprint(extPath, ownDir);
  if (now !== undefined) {
    void extensionContext?.globalState.update(SETTLED_KEY, now);
  }
}

export function clearSettled(): void {
  void extensionContext?.globalState.update(SETTLED_KEY, undefined);
}
