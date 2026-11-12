#!/usr/bin/env node
// Bundle src/ into the two files the extension host and the harness load.
//
//   node tools/build.js [--watch]
//
// out/extension.js is everything under src/ but the shape rules, and
// out/rules.js is src/rules/. They stay two files, as they were when tsc
// emitted them, so that src/ can be divided without the runtime noticing: the
// harness loads out/rules.js beside the extension and has to share the
// extension's instance of the engine (its prefilter switch is module state),
// the launch fingerprint names this build by those two files, and verify's
// bare-replace tripwire reads them.
//
// esbuild strips types without reading them, so type checking is tsc's: `npm
// run compile` runs it before this, and --watch runs it alongside.
//
// Under src/, Node's modules and vscode are imported as `import fs =
// require("fs")` rather than `import * as fs from "fs"`. esbuild compiles a
// namespace import of an external module into a copy of the module's
// properties, made again in every module that imports it, and with fs and path
// imported a dozen times each that cost more at activation than the bundle
// saved. The `require` form is the module itself.
const { spawn } = require("child_process");
const path = require("path");
const esbuild = require("esbuild");

const ROOT = path.resolve(__dirname, "..");
const RULES_DIR = path.join(ROOT, "src", "rules");

// Every import of the rules, from anywhere under src/, becomes a require of
// the bundle beside out/extension.js, rather than a second copy inside it. An
// import of one of the rules' own files is refused, since it would bundle that
// file, and with it a second engine, into out/extension.js.
const rulesBeside = {
  name: "rules-beside",
  setup(build) {
    build.onResolve({ filter: /rules/ }, (args) => {
      const target = path.resolve(args.resolveDir, args.path);
      if (target === RULES_DIR || target === path.join(RULES_DIR, "index")) {
        return { path: "./rules.js", external: true };
      }
      if (target.startsWith(RULES_DIR + path.sep)) {
        return {
          errors: [
            {
              text: `import the rules through src/rules, not ${args.path}, so the extension and the harness share one engine`,
            },
          ],
        };
      }
      return undefined;
    });
  },
};

const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "es2021",
  sourcemap: true,
  logLevel: "warning",
};

const BUILDS = [
  {
    ...common,
    entryPoints: [path.join(RULES_DIR, "index.js")],
    outfile: path.join(ROOT, "out", "rules.js"),
  },
  {
    ...common,
    entryPoints: [path.join(ROOT, "src", "extension.ts")],
    outfile: path.join(ROOT, "out", "extension.js"),
    external: ["vscode"],
    plugins: [rulesBeside],
  },
];

async function main() {
  if (!process.argv.includes("--watch")) {
    await Promise.all(BUILDS.map((options) => esbuild.build(options)));
    return;
  }
  for (const options of BUILDS) {
    await (await esbuild.context(options)).watch();
  }
  const checker = spawn(
    process.execPath,
    [
      require.resolve("typescript/bin/tsc"),
      "-p",
      ROOT,
      "--watch",
      "--preserveWatchOutput",
    ],
    { stdio: "inherit" },
  );
  // The type checker goes when the watch does, however the watch is ended.
  const stop = () => {
    checker.kill();
    process.exit();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.on("exit", () => checker.kill());
}

// Run as a script; required, it only hands out the plugin and the options.
if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}

module.exports = { rulesBeside, BUILDS };
