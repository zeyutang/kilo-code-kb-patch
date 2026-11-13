// The shape rules for the core patches, one per feature.

import {
  ID,
  countIn,
  esc,
  findAll,
  formsRule,
  namesToken,
  replaceLiteral,
  shapeRule,
} from "./engine";
import type { DeriveResult, ShapeRule } from "./engine";

// Chat input and KiloClaw chat share one shape: an Enter-check helper guarding a
// send call, suppressed by Shift. The edit swaps "not Shift" for "Meta".
const ENTER_SEND_SHAPE = `(${ID})\\((${ID})\\)&&!\\2\\.shiftKey&&\\(\\2\\.preventDefault\\(\\),(${ID})\\(\\)\\)`;
const enterSendBuild = (m: RegExpExecArray) =>
  `${m[1]}(${m[2]})&&(${m[2]}.metaKey||${m[2]}.ctrlKey)&&(${m[2]}.preventDefault(),${m[3]}())`;

// The two live forms of the mention controller, for the `mention-escape` rule
// below. Each returns a derive result, so an unmatched form reports its own
// match count and the rule can tell "the shape moved" from "this build is the
// other generation".

// v7.7.0+: Kilo records the dismissed query itself, so the only edit left is
// clearing the slot when the "@" it names is gone. The anchor stops at the
// dead-slot check rather than running on through the settle test, because the
// slot, the draft text and the close are all bound by then and the settle
// test's arguments are the volatile part (7.7.0 rewrote them outright). Every
// symbol the splice writes is inside the span, which is what the 7.4.22
// aliasing lesson requires.
function deriveMentionClear(content: string): DeriveResult {
  const hits = findAll(
    content,
    String.raw`let (${ID})=(${ID})\.substring\(0,(${ID})\),(${ID})=\1\.match\((${ID})\);` +
      String.raw`if\(!\4\)\{(${ID})\(\);return\}let (${ID})=\4\[1\]\?\?"";` +
      String.raw`if\((${ID})=\(\4\.index\?\?0\)\+\(/\^\\s/\.test\(\4\[0\]\)\?1:0\),` +
      String.raw`(${ID})&&\9\.at===\8&&\7\.startsWith\(\9\.query\)\)\{\6\(\);return\}`,
  );
  if (hits.length !== 1) return { matches: hits.length };
  const m = hits[0];
  const [original, , text, , match, , close, , at, dead] = m;
  const closeReturn = `if(!${match}){${close}();return}`;
  if (countIn(original, closeReturn) !== 1) {
    return {
      error:
        "the mention trigger's no-match close is not where the shape expects",
    };
  }
  return {
    original,
    patched: replaceLiteral(
      original,
      closeReturn,
      `if(!${match}){${dead}&&${text}[${dead}.at]!=="@"&&(${dead}=void 0),${close}();return}`,
    ),
    symbols: { text, match, close, at, dead },
    form: "clear",
    description: (v) =>
      `Mention menu Escape: drops Kilo's recorded @ query once that @ is gone, so deleting and retyping the @ reopens the menu (v${v}+)`,
  };
}

