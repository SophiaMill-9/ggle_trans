// Creative Light Table — Cloudflare Worker edition.
// Paste an Ads Transparency advertiser URL/ID in the page -> the browser drives
// a page-by-page sync; each request here fetches ONE page from Google's
// SearchCreatives RPC and upserts it into Supabase.
//
// Field map VERIFIED against a real response (2026-07):
//  response { "1":[creatives], "2":cursor, "4":totalLow, "5":totalHigh }
//  creative { "1":AR, "2":CR, "3":{"1":{"4":contentJsUrl}}, "4":fmt(1 text,2 image,3 video),
//             "6":{"1":firstShownSec}, "7":{"1":lastShownSec}, "12":name, "13":daysShown }

const BASE = "https://adstransparency.google.com";
const RPC = `${BASE}/anji/_/rpc/SearchService/SearchCreatives?authuser=0`;
const LOOKUP_RPC = `${BASE}/anji/_/rpc/LookupService/GetCreativeById?authuser=0`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:153.0) Gecko/20100101 Firefox/153.0";
const FORMAT = { 1: "text", 2: "image", 3: "video" };
const PAGE_SIZE = 40;

// Google's transparency region codes = 2000 + ISO-3166-1 numeric. Map to name/cc.
const ISO_NUM = Object.fromEntries(
  [
    [4,"AF","Afghanistan"],[8,"AL","Albania"],[12,"DZ","Algeria"],[20,"AD","Andorra"],[24,"AO","Angola"],[28,"AG","Antigua & Barbuda"],[32,"AR","Argentina"],[51,"AM","Armenia"],[36,"AU","Australia"],[40,"AT","Austria"],[31,"AZ","Azerbaijan"],[44,"BS","Bahamas"],[48,"BH","Bahrain"],[50,"BD","Bangladesh"],[52,"BB","Barbados"],[112,"BY","Belarus"],[56,"BE","Belgium"],[84,"BZ","Belize"],[204,"BJ","Benin"],[64,"BT","Bhutan"],[68,"BO","Bolivia"],[70,"BA","Bosnia & Herzegovina"],[72,"BW","Botswana"],[76,"BR","Brazil"],[96,"BN","Brunei"],[100,"BG","Bulgaria"],[854,"BF","Burkina Faso"],[108,"BI","Burundi"],[116,"KH","Cambodia"],[120,"CM","Cameroon"],[124,"CA","Canada"],[132,"CV","Cape Verde"],[140,"CF","Central African Republic"],[148,"TD","Chad"],[152,"CL","Chile"],[156,"CN","China"],[170,"CO","Colombia"],[174,"KM","Comoros"],[178,"CG","Congo"],[180,"CD","DR Congo"],[188,"CR","Costa Rica"],[384,"CI","Côte d'Ivoire"],[191,"HR","Croatia"],[192,"CU","Cuba"],[196,"CY","Cyprus"],[203,"CZ","Czechia"],[208,"DK","Denmark"],[262,"DJ","Djibouti"],[212,"DM","Dominica"],[214,"DO","Dominican Republic"],[218,"EC","Ecuador"],[818,"EG","Egypt"],[222,"SV","El Salvador"],[226,"GQ","Equatorial Guinea"],[232,"ER","Eritrea"],[233,"EE","Estonia"],[748,"SZ","Eswatini"],[231,"ET","Ethiopia"],[242,"FJ","Fiji"],[246,"FI","Finland"],[250,"FR","France"],[266,"GA","Gabon"],[270,"GM","Gambia"],[268,"GE","Georgia"],[276,"DE","Germany"],[288,"GH","Ghana"],[300,"GR","Greece"],[308,"GD","Grenada"],[320,"GT","Guatemala"],[324,"GN","Guinea"],[624,"GW","Guinea-Bissau"],[328,"GY","Guyana"],[332,"HT","Haiti"],[340,"HN","Honduras"],[344,"HK","Hong Kong"],[348,"HU","Hungary"],[352,"IS","Iceland"],[356,"IN","India"],[360,"ID","Indonesia"],[364,"IR","Iran"],[368,"IQ","Iraq"],[372,"IE","Ireland"],[376,"IL","Israel"],[380,"IT","Italy"],[388,"JM","Jamaica"],[392,"JP","Japan"],[400,"JO","Jordan"],[398,"KZ","Kazakhstan"],[404,"KE","Kenya"],[296,"KI","Kiribati"],[414,"KW","Kuwait"],[417,"KG","Kyrgyzstan"],[418,"LA","Laos"],[428,"LV","Latvia"],[422,"LB","Lebanon"],[426,"LS","Lesotho"],[430,"LR","Liberia"],[434,"LY","Libya"],[438,"LI","Liechtenstein"],[440,"LT","Lithuania"],[442,"LU","Luxembourg"],[446,"MO","Macau"],[450,"MG","Madagascar"],[454,"MW","Malawi"],[458,"MY","Malaysia"],[462,"MV","Maldives"],[466,"ML","Mali"],[470,"MT","Malta"],[584,"MH","Marshall Islands"],[478,"MR","Mauritania"],[480,"MU","Mauritius"],[484,"MX","Mexico"],[583,"FM","Micronesia"],[498,"MD","Moldova"],[492,"MC","Monaco"],[496,"MN","Mongolia"],[499,"ME","Montenegro"],[504,"MA","Morocco"],[508,"MZ","Mozambique"],[104,"MM","Myanmar"],[516,"NA","Namibia"],[520,"NR","Nauru"],[524,"NP","Nepal"],[528,"NL","Netherlands"],[554,"NZ","New Zealand"],[558,"NI","Nicaragua"],[562,"NE","Niger"],[566,"NG","Nigeria"],[807,"MK","North Macedonia"],[578,"NO","Norway"],[512,"OM","Oman"],[586,"PK","Pakistan"],[585,"PW","Palau"],[275,"PS","Palestine"],[591,"PA","Panama"],[598,"PG","Papua New Guinea"],[600,"PY","Paraguay"],[604,"PE","Peru"],[608,"PH","Philippines"],[616,"PL","Poland"],[620,"PT","Portugal"],[634,"QA","Qatar"],[642,"RO","Romania"],[643,"RU","Russia"],[646,"RW","Rwanda"],[659,"KN","St Kitts & Nevis"],[662,"LC","St Lucia"],[670,"VC","St Vincent"],[882,"WS","Samoa"],[674,"SM","San Marino"],[678,"ST","São Tomé & Príncipe"],[682,"SA","Saudi Arabia"],[686,"SN","Senegal"],[688,"RS","Serbia"],[690,"SC","Seychelles"],[694,"SL","Sierra Leone"],[702,"SG","Singapore"],[703,"SK","Slovakia"],[705,"SI","Slovenia"],[90,"SB","Solomon Islands"],[706,"SO","Somalia"],[710,"ZA","South Africa"],[410,"KR","South Korea"],[728,"SS","South Sudan"],[724,"ES","Spain"],[144,"LK","Sri Lanka"],[729,"SD","Sudan"],[740,"SR","Suriname"],[752,"SE","Sweden"],[756,"CH","Switzerland"],[760,"SY","Syria"],[158,"TW","Taiwan"],[762,"TJ","Tajikistan"],[834,"TZ","Tanzania"],[764,"TH","Thailand"],[626,"TL","Timor-Leste"],[768,"TG","Togo"],[776,"TO","Tonga"],[780,"TT","Trinidad & Tobago"],[788,"TN","Tunisia"],[792,"TR","Turkey"],[795,"TM","Turkmenistan"],[798,"TV","Tuvalu"],[800,"UG","Uganda"],[804,"UA","Ukraine"],[784,"AE","United Arab Emirates"],[826,"GB","United Kingdom"],[840,"US","United States"],[858,"UY","Uruguay"],[860,"UZ","Uzbekistan"],[548,"VU","Vanuatu"],[862,"VE","Venezuela"],[704,"VN","Vietnam"],[887,"YE","Yemen"],[894,"ZM","Zambia"],[716,"ZW","Zimbabwe"],[10,"AQ","Antarctica"],[535,"BQ","Caribbean NL"],[999,"XX","Worldwide"],
  ].map(([n, cc, name]) => [n, { cc, name }])
);

// ---------- Google fetch layer ----------

// Cookie that skips Google's consent interstitial (common for datacenter IPs)
const CONSENT_COOKIE = "SOCS=CAI; CONSENT=YES+";

function buildCookie(env) {
  const session = env.TRANSPARENCY_COOKIE || "";
  if (!session) return CONSENT_COOKIE;
  // Browser session already includes consent flags — don't duplicate.
  if (/CONSENT=/i.test(session) && /SOCS=/i.test(session)) return session;
  return [CONSENT_COOKIE, session].filter(Boolean).join("; ");
}

function googleCredentials(req, env) {
  return {
    token: req.headers.get("X-Xsrf-Override") || env.XSRF_TOKEN || null,
    cookie: req.headers.get("X-Cookie-Override") || env.TRANSPARENCY_COOKIE || null,
  };
}

function requireGoogleCredentials(req, env) {
  const { token, cookie } = googleCredentials(req, env);
  if (!cookie)
    return "Missing Google session cookie. Click Paste curl (SearchCreatives → Copy as cURL).";
  if (!token)
    return "Missing XSRF token. Click Paste curl (SearchCreatives → Copy as cURL).";
  return null;
}

// Dashboard can paste a browser Cookie via X-Cookie-Override (from DevTools cURL).
function envWithSession(req, env) {
  const cookie = req.headers.get("X-Cookie-Override");
  return cookie ? { ...env, TRANSPARENCY_COOKIE: cookie } : env;
}

async function fetchAdvertiserPage(advertiserId, env) {
  return fetch(`${BASE}/advertiser/${advertiserId}?region=anywhere&hl=en`, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
      Cookie: buildCookie(env),
    },
    redirect: "follow",
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseRetryAfterMs(res) {
  const ra = res.headers.get("Retry-After");
  if (!ra) return null;
  const sec = Number(ra);
  if (Number.isFinite(sec) && sec > 0) return Math.min(sec * 1000, 300000);
  const when = Date.parse(ra);
  if (Number.isFinite(when)) return Math.max(0, Math.min(when - Date.now(), 300000));
  return null;
}

async function searchCreativesRpc(advertiserId, cursor, env, token, extraHeaders = {}) {
  // NOTE: "14":[1] restricts results to Play-Store ads only. Many advertisers run
  // web/display/YouTube ads instead, which the filter hides entirely (0 results
  // even though ads exist). Omitting "14" returns creatives across all platforms.
  const body = {
    "2": PAGE_SIZE,
    "3": { "12": { "1": "", "2": true }, "13": { "1": [advertiserId] } },
    "7": { "1": 1, "2": 22, "3": 2356 },
  };
  if (cursor) body["4"] = cursor;

  const headers = {
    "User-Agent": extraHeaders["User-Agent"] || env.GOOGLE_UA || UA,
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Content-Type": "application/x-www-form-urlencoded",
    "X-Same-Domain": "1",
    Origin: BASE,
    Referer: `${BASE}/advertiser/${advertiserId}?region=anywhere&hl=en`,
    Cookie: buildCookie(env),
    ...extraHeaders,
  };
  if (token) headers["X-Framework-Xsrf-Token"] = token;

  return fetch(RPC, { method: "POST", headers, body: "f.req=" + encodeURIComponent(JSON.stringify(body)) });
}

async function rpcOnce(advertiserId, cursor, env, tokenOverride, extraHeaders = {}) {
  const token = tokenOverride || env.XSRF_TOKEN || null;
  if (!env.TRANSPARENCY_COOKIE)
    throw new Error(
      "Missing Google session cookie. Click Paste curl in the dashboard (SearchCreatives → Copy as cURL)."
    );
  if (!token)
    throw new Error(
      "Missing XSRF token. Click Paste curl in the dashboard (SearchCreatives → Copy as cURL)."
    );

  const res = await searchCreativesRpc(advertiserId, cursor, env, token, extraHeaders);
  if (res.status === 429) return res;
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      "Google rejected credentials (403). Paste a fresh SearchCreatives cURL — token/cookie expire quickly."
    );
  }
  return res;
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

async function storeSyncPage(env, advertiserId, page) {
  await upsert(env, "advertisers", [
    {
      id: advertiserId,
      ...(page.name ? { name: page.name } : {}),
      ...(page.totalLow ? { total_creatives: page.totalLow } : {}),
      last_synced_at: new Date().toISOString(),
    },
  ]);
  const rows = page.creatives.map((c) => parseCreative(c, advertiserId)).filter(Boolean);
  await upsert(env, "creatives", rows);
  return {
    advertiser_id: advertiserId,
    name: page.name,
    total_estimate: page.totalLow,
    fetched: rows.length,
    next_cursor: page.nextCursor,
  };
}

