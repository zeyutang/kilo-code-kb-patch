// The status model for the core patches: one row per behavior and file, and
// the verdict over all of them.

import fs = require("fs");
import path = require("path");
import {
  FEATURE_GATES,
  FEATURE_LABELS,
  FEATURE_ORDER,
  RETIRED_FILES,
} from "./features";
import type { FeatureKey, FeatureState, PatchDef } from "./features";
import { PATCHES } from "../patterns";
import { CHAT_SCRIPT_FILE, CHAT_STYLE_FILE } from "../blocks/machinery";
import { chatCssCoreStatus } from "../blocks/chat-style";
import { chatScriptCoreStatus } from "../blocks/chat-script";
import { asPatchDef, readDerivedRecordAt, recordedFor } from "./record";

export type Verdict =
  | "fully patched"
  | "partially patched"
  | "not patched"
  | "version not recognized";

export interface FileStatus {
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
  patches: PatchDef[],
): { label: string; state: FeatureState }[] {
  const byFeature = new Map<FeatureKey, FeatureState>();
  const intended = new Set<FeatureKey>();

  for (const p of patches) {
    const key = p.feature;
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
    state:
      byFeature.get(k) ??
      (FEATURE_GATES[k]?.(content) === false ? "unneeded" : "missing"),
  }));
}

// Every feature a retired file used to carry, in FEATURE_ORDER, all "unneeded".
// Read off the variants rather than from a second list, so a file that goes
// away reports exactly the behaviors it was covering.
function retiredFeatures(
  patches: PatchDef[],
): { label: string; state: FeatureState }[] {
  const intended = new Set(patches.map((p) => p.feature));
  return FEATURE_ORDER.filter((k) => intended.has(k)).map((k) => ({
    label: FEATURE_LABELS[k],
    state: "unneeded" as FeatureState,
  }));
}

// Rows in FEATURE_ORDER, whichever derivation they came from.
function inFeatureOrder<T extends { label: string }>(rows: T[]): T[] {
  const rank = new Map<string, number>(
    FEATURE_ORDER.map((key, i) => [FEATURE_LABELS[key], i]),
  );
  return [...rows].sort(
    (a, b) => (rank.get(a.label) ?? 0) - (rank.get(b.label) ?? 0),
  );
}

function computeVerdict(files: FileStatus[]): Verdict {
  // A feature this build has no need of neither counts for nor against it.
  const states = files
    .filter((f) => f.found)
    .flatMap((f) => f.features.map((ft) => ft.state))
    .filter((s) => s !== "unneeded");

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

// `version` brings in the derivations recorded for this build, without which a
// feature patched by one would read as "missing" here while working fine.
export function computeStatus(distDir: string): {
  files: FileStatus[];
  verdict: Verdict;
} {
  // One record covers every file, and it lives in the bundle, so it is read
  // once here rather than per file.
  const record = readDerivedRecordAt(distDir);
  const files: FileStatus[] = [];
  for (const fp of PATCHES) {
    const fpath = path.join(distDir, fp.filename);
    if (!fs.existsSync(fpath)) {
      // A file Kilo retired still gets its rows, each reading "not needed":
      // dropping them would hide which behaviors are inert on this build, and
      // "missing" would read as a pattern waiting to be re-targeted.
      files.push({
        filename: fp.filename,
        found: false,
        features: RETIRED_FILES.has(fp.filename)
          ? retiredFeatures(fp.patches)
          : [],
      });
      continue;
    }
    const content = fs.readFileSync(fpath, "utf8");
    // A core block has no PatchDef: it is derived from the build at reconcile
    // time, so its row comes from that same derivation, and it takes its place
    // in FEATURE_ORDER among the file's splices.
    const derived = recordedFor(record, fp.filename, content).map(asPatchDef);
    const features = statusForFile(content, [...derived, ...fp.patches]);
    if (fp.filename === CHAT_SCRIPT_FILE) {
      features.push(...chatScriptCoreStatus(content));
    }
    files.push({
      filename: fp.filename,
      found: true,
      features: inFeatureOrder(features),
    });
  }
  const cssPath = path.join(distDir, CHAT_STYLE_FILE);
  files.push(
    fs.existsSync(cssPath)
      ? {
          filename: CHAT_STYLE_FILE,
          found: true,
          features: chatCssCoreStatus(fs.readFileSync(cssPath, "utf8")),
        }
      : { filename: CHAT_STYLE_FILE, found: false, features: [] },
  );
  return { files, verdict: computeVerdict(files) };
}
