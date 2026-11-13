// A gate and its shape rule are two readings of the same fact, that a
// build has the Kilo behavior a feature fixes, so the two must agree: a
// gate that opens where the rule finds no site would report "missing"
// for a build that needs a retarget, and a gate that closes where the
// rule derives would hide a site that is there to patch.

const { check } = require("../lib/cli");
const { RULES } = require("../lib/rules");

module.exports = {
  needs: [],
  run({ test, pristine, pristineCss }) {
    console.log(
      "\ngates (features that fix a behavior this build may not have)",
    );
    for (const [key, gate] of Object.entries(test.FEATURE_GATES)) {
      // A core stylesheet block has no shape rule, and its counterpart is the
      // block itself: the gate has to close exactly where the extension
      // declines to write it, or the row would read "not needed" beside a
      // block it still writes, or "missing" on a build that carries the fix.
      if (test.CHAT_CSS_CORE.includes(key)) {
        if (pristineCss === undefined) continue;
        const wanted = gate(pristineCss);
        const writes = test.chatCssBlock(key, pristineCss) !== "";
        check(
          wanted === writes,
          `${key}: the gate (${wanted ? "wanted" : "not needed"}) agrees with the block (${
            writes ? "written" : "not written"
          })`,
        );
        continue;
      }
      const rule = RULES.find((r) => r.key === key);
      if (
        !check(rule !== undefined, `${key}: the gated feature has a shape rule`)
      )
        continue;
      const content = pristine[rule.file];
      if (content === undefined) continue;
      const wanted = gate(content);
      const derives = rule.derive(content).original !== undefined;
      check(
        wanted === derives,
        `${key}: the gate (${wanted ? "wanted" : "not needed"}) agrees with the rule (${
          derives ? "derives" : "no site"
        })`,
      );
    }
  },
};
