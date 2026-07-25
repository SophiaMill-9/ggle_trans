#!/usr/bin/env node
/**
 * Local Google Ads Transparency scraper — runs on YOUR machine (home IP),
 * avoids Cloudflare Worker 429 rate limits.
 *
 * Setup:
 *   1. Copy .env.example → .env and fill Supabase + Google credentials
 *   2. Or: save DevTools cURL to curl.txt
 *
 * Usage:
 *   node scrape-local.mjs AR14881673759193825281
 *   node scrape-local.mjs --curl curl.txt AR14881673759193825281
 *   node scrape-local.mjs --delay 45 --max-pages 5 AR...
 *   node scrape-local.mjs --resume AR...
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));

// ---------- config ----------

function loadDotEnv() {
  const path = resolve(__dir, ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
}

function parseArgs(argv) {
  const opts = { delay: 45, maxPages: Infinity, resume: false, curlFile: null, ids: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--delay" && argv[i + 1]) { opts.delay = Number(argv[++i]) || 45; continue; }
    if (a === "--max-pages" && argv[i + 1]) { opts.maxPages = Number(argv[++i]) || Infinity; continue; }
    if (a === "--curl" && argv[i + 1]) { opts.curlFile = argv[++i]; continue; }
    if (a === "--resume") { opts.resume = true; continue; }
    if (a === "-h" || a === "--help") { opts.help = true; continue; }
    const id = extractAdvertiserId(a);
    if (id) opts.ids.push(id);
  }
  return opts;
}

function usage() {
  console.log(`
Local scraper — Google Ads Transparency → Supabase (your IP, no Worker 429)

  node scrape-local.mjs [options] <advertiser-id-or-url>

Options:
  --curl <file>       Parse token+cookie from DevTools cURL file
  --delay <sec>       Seconds between pages (default: 45)
  --max-pages <n>     Stop after N pages
  --resume            Continue from saved cursor (.scrape-cursor-<id>.json)

Environment (.env):
  SUPABASE_URL
  SUPABASE_SERVICE_KEY

Credentials (recommended — paste DevTools cURL into curl.txt):
  curl.txt            auto-loaded if present
  --curl <file>       explicit cURL file

  Do NOT copy masked tokens from the dashboard (contains … ellipsis).
`);
}

// ---------- Google (same field map as worker.js) ----------

const BASE = "https://adstransparency.google.com";
const RPC = `${BASE}/anji/_/rpc/SearchService/SearchCreatives?authuser=0`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:153.0) Gecko/20100101 Firefox/153.0";
const FORMAT = { 1: "text", 2: "image", 3: "video" };
const PAGE_SIZE = 40;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extractAdvertiserId(input) {
  const m = String(input || "").match(/AR\d{10,}/);
  return m ? m[0] : null;
}

function parseCurl(text) {
  const out = { token: null, cookie: null, userAgent: null };
  if (!text || !/\bcurl\b/i.test(text)) return out;
  const s = text.replace(/\\\r?\n/g, " ").replace(/\r?\n/g, " ");
  const headerRe = /(?:-H|--header)\s+(?:'((?:\\'|[^'])*)'|"((?:\\"|[^"])*)")/gi;
  let m;
  while ((m = headerRe.exec(s)) !== null) {
    const h = (m[1] || m[2] || "").replace(/\\(['"])/g, "$1");
    const colon = h.indexOf(":");
    if (colon < 0) continue;
    const name = h.slice(0, colon).trim().toLowerCase();
    const val = h.slice(colon + 1).trim();
    if (name === "x-framework-xsrf-token") out.token = val;
    else if (name === "cookie") out.cookie = val;
    else if (name === "user-agent") out.userAgent = val;
  }
  if (!out.cookie) {
    const cm = s.match(/(?:--cookie|-b)\s+(?:'([^']*)'|"([^"]*)"|(\S+))/i);
    if (cm) out.cookie = (cm[1] ?? cm[2] ?? cm[3] ?? "").replace(/\\(['"])/g, "$1");
  }
  return out;
}

/** HTTP headers must be ISO-8859-1 — reject ellipsis/smart quotes from bad copy/paste. */
function assertHeaderSafe(val, label) {
  if (!val) return val;
  const v = val.replace(/^\uFEFF/, "").trim();
  for (let i = 0; i < v.length; i++) {
    if (v.charCodeAt(i) > 255) {
      const ch = v.charCodeAt(i);
      let hint =
        " Paste the full SearchCreatives cURL from Chrome DevTools into curl.txt (not masked text from the dashboard).";
      if (ch === 8230) hint = " Found '…' (ellipsis) — token/cookie was truncated. Use curl.txt from DevTools.";
      if (ch === 8226) hint = " Found '•' — do not copy masked secrets from the dashboard UI.";
      throw new Error(`${label} has invalid character at index ${i} (U+${ch.toString(16).toUpperCase()}).${hint}`);
    }
  }
  return v;
}

