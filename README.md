# Kilo Code Keyboard Patch

Patches [Kilo Code](https://github.com/Kilo-Org/kilocode) VS Code extension keyboard behavior.

> **Supported versions**:
>
> | Kilo Code | KB Patch |
> | --------- | -------- |
> | 7.3.50    | 1.1.x    |
> | 7.3.46    | 1.0.x    |

This repo provides two ways to apply the patches:

1. **VS Code extension** (`src/extension.ts`) -- Auto-detection, commands, status checking. Install as a `.vsix`.
2. **Standalone script** (`patch.py`) -- Quick one-liner, no extension needed.

## What it does

| Context                           | Key           | Before (Kilo Code default) | After (patched)                        |
| --------------------------------- | ------------- | -------------------------- | -------------------------------------- |
| Chat input                        | `Enter`       | Send message               | New line                               |
| Chat input                        | `Cmd+Enter`   | --                         | Send message                           |
| Chat input                        | `Shift+Enter` | New line                   | New line (unchanged)                   |
| Permission + textarea empty       | `Enter`       | Approve                    | Approve (unchanged)                    |
| Permission + textarea empty       | `Space`       | --                         | Approve                                |
| Permission + textarea empty       | `Escape`      | Reject                     | Reject (unchanged)                     |
| Permission + textarea has content | `Enter`       | Approve                    | New line (chat handles it)             |
| Permission + textarea has content | `Cmd+Enter`   | --                         | No action (address prompt first)       |
| Permission + textarea has content | `Space`       | --                         | Space (chat handles it)                |
| Permission + textarea has content | `Escape`      | Reject                     | Dismiss autocomplete (chat handles it) |
| Permission + textarea has content | `Cmd+Escape`  | --                         | Reject permission                      |
| KiloClaw chat                     | `Enter`       | Send message               | New line                               |
| KiloClaw chat                     | `Cmd+Enter`   | --                         | Send message                           |

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

## Detailed Behavior Comparison

### Chat Input (no permission prompt)

| Key           | Claude Code (default)      | Claude Code (`useCtrlEnterToSend=true`) | Kilo Code (native)         | Kilo Code (patched) |
| ------------- | -------------------------- | --------------------------------------- | -------------------------- | ------------------- |
| `Enter`       | Send                       | Newline                                 | Send                       | **Newline**         |
| `Shift+Enter` | Newline                    | Newline                                 | Newline                    | Newline             |
| `Cmd+Enter`   | --                         | Send                                    | --                         | **Send**            |
| `Escape`      | Dismiss autocomplete/abort | Same                                    | Dismiss autocomplete/abort | Same                |

### Permission Prompt -- Textarea Has Content

When the textarea has content, all Enter/Space/Escape keydowns are routed to the chat input. The permission prompt must be addressed first (via mouse click or Cmd+Escape).

| Key          | Claude Code                                                    | Kilo Code (native) | Kilo Code (patched)                  |
| ------------ | -------------------------------------------------------------- | ------------------ | ------------------------------------ |
| `Enter`      | Wait for a short period before switching focus, if stop typing | Approve            | **Newline** (chat handles it)        |
| `Cmd+Enter`  | --                                                             | --                 | **No action** (address prompt first) |
| `Space`      | --                                                             | --                 | **Space** (chat handles it)          |
| `Escape`     | Wait for a short period before switching focus, if stop typing | Reject             | **Dismiss autocomplete only** (chat) |
| `Cmd+Escape` | --                                                             | --                 | **Reject**                           |

### Permission Prompt -- Textarea Empty

(Claude Code hides the input in this case, so focus is on permission buttons)

| Key      | Claude Code | Kilo Code (native) | Kilo Code (patched) |
| -------- | ----------- | ------------------ | ------------------- |
| `Enter`  | Approve     | Approve            | Approve             |
| `Space`  | Approve     | Approve            | Approve             |
| `Escape` | Reject      | Reject             | Reject              |

## Troubleshooting

- **Patch has no effect**: Make sure you reloaded the VS Code window after patching.
- **Patterns not found**: The Kilo Code extension may have updated and changed the minified code structure. Check the "Show Status" command output (extension) or `SKIP` messages (script) and update the patch patterns in `src/extension.ts` or `patch.py`.
- **Behavior reverts after update**: Extension updates overwrite `dist/`. Re-apply patches.
