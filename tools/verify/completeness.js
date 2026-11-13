const { check } = require("../lib/cli");
const { RULES } = require("../lib/rules");
const { PROBES } = require("../lib/probes");

module.exports = {
  needs: ["apply"],
  run({ test, pristine, dist }) {
    console.log("\ncompleteness");
    const status = test.computeStatus(dist);
    check(
      status.verdict === "fully patched",
      `verdict is "fully patched"`,
      `got "${status.verdict}"`,
    );
    // A row may also read "unneeded", but only where the feature's gate says
    // this build does not have the Kilo behavior it fixes; a label maps back to
    // its key through the extension's own label table.
    const keyOf = (label) =>
      Object.entries(test.FEATURE_LABELS).find(([, l]) => l === label)?.[0];
    for (const file of status.files) {
      if (!file.found) continue;
      for (const feature of file.features) {
        if (feature.state === "unneeded") {
          const gate = test.FEATURE_GATES[keyOf(feature.label)];
          check(
            gate !== undefined && gate(pristine[file.filename]) === false,
            `${file.filename}: ${feature.label} (not needed on this build)`,
            "reads unneeded without a gate that says so",
          );
          continue;
        }
        check(
          feature.state === "patched",
          `${file.filename}: ${feature.label}`,
          `state "${feature.state}"`,
        );
      }
      // Every behavior the patch set declares must reach the status view, since
      // a feature that never renders is also absent from the verdict and would
      // read as "nothing wrong" while being unpatched. A bundle declares its
      // splices' features plus, for the one that takes it, the script block's.
      const declared = new Set(
        file.filename === test.CHAT_STYLE_FILE
          ? test.CHAT_CSS_CORE
          : [
              ...(
                test.PATCHES.find((f) => f.filename === file.filename)
                  ?.patches ?? []
              ).map((p) => p.feature),
              ...(file.filename === test.CHAT_SCRIPT_FILE
                ? test.CHAT_SCRIPT_CORE
                : []),
            ],
      );
      check(
        file.features.length === declared.size,
        `${file.filename}: all ${declared.size} declared feature(s) appear in the status view`,
        `got ${file.features.length} row(s) for ${declared.size} declared feature(s)`,
      );

      // The harness models the same behaviors as the extension; drift between
      // the two means a rule was added or renamed on only one side. A
      // stylesheet feature's counterpart is a probe rather than a shape rule.
      const ruled = new Set([
        ...RULES.filter((r) => r.file === file.filename).map((r) => r.key),
        ...PROBES.filter((p) => p.file === file.filename).map((p) => p.key),
      ]);
      const missing = [...declared].filter((k) => !ruled.has(k));
      check(
        missing.length === 0,
        `${file.filename}: every declared feature has a shape rule`,
        `no rule for: ${missing.join(", ")}`,
      );
    }

    // A file Kilo retired keeps its section and reports every behavior it used
    // to carry as "not needed", which the loop above cannot check because it
    // only walks the files a build ships. Dropping those rows would hide which
    // behaviors are inert here, and "missing" would read as a stale pattern.
    for (const file of status.files.filter((f) => !f.found)) {
      const declared = new Set(
        (
          test.PATCHES.find((f) => f.filename === file.filename)?.patches ?? []
        ).map((p) => p.feature),
      );
      const retired = test.RETIRED_FILES.has(file.filename);
      check(
        file.features.length === (retired ? declared.size : 0),
        retired
          ? `${file.filename}: not shipped here, and all ${declared.size} of its feature(s) still report`
          : `${file.filename}: absent and unaccounted for, so it reports no rows`,
        `got ${file.features.length} row(s)`,
      );
      check(
        file.features.every((ft) => ft.state === "unneeded"),
        `${file.filename}: every row reads "not needed on this Kilo Code build"`,
      );
    }
  },
};
