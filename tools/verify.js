#!/usr/bin/env node
// Prove the shipped patch set against a real Kilo build, offline.
//
//   node tools/verify.js [--ext <path to kilocode.kilo-code-*>]
//   node tools/verify.js --vsix <path to a Kilo Code .vsix>
//
// The install is only ever read. Pristine bytes are copied into a temp sandbox
// and every assertion runs against the extension's own exported functions, so a
// green run is evidence about what ships, not about a reimplementation. A vsix
// source is stronger still: those bytes never passed through kb-patch, so they
// need no reversal step to be trusted.
//
// What it proves, in the order the properties matter:
//   uniqueness    each original identifies exactly one site (String.replace
//                 rewrites the first match, so first must equal only)
//   completeness  applying yields "fully patched" with no feature missing
//   idempotence   a second apply is a no-op, so activation cannot drift
//   validity      the fully patched bundles still parse
//   zero leakage  restoring returns the file byte-for-byte to pristine, which
//                 is the strongest statement that nothing outside the intended
//                 spans was touched
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { loadExtension, shim } = require("./lib/load");
const { resolveBundleSource, assertPristine, countOccurrences } = require("./lib/bundle");
const { RULES } = require("./lib/rules");

let failures = 0;
function check(condition, label, detail) {
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ""}`);
  }
  return condition;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--ext") args.ext = argv[++i];
    else if (argv[i] === "--vsix") args.vsix = argv[++i];
    else if (argv[i] === "--help" || argv[i] === "-h") args.help = true;
  }
  if (args.ext && args.vsix) throw new Error("pass either --ext or --vsix, not both");
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log("usage: node tools/verify.js [--ext <path> | --vsix <path>]");
    return 0;
  }

  const test = loadExtension();
  const source = resolveBundleSource(test, args);
  const pristine = source.bundles;
  console.log(
    `Kilo Code v${source.version}\n  ${source.label}` +
      `${source.kind === "vsix" ? " (vsix, pristine)" : ""}\n`
  );
  assertPristine(pristine);

  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "kb-patch-verify-"));
  const dist = path.join(sandbox, "dist");
  fs.mkdirSync(dist, { recursive: true });
  for (const [filename, content] of Object.entries(pristine)) {
    fs.writeFileSync(path.join(dist, filename), content, "utf8");
  }

  try {
    console.log("uniqueness (originals present in this build)");
    for (const fp of test.PATCHES) {
      const content = pristine[fp.filename];
      if (content === undefined) continue;
      for (const p of fp.patches) {
        const hits = countOccurrences(content, p.original);
        // Most entries target other releases and are legitimately absent here;
        // only a pattern that this build actually matches must be unique.
        if (hits === 0) continue;
        check(hits === 1, `${fp.filename}: unique original for "${p.description}"`, `occurs ${hits}x`);
      }
    }

    console.log("\napply");
    for (const fp of test.PATCHES) {
      if (pristine[fp.filename] === undefined) continue;
      const result = test.applyPatches(path.join(dist, fp.filename), fp.patches);
      check(result.applied.length > 0, `${fp.filename}: applied ${result.applied.length} patch(es)`);
      for (const description of result.applied) console.log(`          + ${description}`);
    }

    console.log("\ncompleteness");
    const status = test.computeStatus(dist);
    check(status.verdict === "fully patched", `verdict is "fully patched"`, `got "${status.verdict}"`);
    for (const file of status.files) {
      if (!file.found) continue;
      for (const feature of file.features) {
        check(feature.state === "patched", `${file.filename}: ${feature.label}`, `state "${feature.state}"`);
      }
      // A description the status view cannot classify is dropped from the rows
      // entirely rather than shown as missing, so compare against the rule set
      // to catch that silent loss.
      const expected = new Set(RULES.filter((r) => r.file === file.filename).map((r) => r.key)).size;
      check(
        file.features.length === expected,
        `${file.filename}: ${expected} feature row(s) in the status view`,
        `got ${file.features.length}; a patch description may be unclassifiable`
      );
    }

    console.log("\nidempotence");
    for (const fp of test.PATCHES) {
      if (pristine[fp.filename] === undefined) continue;
      const again = test.applyPatches(path.join(dist, fp.filename), fp.patches);
      check(again.noChanges, `${fp.filename}: re-apply is a no-op`);
    }

    console.log("\nattach-file button (opt-in bonus)");
    shim.setConfig({ addAttachFileButton: true });
    check(test.reconcileAttachFileButton(sandbox), "enabling adds the button");
    const bonus = test.computeBonusStatus(sandbox);
    check(bonus[0]?.state === "on", "bonus reports on", `got "${bonus[0]?.state}"`);

    console.log("\nvalidity (fully patched bundles still parse)");
    for (const filename of Object.keys(pristine)) {
      const target = path.join(dist, filename);
      try {
        execFileSync(process.execPath, ["--check", target], { stdio: "pipe" });
        check(true, `node --check ${filename}`);
      } catch (err) {
        check(false, `node --check ${filename}`, String(err.stderr || err.message).trim());
      }
    }

    console.log("\nzero leakage (restore returns the file to pristine)");
    shim.setConfig({ addAttachFileButton: false });
    test.reconcileAttachFileButton(sandbox);
    for (const fp of test.PATCHES) {
      if (pristine[fp.filename] === undefined) continue;
      test.restorePatches(path.join(dist, fp.filename), fp.patches);
    }
    for (const [filename, original] of Object.entries(pristine)) {
      const restored = fs.readFileSync(path.join(dist, filename), "utf8");
      check(restored === original, `${filename}: byte-identical to pristine after restore`);
    }
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }

  console.log(`\n${failures === 0 ? "PASS" : `FAIL (${failures})`}`);
  return failures === 0 ? 0 : 1;
}

try {
  process.exitCode = main();
} catch (err) {
  console.error(`verify: ${err.message}`);
  process.exitCode = 2;
}
