# Kilo Code Keyboard Patch

Patches [Kilo Code](https://github.com/Kilo-Org/kilocode)'s keyboard behavior: `Enter` starts a new line, `Cmd+Enter` sends, and permission prompts stop hijacking your keystrokes while you are typing.

## Supported versions

| Kilo Code | KB Patch |
| --------- | -------- |
| 7.4.9+    | 1.6.x    |
| 7.4.8     | 1.5.x    |
| 7.4.7     | 1.4.x    |
| 7.4.0-6   | 1.3.x    |
| 7.3.63    | 1.2.x    |
| 7.3.50-54 | 1.1.x    |
| 7.3.46    | 1.0.x    |

Each patch release keeps the earlier versions' patterns, so a newer patch still works on an older Kilo Code.

## What it does

| Key            | Kilo Code (default) | KB Patched                                         |
| -------------- | ------------------- | -------------------------------------------------- |
| `Enter`        | Send / Approve      | **New line** (approves when the chat box is empty) |
| `Cmd+Enter`    | Send / Save         | **Send / Approve / Save**                          |
| `Shift+Enter`  | New line            | New line (unchanged)                               |
| `Escape`       | Reject / Abort      | Reject / Abort **only when the chat box is empty** |
| `Shift+Escape` | Reject / Abort      | **Reject / Abort** (always)                        |

Applies to the chat input, the permission prompt, and the KiloClaw edit/chat panels.

## Install

Install from the **VS Code Marketplace**: [Kilo Code KB Patch](https://marketplace.visualstudio.com/items?itemName=zeyutang.kilo-code-kb-patch)

The extension detects an unpatched Kilo Code and offers to apply. Three commands are available from the Command Palette (`Cmd+Shift+P` → "Kilo Code KB Patch"):

- **Apply Patches**
- **Restore Originals**
- **Show Status**

Reload the window after applying KB Patch: `Cmd+Shift+P` → `Developer: Reload Window`.

## How keystrokes are routed

Kilo Code asks for your input in three ways. The patch rewires only one of them (permission prompts) and decides purely by **whether the chat box contains text**; spaces and newlines do not count.

KB Patch never moves the keyboard focus. Because Kilo Code moves focus on its own, a choice can take over the keyboard even when you have typed something. When that happens your keys act on the highlighted choice (this is intended, with minimal interference with the native Kilo Code experience).

### Permission prompts

Approve or reject a tool or command. The only surface the patch rewires.

- Kilo Code does **not** shift focus here: it leaves focus in the chat box and intercepts keys with a document-level listener, so the patch can read the chat box content and route accordingly.

The chat box content decides where each key goes:

| Key            | Chat box empty | Chat box has text         |
| -------------- | -------------- | ------------------------- |
| `Enter`        | Approve        | New line                  |
| `Space`        | Approve        | Space                     |
| `Cmd+Enter`    | Approve        | Approve                   |
| `Escape`       | Reject         | Dismiss autocomplete only |
| `Shift+Escape` | Reject         | Reject                    |

Reject and abort use `Shift+Escape` (not `Cmd+Escape`, which is Claude Code's quick-launch shortcut).

### Follow-up questions

Pick a suggested answer or type your own. The patch leaves these alone.

- Kilo Code **auto-focuses the first option** when the prompt appears, so keys act on the highlighted choice regardless of what is in the chat box.
- Arrow keys move between choices, `Enter` selects, and `Cmd+Enter` send the choice.

### Menus and dialogs

Model and mode pickers, confirmations, `@`-mentions. The patch leaves these alone.

- Kilo Code moves focus into them when they open and handles their keys: arrow keys or type-ahead to move, `Enter` to choose, `Escape` to close pop-up menu **without** invoking the permission prompt abort.

## Troubleshooting

- **No effect:** reload the VS Code window after applying.
- **Stopped working after a Kilo Code update:** updates overwrite the patched files and can rename Kilo Code's internal code. Re-apply by `Cmd+Shift+P` → `Kilo Code KB Patch: Apply Patches`.
