// A core patch's `previous` holds the text an older kb-patch wrote at the
// same site, so upgrading migrates the install in place (previous→patched)
// and Restore Originals still reaches pristine (previous→original).
// Simulate such an install for every entry whose site exists in this
// build: rewrite that one site to the older form, then prove apply
// converges on exactly a fresh result and restore on pristine bytes.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { check } = require("../lib/cli");
const { countOccurrences } = require("../lib/bundle");
const { replaceLiteral } = require("../lib/rules");

module.exports = {
  needs: [],
  run({ test, pristine }) {
    const upgrades = [];
    for (const fp of test.PATCHES) {
      const clean = pristine[fp.filename];
      if (clean === undefined) continue;
      for (const p of fp.patches) {
        if (p.previous && countOccurrences(clean, p.original) === 1) {
          upgrades.push([fp, p]);
        }
      }
    }
    if (upgrades.length > 0) {
      console.log("\ncore upgrade (older patched form already installed)");
      const migrate = fs.mkdtempSync(
        path.join(os.tmpdir(), "kb-patch-core-migrate-"),
      );
      try {
        for (const [fp, p] of upgrades) {
          const clean = pristine[fp.filename];
          const target = path.join(migrate, fp.filename);

          fs.writeFileSync(target, clean, "utf8");
          test.applyPatches(target, fp.patches);
          const fresh = fs.readFileSync(target, "utf8");

          const older = replaceLiteral(clean, p.original, p.previous);
          fs.writeFileSync(target, older, "utf8");
          const result = test.applyPatches(target, fp.patches);
          check(
            result.applied.includes(`${p.description} (upgraded)`),
            `${fp.filename}: older "${p.feature}" form is upgraded in place`,
          );
          check(
            fs.readFileSync(target, "utf8") === fresh,
            `${fp.filename}: upgraded "${p.feature}" equals a fresh apply`,
          );

          fs.writeFileSync(target, older, "utf8");
          test.restorePatches(target, fp.patches);
          check(
            fs.readFileSync(target, "utf8") === clean,
            `${fp.filename}: older "${p.feature}" form restores to pristine`,
          );
        }
      } finally {
        fs.rmSync(migrate, { recursive: true, force: true });
      }
    }
  },
};
