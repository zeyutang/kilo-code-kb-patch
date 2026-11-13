// The state a Kilo re-minify leaves the extension in: withhold exactly the
// variants this build matches, so nothing shipped recognizes it, and
// require the derivation layer to answer with the same bytes the reviewed
// release shipped. This is the claim that a pure re-minify needs no
// release, checked per build rather than argued.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { check } = require("../lib/cli");
const { RULES, replaceLiteral } = require("../lib/rules");

module.exports = {
  needs: [],
  run({ test, source, pristine, sandbox }) {
    console.log("\nderivation (the release that need not happen)");
    {
      const version = source.version;
      const box = path.join(sandbox, "derive");
      fs.mkdirSync(box, { recursive: true });
      for (const [name, body] of Object.entries(pristine)) {
        fs.writeFileSync(path.join(box, name), body);
      }

      // The same shape runPatch uses: plan every file, then write, so the
      // record in webview.js can cover kiloclaw.js too.
      const plan = (mode) => {
        const record = test.readDerivedRecordAt(box);
        return test.PATCHES.filter(
          (fp) => pristine[fp.filename] !== undefined,
        ).map((fp) => ({
          fp,
          fpath: path.join(box, fp.filename),
          withheld: fp.patches.filter(
            (p) => !pristine[fp.filename].includes(p.original),
          ),
          ...test.patchSetFor(
            fp.filename,
            path.join(box, fp.filename),
            version,
            fp.patches.filter(
              (p) => !pristine[fp.filename].includes(p.original),
            ),
            mode,
            record,
          ),
        }));
      };
      const write = (plans, mode) => {
        const next =
          mode === "apply"
            ? plans.flatMap((p) => [...p.remembered, ...p.derived])
            : [];
        const writer = (filename) =>
          filename === test.CHAT_SCRIPT_FILE
            ? (m) => test.withDerivedRecord(m, next)
            : undefined;
        return plans.map((p) =>
          mode === "apply"
            ? test.applyPatches(
                p.fpath,
                p.patches,
                p.derived.length > 0
                  ? test.derivedGuard(p.fp.filename, p.derived)
                  : undefined,
                writer(p.fp.filename),
              )
            : test.restorePatches(p.fpath, p.patches, writer(p.fp.filename)),
        );
      };

      const first = plan("apply");
      let derivedTotal = 0;
      for (const p of first) {
        derivedTotal += p.derived.length;
        const covering = p.fp.patches.filter((x) =>
          pristine[p.fp.filename].includes(x.original),
        );
        const byFeature = new Map(p.derived.map((d) => [d.feature, d]));
        for (const shipped of covering) {
          if (!test.DERIVABLE.includes(shipped.feature)) continue;
          const d = byFeature.get(shipped.feature);
          // A rule whose anchor was widened also reports the narrower
          // pre-widening form, and entries older than that widening ship the
          // narrow one: perm-keys on 7.4.17 through 7.4.20 is the live case.
          // Both describe the same edit, so accept either, which is the
          // fallback retarget's covered-check already applies. Comparing only
          // the wide form reports those builds as a difference that is not one.
          const legacy = RULES.find(
            (r) => r.key === shipped.feature && r.file === p.fp.filename,
          )?.derive(pristine[p.fp.filename])?.legacy;
          const same = (x) =>
            x !== undefined &&
            x.original === shipped.original &&
            x.patched === shipped.patched;
          check(
            d !== undefined && (same(d) || same(legacy)),
            `${p.fp.filename}: ${shipped.feature} derives the shipped bytes`,
            d === undefined ? "nothing derived" : "derived text differs",
          );
        }
      }
      const applied = write(first, "apply");
      check(derivedTotal > 0, `${derivedTotal} pattern(s) derived in total`);
      for (const [i, p] of first.entries()) {
        const covering = p.fp.patches.filter((x) =>
          pristine[p.fp.filename].includes(x.original),
        );
        check(
          applied[i].applied.length === covering.length,
          `${p.fp.filename}: derived apply lands ${covering.length} edit(s)`,
          `applied ${applied[i].applied.length}`,
        );
      }

      // The record has to be in the bundle, not anywhere this process holds.
      const onDisk = test.readDerivedRecordAt(box);
      check(
        onDisk.length === derivedTotal,
        `the bundle carries all ${derivedTotal} derived pattern(s)`,
        `found ${onDisk.length}`,
      );
      // One record in webview.js covers every file, which is only observable
      // on a build that ships a second one. Kilo dropped kiloclaw.js in 7.7.3,
      // so there the claim has nothing to demonstrate rather than being false.
      if (pristine["kiloclaw.js"] !== undefined) {
        check(
          onDisk.some((p) => p.filename === "kiloclaw.js"),
          "webview.js's record covers kiloclaw.js too",
        );
      }
      const rawJs = fs.readFileSync(path.join(box, "webview.js"), "utf8");
      // The record is base64 precisely so it does not reproduce the patched
      // text: a second literal copy would break both the guard's
      // "landed exactly once" check and the replace() Restore does.
      check(
        onDisk.every(
          (p) =>
            rawJs.split(p.patched).length ===
            (p.filename === "webview.js" ? 2 : 1),
        ),
        "the record reproduces no patched text verbatim",
      );

      for (const filename of Object.keys(pristine).filter((f) =>
        f.endsWith(".js"),
      )) {
        try {
          execFileSync(
            process.execPath,
            ["--check", path.join(box, filename)],
            { stdio: "pipe" },
          );
          check(true, `node --check ${filename} (derived)`);
        } catch (err) {
          check(
            false,
            `node --check ${filename} (derived)`,
            String(err.stderr || err.message).trim(),
          );
        }
      }

      const afterApply = Object.keys(pristine).map((n) =>
        fs.readFileSync(path.join(box, n), "utf8"),
      );
      write(plan("apply"), "apply");
      check(
        Object.keys(pristine).every(
          (n, i) =>
            fs.readFileSync(path.join(box, n), "utf8") === afterApply[i],
        ),
        "re-applying a derived patch set changes nothing",
      );

      // Restore reads the record out of the bundle, which is the whole point
      // of putting it there: nothing this process remembers is involved.
      write(plan("restore"), "restore");
      for (const [name, body] of Object.entries(pristine)) {
        if (!name.endsWith(".js")) continue;
        check(
          fs.readFileSync(path.join(box, name), "utf8") === body,
          `${name}: pristine again after restoring a derived patch set`,
        );
      }
      check(
        test.readDerivedRecordAt(box).length === 0,
        "restore takes the record away with the edits",
      );

      // What a launch sees in the two states derivation creates.
      const live = test.PATCHES.find((g) => g.filename === "webview.js");
      const kept = live.patches.slice();
      const withheldJs = kept.filter(
        (p) => !pristine["webview.js"].includes(p.original),
      );
      try {
        live.patches.splice(0, live.patches.length, ...withheldJs);
        const fresh = test.deriveFor(
          "webview.js",
          pristine["webview.js"],
          version,
          withheldJs,
        );
        let derivedJs = pristine["webview.js"];
        for (const d of fresh)
          derivedJs = replaceLiteral(derivedJs, d.original, d.patched);
        derivedJs = test.withDerivedRecord(derivedJs, fresh);

        check(
          test.webviewNeedsPatching(pristine["webview.js"]) === true,
          "an unrecognized build reports that it needs patching",
        );
        const started = process.hrtime.bigint();
        const settled = test.webviewNeedsPatching(
          derivedJs,
          test
            .recordedFor(
              test.readDerivedRecord(derivedJs),
              "webview.js",
              derivedJs,
            )
            .map((p) => ({
              feature: p.feature,
              original: p.original,
              patched: p.patched,
              description: p.description,
            })),
        );
        const launchMs = Number(process.hrtime.bigint() - started) / 1e6;
        check(
          settled === false,
          "a derivation-patched build reports nothing left to do",
        );
        check(
          launchMs < 200,
          `that reading costs ${launchMs.toFixed(0)} ms, not a full-array scan`,
        );
      } finally {
        live.patches.splice(0, live.patches.length, ...kept);
      }
    }
  },
};
