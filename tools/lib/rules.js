// The shape rules now ship inside the extension (src/rules.js, compiled to
// out/rules.js) because apply-time derivation needs them at runtime. This shim
// keeps the harness pointed at the compiled copy rather than a second one, so
// what retarget proposes and verify proves is the code that actually runs on a
// user's machine.
const path = require("path");

module.exports = require(
  path.resolve(__dirname, "..", "..", "out", "rules.js"),
);
