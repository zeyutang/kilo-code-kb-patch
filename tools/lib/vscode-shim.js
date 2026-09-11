// Minimal stand-in for the "vscode" module so the compiled extension can be
// loaded in plain Node. Only the surface the __test exports actually touch is
// implemented; everything else is a no-op.
//
// Settings are supplied by the caller (see setConfig) rather than read from a
// real workspace, so the harness can exercise both states of an opt-in bonus
// without a running editor.
let config = {};

function setConfig(values) {
  config = { ...values };
}

const noop = () => {};

// Tab inputs are matched with `instanceof`, so the shim needs the real class
// identity rather than a plain object shaped like one.
class TabInputWebview {
  constructor(viewType) {
    this.viewType = viewType;
  }
}
const configuration = {
  get: (key, fallback) => (key in config ? config[key] : fallback),
  inspect: () => undefined,
  update: async (key, value) => {
    config[key] = value;
  },
};

module.exports = {
  setConfig,
  workspace: {
    getConfiguration: () => configuration,
    onDidChangeConfiguration: noop,
  },
  window: {
    showInformationMessage: () => Promise.resolve(undefined),
    showWarningMessage: () => Promise.resolve(undefined),
    showErrorMessage: () => Promise.resolve(undefined),
    createWebviewPanel: () => ({
      webview: {},
      reveal: noop,
      dispose: noop,
      onDidDispose: noop,
      onDidChangeViewState: noop,
    }),
    // No editor, so no tabs: a status page is never found to replace.
    tabGroups: { all: [], close: async () => true },
  },
  commands: { registerCommand: noop, executeCommand: noop },
  extensions: { getExtension: () => undefined },
  TabInputWebview,
  ViewColumn: { Active: 1 },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
};
