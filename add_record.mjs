// Adds the Track record to prices.json at publish time, so phones don't have to work it out.
//
//   node add_record.mjs _site/prices.json             add (or replace) the record in that file
//   node add_record.mjs _site/prices.json --dry-run   work it out and say what it found, but don't write
//
// It replays the engine over the last 90 days with the engine code from index.html (the same code
// the app runs), using only the prices in the file. It asks nothing from the network, needs no
// keys, and is safe to run twice. If anything goes wrong it leaves the file exactly as it was and
// exits 1: the app then says the track record isn't ready, and prices still work.
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const MAX_BYTES = 5_000_000;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function loadEngine(indexPath = fileURLToPath(new URL("./index.html", import.meta.url))) {
  const html = readFileSync(indexPath, "utf8");
  const block = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes("const BestGuessEngine"));
  if (!block) throw new Error("the engine wasn't found in index.html");
  return vm.runInThisContext("(() => {" + block + "\nreturn BestGuessEngine; })()");
}

// The coins worth replaying: a known id and a clean daily history (the file is checked like any outside data)
export function usableCoins(data) {
  const out = [], seen = new Set();
  for (const c of Array.isArray(data && data.coins) ? data.coins.slice(0, 60) : []) {
    if (!c || typeof c !== "object" || typeof c.id !== "string" || !ID_RE.test(c.id) || seen.has(c.id)) continue;
    const d = c.daily;
    if (!d || typeof d !== "object" || typeof d.start !== "string" || !DAY_RE.test(d.start) || !Array.isArray(d.closes) || d.closes.length > 400) continue;
    if (!d.closes.every((x) => typeof x === "number" && Number.isFinite(x) && x >= 1e-12 && x <= 1e9)) continue;
    seen.add(c.id);
    out.push({ id: c.id, daily: { start: d.start, closes: d.closes.slice() } });
  }
  return out;
}

// Returns the same data with a fresh `record` (or without one, when there's too little history to replay)
export function addRecord(data, E) {
  if (!data || typeof data !== "object" || data.app !== "best-guess" || data.v !== 1) throw new Error("not a Best Guess prices file");
  const out = Object.assign({}, data);
  delete out.record;
  const rec = E.trackRecord(usableCoins(data));
  if (rec) out.record = Object.assign({ v: 1 }, rec);
  return out;
}

export function main(argv, log = console.log) {
  const path = argv.find((a) => !a.startsWith("--"));
  const dry = argv.includes("--dry-run");
  if (!path) { log("Usage: node add_record.mjs <prices.json> [--dry-run]"); return 2; }
  try {
    const text = readFileSync(path, "utf8");
    if (text.length > MAX_BYTES) throw new Error("the prices file is too big");
    const t0 = Date.now();
    const out = addRecord(JSON.parse(text), loadEngine());
    const r = out.record;
    if (!r) log("Track record: not enough price history to replay yet, so none was added.");
    else log("Track record: " + r.all.n + " calls from " + r.from + " to " + r.to + " for " + r.coins.length + " coins; " + r.all.leans + " leans, " + r.all.right + " right (" + (Date.now() - t0) + " ms).");
    if (dry) { log("Dry run: nothing written."); return 0; }
    const tmp = path + ".tmp";
    writeFileSync(tmp, JSON.stringify(out));
    renameSync(tmp, path);
    return 0;
  } catch (e) {
    log("Track record not added: " + (e && e.message ? e.message : e));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