function loadGoogleSession(opts) {
  const autoCurl = resolve(__dir, "curl.txt");
  const path = opts.curlFile ? resolve(__dir, opts.curlFile) : existsSync(autoCurl) ? autoCurl : null;

  if (path && existsSync(path)) {
    const parsed = parseCurl(readFileSync(path, "utf8"));
    if (!parsed.token || !parsed.cookie) {
      throw new Error(
        `Could not parse token + cookie from ${path}.\n` +
        "Paste the full DevTools → SearchCreatives → Copy as cURL into curl.txt."
      );
    }
    const token = assertHeaderSafe(parsed.token, "curl.txt token");
    const cookie = assertHeaderSafe(parsed.cookie, "curl.txt cookie");
    const userAgent = parsed.userAgent ? assertHeaderSafe(parsed.userAgent, "curl.txt User-Agent") : "";
    console.log(`Credentials from ${path} (token ${token.length} chars, cookie ${cookie.length} chars)`);
    return { token, cookie, userAgent };
  }

  const envCookie = process.env.TRANSPARENCY_COOKIE || process.env.GOOGLE_COOKIE || "";
  if (/…|\u2026/.test(envCookie) || (envCookie && envCookie.length < 200)) {
    throw new Error(
      "Bad TRANSPARENCY_COOKIE in .env (truncated or contains …).\n\n" +
      "Fix:\n" +
      "  1. Remove TRANSPARENCY_COOKIE and GOOGLE_XSRF_TOKEN from .env\n" +
      "  2. DevTools → SearchCreatives → Copy as cURL → save to:\n" +
      `     ${autoCurl}\n` +
      "  Or: dashboard → Paste curl → Save → Download curl.txt → copy to project folder"
    );
  }

  let token = process.env.GOOGLE_XSRF_TOKEN || process.env.XSRF_TOKEN || "";
  let cookie = envCookie;
  let userAgent = process.env.GOOGLE_UA || "";

  if (!token || !cookie) {
    throw new Error(
      "No curl.txt found.\n\n" +
      "Create curl.txt:\n" +
      "  DevTools → SearchCreatives → Copy as cURL → save to:\n" +
      `  ${autoCurl}`
    );
  }

  token = assertHeaderSafe(token, "GOOGLE_XSRF_TOKEN");
  cookie = assertHeaderSafe(cookie, "TRANSPARENCY_COOKIE");
  if (userAgent) userAgent = assertHeaderSafe(userAgent, "GOOGLE_UA");

  console.log(`Credentials from .env (token ${token.length} chars, cookie ${cookie.length} chars)`);
  return { token, cookie, userAgent };
}

function parseSearchCreativesResponse(text) {
  let body = text;
  if (body.startsWith(")]}'")) body = body.slice(4);
  const raw = JSON.parse(body.trim());
  const creatives = Array.isArray(raw["1"]) ? raw["1"] : [];
  const c2 = raw["2"];
  const nextCursor =
    typeof c2 === "string" && c2.length > 20 && !/^\d+$/.test(c2) ? c2 : null;
  return {
    creatives,
    nextCursor,
    totalLow: Number(raw["4"]) || null,
    name: creatives.find((c) => typeof c?.["12"] === "string")?.["12"] || null,
  };
}

const epochToDate = (t) => {
  const s = Number(t?.["1"]);
  return Number.isFinite(s) && s > 0 ? new Date(s * 1000).toISOString().slice(0, 10) : null;
};

const videoKeyFrom = (contentJsUrl, id) =>
  (contentJsUrl && (contentJsUrl.match(/creativeId=(\d+)/) || [])[1]) || id || null;

function parseCreative(c, advertiserId) {
  const id = typeof c?.["2"] === "string" ? c["2"] : null;
  if (!id) return null;
  const content_js_url = c?.["3"]?.["1"]?.["4"] || null;
  return {
    id,
    advertiser_id: c?.["1"] || advertiserId,
    format: FORMAT[c?.["4"]] || "unknown",
    content_js_url,
    preview_url: null,
    asset_urls: [],
    video_key: videoKeyFrom(content_js_url, id),
    first_shown: epochToDate(c?.["6"]),
    last_shown: epochToDate(c?.["7"]),
    days_shown: Number.isFinite(c?.["13"]) ? c["13"] : null,
    raw: c,
  };
}

