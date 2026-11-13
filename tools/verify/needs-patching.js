// activate() asks "is any webview.js patch still waiting?" with a
// per-feature scan that stops at the variant which matches, rather than
// testing all of them, because each test scans a ~20 MB bundle and the
// array grows every retarget. That is only sound while at most one variant
// of a feature matches a build, so the two forms are compared here on every
// state an install passes through: pristine, fully patched, and each
// single-feature-missing state an upgrade lands in. A retarget that shipped
// a shadowing variant would part them here rather than in the field.

const { check } = require("../lib/cli");
const { replaceLiteral } = require("../lib/rules");

module.exports = {
  needs: [],
  run({ test, pristine }) {
    console.log("\nneeds-patching scan (short-circuit matches the flat scan)");
    {
      const webviewPatches = test.PATCHES.find(
        (group) => group.filename === "webview.js",
      ).patches;
      const flat = (content) =>
        webviewPatches.some(
          (p) =>
            !content.includes(p.patched) &&
            (content.includes(p.original) ||
              (p.previous && content.includes(p.previous))),
        );
      const pristineJs = pristine["webview.js"];
      let full = pristineJs;
      for (const p of webviewPatches) {
        if (full.includes(p.patched)) continue;
        if (full.includes(p.original))
          full = replaceLiteral(full, p.original, p.patched);
      }
      const states = [
        ["pristine", pristineJs],
        ["fully patched", full],
        ...webviewPatches
          .filter(
            (p) => full.includes(p.patched) && !pristineJs.includes(p.patched),
          )
          .map((p) => [
            `only ${p.feature} missing`,
            replaceLiteral(full, p.patched, p.original),
          ]),
      ];
      let parted = 0;
      for (const [name, content] of states) {
        if (flat(content) !== test.webviewNeedsPatching(content)) {
          parted++;
          console.log(`  (parted on ${name})`);
        }
      }
      check(
        parted === 0,
        "both scans agree on every reachable state",
        `${states.length} states`,
      );
      check(
        test.webviewNeedsPatching(pristineJs) === true &&
          test.webviewNeedsPatching(full) === false,
        "pristine needs patching, fully patched does not",
      );
    }
  },
};
