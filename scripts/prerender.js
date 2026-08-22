#!/usr/bin/env node
// Bakes the board, jump nav, stacks and count into index.html as static markup
// so crawlers see the add-ons without running JavaScript. The browser still
// rebuilds all of it on load — this only changes what a JS-less fetch sees.
//
//   node scripts/prerender.js          rewrite index.html in place
//   node scripts/prerender.js --check  exit 1 if it is out of date (used in CI)
//
// The markup is produced by running index.html's own render code against stub
// DOM nodes, so there is no second copy of the rendering logic to drift.

const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "index.html");
const html = fs.readFileSync(file, "utf8");

const match = html.match(/<script>([\s\S]*)<\/script>/);
if (!match) {
  console.error("FAIL: could not find the <script> block in index.html");
  process.exit(1);
}

// Minimal DOM stubs. Every element records the last innerHTML/textContent it
// was given; everything else is a no-op so the page script runs to completion.
const captured = {};
function stub(id) {
  return {
    id,
    _html: "",
    _text: "",
    set innerHTML(v) { this._html = v; captured[id] = { ...captured[id], html: v }; },
    get innerHTML() { return this._html; },
    set textContent(v) { this._text = v; captured[id] = { ...captured[id], text: v }; },
    get textContent() { return this._text; },
    style: {},
    value: "",
    href: "",
    classList: { add() {}, remove() {}, contains() { return false; } },
    addEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    forEach() {},
  };
}

const els = {};
global.document = {
  getElementById(id) { return (els[id] = els[id] || stub(id)); },
  querySelectorAll() { return []; },
  addEventListener() {},
};
global.window = {};
global.navigator = {};
global.matchMedia = () => ({ matches: false });
global.fetch = () => ({ then: () => ({ then: () => ({ catch() {} }) }) });
global.IntersectionObserver = function () {
  return { observe() {}, unobserve() {}, disconnect() {} };
};
global.setTimeout = () => 0;

try {
  eval(match[1]);
} catch (e) {
  console.error("FAIL: index.html's script threw while prerendering:", e.message);
  process.exit(1);
}

const slots = {
  board: captured.board && captured.board.html,
  jumpnav: captured.jumpnav && captured.jumpnav.html,
  stacks: captured.stacks && captured.stacks.html,
  count: captured.count && captured.count.text,
};

for (const [name, value] of Object.entries(slots)) {
  if (!value) {
    console.error(`FAIL: nothing was rendered into "${name}" — did the markup change?`);
    process.exit(1);
  }
}

let out = html;
for (const [name, value] of Object.entries(slots)) {
  const re = new RegExp(
    `(<!--PRERENDER:${name}-->)[\\s\\S]*?(<!--/PRERENDER:${name}-->)`
  );
  if (!re.test(out)) {
    console.error(`FAIL: missing <!--PRERENDER:${name}--> markers in index.html`);
    process.exit(1);
  }
  out = out.replace(re, `$1${value}$2`);
}

if (process.argv.includes("--check")) {
  if (out !== html) {
    console.error(
      "FAIL: index.html's prerendered markup is stale.\n" +
      "      Run `node scripts/prerender.js` and commit the result."
    );
    process.exit(1);
  }
  console.log("OK: prerendered markup is up to date.");
  process.exit(0);
}

if (out === html) {
  console.log("OK: already up to date, nothing written.");
} else {
  fs.writeFileSync(file, out);
  const added = out.length - html.length;
  console.log(`OK: prerendered ${Object.keys(slots).length} slots (${added > 0 ? "+" : ""}${added} bytes).`);
}
