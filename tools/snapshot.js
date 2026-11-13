#!/usr/bin/env node
// Record everything the extension does to a Kilo build, as a log two builds of
// kb-patch can be compared by.
//
//   node tools/snapshot.js [--ext <path to kilocode.kilo-code-*>]
//   node tools/snapshot.js --vsix <path to a Kilo Code .vsix>
//
// verify asserts properties of each step (unique, complete, reversible). This
// records the steps themselves, so a change meant to leave behavior alone can
// be held to producing the same log: every file the extension writes (by
// digest), the derivation record, the appended blocks, the status rows, the
// bonus rows, the status page, and every notification with its buttons. It
// drives the extension the way the editor does, through activate(), the
// commands it registers and the settings listener, over two timelines: one
// with the reviewed entries as shipped, and one with the entries this build
// matches withheld, so that every edit is the one derived from its bytes.
//
// The run is sealed off from the real install. HOME and the extension roots
// point into a temp sandbox, since activation otherwise looks for Kilo Code
// under ~/.vscode/extensions, and the context carries no global storage, so
// the manifest bonus deletes no editor cache.
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { parseArgs } = require("./lib/cli");
const { loadExtension, shim, REPO_ROOT } = require("./lib/load");
const { resolveBundleSource, assertPristine } = require("./lib/bundle");
const { openVsix } = require("./lib/vsix");

const digest = (text) =>
  crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);

// Kilo's manifest as shipped, for the editor-title bonus. A vsix carries it
// untouched; an install may carry the rename, which is put back here.
function pristineManifest(source, test) {
  if (source.kind === "vsix") {
    const payload = openVsix(source.label).read("extension/package.json");
    if (!payload) throw new Error("the vsix carries no extension/package.json");
    return payload.toString("utf8");
  }
  const manifest = path.join(source.label, "package.json");
  return fs
    .readFileSync(manifest, "utf8")
    .replace(
      test.OPEN_IN_TAB_TITLE_RE,
      (_m, prefix) => `${prefix}${JSON.stringify(test.OPEN_IN_TAB_ORIGINAL)}`,
    );
}

