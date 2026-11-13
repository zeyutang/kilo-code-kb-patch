const fs = require("fs");
const path = require("path");
const { check } = require("../lib/cli");
const { shim } = require("../lib/load");
const { patchedFilenames } = require("../lib/bundle");

module.exports = {
  needs: [],
  run({ test, sandbox }) {
    console.log("\nsettled fingerprint (what invalidates the launch shortcut)");
    {
      const memory = new Map();
      const ctx = (kbVersion) => ({
        extension: { packageJSON: { version: kbVersion } },
        extensionUri: { fsPath: path.join(sandbox, "kb", "x") },
        globalState: {
          get: (k, d) => (memory.has(k) ? memory.get(k) : d),
          update: (k, v) => {
            if (v === undefined) memory.delete(k);
            else memory.set(k, v);
            return Promise.resolve();
          },
        },
      });
      // A directory laid out like an install, so stat() has something to read
      // and moving a file cannot touch the real one.
      const fake = path.join(sandbox, "settled");
      fs.mkdirSync(path.join(fake, "dist"), { recursive: true });
      for (const name of patchedFilenames(test)) {
        fs.writeFileSync(path.join(fake, "dist", name), `// ${name}\n`);
      }
      test.setExtensionContext(ctx("1.0.0"));
      shim.setConfig(Object.fromEntries(test.BONUS_SETTING_DEFAULTS));
      try {
        test.markSettled(fake);
        check(
          test.isSettled(fake) === true,
          "a recorded install reads settled",
        );

        shim.setConfig({
          ...Object.fromEntries(test.BONUS_SETTING_DEFAULTS),
          chatMathRendering: true,
        });
        check(
          test.isSettled(fake) === false,
          "a bonus setting change invalidates it",
        );
        shim.setConfig(Object.fromEntries(test.BONUS_SETTING_DEFAULTS));
        check(
          test.isSettled(fake) === true,
          "putting the setting back restores it",
        );

        test.setExtensionContext(ctx("1.0.1"));
        check(
          test.isSettled(fake) === false,
          "a kb-patch version change invalidates it",
        );
        test.setExtensionContext(ctx("1.0.0"));

        const target = path.join(fake, "dist", "webview.js");
        const before = fs.statSync(target);
        fs.appendFileSync(target, "// touched\n");
        check(
          test.isSettled(fake) === false,
          "a changed bundle invalidates it (a Kilo update)",
        );
        // Rewriting the same bytes does not bring the record back, because
        // mtimeMs carries sub-millisecond precision that utimes cannot
        // reproduce. That is the safe direction: the shortcut is given up and
        // the full check runs, rather than a changed install reading settled.
        fs.writeFileSync(target, "// webview.js\n");
        fs.utimesSync(target, before.atime, before.mtime);
        check(
          test.isSettled(fake) === false,
          "rewriting a bundle keeps it invalid, even byte-for-byte",
        );
        test.markSettled(fake);
        check(
          test.isSettled(fake) === true,
          "recording again after the write restores it",
        );

        // kb-patch is known by the files that hold its code, not by its
        // version alone: a build installed over the same version, which is how
        // a release is tested before its version is bumped, changes what the
        // reconcilers would write and leaves the version as it was.
        const own = path.join(sandbox, "own-build");
        fs.mkdirSync(own, { recursive: true });
        fs.writeFileSync(path.join(own, "extension.js"), "// extension\n");
        fs.writeFileSync(path.join(own, "rules.js"), "// rules\n");
        test.markSettled(fake, own);
        check(
          test.isSettled(fake, own) === true,
          "an install reads settled under the build that recorded it",
        );
        fs.writeFileSync(path.join(own, "extension.js"), "// built again\n");
        check(
          test.isSettled(fake, own) === false,
          "a rebuilt kb-patch at the same version invalidates it",
        );
        test.markSettled(fake, own);
        fs.writeFileSync(path.join(own, "rules.js"), "// rules, built again\n");
        check(
          test.isSettled(fake, own) === false,
          "and so does a rebuild of its rules alone",
        );
        fs.rmSync(path.join(own, "rules.js"));
        test.markSettled(fake, own);
        check(
          test.isSettled(fake, own) === false,
          "a build whose own files cannot be read is never recorded as settled",
        );
        check(
          test.ownBuildIdentity() !== undefined &&
            test.installFingerprint(fake).includes(test.ownBuildIdentity()),
          "the running build's own files are part of the fingerprint",
        );
        test.markSettled(fake);

        test.clearSettled();
        check(
          test.isSettled(fake) === false,
          "clearSettled invalidates it (what Restore does)",
        );

        // A file Kilo retired is accounted for by its absence, so the
        // shortcut survives on a build that does not ship it. Recorded and
        // re-read here rather than reasoned about, because getting this wrong
        // silently costs every launch on every such install the full check.
        const retired = path.join(fake, "dist", "kiloclaw.js");
        fs.rmSync(retired);
        test.markSettled(fake);
        check(
          test.isSettled(fake) === true,
          "an install without a retired file still settles",
        );
        fs.writeFileSync(retired, "// kiloclaw.js\n");
        check(
          test.isSettled(fake) === false,
          "that file coming back invalidates it",
        );
        fs.rmSync(retired);

        // Any other missing file is a state we make no claim about.
        fs.rmSync(path.join(fake, "dist", "webview.js"));
        test.clearSettled();
        test.markSettled(fake);
        check(
          test.isSettled(fake) === false,
          "an install missing a file we expect is never recorded as settled",
        );
      } finally {
        test.setExtensionContext(undefined);
        shim.setConfig(Object.fromEntries(test.BONUS_SETTING_DEFAULTS));
      }
    }
  },
};
