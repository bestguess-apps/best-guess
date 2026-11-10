// Tests for the Best Guess forecasting engine. Run: node --test test_engine.mjs
// The engine lives in index.html (the app stays one file), so this loads that script block from it.
// Every price here is made up by a seeded generator, so runs are repeatable.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const block = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes("const BestGuessEngine"));
assert.ok(block, "engine block not found in index.html");
const E = vm.runInThisContext("(() => {" + block + "\nreturn BestGuessEngine; })()");

// ---- made-up markets ----
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r) {
  const u = 1 - r(), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const START = "2025-11-09";
// 25 coins that move together (a shared market move plus their own), with calm and wild spells.
// momentum > 0 plants a pattern: part of the last week's move carries on.
function world({ seed, coins = 25, days = 365, momentum = 0 }) {
  const r = rng(seed);
  const out = [];
  const market = [];
  let mv = 0.025;
  for (let t = 0; t < days; t++) {
    mv = Math.min(0.08, Math.max(0.01, mv * Math.exp(0.15 * gauss(r))));
    market.push(mv * gauss(r));
  }
  for (let c = 0; c < coins; c++) {
    const level = 0.6 + 1.6 * r();
    let p = Math.exp(gauss(r) * 3), v = 0.02, rets = [];
    const closes = [];
    for (let t = 0; t < days; t++) {
      v = Math.min(0.12, Math.max(0.005, v * Math.exp(0.12 * gauss(r))));
      const last7 = rets.slice(-7).reduce((a, b) => a + b, 0) / 7;
      const ret = level * (0.7 * market[t] + v * gauss(r)) + momentum * last7;
      rets.push(ret);
      p = Math.min(1e8, Math.max(1e-8, p * Math.exp(ret)));
      closes.push(p);
    }
    out.push({ id: "coin-" + c, daily: { start: START, closes } });
  }
  return out;
}
const dayOf = (i) => E.dayNum(START) + i;

// Replays the engine over the last `span` days of a market without letting it see the future,
// like the Track record will. Returns every call with what really happened 7 days later.
function replay(coins, span) {
  const lib = E.buildLibrary(coins);
  const n = coins[0].daily.closes.length;
  const calls = [];
  for (let i = n - 1 - E.AHEAD - span; i < n - E.AHEAD; i++) {
    const prep = E.prepare(lib, dayOf(i));
    for (const c of coins) {
      const closes = c.daily.closes;
      const fc = E.forecastCoin(prep, { start: START, closes: closes.slice(0, i) }, closes[i]);
      if (!fc.ok) continue;
      calls.push({ fc, later: closes[i + E.AHEAD] });
    }
  }
  return calls;
}
function score(calls) {
  const leans = calls.filter((c) => c.fc.lean !== "flip");
  const right = leans.filter((c) => (c.fc.lean === "up") === (c.later > c.fc.price)).length;
  const inRange = calls.filter((c) => c.later >= c.fc.low && c.later <= c.fc.high).length;
  const high = calls.filter((c) => c.fc.confidence === "high").length;
  return { n: calls.length, leans: leans.length, hit: leans.length ? right / leans.length : NaN, cover: inRange / calls.length, high: high / calls.length };
}
function allFinite(x, path = "result") {
  if (typeof x === "number") assert.ok(Number.isFinite(x), path + " is " + x);
  else if (Array.isArray(x)) x.forEach((v, i) => allFinite(v, path + "[" + i + "]"));
  else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) allFinite(v, path + "." + k);
}

// ---- the setup ----
test("setup numbers match a hand calculation", () => {
  const px = Array.from({ length: 61 }, (_, i) => 100 * (1 + 0.02 * Math.sin(i)) * (1 + 0.003 * i));
  const s = E.setupAt(px, 60);
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const p = px[60];
  assert.ok(Math.abs(s.raw.vs20 - (p / avg(px.slice(41, 61)) - 1)) < 1e-12);
  assert.ok(Math.abs(s.raw.vs50 - (p / avg(px.slice(11, 61)) - 1)) < 1e-12);
  assert.ok(Math.abs(s.raw.move7 - (p / px[53] - 1)) < 1e-12);
  assert.ok(Math.abs(s.raw.move30 - (p / px[30] - 1)) < 1e-12);
  const win = px.slice(31, 61), hi = Math.max(...win), lo = Math.min(...win);
  assert.ok(Math.abs(s.raw.place30 - (p - lo) / (hi - lo)) < 1e-12);
  const rets = px.slice(41, 61).map((x, k) => Math.log(x / px[40 + k]));
  const m = avg(rets);
  const sd = Math.sqrt(rets.reduce((a, x) => a + (x - m) ** 2, 0) / 19);
  assert.ok(Math.abs(s.vol - sd) < 1e-12);
  assert.equal(s.f.length, 6);
});

