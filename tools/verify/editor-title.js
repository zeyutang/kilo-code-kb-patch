const fs = require("fs");
const path = require("path");
const { check } = require("../lib/cli");
const { shim } = require("../lib/load");

module.exports = {
  needs: [],
  run({ test, sandbox }) {
    console.log("\neditor-title rename (the one bonus in Kilo's manifest)");
    // The manifest is read from VS Code's scanner cache at window startup, so
    // the rewrite takes the cache with it, for every profile. The fake user
    // data folder is laid out the way the extension finds it: from its own
    // global storage path.
    {
      const kilo = path.join(sandbox, "kilo");
      const manifest = path.join(kilo, "package.json");
      const userData = path.join(sandbox, "userdata");
      const cacheDir = path.join(userData, "CachedProfilesData");
      const caches = ["__default__profile__", "p1"].map((profile) =>
        path.join(cacheDir, profile, "extensions.user.cache"),
      );
      const keep = path.join(cacheDir, "p1", "extensions.builtin.cache");
      const layOut = (title) => {
        fs.mkdirSync(kilo, { recursive: true });
        const commands = [{ command: "kilo-code.new.openInTab", title }];
        fs.writeFileSync(
          manifest,
          JSON.stringify({ contributes: { commands } }, null, 2),
        );
        for (const file of [...caches, keep]) {
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, "{}");
        }
      };
      const storageAt = (...rel) => ({
        globalStorageUri: {
          fsPath: path.join(userData, ...rel, "zeyutang.kilo-code-kb-patch"),
        },
      });
      const carries = (title) =>
        fs.readFileSync(manifest, "utf8").includes(JSON.stringify(title));
      const cachesGone = () => caches.every((f) => !fs.existsSync(f));
      const cachesStay = () => caches.every((f) => fs.existsSync(f));
      try {
        layOut(test.OPEN_IN_TAB_ORIGINAL);
        shim.setConfig({ renameOpenInTab: true });
        test.setExtensionContext(storageAt("User", "globalStorage"));
        check(
          test.reconcileOpenInTabTitle(kilo) === true &&
            carries(test.OPEN_IN_TAB_RENAMED),
          "the rename rewrites the manifest",
        );
        check(cachesGone(), "every profile's manifest cache goes with it");
        check(fs.existsSync(keep), "other cache files stay");
        check(
          test.reconcileOpenInTabTitle(kilo) === false,
          "rewriting again changes nothing, with the caches already gone",
        );

        layOut(test.OPEN_IN_TAB_ORIGINAL);
        test.setExtensionContext(
          storageAt("User", "profiles", "abc", "globalStorage"),
        );
        check(
          test.reconcileOpenInTabTitle(kilo) === true && cachesGone(),
          "a non-default profile's storage path finds the same caches",
        );

        layOut(test.OPEN_IN_TAB_ORIGINAL);
        test.setExtensionContext(storageAt("elsewhere"));
        check(
          test.reconcileOpenInTabTitle(kilo) === true && cachesStay(),
          "an unrecognized storage layout still rewrites, deleting nothing",
        );

        layOut(test.OPEN_IN_TAB_RENAMED);
        shim.setConfig({ renameOpenInTab: false });
        test.setExtensionContext(undefined);
        check(
          test.reconcileOpenInTabTitle(kilo) === true &&
            carries(test.OPEN_IN_TAB_ORIGINAL) &&
            cachesStay(),
          "turning it off restores Kilo's title; no context, no deletion",
        );
      } finally {
        test.setExtensionContext(undefined);
        shim.setConfig(Object.fromEntries(test.BONUS_SETTING_DEFAULTS));
      }
    }
  },
};