async function fetchPage(advertiserId, cursor, env, tokenOverride, extraHeaders = {}) {
  // Warm session only on the first page — paginated fetches skip it to save time.
  if (!cursor) {
    try {
      await fetchAdvertiserPage(advertiserId, env);
    } catch (_) {}
  }

  const res = await rpcOnce(advertiserId, cursor, env, tokenOverride, extraHeaders);
  if (res.status === 429) {
    throw new Error(
      "Google rate limit (429). Wait 2–3 minutes, paste a fresh SearchCreatives cURL, then retry."
    );
  }
  if (!res.ok) {
    throw new Error(res.status === 403
      ? "Google refused the request (403) - refresh the Token, or this IP may be blocked"
      : `SearchCreatives HTTP ${res.status}`);
  }
  const text = await res.text();
  return parseSearchCreativesResponse(text);
}

const epochToDate = (t) => {
  const s = Number(t?.["1"]);
  return Number.isFinite(s) && s > 0 ? new Date(s * 1000).toISOString().slice(0, 10) : null;
};

// Google's numeric creativeId (shared by a creative's variations) is the most
// stable "same underlying video" key; fall back to the CR id.
const videoKeyFrom = (contentJsUrl, id) =>
  (contentJsUrl && (contentJsUrl.match(/creativeId=(\d+)/) || [])[1]) || id || null;

const parseCreative = (c, advertiserId) => {
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
};

