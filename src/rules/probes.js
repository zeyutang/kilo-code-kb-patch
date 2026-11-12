// Checks for the harness, which the extension never runs: the probes for the
// patches that store no per-release text, and the stylesheet walker one of
// them reads the cascade with.

const { ID } = require("./engine");

// --- Stylesheet rules, for the probes ----------------------------------------
//
// Enough of CSS to ask which rules can reach an element and what each one
// declares there, for a probe whose question an anchor's match count cannot
// settle: Kilo's stylesheet layers its rules, so the value that renders comes
// from whichever rule wins the cascade, not from the one an anchor found.
// Comments and strings are skipped, an at-rule adds no selector of its own
// (and a keyframe styles no element), and a nested rule's selector is the
// text between the end of the last declaration and its brace, with `&` read
// as the rule it sits in. Each rule comes back as its selector, the compound
// each of its selectors ends in (the element it styles), and its own
// declarations, without those of the rules nested in it.
function stylesheetRules(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  const sheet = () => ({
    at: true,
    skip: false,
    scope: null,
    declarations: "",
  });
  const open = [sheet()];
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\\") {
      // An escaped character is part of a name, whatever it is.
      i++;
    } else if (c === '"' || c === "'") {
      for (i++; i < text.length && text[i] !== c; i++) {
        if (text[i] === "\\") i++;
      }
    } else if (c === "{") {
      const selector = text.slice(from, i).trim();
      const parent = open[open.length - 1];
      open.push(
        selector.startsWith("@")
          ? {
              at: true,
              skip: parent.skip || /^@(?:-\w+-)?keyframes\b/.test(selector),
              scope: parent.scope,
              declarations: "",
            }
          : {
              at: false,
              skip: parent.skip,
              selector,
              scope: subjectsOf(selector, parent.scope),
              declarations: "",
            },
      );
      from = i + 1;
    } else if (c === "}") {
      const rule = open.pop();
      rule.declarations += text.slice(from, i);
      from = i + 1;
      if (!rule.at && !rule.skip) {
        rules.push({
          selector: rule.selector,
          subjects: rule.scope,
          declarations: rule.declarations,
        });
      }
      if (open.length === 0) open.push(sheet());
    } else if (c === ";") {
      open[open.length - 1].declarations += text.slice(from, i + 1);
      from = i + 1;
    }
  }
  return rules;
}

// Each index of a selector that sits outside parentheses and brackets, which
// hide their commas and combinators. An escaped character is part of a name,
// so it is skipped.
function eachTopLevel(selector, visit) {
  let depth = 0;
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (c === "\\") i++;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (depth === 0) visit(i, c);
  }
}

// The compound each selector in a list ends in, with a `&` in it read as
// each compound the enclosing rule ends in.
function subjectsOf(selectorList, scope) {
  const selectors = [];
  let from = 0;
  eachTopLevel(selectorList, (i, c) => {
    if (c !== ",") return;
    selectors.push(selectorList.slice(from, i));
    from = i + 1;
  });
  selectors.push(selectorList.slice(from));
  const subjects = [];
  for (const selector of selectors.map((s) => s.trim())) {
    let start = 0;
    eachTopLevel(selector, (i, c) => {
      if (/[\s>+~]/.test(c)) start = i + 1;
    });
    const subject = selector.slice(start);
    if (subject === "") continue;
    if (scope === null || !subject.includes("&")) {
      subjects.push(subject);
    } else {
      for (const outer of scope) subjects.push(subject.split("&").join(outer));
    }
  }
  return subjects;
}

// Whether a rule whose selector ends in `subject` can style the root of a
// rendered formula, KaTeX's `<span class="katex">`, which carries no other
// class and no attribute. Generous on purpose, since a false alarm costs a
// look and a miss costs the fix: what sits inside a functional pseudo-class is
// not read, so `:not(.katex)` and `:is(.foo)` both still count.
function couldBeKatexRoot(subject) {
  // A pseudo-element is a box of its own, not the span.
  if (/::|:(?:before|after|first-line|first-letter)(?![\w-])/.test(subject)) {
    return false;
  }
  const outside = subject.replace(/\((?:[^()]|\([^()]*\))*\)/g, "()");
  const attributes = [...outside.matchAll(/\[\s*([\w-]+)/g)].map((m) => m[1]);
  const bare = outside.replace(/\[[^\]]*\]/g, "");
  const type = /^(?:[A-Za-z][\w-]*|\*)/.exec(bare)?.[0];
  const classes = [...bare.matchAll(/\.((?:\\.|[\w-])+)/g)].map((m) => m[1]);
  return (
    (type === undefined || type === "*" || type.toLowerCase() === "span") &&
    classes.every((name) => name === "katex") &&
    !bare.includes("#") &&
    attributes.every((name) => name === "class")
  );
}

