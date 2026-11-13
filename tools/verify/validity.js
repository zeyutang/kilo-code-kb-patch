const path = require("path");
const { execFileSync } = require("child_process");
const { check } = require("../lib/cli");

module.exports = {
  // The bundles parsed are the patched ones, carrying the splices those
  // bonus sections leave switched on.
  needs: ["apply", "attach-button", "math-rendering", "raw-markdown"],
  run({ pristine, dist }) {
    console.log("\nvalidity (fully patched bundles still parse)");
    for (const filename of Object.keys(pristine).filter((f) =>
      f.endsWith(".js"),
    )) {
      const target = path.join(dist, filename);
      try {
        execFileSync(process.execPath, ["--check", target], { stdio: "pipe" });
        check(true, `node --check ${filename}`);
      } catch (err) {
        check(
          false,
          `node --check ${filename}`,
          String(err.stderr || err.message).trim(),
        );
      }
    }
  },
};
