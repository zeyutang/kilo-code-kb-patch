# Kilo Code Keyboard Patch

Patches [Kilo Code](https://github.com/Kilo-Org/kilocode) VS Code extension keyboard behavior.

**Supported versions**:

| Kilo Code Release | KB Patch Version |
| ----------------- | ---------------- |
| 7.3.50+           | 1.1.x            |
| 7.3.46            | 1.0.x            |

This repo provides two ways to apply the patches:

1. **VS Code extension** (`src/extension.ts`) -- Auto-detection, commands, status checking. Install as a `.vsix`.
2. **Standalone script** (`patch.py`) -- Quick one-liner, no extension needed.

## What it does

### Unified keyboard behaviors

These apply everywhere -- chat input, permission prompts, and KiloClaw edit/chat panels:

| Key            | Before (Kilo Code) | After (patched)                            |
| -------------- | ------------------ | ------------------------------------------ |
| `Enter`        | Send / Approve     | **New line** (Approve when textarea empty) |
| `Cmd+Enter`    | Send / Save        | **Send / Approve / Save**                  |
| `Shift+Enter`  | New line           | New line (unchanged)                       |
| `Shift+Escape` | Reject / Abort     | **Reject / Abort** (always)                |
| `Escape`       | Reject / Abort     | Reject / Abort only when textarea is empty |

### Permission prompt scenarios

When a permission prompt is visible, the textarea content determines which keys are routed to the chat input vs the permission buttons:

| Key            | Textarea empty | Textarea has content                 |
| -------------- | -------------- | ------------------------------------ |
| `Enter`        | Approve        | **New line** (chat handles it)       |
| `Space`        | Approve        | **Space** (chat handles it)          |
| `Escape`       | Reject         | **Dismiss autocomplete only** (chat) |
| `Cmd+Enter`    | Approve        | **Approve** (without submitting)     |
| `Shift+Escape` | Reject         | **Reject**                           |

Whitespace does **not** count as content, so a textarea with only spaces or newlines is treated as empty and keys route to the permission buttons.

KB patch uses `Shift+Escape` instead of `Cmd+Escape` to avoid clashes with Claude Code's quick-launch shortcut.

## VS Code Extension

### Install

```bash
npm install
npm run compile
npx @vscode/vsce package
# Install the .vsix in VS Code
code --install-extension kilo-code-kb-patch-*.vsix
```

### Usage

The extension auto-detects when Kilo Code is installed but unpatched and prompts you to apply.

Commands available via Command Palette (`Cmd+Shift+P`):

- **Kilo Code KB Patch: Apply Patches** -- Apply all patches
- **Kilo Code KB Patch: Restore Originals** -- Revert to original behavior
- **Kilo Code KB Patch: Show Status** -- Show which patches are applied/original/missing

After applying or restoring, you will be prompted to reload the VS Code window.

## Standalone Script

```bash
# Apply patches (default)
python3 patch.py

# Revert all patches to original
python3 patch.py restore
```

Then reload the VS Code window: `Cmd+Shift+P` → `Developer: Reload Window`

Re-run `patch.py` after every Kilo Code extension update (the script auto-finds the latest version).

## Detailed Behavior Comparison to Claude Code

### Chat Input (no permission prompt)

| Key           | Claude Code (default)      | Claude Code (`useCtrlEnterToSend=true`) | Kilo Code (native)         | Kilo Code (patched)                        |
| ------------- | -------------------------- | --------------------------------------- | -------------------------- | ------------------------------------------ |
| `Enter`       | Send                       | Newline                                 | Send                       | **Newline**                                |
| `Shift+Enter` | Newline                    | Newline                                 | Newline                    | Newline                                    |
| `Cmd+Enter`   | --                         | Send                                    | Send                       | **Send**                                   |
| `Escape`      | Dismiss autocomplete/abort | Same                                    | Dismiss autocomplete/abort | Dismiss autocomplete / abort only if empty |

### Permission Prompt -- Textarea Has Content

When the textarea has non-whitespace content, bare Enter/Space/Escape keydowns are routed to the chat input. Cmd+Enter approves, Shift+Escape rejects. (Whitespace-only input is treated as empty -- see below.)

| Key            | Claude Code                                                    | Kilo Code (native) | Kilo Code (patched)                  |
| -------------- | -------------------------------------------------------------- | ------------------ | ------------------------------------ |
| `Enter`        | Wait for a short period before switching focus, if stop typing | Approve            | **Newline** (chat handles it)        |
| `Cmd+Enter`    | --                                                             | --                 | **Approve**                          |
| `Space`        | --                                                             | --                 | **Space** (chat handles it)          |
| `Escape`       | Wait for a short period before switching focus, if stop typing | Reject             | **Dismiss autocomplete only** (chat) |
| `Shift+Escape` | --                                                             | Reject             | **Reject**                           |

### Permission Prompt -- Textarea Empty

A textarea that is empty or contains only whitespace is treated as empty. (Claude Code hides the input in this case, so focus is on permission buttons)

| Key            | Claude Code | Kilo Code (native) | Kilo Code (patched) |
| -------------- | ----------- | ------------------ | ------------------- |
| `Enter`        | Approve     | Approve            | Approve             |
| `Space`        | Approve     | --                 | Approve             |
| `Escape`       | Reject      | Reject             | Reject              |
| `Shift+Escape` | --          | Reject             | Reject              |

## Troubleshooting

- **Patch has no effect**: Make sure you reloaded the VS Code window after patching.
- **Patterns not found**: The Kilo Code extension may have updated and changed the minified code structure. Check the "Show Status" command output (extension) or `SKIP` messages (script) and update the patch patterns in `src/extension.ts` or `patch.py`.
- **Behavior reverts after update**: Extension updates overwrite `dist/`. Re-apply patches.
