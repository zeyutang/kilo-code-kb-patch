# Changelog

## Version compatibility

| Kilo Code Release | KB Patch Version |
| ----------------- | ---------------- |
| 7.4.8+            | 1.5.x            |
| 7.4.7             | 1.4.x            |
| 7.4.0-6           | 1.3.x            |
| 7.3.63            | 1.2.x            |
| 7.3.50-54         | 1.1.x            |
| 7.3.46            | 1.0.x            |

## 1.5.0

- Retarget the three `webview.js` patterns that 7.4.8 re-minified: chat input (Enter-check `Vm`→`Wm`, event `$e`→`ze`, send `da`→`ua`), chat Escape (abort guard `ot`→`it`), and the permission skip predicate (`L(H)`→`L(G)`); 7.4.8 renamed only the chat scope and one permission symbol, so the permission-button and document-level patterns still match through the existing 7.4.7/7.3.63 patterns
- Retarget both `kiloclaw.js` patterns to 7.4.8's renamed Enter-check helper (`LA`→`NA`)
- Keep all earlier versions' patterns, so 1.5.x still applies on older Kilo Code releases
- Status panel now lists every feature the patch targets: a feature whose code it can no longer locate shows as a red `✗` "no matching code" row and one it recognizes but has not yet applied shows as an amber `○` "not applied" row, instead of dropping the row and signaling only through the "partially patched" badge

## 1.4.0

- Retarget all six `webview.js` patterns to Kilo Code 7.4.7's re-minified symbols (chat: `Vm` Enter-check, `$e` event, `da` send, `ot` abort guard; permission: `N` skip predicate, `j`/`O` handlers, `z` dispatch, `$` bare-Enter check, `ie` document event); 7.4.7 re-minified `webview.js` wholesale, so every 7.4.0 and 7.3.x pattern stopped matching
- Keep all earlier versions' patterns, so 1.4.x still applies on older Kilo Code releases
- Fix the status verdict: a file with no matching patch points is no longer ignored when deciding the verdict, so an unrecognized `webview.js` alongside a patched `kiloclaw.js` now reads as "partially patched" instead of "fully patched"

## 1.3.2

- Improve patch status webview
- README updates

## 1.3.0

- Add Kilo Code 7.4.0 chat-input patterns (`Ge` event, `Om` Enter-check, `Ea` send); 7.4.0 re-minified the chat keydown scope after adding a bare-Escape autocomplete-dismiss branch, which left the two chat patterns unmatched on 7.4.0
- Keep the 7.3.63 chat patterns; the permission and document-level patterns are unchanged in 7.4.0 and still match via the existing 7.3.63 patterns
- Document Kilo Code's three interactive input surfaces (tool permission, follow-up question, menus/dialogs) and its focus-shifting behavior, and clarify that the patch keys off textarea non-whitespace content and never moves focus

## 1.2.0

- Retarget chat, permission, and document-level patterns to Kilo Code 7.3.63's new minified symbols (`$m`, `Ne`, `Oa`, `Fe`, `z`, `q`, `j`, `O`)
- Keep legacy 7.3.50-7.3.54 patterns for backward compatibility

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
- VS Code extension with apply/restore/status commands and auto-detection
