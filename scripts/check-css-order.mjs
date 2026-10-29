#!/usr/bin/env node
/**
 * check-css-order.mjs — cascade-order guard for composed CSS-module variants.
 *
 * Call sites compose two module classes at runtime, base first:
 *
 *     className={`${styles.tab} ${styles.tabActive}`}
 *
 * Both selectors are single-class (equal specificity), so the variant only
 * wins while the element renders both classes if the variant rule is declared
 * AFTER the base rule in the module — and nothing in the toolchain notices
 * when someone alphabetises or reorders the file. This script enforces the
 * invariant by parsing every composed call site in every .js / .jsx file
 * under src:
 *
 *   1. the variant class must exist in the paired .module.css and be declared
 *      after its base class there;
 *   2. a marker comment must sit between the base rule's end and the variant
 *      rule and mention the composition, e.g. "declared after .tab so it wins
 *      ..." — same wording the .buttonBadge marker in Navbar.module.css uses,
 *      so a future reorder gets caught and leaves a breadcrumb explaining why
 *      the order is load-bearing.
 *
 * Compositions that mix two different module objects (e.g. a global "container"
 * class with something from `styles`) are order-independent and ignored, as are
 * bare-string global classes like `container` itself — only `${alias.x}`
 * interpolations against a .module.css import participate.
 *
 * lint-staged-safety: staged filenames arrive as argv and are deliberately
 * ignored — the whole src tree is re-checked in a few ms, so the check runs
 * against whatever prettier just wrote, not against a diff.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = process.env.CSS_ORDER_SRC
  ? path.resolve(process.env.CSS_ORDER_SRC)
  : path.join(root, "src");

const lineAt = (text, index) => text.slice(0, index).split("\n").length;
const rel = (p) => path.relative(root, p).split(path.sep).join("/");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".")) walk(p, out);
    else out.push(p);
  }
  return out;
}

const problems = [];

/* ---------- 1. discover composed (base, variant) pairs from call sites ---------- */

const MODULE_IMPORT_RE = /import\s+(\w+)\s+from\s+["']([^"']+\.module\.css)["']/g;
const COMPOSED_RE = /\$\{(\w+)\.(\w+)\}\s+\$\{(\w+)\.(\w+)\}/g;

// key: `${cssPath}|${base}|${variant}`
const pairs = new Map();

for (const file of walk(srcDir).filter((f) => /\.(js|jsx)$/.test(f))) {
  const text = fs.readFileSync(file, "utf8");

  const moduleAliases = new Map(); // alias -> resolved css path
  for (const m of text.matchAll(MODULE_IMPORT_RE)) {
    moduleAliases.set(m[1], path.resolve(path.dirname(file), m[2]));
  }

  for (const m of text.matchAll(COMPOSED_RE)) {
    const [, aliasA, clsA, aliasB, clsB] = m;
    if (clsA === clsB) continue; // defensive: same class twice is not a variant
    if (aliasA !== aliasB) continue; // two different modules — order can't matter
    if (!moduleAliases.has(aliasA)) {
      problems.push(
        `${rel(file)}:${lineAt(text, m.index)} — "${aliasA}.${clsA}" composed with "${aliasA}.${clsB}" but the import for ${aliasA} is missing or not a .module.css file`
      );
      continue;
    }
    const src = `${rel(file)}:${lineAt(text, m.index)}`;
    const key = `${moduleAliases.get(aliasA)}|${clsA}|${clsB}`;
    if (!pairs.has(key)) {
      pairs.set(key, {
        cssPath: moduleAliases.get(aliasA),
        base: clsA,
        variant: clsB,
        sources: [],
      });
    }
    pairs.get(key).sources.push(src);
  }
}

/* ---------- 2. parse the modules involved ---------- */

// Rule positions for a class name: first top-of-rule occurrence whose selector
// begins with it (comments are masked out so "after .base" prose never matches).
function parseModule(cssPath) {
  const text = fs.readFileSync(cssPath, "utf8");
  const masked = text.replace(/\/\*[\s\S]*?\*\//g, (cm) => cm.replace(/[^\n]/g, " "));

  const braceEnd = (from) => {
    let depth = 0;
    for (let i = from; i < masked.length; i++) {
      if (masked[i] === "{") depth += 1;
      else if (masked[i] === "}") {
        depth -= 1;
        if (depth === 0) return i + 1;
      }
    }
    return masked.length;
  };

  const rules = new Map(); // class name -> { selPos, ruleEnd }
  const selRe = /\.([A-Za-z][\w-]*)[^{}]*\{/g;
  let m;
  while ((m = selRe.exec(masked))) {
    const name = m[1];
    if (!rules.has(name)) {
      const openBrace = m.index + m[0].length - 1; // match ends at "{"
      rules.set(name, { selPos: m.index, ruleEnd: braceEnd(openBrace) });
    }
  }
  return { text, rules };
}

const modules = new Map();
const parse = (cssPath) => {
  if (!modules.has(cssPath)) modules.set(cssPath, parseModule(cssPath));
  return modules.get(cssPath);
};

/* ---------- 3. verify each pair ---------- */

for (const { cssPath, base, variant, sources } of pairs.values()) {
  const [firstSource] = sources;
  if (!fs.existsSync(cssPath)) {
    problems.push(
      `${firstSource} — composed variant "${base}/${variant}" but ${rel(cssPath)} does not exist`
    );
    continue;
  }
  const { text, rules } = parse(cssPath);
  const baseRule = rules.get(base);
  const variantRule = rules.get(variant);
  const at = (rule) => `${rel(cssPath)}:${lineAt(text, rule.selPos)}`;
  if (!baseRule) {
    problems.push(`${firstSource} — base class .${base} is not declared in ${rel(cssPath)}`);
  }
  if (!variantRule) {
    problems.push(
      `${firstSource} — composed variant .${variant} is not declared in ${rel(cssPath)}`
    );
  }
  if (!baseRule || !variantRule) continue;
  if (variantRule.selPos <= baseRule.selPos) {
    problems.push(
      `${firstSource} — cascade order broken in ${rel(cssPath)}: .${variant} (declared ${at(variantRule)}) must come after .${base} (declared ${at(baseRule)})`
    );
    continue;
  }
  // The variant must carry a marker comment naming the composition.
  const window = text.slice(baseRule.ruleEnd, variantRule.selPos);
  const markerRe = new RegExp(`after\\s+\\.${base}(?![\\w-])`, "i");
  if (!markerRe.test(window)) {
    problems.push(
      `${firstSource} — ${rel(cssPath)}:${lineAt(text, variantRule.selPos)} is missing its marker comment: add a comment mentioning "after .${base}" between the two rules`
    );
  }
}

/* ---------- 4. report ---------- */

if (problems.length > 0) {
  console.error(`✗ CSS composition order check failed (${problems.length}):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exitCode = 1;
} else {
  const count = pairs.size;
  const moduleCount = new Set([...pairs.values()].map((p) => p.cssPath)).size;
  console.log(
    `✓ ${count} composed CSS variant ${count === 1 ? "pair" : "pairs"} across ${moduleCount} ${
      moduleCount === 1 ? "module" : "modules"
    } — cascade order and marker comments OK`
  );
}
