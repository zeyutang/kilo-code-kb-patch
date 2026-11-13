const fs = require("fs");
const path = require("path");
const { check } = require("../lib/cli");
const { shim } = require("../lib/load");

module.exports = {
  // What Restore has to take back is everything these sections leave in the
  // sandbox: the core edits, the bonus splices, and the stylesheet bonuses.
  needs: [
    "apply",
    "attach-button",
    "math-rendering",
    "raw-markdown",
    "chat-stylesheet",
  ],
  run({ test, pristine, sandbox, dist, coreOff }) {
    console.log("\nzero leakage (restore returns the file to pristine)");
    // Every bonus at its off value, which is what Restore Originals writes,
    // and every splice the extension lists reconciled to it.
    shim.setConfig(Object.fromEntries(test.BONUS_SETTING_DEFAULTS));
    for (const key of test.DERIVABLE_BONUSES) {
      test.reconcileDerivableBonus(sandbox, key);
    }
    test.reconcileChatStyle(sandbox, coreOff);
    test.reconcileChatScript(sandbox, false);
    for (const fp of test.PATCHES) {
      if (pristine[fp.filename] === undefined) continue;
      test.restorePatches(path.join(dist, fp.filename), fp.patches);
    }
    for (const [filename, original] of Object.entries(pristine)) {
      const restored = fs.readFileSync(path.join(dist, filename), "utf8");
      check(
        restored === original,
        `${filename}: byte-identical to pristine after restore`,
      );
    }
  },
};
