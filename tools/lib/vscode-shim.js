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
    createWebviewPanel: () => ({ webview: {} }),
  },
  commands: { registerCommand: noop, executeCommand: noop },
  extensions: { getExtension: () => undefined },
  ViewColumn: { Active: 1 },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
};
