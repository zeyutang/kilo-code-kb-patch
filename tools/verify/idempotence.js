const path = require("path");
const { check } = require("../lib/cli");

module.exports = {
  needs: ["apply"],
  run({ test, pristine, sandbox, dist, coreOn }) {
    console.log("\nidempotence");
    for (const fp of test.PATCHES) {
      if (pristine[fp.filename] === undefined) continue;
      const again = test.applyPatches(path.join(dist, fp.filename), fp.patches);
      check(again.noChanges, `${fp.filename}: re-apply is a no-op`);
    }
    const cssAgain = test.reconcileChatStyle(sandbox, coreOn);
    check(
      test.CHAT_CSS_CORE.every((key) => !cssAgain[key]),
      `${test.CHAT_STYLE_FILE}: re-apply is a no-op`,
    );
    const scriptAgain = test.reconcileChatScript(sandbox, true);
    check(
      test.CHAT_SCRIPT_CORE.every((key) => !scriptAgain[key]),
      `${test.CHAT_SCRIPT_FILE}: re-apply of the block is a no-op`,
    );
  },
};