test("setup says no when history is short or the price is flat", () => {
  assert.equal(E.setupAt(Array(40).fill(1).map((x, i) => 1 + i * 0.01), 39), null);
  assert.equal(E.setupAt(Array(80).fill(5), 79), null);
  assert.equal(E.setupAt([1, 2, 3], 7), null);
  assert.equal(E.setupAt(Array(80).fill(5), 79.5), null);
});

test("dayNum counts whole UTC days", () => {
  assert.equal(E.dayNum("1970-01-02"), 1);
  assert.equal(E.dayNum("2024-03-01") - E.dayNum("2024-02-28"), 2); // leap year
  assert.equal(E.dayNum("2026-11-09") - E.dayNum("2026-11-02"), 7);
});

// ---- a forecast ----
test("a forecast is complete, finite and consistent", () => {
  const coins = world({ seed: 7 });
  const prep = E.prepare(E.buildLibrary(coins), dayOf(365));
  assert.ok(prep.ok);
  let seen = { up: 0, down: 0, flip: 0 };
  for (const c of coins) {
    const price = c.daily.closes.at(-1) * 1.01;
    const fc = E.forecastCoin(prep, c.daily, price);
    assert.ok(fc.ok, c.id + " " + fc.reason);
    allFinite(fc, c.id);
    assert.ok(fc.pUp >= 0 && fc.pUp <= 1);
    assert.equal(fc.odds, Math.round(fc.pUp * 100));
    assert.ok(fc.q.every((y, k) => k === 0 || y >= fc.q[k - 1]), "quantiles in order");
    assert.ok(fc.low <= fc.best && fc.best <= fc.high);
    assert.equal(fc.lookalikes, E.LOOKALIKES);
    assert.ok(fc.weeks >= 1 && fc.weeks <= fc.lookalikes && fc.nEff <= fc.weeks);
    // the best guess price never contradicts the lean
    if (fc.lean === "up") assert.ok(fc.best > price, c.id + " leans up but its best guess is lower");
    if (fc.lean === "down") assert.ok(fc.best <= price, c.id + " leans down but its best guess is higher");
    assert.equal(fc.confidence === "none", fc.lean === "flip");
    seen[fc.lean]++;
  }
  assert.equal(seen.up + seen.down + seen.flip, 25);
});

test("the fan starts at today's price and ends at the 7-day range", () => {
  const coins = world({ seed: 11 });
  const prep = E.prepare(E.buildLibrary(coins), dayOf(365));
  const fc = E.forecastCoin(prep, coins[3].daily, coins[3].daily.closes.at(-1));
  for (const x of E.fanAt(fc, 0)) assert.ok(Math.abs(x / fc.price - 1) < 1e-12);
  const end = E.fanAt(fc, 7);
  assert.ok(Math.abs(end[0] / fc.low - 1) < 1e-12 && Math.abs(end[2] / fc.best - 1) < 1e-12 && Math.abs(end[4] / fc.high - 1) < 1e-12);
  for (let d = 1; d <= 7; d++) { const f = E.fanAt(fc, d); assert.ok(f.every((x, k) => k === 0 || x >= f[k - 1])); }
});

// ---- honesty ----
test("it never sees the future: changing later prices changes nothing", () => {
  const coins = world({ seed: 3 });
  const i = 300;
  const run = (cs) => {
    const prep = E.prepare(E.buildLibrary(cs), dayOf(i));
    return cs.map((c) => E.forecastCoin(prep, { start: START, closes: c.daily.closes.slice(0, i) }, c.daily.closes[i]));
  };
  const before = run(coins);
  const changed = coins.map((c) => ({ id: c.id, daily: { start: START, closes: c.daily.closes.map((x, k) => (k > i ? x * (k % 2 ? 3 : 0.2) : x)) } }));
  assert.deepEqual(run(changed), before);
});

test("with no real pattern it mostly says coin flip, rarely Medium, almost never High, and is right only by chance", () => {
  const all = [];
  for (let seed = 1000; seed < 1008; seed++) all.push(...replay(world({ seed }), 25));
  const s = score(all);
  const medium = all.filter((c) => c.fc.confidence === "medium").length / s.n;
  assert.ok(s.n > 4000, "calls: " + s.n);
  assert.ok(s.leans / s.n < 0.3, "leaned on " + ((100 * s.leans) / s.n).toFixed(1) + "% of calls");
  assert.ok(medium < 0.08, "Medium on " + (medium * 100).toFixed(1) + "% of calls");
  assert.ok(s.high < 0.01, "High on " + (s.high * 100).toFixed(1) + "% of calls");
  assert.ok(Math.abs(s.hit - 0.5) < 0.08, "right " + (s.hit * 100).toFixed(1) + "% of leans");
  assert.ok(s.cover > 0.72 && s.cover < 0.88, "range held " + (s.cover * 100).toFixed(1) + "%");
});

