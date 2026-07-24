// Injects index.html into worker.js so the Worker serves the exact same
// dashboard at "/". index.html is the single source of truth for the UI.
// Run: node sync-html.mjs   (re-run after any index.html change, then deploy)
import { readFileSync, writeFileSync } from "node:fs";

const dir = new URL("./", import.meta.url);
const htmlPath = new URL("index.html", dir);
const workerPath = new URL("worker.js", dir);

const html = readFileSync(htmlPath, "utf8");
const worker = readFileSync(workerPath, "utf8");

// escape for a JS template literal: backslash, backtick, then ${
const escaped = html.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

const marker = /const HTML = `[\s\S]*`;\s*$/;
if (!marker.test(worker)) {
  console.error("Could not find `const HTML = ` ... `;` at the end of worker.js");
  process.exit(1);
}
const out = worker.replace(marker, () => "const HTML = `" + escaped + "`;\n");
writeFileSync(workerPath, out);
console.log(`Injected index.html (${html.length} chars) into worker.js HTML.`);
