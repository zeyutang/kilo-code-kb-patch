// The reviewed variants of the math-rendering splice, newest first.

import type { WebviewVariant } from "../core/features";

// --- Bonus math-rendering knob ----------------------------------------------
// Kilo already renders math: its webview bundles KaTeX 0.16.x outright and
// registers three `marked` extensions for it, `$$\n...\n$$` at block level,
// `$$...$$` inline and `\(...\)` inline, all of which route through one helper that
// wraps katex.renderToString in a `<span dir="auto">`. What it does not
// register is single-dollar `$...$`, by far the most common way to write inline
// math, nor `\[...\]`, the display counterpart of the `\(...\)` it does support.
// This bonus adds those three extensions to the same pack, so the two shipped
// forms keep working untouched and the two missing ones start rendering.
//
// Nothing else is needed for them to display: the KaTeX stylesheet and its
// @font-face rules are already inlined in dist/webview.css with the woff2/woff/
// ttf files alongside it, the webview's CSP allows `font-src` from the
// extension, and Kilo's DOMPurify pass runs with both the `html` and `mathMl`
// profiles (so `<span>`, `class` and `style`, plus MathML, all survive).
//
// Single-dollar math is off by default for a reason: `$5 and $10` is a real
// sentence, and a naive `$...$` tokenizer eats it. The regex therefore refuses a
// delimiter next to whitespace or another `$`, refuses a newline inside, and
// refuses a closing `$` followed by a digit, which is the same guard set
// markdown-it-katex uses. `tools/behavior.js` drives all of this through the
// build's own bundled `marked`, so the currency cases are asserted rather than
// assumed.
//
// The anchor is the tail of Kilo's own katex extension pack: the second
// extension's renderer plus the `]});` that closes the array and the use()
// call. Two properties make that the right span. It is the shortest one that
// still pins the render helper, which is the only symbol the injected code
// references, and it contains no other minified name (the parameter is `n` in
// every build checked, and the two `$$` regex variables sit outside it), so a
// release that renames only those regexes still matches. Splicing after the
// last extension rather than before the first is deliberate too: marked's
// use() *unshifts* each extension's tokenizer, so registering last means being
// tried first, and the `$...$` regex is written to fail immediately on `$$` so
// that Kilo's own `$$...$$` extension keeps priority anyway.
// One entry per spelling of the render helper. It churns in webview.js (bR in
// 7.5.6, MR in 7.5.8, RR in 7.5.11 through 7.5.15, qR in 7.5.16) while the
// rest of the span is byte-stable, so these four entries cover every release
// from 7.5.6 on.
// Note this is the first patch site where 7.5.11 and 7.5.14 could have
// differed and did not, even though they ship distinct bundles.
//
// Unlike the attach button, a patched string here does not contain its own
// original: the splice lands between the last renderer and the `]});` that
// closed it, and every injected local is `_`-prefixed, so nothing in the
// injected text reproduces the original span. That is load-bearing rather than
// incidental. Reusing the parameter name `n` would end the last extension with
// exactly the original's bytes and make a patched bundle read as pristine.
export const MATH_EXTENSIONS: WebviewVariant[] = [
  {
    // v7.8.2+ (7.8.3 ships the same bundle): the render helper HQ→ZQ.
    // Nothing else in the tail anchor moved.
    original:
      "renderer(n){return ZQ(n.text,{displayMode:!0,throwOnError:!1})}}]});",
    patched:
      'renderer(n){return ZQ(n.text,{displayMode:!0,throwOnError:!1})}},{name:"kbpKatexInlineDollar",level:"inline",start(_e){let _i=_e.indexOf("$");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\$([^\\s$](?:[^$\\n]*?[^\\s$])?)\\$(?!\\d)/);if(_m)return{type:"kbpKatexInlineDollar",raw:_m[0],text:_m[1].trim()}},renderer(_n){return ZQ(_n.text,{displayMode:!1,throwOnError:!1})}},{name:"kbpKatexBlockBracket",level:"block",tokenizer(_e){let _m=_e.match(/^\\\\\\[([\\s\\S]+?)\\\\\\](?:\\n|$)/);if(_m&&_m[1].trim())return{type:"kbpKatexBlockBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return ZQ(_n.text,{displayMode:!0,throwOnError:!1})+"\\n"}},{name:"kbpKatexInlineBracket",level:"inline",start(_e){let _i=_e.indexOf("\\\\[");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\\\\\[((?:\\\\.|[^\\\\\\n])*?)\\\\\\]/);if(_m&&_m[1].trim())return{type:"kbpKatexInlineBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return ZQ(_n.text,{displayMode:!0,throwOnError:!1})}}]});',
  },
  {
    // v7.7.12+ (7.8.0 and 7.8.1 carry the same helper): the render
    // helper VQ→HQ. Nothing else in the tail anchor moved.
    original:
      "renderer(n){return HQ(n.text,{displayMode:!0,throwOnError:!1})}}]});",
    patched:
      'renderer(n){return HQ(n.text,{displayMode:!0,throwOnError:!1})}},{name:"kbpKatexInlineDollar",level:"inline",start(_e){let _i=_e.indexOf("$");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\$([^\\s$](?:[^$\\n]*?[^\\s$])?)\\$(?!\\d)/);if(_m)return{type:"kbpKatexInlineDollar",raw:_m[0],text:_m[1].trim()}},renderer(_n){return HQ(_n.text,{displayMode:!1,throwOnError:!1})}},{name:"kbpKatexBlockBracket",level:"block",tokenizer(_e){let _m=_e.match(/^\\\\\\[([\\s\\S]+?)\\\\\\](?:\\n|$)/);if(_m&&_m[1].trim())return{type:"kbpKatexBlockBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return HQ(_n.text,{displayMode:!0,throwOnError:!1})+"\\n"}},{name:"kbpKatexInlineBracket",level:"inline",start(_e){let _i=_e.indexOf("\\\\[");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\\\\\[((?:\\\\.|[^\\\\\\n])*?)\\\\\\]/);if(_m&&_m[1].trim())return{type:"kbpKatexInlineBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return HQ(_n.text,{displayMode:!0,throwOnError:!1})}}]});',
  },
  {
    // v7.7.9: the render helper UQ→VQ.
    original:
      "renderer(n){return VQ(n.text,{displayMode:!0,throwOnError:!1})}}]});",
    patched:
      'renderer(n){return VQ(n.text,{displayMode:!0,throwOnError:!1})}},{name:"kbpKatexInlineDollar",level:"inline",start(_e){let _i=_e.indexOf("$");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\$([^\\s$](?:[^$\\n]*?[^\\s$])?)\\$(?!\\d)/);if(_m)return{type:"kbpKatexInlineDollar",raw:_m[0],text:_m[1].trim()}},renderer(_n){return VQ(_n.text,{displayMode:!1,throwOnError:!1})}},{name:"kbpKatexBlockBracket",level:"block",tokenizer(_e){let _m=_e.match(/^\\\\\\[([\\s\\S]+?)\\\\\\](?:\\n|$)/);if(_m&&_m[1].trim())return{type:"kbpKatexBlockBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return VQ(_n.text,{displayMode:!0,throwOnError:!1})+"\\n"}},{name:"kbpKatexInlineBracket",level:"inline",start(_e){let _i=_e.indexOf("\\\\[");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\\\\\[((?:\\\\.|[^\\\\\\n])*?)\\\\\\]/);if(_m&&_m[1].trim())return{type:"kbpKatexInlineBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return VQ(_n.text,{displayMode:!0,throwOnError:!1})}}]});',
  },
  {
    // v7.7.6+ (7.7.7 carries the same helper): the render helper
    // zQ→UQ.
    original:
      "renderer(n){return UQ(n.text,{displayMode:!0,throwOnError:!1})}}]});",
    patched:
      'renderer(n){return UQ(n.text,{displayMode:!0,throwOnError:!1})}},{name:"kbpKatexInlineDollar",level:"inline",start(_e){let _i=_e.indexOf("$");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\$([^\\s$](?:[^$\\n]*?[^\\s$])?)\\$(?!\\d)/);if(_m)return{type:"kbpKatexInlineDollar",raw:_m[0],text:_m[1].trim()}},renderer(_n){return UQ(_n.text,{displayMode:!1,throwOnError:!1})}},{name:"kbpKatexBlockBracket",level:"block",tokenizer(_e){let _m=_e.match(/^\\\\\\[([\\s\\S]+?)\\\\\\](?:\\n|$)/);if(_m&&_m[1].trim())return{type:"kbpKatexBlockBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return UQ(_n.text,{displayMode:!0,throwOnError:!1})+"\\n"}},{name:"kbpKatexInlineBracket",level:"inline",start(_e){let _i=_e.indexOf("\\\\[");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\\\\\[((?:\\\\.|[^\\\\\\n])*?)\\\\\\]/);if(_m&&_m[1].trim())return{type:"kbpKatexInlineBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return UQ(_n.text,{displayMode:!0,throwOnError:!1})}}]});',
  },
  {
    // v7.7.5: the render helper NQ→zQ. Nothing else in the tail anchor moved,
    // and 7.7.4 still carries NQ, so that build reads off the v7.7.3 entry
    // below and only 7.7.5 needs one of its own.
    original:
      "renderer(n){return zQ(n.text,{displayMode:!0,throwOnError:!1})}}]});",
    patched:
      'renderer(n){return zQ(n.text,{displayMode:!0,throwOnError:!1})}},{name:"kbpKatexInlineDollar",level:"inline",start(_e){let _i=_e.indexOf("$");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\$([^\\s$](?:[^$\\n]*?[^\\s$])?)\\$(?!\\d)/);if(_m)return{type:"kbpKatexInlineDollar",raw:_m[0],text:_m[1].trim()}},renderer(_n){return zQ(_n.text,{displayMode:!1,throwOnError:!1})}},{name:"kbpKatexBlockBracket",level:"block",tokenizer(_e){let _m=_e.match(/^\\\\\\[([\\s\\S]+?)\\\\\\](?:\\n|$)/);if(_m&&_m[1].trim())return{type:"kbpKatexBlockBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return zQ(_n.text,{displayMode:!0,throwOnError:!1})+"\\n"}},{name:"kbpKatexInlineBracket",level:"inline",start(_e){let _i=_e.indexOf("\\\\[");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\\\\\[((?:\\\\.|[^\\\\\\n])*?)\\\\\\]/);if(_m&&_m[1].trim())return{type:"kbpKatexInlineBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return zQ(_n.text,{displayMode:!0,throwOnError:!1})}}]});',
  },
  {
    // v7.7.3: the render helper fQ→NQ. Nothing else in the tail anchor moved.
    original:
      "renderer(n){return NQ(n.text,{displayMode:!0,throwOnError:!1})}}]});",
    patched:
      'renderer(n){return NQ(n.text,{displayMode:!0,throwOnError:!1})}},{name:"kbpKatexInlineDollar",level:"inline",start(_e){let _i=_e.indexOf("$");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\$([^\\s$](?:[^$\\n]*?[^\\s$])?)\\$(?!\\d)/);if(_m)return{type:"kbpKatexInlineDollar",raw:_m[0],text:_m[1].trim()}},renderer(_n){return NQ(_n.text,{displayMode:!1,throwOnError:!1})}},{name:"kbpKatexBlockBracket",level:"block",tokenizer(_e){let _m=_e.match(/^\\\\\\[([\\s\\S]+?)\\\\\\](?:\\n|$)/);if(_m&&_m[1].trim())return{type:"kbpKatexBlockBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return NQ(_n.text,{displayMode:!0,throwOnError:!1})+"\\n"}},{name:"kbpKatexInlineBracket",level:"inline",start(_e){let _i=_e.indexOf("\\\\[");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\\\\\[((?:\\\\.|[^\\\\\\n])*?)\\\\\\]/);if(_m&&_m[1].trim())return{type:"kbpKatexInlineBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return NQ(_n.text,{displayMode:!0,throwOnError:!1})}}]});',
  },
  {
    // v7.7.2: the render helper cQ→fQ. Nothing else in the tail anchor moved.
    original:
      "renderer(n){return fQ(n.text,{displayMode:!0,throwOnError:!1})}}]});",
    patched:
      'renderer(n){return fQ(n.text,{displayMode:!0,throwOnError:!1})}},{name:"kbpKatexInlineDollar",level:"inline",start(_e){let _i=_e.indexOf("$");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\$([^\\s$](?:[^$\\n]*?[^\\s$])?)\\$(?!\\d)/);if(_m)return{type:"kbpKatexInlineDollar",raw:_m[0],text:_m[1].trim()}},renderer(_n){return fQ(_n.text,{displayMode:!1,throwOnError:!1})}},{name:"kbpKatexBlockBracket",level:"block",tokenizer(_e){let _m=_e.match(/^\\\\\\[([\\s\\S]+?)\\\\\\](?:\\n|$)/);if(_m&&_m[1].trim())return{type:"kbpKatexBlockBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return fQ(_n.text,{displayMode:!0,throwOnError:!1})+"\\n"}},{name:"kbpKatexInlineBracket",level:"inline",start(_e){let _i=_e.indexOf("\\\\[");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\\\\\[((?:\\\\.|[^\\\\\\n])*?)\\\\\\]/);if(_m&&_m[1].trim())return{type:"kbpKatexInlineBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return fQ(_n.text,{displayMode:!0,throwOnError:!1})}}]});',
  },
  {
    // v7.7.1: the render helper sQ→cQ. Nothing else in the tail anchor moved.
    original:
      "renderer(n){return cQ(n.text,{displayMode:!0,throwOnError:!1})}}]});",
    patched:
      'renderer(n){return cQ(n.text,{displayMode:!0,throwOnError:!1})}},{name:"kbpKatexInlineDollar",level:"inline",start(_e){let _i=_e.indexOf("$");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\$([^\\s$](?:[^$\\n]*?[^\\s$])?)\\$(?!\\d)/);if(_m)return{type:"kbpKatexInlineDollar",raw:_m[0],text:_m[1].trim()}},renderer(_n){return cQ(_n.text,{displayMode:!1,throwOnError:!1})}},{name:"kbpKatexBlockBracket",level:"block",tokenizer(_e){let _m=_e.match(/^\\\\\\[([\\s\\S]+?)\\\\\\](?:\\n|$)/);if(_m&&_m[1].trim())return{type:"kbpKatexBlockBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return cQ(_n.text,{displayMode:!0,throwOnError:!1})+"\\n"}},{name:"kbpKatexInlineBracket",level:"inline",start(_e){let _i=_e.indexOf("\\\\[");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\\\\\[((?:\\\\.|[^\\\\\\n])*?)\\\\\\]/);if(_m&&_m[1].trim())return{type:"kbpKatexInlineBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return cQ(_n.text,{displayMode:!0,throwOnError:!1})}}]});',
  },
  {
    // v7.7.0: the render helper rQ→sQ. Nothing else in the tail anchor moved.
    original:
      "renderer(n){return sQ(n.text,{displayMode:!0,throwOnError:!1})}}]});",
    patched:
      'renderer(n){return sQ(n.text,{displayMode:!0,throwOnError:!1})}},{name:"kbpKatexInlineDollar",level:"inline",start(_e){let _i=_e.indexOf("$");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\$([^\\s$](?:[^$\\n]*?[^\\s$])?)\\$(?!\\d)/);if(_m)return{type:"kbpKatexInlineDollar",raw:_m[0],text:_m[1].trim()}},renderer(_n){return sQ(_n.text,{displayMode:!1,throwOnError:!1})}},{name:"kbpKatexBlockBracket",level:"block",tokenizer(_e){let _m=_e.match(/^\\\\\\[([\\s\\S]+?)\\\\\\](?:\\n|$)/);if(_m&&_m[1].trim())return{type:"kbpKatexBlockBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return sQ(_n.text,{displayMode:!0,throwOnError:!1})+"\\n"}},{name:"kbpKatexInlineBracket",level:"inline",start(_e){let _i=_e.indexOf("\\\\[");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\\\\\[((?:\\\\.|[^\\\\\\n])*?)\\\\\\]/);if(_m&&_m[1].trim())return{type:"kbpKatexInlineBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return sQ(_n.text,{displayMode:!0,throwOnError:!1})}}]});',
  },
  // v7.6.1: the render helper eQ→rQ. Nothing else in the tail anchor moved.
  {
    original:
      "renderer(n){return rQ(n.text,{displayMode:!0,throwOnError:!1})}}]});",
    patched:
      'renderer(n){return rQ(n.text,{displayMode:!0,throwOnError:!1})}},{name:"kbpKatexInlineDollar",level:"inline",start(_e){let _i=_e.indexOf("$");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\$([^\\s$](?:[^$\\n]*?[^\\s$])?)\\$(?!\\d)/);if(_m)return{type:"kbpKatexInlineDollar",raw:_m[0],text:_m[1].trim()}},renderer(_n){return rQ(_n.text,{displayMode:!1,throwOnError:!1})}},{name:"kbpKatexBlockBracket",level:"block",tokenizer(_e){let _m=_e.match(/^\\\\\\[([\\s\\S]+?)\\\\\\](?:\\n|$)/);if(_m&&_m[1].trim())return{type:"kbpKatexBlockBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return rQ(_n.text,{displayMode:!0,throwOnError:!1})+"\\n"}},{name:"kbpKatexInlineBracket",level:"inline",start(_e){let _i=_e.indexOf("\\\\[");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\\\\\[((?:\\\\.|[^\\\\\\n])*?)\\\\\\]/);if(_m&&_m[1].trim())return{type:"kbpKatexInlineBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return rQ(_n.text,{displayMode:!0,throwOnError:!1})}}]});',
  },
  // v7.6.0: the render helper qR→eQ. Nothing else in the tail anchor moved.
  {
    original:
      "renderer(n){return eQ(n.text,{displayMode:!0,throwOnError:!1})}}]});",
    patched:
      'renderer(n){return eQ(n.text,{displayMode:!0,throwOnError:!1})}},{name:"kbpKatexInlineDollar",level:"inline",start(_e){let _i=_e.indexOf("$");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\$([^\\s$](?:[^$\\n]*?[^\\s$])?)\\$(?!\\d)/);if(_m)return{type:"kbpKatexInlineDollar",raw:_m[0],text:_m[1].trim()}},renderer(_n){return eQ(_n.text,{displayMode:!1,throwOnError:!1})}},{name:"kbpKatexBlockBracket",level:"block",tokenizer(_e){let _m=_e.match(/^\\\\\\[([\\s\\S]+?)\\\\\\](?:\\n|$)/);if(_m&&_m[1].trim())return{type:"kbpKatexBlockBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return eQ(_n.text,{displayMode:!0,throwOnError:!1})+"\\n"}},{name:"kbpKatexInlineBracket",level:"inline",start(_e){let _i=_e.indexOf("\\\\[");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\\\\\[((?:\\\\.|[^\\\\\\n])*?)\\\\\\]/);if(_m&&_m[1].trim())return{type:"kbpKatexInlineBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return eQ(_n.text,{displayMode:!0,throwOnError:!1})}}]});',
  },
  {
    original:
      "renderer(n){return qR(n.text,{displayMode:!0,throwOnError:!1})}}]});",
    patched:
      'renderer(n){return qR(n.text,{displayMode:!0,throwOnError:!1})}},{name:"kbpKatexInlineDollar",level:"inline",start(_e){let _i=_e.indexOf("$");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\$([^\\s$](?:[^$\\n]*?[^\\s$])?)\\$(?!\\d)/);if(_m)return{type:"kbpKatexInlineDollar",raw:_m[0],text:_m[1].trim()}},renderer(_n){return qR(_n.text,{displayMode:!1,throwOnError:!1})}},{name:"kbpKatexBlockBracket",level:"block",tokenizer(_e){let _m=_e.match(/^\\\\\\[([\\s\\S]+?)\\\\\\](?:\\n|$)/);if(_m&&_m[1].trim())return{type:"kbpKatexBlockBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return qR(_n.text,{displayMode:!0,throwOnError:!1})+"\\n"}},{name:"kbpKatexInlineBracket",level:"inline",start(_e){let _i=_e.indexOf("\\\\[");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\\\\\[((?:\\\\.|[^\\\\\\n])*?)\\\\\\]/);if(_m&&_m[1].trim())return{type:"kbpKatexInlineBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return qR(_n.text,{displayMode:!0,throwOnError:!1})}}]});',
  },
  {
    original:
      "renderer(n){return RR(n.text,{displayMode:!0,throwOnError:!1})}}]});",
    patched:
      'renderer(n){return RR(n.text,{displayMode:!0,throwOnError:!1})}},{name:"kbpKatexInlineDollar",level:"inline",start(_e){let _i=_e.indexOf("$");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\$([^\\s$](?:[^$\\n]*?[^\\s$])?)\\$(?!\\d)/);if(_m)return{type:"kbpKatexInlineDollar",raw:_m[0],text:_m[1].trim()}},renderer(_n){return RR(_n.text,{displayMode:!1,throwOnError:!1})}},{name:"kbpKatexBlockBracket",level:"block",tokenizer(_e){let _m=_e.match(/^\\\\\\[([\\s\\S]+?)\\\\\\](?:\\n|$)/);if(_m&&_m[1].trim())return{type:"kbpKatexBlockBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return RR(_n.text,{displayMode:!0,throwOnError:!1})+"\\n"}},{name:"kbpKatexInlineBracket",level:"inline",start(_e){let _i=_e.indexOf("\\\\[");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\\\\\[((?:\\\\.|[^\\\\\\n])*?)\\\\\\]/);if(_m&&_m[1].trim())return{type:"kbpKatexInlineBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return RR(_n.text,{displayMode:!0,throwOnError:!1})}}]});',
  },
  {
    original:
      "renderer(n){return MR(n.text,{displayMode:!0,throwOnError:!1})}}]});",
    patched:
      'renderer(n){return MR(n.text,{displayMode:!0,throwOnError:!1})}},{name:"kbpKatexInlineDollar",level:"inline",start(_e){let _i=_e.indexOf("$");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\$([^\\s$](?:[^$\\n]*?[^\\s$])?)\\$(?!\\d)/);if(_m)return{type:"kbpKatexInlineDollar",raw:_m[0],text:_m[1].trim()}},renderer(_n){return MR(_n.text,{displayMode:!1,throwOnError:!1})}},{name:"kbpKatexBlockBracket",level:"block",tokenizer(_e){let _m=_e.match(/^\\\\\\[([\\s\\S]+?)\\\\\\](?:\\n|$)/);if(_m&&_m[1].trim())return{type:"kbpKatexBlockBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return MR(_n.text,{displayMode:!0,throwOnError:!1})+"\\n"}},{name:"kbpKatexInlineBracket",level:"inline",start(_e){let _i=_e.indexOf("\\\\[");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\\\\\[((?:\\\\.|[^\\\\\\n])*?)\\\\\\]/);if(_m&&_m[1].trim())return{type:"kbpKatexInlineBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return MR(_n.text,{displayMode:!0,throwOnError:!1})}}]});',
  },
  {
    original:
      "renderer(n){return bR(n.text,{displayMode:!0,throwOnError:!1})}}]});",
    patched:
      'renderer(n){return bR(n.text,{displayMode:!0,throwOnError:!1})}},{name:"kbpKatexInlineDollar",level:"inline",start(_e){let _i=_e.indexOf("$");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\$([^\\s$](?:[^$\\n]*?[^\\s$])?)\\$(?!\\d)/);if(_m)return{type:"kbpKatexInlineDollar",raw:_m[0],text:_m[1].trim()}},renderer(_n){return bR(_n.text,{displayMode:!1,throwOnError:!1})}},{name:"kbpKatexBlockBracket",level:"block",tokenizer(_e){let _m=_e.match(/^\\\\\\[([\\s\\S]+?)\\\\\\](?:\\n|$)/);if(_m&&_m[1].trim())return{type:"kbpKatexBlockBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return bR(_n.text,{displayMode:!0,throwOnError:!1})+"\\n"}},{name:"kbpKatexInlineBracket",level:"inline",start(_e){let _i=_e.indexOf("\\\\[");if(_i!==-1)return _i},tokenizer(_e){let _m=_e.match(/^\\\\\\[((?:\\\\.|[^\\\\\\n])*?)\\\\\\]/);if(_m&&_m[1].trim())return{type:"kbpKatexInlineBracket",raw:_m[0],text:_m[1].trim()}},renderer(_n){return bR(_n.text,{displayMode:!0,throwOnError:!1})}}]});',
  },
];