// Every value each bonus setting takes in these timelines: off is the value
// Restore Originals writes, on is a value that asks for the bonus.
const BONUS_ON = {
  addAttachFileButton: true,
  renameOpenInTab: true,
  chatMathRendering: true,
  chatRawMarkdownButton: true,
  chatHistoryFontSizeEm: 1.4,
  chatHistoryFontFamily: "Charter, Georgia, serif",
  chatMathFontSizeEm: 1.5,
};

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log("usage: node tools/snapshot.js [--ext <path> | --vsix <path>]");
    return 0;
  }

  const test = loadExtension();
  const extension = require(path.join(REPO_ROOT, "out", "extension.js"));
  // A setting with no value here would sit out every timeline unnoticed.
  const unvalued = test.BONUS_SETTING_DEFAULTS.map(([key]) => key).filter(
    (key) => !(key in BONUS_ON),
  );
  if (unvalued.length > 0) {
    throw new Error(`BONUS_ON has no value for ${unvalued.join(", ")}`);
  }
  // Read before HOME is sealed, since with neither flag the newest install is
  // found under the real one. Reading is all that happens to it.
  const source = resolveBundleSource(test, args);
  assertPristine(source.bundles, test);
  const pristine = {
    ...source.bundles,
    "package.json": pristineManifest(source, test),
  };
  const version = source.version;

  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "kb-patch-snapshot-"));
  const home = path.join(sandbox, "home");
  fs.mkdirSync(home);
  process.env.HOME = home;
  if (os.homedir() !== home) throw new Error("could not seal HOME");

  const roots = path.join(sandbox, "extensions");
  const kilo = path.join(roots, `kilocode.kilo-code-${version}-darwin-arm64`);
  const dist = path.join(kilo, "dist");
  const files = Object.keys(pristine).sort();
  const layOut = () => {
    fs.mkdirSync(dist, { recursive: true });
    for (const name of files) {
      const target =
        name === "package.json" ? path.join(kilo, name) : path.join(dist, name);
      fs.writeFileSync(target, pristine[name], "utf8");
    }
  };
  const fileAt = (name) =>
    name === "package.json" ? path.join(kilo, name) : path.join(dist, name);

  const seal = (text) => String(text).split(sandbox).join("<sandbox>");
  const out = [];
  const say = (line) => {
    const sealed = seal(line);
    out.push(sealed);
    console.log(sealed);
  };

  // The editor, as far as the extension can see it.
  const commands = new Map();
  let listeners = [];
  let promptChoice;
  const events = [];
  const note = (line) => {
    events.push(line);
    say(`    ui ${line}`);
  };
  const reply =
    (kind) =>
    (message, ...items) => {
      note(`${kind} ${JSON.stringify(message)} ${JSON.stringify(items)}`);
      const asked = items.includes("Apply") ? promptChoice : undefined;
      if (asked !== undefined) note(`  -> ${asked}`);
      return Promise.resolve(asked);
    };
  shim.window.showInformationMessage = reply("info");
  shim.window.showWarningMessage = reply("warning");
  shim.window.showErrorMessage = reply("error");
  shim.window.createWebviewPanel = (viewType, title) => {
    note(`panel ${JSON.stringify(viewType)} ${JSON.stringify(title)}`);
    let html = "";
    return {
      webview: {
        get html() {
          return html;
        },
        set html(value) {
          html = value;
          note(`html ${digest(value)}`);
        },
      },
      viewColumn: 1,
      reveal: () => note("reveal"),
      dispose: () => {},
      onDidDispose: () => ({ dispose() {} }),
      onDidChangeViewState: () => ({ dispose() {} }),
    };
  };
  shim.commands.registerCommand = (id, handler) => {
    commands.set(id, handler);
    return { dispose() {} };
  };
  shim.commands.executeCommand = (id) => {
    note(`execute ${id}`);
    return Promise.resolve();
  };
  shim.workspace.onDidChangeConfiguration = (listener) => {
    listeners.push(listener);
    return { dispose() {} };
  };

  // Promise chains the extension starts and does not return (the launch
  // prompt, a restart offer) are let run until nothing new happens.
  const settle = async () => {
    let seen = -1;
    let still = 0;
    for (let turn = 0; turn < 500 && still < 5; turn++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      still = events.length === seen ? still + 1 : 0;
      seen = events.length;
    }
  };

  const blocksIn = (text) =>
    [...text.matchAll(/\/\* kilo-code-kb-patch:([a-z-]+):begin \*\//g)]
      .map((m) => m[1])
      .join(",");

  const state = () => {
    for (const name of files) {
      const target = fileAt(name);
      if (!fs.existsSync(target)) {
        say(`    file ${name} absent`);
        continue;
      }
      const text = fs.readFileSync(target, "utf8");
      const blocks = name.endsWith(".js") || name.endsWith(".css");
      say(
        `    file ${name} ${digest(text)} ${text.length}` +
          `${text === pristine[name] ? " pristine" : ""}` +
          `${blocks && blocksIn(text) ? ` blocks[${blocksIn(text)}]` : ""}`,
      );
    }
    const record = test.readDerivedRecordAt(dist);
    say(
      `    record [${record.map((p) => `${p.filename}:${p.feature}`).join(", ")}]` +
        ` ${digest(JSON.stringify(record))}`,
    );
    const status = test.computeStatus(dist);
    say(`    verdict ${status.verdict}`);
    for (const file of status.files) {
      say(
        `    status ${file.filename}${file.found ? "" : " (not found)"}: ` +
          file.features.map((f) => `${f.state} ${f.label}`).join(" | "),
      );
    }
    for (const bonus of test.computeBonusStatus(kilo)) {
      say(`    bonus ${bonus.state} (${bonus.needs}) ${bonus.label}`);
    }
  };

  const step = async (label, action) => {
    say(`  ${label}`);
    await action();
    await settle();
    state();
  };

  // A fresh extension host: what a restart or a reload gives the extension.
  const launch = (choice) => async () => {
    test.forgetSession();
    commands.clear();
    listeners = [];
    promptChoice = choice;
    extension.activate(context);
  };
  const run = (id) => async () => {
    const handler = commands.get(id);
    if (!handler) throw new Error(`${id} is not registered`);
    await handler();
  };
  const settings = (values) => async () => {
    shim.setConfig(values);
    for (const listener of listeners) {
      listener({
        affectsConfiguration: (section) => section === "kiloCodeKbPatch",
      });
    }
  };

  let context;
  const timeline = async () => {
    layOut();
    shim.setConfig({});
    const memory = new Map();
    context = {
      subscriptions: [],
      extension: { packageJSON: { version: "0.0.0-snapshot" } },
      extensionUri: { fsPath: path.join(roots, "zeyutang.kilo-code-kb-patch") },
      globalState: {
        get: (key, fallback) => (memory.has(key) ? memory.get(key) : fallback),
        update: (key, value) => {
          if (value === undefined) memory.delete(key);
          else memory.set(key, value);
          return Promise.resolve();
        },
      },
    };

    const defaults = Object.fromEntries(test.BONUS_SETTING_DEFAULTS);
    const allOn = { ...defaults, ...BONUS_ON };

    await step("first launch, Apply", launch("Apply"));
    await step("Show Status", run("kiloCodeKbPatch.status"));
    await step("Apply Patches again", run("kiloCodeKbPatch.apply"));
    await step("every bonus on", settings(allOn));
    await step("relaunch", launch("Apply"));
    for (const key of Object.keys(BONUS_ON)) {
      await step(`${key} off`, settings({ ...allOn, [key]: defaults[key] }));
      await step(`${key} back on`, settings(allOn));
    }
    await step("Kilo update, relaunch, Ignore", async () => {
      layOut();
      await launch("Ignore")();
    });
    await step("Apply Patches", run("kiloCodeKbPatch.apply"));
    await step("Restore Originals", run("kiloCodeKbPatch.restore"));
    await step("relaunch after Restore, Apply", launch("Apply"));
    await step("Restore Originals again", run("kiloCodeKbPatch.restore"));
  };

  try {
    say(`Kilo Code v${version}`);
    say(`exports ${Object.keys(extension).sort().join(",")}`);
    say(`__test ${Object.keys(test).sort().join(",")}`);

    say("\nreviewed (the entries as shipped)");
    await timeline();

    // Each variant this build matches, by any of its forms, is withheld, so
    // nothing shipped recognizes the build and every edit is derived.
    const matches = (content, v) =>
      content.includes(v.original) ||
      content.includes(v.patched) ||
      [v.previous ?? []].flat().some((p) => content.includes(p));
    const keptCore = test.PATCHES.map((fp) => fp.patches.slice());
    const keptBonus = test.DERIVABLE_BONUSES.map((k) =>
      test.BONUS_VARIANTS[k].slice(),
    );
    try {
      const withheld = [];
      for (const fp of test.PATCHES) {
        const content = pristine[fp.filename];
        if (content === undefined) continue;
        const left = fp.patches.filter((p) => !matches(content, p));
        withheld.push(`${fp.filename} ${fp.patches.length - left.length}`);
        fp.patches.splice(0, fp.patches.length, ...left);
      }
      for (const key of test.DERIVABLE_BONUSES) {
        const list = test.BONUS_VARIANTS[key];
        const content = pristine[test.BONUS_RULES[key].file];
        const left = list.filter((v) => !matches(content, v));
        withheld.push(`${key} ${list.length - left.length}`);
        list.splice(0, list.length, ...left);
      }
      say(`\nderived (withheld: ${withheld.join(", ")})`);
      await timeline();
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
    }
  } finally {
    shim.setConfig({});
    fs.rmSync(sandbox, { recursive: true, force: true });
  }

  console.log(`\nsnapshot ${digest(out.join("\n"))} over ${out.length} lines`);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(`snapshot: ${err.stack || err.message}`);
    process.exitCode = 2;
  },
);
