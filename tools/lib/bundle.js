// Locating Kilo installs and reading their bundles.
//
// Everything here is read-only with respect to the user's real install. Kilo's
// bundles are patched in place on activation, so a freshly-updated install is
// usually *partially* patched already; deriving patterns from that state would
// bake our own edits into the next "original". unpatched() therefore reverses
// every known patch in memory to recover the pristine bytes, without writing.
const fs = require("fs");
const os = require("os");
const path = require("path");

// Every candidate root, not just the first one that matches: the harness is a
// maintenance tool, so being able to see (and target) an older build left behind
// by another fork is a feature rather than a hazard.
function findKiloInstalls(test) {
  const found = [];
  for (const rel of test.KNOWN_EXT_DIRS) {
    const root = path.join(os.homedir(), rel);
    let entries;
    try {
      entries = fs.readdirSync(root);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.startsWith("kilocode.kilo-code-")) continue;
      const extPath = path.join(root, name);
      if (fs.existsSync(path.join(extPath, "dist"))) {
        found.push({ extPath, version: test.extractVersion(extPath) });
      }
    }
  }
  found.sort((a, b) =>
    test.compareKiloVersions(
      test.parseKiloVersion(path.basename(a.extPath)),
      test.parseKiloVersion(path.basename(b.extPath))
    )
  );
  return found;
}

function resolveInstall(test, explicitPath) {
  if (explicitPath) {
    const extPath = path.resolve(explicitPath);
    if (!fs.existsSync(path.join(extPath, "dist"))) {
      throw new Error(`No dist/ under ${extPath}`);
    }
    return { extPath, version: test.extractVersion(extPath) };
  }
  const installs = findKiloInstalls(test);
  if (installs.length === 0) {
    throw new Error(
      "No kilocode.kilo-code-* install found. Pass one explicitly with --ext <path>."
    );
  }
  return installs[installs.length - 1];
}

// Reverse every known patch (core, their `previous` forms, and the opt-in attach
// button) so callers see the bytes Kilo shipped. Pure string work on a copy.
function unpatched(content, filename, test) {
  let out = content;
  const file = test.PATCHES.find((f) => f.filename === filename);
  if (file) {
    for (const p of file.patches) {
      if (out.includes(p.patched)) out = out.replace(p.patched, p.original);
      else if (p.previous && out.includes(p.previous)) {
        out = out.replace(p.previous, p.original);
      }
    }
  }
  if (filename === "webview.js") {
    for (const b of test.ATTACH_FILE_BUTTONS) {
      if (out.includes(b.patched)) out = out.replace(b.patched, b.original);
    }
  }
  return out;
}

// Text that only our own patches introduce; Kilo ships none of it. Anything
// still present after unpatched() means the file carries edits from a pattern
// set this source tree does not know, which happens in one specific and easy to
// hit situation: the installed kb-patch is newer than the checkout being tested,
// so it applied patterns the checkout cannot reverse.
//
// That state is dangerous rather than merely unhelpful. Deriving from it would
// silently bake our own edits into the next release's "original", and the
// shape rules would report "no match" as though Kilo had re-minified, sending
// the maintainer off to re-recon a scope that never moved. So the harness
// refuses to proceed instead of guessing.
const PATCH_MARKERS = [
  "target?.value?.trim()",
  ".metaKey&&(",
  ".metaKey?(",
  't("prompt.action.attachFile")',
];

function residualPatchMarkers(content) {
  return PATCH_MARKERS.filter((marker) => content.includes(marker));
}

function assertPristine(bundles) {
  const dirty = [];
  for (const [filename, content] of Object.entries(bundles)) {
    const residual = residualPatchMarkers(content);
    if (residual.length > 0) dirty.push({ filename, residual });
  }
  if (dirty.length === 0) return;

  const detail = dirty
    .map((d) => `  ${d.filename}: ${d.residual.map((m) => JSON.stringify(m)).join(", ")}`)
    .join("\n");
  throw new Error(
    "this install still carries kb-patch edits that this checkout cannot reverse,\n" +
      "so its pristine bytes cannot be recovered. Leftover markers:\n" +
      detail +
      "\n\nThe usual cause is an installed kb-patch newer than this checkout.\n" +
      "Fix by running the \"Kilo Code KB Patch: Restore Originals\" command (or\n" +
      "reinstalling Kilo Code), then retry. A clean build can also be passed\n" +
      "directly with --ext <path>."
  );
}

// Pristine contents of every file the patch set covers, keyed by filename.
function readPristineBundles(extPath, test) {
  const bundles = {};
  for (const fp of test.PATCHES) {
    const fpath = path.join(extPath, "dist", fp.filename);
    if (!fs.existsSync(fpath)) continue;
    bundles[fp.filename] = unpatched(
      fs.readFileSync(fpath, "utf8"),
      fp.filename,
      test
    );
  }
  return bundles;
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let i = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    count++;
    i += needle.length;
  }
  return count;
}

module.exports = {
  findKiloInstalls,
  resolveInstall,
  unpatched,
  readPristineBundles,
  assertPristine,
  residualPatchMarkers,
  countOccurrences,
};