test("when a pattern is there, it finds it", () => {
  const calls = replay(world({ seed: 303, momentum: 0.6 }), 60);
  const s = score(calls);
  const flat = score(replay(world({ seed: 303 }), 60));
  assert.ok(s.hit > 0.56, "right " + (s.hit * 100).toFixed(1) + "% of leans");
  assert.ok(s.leans > flat.leans, "leans: pattern " + s.leans + ", no pattern " + flat.leans);
  assert.ok(s.cover > 0.65, "range held " + (s.cover * 100).toFixed(1) + "%");
});

// ---- awkward data ----
test("awkward data gets a plain reason, never a crash or NaN", () => {
  const coins = world({ seed: 9 });
  const prep = E.prepare(E.buildLibrary(coins), dayOf(365));
  assert.equal(E.forecastCoin(prep, null, 5).reason, "no-history");
  assert.equal(E.forecastCoin(prep, { start: START, closes: [1, 2, 3] }, 5).reason, "short-history");
  assert.equal(E.forecastCoin(prep, { start: START, closes: Array(100).fill(2) }, 2).reason, "flat");
  assert.equal(E.forecastCoin(prep, coins[0].daily, 0).reason, "no-price");
  assert.equal(E.forecastCoin(prep, coins[0].daily, NaN).reason, "no-price");
  // too few past setups to compare with
  const few = E.prepare(E.buildLibrary(coins.slice(0, 2).map((c) => ({ id: c.id, daily: { start: START, closes: c.daily.closes.slice(0, 90) } }))), dayOf(400));
  assert.equal(few.ok, false);
  assert.equal(E.forecastCoin(few, coins[0].daily, 1).reason, "few-examples");
  assert.equal(E.prepare([], 0).ok, false);
  assert.deepEqual(E.buildLibrary(null), []);
  assert.deepEqual(E.buildLibrary([{ id: "x" }, null, { id: "y", daily: { start: "bad", closes: [1, 2] } }]), []);
  // the smallest and biggest prices the app accepts, and a price that jumps a billion times over
  const r = rng(5);
  const tiny = Array.from({ length: 200 }, () => 1e-12 * (1 + r()));
  const huge = Array.from({ length: 200 }, () => 1e9 * (1 - 0.5 * r()));
  const jumpy = Array.from({ length: 200 }, (_, k) => (k % 50 === 0 ? 1e9 : 1e-3 * (1 + r())));
  for (const closes of [tiny, huge, jumpy]) {
    const fc = E.forecastCoin(prep, { start: START, closes }, closes.at(-1));
    assert.ok(fc.ok);
    allFinite(fc);
  }
  const mixed = E.prepare(E.buildLibrary([{ id: "t", daily: { start: START, closes: tiny } }, { id: "h", daily: { start: START, closes: huge } }, { id: "j", daily: { start: START, closes: jumpy } }]), dayOf(400));
  assert.ok(mixed.ok);
  const fc = E.forecastCoin(mixed, { start: START, closes: jumpy }, 1e9);
  assert.ok(fc.ok);
  allFinite(fc);
});

// ---- key levels ----
test("key levels find the floor and ceiling a price keeps bouncing between", () => {
  // bounces between about 100 and 120 every 10 days
  const closes = Array.from({ length: 120 }, (_, k) => 110 + 10 * Math.sin((k * Math.PI) / 10));
  const lv = E.keyLevels(closes, 111, 0.03);
  assert.ok(lv.ceilings.length >= 1 && lv.floors.length >= 1);
  assert.ok(Math.abs(lv.ceilings[0].price - 120) < 1.5, "ceiling " + lv.ceilings[0].price);
  assert.ok(Math.abs(lv.floors[0].price - 100) < 1.5, "floor " + lv.floors[0].price);
  assert.ok(lv.ceilings[0].touches >= 5 && lv.floors[0].touches >= 5);
  assert.ok(lv.ceilings[0].away > 0 && lv.floors[0].away < 0);
  assert.ok(lv.ceilings[0].daysAgo >= 1 && lv.ceilings[0].daysAgo <= 20);
  // a steady climb has no turning points
  const climb = E.keyLevels(Array.from({ length: 120 }, (_, k) => 100 + k), 230, 0.01);
  assert.deepEqual([climb.ceilings, climb.floors], [[], []]);
  // only the last 4 months count
  assert.equal(E.keyLevels(Array(500).fill(1).map((_, k) => 1 + (k % 9)), 3, 0.05).days, E.LEVEL_DAYS);
});

test("ten forecasts are quick enough for an older phone", () => {
  const coins = world({ seed: 12 });
  const t0 = performance.now();
  const prep = E.prepare(E.buildLibrary(coins), dayOf(365));
  for (const c of coins.slice(0, 10)) E.forecastCoin(prep, c.daily, c.daily.closes.at(-1));
  const ms = performance.now() - t0;
  assert.ok(ms < 1000, ms.toFixed(0) + " ms");
});
