// Shape rules: how to re-derive every patch pattern from a Kilo bundle.
//
// The premise, borne out by every retarget so far, is that the *shape* of each
// patch point is stable across releases while the minified identifiers churn
// (7.4.17 moved Zm/ua/st to ng/aa/ct without changing a single expression's
// structure). So each rule states the shape as a regex over identifier
// placeholders, and rebuilds both `original` (the literal matched text) and
// `patched` (the same expression with our edit) from the captured symbols.
//
// Rules are also anchored on strings the minifier cannot touch: DOM selectors
// ("textarea.prompt-input"), i18n keys, and Kilo's own API surface (.abort(),
// .status(), selectMention — property names survive minification). Those
// literals are what makes the derivation stable; identifier names never appear
// in a rule, and that includes receivers: the store local `t` and the
// indexing-status accessor `r` each looked permanent until a release renamed
// one of them (`r`→`a` in 7.4.21), so every identifier is a captured group.
//
// A rule reports one of three outcomes, and the harness treats anything but a
// unique match as "needs a human", never as a silent guess:
//   { original, patched, symbols }  exactly one match, pattern derived
//   { matches: n }                  0 or >1 matches; the shape moved or aliased
//   { error }                       a sub-anchor inside the shape went missing
//
// A derived result may also carry `hops`, the further matches a rule read a
// symbol from when the edit names something its anchor does not contain, and
// `data`, values the edit writes that are not names in the bundle's scope (a
// glyph key, say). The extension derives at apply only when every symbol is a
// whole token of the anchor or of a hop, and every hop lies near the edit.

const {
  ID,
  esc,
  countIn,
  replaceLiteral,
  longestLiteral,
  withoutPrefilter,
  findAll,
} = require("./engine");
const { HISTORY_DECLARATIONS_LIMIT, RULES } = require("./core");
const {
  ATTACH_RULE,
  mathExtensions,
  MATH_RULE,
  RAW_MARKDOWN_RULE,
} = require("./bonus");

module.exports = {
  RULES,
  ATTACH_RULE,
  MATH_RULE,
  RAW_MARKDOWN_RULE,
  mathExtensions,
  ID,
  esc,
  countIn,
  replaceLiteral,
  findAll,
  withoutPrefilter,
  longestLiteral,
  HISTORY_DECLARATIONS_LIMIT,
};