// v7.5.11 through 7.6.2: Kilo's Escape closes the menu and records nothing, so
// both edits ship. onInput and onKeyDown sit next to each other inside the
// controller, so the anchor runs from onInput's trigger test (binding the dead
// slot, the "@" offset, the text and the close) through onKeyDown's Escape
// branch (binding the query accessor and the event). The bare Escape branch is
// not unique on its own, the slash-command menu has the same one, so the two
// hops are what make the site identifiable.
function deriveMentionRecordAndClear(content: string): DeriveResult {
  const heads = findAll(
    content,
    String.raw`let (${ID})=(${ID})\.substring\(0,(${ID})\)\.match\((${ID})\);` +
      String.raw`if\(!\1\)\{(${ID})\(\);return\}let (${ID})=\1\[1\]\?\?"";` +
      String.raw`if\((${ID})=\(\1\.index\?\?0\)\+\(/\^\\s/\.test\(\1\[0\]\)\?1:0\),` +
      String.raw`(${ID})\(\6,(${ID})\.get\(\7\),(${ID})\(\)\)\)\{\5\(\);return\}` +
      String.raw`if\((${ID})&&\11\.at===\7&&\6\.startsWith\(\11\.query\)\)\{\5\(\);return\}`,
  );
  if (heads.length !== 1) return { matches: heads.length };
  const head = heads[0];
  const [, match, text, , , close, , at, , , , dead] = head;

  const tails = findAll(
    content,
    String.raw`let (${ID})=(${ID})\(\)\?\?"";return (${ID})\.type==="file-picker"` +
      String.raw`&&/\\s/\.test\(\1\)&&!(${ID})\(\1\)\?!1:\((${ID})\.preventDefault\(\),` +
      String.raw`(${ID})&&(${ID})\(\3,\6,(${ID}),(${ID})\),!0\)\}` +
      String.raw`return \5\.key==="Escape"\?\(\5\.preventDefault\(\),\5\.stopPropagation\(\),` +
      String.raw`(${ID})\(\),!0\):!1\}`,
  );
  if (tails.length !== 1) return { matches: tails.length };
  const tail = tails[0];
  const mentionQuery = tail[2];
  if (tail[10] !== close) {
    return {
      error: "onKeyDown's Escape closes with a different function than onInput",
    };
  }
  if (tail.index <= head.index || tail.index - head.index > 4000) {
    return {
      error:
        "onKeyDown's Escape branch is not just after onInput's trigger test",
    };
  }

  const original = content.slice(head.index, tail.index + tail[0].length);
  const closeReturn = `if(!${match}){${close}();return}`;
  const escapeTail = `${close}(),!0):!1}`;
  if (countIn(original, closeReturn) !== 1 || !original.endsWith(escapeTail)) {
    return {
      error:
        "the trigger's close or the Escape tail is not where the shape expects",
    };
  }
  const patched =
    replaceLiteral(
      original,
      closeReturn,
      `if(!${match}){${dead}&&${text}[${dead}.at]!=="@"&&(${dead}=void 0),${close}();return}`,
    ).slice(0, -escapeTail.length) +
    `${dead}={at:${at},query:${mentionQuery}()??""},${escapeTail}`;
  return {
    original,
    patched,
    symbols: { text, match, close, at, dead, mentionQuery, event: tail[5] },
    form: "record+clear",
    description: (v) =>
      `Mention menu Escape: Escape records the dismissed @ query so typing on keeps the menu closed; retyping the @ reopens it (v${v}+)`,
  };
}

// How much Kilo may declare between the history handler's direction local and
// its navigate() call before the chat-history rule stops reading it as one
// `let` statement. The one declaration there since 7.8.2 is 33 bytes, so this
// leaves room for several more while a span that long with no `;` and no brace
// in it is still a declaration list rather than a run into other code.
export const HISTORY_DECLARATIONS_LIMIT = 160;

