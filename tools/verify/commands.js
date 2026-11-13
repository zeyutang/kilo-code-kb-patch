// The commands themselves, in the order they really take, against a copy laid
// out like an install. The sections before this exercise the pieces. These are
// the three entry points a user has (a launch, Apply Patches, Restore
// Originals), which is where the pieces are put in an order, and an order is
// what two shipped defects turned on.
//
// Restore Originals wrote reverted derivations back into the bundle,
// because it restores the core files before it turns the bonuses off, and
// the harness restored the other way round.
//
// And a kb-patch build installed over the same version never ran its
// launch check, because the fingerprint that lets a launch skip it knew
// kb-patch by its version alone. The buttons that build could newly write
// stayed unwritten, Apply Patches did not write them either (it left the
// bonuses to a launch), and Show Status asked for a restart that changed
// nothing. Nothing here could see that, since nothing here took a launch.

const fs = require("fs");
const path = require("path");
const { check } = require("../lib/cli");
const { shim } = require("../lib/load");
const { countOccurrences } = require("../lib/bundle");

module.exports = {
  needs: [],
  async run({ test, source, pristine, sandbox, pristineJs }) {
    console.log("\ncommands in their own order (launch, Apply, Restore)");
    {
      const version = source.version;
      const root = path.join(sandbox, "commands");
      const box = path.join(root, `kilocode.kilo-code-${version}-harness`);
      const boxDist = path.join(box, "dist");
      const layOut = () => {
        fs.mkdirSync(boxDist, { recursive: true });
        for (const [name, body] of Object.entries(pristine)) {
          fs.writeFileSync(path.join(boxDist, name), body);
        }
      };
      // Two builds of kb-patch at one version: the same files, rebuilt.
      const build = (name, body) => {
        const dir = path.join(root, name);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "extension.js"), body);
        fs.writeFileSync(path.join(dir, "rules.js"), "// rules\n");
        return dir;
      };
      const buildA = build("build-a", "// the build that recorded it\n");
      const buildB = build("build-b", "// the same version, built again\n");

      const memory = new Map();
      test.setExtensionContext({
        extension: { packageJSON: { version: "0.0.0" } },
        extensionUri: { fsPath: path.join(root, "kb", "x") },
        globalState: {
          get: (k, d) => (memory.has(k) ? memory.get(k) : d),
          update: (k, v) => {
            if (v === undefined) memory.delete(k);
            else memory.set(k, v);
            return Promise.resolve();
          },
        },
      });
      const defaults = Object.fromEntries(test.BONUS_SETTING_DEFAULTS);
      const bonusesOn = {
        ...defaults,
        addAttachFileButton: true,
        chatMathRendering: true,
        chatRawMarkdownButton: true,
      };
      // The bundle splices as the extension lists them, each with its rule
      // key and the text only its edit puts in the bundle, and with what the
      // extension does not say of a splice: the name a reconcile pass reports
      // it under and the words its status row carries.
      const NAMED = {
        "attach-button": { name: "attach", row: "Prompt toolbar" },
        "math-rendering": { name: "math", row: "math" },
        "raw-markdown": { name: "rawMarkdown", row: "markdown source" },
      };
      const SPLICES = test.DERIVABLE_BONUSES.map((key) => ({
        key,
        ...NAMED[key],
        marker: test.DERIVED_BONUS_MARKERS[key],
      }));
      check(
        SPLICES.every((s) => s.name !== undefined),
        "the harness names every splice the extension lists",
        SPLICES.filter((s) => s.name === undefined)
          .map((s) => s.key)
          .join(", "),
      );
      const jsNow = () =>
        fs.readFileSync(path.join(boxDist, test.CHAT_SCRIPT_FILE), "utf8");
      const rows = () => {
        const all = test.computeBonusStatus(box);
        return Object.fromEntries(
          SPLICES.map((s) => [
            s.name,
            all.find((b) => b.label.includes(s.row))?.state,
          ]),
        );
      };
      const describe = () => JSON.stringify(rows());
      const onDisk = (s) => countOccurrences(jsNow(), s.marker);
      const restart = () => test.forgetSession();

      const keptCore = test.PATCHES.map((fp) => fp.patches.slice());
      const keptBonus = test.DERIVABLE_BONUSES.map((k) =>
        test.BONUS_VARIANTS[k].slice(),
      );
      try {
        // What this build can carry at all, by a reviewed entry or by its own
        // bytes. Every supported build carries all three, and the checks below
        // still ask, so a build that lost one reads "unavailable" here instead
        // of failing for a reason that has nothing to do with the commands.
        const wanted = SPLICES.filter(
          (s) =>
            test.shippedBonusVariant(pristineJs, s.key) !== undefined ||
            test.deriveBonus(s.key, pristineJs) !== undefined,
        );
        const rowsAre = (state, among = SPLICES) => {
          const now = rows();
          return among.every(
            (s) => now[s.name] === (wanted.includes(s) ? state : "unavailable"),
          );
        };
        const written = (among = SPLICES) =>
          among.every((s) => onDisk(s) === (wanted.includes(s) ? 1 : 0));

        layOut();
        shim.setConfig(bonusesOn);
        restart();
        check(
          rowsAre("unapplied"),
          'before anything runs, each bonus asked for reads "unapplied"',
          describe(),
        );
        const first = test.startupPass(box, buildA);
        check(
          first.settled === false && first.needsPatching === true,
          "a first launch runs the full check and finds work for Apply",
        );
        check(
          written() &&
            SPLICES.every((s) => first.bonuses[s.name] === wanted.includes(s)),
          "having written every bonus the settings ask for",
          describe(),
        );
        check(
          test.isSettled(box, buildA) === false,
          "and it records nothing while Apply still has work",
        );
        await test.patchInstall(box, "apply", first.bonuses);
        check(
          test.computeStatus(boxDist).verdict === "fully patched",
          "Apply Patches leaves the install fully patched",
          `got "${test.computeStatus(boxDist).verdict}"`,
        );
        check(
          rowsAre("pending"),
          "the bonuses read pending, written by the session on screen",
          describe(),
        );
        restart();
        check(rowsAre("on"), "and on once the host has restarted", describe());
        check(
          test.startupPass(box).settled === true,
          "the next launch finds the install settled and runs nothing",
        );

        // The state the reported case starts from: the settings ask for the two
        // buttons, the bundle does not carry them, and the install is recorded
        // as settled. A kb-patch that could not yet write them on this Kilo
        // build leaves exactly that behind.
        const buttons = SPLICES.filter(
          (s) => s.name !== "math" && wanted.includes(s),
        );
        const leaveUnwritten = (ownDir) => {
          shim.setConfig({
            ...bonusesOn,
            addAttachFileButton: false,
            chatRawMarkdownButton: false,
          });
          test.reconcileBonuses(box);
          shim.setConfig(bonusesOn);
          restart();
          test.markSettled(box, ownDir);
        };
        if (buttons.length === 0) {
          console.log("  n/a   this build carries neither button");
        } else {
          leaveUnwritten(buildA);
          check(
            buttons.every((s) => onDisk(s) === 0) &&
              test.startupPass(box, buildA).settled === true,
            "buttons unwritten and the install recorded as settled: that build's launches skip the check",
          );
          check(
            rowsAre("unapplied", buttons) && rows().math === "on",
            'Show Status reads the buttons "unapplied", not as waiting for a restart',
            describe(),
          );
          const rebuilt = test.startupPass(box, buildB);
          check(
            rebuilt.settled === false &&
              buttons.every((s) => rebuilt.bonuses[s.name]) &&
              written(),
            "a rebuilt kb-patch at the same version runs the check and writes them",
            JSON.stringify(rebuilt),
          );
          check(
            rowsAre("pending", buttons),
            "they read pending until the restart its notification offers",
            describe(),
          );
          restart();
          check(
            test.startupPass(box, buildB).settled === true && rowsAre("on"),
            "after which its launches are settled and every row reads on",
            describe(),
          );

          // The other way out, for a launch that did skip the check.
          leaveUnwritten(undefined);
          check(
            test.startupPass(box).settled === true &&
              buttons.every((s) => onDisk(s) === 0),
            "on a launch that skipped the check the buttons are still unwritten",
          );
          await test.patchInstall(box, "apply");
          check(
            written(),
            "Apply Patches writes every bonus the settings ask for",
            describe(),
          );
          restart();
          check(
            rowsAre("on") && test.isSettled(box),
            "so what it records as settled has them written",
            describe(),
          );

          // A pass that could not write. Read-only stands in for whatever
          // stopped the write, which root would not be stopped by.
          if (typeof process.getuid === "function" && process.getuid() === 0) {
            console.log("  n/a   running as root, where no write fails");
          } else {
            leaveUnwritten(undefined);
            const target = path.join(boxDist, test.CHAT_SCRIPT_FILE);
            fs.chmodSync(target, 0o444);
            try {
              test.reconcileBonuses(box);
              test.markSettled(box);
            } finally {
              fs.chmodSync(target, 0o644);
            }
            check(
              buttons.every((s) => onDisk(s) === 0) &&
                test.isSettled(box) === false,
              "a pass that could not write is not recorded, and the earlier record goes with it",
            );
            restart();
            const retry = test.startupPass(box);
            check(
              retry.settled === false && written(),
              "so the next launch tries again, and writes",
              JSON.stringify(retry),
            );
            restart();
          }
        }

        // Restore Originals where nothing reviewed answered: the core edits and
        // every bonus derived, all of them named only by the record. The core
        // files are reversed first (taking the record block with them) and
        // each bonus reconciler is then handed the record as it stood before.
        // Until the reconcilers kept only entries whose edit is still on disk,
        // the math one wrote the reverted core entries back into the restored
        // bundle.
        for (const fp of test.PATCHES) {
          const body = pristine[fp.filename];
          if (body === undefined) continue;
          const keep = fp.patches.filter((p) => !body.includes(p.original));
          fp.patches.splice(0, fp.patches.length, ...keep);
        }
        for (const k of test.DERIVABLE_BONUSES) {
          const list = test.BONUS_VARIANTS[k];
          const keep = list.filter((v) => !pristineJs.includes(v.original));
          list.splice(0, list.length, ...keep);
        }
        layOut();
        memory.clear();
        shim.setConfig(bonusesOn);
        restart();
        const derivedLaunch = test.startupPass(box);
        await test.patchInstall(box, "apply", derivedLaunch.bonuses);
        const record = test.readDerivedRecordAt(boxDist);
        const recorded = record
          .filter((p) => test.DERIVABLE_BONUSES.includes(p.feature))
          .map((p) => p.feature);
        check(
          record.some((p) => test.DERIVABLE.includes(p.feature)) &&
            recorded.length > 0,
          `with every reviewed entry withheld, the record names core and bonus derivations (${recorded.join(", ")})`,
        );
        check(
          test.computeStatus(boxDist).verdict === "fully patched",
          "and the install reads fully patched by derivation alone",
          `got "${test.computeStatus(boxDist).verdict}"`,
        );
        await test.patchInstall(box, "restore");
        for (const [name, body] of Object.entries(pristine)) {
          check(
            fs.readFileSync(path.join(boxDist, name), "utf8") === body,
            `${name}: pristine after Restore Originals`,
          );
        }
        check(
          test.readDerivedRecordAt(boxDist).length === 0,
          "no record of reverted edits is written back",
        );
        const settings = shim.workspace.getConfiguration();
        check(
          test.BONUS_SETTING_DEFAULTS.every(
            ([key, off]) => settings.get(key, off) === off,
          ),
          "every bonus setting is back at its off value",
        );
        check(
          test.isSettled(box) === false,
          "and the install is no longer recorded as settled",
        );
      } finally {
        test.PATCHES.forEach((fp, i) =>
          fp.patches.splice(0, fp.patches.length, ...keptCore[i]),
        );
        test.DERIVABLE_BONUSES.forEach((k, i) =>
          test.BONUS_VARIANTS[k].splice(
            0,
            test.BONUS_VARIANTS[k].length,
            ...keptBonus[i],
          ),
        );
        shim.setConfig(defaults);
        test.setExtensionContext(undefined);
        restart();
      }
    }
  },
};
