// Both permission edits are expressions whose correctness is in how they
// *evaluate*, and 7.7.0 changed what they have to compose with: Escape now
// opens Kilo's deny-with-feedback box instead of denying, and the approve
// branch grew a conjunct so Enter inside that box submits the rejection.
// The perm-approve edit adds two branches under that conjunct, which is
// only right if the parenthesisation holds; a splice that dropped it would
// still derive, apply, parse and restore, and would approve a tool while
// the user was typing a reason for denying it. So the shipped text itself
// is evaluated here rather than a copy of it, the way the raw-markdown
// section pulls the real onClick off its splice.

const { check } = require("../lib/cli");
const { RULES } = require("../lib/rules");

module.exports = {
  needs: [],
  run({ pristine }) {
    console.log("\npermission keys (what the patched expressions decide)");
    {
      const ev = (o) => ({
        key: "Escape",
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        ...o,
      });
      const empty = { value: "" };
      const spaces = { value: "   \n" };
      const text = { value: "hi" };

      const escapeRule = RULES.find((r) => r.key === "perm-escape");
      const escape = escapeRule.derive(pristine["webview.js"]);
      if (escape.original === undefined) {
        check(false, "perm-escape derives a site to evaluate");
      } else {
        const { handler, event, action } = escape.symbols;
        // The captured action calls into the enclosing scope, so every name it
        // mentions is stubbed to record that the dialog was reached.
        const named = [
          ...new Set(action.match(/[A-Za-z_$][\w$]*/g) ?? []),
        ].filter((n) => n !== event);
        const build = new Function(
          "calls",
          `let ${handler};const ${named
            .map((n) => `${n}=()=>calls.push("${n}")`)
            .join(",")};${escape.patched};return ${handler};`,
        );
        const calls = [];
        const fn = build(calls);
        const reaches = (e) => {
          calls.length = 0;
          fn(e);
          return calls.length > 0;
        };
        check(
          reaches(ev({ target: empty })),
          "Escape acts when the chat box is empty",
        );
        check(
          reaches(ev({ target: spaces })),
          "Escape acts when the chat box holds only whitespace",
        );
        check(
          !reaches(ev({ target: text })),
          "Escape does not act when the chat box holds text",
        );
        check(
          reaches(ev({ target: text, shiftKey: true })),
          "Shift+Escape acts even when the chat box holds text",
        );
        // Focus sits on a dialog button often enough that this is the common
        // case, and a button has no value for the guard to read.
        check(
          reaches(ev({ target: {} })),
          "Escape acts with focus on a button",
        );
        check(
          !reaches(ev({ key: "Enter", target: empty })),
          "a key other than Escape is left alone",
        );
      }

      const approveRule = RULES.find((r) => r.key === "perm-approve");
      const approve = approveRule.derive(pristine["webview.js"]);
      if (approve.original === undefined) {
        check(false, "perm-approve derives a site to evaluate");
      } else {
        const { enterCheck, event, extraGuards, dispatch } = approve.symbols;
        const head = approve.patched.indexOf("if(") + 3;
        const tail = approve.patched.indexOf(`){${dispatch}(`);
        const guard = approve.patched.slice(head, tail);
        const extras = [
          ...new Set((extraGuards ?? "").match(/[A-Za-z_$][\w$]*/g) ?? []),
        ];
        const approves = (
          e,
          { bareEnter = false, feedbackOpen = false } = {},
        ) =>
          new Function(
            event,
            `const ${enterCheck}=()=>${bareEnter};` +
              (extras.length
                ? `const ${extras
                    .map((n) => `${n}=()=>${feedbackOpen}`)
                    .join(",")};`
                : "") +
              `return !!(${guard});`,
          )(e);
        check(
          approves(ev({ key: "Enter", target: empty }), { bareEnter: true }),
          "bare Enter approves when the chat box is empty",
        );
        check(
          approves(ev({ key: " ", target: empty })),
          "Space approves when the chat box is empty",
        );
        check(
          !approves(ev({ key: " ", target: text })),
          "Space does not approve when the chat box holds text",
        );
        check(
          approves(ev({ key: "Enter", metaKey: true, target: text })),
          "Cmd+Enter approves whatever the chat box holds",
        );
        check(
          approves(ev({ key: "Enter", ctrlKey: true, target: text })),
          "Ctrl+Enter approves whatever the chat box holds",
        );
        check(
          !approves(ev({ key: "Escape", target: empty })),
          "Escape never approves",
        );
        if (extras.length === 0) {
          console.log(
            "  n/a   this build has no extra approve guard to respect",
          );
        } else {
          // The parenthesisation is the whole point: each added branch has to
          // sit under Kilo's conjunct, not beside it.
          check(
            !approves(ev({ key: "Enter", target: empty }), {
              bareEnter: true,
              feedbackOpen: true,
            }),
            "bare Enter does not approve while the feedback box is open",
          );
          check(
            !approves(ev({ key: " ", target: empty }), { feedbackOpen: true }),
            "Space does not approve while the feedback box is open",
          );
          check(
            !approves(ev({ key: "Enter", metaKey: true, target: text }), {
              feedbackOpen: true,
            }),
            "Cmd/Ctrl+Enter does not approve while the feedback box is open",
          );
        }
      }
    }
  },
};