async function fetchGooglePage(advertiserId, cursor, session) {
  const body = {
    "2": PAGE_SIZE,
    "3": { "12": { "1": "", "2": true }, "13": { "1": [advertiserId] } },
    "7": { "1": 1, "2": 22, "3": 2356 },
  };
  if (cursor) body["4"] = cursor;

  const headers = {
    "User-Agent": session.userAgent || UA,
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Content-Type": "application/x-www-form-urlencoded",
    "X-Same-Domain": "1",
    Origin: BASE,
    Referer: `${BASE}/advertiser/${advertiserId}?region=anywhere&hl=en`,
    Cookie: session.cookie,
    "X-Framework-Xsrf-Token": session.token,
  };

  const res = await fetch(RPC, {
    method: "POST",
    headers,
    body: "f.req=" + encodeURIComponent(JSON.stringify(body)),
  });

  const text = await res.text();
  if (res.status === 429) {
    throw new Error("Google rate limit (429) — wait 2 min and retry, or refresh curl.txt");
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error("Google rejected credentials (403) — paste a fresh SearchCreatives cURL");
  }
  if (!res.ok) throw new Error(`SearchCreatives HTTP ${res.status}`);
  if (/google\.com\/sorry/i.test(text)) {
    throw new Error("Google captcha/rate-limit page — wait and refresh credentials");
  }
  return parseSearchCreativesResponse(text);
}

// ---------- Supabase ----------

function sbHeaders(key, extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function sbUpsert(baseUrl, key, table, rows) {
  if (!rows.length) return;
  const url = baseUrl.replace(/\/$/, "") + "/rest/v1/" + table;
  const res = await fetch(url, {
    method: "POST",
    headers: sbHeaders(key, { Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    throw new Error(`Supabase upsert ${table} ${res.status}: ${await res.text()}`);
  }
}

async function storePage(supabase, advertiserId, page) {
  await sbUpsert(supabase.url, supabase.key, "advertisers", [
    {
      id: advertiserId,
      ...(page.name ? { name: page.name } : {}),
      ...(page.totalLow ? { total_creatives: page.totalLow } : {}),
      last_synced_at: new Date().toISOString(),
    },
  ]);
  const rows = page.creatives.map((c) => parseCreative(c, advertiserId)).filter(Boolean);
  await sbUpsert(supabase.url, supabase.key, "creatives", rows);
  return rows.length;
}

// ---------- cursor resume ----------

function cursorPath(advertiserId) {
  return resolve(__dir, `.scrape-cursor-${advertiserId}.json`);
}

function loadCursor(advertiserId) {
  const p = cursorPath(advertiserId);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function saveCursor(advertiserId, data) {
  writeFileSync(cursorPath(advertiserId), JSON.stringify(data, null, 2));
}

function clearCursor(advertiserId) {
  const p = cursorPath(advertiserId);
  if (existsSync(p)) writeFileSync(p, "");
}

// ---------- main loop ----------

async function scrapeAdvertiser(advertiserId, opts, session, supabase) {
  let cursor = null;
  let pages = 0;
  let total = 0;
  let totalEstimate = null;

  if (opts.resume) {
    const saved = loadCursor(advertiserId);
    if (saved?.cursor) {
      cursor = saved.cursor;
      pages = saved.pages || 0;
      total = saved.total || 0;
      console.log(`Resuming ${advertiserId} from page ${pages + 1} (${total} creatives so far)`);
    }
  }

  while (pages < opts.maxPages) {
    if (pages > 0 || cursor) {
      process.stdout.write(`  waiting ${opts.delay}s… `);
      await sleep(opts.delay * 1000);
      console.log("ok");
    }

    process.stdout.write(`  page ${pages + 1}: fetching… `);
    const page = await fetchGooglePage(advertiserId, cursor, session);
    const n = await storePage(supabase, advertiserId, page);
    pages++;
    total += n;
    if (page.totalLow) totalEstimate = page.totalLow;
    cursor = page.nextCursor;

    const est = totalEstimate ? ` / ~${totalEstimate}` : "";
    console.log(`${n} ads stored (${total}${est} total)`);

    saveCursor(advertiserId, {
      advertiser_id: advertiserId,
      cursor,
      pages,
      total,
      total_estimate: totalEstimate,
      updated_at: new Date().toISOString(),
    });

    if (!cursor) break;
  }

  if (!cursor) clearCursor(advertiserId);
  console.log(`Done ${advertiserId}: ${pages} pages, ${total} creatives${totalEstimate ? ` (~${totalEstimate} est.)` : ""}`);
  return { pages, total };
}

async function main() {
  loadDotEnv();
  const opts = parseArgs(process.argv);
  if (opts.help || !opts.ids.length) {
    usage();
    process.exit(opts.help ? 0 : 1);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env");
    process.exit(1);
  }

  let session;
  try {
    session = loadGoogleSession(opts);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  const supabase = { url: supabaseUrl, key: supabaseKey };

  console.log(`Scraping from your IP (local) — delay ${opts.delay}s between pages\n`);

  for (const id of opts.ids) {
    console.log(`▶ ${id}`);
    try {
      await scrapeAdvertiser(id, opts, session, supabase);
    } catch (e) {
      console.error(`✗ ${id}: ${e.message}`);
      console.error("  Cursor saved — run again with --resume after fixing credentials or waiting.");
      process.exitCode = 1;
    }
    console.log("");
  }

  console.log("Open the dashboard → Load apps to view results.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
