#!/usr/bin/env node
// Prove the shipped patch set against a real Kilo build, offline.
//
//   node tools/verify.js [--ext <path to kilocode.kilo-code-*>] [--only <sections>]
//   node tools/verify.js --vsix <path to a Kilo Code .vsix> [--only <sections>]
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
//   validity      the fully patched bundles still parse, the appended script
//                 block included
//   zero leakage  restoring returns the file byte-for-byte to pristine, which
//                 is the strongest statement that nothing outside the intended
//                 spans was touched
//
// Each section is a module under tools/verify/, run in the order SECTIONS
// lists. A section reads what the setup below prepares, and most also build on
// what an earlier section left in the sandbox (the patched bundles, a bonus
// switched on), which each names in its `needs`. `--only` takes a
// comma-separated list of sections and runs them after everything they build
// on, in that same order.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { parseArgs, openBuild, verdict } = require("./lib/cli");

const SECTIONS = [
  "uniqueness",
  "apply",
  "completeness",
  "gates",
  "idempotence",
  "chat-scroll-style",
  "math-clip",
  "chat-scroll-script",
  "hover-guard",
  "attach-button",
  "math-rendering",
  "derived-bonuses",
  "raw-markdown",
  "chat-stylesheet",
  "core-upgrade",
  "permission-keys",
  "chat-history",
  "literal-replacement",
  "needs-patching",
  "validity",
  "shape-literals",
  "derivation",
  "commands",
  "fingerprint",
  "editor-title",
  "settings",
  "zero-leakage",
].map((name) => ({ name, ...require(`./verify/${name}`) }));

// A section builds only on sections that run before it, so running what it
// needs in this order lays the sandbox out the way a full run does.
SECTIONS.forEach((section, i) => {
  for (const need of section.needs) {
    if (!SECTIONS.slice(0, i).some((earlier) => earlier.name === need)) {
      throw new Error(
        `${section.name} needs ${need}, which does not run before it`,
      );
    }
  }
});

// The sections a run takes: every one, or those named and everything they
// build on.
function selected(only) {
  if (only === undefined) return SECTIONS;
  const wanted = new Set();
  const add = (name) => {
    const section = SECTIONS.find((s) => s.name === name);
    if (!section) {
      throw new Error(`no section ${JSON.stringify(name)}; --help lists them`);
    }
    if (wanted.has(name)) return;
    wanted.add(name);
    for (const need of section.needs) add(need);
  };
  for (const name of only.split(",")) add(name.trim());
  return SECTIONS.filter((s) => wanted.has(s.name));
}

async function main() {
  const args = parseArgs(process.argv, { "--only": "value" });
  if (args.help) {
    console.log(
      "usage: node tools/verify.js [--ext <path> | --vsix <path>] [--only <section>,...]",
    );
    console.log(`sections: ${SECTIONS.map((s) => s.name).join(", ")}`);
    return 0;
  }
  const sections = selected(args.only);

  const { test, source } = openBuild(args);
  const pristine = source.bundles;

  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "kb-patch-verify-"));
  const dist = path.join(sandbox, "dist");
  fs.mkdirSync(dist, { recursive: true });
  for (const [filename, content] of Object.entries(pristine)) {
    fs.writeFileSync(path.join(dist, filename), content, "utf8");
  }

  // What every section may read: the build and the sandbox, the stylesheet
  // and the bundle the core blocks are appended to, as Kilo shipped them and
  // where the sandbox keeps them, and the two decisions about the core
  // stylesheet blocks that Apply and Restore pass.
  const pristineCss = pristine[test.CHAT_STYLE_FILE];
  const context = {
    test,
    source,
    pristine,
    sandbox,
    dist,
    pristineCss,
    cssPath: path.join(dist, test.CHAT_STYLE_FILE),
    coreOn: test.coreCssDecision(true),
    coreOff: test.coreCssDecision(false),
    // Whether Apply writes a core stylesheet block here, which it does not
    // where the block's gate says this build already does without it.
    cssCoreNeeded: (key) =>
      pristineCss === undefined ||
      test.FEATURE_GATES[key]?.(pristineCss) !== false,
    pristineJs: pristine[test.CHAT_SCRIPT_FILE],
    scriptPath: path.join(dist, test.CHAT_SCRIPT_FILE),
  };

  try {
    for (const section of sections) await section.run(context);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }

  return verdict();
}

// Async because Restore Originals is: it writes the bonus settings back before
// it touches a file, and the commands section runs it as the command does.
main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(`verify: ${err.message}`);
    process.exitCode = 2;
  },
);
