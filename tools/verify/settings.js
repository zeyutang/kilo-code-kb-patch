// The settings are declared twice, once in package.json for the editor
// and once in the extension's table, which holds each one's off value (the
// value an unset setting reads as, and the one Restore Originals writes
// back) and a number's bounds (what the stylesheet is clamped to). Nothing
// at run time compares the two, so they are compared here.

const fs = require("fs");
const path = require("path");
const { check } = require("../lib/cli");
const { REPO_ROOT } = require("../lib/load");

module.exports = {
  needs: [],
  run({ test }) {
    console.log("\nsettings (the table agrees with package.json)");
    {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"),
      );
      const schema = manifest.contributes.configuration.properties;
      const section = "kiloCodeKbPatch.";
      const declared = Object.keys(schema)
        .filter((key) => key.startsWith(section))
        .map((key) => key.slice(section.length));
      const table = Object.keys(test.SETTINGS);
      check(
        JSON.stringify([...declared].sort()) ===
          JSON.stringify([...table].sort()),
        "the table has an entry for every contributed setting, and no other",
        `package.json ${declared.join(", ")}; table ${table.join(", ")}`,
      );
      for (const key of table) {
        const entry = test.SETTINGS[key];
        const property = schema[section + key] ?? {};
        check(
          property.default === entry.off,
          `${key}: its off value is the schema default`,
          `table ${JSON.stringify(entry.off)}, package.json ${JSON.stringify(property.default)}`,
        );
        if (entry.min !== undefined || entry.max !== undefined) {
          check(
            property.minimum === entry.min && property.maximum === entry.max,
            `${key}: its bounds are the schema's`,
            `table ${entry.min}..${entry.max}, package.json ${property.minimum}..${property.maximum}`,
          );
        }
      }
    }
  },
};
