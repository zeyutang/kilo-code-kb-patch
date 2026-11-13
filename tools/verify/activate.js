// What a launch wires up, taken through activate() itself: the commands
// package.json contributes, the settings listener, and the question whether to
// apply. The commands section calls what activate calls, in the same order;
// this one goes through activate and the handlers it registers, against a copy
// of the build laid out where activation looks for Kilo Code.
//
// Activation looks in the folder kb-patch is installed in and then in each
// editor's default folder under the home directory, which would reach the real
// install, so HOME points into the sandbox while this section runs.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { check } = require("../lib/cli");
const { shim, REPO_ROOT } = require("../lib/load");
const { countOccurrences } = require("../lib/bundle");

module.exports = {
  needs: [],
  async run({ test, source, pristine, sandbox, pristineJs }) {
    console.log("\nactivate (what a launch registers and asks)");
    const extension = require(path.join(REPO_ROOT, "out", "extension.js"));
    const manifest = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"),
    );
    const contributed = manifest.contributes.commands
      .map((c) => c.command)
      .sort()
      .join();

    const root = path.join(sandbox, "activate");
    const home = path.join(root, "home");
    const extensions = path.join(root, "extensions");
    const kilo = path.join(
      extensions,
      `kilocode.kilo-code-${source.version}-harness`,
    );
    const dist = path.join(kilo, "dist");
    fs.mkdirSync(home, { recursive: true });
    fs.mkdirSync(extensions, { recursive: true });
    const layOut = () => {
      fs.mkdirSync(dist, { recursive: true });
      for (const [name, body] of Object.entries(pristine)) {
        fs.writeFileSync(path.join(dist, name), body);
      }
    };
    const files = () =>
      Object.fromEntries(
        Object.keys(pristine).map((name) => [
          name,
          fs.readFileSync(path.join(dist, name), "utf8"),
        ]),
      );
    const asShipped = () =>
      Object.entries(files()).every(([name, body]) => body === pristine[name]);

    // The editor, as far as activate can see it. A message that offers Apply
    // is answered with `answer`, and every other one is dismissed.
    let commands = new Map();
    let listeners = [];
    let messages = [];
    let answer;
    const panels = [];
    const saved = {
      registerCommand: shim.commands.registerCommand,
      onDidChangeConfiguration: shim.workspace.onDidChangeConfiguration,
      showInformationMessage: shim.window.showInformationMessage,
      showWarningMessage: shim.window.showWarningMessage,
      showErrorMessage: shim.window.showErrorMessage,
      createWebviewPanel: shim.window.createWebviewPanel,
    };
    const savedHome = process.env.HOME;
    shim.commands.registerCommand = (id, handler) => {
      commands.set(id, handler);
      return { dispose() {} };
    };
    shim.workspace.onDidChangeConfiguration = (listener) => {
      listeners.push(listener);
      return { dispose() {} };
    };
    const reply = (text, ...items) => {
      messages.push({ text, items });
      return Promise.resolve(items.includes("Apply") ? answer : undefined);
    };
    shim.window.showInformationMessage = reply;
    shim.window.showWarningMessage = reply;
    shim.window.showErrorMessage = reply;
    // A page closed at the end, so the status view holds no page past this
    // section.
    shim.window.createWebviewPanel = () => {
      const closers = [];
      const panel = {
        webview: { html: "" },
        viewColumn: 1,
        reveal() {},
        dispose: () => closers.forEach((close) => close()),
        onDidDispose: (close) => {
          closers.push(close);
          return { dispose() {} };
        },
        onDidChangeViewState: () => ({ dispose() {} }),
      };
      panels.push(panel);
      return panel;
    };

    // What activate starts and does not return (the answer to its question,
    // the Apply that answer starts, a restart offer) runs on promise chains,
    // which are let finish before anything is read.
    const settle = async () => {
      for (let turn = 0; turn < 20; turn++) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    };
    // A fresh extension host, with the global state an editor keeps across
    // them.
    const memory = new Map();
    let launched;
    const launch = async (choice) => {
      test.forgetSession();
      commands = new Map();
      listeners = [];
      messages = [];
      answer = choice;
      launched = {
        subscriptions: [],
        extension: { packageJSON: { version: "0.0.0" } },
        extensionUri: {
          fsPath: path.join(extensions, "zeyutang.kilo-code-kb-patch"),
        },
        globalState: {
          get: (k, d) => (memory.has(k) ? memory.get(k) : d),
          update: (k, v) => {
            if (v === undefined) memory.delete(k);
            else memory.set(k, v);
            return Promise.resolve();
          },
        },
      };
      extension.activate(launched);
      await settle();
    };
    const registered = () => [...commands.keys()].sort().join();

    try {
      process.env.HOME = home;
      if (os.homedir() !== home) {
        throw new Error("could not point HOME into the sandbox");
      }

      await launch(undefined);
      check(
        registered() === contributed &&
          launched.subscriptions.length === commands.size &&
          listeners.length === 0 &&
          messages.length === 0,
        "with no Kilo Code to find, activate registers the commands package.json contributes and nothing else",
        `${registered()}, ${listeners.length} listener(s), ${messages.length} message(s)`,
      );

      layOut();
      await launch("Ignore");
      check(
        registered() === contributed &&
          listeners.length === 1 &&
          launched.subscriptions.length === commands.size + 1,
        "with an install, it also registers the settings listener, each as a disposable",
        `${registered()}, ${listeners.length} listener(s), ${launched.subscriptions.length} disposable(s)`,
      );
      const prompt = `Kilo Code KB Patch: v${source.version} detected, apply patches?`;
      check(
        messages.length === 1 &&
          messages[0].text === prompt &&
          messages[0].items.join() === "Apply,Ignore",
        "a first launch asks once whether to apply, naming the version",
        JSON.stringify(messages),
      );
      check(asShipped(), "Ignore leaves every file as Kilo shipped it");

      await launch("Apply");
      check(messages[0]?.text === prompt, "the next launch asks again");
      check(
        test.computeStatus(dist).verdict === "fully patched",
        "Apply patches the install fully",
        `got "${test.computeStatus(dist).verdict}"`,
      );
      check(
        messages.some(
          (m) =>
            m.text.startsWith("Kilo Code KB Patch: Patched ") &&
            m.items.join() === "Restart Extensions",
        ),
        "and offers the restart that puts the patches into effect",
        JSON.stringify(messages),
      );
      check(test.isSettled(kilo), "leaving the install recorded as settled");

      const before = files();
      await launch("Apply");
      check(
        messages.length === 0 &&
          listeners.length === 1 &&
          Object.entries(files()).every(
            ([name, body]) => body === before[name],
          ),
        "a settled launch asks nothing and writes nothing, and still listens for a settings change",
        JSON.stringify(messages),
      );

      // The listener, given a change to some other extension's settings and
      // then one to its own, with the attach button switched on in between.
      const key = "attach-button";
      const marker = test.DERIVED_BONUS_MARKERS[key];
      const carried =
        test.shippedBonusVariant(pristineJs, key) !== undefined ||
        test.deriveBonus(key, pristineJs) !== undefined;
      const buttons = () =>
        countOccurrences(
          fs.readFileSync(path.join(dist, test.CHAT_SCRIPT_FILE), "utf8"),
          marker,
        );
      const change = async (ours) => {
        messages = [];
        for (const listener of listeners) {
          listener({
            affectsConfiguration: (section) =>
              ours && section === "kiloCodeKbPatch",
          });
        }
        await settle();
      };
      shim.setConfig({ addAttachFileButton: true });
      await change(false);
      check(
        buttons() === 0 && messages.length === 0,
        "a change to another extension's settings is left alone",
      );
      await change(true);
      check(
        buttons() === (carried ? 1 : 0) &&
          messages.some((m) => m.text.includes("attach-file button")) ===
            carried,
        carried
          ? "a change to its own adds the button and offers the restart"
          : "a change to its own finds no button this build can carry",
        JSON.stringify(messages),
      );
      check(test.isSettled(kilo), "and the install stays recorded as settled");

      // Each command by the handler activate registered for it.
      await commands.get("kiloCodeKbPatch.status")();
      await settle();
      check(
        panels.length === 1 &&
          panels[0].webview.html.includes(`Kilo Code v${source.version}`),
        "Show Status opens the status page for this install",
      );
      await commands.get("kiloCodeKbPatch.restore")();
      await settle();
      check(
        asShipped() &&
          shim.workspace
            .getConfiguration()
            .get("addAttachFileButton", false) === false,
        "Restore Originals puts every file back as Kilo shipped it and the bonus setting off",
      );
      await commands.get("kiloCodeKbPatch.apply")();
      await settle();
      check(
        test.computeStatus(dist).verdict === "fully patched",
        "Apply Patches patches it again",
        `got "${test.computeStatus(dist).verdict}"`,
      );

      check(
        extension.deactivate() === undefined,
        "deactivate has nothing to undo",
      );
    } finally {
      for (const panel of panels) panel.dispose();
      Object.assign(shim.commands, { registerCommand: saved.registerCommand });
      Object.assign(shim.workspace, {
        onDidChangeConfiguration: saved.onDidChangeConfiguration,
      });
      Object.assign(shim.window, {
        showInformationMessage: saved.showInformationMessage,
        showWarningMessage: saved.showWarningMessage,
        showErrorMessage: saved.showErrorMessage,
        createWebviewPanel: saved.createWebviewPanel,
      });
      if (savedHome === undefined) delete process.env.HOME;
      else process.env.HOME = savedHome;
      test.setExtensionContext(undefined);
      test.forgetSession();
      shim.setConfig(Object.fromEntries(test.BONUS_SETTING_DEFAULTS));
    }
  },
};
