#!/usr/bin/env node
// Validates the JOBS data embedded in index.html: parses cleanly, no
// duplicate entries, and every entry has the fields the renderer expects.

const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "index.html");
const html = fs.readFileSync(file, "utf8");
const match = html.match(/<script>([\s\S]*)<\/script>/);
if (!match) {
  console.error("FAIL: could not find <script> block in index.html");
  process.exit(1);
}

const stubEl = { innerHTML: "", addEventListener() {}, getAttribute() { return null; }, setAttribute() {}, style: {}, textContent: "" };
global.document = { getElementById: () => stubEl, querySelectorAll: () => [], addEventListener() {} };
global.navigator = {};
global.window = {};
global.location = { search: "", pathname: "/", href: "" };
global.history = { replaceState() {} };
global.matchMedia = () => ({ matches: false });
global.fetch = () => Promise.resolve({ json: () => Promise.resolve({}) });

try {
  eval(match[1]);
} catch (e) {
  console.error("FAIL: JOBS/STACKS script threw an error:", e.message);
  process.exit(1);
}

const errors = [];
const validTypes = ["claude", "universal"];
const validPricing = ["free", "freemium", "paid"];
const seenNames = new Map();

JOBS.forEach((job) => {
  if (!job.title || !job.items || !job.items.length) {
    errors.push(`Job "${job.title || "(untitled)"}" has no items`);
  }
  job.items.forEach((it) => {
    const label = it.n || "(unnamed entry)";
    if (!it.n) errors.push(`Entry missing name (n) in "${job.title}"`);
    if (!it.u) errors.push(`"${label}" missing url (u)`);
    if (!it.d) errors.push(`"${label}" missing description (d)`);
    if (!validTypes.includes(it.t)) errors.push(`"${label}" has invalid type (t): ${it.t}`);
    if (!validPricing.includes(it.pr)) errors.push(`"${label}" has invalid pricing (pr): ${it.pr}`);
    if (seenNames.has(it.n)) {
      errors.push(`Duplicate entry name "${it.n}" (also in "${seenNames.get(it.n)}")`);
    } else {
      seenNames.set(it.n, job.title);
    }
  });
});

(STACKS || []).forEach((stack) => {
  (stack.m || []).forEach((name) => {
    if (!seenNames.has(name)) {
      errors.push(`Starter stack "${stack.n}" references unknown add-on "${name}"`);
    }
  });
});

if (errors.length) {
  console.error(`FAIL: ${errors.length} issue(s) found:\n`);
  errors.forEach((e) => console.error(" - " + e));
  process.exit(1);
}

console.log(`OK: ${seenNames.size} add-ons across ${JOBS.length} sections, all valid.`);
