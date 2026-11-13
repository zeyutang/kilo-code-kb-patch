const { check } = require("../lib/cli");
const { countOccurrences } = require("../lib/bundle");

module.exports = {
  needs: [],
  run({ test, pristine }) {
    console.log("uniqueness (originals present in this build)");
    for (const fp of test.PATCHES) {
      const content = pristine[fp.filename];
      if (content === undefined) continue;
      for (const p of fp.patches) {
        const hits = countOccurrences(content, p.original);
        // Most entries target other releases and are legitimately absent here;
        // only a pattern that this build actually matches must be unique.
        if (hits === 0) continue;
        check(
          hits === 1,
          `${fp.filename}: unique original for "${p.description}"`,
          `occurs ${hits}x`,
        );
      }
    }
  },
};
