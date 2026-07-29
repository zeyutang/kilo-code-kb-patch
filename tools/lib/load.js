// Loads the compiled extension (out/extension.js) outside a VS Code host by
// redirecting its `require("vscode")` to the local shim. The harness deliberately
// exercises the extension's own exported functions rather than reimplementing
// them, so what the tests prove is what ships.
const path = require("path");
const Module = require("module");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SHIM = require.resolve("./vscode-shim.js");

let hooked = false;
function installResolverHook() {
  if (hooked) return;
  const original = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    if (request === "vscode") return SHIM;
    return original.call(this, request, ...rest);
  };
  hooked = true;
}

// Returns the extension's __test bundle. Throws a directive rather than a raw
// MODULE_NOT_FOUND when the TypeScript has not been compiled yet.
function loadExtension() {
  installResolverHook();
  const compiled = path.join(REPO_ROOT, "out", "extension.js");
  try {
    require.resolve(compiled);
  } catch {
    throw new Error(
      "out/extension.js not found. Run `npm run compile` before using the harness."
    );
  }
  const mod = require(compiled);
  if (!mod.__test) throw new Error("out/extension.js does not export __test.");
  return mod.__test;
}

module.exports = { loadExtension, shim: require(SHIM), REPO_ROOT };
