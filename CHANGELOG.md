# Changelog

## Version compatibility

| Kilo Code Release | KB Patch Version |
| ----------------- | ---------------- |
| 7.3.50+           | 1.1.x            |
| 7.3.46            | 1.0.x            |

## 1.1.2

- Whitespace-only input (spaces or newlines) is now treated as empty, so keys route to the permission buttons instead of the chat input

## 1.1.1

- Switch reject/abort key from `Cmd+Escape` to `Shift+Escape` (avoids clash with Claude Code's quick-launch)
- Read textarea value via the event target (shadow DOM safe) instead of `querySelector`; treat whitespace as content
- Bare `Escape` now rejects/aborts only when the textarea is empty
- Patch `Cmd+Enter` approve, `Space` approve-when-empty, and the document-level abort handler

## 1.1.0

- Retarget chat, permission, and KiloClaw patterns to Kilo Code 7.3.50's minified symbols
- Drop obsolete permission `Space`-approve patch; rename the `R` handler to `P`
- Add version compatibility table

## 1.0.2

- Add extension icon

## 1.0.1

- Initial release for Kilo Code 7.3.46
- `Enter` inserts a newline; `Cmd+Enter` sends/approves
- Smarter permission-prompt key routing based on textarea content
- Standalone `patch.py` script plus VS Code extension (apply/restore/status commands with auto-detection)
