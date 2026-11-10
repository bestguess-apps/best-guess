// Tests for add_record.mjs (it adds the Track record to prices.json at publish time).
// Run: node --test test_add_record.mjs    Every price here is made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addRecord, usableCoins, loadEngine, main } from "./add_record.mjs";

const E = loadEngine();
const START = "2025-11-09";
function closes(seed, days = 365) {
  let a = seed >>> 0, p = 50 + seed;
  const out = [];
  for (let t = 0; t < days; t++) {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    p *= Math.exp((a / 4294967296 - 0.5) * 0.08);
    out.push(p);
  }
  return out;
}
function file(coins = 8) {
  return {
    app: "best-guess", v: 1, fetched: "2026-11-09T00:17:00Z", source: "CoinGecko",
    coins: Array.from({ length: coins }, (_, k) => ({ id: "coin-" + k, name: "Coin " + k, symbol: "c" + k, rank: k + 1, price: 10, change24h: 1, daily: { start: START, closes: closes(k + 1) } })),
  };
}
const quiet = () => {};

test("adds a record that matches the engine, and keeps everything else as it was", () => {
  const data = file();
  const out = addRecord(data, E);
  assert.deepEqual(Object.assign({}, out, { record: undefined }), Object.assign({}, data, { record: undefined }));
  assert.equal(data.record, undefined, "the data passed in isn't changed");
  assert.deepEqual(out.record, Object.assign({ v: 1 }, E.trackRecord(usableCoins(data))));
  assert.equal(out.record.days, 90);
  assert.equal(out.record.all.n, 8 * 90);
  assert.equal(out.record.coins.length, 8);
  assert.ok(JSON.stringify(out.record).length < 20000, "the record stays small");
});

test("running it twice gives the same file, and an old record is replaced, not trusted", () => {
  const once = addRecord(file(), E);
  const stale = Object.assign({}, once, { record: { v: 1, all: { n: 999999 } } });
  assert.deepEqual(addRecord(stale, E), once);
  assert.deepEqual(addRecord(once, E), once);
});

test("junk coins are skipped, and too little history means no record at all", () => {
  const data = file(6);
  data.coins.push(null, 5, { id: "BAD ID", daily: { start: START, closes: closes(9) } },
    { id: "coin-0", daily: { start: START, closes: closes(9) } },                      // a repeat
    { id: "nan", daily: { start: START, closes: closes(9).map((x, k) => (k === 200 ? NaN : x)) } },
    { id: "neg", daily: { start: START, closes: closes(9).map((x, k) => (k === 200 ? -1 : x)) } },
    { id: "text", daily: { start: START, closes: closes(9).map(String) } },
    { id: "long", daily: { start: START, closes: closes(9, 500) } },
    { id: "day", daily: { start: "yesterday", closes: closes(9) } },
    { id: "none" });
  assert.deepEqual(usableCoins(data).map((c) => c.id), ["coin-0", "coin-1", "coin-2", "coin-3", "coin-4", "coin-5"]);
  assert.equal(addRecord(data, E).record.coins.length, 6);
  const short = file(3);
  for (const c of short.coins) c.daily.closes = c.daily.closes.slice(0, 70);
  assert.equal("record" in addRecord(short, E), false);
  assert.equal("record" in addRecord({ app: "best-guess", v: 1, coins: [] }, E), false);
});

test("a file that isn't ours is refused", () => {
  for (const bad of [null, [], {}, { app: "other", v: 1, coins: [] }, { app: "best-guess", v: 2, coins: [] }]) assert.throws(() => addRecord(bad, E));
});

test("the command writes the file, a dry run doesn't, and a failure leaves it untouched", () => {
  const dir = mkdtempSync(join(tmpdir(), "bg-record-"));
  const path = join(dir, "prices.json");
  const before = JSON.stringify(file(5));
  writeFileSync(path, before);
  assert.equal(main([path, "--dry-run"], quiet), 0);
  assert.equal(readFileSync(path, "utf8"), before);
  assert.equal(main([path], quiet), 0);
  const written = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(written.record.coins.length, 5);
  assert.equal(written.coins.length, 5);
  assert.deepEqual(readdirSync(dir), ["prices.json"], "no temporary file left behind");
  // damaged, missing and wrong files: exit 1, nothing changed
  const bad = join(dir, "bad.json");
  for (const text of ["{not json", JSON.stringify({ app: "other", v: 1 }), ""]) {
    writeFileSync(bad, text);
    assert.equal(main([bad], quiet), 1);
    assert.equal(readFileSync(bad, "utf8"), text);
  }
  assert.equal(main([join(dir, "missing.json")], quiet), 1);
  assert.equal(main([], quiet), 2);
});
