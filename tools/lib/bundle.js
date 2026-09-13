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
const { openVsix } = require("./vsix");

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
      test.parseKiloVersion(path.basename(b.extPath)),
    ),
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
      "No kilocode.kilo-code-* install found. Pass one explicitly with --ext <path>.",
    );
  }
  return installs[installs.length - 1];
}

// Reverse every known patch (core, their `previous` forms, and the opt-in
// bonuses) so callers see the bytes Kilo shipped. Pure string work on a copy.
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
    // Every webview.js bonus is a variant list of the same shape: newest
    // patched form first, older ones in `previous`.
    for (const variants of [
      test.ATTACH_FILE_BUTTONS,
      test.MATH_EXTENSIONS,
      test.RAW_MARKDOWN_TOGGLES,
    ]) {
      for (const b of variants) {
        if (out.includes(b.patched)) out = out.replace(b.patched, b.original);
        else {
          const prev = b.previous?.find((p) => out.includes(p));
          if (prev) out = out.replace(prev, b.original);
        }
      }
    }
  }
  // The appended blocks, the core blocks (chat-scroll's two halves and the
  // hover guard) and the stylesheet bonuses alike, are reversed by a delete
  // rather than a substitution.
  if (filename === test.CHAT_STYLE_FILE) out = test.stripChatCss(out);
  if (filename === test.CHAT_SCRIPT_FILE) out = test.stripChatScript(out);
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
  ".ctrlKey)&&(",
  ".ctrlKey)?(",
  // The chat-history splice's caret argument. Kilo passes the real caret there
  // and its own direction test reads `?"up":"down"`, so the `?0:` form is ours
  // alone: 0 in every pristine build checked, 7.4.17 through 7.5.6. The
  // modifier half of that edit needs no marker of its own and could not serve
  // as one anyway, since pristine webview.js already ships `.ctrlKey)&&!`.
  '==="ArrowUp"?0:',
  // The mention-escape splice's guard on the controller's dead-query slot.
  // Kilo indexes nothing with `.at]` and never compares a character to "@"
  // this way: 0 in every pristine build checked, 7.4.17 through 7.5.16.
  '.at]!=="@"&&(',
  // The math-rendering bonus. Every injected extension is named with the same
  // prefix, and Kilo names none of its own that way, so one marker covers all
  // three and every release's variant of them.
  'name:"kbpKatex',
  // Every appended block, core or bonus, stylesheet or script, opens with
  // this prefix. The blocks are keyed (`/* kilo-code-kb-patch:<key>:begin */`),
  // so the bare `kilo-code-kb-patch:begin` an earlier draft of the marker
  // looked for never matched a shipped block.
  "/* kilo-code-kb-patch:",
  // Two attach-button fingerprints: forms shipped before 1.18.0 (now carried
  // in previous[]) and the pre-7.4.17 entries caption via Kilo's
  // t("prompt.action.attachFile"), while 1.18.0 recaptioned the 7.4.17+
  // variants with a literal because Kilo dropped that key. The selectMention
  // form covers every variant, old and new: each onClick passes the mention
  // item as an object literal, where Kilo's own call sites pass a variable.
  't("prompt.action.attachFile")',
  'selectMention({type:"file-picker"}',
  // The raw-markdown toggle. Its button and the block it appends are both
  // slotted under one name Kilo uses nowhere, so the marker covers the splice
  // and, via the same string, the stylesheet block that styles it.
  "kbp-raw-markdown",
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
    .map(
      (d) =>
        `  ${d.filename}: ${d.residual.map((m) => JSON.stringify(m)).join(", ")}`,
    )
    .join("\n");
  throw new Error(
    "this install still carries kb-patch edits that this checkout cannot reverse,\n" +
      "so its pristine bytes cannot be recovered. Leftover markers:\n" +
      detail +
      "\n\nThe usual cause is an installed kb-patch newer than this checkout.\n" +
      'Fix by running the "Kilo Code KB Patch: Restore Originals" command (or\n' +
      "reinstalling Kilo Code), then retry. A clean build can also be passed\n" +
      "directly with --ext <path>.",
  );
}

// Every dist/ file the patch set touches: the bundles named in PATCHES (one of
// which also takes the core script blocks) plus the stylesheet the chat-scroll
// rule and the two stylesheet bonuses append to. Kept as one list
// so the pristine readers, the marker scan and the leakage check all cover the
// same set.
function patchedFilenames(test) {
  return [...test.PATCHES.map((fp) => fp.filename), test.CHAT_STYLE_FILE];
}

// Pristine contents of every file the patch set covers, keyed by filename.
function readPristineBundles(extPath, test) {
  const bundles = {};
  for (const filename of patchedFilenames(test)) {
    const fpath = path.join(extPath, "dist", filename);
    if (!fs.existsSync(fpath)) continue;
    bundles[filename] = unpatched(
      fs.readFileSync(fpath, "utf8"),
      filename,
      test,
    );
  }
  return bundles;
}

// Bundles straight out of a .vsix. No reversal happens because nothing has ever
// patched these bytes, which is why this is the preferred source: pristine by
// construction rather than by reconstruction.
function readVsixBundles(vsixPath, test) {
  const zip = openVsix(vsixPath);
  const bundles = {};
  for (const filename of patchedFilenames(test)) {
    const payload = zip.read(`extension/dist/${filename}`);
    if (payload) bundles[filename] = payload.toString("utf8");
  }
  if (Object.keys(bundles).length === 0) {
    throw new Error(
      `${path.basename(vsixPath)} contains no extension/dist/ bundles this patch set covers.\n` +
        "Is it a Kilo Code vsix?",
    );
  }

  let version = "unknown";
  const manifest = zip.read("extension/package.json");
  if (manifest) {
    try {
      version = JSON.parse(manifest.toString("utf8")).version ?? "unknown";
    } catch {
      // A manifest we cannot parse only costs the version label, so carry on.
    }
  }
  return { bundles, version };
}

// One entry point for both CLIs so a vsix and an install are interchangeable
// everywhere downstream.
function resolveBundleSource(test, args) {
  if (args.vsix) {
    const { bundles, version } = readVsixBundles(args.vsix, test);
    return { kind: "vsix", label: path.resolve(args.vsix), version, bundles };
  }
  const install = resolveInstall(test, args.ext);
  return {
    kind: "install",
    label: install.extPath,
    version: install.version,
    bundles: readPristineBundles(install.extPath, test),
  };
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
  patchedFilenames,
  unpatched,
  readPristineBundles,
  readVsixBundles,
  resolveBundleSource,
  assertPristine,
  residualPatchMarkers,
  countOccurrences,
};
