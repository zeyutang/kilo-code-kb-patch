#!/usr/bin/env node
// Re-derive every patch pattern from an installed Kilo build and report what, if
// anything, this release needs.
//
//   node tools/retarget.js [--ext <path to kilocode.kilo-code-*>]
//   node tools/retarget.js --vsix <path to a Kilo Code .vsix>
//
// Reads only: nothing is ever written. With --ext, any already-applied patch is
// reversed in memory first to recover the bytes Kilo shipped. With --vsix the
// bytes are pristine by construction, which also makes it the only way to target
// a release that is not installed.
//
// Each rule lands in one of four states:
//   covered     the derived pattern is already in src/extension.ts, nothing to do
//   NEW         derived cleanly and not yet present, emitted below for pasting
//   AMBIGUOUS   0 or >1 matches, so the shape moved or now aliases; needs a human
//   ERROR       an anchor inside the shape went missing; needs a human
//
// Exit code is 0 when every rule is covered, 1 when anything is new or unclear,
// which makes this usable as a post-update check.
const path = require("path");
const { loadExtension } = require("./lib/load");
const { resolveBundleSource, assertPristine, countOccurrences } = require("./lib/bundle");
const { RULES, ATTACH_RULE } = require("./lib/rules");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--ext") args.ext = argv[++i];
    else if (argv[i] === "--vsix") args.vsix = argv[++i];
    else if (argv[i] === "--help" || argv[i] === "-h") args.help = true;
    else throw new Error(`unknown argument ${JSON.stringify(argv[i])}`);
  }
  if (args.ext && args.vsix) throw new Error("pass either --ext or --vsix, not both");
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log("usage: node tools/retarget.js [--ext <path> | --vsix <path>]");
    return 0;
  }

  const test = loadExtension();
  const source = resolveBundleSource(test, args);
  const bundles = source.bundles;
  const version = source.version;

  console.log(`Kilo Code v${version}`);
  console.log(`  ${source.label}${source.kind === "vsix" ? " (vsix, pristine)" : ""}\n`);
  assertPristine(bundles);

  // Every pattern currently shipped, keyed by original, so "already covered" is
  // an exact check against what src/extension.ts really contains. The patched
  // side is kept too: a rule that derives the right site but rebuilds the edit
  // differently would otherwise pass silently, so the two are compared.
  const known = new Map();
  for (const fp of test.PATCHES) {
    known.set(fp.filename, new Map(fp.patches.map((p) => [p.original, p.patched])));
  }
  const knownAttach = new Map(
    test.ATTACH_FILE_BUTTONS.map((b) => [b.original, b.patched])
  );

  const proposals = [];
  let unclear = 0;

  const run = (rule, isAttach) => {
    const content = bundles[rule.file];
    if (content === undefined) {
      console.log(`  ERROR      ${rule.key}: ${rule.file} not present in dist/`);
      unclear++;
      return;
    }
    const result = rule.derive(content);

    if (result.error) {
      console.log(`  ERROR      ${rule.key}: ${result.error}`);
      unclear++;
      return;
    }
    if (result.matches !== undefined) {
      const how = result.matches === 0 ? "no match" : `${result.matches} matches`;
      console.log(`  AMBIGUOUS  ${rule.key}: ${how} for its shape`);
      unclear++;
      return;
    }

    // A derived pattern is only trustworthy if it identifies one site uniquely.
    const hits = countOccurrences(content, result.original);
    if (hits !== 1) {
      console.log(`  AMBIGUOUS  ${rule.key}: derived original occurs ${hits}x`);
      unclear++;
      return;
    }

    let shipped = isAttach
      ? knownAttach.get(result.original)
      : known.get(rule.file)?.get(result.original);
    let derivedPatched = result.patched;
    // A rule that widened its anchor still recognizes entries shipped with the
    // narrower pre-widening one; those are compared on the legacy form.
    if (shipped === undefined && result.legacy && !isAttach) {
      const older = known.get(rule.file)?.get(result.legacy.original);
      if (older !== undefined) {
        shipped = older;
        derivedPatched = result.legacy.patched;
      }
    }
    if (shipped !== undefined) {
      if (shipped !== derivedPatched) {
        console.log(
          `  MISMATCH   ${rule.key}: this site already ships, but the rule rebuilds ` +
            `the edit differently\n             shipped: ${shipped}\n             derived: ${derivedPatched}`
        );
        unclear++;
        return;
      }
      console.log(`  covered    ${rule.key}`);
      return;
    }

    console.log(`  NEW        ${rule.key}`);
    proposals.push({ rule, result, isAttach });
    unclear++;
  };

  for (const rule of RULES) run(rule, false);
  run(ATTACH_RULE, true);

  if (proposals.length > 0) {
    console.log(`\n${"=".repeat(76)}`);
    console.log(`Patterns to add for v${version}`);
    console.log("=".repeat(76));

    const core = proposals.filter((p) => !p.isAttach);
    for (const file of ["webview.js", "kiloclaw.js"]) {
      const forFile = core.filter((p) => p.rule.file === file);
      if (forFile.length === 0) continue;
      console.log(`\n// --- ${file}: prepend inside its patches[] array ---`);
      const symbols = forFile
        .map((p) => `${p.rule.key} ${JSON.stringify(p.result.symbols)}`)
        .join("\n//     ");
      console.log(`// v${version}+ derived symbols:\n//     ${symbols}`);
      // A rule's key is also the PatchDef feature key, and PatchDef requires it,
      // so emitting it keeps the pasted block compiling.
      for (const { rule, result } of forFile) {
        console.log("      {");
        console.log(`        feature: ${JSON.stringify(rule.key)},`);
        console.log(`        original: ${JSON.stringify(result.original)},`);
        console.log(`        patched: ${JSON.stringify(result.patched)},`);
        console.log(`        description: ${JSON.stringify(rule.description(version))},`);
        console.log("      },");
      }
    }

    const attach = proposals.find((p) => p.isAttach);
    if (attach) {
      console.log("\n// --- ATTACH_FILE_BUTTONS: prepend (newest first) ---");
      console.log(`// v${version}+ derived symbols:`);
      console.log(`//     ${JSON.stringify(attach.result.symbols)}`);
      console.log("  {");
      console.log(`    original: ${JSON.stringify(attach.result.original)},`);
      console.log(`    patched: ${JSON.stringify(attach.result.patched)},`);
      console.log("  },");
    }

    console.log(
      "\nAfter pasting, run `npm run compile && npm run verify` to prove the round-trip."
    );
  }

  if (unclear === 0) {
    console.log(`\nAll rules covered: v${version} needs no retarget.`);
  }
  return unclear === 0 ? 0 : 1;
}

try {
  process.exitCode = main();
} catch (err) {
  console.error(`retarget: ${err.message}`);
  process.exitCode = 2;
}