// Probes are rules that assert a derivation still works without proposing a
// pattern to paste. Two patches need one, and neither stores per-release text
// in src at all. The typography bonus reads three font-size declarations out
// of Kilo's stylesheet at reconcile time, and a build that restructured any of
// them would silently emit fewer rules than the settings asked for. The core
// chat-scroll patch's two blocks apply only while Kilo still looks the way
// they assume (the stylesheet rule for the textarea, the templates and the
// controller threshold for the script), and a build where an anchor moved
// would read "missing" in the status view while stock behavior returned.
// Reporting all of it here turns any of it into a retarget failure instead. A
// probe reads its own file and, for a cross-file check, the other pristine
// bundles; a patch with a block in each file has a probe in each. A probe
// whose block this build no longer needs reads n/a, with the reason.
const PROBES = [
  {
    key: "chat-style",
    file: "webview.css",
    describe: "declarations the typography bonus multiplies",
    read(content, test) {
      // Each anchor must identify one declaration, not merely find one: a
      // second match would mean the value read is whichever comes first, which
      // is a guess. The anchors come from the extension itself so the two
      // cannot drift.
      const ambiguous = Object.entries(test.CHAT_STYLE_ANCHORS)
        .map(([label, re]) => [
          label,
          (content.match(new RegExp(re.source, "g")) ?? []).length,
        ])
        .filter(([, count]) => count !== 1);
      if (ambiguous.length > 0) {
        return {
          error:
            "not exactly one match for: " +
            ambiguous.map(([label, n]) => `${label} (${n}x)`).join(", "),
        };
      }
      const values = test.readChatStyleValues(content);
      if (!values)
        return { error: "anchors matched but no value could be read" };

      // The math knob never derives KaTeX's size, it states an absolute em and
      // treats one value as "leave it alone". That value has to be the one this
      // build actually uses, or the knob switches itself on for users who never
      // touched it, so the two are compared here rather than at runtime.
      const katexEm = Number(
        test.CHAT_STYLE_ANCHORS["katex em size"].exec(content)?.[1],
      );
      if (katexEm !== test.KATEX_DEFAULT_EM) {
        return {
          error:
            `KaTeX now sizes .katex at ${katexEm}em, but KATEX_DEFAULT_EM (and the ` +
            `chatMathFontSizeEm schema default) is ${test.KATEX_DEFAULT_EM}`,
        };
      }
      return { values: { ...values, katexEm } };
    },
  },
  {
    key: "chat-scroll",
    file: "webview.css",
    describe: "what the chat-scroll block assumes about the prompt textarea",
    read(content, test, bundles) {
      const ambiguous = Object.entries(test.CHAT_SCROLL_ANCHORS)
        .map(([label, re]) => [
          label,
          (content.match(new RegExp(re.source, "g")) ?? []).length,
        ])
        .filter(([, count]) => count !== 1);
      if (ambiguous.length > 0) {
        return {
          error:
            "not exactly one match for: " +
            ambiguous.map(([label, n]) => `${label} (${n}x)`).join(", "),
        };
      }
      const sizing = test.readPromptSizing(content);
      if (!sizing)
        return { error: "anchors matched but the sizing could not be read" };

      // With the block in place Kilo's inline height is void, so the only cap
      // on the textarea is the stylesheet's max-height. Kilo's script caps its
      // own measurement too, and the two have agreed so far (200px on every
      // build checked); a build that moved one without the other changes the
      // effective cap under this patch, which is a decision for a human. A
      // build with no measure-then-set script at all is one where the patch
      // may be redundant, or where Kilo now sizes the box some other way that
      // an engine-sized height would fight, so that is a stop too.
      const js = bundles?.["webview.js"];
      if (js === undefined) return { values: sizing };

      // The rule reaches the textarea through two DOM strings the minifier
      // cannot touch, `textarea.prompt-input` inside `.chat-view`. A build
      // that renamed either would leave the block applied and inert while the
      // status view read "patched", since the stylesheet anchors could still
      // match, so the templates are checked here where the bundle is at hand.
      const occurrences = (needle) => js.split(needle).length - 1;
      const templates = {
        "textarea.prompt-input template": occurrences(
          "<textarea class=prompt-input ",
        ),
        ".chat-view template": occurrences("class=chat-view"),
      };
      const moved = Object.entries(templates).filter(([, n]) => n !== 1);
      if (moved.length > 0) {
        return {
          error:
            "webview.js no longer has exactly one " +
            moved.map(([label, n]) => `${label} (${n}x)`).join(", "),
        };
      }
      const caps = [
        ...js.matchAll(
          new RegExp(
            `(${ID})\\.style\\.height=\`\\$\\{Math\\.min\\(\\1\\.scrollHeight,(\\d+)\\)\\}px\``,
            "g",
          ),
        ),
      ].map((m) => `${m[2]}px`);
      if (caps.length === 0) {
        return {
          error:
            "Kilo's measure-then-set auto-resize (height=auto, then Math.min(scrollHeight, cap)) " +
            "is gone from webview.js; re-check whether the chat-scroll block is still needed or safe",
        };
      }
      const disagreeing = caps.filter((cap) => cap !== sizing.maxHeight);
      if (disagreeing.length > 0) {
        return {
          error:
            `Kilo's script caps the textarea at ${[...new Set(caps)].join("/")} ` +
            `but its stylesheet at ${sizing.maxHeight}; the block makes the stylesheet win`,
        };
      }
      return { values: { ...sizing, scriptCapSites: caps.length } };
    },
  },
  {
    key: "math-clip",
    file: "webview.css",
    describe:
      "what the math-clip block assumes about KaTeX and the reasoning peek",
    read(content, test) {
      const counts = Object.fromEntries(
        Object.entries(test.MATH_CLIP_ANCHORS).map(([label, re]) => [
          label,
          (content.match(new RegExp(re.source, "g")) ?? []).length,
        ]),
      );
      const ambiguous = (labels) => {
        const off = labels.filter((label) => counts[label] !== 1);
        return off.length === 0
          ? undefined
          : {
              error:
                "not exactly one match for: " +
                off.map((label) => `${label} (${counts[label]}x)`).join(", "),
            };
      };

      // From KaTeX 0.16.40 (KaTeX#4170) KaTeX's own root rule declares the
      // position the block adds, and Kilo's chat stylesheet carries it from
      // 7.8.7, where the extension writes no block and reads the row as not
      // needed. That is a fact about the build rather than a failure, so it
      // reads n/a, once the extension's own check is widened: the extension
      // asks whether a rule on `.katex` takes the position back out, and this
      // asks it of every rule whose selector can reach a formula's root,
      // since KaTeX's rules sit in `@layer base` and lose to any rule that is
      // unlayered or in a later layer. The reasoning peek does not enter into
      // it, because a formula that contains its own twin is clipped by
      // whatever clips the formula.
      if (!test.FEATURE_GATES["math-clip"](content)) {
        const moved = ambiguous(["katex mathml twin", "katex root"]);
        if (moved) return moved;
        const undoing = stylesheetRules(content).filter(
          (rule) =>
            rule.subjects.some(couldBeKatexRoot) &&
            test.KATEX_UNPOSITIONING.test(rule.declarations),
        );
        if (undoing.length > 0) {
          return {
            error:
              "KaTeX's .katex rule declares position:relative, but a rule can " +
              "leave a formula's root unpositioned: " +
              undoing.map((rule) => rule.selector).join(", "),
          };
        }
        return {
          na:
            "KaTeX's own .katex rule declares the position the block adds " +
            "(KaTeX 0.16.40 and later), so the block is not needed",
        };
      }

      // The rule adds one declaration to `.katex`, so what has to hold is that
      // KaTeX still hides its MathML twin out of flow, that `.katex` carries no
      // position of its own, and that the clipped surface the leak was measured
      // in is still shaped that way. The anchors come from the extension itself
      // so the two cannot drift.
      const moved = ambiguous(Object.keys(counts));
      if (moved) return moved;
      const clip = test.readMathClip(content);
      if (!clip) {
        const root = test.MATH_CLIP_ANCHORS["katex root"].exec(content)[0];
        return {
          error: /position:/.test(root)
            ? "KaTeX's .katex rule declares a position the extension does not read " +
              "as the fix (not relative, or a rule on .katex takes it back out), so " +
              "it neither writes the block nor calls it unneeded"
            : "anchors matched but the extension would not write the block",
        };
      }
      // Reported rather than asserted: a peek box that became a containing
      // block of its own would fix that one surface upstream, and the rule
      // would still be earning its place on Kilo's other clipped boxes.
      const peek = test.MATH_CLIP_ANCHORS["reasoning peek"].exec(content)[0];
      return { values: { ...clip, peekPositioned: /position:/.test(peek) } };
    },
  },
  {
    key: "chat-scroll",
    file: "webview.js",
    describe: "what the chat-scroll script block assumes about the chat view",
    read(content, test) {
      // The script reaches the DOM through three class names and mirrors the
      // controller's default threshold. Each must occur exactly once, which is
      // also what the extension requires before writing the block, so a build
      // that fails here would read "missing" in the status view rather than
      // carry a script that finds nothing. The anchors come from the extension
      // itself so the two cannot drift.
      const ambiguous = Object.entries(test.CHAT_SCROLL_SCRIPT_ANCHORS)
        .map(([label, re]) => [
          label,
          (content.match(new RegExp(re.source, "g")) ?? []).length,
        ])
        .filter(([, count]) => count !== 1);
      if (ambiguous.length > 0) {
        return {
          error:
            "not exactly one match for: " +
            ambiguous.map(([label, n]) => `${label} (${n}x)`).join(", "),
        };
      }
      const threshold = test.readScrollThreshold(content);
      if (threshold === undefined) {
        return { error: "anchors matched but the threshold could not be read" };
      }
      // The chat view creates its controller without a threshold of its own,
      // so the default is the one in force. A call site that passed one would
      // leave the script and the controller disagreeing on what "at the
      // bottom" means, which is a decision for a human.
      const overridden = (content.match(/bottomThreshold:/g) ?? []).length;
      if (overridden > 0) {
        return {
          error:
            `${overridden} controller call site(s) pass a bottomThreshold of their own; ` +
            "the script mirrors the default only",
        };
      }
      return { values: { threshold } };
    },
  },
  {
    key: "hover-guard",
    file: "webview.js",
    describe: "what the hover-guard script block assumes about the chat view",
    read(content, test) {
      // The script reaches the chat textarea through the same two templates
      // as the chat-scroll script and asks nothing else of Kilo: it stops
      // events the engine synthesizes, not anything Kilo dispatches. Each must
      // occur exactly once, which is also what the extension requires before
      // writing the block. The counts reported alongside are the handler sites
      // the guard is there for (rows that highlight on mouseenter, tooltip and
      // list-item triggers on pointerenter), so a Kilo that moved its menus or
      // tooltips off enter events shows up in the log without failing the
      // probe: the block is harmless where it has nothing to stop.
      const ambiguous = Object.entries(test.HOVER_GUARD_ANCHORS)
        .map(([label, re]) => [
          label,
          (content.match(new RegExp(re.source, "g")) ?? []).length,
        ])
        .filter(([, count]) => count !== 1);
      if (ambiguous.length > 0) {
        return {
          error:
            "not exactly one match for: " +
            ambiguous.map(([label, n]) => `${label} (${n}x)`).join(", "),
        };
      }
      if (!test.hoverGuardAnchorsPresent(content)) {
        return {
          error: "anchors matched but the extension would not write the block",
        };
      }
      const occurrences = (needle) => content.split(needle).length - 1;
      return {
        values: {
          mouseenterListeners: occurrences('addEventListener("mouseenter"'),
          pointerEnterProps: occurrences("onPointerEnter:"),
        },
      };
    },
  },
];

module.exports = {
  stylesheetRules,
  couldBeKatexRoot,
  PROBES,
};
