const path = require("path");
const { check } = require("../lib/cli");

module.exports = {
  needs: [],
  run({ test, pristine, sandbox, dist, coreOn, cssCoreNeeded }) {
    console.log("\napply");
    for (const fp of test.PATCHES) {
      if (pristine[fp.filename] === undefined) continue;
      const result = test.applyPatches(
        path.join(dist, fp.filename),
        fp.patches,
      );
      check(
        result.applied.length > 0,
        `${fp.filename}: applied ${result.applied.length} patch(es)`,
      );
      for (const description of result.applied)
        console.log(`          + ${description}`);
    }
    // The core stylesheet block, the way Apply Patches writes it. The bonus
    // settings are still at their defaults here, so only the core block lands.
    // A core block whose gate says this build already does without it is not
    // written at all (math-clip, where KaTeX declares the fix itself).
    const cssApplied = test.reconcileChatStyle(sandbox, coreOn);
    for (const key of test.CHAT_CSS_CORE) {
      check(
        cssApplied[key] === cssCoreNeeded(key),
        cssCoreNeeded(key)
          ? `${test.CHAT_STYLE_FILE}: applied "${key}"`
          : `${test.CHAT_STYLE_FILE}: "${key}" not written, since this build does without it`,
      );
    }
    // The core script block, the same patch's other half, appended to the
    // bundle the splices above landed in.
    const scriptApplied = test.reconcileChatScript(sandbox, true);
    for (const key of test.CHAT_SCRIPT_CORE) {
      check(
        scriptApplied[key],
        `${test.CHAT_SCRIPT_FILE}: applied "${key}" block`,
      );
    }
  },
};
