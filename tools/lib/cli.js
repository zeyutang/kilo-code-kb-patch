// What the harness's tools share at their edges: reading the command line,
// opening the Kilo build a run is pointed at, and keeping the tally of checks
// that failed.
const { loadExtension } = require("./load");
const { resolveBundleSource, assertPristine } = require("./bundle");

// `--ext <path>` and `--vsix <path>` choose the build and `--help` asks for the
// usage line. A tool names any flag of its own in `own`, mapped to `true` for
// a switch or to "value" for a flag followed by its value, and finds it in
// the result under its name without the dashes.
function parseArgs(argv, own = {}) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--ext") args.ext = argv[++i];
    else if (flag === "--vsix") args.vsix = argv[++i];
    else if (flag === "--help" || flag === "-h") args.help = true;
    else if (own[flag] === true) args[flag.slice(2)] = true;
    else if (own[flag] === "value") args[flag.slice(2)] = argv[++i];
    else throw new Error(`unknown argument ${JSON.stringify(flag)}`);
  }
  if (args.ext && args.vsix)
    throw new Error("pass either --ext or --vsix, not both");
  return args;
}

// The extension's __test surface and the build the arguments name, announced
// the same way by every tool, and refused if it still carries edits this
// checkout cannot take back.
function openBuild(args) {
  const test = loadExtension();
  const source = resolveBundleSource(test, args);
  console.log(
    `Kilo Code v${source.version}\n  ${source.label}` +
      `${source.kind === "vsix" ? " (vsix, pristine)" : ""}\n`,
  );
  assertPristine(source.bundles, test);
  return { test, source };
}

// One process runs one tool, so one tally serves every module that checks.
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

// The last line of a run, and the exit code that goes with it.
function verdict() {
  console.log(`\n${failures === 0 ? "PASS" : `FAIL (${failures})`}`);
  return failures === 0 ? 0 : 1;
}

module.exports = { parseArgs, openBuild, check, verdict };