export const RULES: ShapeRule[] = [
  shapeRule({
    key: "chat-input",
    file: "webview.js",
    shape: ENTER_SEND_SHAPE,
    names: ["enterCheck", "event", "send"],
    build: enterSendBuild,
    description: (v) =>
      `Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v${v}+)`,
  }),

  // The chat textarea's Escape. Through 7.5.16 this was two consecutive `if`
  // statements, a ghost-text dismiss followed by the abort, and only the abort
  // was patched. 7.6.0 hoisted both into one helper and added a third case, the
  // goal-mode cancel that arrived with `/goal`, so the whole triage is now one
  // ternary chain: popup-selector open, then ghost text, then goal mode, then
  // abort. The edit still gates the abort alone and leaves the two Kilo-owned
  // dismissals to fire whatever the textarea holds, so the shipped contract is
  // unchanged; only the expression it has to be spliced into moved.
  formsRule({
    key: "chat-escape",
    file: "webview.js",
    forms: [
      // v7.6.0+: one helper, with `busy` last in the bail-out test. Adding our
      // guard as an alternative to `!busy()` is what keeps the two earlier
      // branches reachable, and a bail returns !1 without consuming the event,
      // exactly as the unmatched `if` used to fall through to the
      // document-level handler that doc-escape guards.
      {
        shape:
          `(${ID})\\.key!=="Escape"\\?!1:(${ID})\\(\\)\\?!0:` +
          `!(${ID})\\.text\\(\\)&&!(${ID})\\.active\\(\\)&&!(${ID})\\(\\)\\?!1:` +
          `\\(\\1\\.preventDefault\\(\\),\\1\\.stopPropagation\\(\\),` +
          `\\3\\.text\\(\\)\\?\\3\\.dismiss\\(\\):` +
          `\\4\\.active\\(\\)\\?\\4\\.cancel\\(\\):(${ID})\\.abort\\(\\),!0\\)`,
        names: ["event", "popup", "ghost", "goal", "busy", "store"],
        build: (m) =>
          `${m[1]}.key!=="Escape"?!1:${m[2]}()?!0:!${m[3]}.text()&&!${m[4]}.active()&&(!${m[5]}()||!${m[1]}.shiftKey&&${m[1]}.target?.value?.trim())?!1:(${m[1]}.preventDefault(),${m[1]}.stopPropagation(),${m[3]}.text()?${m[3]}.dismiss():${m[4]}.active()?${m[4]}.cancel():${m[6]}.abort(),!0)`,
      },
      // v7.4.17 through v7.5.16: the standalone abort statement.
      {
        shape: `if\\((${ID})\\.key==="Escape"&&(${ID})\\(\\)\\)\\{\\1\\.preventDefault\\(\\),\\1\\.stopPropagation\\(\\),(${ID})\\.abort\\(\\);return\\}`,
        names: ["event", "guard", "store"],
        build: (m) =>
          `if(${m[1]}.key==="Escape"&&${m[2]}()&&(${m[1]}.shiftKey||!${m[1]}.target?.value?.trim())){${m[1]}.preventDefault(),${m[1]}.stopPropagation(),${m[3]}.abort();return}`,
      },
    ],
    description: (v) =>
      `Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v${v}+)`,
  }),

  // The @-mention menu's Escape. Since 7.5.11 a mention query may contain
  // spaces (Kilo-Org/kilocode#13592), so ordinary prose typed after a mention
  // still matches the trigger, and the controller keeps the menu closed only
  // while the query extends the mention it inserted at that exact "@" offset
  // or a query it already found dead (Kilo-Org/kilocode#13961). Two edits make
  // that slot behave: Escape has to *record* the dismissed query in it, and
  // onInput has to *clear* it once the "@" it names is gone, or an empty-query
  // dismissal strands the offset and retyping the "@" gets nothing.
  //
  // 7.7.0 upstreamed the recording half: Kilo's own Escape branch now writes
  // `{at,query}` into the slot, its onInput consults the slot before its settle
  // test rather than after, and its settle test records there too. The clearing
  // half is still absent, so that release needs one edit where the earlier ones
  // need two, and shipping the recording edit on top of Kilo's would just
  // duplicate an assignment. Hence two forms rather than one shape, and the
  // form that matches decides which edits ship; two forms matching at once is
  // reported as ambiguous rather than resolved by list order.
  {
    key: "mention-escape",
    file: "webview.js",
    description: (v) =>
      `Mention menu Escape: a dismissed @ query keeps the menu closed while you type on, and is dropped once that @ is gone so retyping it reopens the menu (v${v}+)`,
    derive(content) {
      const forms = [
        deriveMentionClear(content),
        deriveMentionRecordAndClear(content),
      ];
      const live = forms.filter((f) => f && f.original !== undefined);
      if (live.length > 1) {
        return {
          error:
            "two mention-escape forms match this build, so which edits apply would be decided by list order",
        };
      }
      if (live.length === 1) return live[0];
      // Neither form produced a site. Surface the first form's own diagnosis
      // (a match count or a structural error) rather than a bare zero, since
      // that is what says whether the shape moved or the hop checks failed.
      return forms.find((f) => f && f.error) ?? forms[0] ?? { matches: 0 };
    },
  },

  // Prompt-history navigation. Kilo's own gate (q_a in 7.5.6) lets an arrow key
  // reach the history only when the caret already sits at the boundary it is
  // travelling towards, which is what makes a held Up walk to the top of the
  // draft and then jump to the previous message. The edit moves the whole
  // behavior onto Cmd/Ctrl and passes that boundary as the caret argument, so
  // the chord recalls history from anywhere in the draft while a bare arrow is
  // caret movement and nothing else. Kilo's own selection guard is left in
  // place: with a range selected the chord falls through to the platform's
  // caret gesture rather than replacing the draft.
  //
  // The anchor runs from the key test through the navigate() call because that
  // is the first point at which the text accessor is bound, and the splice
  // references it; stopping any earlier would leave a symbol unpinned, which is
  // the 7.4.22 aliasing failure.
  //
  // Two stretches of that span are Kilo's to grow, and the edit reads neither:
  // what it declares between the direction and the call, and what the call
  // passes after the caret. Through 7.8.1 both were empty. 7.8.2 taught the
  // history to carry the draft's pasted chunks, which added one declaration
  // (`<pastes>=<controller>.pastes().map(x=>x.text),`) and a fourth argument
  // naming it, and that alone left a rule which spelled the call out matching
  // nothing. So both are captured and written back verbatim, the treatment
  // doc-escape's "nothing to abort" test and perm-approve's extra conjuncts
  // get: the declarations as a span that cannot leave the `let` statement (no
  // `;`, no brace) and ends on the comma before the result, the arguments as
  // a list of names. With both empty the shape emits byte for byte what the
  // entries for 7.8.1 and older ship.
  //
  // Capturing cannot bind a symbol wrongly, since every name the edit writes
  // sits outside the two spans. What it could do is hide a second reader of
  // the caret local. The edit changes what that local holds, from the caret to
  // the boundary being travelled towards, which is sound only while the one
  // thing reading it is the gate behind navigate()'s third argument (run
  // against the build's own module by tools/behavior.js). A captured span
  // naming it would be handed a value that is no longer the caret, so that is
  // reported for a human instead of derived. What follows the anchor is not
  // read here, as it never was: tools/behavior.js runs the whole statement.
  {
    key: "chat-history",
    file: "webview.js",
    description: (v) =>
      `Chat history: plain Up/Down stay in the textarea, Cmd/Ctrl+Up/Down step through sent messages (v${v}+)`,
    derive(content) {
      const matches = findAll(
        content,
        `if\\(\\((${ID})\\.key==="ArrowUp"\\|\\|\\1\\.key==="ArrowDown"\\)` +
          `&&!\\1\\.altKey&&!\\1\\.ctrlKey&&!\\1\\.metaKey&&!\\1\\.shiftKey\\)\\{` +
          `let (${ID})=(${ID})\\?\\.selectionStart\\?\\?0,(${ID})=\\3\\?\\.selectionEnd\\?\\?0;` +
          `if\\(\\2!==\\4\\)return;` +
          `let (${ID})=\\2,(${ID})=\\1\\.key==="ArrowUp"\\?"up":"down",` +
          `((?:[^;{}]{1,${HISTORY_DECLARATIONS_LIMIT}}?,)?)` +
          `(${ID})=(${ID})\\.navigate\\(\\6,(${ID})\\(\\),\\5((?:,${ID})*)\\)`,
      );
      if (matches.length !== 1) return { matches: matches.length };
      const [
        original,
        event,
        selectionStart,
        textarea,
        selectionEnd,
        caret,
        direction,
        declarations,
        result,
        history,
        text,
        extraArguments,
      ] = matches[0];

      if (namesToken(declarations, caret)) {
        return {
          error:
            "a declaration ahead of navigate() reads the caret local the edit replaces",
        };
      }
      if (namesToken(extraArguments, caret)) {
        return {
          error:
            "navigate() is passed the caret local a second time, which the edit replaces",
        };
      }

      return {
        original,
        patched:
          `if((${event}.key==="ArrowUp"||${event}.key==="ArrowDown")&&(${event}.metaKey||${event}.ctrlKey)` +
          `&&!${event}.altKey&&!${event}.shiftKey){` +
          `let ${selectionStart}=${textarea}?.selectionStart??0,${selectionEnd}=${textarea}?.selectionEnd??0;` +
          `if(${selectionStart}!==${selectionEnd})return;` +
          `let ${caret}=${event}.key==="ArrowUp"?0:${text}().length,` +
          `${direction}=${event}.key==="ArrowUp"?"up":"down",` +
          `${declarations}${result}=${history}.navigate(${direction},${text}(),${caret}${extraArguments})`,
        symbols: {
          event,
          selectionStart,
          textarea,
          selectionEnd,
          caret,
          direction,
          declarations,
          result,
          history,
          text,
          extraArguments,
        },
      };
    },
  },

  // The skip-predicate's tail is only a few characters ("V?!1:L(G)"), far too
  // short to match safely on its own, so it is reached in two hops from the
  // selector literal that names the in-textarea guard.
  {
    key: "perm-keys",
    file: "webview.js",
    // Descriptions name the role, never the release's minified symbol: 7.4.20
    // rotated the permission scope's names (7.4.17's skip-predicate N,
    // fall-through L, reject j and dispatch O became j, N, q and z), so prose
    // like "Permission N()" would not just go stale, it would name a different
    // function in the very next build.
    description: (v) =>
      `Permission skip-predicate: when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v${v}+)`,
    derive(content) {
      const guards = findAll(
        content,
        `(${ID})=!!(${ID})\\?\\.closest\\("textarea\\.prompt-input"\\)`,
      );
      if (guards.length !== 1) return { matches: guards.length };
      const [, guard, arg] = guards[0];

      const tails = findAll(
        content,
        `${esc(guard)}\\?!1:(${ID})\\(${esc(arg)}\\)`,
      );
      if (tails.length !== 1) return { matches: tails.length };
      const helper = tails[0][1];

      // The event parameter is not in the tail; take it from the sibling branch
      // of the same ternary chain, which tests the shortcut key.
      const before = content.slice(
        Math.max(0, tails[0].index - 400),
        tails[0].index,
      );
      const events = findAll(before, `(${ID})\\.key==="Enter"`);
      if (events.length === 0) {
        return { error: "event parameter not found near the skip-predicate" };
      }
      const last = events[events.length - 1];
      const event = last[1];

      // The anchor spans from that event test through the tail, as raw bytes so
      // whatever sits between them per release is carried verbatim. A tail-only
      // anchor is not version-unambiguous: 7.4.22 renamed just the permission
      // event (U→H) and kept the tail's bytes, so 7.4.21's tail-only anchor
      // still matched while its splice referenced a symbol the build no longer
      // bound there. Starting at the event test pins every identifier the
      // splice references. The tail-only form is kept as `legacy` so entries
      // shipped before the widening still read as covered.
      const prefix = before.slice(last.index);
      const splice =
        `${event}.target?.value?.trim()?(${event}.key==="Enter"&&!${event}.metaKey&&!${event}.ctrlKey||` +
        `${event}.key===" "||${event}.key==="Escape"&&!${event}.shiftKey&&!${event}.ctrlKey):!1:${helper}(${arg})`;

      return {
        original: prefix + tails[0][0],
        patched: `${prefix}${guard}?${splice}`,
        legacy: {
          original: tails[0][0],
          patched: `${guard}?${splice}`,
        },
        symbols: { guard, arg, helper, event },
      };
    },
  },

  // The permission dialog's own Escape handler. What Escape *does* there is
  // Kilo's decision, and it changed in 7.7.0: through 7.6.2 Escape rejected
  // outright (`dispatch(event,"reject")`), and from 7.7.0 it opens the
  // deny-with-feedback box instead (`open(event)`, a one-argument call on a
  // different function). The edit only decides *whether* the handler runs and
  // reproduces its body verbatim, so the body is captured as a brace-free span
  // rather than spelled out, the same treatment doc-escape's "nothing to abort"
  // test gets. Widening there cannot bind a symbol wrongly: every name the
  // patched text writes is the handler, the event, or inside the span.
  shapeRule({
    key: "perm-escape",
    file: "webview.js",
    shape: `(${ID})=(${ID})=>\\{if\\(\\2\\.key==="Escape"\\)\\{([^{}]{0,60}?);return\\}\\}`,
    names: ["handler", "event", "action"],
    build: (m) =>
      `${m[1]}=${m[2]}=>{if(${m[2]}.key==="Escape"&&(${m[2]}.shiftKey||!${m[2]}.target?.value?.trim())){${m[3]};return}}`,
    description: (v) =>
      `Permission Escape: bare Escape reaches the dialog only when the textarea is empty/whitespace-only; Shift+Escape always does (v${v}+)`,
  }),

  // The permission dialog's approve-on-Enter branch. Kilo hangs extra
  // conjuncts on this guard as it gains modes that must not approve (7.7.0
  // added `&&!feedbackOpen()` so Enter inside the deny-feedback box submits the
  // rejection instead), and the edit has to keep them governing the branches it
  // adds, not just Kilo's own. So the conjuncts are captured as a span of
  // `&&!fn()` terms and the disjunction is parenthesised under them; with no
  // such term the shape emits the unwrapped form the pre-7.7.0 entries ship.
  shapeRule({
    key: "perm-approve",
    file: "webview.js",
    shape: `if\\((${ID})\\((${ID})\\)((?:&&!${ID}\\(\\))*)\\)\\{(${ID})\\(\\2,"once"\\);return\\}\\}\\};`,
    names: ["enterCheck", "event", "extraGuards", "dispatch"],
    build: (m) => {
      const ours =
        `${m[1]}(${m[2]})||${m[2]}.key===" "&&!${m[2]}.metaKey&&!${m[2]}.ctrlKey&&!${m[2]}.target?.value?.trim()` +
        `||${m[2]}.key==="Enter"&&(${m[2]}.metaKey||${m[2]}.ctrlKey)`;
      const guard = m[3] ? `(${ours})${m[3]}` : ours;
      return `if(${guard}){${m[4]}(${m[2]},"once");return}}};`;
    },
    description: (v) =>
      `Permission approve: Cmd/Ctrl+Enter approves always; Space approves when empty/whitespace-only (v${v}+)`,
  }),

  // The document-level Escape. Kilo's "nothing to abort" test grows a conjunct
  // whenever it gains something abortable (7.6.0 added `&&!p()?.active` for the
  // goal composed by `/goal`), and the splice references neither that test nor
  // anything inside it, only the event and the store. So the test is captured
  // as a span and reproduced verbatim, pinned at its head by the
  // minifier-immune .submitting()/.status()/"idle" surface and by the store
  // backreference the abort call shares. Spelling the conjuncts out instead
  // would re-break the rule on the next thing Kilo makes abortable, while
  // widening the span cannot bind a symbol wrongly: the two the edit names sit
  // outside it.
  shapeRule({
    key: "doc-escape",
    file: "webview.js",
    shape: `(${ID})\\.key!=="Escape"\\|\\|(!(${ID})\\.submitting\\(\\)&&\\3\\.status\\(\\)==="idle"[^|]{0,80})\\|\\|\\1\\.defaultPrevented\\|\\|\\(\\1\\.preventDefault\\(\\),\\3\\.abort\\(\\)\\)`,
    names: ["event", "nothingToAbort", "store"],
    build: (m) =>
      `${m[1]}.key!=="Escape"||${m[2]}||${m[1]}.defaultPrevented||!${m[1]}.shiftKey&&${m[1]}.target?.value?.trim()||(${m[1]}.preventDefault(),${m[3]}.abort())`,
    description: (v) =>
      `Document Escape: bare Escape does not abort when textarea has non-whitespace content; Shift+Escape aborts (v${v}+)`,
  }),

  shapeRule({
    key: "kiloclaw-edit",
    file: "kiloclaw.js",
    shape: `(${ID})\\((${ID})\\)&&!\\2\\.shiftKey\\?\\(\\2\\.preventDefault\\(\\),(${ID})\\(\\)\\):\\2\\.key==="Escape"&&(${ID})\\(\\)`,
    names: ["enterCheck", "event", "save", "cancel"],
    build: (m) =>
      `${m[1]}(${m[2]})&&(${m[2]}.metaKey||${m[2]}.ctrlKey)?(${m[2]}.preventDefault(),${m[3]}()):${m[2]}.key==="Escape"&&${m[4]}()`,
    description: (v) =>
      `KiloClaw edit: Enter→newline, Cmd/Ctrl+Enter→save (v${v}+)`,
  }),

  shapeRule({
    key: "kiloclaw-chat",
    file: "kiloclaw.js",
    shape: ENTER_SEND_SHAPE,
    names: ["enterCheck", "event", "send"],
    build: enterSendBuild,
    description: (v) =>
      `KiloClaw chat: Enter→newline, Cmd/Ctrl+Enter→send (v${v}+)`,
  }),
];