// Google wraps the preview payload in layered escapes (\xNN hex + &quot; +
// URL-encoding) and serves asset URLs as protocol-relative (//host/...).
// This decodes all of that, then mines both the app and its media.
function decodePreviewJs(js) {
  const s = js
    .replace(/\\x26quot;/g, '"').replace(/\\x26amp;/g, "&").replace(/\\x26/g, "&")
    .replace(/\\x22/g, '"').replace(/\\x27/g, "'")
    .replace(/\\x3d/gi, "=").replace(/\\x3f/gi, "?").replace(/\\x2f/gi, "/")
    .replace(/\\\//g, "/").replace(/\\u003d/gi, "=").replace(/\\u0026/gi, "&")
    .replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  let decoded = s;
  try {
    decoded = decodeURIComponent(s.replace(/%(?![0-9a-fA-F]{2})/g, "%25"));
  } catch (_) {}
  return s + "\n" + decoded; // search both raw + url-decoded forms
}

function parsePreview(js) {
  const hay = decodePreviewJs(js);

  const urls = new Set();
  for (const m of hay.matchAll(/(?:https?:)?\/\/[^\s"'\\<>()\[\]]+/g)) {
    let u = m[0].replace(/[",;)\]}]+$/, "");
    if (
      /simgad|googlesyndication|lh3\.googleusercontent|play-lh|googleusercontent\.com\/(?!ads\/preview\/content)|ytimg\.com|youtube\.com/i.test(u)
    ) {
      if (u.startsWith("//")) u = "https:" + u;
      urls.add(u);
    }
  }
  for (const m of hay.matchAll(/youtube\.com\/embed\/([\w-]{6,})|"videoId"\s*:\s*"([\w-]{6,})"/g)) {
    const id = m[1] || m[2];
    if (id) {
      urls.add(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
      urls.add(`https://www.youtube.com/watch?v=${id}`);
    }
  }
  const all = [...urls];
  const preview =
    all.find((u) => /ytimg\.com\/vi\//.test(u)) ||
    all.find((u) => /lh3\.googleusercontent|play-lh/.test(u)) ||
    all.find((u) => /simgad/.test(u)) ||
    all.find((u) => /\.(png|jpe?g|webp|gif)([?#]|$)/i.test(u)) ||
    null;

  // Promoted app: package id from the Play Store destination, and/or a
  // plain-text title that sits right before a play.google.com/store link.
  const app_package = (hay.match(/details\?id=([a-zA-Z0-9._]+)/) || [])[1] || null;
  let app_name =
    (hay.match(/"([^"]{2,90})"\s*,\s*"(?:https?:\/\/)?(?:www\.)?play\.google\.com\/store"/) || [])[1] ||
    null;
  // Non-Play (YouTube/web) ads: fall back to the visible ad headline text.
  if (!app_name) {
    const hl =
      hay.match(/class="[^"]*headline[^"]*"[^>]*>[\s\S]*?<span[^>]*>([^<]{2,80})<\/span>/i) ||
      hay.match(/class="[^"]*headline[^"]*"[^>]*>([^<]{2,80})</i);
    if (hl && hl[1]) {
      const t = hl[1].replace(/\s+/g, " ").trim();
      if (t && !/^(send feedback|thank|google)$/i.test(t)) app_name = t;
    }
  }
  const youtube_id =
    (hay.match(/(?:youtube\.com\/(?:embed\/|watch\?v=)|youtu\.be\/|ytimg\.com\/vi\/)([\w-]{11})/) ||
      [])[1] || null;
  const app_url = app_package
    ? `https://play.google.com/store/apps/details?id=${app_package}`
    : null;

  return { preview_url: preview, asset_urls: all, app_name, app_package, app_url, youtube_id };
}

async function resolvePreview(contentJsUrl, env) {
  const res = await fetch(contentJsUrl, {
    headers: { "User-Agent": UA, Cookie: buildCookie(env) },
  });
  if (!res.ok) throw new Error(`preview HTTP ${res.status}`);
  const media = parsePreview(await res.text());
  // YouTube ads often have no Play package/headline - use the video's public title
  // so the app table can list each unique video instead of one "Unknown app" row.
  if (!media.app_name && !media.app_package && media.youtube_id) {
    try {
      const o = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(
          "https://www.youtube.com/watch?v=" + media.youtube_id
        )}&format=json`,
        { headers: { "User-Agent": UA } }
      );
      if (o.ok) {
        const j = await o.json();
        if (j.title) media.app_name = String(j.title).slice(0, 120);
        if (j.author_name) media.developer = String(j.author_name).slice(0, 80);
      }
    } catch (_) {}
  }
  return media;
}

// Pull the actual video stream out of a video ad's content.js. The
// googlevideo.com/videoplayback URL is signed, short-lived and locked to the IP
// that fetched the content.js - so we only entity-decode here (NOT url-decode,
// which would corrupt the signature) and the caller must download it right away.
function parseVideo(js) {
  const s = js
    .replace(/\\x26/g, "&").replace(/\\x3d/gi, "=").replace(/\\x2f/gi, "/").replace(/\\\//g, "/")
    .replace(/\\u0026/gi, "&").replace(/\\u003d/gi, "=")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"');
  const m = s.match(/\/\/[\w.-]*googlevideo\.com\/videoplayback[^"'\s<>\]\\]+/);
  const video_url = m ? "https:" + m[0] : null;
  const youtube_id =
    (s.match(/(?:youtube\.com\/(?:embed\/|watch\?v=)|youtu\.be\/|ytimg\.com\/vi\/)([\w-]{11})/) || [])[1] ||
    null;
  return { video_url, youtube_id };
}

// ---------- Creative detail (variations + per-country campaign data) ----------

// YYYYMMDD integer (e.g. 20260723) -> "2026-07-23"
const ymd = (n) => {
  const s = String(n || "");
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;
};

async function lookupCreative(advertiserId, creativeId, env) {
  const body = { "1": advertiserId, "2": creativeId, "5": { "1": 1, "2": 22, "3": 2356 } };
  const res = await fetch(LOOKUP_RPC, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      Accept: "*/*",
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Same-Domain": "1",
      Origin: BASE,
      Referer: `${BASE}/advertiser/${advertiserId}/creative/${creativeId}`,
      Cookie: buildCookie(env),
    },
    body: "f.req=" + encodeURIComponent(JSON.stringify(body)),
  });
  if (!res.ok) throw new Error(`GetCreativeById HTTP ${res.status}`);
  let text = await res.text();
  if (text.startsWith(")]}'")) text = text.slice(4);
  return JSON.parse(text.trim());
}

// From GetCreativeById: field "5"=variations, "8"=variation count,
// "17"=per-region rows { "1":geoCode, "4":firstShown, "5":lastShown }.
function parseCreativeDetail(raw) {
  const c = raw?.["1"] || {};
  const variations = Array.isArray(c["5"]) ? c["5"] : [];
  const variation_count = Number(c["8"]) || variations.length || 1;
  const content_js_urls = variations.map((v) => v?.["1"]?.["4"]).filter(Boolean);
  const regions = Array.isArray(c["17"]) ? c["17"] : [];
  const countries = regions
    .map((r) => {
      const code = Number(r?.["1"]);
      if (!Number.isFinite(code)) return null;
      const info = ISO_NUM[code - 2000];
      return {
        code,
        cc: info?.cc || String(code - 2000),
        name: info?.name || `Region ${code - 2000}`,
        first: ymd(r?.["4"] || r?.["7"]),
        last: ymd(r?.["5"]),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
  return { variation_count, countries, content_js_urls };
}

// ---------- Promoted app metadata (Google Play listing) ----------

// The Play details page embeds a JSON-LD <script type="application/ld+json">
// SoftwareApplication block with a clean title, icon, rating and developer.
async function resolveAppMeta(pkg) {
  const res = await fetch(
    `https://play.google.com/store/apps/details?id=${encodeURIComponent(pkg)}&hl=en&gl=US`,
    { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" } }
  );
  if (!res.ok) throw new Error(`Play HTTP ${res.status}`);
  const html = await res.text();

  let ld = null;
  for (const m of html.matchAll(
    /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g
  )) {
    try {
      const j = JSON.parse(m[1]);
      if (j && (j["@type"] === "SoftwareApplication" || j.applicationCategory || (j.name && j.image))) {
        ld = j;
        break;
      }
    } catch (_) {}
  }
  const og = (p) =>
    (html.match(new RegExp('<meta property="' + p + '" content="([^"]+)"')) || [])[1] || null;

  const image = typeof ld?.image === "string" ? ld.image : ld?.image?.url || null;
  const rv = ld?.aggregateRating?.ratingValue;
  const rc = ld?.aggregateRating?.ratingCount;
  return {
    package: pkg,
    title: ld?.name || (og("og:title") || "").replace(/ - Apps on Google Play$/, "") || null,
    icon_url: image || og("og:image") || null,
    developer: ld?.author?.name || null,
    rating: rv != null && rv !== "" ? Math.round(Number(rv) * 100) / 100 : null,
    rating_count: rc != null && rc !== "" ? Number(rc) : null,
    genre: ld?.applicationCategory || null,
  };
}

// ---------- ZIP builder (pure JS, "store" method - assets are already compressed) ----------

let CRC_TABLE;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// files: [{ name, data: Uint8Array }] -> Uint8Array of a valid .zip
function makeZip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(8, 0, true); // store
    lh.setUint32(14, crc, true);
    lh.setUint32(18, size, true);
    lh.setUint32(22, size, true);
    lh.setUint16(26, nameBytes.length, true);
    parts.push(new Uint8Array(lh.buffer), nameBytes, f.data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(10, 0, true); // store
    cd.setUint32(16, crc, true);
    cd.setUint32(20, size, true);
    cd.setUint32(24, size, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), nameBytes);
    offset += 30 + nameBytes.length + size;
  }
  let centralSize = 0;
  for (const c of central) centralSize += c.length;
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  let total = 0;
  for (const a of all) total += a.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

function extFrom(ct, u) {
  ct = (ct || "").toLowerCase();
  if (ct.includes("png")) return "png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("mp4")) return "mp4";
  const m = (u.match(/\.(png|jpe?g|webp|gif|mp4)(?:[?#]|$)/i) || [])[1];
  return (m || "jpg").toLowerCase().replace("jpeg", "jpg");
}
const safeName = (s) => String(s || "assets").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "assets";

// quote a CSV cell only when it contains a comma, quote or newline
const csvCell = (s) => {
  s = String(s == null ? "" : s);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
function countriesCsv(list) {
  const lines = ["code,country,first_shown,last_shown"];
  for (const c of list) lines.push([c.cc, csvCell(c.name), c.first || "", c.last || ""].join(","));
  return lines.join("\r\n") + "\r\n";
}

// Merge a creative's per-country rows into an app-level {cc -> {cc,name,first,last}} map
function mergeCountries(map, list) {
  for (const c of Array.isArray(list) ? list : []) {
    if (!c || !c.cc) continue;
    const prev = map.get(c.cc);
    if (!prev) {
      map.set(c.cc, { cc: c.cc, name: c.name, first: c.first || null, last: c.last || null });
    } else {
      if (c.last && (!prev.last || c.last > prev.last)) prev.last = c.last;
      if (c.first && (!prev.first || c.first < prev.first)) prev.first = c.first;
    }
  }
}

// ---------- Supabase (PostgREST) ----------

const sb = (env) => ({
  headers: (extra = {}) => ({
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  }),
  url: env.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1",
});

async function upsert(env, table, rows) {
  if (!rows.length) return;
  const s = sb(env);
  const r = await fetch(`${s.url}/${table}`, {
    method: "POST",
    headers: s.headers({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`Supabase upsert ${table} ${r.status}: ${await r.text()}`);
}

async function patchRow(env, table, filter, values) {
  const s = sb(env);
  const r = await fetch(`${s.url}/${table}?${filter}`, {
    method: "PATCH",
    headers: s.headers({ Prefer: "return=minimal" }),
    body: JSON.stringify(values),
  });
  if (!r.ok) throw new Error(`Supabase patch ${table} ${r.status}`);
}

async function selectRows(env, table, query) {
  const s = sb(env);
  const r = await fetch(`${s.url}/${table}?${query}`, {
    headers: s.headers({ Prefer: "count=exact" }),
  });
  if (!r.ok) throw new Error(`Supabase select ${table} ${r.status}: ${await r.text()}`);
  const count = r.headers.get("content-range")?.split("/")[1] ?? null;
  return { rows: await r.json(), count: count ? Number(count) : null };
}

// ---------- Routes ----------

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Xsrf-Override,X-Cookie-Override,X-User-Agent-Override",
  "Access-Control-Max-Age": "86400",
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (path === "/") {
      return new Response(HTML, { headers: { "Content-Type": "text/html;charset=utf-8" } });
    }

    // config check with a clear message (instead of a cryptic TypeError)
    if (path.startsWith("/api/") && path !== "/api/debug") {
      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY)
        return json({
          error:
            "Worker secrets missing: set SUPABASE_URL and SUPABASE_SERVICE_KEY in " +
            "Settings > Variables and Secrets, then Deploy again",
        }, 500);
    }

    // simple auth for API routes: Authorization: Bearer <DASH_KEY>
    if (env.DASH_KEY) {
      const got = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (got !== env.DASH_KEY) return json({ error: "unauthorized" }, 401);
    }

    try {
      const gEnv = envWithSession(req, env);

      // POST /api/sync-page  { advertiser_id, cursor? } -> fetch ONE page, store it
      if (path === "/api/sync-page" && req.method === "POST") {
        const { advertiser_id, cursor } = await req.json();
        let id = String(advertiser_id || "").trim();
        const m = id.match(/AR\d{10,}/);
        if (m) id = m[0];
        if (!/^AR\d{10,}$/.test(id))
          return json({ error: "Provide an AR... advertiser ID or the advertiser page URL" }, 400);

        const authErr = requireGoogleCredentials(req, gEnv);
        if (authErr) return json({ error: authErr }, 400);

        const tokenOverride = req.headers.get("X-Xsrf-Override") || env.XSRF_TOKEN || null;
        const ua = req.headers.get("X-User-Agent-Override");
        const extraHeaders = ua ? { "User-Agent": ua } : {};
        const page = await fetchPage(id, cursor || null, gEnv, tokenOverride, extraHeaders);
        return json(await storeSyncPage(env, id, page));
      }

      // GET /api/items?acct=&format=&after=&limit=  (list stored rows)
      // Note: neutral path/param names on purpose - ad blockers block URLs
      // containing "creatives"/"advertiser_id". Old path kept for compatibility.
      if (path === "/api/items" || path === "/api/creatives") {
        const advertiser_id =
          url.searchParams.get("acct") || url.searchParams.get("advertiser_id");
        if (!advertiser_id) return json({ error: "acct required" }, 400);
        const format = url.searchParams.get("format");
        const after = url.searchParams.get("after");
        const limit = Math.min(Number(url.searchParams.get("limit")) || 24, 100);
        const parts = [
          `advertiser_id=eq.${encodeURIComponent(advertiser_id)}`,
          "select=id,format,preview_url,content_js_url,asset_urls,app_name,app_package,app_url,video_key,countries,variation_count,first_shown,last_shown,days_shown",
          "order=id.asc",
          `limit=${limit}`,
        ];
        if (format && format !== "all") parts.push(`format=eq.${encodeURIComponent(format)}`);
        if (after) parts.push(`id=gt.${encodeURIComponent(after)}`);
        const { rows, count } = await selectRows(env, "creatives", parts.join("&"));
        return json({ rows, total: count, next_after: rows.length ? rows[rows.length - 1].id : null });
      }

      // GET /api/preview/:id -> resolve media from content.js JSONP, cache on row
      const pm = path.match(/^\/api\/preview\/(.+)$/);
      if (pm) {
        const id = decodeURIComponent(pm[1]);
        const { rows } = await selectRows(
          env,
          "creatives",
          `id=eq.${encodeURIComponent(id)}&select=id,preview_url,asset_urls,content_js_url,app_name,app_package,app_url`
        );
        const row = rows[0];
        if (!row) return json({ error: "not found" }, 404);
        if (!row.content_js_url) return json(row);
        // re-resolve when either the media OR the app info is still missing
        // (empty-string preview_url means a previous attempt ran but found no image)
        if (row.preview_url && row.app_name) return json(row);
        const media = await resolvePreview(row.content_js_url, gEnv);
        await patchRow(env, "creatives", `id=eq.${row.id}`, {
          preview_url: media.preview_url || row.preview_url || "",
          asset_urls: media.asset_urls,
          app_name: media.app_name,
          app_package: media.app_package,
          app_url: media.app_url,
          updated_at: new Date().toISOString(),
        });
        return json({ id: row.id, ...media, preview_url: media.preview_url || row.preview_url || "" });
      }

      // GET /api/resolve?acct=&limit= -> batch-resolve content.js previews so the
      // promoted app name/package/media populate (drives the app-table grouping).
      // Called in a loop by the dashboard; small batches keep us under the
      // Worker subrequest limit and let the UI show progress.
      if (path === "/api/resolve") {
        const advertiser_id =
          url.searchParams.get("acct") || url.searchParams.get("advertiser_id");
        if (!advertiser_id) return json({ error: "acct required" }, 400);
        const limit = Math.min(Number(url.searchParams.get("limit")) || 5, 10);
        // Prefer never-resolved rows; also pick rows that got a thumbnail but no
        // app/headline yet (common for YouTube/web ads after the first pass).
        const filter =
          `advertiser_id=eq.${encodeURIComponent(advertiser_id)}` +
          `&content_js_url=not.is.null&app_name=is.null`;
        const { rows } = await selectRows(
          env,
          "creatives",
          `${filter}&select=id,content_js_url,preview_url&limit=${limit}`
        );
        let resolved = 0,
          failed = 0;
        for (const row of rows) {
          const now = new Date().toISOString();
          try {
            const media = await resolvePreview(row.content_js_url, gEnv);
            await patchRow(env, "creatives", `id=eq.${encodeURIComponent(row.id)}`, {
              preview_url: media.preview_url || row.preview_url || "",
              asset_urls: media.asset_urls,
              // "" marks "looked for a name and found none" so we don't loop forever
              app_name: media.app_name || "",
              app_package: media.app_package,
              app_url: media.app_url,
              updated_at: now,
            });
            resolved++;
          } catch (_) {
            await patchRow(env, "creatives", `id=eq.${encodeURIComponent(row.id)}`, {
              preview_url: row.preview_url || "",
              app_name: "",
              updated_at: now,
            });
            failed++;
          }
        }
        const { count } = await selectRows(env, "creatives", `${filter}&select=id&limit=1`);
        return json({ resolved, failed, remaining: count ?? 0 });
      }

      // GET /api/download?acct=&package=  (or &id= / &name= / &url=) -> a .zip of
      // all image/media assets for an app (or a single creative), built server-side.
      if (path === "/api/download") {
        const advertiser_id =
          url.searchParams.get("acct") || url.searchParams.get("advertiser_id");
        const id = url.searchParams.get("id");
        const pkg = url.searchParams.get("package");
        const appName = url.searchParams.get("name");
        const appUrl = url.searchParams.get("url");
        const orphan = url.searchParams.get("orphan") === "1";

        const SELECT = "select=id,format,preview_url,asset_urls,content_js_url,video_key,countries";
        let parts, label;
        if (id) {
          parts = [`id=eq.${encodeURIComponent(id)}`, SELECT, "limit=1"];
          label = id;
        } else {
          if (!advertiser_id) return json({ error: "acct required" }, 400);
          parts = [`advertiser_id=eq.${encodeURIComponent(advertiser_id)}`, SELECT, "limit=5000"];
          if (pkg) { parts.push(`app_package=eq.${encodeURIComponent(pkg)}`); label = pkg; }
          else if (appUrl) { parts.push(`app_url=eq.${encodeURIComponent(appUrl)}`); label = appName || "app"; }
          else if (appName) { parts.push(`app_name=eq.${encodeURIComponent(appName)}`); label = appName; }
          else if (orphan) {
            parts.push("app_package=is.null");
            parts.push("or=(app_name.is.null,app_name.eq.)");
            label = "unassigned";
          } else return json({ error: "package, id, url, name or orphan=1 required" }, 400);
        }
        const { rows } = await selectRows(env, "creatives", parts.join("&"));

        const fh = { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", Cookie: buildCookie(gEnv) };
        // caps keep us under the Worker subrequest (~50) and memory limits;
        // videos cost 2 subrequests each (content.js + the stream)
        const MAX_VIDEOS = 8, MAX_IMAGES = 24;

        const imgSet = new Set();
        const vidRows = [];
        const seenVideo = new Set();
        for (const r of rows) {
          if (r.preview_url) imgSet.add(r.preview_url);
          for (const u of Array.isArray(r.asset_urls) ? r.asset_urls : []) imgSet.add(u);
          if (r.content_js_url && (r.format === "video" || rows.length === 1)) {
            const k = r.video_key || r.id;
            if (!seenVideo.has(k)) { seenVideo.add(k); vidRows.push(r); }
          }
        }
        const images = [...imgSet]
          .filter((u) => /^https?:\/\//.test(u))
          .filter(
            (u) =>
              /\.(png|jpe?g|webp|gif)(?:[?#]|$)/i.test(u) ||
              /lh3\.googleusercontent|play-lh|simgad|ytimg\.com\/vi/.test(u)
          )
          .filter((u) => !/youtube\.com\/watch|\/\/tpc\.googlesyndication\.com\/?$/.test(u))
          .slice(0, MAX_IMAGES);

        const files = [];
        const enc = new TextEncoder();

        // videos: fetch content.js live -> extract the signed stream -> download mp4
        const vres = await Promise.all(
          vidRows.slice(0, MAX_VIDEOS).map(async (r) => {
            try {
              const cjs = await fetch(r.content_js_url, { headers: fh });
              if (!cjs.ok) return null;
              const info = parseVideo(await cjs.text());
              if (info.video_url) {
                const vr = await fetch(info.video_url, { headers: fh });
                if (vr.ok) {
                  const data = new Uint8Array(await vr.arrayBuffer());
                  if (data.length) return { id: r.id, data };
                }
              }
              if (info.youtube_id)
                return { id: r.id, yt: `https://www.youtube.com/watch?v=${info.youtube_id}` };
              return null;
            } catch (_) {
              return null;
            }
          })
        );
        for (const v of vres) {
          if (!v) continue;
          if (v.data) files.push({ name: `video-${v.id}.mp4`, data: v.data });
          else if (v.yt) files.push({ name: `video-${v.id}-youtube.txt`, data: enc.encode(v.yt + "\n") });
        }

        // images from the stored asset URLs
        const ires = await Promise.all(
          images.map(async (u) => {
            try {
              const r = await fetch(u, { headers: fh });
              if (!r.ok) return null;
              const data = new Uint8Array(await r.arrayBuffer());
              return data.length ? { u, data, ct: r.headers.get("content-type") } : null;
            } catch (_) {
              return null;
            }
          })
        );
        let i = 0;
        for (const f of ires) {
          if (!f) continue;
          files.push({ name: "img-" + String(++i).padStart(3, "0") + "." + extFrom(f.ct, f.u), data: f.data });
        }

        // running-campaign country list, bundled as a CSV
        const cmap = new Map();
        for (const r of rows) mergeCountries(cmap, r.countries);
        if (cmap.size) {
          const csv = countriesCsv([...cmap.values()].sort((a, b) => a.name.localeCompare(b.name)));
          files.push({ name: "countries.csv", data: enc.encode(csv) });
        }

        if (!files.length) return json({ error: "no downloadable assets for this app" }, 404);

        const zip = makeZip(files);
        return new Response(zip, {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${safeName(label)}-assets.zip"`,
            ...CORS,
          },
        });
      }

      // GET /api/geo/:id -> fetch & cache variations + running-campaign countries
      const gm = path.match(/^\/api\/geo\/(.+)$/);
      if (gm) {
        const id = decodeURIComponent(gm[1]);
        const { rows } = await selectRows(
          env,
          "creatives",
          `id=eq.${encodeURIComponent(id)}&select=id,advertiser_id,content_js_url,countries,variation_count,video_key,detail_synced_at`
        );
        const row = rows[0];
        if (!row) return json({ error: "not found" }, 404);
        if (row.detail_synced_at)
          return json({ id: row.id, countries: row.countries || [], variation_count: row.variation_count, video_key: row.video_key });
        const raw = await lookupCreative(row.advertiser_id, id, gEnv);
        const d = parseCreativeDetail(raw);
        const video_key = row.video_key || videoKeyFrom(row.content_js_url, id);
        await patchRow(env, "creatives", `id=eq.${row.id}`, {
          countries: d.countries,
          variation_count: d.variation_count,
          video_key,
          detail_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        return json({ id: row.id, countries: d.countries, variation_count: d.variation_count, video_key });
      }

      // GET /api/app-meta/:package -> resolve & cache Google Play metadata
      // (icon, official title, rating, developer). Re-resolves weekly.
      const amp = path.match(/^\/api\/app-meta\/(.+)$/);
      if (amp) {
        const pkg = decodeURIComponent(amp[1]);
        if (!/^[a-zA-Z0-9._]+$/.test(pkg)) return json({ error: "bad package id" }, 400);
        const { rows } = await selectRows(
          env,
          "apps",
          `package=eq.${encodeURIComponent(pkg)}&select=package,title,icon_url,developer,rating,rating_count,genre,play_resolved_at`
        );
        const existing = rows[0];
        const fresh =
          existing?.play_resolved_at &&
          Date.now() - new Date(existing.play_resolved_at).getTime() < 7 * 864e5;
        if (fresh) return json({ ...existing, resolved: true });
        let meta;
        try {
          meta = await resolveAppMeta(pkg);
        } catch (e) {
          if (existing) return json({ ...existing, resolved: true, stale: true });
          throw e;
        }
        const now = new Date().toISOString();
        await upsert(env, "apps", [{ ...meta, play_resolved_at: now, updated_at: now }]);
        return json({ ...meta, play_resolved_at: now, resolved: true });
      }

      // GET /api/app?acct=&package=  (or &name= / &url=) -> one app's unique
      // videos with full assets + per-video country data, for the detail page.
      if (path === "/api/app") {
        const advertiser_id =
          url.searchParams.get("acct") || url.searchParams.get("advertiser_id");
        if (!advertiser_id) return json({ error: "acct required" }, 400);
        const pkg = url.searchParams.get("package");
        const appName = url.searchParams.get("name");
        const appUrl = url.searchParams.get("url");
        const orphan = url.searchParams.get("orphan") === "1";
        const parts = [
          `advertiser_id=eq.${encodeURIComponent(advertiser_id)}`,
          "select=id,format,preview_url,content_js_url,asset_urls,app_name,app_package,app_url,video_key,countries,first_shown,last_shown,days_shown,detail_synced_at",
          "order=last_shown.desc.nullslast",
          "limit=5000",
        ];
        if (pkg) parts.push(`app_package=eq.${encodeURIComponent(pkg)}`);
        else if (appUrl) parts.push(`app_url=eq.${encodeURIComponent(appUrl)}`);
        else if (appName) parts.push(`app_name=eq.${encodeURIComponent(appName)}`);
        else if (orphan) {
          // creatives with no Play package and no usable title/headline
          parts.push("app_package=is.null");
          parts.push("or=(app_name.is.null,app_name.eq.)");
        } else return json({ error: "package, url, name or orphan=1 required" }, 400);
        const { rows } = await selectRows(env, "creatives", parts.join("&"));

        const videos = new Map();
        const countries = new Map();
        const formats = new Set();
        let first_seen = null,
          last_seen = null;
        for (const r of rows) {
          if (r.first_shown && (!first_seen || r.first_shown < first_seen)) first_seen = r.first_shown;
          if (r.last_shown && (!last_seen || r.last_shown > last_seen)) last_seen = r.last_shown;
          if (r.format) formats.add(r.format);
          mergeCountries(countries, r.countries);
          const vkey = r.video_key || videoKeyFrom(r.content_js_url, r.id);
          if (!videos.has(vkey))
            videos.set(vkey, {
              video_key: vkey,
              id: r.id,
              format: r.format,
              preview_url: r.preview_url || null,
              content_js_url: r.content_js_url || null,
              asset_urls: Array.isArray(r.asset_urls) ? r.asset_urls : [],
              countries: Array.isArray(r.countries) ? r.countries : [],
              detail_synced: Boolean(r.detail_synced_at),
              first_shown: r.first_shown,
              last_shown: r.last_shown,
              days_shown: r.days_shown,
              creative_ids: [],
            });
          const v = videos.get(vkey);
          v.creative_ids.push(r.id);
          if (!v.preview_url && r.preview_url) { v.preview_url = r.preview_url; v.id = r.id; }
          if ((!v.asset_urls || !v.asset_urls.length) && Array.isArray(r.asset_urls) && r.asset_urls.length)
            v.asset_urls = r.asset_urls;
          if (!v.detail_synced && Array.isArray(r.countries) && r.countries.length) {
            v.countries = r.countries;
            v.detail_synced = Boolean(r.detail_synced_at);
          }
        }

        let meta = null;
        if (pkg) {
          const { rows: mrows } = await selectRows(
            env,
            "apps",
            `package=eq.${encodeURIComponent(pkg)}&select=package,title,icon_url,developer,rating,rating_count,genre,play_resolved_at`
          );
          meta = mrows[0] || null;
        }
        let advertiserName = null;
        if (orphan || (!pkg && !appName && !appUrl)) {
          try {
            const { rows: ars } = await selectRows(
              env,
              "advertisers",
              `id=eq.${encodeURIComponent(advertiser_id)}&select=name&limit=1`
            );
            advertiserName = ars[0]?.name || null;
          } catch (_) {}
        }
        const first = rows[0] || {};
        const thumb =
          [...videos.values()].find((v) => v.preview_url && /ytimg|googleusercontent|simgad/.test(v.preview_url))
            ?.preview_url || null;
        return json({
          app: {
            app_package: pkg || first.app_package || null,
            app_url:
              (pkg ? `https://play.google.com/store/apps/details?id=${pkg}` : first.app_url) || null,
            title:
              meta?.title ||
              appName ||
              first.app_name ||
              pkg ||
              advertiserName ||
              "Unassigned creatives",
            app_name: first.app_name || appName || null,
            icon_url: meta?.icon_url || thumb || null,
            developer: meta?.developer || null,
            rating: meta?.rating ?? null,
            rating_count: meta?.rating_count ?? null,
            genre: meta?.genre || null,
            resolved: Boolean(meta?.play_resolved_at),
            orphan: Boolean(orphan),
            first_seen,
            last_seen,
            formats: [...formats],
            video_count: videos.size,
            creative_count: rows.length,
            countries: [...countries.values()].sort((a, b) => a.name.localeCompare(b.name)),
          },
          videos: [...videos.values()],
        });
      }

      // GET /api/apps?acct=&format= -> promoted apps (grouped by bundle id) with
      // aggregate dates, unique-video counts, country union and Play metadata.
      if (path === "/api/apps") {
        const advertiser_id =
          url.searchParams.get("acct") || url.searchParams.get("advertiser_id");
        if (!advertiser_id) return json({ error: "acct required" }, 400);
        const format = url.searchParams.get("format");
        const country = url.searchParams.get("country");
        const parts = [
          `advertiser_id=eq.${encodeURIComponent(advertiser_id)}`,
          "select=id,format,preview_url,content_js_url,app_name,app_package,app_url,video_key,countries,first_shown,last_shown,days_shown,detail_synced_at",
          "order=last_shown.desc.nullslast",
          "limit=5000",
        ];
        if (format && format !== "all") parts.push(`format=eq.${encodeURIComponent(format)}`);
        const { rows } = await selectRows(env, "creatives", parts.join("&"));

        // advertiser display name - used when creatives have no Play package/headline
        let advertiserName = null;
        try {
          const { rows: ars } = await selectRows(
            env,
            "advertisers",
            `id=eq.${encodeURIComponent(advertiser_id)}&select=id,name&limit=1`
          );
          advertiserName = ars[0]?.name || null;
        } catch (_) {}

        const apps = new Map();
        let unresolved_previews = 0;
        for (const r of rows) {
          // null app_name means content.js was never fully parsed for a title
          if (r.app_name == null && r.content_js_url) unresolved_previews++;
          // empty string = looked and found nothing; treat as missing for grouping
          const name = r.app_name || null;
          const pkg = r.app_package || null;
          const aurl = r.app_url || null;
          // combine by unique bundle id first; then headline/YouTube title; then
          // advertiser name for remaining YouTube/web ads (never "Unknown app")
          const appKey =
            pkg || aurl || name || (advertiserName ? "adv:" + advertiser_id : "unknown");
          if (!apps.has(appKey))
            apps.set(appKey, {
              app_key: appKey,
              app_url: aurl,
              app_name: name,
              app_package: pkg,
              videos: new Map(),
              countries: new Map(),
              formats: new Set(),
              first_seen: null,
              last_seen: null,
              creative_count: 0,
            });
          const a = apps.get(appKey);
          a.app_name = a.app_name || name;
          a.app_url = a.app_url || aurl;
          a.app_package = a.app_package || pkg;
          a.creative_count++;
          if (r.format) a.formats.add(r.format);
          if (r.first_shown && (!a.first_seen || r.first_shown < a.first_seen)) a.first_seen = r.first_shown;
          if (r.last_shown && (!a.last_seen || r.last_shown > a.last_seen)) a.last_seen = r.last_shown;
          mergeCountries(a.countries, r.countries);

          const vkey = r.video_key || videoKeyFrom(r.content_js_url, r.id);
          if (!a.videos.has(vkey))
            a.videos.set(vkey, {
              id: r.id,
              preview_url: r.preview_url || null,
              detail_synced: Boolean(r.detail_synced_at),
            });
          const v = a.videos.get(vkey);
          if (!v.preview_url && r.preview_url) { v.preview_url = r.preview_url; v.id = r.id; }
          if (!v.detail_synced) v.detail_synced = Boolean(r.detail_synced_at);
        }

        // join cached Google Play metadata (icon/title/rating) by package
        const pkgs = [...apps.values()].map((a) => a.app_package).filter(Boolean);
        const meta = {};
        if (pkgs.length) {
          const inList = pkgs.map(encodeURIComponent).join(",");
          const { rows: mrows } = await selectRows(
            env,
            "apps",
            `package=in.(${inList})&select=package,title,icon_url,developer,rating,rating_count,genre,play_resolved_at`
          );
          for (const m of mrows) meta[m.package] = m;
        }

        let out = [...apps.values()].map((a) => {
          const m = a.app_package ? meta[a.app_package] : null;
          const countries = [...a.countries.values()].sort((x, y) => x.name.localeCompare(y.name));
          const unresolved = [];
          for (const v of a.videos.values()) if (!v.detail_synced) unresolved.push(v.id);
          const isAdvFallback = String(a.app_key).startsWith("adv:");
          const thumb =
            [...a.videos.values()].find((v) => v.preview_url && /ytimg|googleusercontent|simgad/.test(v.preview_url))
              ?.preview_url || null;
          return {
            app_key: a.app_key,
            app_package: a.app_package,
            app_url:
              a.app_url ||
              (a.app_package ? `https://play.google.com/store/apps/details?id=${a.app_package}` : null),
            title:
              m?.title ||
              a.app_name ||
              a.app_package ||
              (isAdvFallback ? advertiserName : null) ||
              advertiserName ||
              "Unassigned creatives",
            app_name: a.app_name,
            icon_url: m?.icon_url || thumb || null,
            developer: m?.developer || null,
            rating: m?.rating ?? null,
            rating_count: m?.rating_count ?? null,
            genre: m?.genre || null,
            resolved: Boolean(m?.play_resolved_at),
            orphan: isAdvFallback || (!a.app_package && !a.app_name),
            video_count: a.videos.size,
            creative_count: a.creative_count,
            formats: [...a.formats],
            first_seen: a.first_seen,
            last_seen: a.last_seen,
            countries,
            country_count: countries.length,
            unresolved_geo: unresolved.slice(0, 60),
          };
        });

        const allC = new Map();
        for (const a of out)
          for (const c of a.countries) if (!allC.has(c.cc)) allC.set(c.cc, { cc: c.cc, name: c.name });
        const all_countries = [...allC.values()].sort((x, y) => x.name.localeCompare(y.name));

        if (country && country !== "all")
          out = out.filter((a) => a.countries.some((c) => c.cc === country));

        out.sort(
          (x, y) =>
            (y.last_seen || "").localeCompare(x.last_seen || "") || y.video_count - x.video_count
        );
        return json({
          apps: out,
          all_countries,
          creatives_scanned: rows.length,
          unresolved_previews,
        });
      }

      // GET /api/debug?advertiser_id=AR... -> shows exactly what Google serves this Worker
      if (path === "/api/debug") {
        const id = (url.searchParams.get("advertiser_id") || "").match(/AR\d{10,}/)?.[0]
          || "AR02377450198621224961";
        const r = await fetchAdvertiserPage(id, gEnv);
        const html = await r.text();
        return json({
          request_url: `${BASE}/advertiser/${id}`,
          final_url_after_redirects: r.url,
          status: r.status,
          html_length: html.length,
          token_found: /xsrfToken/i.test(html),
          looks_like_consent_page: /consent\.google|before you continue/i.test(html),
          html_first_400_chars: html.slice(0, 400),
          overrides_active: {
            XSRF_TOKEN: Boolean(env.XSRF_TOKEN || req.headers.get("X-Xsrf-Override")),
            TRANSPARENCY_COOKIE: Boolean(
              env.TRANSPARENCY_COOKIE || req.headers.get("X-Cookie-Override")
            ),
          },
        });
      }

      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: String(e.message || e) }, 500);
    }
  },
};

// ---------- Dashboard (served at /) ----------

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Creative Light Table</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet">
<style>
  :root{--surface:#e9ebee;--card:#fff;--ink:#16181d;--ink-soft:#5b626e;--line:#d5d9df;
    --cobalt:#1f3fd4;--cobalt-soft:#e7ebfc;--ok:#0d7a4f;--bad:#b3261e;--amber:#b8860b;--radius:10px}
  *{box-sizing:border-box}
  body{margin:0;background:var(--surface);color:var(--ink);font:15px/1.5 Inter,system-ui,sans-serif}
  a{color:var(--cobalt)}
  header{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;padding:24px 32px 0}
  h1{font:800 26px/1 Archivo,sans-serif;letter-spacing:-.02em;margin:0}
  h1 span{color:var(--cobalt)}
  .sub{color:var(--ink-soft);font-size:13px}
  .bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:14px 32px 0}
  input[type=text],select{padding:11px 14px;border:1px solid var(--line);border-radius:var(--radius);
    font:14px/1 "IBM Plex Mono",monospace;background:var(--card);color:var(--ink)}
  input[type=text]{flex:1;min-width:260px}
  input[type=text]:focus,select:focus{outline:2px solid var(--cobalt);outline-offset:1px;border-color:transparent}
  button{padding:11px 18px;border:0;border-radius:var(--radius);background:var(--cobalt);
    color:#fff;font:600 14px Inter,sans-serif;cursor:pointer}
  button:hover{filter:brightness(1.08)}
  button:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
  button.ghost{background:var(--card);color:var(--ink);border:1px solid var(--line)}
  button:disabled{opacity:.5;cursor:default}
  #console{display:none;margin:14px 32px 0;padding:10px 14px;background:var(--ink);color:#dfe3ea;
    border-radius:var(--radius);font:500 13px "IBM Plex Mono",monospace}
  #console.on{display:flex;gap:18px;flex-wrap:wrap}
  #console .dot{color:var(--cobalt-soft)}
  #console.done{background:var(--ok)} #console.failed{background:var(--bad);color:#fff}

  /* ---- toolbar ---- */
  .toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:14px 32px 4px}
  .toolbar input[type=text]{min-width:200px;flex:0 1 320px}
  .count{margin-left:auto;font:500 13px "IBM Plex Mono",monospace;color:var(--ink-soft)}
  .resolving{font:500 12px "IBM Plex Mono",monospace;color:var(--cobalt)}

  /* ---- app table ---- */
  .wrap{padding:12px 32px 40px}
  table{width:100%;border-collapse:separate;border-spacing:0;background:var(--card);
    border:1px solid var(--line);border-radius:12px;overflow:hidden}
  thead th{text-align:left;font:600 12px Inter;text-transform:uppercase;letter-spacing:.05em;
    color:var(--ink-soft);padding:12px 14px;background:#f4f5f7;border-bottom:1px solid var(--line);white-space:nowrap}
  thead th.num{text-align:right}
  thead th.sortable{cursor:pointer;user-select:none}
  thead th.sortable:hover{color:var(--ink)}
  thead th.sortable .sortind{font:600 10px "IBM Plex Mono",monospace;margin-left:4px;color:var(--ink-soft);opacity:.45}
  thead th.sortable.active{color:var(--cobalt)}
  thead th.sortable.active .sortind{opacity:1;color:var(--cobalt)}
  tbody td{padding:11px 14px;border-bottom:1px solid var(--line);vertical-align:middle}
  tbody tr{cursor:pointer}
  tbody tr:last-child td{border-bottom:0}
  tbody tr:hover{background:#f7f8fa}
  td.num{text-align:right;font:500 13px "IBM Plex Mono",monospace;color:var(--ink)}
  .idx{color:var(--ink-soft);font:500 12px "IBM Plex Mono",monospace}
  .appcell{display:flex;align-items:center;gap:12px;min-width:240px}
  .icon{width:44px;height:44px;border-radius:11px;flex:none;object-fit:cover;background:var(--surface);
    border:1px solid var(--line)}
  .icon.ph{display:flex;align-items:center;justify-content:center;font:700 15px Archivo;color:var(--ink-soft)}
  .appinfo{min-width:0}
  .aptitle{font:600 14px Inter;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px}
  .appkg{font:500 11px "IBM Plex Mono",monospace;color:var(--ink-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px}
  .appsub{display:flex;gap:8px;align-items:center;margin-top:1px}
  .rating{font:600 11px Inter;color:var(--amber);white-space:nowrap}
  .dev{font:500 11px Inter;color:var(--ink-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px}
  .date{font:500 12px "IBM Plex Mono",monospace;color:var(--ink);white-space:nowrap}
  .ccwrap{display:flex;flex-wrap:wrap;gap:4px;align-items:center;max-width:260px}
  .cc{font:600 10px "IBM Plex Mono",monospace;background:var(--cobalt-soft);color:var(--cobalt);border-radius:4px;padding:2px 5px}
  .cc.more{background:var(--surface);color:var(--ink-soft)}
  .ccnone{font:500 11px "IBM Plex Mono",monospace;color:var(--ink-soft)}
  .badge{font:600 10px Inter;text-transform:uppercase;letter-spacing:.05em;padding:2px 7px;border-radius:5px;
    background:var(--cobalt-soft);color:var(--cobalt)}
  .badge.video{background:#fdeeea;color:#b3421e}
  .badge.text{background:#eef7ef;color:var(--ok)}
  .fmts{display:flex;gap:4px;flex-wrap:wrap}
  .dlcell{text-align:right;white-space:nowrap;display:flex;gap:6px;justify-content:flex-end;align-items:center}
  .csvbtn{background:var(--card);color:var(--ink-soft);border:1px solid var(--line);border-radius:8px;
    padding:6px 9px;cursor:pointer;font:600 11px Inter}
  .csvbtn:hover{color:var(--ok);border-color:var(--ok);background:#eef7ef}
  .dlbtn{background:var(--card);color:var(--ink-soft);border:1px solid var(--line);border-radius:8px;
    padding:6px 8px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;line-height:0}
  .dlbtn:hover{color:var(--cobalt);border-color:var(--cobalt);background:var(--cobalt-soft)}
  .dlbtn:disabled{opacity:.6;cursor:default}
  .dlbtn svg{display:block}
  .spin{display:inline-block;width:14px;height:14px;border:2px solid var(--line);border-top-color:var(--cobalt);
    border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle}
  @keyframes spin{to{transform:rotate(360deg)}}
  .playbtn.dl{background:var(--card);color:var(--cobalt);border:1px solid var(--line);cursor:pointer;
    display:inline-flex;align-items:center;gap:6px}
  .playbtn.dl:hover{background:var(--cobalt-soft)}

  /* ---- detail page ---- */
  .back{display:inline-flex;align-items:center;gap:6px;background:var(--card);color:var(--ink);
    border:1px solid var(--line);margin:14px 32px 0}
  .dhead{display:flex;gap:18px;align-items:flex-start;padding:16px 32px 6px;flex-wrap:wrap}
  .dicon{width:84px;height:84px;border-radius:19px;flex:none;object-fit:cover;background:var(--surface);border:1px solid var(--line)}
  .dmeta{min-width:0;flex:1}
  .dtitle{font:800 24px/1.1 Archivo,sans-serif;letter-spacing:-.02em;margin:0}
  .dpkg{font:500 12px "IBM Plex Mono",monospace;color:var(--ink-soft);margin-top:4px;word-break:break-all}
  .drow{display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin-top:8px;font-size:13px;color:var(--ink-soft)}
  .drow b{color:var(--ink)}
  .dstat{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:6px 12px;font:500 12px "IBM Plex Mono",monospace}
  .dstat b{font-family:Inter}
  .playbtn{background:var(--cobalt);color:#fff;text-decoration:none;padding:8px 14px;border-radius:8px;font:600 13px Inter}
  .dcc{padding:2px 32px 8px}
  .dcc .ccwrap{max-width:none}
  .dsec{font:700 14px Archivo;padding:14px 32px 4px;color:var(--ink)}

  /* ---- creative cards (detail assets) ---- */
  .grid{display:grid;gap:14px;padding:8px 32px 40px;grid-template-columns:repeat(auto-fill,minmax(230px,1fr))}
  .card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;display:flex;flex-direction:column}
  .thumb{aspect-ratio:4/3;background:repeating-conic-gradient(#f3f4f6 0% 25%,#e9ebee 0% 50%) 0 0/20px 20px;
    display:flex;align-items:center;justify-content:center;overflow:hidden}
  .thumb img{width:100%;height:100%;object-fit:contain}
  .thumb .noimg{font:500 12px "IBM Plex Mono",monospace;color:var(--ink-soft)}
  .cmeta{display:flex;align-items:center;gap:8px;padding:9px 12px;border-top:1px solid var(--line)}
  .cmeta .cid{font:500 11px "IBM Plex Mono",monospace;color:var(--ink-soft);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .cmeta a{color:var(--cobalt);font:600 12px Inter;text-decoration:none}
  .dupe{font:600 10px "IBM Plex Mono",monospace;background:var(--surface);color:var(--ink-soft);border-radius:4px;padding:2px 6px}
  .assets{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 8px}
  .assets a{font:600 11px Inter;text-decoration:none;color:var(--cobalt);background:var(--cobalt-soft);border-radius:5px;padding:3px 8px}
  .assets a.vid{background:#fdeeea;color:#b3421e}
  .cgeo{display:flex;flex-wrap:wrap;gap:4px;align-items:center;padding:8px 12px 10px;border-top:1px solid var(--line)}
  .cgeo .geocount{font:600 11px Inter;color:var(--ink);margin-right:2px}
  .geoload,.geonone{font:500 11px "IBM Plex Mono",monospace;color:var(--ink-soft)}
  .dates{display:flex;justify-content:space-between;gap:8px;padding:0 12px 9px;font:500 11px "IBM Plex Mono",monospace;color:var(--ink-soft)}
  .days{background:var(--surface);border-radius:5px;padding:1px 6px}

  .empty{padding:60px 32px;text-align:center;color:var(--ink-soft)}
  .hidden{display:none !important}
  .modal{position:fixed;inset:0;background:rgba(22,24,29,.45);display:flex;align-items:center;justify-content:center;padding:24px;z-index:100}
  .modal-box{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:22px 24px;max-width:720px;width:100%;box-shadow:0 20px 50px rgba(0,0,0,.12)}
  .modal-box h2{margin:0 0 8px;font:700 18px Archivo,sans-serif}
  .modal-hint{margin:0 0 12px;font-size:13px;color:var(--ink-soft);line-height:1.45}
  .modal-box textarea{width:100%;min-height:180px;resize:vertical;font:12px/1.45 "IBM Plex Mono",monospace;padding:12px;border:1px solid var(--line);border-radius:var(--radius)}
  .modal-status{min-height:20px;margin:10px 0 0;font:500 12px "IBM Plex Mono",monospace;color:var(--ok)}
  .modal-status.bad{color:var(--bad)}
  .modal-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
  .auth-hint{margin:0 32px;padding:10px 14px;background:#fff8e6;border:1px solid #f0d080;border-radius:var(--radius);font:500 13px Inter;color:#6b4e00}
  .auth-hint.ok{background:#eef7ef;border-color:#a8d5b8;color:var(--ok)}
  @media (prefers-reduced-motion:no-preference){.card{transition:transform .12s ease}.card:hover{transform:translateY(-2px)}}
</style>
</head>
<body>
<header>
  <h1>Creative <span>Light Table</span></h1>
  <div class="sub">Google Ads Transparency &rarr; Supabase &middot; app-level intelligence</div>
</header>

<div class="bar">
  <input id="workerUrl" type="text" placeholder="Worker URL &mdash; https://your-worker.workers.dev"
    aria-label="Worker URL" value="https://google-trans.arya-appscale.workers.dev">
  <button id="saveWorker" class="ghost">Save</button>
</div>
<div class="bar">
  <input id="advInput" type="text"
    placeholder="Paste advertiser URL or ID &mdash; e.g. AR02377450198621224961" aria-label="Advertiser URL or ID">
  <button id="syncBtn">Sync ads</button>
  <button id="autoScrapeBtn" class="ghost" title="Automatically fetch all pages (20 ads each, ~90s apart)">Auto scrape</button>
  <button id="loadBtn" class="ghost">Load apps</button>
  <button id="tokenBtn" class="ghost" title="Paste cURL from DevTools — auto-fills token and cookie">Paste curl</button>
  <button id="downloadCurlBtn" class="ghost" title="Download curl.txt for scrape-local.mjs">Download curl.txt</button>
</div>
<p id="authHint" class="auth-hint hidden" role="status"></p>
<div id="console" role="status"></div>

<div id="curlModal" class="modal hidden" role="dialog" aria-labelledby="curlTitle" aria-modal="true">
  <div class="modal-box">
    <h2 id="curlTitle">Paste cURL from DevTools</h2>
    <p class="modal-hint">Open adstransparency.google.com → DevTools → Network → SearchCreatives → right-click → <b>Copy as cURL</b>. Token and Cookie are parsed automatically.</p>
    <textarea id="curlInput" rows="10" spellcheck="false" aria-label="cURL command"
      placeholder="curl 'https://adstransparency.google.com/anji/_/rpc/SearchService/SearchCreatives?authuser=0' \\&#10;  -H 'X-Framework-Xsrf-Token: ...' \\&#10;  -H 'Cookie: ...'"></textarea>
    <div id="curlStatus" class="modal-status"></div>
    <div class="modal-actions">
      <button id="curlSave">Save credentials</button>
      <button id="curlDownload" class="ghost">Download curl.txt</button>
      <button id="curlClear" class="ghost">Clear saved</button>
      <button id="curlClose" class="ghost">Cancel</button>
    </div>
  </div>
</div>

<!-- ===== TABLE VIEW ===== -->
<section id="tableView">
  <div class="toolbar" id="toolbar" hidden>
    <input id="search" type="text" placeholder="Filter by app name or package" aria-label="Search apps">
    <select id="countryFilter" aria-label="Country"><option value="all">All countries</option></select>
    <select id="formatFilter" aria-label="Format">
      <option value="all">All formats</option>
      <option value="video">Video</option>
      <option value="image">Image</option>
      <option value="text">Text</option>
    </select>
    <span class="resolving" id="resolving"></span>
    <button id="fillBtn" class="ghost" title="Resolve app names for stored ads (one small batch per click)">Fill names</button>
    <span class="count" id="count"></span>
  </div>
  <div class="wrap">
    <table id="appTable" hidden>
      <thead><tr>
        <th class="num">#</th>
        <th>App</th>
        <th class="num">Videos</th>
        <th>Formats</th>
        <th class="sortable" data-sort="first_seen" title="Sort by campaign start">Campaign start<span class="sortind"></span></th>
        <th class="sortable" data-sort="last_seen" title="Sort by last visible">Last visible<span class="sortind"></span></th>
        <th>Countries</th>
        <th></th>
      </tr></thead>
      <tbody id="appBody"></tbody>
    </table>
    <div class="empty" id="empty">1) Paste curl (token + cookie) &nbsp; 2) Sync ads or Auto scrape &nbsp; 3) Load apps</div>
  </div>
</section>

<!-- ===== DETAIL VIEW ===== -->
<section id="detailView" class="hidden">
  <button class="back" id="backBtn">&larr; Back to apps</button>
  <div class="dhead" id="dhead"></div>
  <div class="dcc" id="dcc"></div>
  <div class="dsec" id="dsec"></div>
  <div class="grid" id="assets"></div>
</section>

<script>
const $ = (s) => document.querySelector(s);
const PAGE_SIZE = 40;

/* ---------- worker URL + auth ---------- */
function workerBase() {
  const typed = $("#workerUrl").value.trim().replace(/\\/+$/, "");
  const saved = (localStorage.getItem("worker_url") || "").replace(/\\/+$/, "");
  return typed || saved;
}
$("#saveWorker").onclick = () => {
  const v = $("#workerUrl").value.trim().replace(/\\/+$/, "");
  if (!/^https?:\\/\\//.test(v)) return alert("Enter the full worker URL, starting with https://");
  localStorage.setItem("worker_url", v);
  alert("Saved. API calls now go to " + v);
};
(function initWorkerUrl(){
  const saved = localStorage.getItem("worker_url");
  if (saved) $("#workerUrl").value = saved;
  else localStorage.setItem("worker_url", $("#workerUrl").value.trim().replace(/\\/+$/, ""));
})();

function dashKey() {
  let k = localStorage.getItem("dash_key");
  if (k === null) { k = prompt("Dashboard key (leave empty if DASH_KEY is not set):") || ""; localStorage.setItem("dash_key", k); }
  return k;
}

function authHeaders(extra) {
  const h = Object.assign({}, extra || {}, { Authorization: "Bearer " + dashKey() });
  const xt = localStorage.getItem("xsrf_token");
  if (xt) h["X-Xsrf-Override"] = xt;
  const ck = localStorage.getItem("transparency_cookie");
  if (ck) h["X-Cookie-Override"] = ck;
  const ua = localStorage.getItem("google_ua");
  if (ua) h["X-User-Agent-Override"] = ua;
  return h;
}

function maskSecret(s) {
  if (!s) return "";
  if (s.length <= 12) return "••••";
  return s.slice(0, 6) + "…" + s.slice(-4);
}

function parseCurl(text) {
  const out = { token: null, cookie: null, userAgent: null, advertiserIds: [] };
  if (!text || !/\\bcurl\\b/i.test(text)) return out;
  const s = text.replace(/\\\\\\r?\\n/g, " ");
  const headerRe = /(?:-H|--header)\\s+(?:'((?:\\\\'|[^'])*)'|"((?:\\\\"|[^"])*)")/gi;
  let m;
  while ((m = headerRe.exec(s)) !== null) {
    const h = (m[1] || m[2] || "").replace(/\\\\(['"])/g, "$1");
    const colon = h.indexOf(":");
    if (colon < 0) continue;
    const name = h.slice(0, colon).trim().toLowerCase();
    const val = h.slice(colon + 1).trim();
    if (name === "x-framework-xsrf-token" && val) out.token = val;
    else if (name === "cookie" && val) out.cookie = val;
    else if (name === "user-agent" && val) out.userAgent = val;
  }
  if (!out.cookie) {
    const cm = s.match(/(?:--cookie|-b)\\s+(?:'([^']+)'|"([^"]+)"|(\\S+))/i);
    if (cm) out.cookie = (cm[1] || cm[2] || cm[3] || "").replace(/\\\\(['"])/g, "$1");
  }
  const dm = s.match(/(?:--data-raw|--data|-d)\\s+(?:'((?:\\\\'|[^'])*)'|"((?:\\\\"|[^"])*)")/i);
  if (dm) {
    let body = dm[1] || dm[2] || "";
    try { body = decodeURIComponent(body.replace(/^f\\.req=/, "")); } catch (_) {}
    for (const id of body.matchAll(/AR\\d{10,}/g)) {
      if (!out.advertiserIds.includes(id[0])) out.advertiserIds.push(id[0]);
    }
  }
  return out;
}

function hasCredentials() {
  return Boolean(localStorage.getItem("xsrf_token") && localStorage.getItem("transparency_cookie"));
}

function updateAuthHint() {
  const el = $("#authHint");
  if (hasCredentials()) {
    el.textContent = "Credentials saved (token + cookie). Paste curl again if sync fails with 403/429.";
    el.className = "auth-hint ok";
  } else {
    el.textContent = "Required before sync: click Paste curl and save a SearchCreatives cURL from DevTools. Google blocks the worker without your browser session.";
    el.className = "auth-hint";
  }
  el.classList.remove("hidden");
}

function updateAuthBtn() {
  const t = localStorage.getItem("xsrf_token");
  const c = localStorage.getItem("transparency_cookie");
  const parts = [];
  if (t) parts.push("token");
  if (c) parts.push("cookie");
  $("#tokenBtn").textContent = parts.length ? "Paste curl (" + parts.join("+") + ")" : "Paste curl";
  updateAuthHint();
}

function openCurlModal(hint) {
  $("#curlInput").value = "";
  $("#curlStatus").textContent = hint || "";
  $("#curlStatus").className = "modal-status";
  $("#curlModal").classList.remove("hidden");
  $("#curlInput").focus();
}

function closeCurlModal() {
  $("#curlModal").classList.add("hidden");
}

function saveFromCurl() {
  const parsed = parseCurl($("#curlInput").value);
  const status = $("#curlStatus");
  if (!parsed.token && !parsed.cookie) {
    status.textContent = "Could not find X-Framework-Xsrf-Token or Cookie in that cURL.";
    status.className = "modal-status bad";
    return false;
  }
  if (parsed.token) localStorage.setItem("xsrf_token", parsed.token);
  if (parsed.cookie) localStorage.setItem("transparency_cookie", parsed.cookie);
  if (parsed.userAgent) localStorage.setItem("google_ua", parsed.userAgent);
  if (parsed.advertiserIds.length === 1 && !$("#advInput").value.trim())
    $("#advInput").value = parsed.advertiserIds[0];
  const msgs = [];
  if (parsed.token) msgs.push("Token saved (" + maskSecret(parsed.token) + ")");
  if (parsed.cookie) msgs.push("Cookie saved (" + maskSecret(parsed.cookie) + ")");
  if (parsed.advertiserIds.length) msgs.push("Advertiser: " + parsed.advertiserIds.join(", "));
  status.textContent = msgs.join(" · ") + " — wait ~60s before Sync ads.";
  status.className = "modal-status";
  updateAuthBtn();
  return true;
}

$("#tokenBtn").onclick = () => openCurlModal();
$("#curlClose").onclick = closeCurlModal;
$("#curlModal").onclick = (e) => { if (e.target === $("#curlModal")) closeCurlModal(); };
$("#curlSave").onclick = () => { if (saveFromCurl()) setTimeout(closeCurlModal, 1400); };

function buildCurlExport() {
  const token = localStorage.getItem("xsrf_token");
  const cookie = localStorage.getItem("transparency_cookie");
  const ua = localStorage.getItem("google_ua") ||
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:153.0) Gecko/20100101 Firefox/153.0";
  if (!token || !cookie) return null;
  const sh = (s) => String(s).replace(/'/g, "'\\\\''");
  return [
    "curl 'https://adstransparency.google.com/anji/_/rpc/SearchService/SearchCreatives?authuser=0' \\\\",
    "  -X POST \\\\",
    "  -H 'accept: */*' \\\\",
    "  -H 'content-type: application/x-www-form-urlencoded' \\\\",
    "  -H 'x-same-domain: 1' \\\\",
    "  -H 'origin: https://adstransparency.google.com' \\\\",
    "  -H 'referer: https://adstransparency.google.com/' \\\\",
    "  -H 'X-Framework-Xsrf-Token: " + sh(token) + "' \\\\",
    "  -H 'Cookie: " + sh(cookie) + "' \\\\",
    "  -H 'User-Agent: " + sh(ua) + "' \\\\",
    "  --data-raw 'f.req=%7B%7D'",
  ].join("\\n");
}

function downloadCurlTxt() {
  const curl = buildCurlExport();
  if (!curl) {
    alert("Save credentials first: Paste curl from DevTools → Save credentials.");
    return;
  }
  const blob = new Blob([curl], { type: "text/plain" });
  const u = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = u; a.download = "curl.txt"; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 2000);
}

$("#downloadCurlBtn").onclick = downloadCurlTxt;
$("#curlDownload").onclick = downloadCurlTxt;

$("#curlClear").onclick = () => {
  localStorage.removeItem("xsrf_token");
  localStorage.removeItem("transparency_cookie");
  localStorage.removeItem("google_ua");
  updateAuthBtn();
  $("#curlStatus").textContent = "Cleared saved token and cookie.";
  $("#curlStatus").className = "modal-status";
};
updateAuthBtn();

/* ---------- sync / scrape ---------- */
let sessPages = 0, sessTotal = 0;
let lastSyncAt = 0;
let autoScrapeRunning = false;
let autoScrapeStop = false;
const MIN_SYNC_GAP_MS = 90000;
const AUTO_PAGE_DELAY_MS = 90000;
const AUTO_RATE_LIMIT_MS = 180000;

function applySyncResult(r, id) {
  lastSyncAt = Date.now();
  sessPages++; sessTotal += r.fetched;
  const box = $("#console");
  box.className = "on";
  box.classList.remove("failed");
  box.innerHTML =
    '<span class="dot">SYNC ' + esc(r.name || id) + "</span>" +
    "<span>pages " + String(sessPages).padStart(3, "0") + "</span>" +
    "<span>creatives " + String(sessTotal).padStart(5, "0") + (r.total_estimate ? " / ~" + r.total_estimate : "") + "</span>";
  if (r.next_cursor) {
    localStorage.setItem("cursor:" + id, r.next_cursor);
    $("#syncBtn").textContent = "Fetch next 20";
    box.innerHTML += "<span>stored " + r.fetched + " ads — click Fetch next 20 or Auto scrape</span>";
  } else {
    localStorage.removeItem("cursor:" + id);
    $("#syncBtn").textContent = "Sync ads";
    box.classList.add("done");
    box.innerHTML += "<span>complete — click Load apps to view</span>";
    sessPages = 0; sessTotal = 0;
  }
}

async function syncPageOnce(id, cursor) {
  return api("/api/sync-page", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ advertiser_id: id, cursor }),
  });
}

async function waitCountdown(ms, label, box, id) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (autoScrapeStop) throw new Error("Scrape stopped.");
    const left = Math.ceil((end - Date.now()) / 1000);
    box.className = "on";
    box.innerHTML =
      '<span class="dot">SCRAPE ' + esc(id) + "</span>" +
      "<span>" + esc(label) + " " + left + "s</span>" +
      "<span>click Stop scrape to cancel</span>";
    await sleep(1000);
  }
}

async function runAutoScrape(id) {
  autoScrapeRunning = true;
  autoScrapeStop = false;
  $("#autoScrapeBtn").textContent = "Stop scrape";
  $("#syncBtn").disabled = true;
  const box = $("#console");
  box.className = "on";
  let cursor = localStorage.getItem("cursor:" + id) || null;
  if (sessPages === 0 && cursor && !confirm("Continue previous sync from saved position? (Cancel = start over)")) {
    cursor = null;
    localStorage.removeItem("cursor:" + id);
    sessPages = 0;
    sessTotal = 0;
  }
  try {
    while (!autoScrapeStop) {
      if (cursor && lastSyncAt) await waitCountdown(AUTO_PAGE_DELAY_MS, "Next page in", box, id);
      box.innerHTML =
        '<span class="dot">SCRAPE ' + esc(id) + "</span>" +
        "<span>fetching page " + String(sessPages + 1) + "…</span>";
      let r;
      try {
        r = await syncPageOnce(id, cursor);
      } catch (e) {
        if (/429|rate limit/i.test(e.message)) {
          await waitCountdown(AUTO_RATE_LIMIT_MS, "Rate limited — retry in", box, id);
          continue;
        }
        throw e;
      }
      applySyncResult(r, id);
      cursor = r.next_cursor || null;
      if (!cursor) break;
    }
  } finally {
    autoScrapeRunning = false;
    autoScrapeStop = false;
    $("#autoScrapeBtn").textContent = "Auto scrape";
    $("#syncBtn").disabled = false;
  }
}

function setSyncProgress(box, id, sec) {
  box.innerHTML =
    '<span class="dot">SYNC ' + esc(id) + "</span>" +
    "<span>fetching from Google… " + sec + "s</span>";
}

$("#syncBtn").onclick = async () => {
  const id = extractId($("#advInput").value.trim());
  if (!id) return alert("Could not find an AR... advertiser ID in that input.");
  if (!hasCredentials()) {
    openCurlModal("Paste a SearchCreatives cURL first. Google blocks the worker without your browser token + cookie.");
    return;
  }
  if (autoScrapeRunning) return alert("Auto scrape is running — stop it first or wait.");
  if (advertiserId !== id) { advertiserId = id; sessPages = 0; sessTotal = 0; }
  localStorage.setItem("last_adv", id);

  const gap = Date.now() - lastSyncAt;
  if (lastSyncAt && gap < MIN_SYNC_GAP_MS) {
    const waitSec = Math.ceil((MIN_SYNC_GAP_MS - gap) / 1000);
    return alert("Please wait " + waitSec + "s between sync taps (Google rate limit).");
  }

  const box = $("#console");
  box.className = "on";
  let cursor = localStorage.getItem("cursor:" + id) || null;
  if (sessPages === 0 && cursor && !confirm("Continue previous sync from saved position? (Cancel = start over)")) {
    cursor = null; localStorage.removeItem("cursor:" + id);
  }

  $("#syncBtn").disabled = true;
  const syncT0 = Date.now();
  const syncTimer = setInterval(() => setSyncProgress(box, id, Math.floor((Date.now() - syncT0) / 1000)), 1000);
  try {
    const r = await syncPageOnce(id, cursor);
    applySyncResult(r, id);
  } catch (e) {
    box.classList.add("failed");
    box.innerHTML =
      '<span class="dot">SYNC ' + esc(id) + "</span>" +
      "<span>failed: " + esc(e.message) + "</span>";
    if (/429|rate limit/i.test(e.message)) {
      box.innerHTML += "<span>Wait 2–3 min, paste a fresh cURL, then try Auto scrape.</span>";
    }
    if (/xsrf|403/i.test(e.message)) {
      openCurlModal("Google needs fresh credentials — paste a new SearchCreatives cURL from DevTools:");
    }
  } finally {
    clearInterval(syncTimer);
    $("#syncBtn").disabled = false;
  }
};

$("#autoScrapeBtn").onclick = async () => {
  if (autoScrapeRunning) {
    autoScrapeStop = true;
    return;
  }
  const id = extractId($("#advInput").value.trim());
  if (!id) return alert("Paste the advertiser URL or ID first.");
  if (!hasCredentials()) {
    openCurlModal("Paste a SearchCreatives cURL first.");
    return;
  }
  if (advertiserId !== id) { advertiserId = id; sessPages = 0; sessTotal = 0; }
  localStorage.setItem("last_adv", id);
  await runAutoScrape(id);
};

async function api(path, opts = {}) {
  opts.headers = authHeaders(opts.headers);
  const base = workerBase();
  if (!/^https?:\\/\\//.test(base))
    throw new Error("Worker URL is not set - type your https://...workers.dev URL above and click Save");
  let r;
  try { r = await fetch(base + path, opts); }
  catch (e) {
    throw new Error(e.message + " -> tried " + base +
      ". Check the Worker URL is correct/reachable, or open the dashboard directly at " + base + " instead.");
  }
  const j = await r.json();
  if (r.status === 401) { localStorage.removeItem("dash_key"); throw new Error("unauthorized - reload and re-enter key"); }
  if (!r.ok) throw new Error(j.error || r.status);
  return j;
}

/* ---------- helpers ---------- */
const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g,
  (s) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[s]));
const ARROW = "\\u2192", DOT = "\\u00b7", STAR = "\\u2605", TIMES = "\\u00d7";
window.imgFail = (img) => { const d = document.createElement("div"); d.className = "noimg"; d.textContent = "preview blocked"; img.replaceWith(d); };

function fmtCount(n) {
  if (n == null) return "";
  n = Number(n);
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\\.0$/, "") + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\\.0$/, "") + "K";
  return String(n);
}
function initials(name) { return (name || "?").trim().slice(0, 2).toUpperCase(); }

function ccChips(countries, max) {
  if (!countries || !countries.length) return '<span class="ccnone">' + (countries ? "none" : "resolving\\u2026") + "</span>";
  max = max || 8;
  const chips = countries.slice(0, max).map((c) =>
    '<span class="cc" title="' + esc(c.name + (c.last ? " " + DOT + " last " + c.last : "")) + '">' + esc(c.cc) + "</span>").join("");
  const extra = countries.length > max
    ? '<span class="cc more" title="' + esc(countries.slice(max).map((c) => c.name).join(", ")) + '">+' + (countries.length - max) + "</span>"
    : "";
  return chips + extra;
}
function fmtBadges(formats) {
  return (formats || []).map((f) => '<span class="badge ' + f + '">' + f + "</span>").join("");
}
const extractId = (v) => (v.match(/AR\\d{10,}/) || [null])[0];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DL_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
const SPIN = '<span class="spin"></span>';

function appDownloadParams(a) {
  const p = new URLSearchParams({ acct: advertiserId });
  if (a.app_package) p.set("package", a.app_package);
  else if (a.app_url) p.set("url", a.app_url);
  else if (a.app_name) p.set("name", a.app_name);
  else p.set("orphan", "1");
  return p.toString();
}
const fileBase = (a) => String(a.title || a.app_package || a.app_name || "app")
  .replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "app";

// ---- country list -> CSV export (client-side, instant) ----
const csvCell = (s) => {
  s = String(s == null ? "" : s);
  return /[",\\r\\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
function countriesCsv(countries) {
  const lines = ["code,country,first_shown,last_shown"];
  for (const c of countries) lines.push([c.cc, csvCell(c.name), c.first || "", c.last || ""].join(","));
  return lines.join("\\r\\n") + "\\r\\n";
}
function exportCountriesCsv(countries, filename) {
  if (!countries || !countries.length) return alert("No country data resolved yet for this app.");
  const blob = new Blob([countriesCsv(countries)], { type: "text/csv;charset=utf-8" });
  const u = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = u; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
const sortedCC = (list) => [...list].sort((x, y) => x.name.localeCompare(y.name));

// downloads a server-built zip; needs a raw fetch (not api()) to read the blob
async function downloadAssets(params, filename, btn) {
  const base = workerBase();
  if (!/^https?:\\/\\//.test(base)) return alert("Set the Worker URL first.");
  const headers = authHeaders();
  const old = btn ? btn.innerHTML : null;
  if (btn) { btn.disabled = true; btn.innerHTML = SPIN; }
  try {
    const r = await fetch(base + "/api/download?" + params, { headers });
    if (!r.ok) { let m = r.status; try { m = (await r.json()).error || m; } catch (_) {} throw new Error(m); }
    const blob = await r.blob();
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 2000);
  } catch (e) { alert("Download failed: " + e.message); }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = old; } }
}

/* ---------- state ---------- */
let advertiserId = null, curFormat = "all";
let appsData = [];              // [{...app, cmap:Map(cc->{cc,name,last})}]
let resolvingPrev = false;     // batch preview-resolution in progress
// default: newest last_seen first (matches API); click header to toggle
let sortKey = "last_seen", sortDir = "desc";
const countryNames = new Map(); // cc -> name (for the filter dropdown)

$("#loadBtn").onclick = () => {
  const id = extractId($("#advInput").value.trim());
  if (!id) return alert("Paste the advertiser URL or ID first.");
  advertiserId = id; localStorage.setItem("last_adv", id);
  loadApps();
};

$("#search").oninput = renderTable;
$("#countryFilter").onchange = renderTable;
$("#formatFilter").onchange = () => { curFormat = $("#formatFilter").value; loadApps(); };

/* ---------- load + render app table ---------- */
async function loadApps() {
  if (!advertiserId) return;
  showTable();
  $("#toolbar").hidden = false;
  $("#empty").style.display = "none";
  let data;
  try {
    data = await api("/api/apps?" + new URLSearchParams({ acct: advertiserId, format: curFormat }));
  } catch (e) {
    $("#appTable").hidden = true;
    $("#empty").style.display = "block";
    $("#empty").textContent = "Couldn't load apps: " + e.message +
      " - if this mentions a column, run the ALTER TABLE / apps-table lines in schema.sql on Supabase.";
    return;
  }
  appsData = (data.apps || []).map((a) => {
    const cmap = new Map();
    for (const c of a.countries || []) cmap.set(c.cc, c);
    return Object.assign(a, { cmap });
  });
  // seed the country dropdown
  countryNames.clear();
  for (const c of data.all_countries || []) countryNames.set(c.cc, c.name);
  for (const a of appsData) for (const c of a.countries || []) if (!countryNames.has(c.cc)) countryNames.set(c.cc, c.name);
  rebuildCountryFilter();

  if (!appsData.length) {
    $("#appTable").hidden = true;
    $("#empty").style.display = "block";
    $("#empty").textContent = "No apps yet - run a Sync first, then Load apps.";
    return;
  }
  renderTable();
  if (data.unresolved_previews > 0)
    $("#resolving").textContent = data.unresolved_previews + " ads need names - click Fill names (5 per click)";
  else
    $("#resolving").textContent = "";
}

// One manual batch only - never loops silently in the background
$("#fillBtn").onclick = async () => {
  if (!advertiserId || resolvingPrev) return;
  resolvingPrev = true;
  $("#fillBtn").disabled = true;
  try {
    const r = await api("/api/resolve?" + new URLSearchParams({ acct: advertiserId, limit: 5 }));
    $("#resolving").textContent = r.remaining > 0
      ? "Filled " + r.resolved + " - " + r.remaining + " left (click Fill names again)"
      : "All app names filled";
    loadApps();
  } catch (e) {
    $("#resolving").textContent = "Fill names failed: " + e.message;
  } finally {
    resolvingPrev = false;
    $("#fillBtn").disabled = false;
  }
};

function rebuildCountryFilter() {
  const sel = $("#countryFilter");
  const cur = sel.value;
  const opts = [...countryNames.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  sel.innerHTML = '<option value="all">All countries</option>' +
    opts.map(([cc, name]) => '<option value="' + esc(cc) + '">' + esc(name) + " (" + esc(cc) + ")</option>").join("");
  if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
}

function filteredApps() {
  const q = $("#search").value.trim().toLowerCase();
  const cc = $("#countryFilter").value;
  const rows = appsData.filter((a) => {
    if (q) {
      const hay = ((a.title || "") + " " + (a.app_name || "") + " " + (a.app_package || "")).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (cc && cc !== "all" && !a.cmap.has(cc)) return false;
    return true;
  });
  const dir = sortDir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const av = a[sortKey] || "";
    const bv = b[sortKey] || "";
    if (!av && !bv) return 0;
    if (!av) return 1;   // missing dates last
    if (!bv) return -1;
    return av.localeCompare(bv) * dir;
  });
  return rows;
}

function updateSortHeaders() {
  document.querySelectorAll("th.sortable").forEach((th) => {
    const on = th.dataset.sort === sortKey;
    th.classList.toggle("active", on);
    const ind = th.querySelector(".sortind");
    if (ind) ind.textContent = on ? (sortDir === "asc" ? "\\u25b2" : "\\u25bc") : "\\u21c5";
  });
}
document.querySelectorAll("th.sortable").forEach((th) => {
  th.onclick = () => {
    const key = th.dataset.sort;
    if (sortKey === key) sortDir = sortDir === "asc" ? "desc" : "asc";
    else { sortKey = key; sortDir = key === "first_seen" ? "asc" : "desc"; }
    updateSortHeaders();
    renderTable();
  };
});
updateSortHeaders();

function renderTable() {
  const rows = filteredApps();
  $("#count").textContent = rows.length + " app" + (rows.length === 1 ? "" : "s") +
    (appsData.length !== rows.length ? " / " + appsData.length : "");
  updateSortHeaders();
  const tb = $("#appBody");
  tb.innerHTML = "";
  $("#appTable").hidden = false;
  const frag = document.createDocumentFragment();
  rows.forEach((a, i) => frag.appendChild(rowFor(a, i + 1)));
  tb.appendChild(frag);
}

function rowFor(a, idx) {
  const tr = document.createElement("tr");
  tr.dataset.key = a.app_key;
  const countries = [...a.cmap.values()].sort((x, y) => x.name.localeCompare(y.name));
  tr.innerHTML =
    '<td class="num idx">' + idx + "</td>" +
    '<td><div class="appcell">' + iconHtml(a) +
      '<div class="appinfo">' +
        '<div class="aptitle" title="' + esc(a.title) + '">' + esc(a.title) + "</div>" +
        (a.app_package ? '<div class="appkg" title="' + esc(a.app_package) + '">' + esc(a.app_package) + "</div>" : "") +
        '<div class="appsub">' +
          (a.rating != null ? '<span class="rating">' + STAR + " " + a.rating + (a.rating_count ? " (" + fmtCount(a.rating_count) + ")" : "") + "</span>" : "") +
          (a.developer ? '<span class="dev" title="' + esc(a.developer) + '">' + esc(a.developer) + "</span>" : "") +
        "</div>" +
      "</div></div></td>" +
    '<td class="num">' + a.video_count + "</td>" +
    '<td><div class="fmts">' + fmtBadges(a.formats) + "</div></td>" +
    '<td class="date">' + (a.first_seen || "?") + "</td>" +
    '<td class="date">' + (a.last_seen || "?") + "</td>" +
    '<td><div class="ccwrap">' + ccChips(countries) + "</div></td>" +
    '<td class="dlcell">' +
      '<button class="csvbtn" title="Export country list (CSV)">CSV</button>' +
      '<button class="dlbtn" title="Download this app\\'s assets (zip)">' + DL_ICON + "</button>" +
    "</td>";
  tr.onclick = () => openApp(a);
  const dl = tr.querySelector(".dlbtn");
  dl.onclick = (e) => { e.stopPropagation(); downloadAssets(appDownloadParams(a), fileBase(a) + "-assets.zip", dl); };
  const csv = tr.querySelector(".csvbtn");
  csv.onclick = (e) => { e.stopPropagation(); exportCountriesCsv(sortedCC(a.cmap.values()), fileBase(a) + "-countries.csv"); };
  return tr;
}

function iconHtml(a) {
  if (a.icon_url)
    return '<img class="icon" loading="lazy" src="' + esc(a.icon_url) + '" alt="" onerror="this.classList.add(\\'ph\\');this.removeAttribute(\\'src\\');this.textContent=\\'' + esc(initials(a.title)) + '\\'">';
  return '<div class="icon ph">' + esc(initials(a.title)) + "</div>";
}

function rowEl(key) { return document.querySelector('tr[data-key="' + CSS.escape(key) + '"]'); }

/* ---------- detail page ---------- */
function showTable() { $("#detailView").classList.add("hidden"); $("#tableView").classList.remove("hidden"); }
$("#backBtn").onclick = () => { if (location.hash) location.hash = ""; else showTable(); };
window.addEventListener("hashchange", () => { if (!location.hash) showTable(); });

async function openApp(a) {
  location.hash = "#/app/" + encodeURIComponent(a.app_key);
  $("#tableView").classList.add("hidden");
  $("#detailView").classList.remove("hidden");
  window.scrollTo(0, 0);
  $("#dhead").innerHTML = '<div class="dmeta"><h2 class="dtitle">' + esc(a.title) + "</h2><div class=\\"dpkg\\">loading assets\\u2026</div></div>";
  $("#dcc").innerHTML = ""; $("#dsec").textContent = ""; $("#assets").innerHTML = "";

  const q = new URLSearchParams({ acct: advertiserId });
  if (a.app_package) q.set("package", a.app_package);
  else if (a.app_url) q.set("url", a.app_url);
  else if (a.app_name) q.set("name", a.app_name);
  else q.set("orphan", "1");
  let data;
  try { data = await api("/api/app?" + q); }
  catch (e) { $("#dhead").innerHTML = '<div class="dmeta"><div class="dpkg">Couldn\\'t load: ' + esc(e.message) + "</div></div>"; return; }

  const app = data.app;
  // merge freshest client-side meta (icon may have resolved after table load)
  app.icon_url = app.icon_url || a.icon_url;
  app.rating = app.rating != null ? app.rating : a.rating;
  app.rating_count = app.rating_count != null ? app.rating_count : a.rating_count;
  app.developer = app.developer || a.developer;
  renderDetailHead(app);
  const dlb = $("#dlApp");
  if (dlb) dlb.onclick = () => downloadAssets(appDownloadParams(app), fileBase(app) + "-assets.zip", dlb);
  const csvb = $("#csvApp");
  if (csvb) csvb.onclick = () => exportCountriesCsv(app.countries || [], fileBase(app) + "-countries.csv");

  const videos = data.videos || [];
  $("#dsec").textContent = videos.length + " unique creative" + (videos.length === 1 ? "" : "s");
  const prevPending = [], geoPending = [];
  const frag = document.createDocumentFragment();
  for (const v of videos) {
    frag.appendChild(assetCard(v));
    if (!v.preview_url && v.content_js_url) prevPending.push(v.id);
    if (!v.detail_synced && !(v.countries && v.countries.length)) geoPending.push(v.id);
  }
  $("#assets").appendChild(frag);
  // previews/geo load only when user opens this app (not on table load)
  if (prevPending.length || geoPending.length) {
    resolvePreviews(prevPending.slice(0, 6));
    resolveDetailGeo(geoPending.slice(0, 6));
  }
}

function renderDetailHead(app) {
  $("#dhead").innerHTML =
    (app.icon_url ? '<img class="dicon" src="' + esc(app.icon_url) + '" alt="" onerror="this.style.display=\\'none\\'">'
                  : '<div class="dicon ph icon">' + esc(initials(app.title)) + "</div>") +
    '<div class="dmeta">' +
      '<h2 class="dtitle">' + esc(app.title) + "</h2>" +
      (app.app_package ? '<div class="dpkg">' + esc(app.app_package) + "</div>" : "") +
      '<div class="drow">' +
        (app.rating != null ? '<span class="rating" style="font-size:13px">' + STAR + " " + app.rating + (app.rating_count ? " (" + fmtCount(app.rating_count) + " ratings)" : "") + "</span>" : "") +
        (app.developer ? "<span>by <b>" + esc(app.developer) + "</b></span>" : "") +
        (app.genre ? "<span>" + esc(app.genre) + "</span>" : "") +
      "</div>" +
      '<div class="drow">' +
        '<span class="dstat"><b>' + app.video_count + "</b> videos</span>" +
        '<span class="dstat"><b>' + app.creative_count + "</b> creatives</span>" +
        '<span class="dstat">start <b>' + (app.first_seen || "?") + "</b></span>" +
        '<span class="dstat">last <b>' + (app.last_seen || "?") + "</b></span>" +
        '<span class="dstat"><b>' + (app.countries ? app.countries.length : 0) + "</b> countries</span>" +
        (app.app_url ? '<a class="playbtn" href="' + esc(app.app_url) + '" target="_blank" rel="noopener">Google Play</a>' : "") +
        '<button class="playbtn dl" id="dlApp">' + DL_ICON + " Download assets</button>" +
        '<button class="playbtn dl" id="csvApp">' + DL_ICON + " Countries CSV</button>" +
      "</div>" +
    "</div>";
  $("#dcc").innerHTML = app.countries && app.countries.length
    ? '<div class="ccwrap">' + ccChips(app.countries, 60) + "</div>" : "";
}

function thumbHtml(c) {
  if (c.preview_url)
    return '<img loading="lazy" src="' + esc(c.preview_url) + '" alt="creative ' + esc(c.id) + '" onerror="imgFail(this)">';
  return '<div class="noimg">' + (c.content_js_url ? "resolving\\u2026" : "no preview") + "</div>";
}
function assetLinks(v) {
  const urls = (v.asset_urls || []).filter((u) => /^https?:/.test(u));
  const seen = new Set(), out = [];
  for (const u of urls) {
    if (seen.has(u)) continue; seen.add(u);
    const isVid = /youtube\\.com\\/watch|\\.mp4/i.test(u);
    const label = isVid ? "\\u25b6 video" : (/ytimg|simgad|googleusercontent|play-lh/.test(u) ? "image" : "link");
    out.push('<a class="' + (isVid ? "vid" : "") + '" href="' + esc(u) + '" target="_blank" rel="noopener">' + label + "</a>");
    if (out.length >= 6) break;
  }
  return out.length ? '<div class="assets">' + out.join("") + "</div>" : "";
}
function assetCard(v) {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.id = v.id;
  const pageUrl = "https://adstransparency.google.com/advertiser/" + advertiserId + "/creative/" + v.id + "?region=anywhere";
  const dupe = v.creative_ids && v.creative_ids.length > 1
    ? '<span class="dupe" title="' + v.creative_ids.length + ' creatives share this video">' + TIMES + v.creative_ids.length + "</span>" : "";
  card.innerHTML =
    '<div class="thumb">' + thumbHtml(v) + "</div>" +
    '<div class="cmeta"><span class="badge ' + v.format + '">' + v.format + "</span>" + dupe +
      '<span class="cid" title="' + esc(v.id) + '">' + esc(v.id) + "</span>" +
      '<button class="dlbtn" title="Download this creative\\'s assets (zip)">' + DL_ICON + "</button>" +
      '<a href="' + pageUrl + '" target="_blank" rel="noopener">open</a></div>' +
    assetLinks(v) +
    '<div class="dates"><span>' + (v.first_shown || "?") + " " + ARROW + " " + (v.last_shown || "?") + "</span>" +
      (v.days_shown != null ? '<span class="days">' + v.days_shown + "d</span>" : "") + "</div>" +
    '<div class="cgeo">' + (v.countries && v.countries.length ? geoHtml(v.countries)
        : (v.detail_synced ? '<span class="geonone">no country data</span>' : '<span class="geoload">countries\\u2026</span>')) + "</div>";
  const b = card.querySelector(".dlbtn");
  if (b) b.onclick = (e) => { e.stopPropagation(); downloadAssets(new URLSearchParams({ id: v.id }).toString(), v.id + "-assets.zip", b); };
  return card;
}
function geoHtml(countries) {
  if (!countries || !countries.length) return '<span class="geonone">no country data</span>';
  return '<span class="geocount">' + countries.length + " countr" + (countries.length === 1 ? "y" : "ies") + "</span>" + ccChips(countries, 12);
}

async function resolvePreviews(ids) {
  for (const id of ids) {
    try {
      const r = await api("/api/preview/" + encodeURIComponent(id));
      const card = document.querySelector('#assets .card[data-id="' + CSS.escape(id) + '"]');
      if (card) {
        const t = card.querySelector(".thumb");
        if (t) t.innerHTML = thumbHtml({ id, preview_url: r.preview_url });
        if (r.asset_urls && r.asset_urls.length && !card.querySelector(".assets")) {
          const links = assetLinks({ asset_urls: r.asset_urls });
          if (links) card.querySelector(".cmeta").insertAdjacentHTML("afterend", links);
        }
      }
    } catch (_) {
      const t = document.querySelector('#assets .card[data-id="' + CSS.escape(id) + '"] .noimg');
      if (t) t.textContent = "preview unavailable";
    }
  }
}
async function resolveDetailGeo(ids) {
  for (const id of ids) {
    const el = document.querySelector('#assets .card[data-id="' + CSS.escape(id) + '"] .cgeo');
    try {
      const r = await api("/api/geo/" + encodeURIComponent(id));
      if (el) el.innerHTML = geoHtml(r.countries);
    } catch (_) { if (el) el.innerHTML = '<span class="geonone">country data unavailable</span>'; }
  }
}

/* ---------- boot: restore last advertiser id only (no auto API calls) ---------- */
(function restore() {
  const id = localStorage.getItem("last_adv");
  if (!id) return;
  if (!$("#advInput").value.trim()) $("#advInput").value = id;
  advertiserId = id;
})();
</script>
</body>
</html>
`;
