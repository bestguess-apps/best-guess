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
const loadEngine = (src) => vm.runInThisContext("(() => {" + src + "\nreturn BestGuessEngine; })()");
const E = loadEngine(block);
// A copy of the engine with one bug planted on purpose, to prove the tests would catch it
function planted(from, to) {
  assert.ok(block.split(from).length === 2, "the line to plant a bug in wasn't found exactly once: " + from);
  return loadEngine(block.replace(from, to));
}

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

// ---- the track record ----
test("separate weeks: days inside the same 7 days count once", () => {
  assert.equal(E.separateWeeks([]), 0);
  assert.equal(E.separateWeeks([5, 5, 5]), 1);
  assert.equal(E.separateWeeks([10, 16, 11, 12]), 1);
  assert.equal(E.separateWeeks([10, 17]), 2);
  assert.equal(E.separateWeeks([30, 0, 7, 14, 6, 29]), 4); // 0, 7, 14 and 29
  assert.equal(E.dayIso(E.dayNum("2024-02-29")), "2024-02-29");
  assert.equal(E.dayIso(E.dayNum("2026-12-31") + 1), "2027-01-01");
});

test("scoring matches a hand count", () => {
  const call = (day, lean, confidence, later, extra = {}) => Object.assign({ coin: "a", day, lean, confidence, price: 100, low: 90, best: 102, high: 110, later }, extra);
  const calls = [
    call(0, "up", "low", 105),        // right, inside the range
    call(1, "up", "medium", 95),      // wrong, inside
    call(8, "down", "high", 80),      // right, below the range
    call(9, "down", "low", 100),      // right: a down lean counts when it didn't end higher
    call(20, "up", "low", 100),       // wrong: it didn't end higher
    call(21, "flip", "none", 111),    // no lean, above the range
    call(40, "flip", "none", 90),     // no lean, right on the low edge (counts as inside)
  ];
  const s = E.scoreCalls(calls);
  assert.deepEqual(
    { n: s.n, flips: s.flips, leans: s.leans, right: s.right, inRange: s.inRange, weeks: s.weeks, leanWeeks: s.leanWeeks },
    { n: 7, flips: 2, leans: 5, right: 3, inRange: 5, weeks: 4, leanWeeks: 3 });
  assert.deepEqual(s.conf, { low: [3, 2], medium: [1, 0], high: [1, 1] });
  // misses by hand: best guess 102 and "no change" 100, as a share of the 100 price
  assert.ok(Math.abs(s.missBest - (3 + 7 + 22 + 2 + 2 + 9 + 12) / 700) < 1e-12);
  assert.ok(Math.abs(s.missFlat - (5 + 5 + 20 + 0 + 0 + 11 + 10) / 700) < 1e-12);
  const none = E.scoreCalls([]);
  assert.deepEqual([none.n, none.missBest, none.missFlat], [0, null, null]);
  allFinite(s);
});

test("verdicts say 'too few to tell' until there are enough calls from enough weeks", () => {
  const s = (o) => Object.assign({ n: 100, flips: 0, leans: 100, right: 50, weeks: 12, leanWeeks: 12, inRange: 80, conf: {}, missBest: 0.05, missFlat: 0.05 }, o);
  assert.deepEqual(E.judge(null), { leans: "few", range: "few", guess: "few", hit: null, cover: null });
  assert.equal(E.judge(s({ leans: E.MIN_LEANS - 1, right: 9 })).leans, "few");
  assert.equal(E.judge(s({ leanWeeks: E.MIN_WEEKS - 1, right: 100 })).leans, "few", "100 right calls from 3 weeks is still too few");
  assert.equal(E.judge(s({ n: E.MIN_CALLS - 1, inRange: 0 })).range, "few");
  assert.equal(E.judge(s({ weeks: E.MIN_WEEKS - 1 })).guess, "few");
  // 12 separate weeks: 60% right could be luck, 80% isn't, 20% is clearly worse
  assert.equal(E.judge(s({ right: 60 })).leans, "same");
  assert.equal(E.judge(s({ right: 80 })).leans, "better");
  assert.equal(E.judge(s({ right: 20 })).leans, "worse");
  assert.equal(E.judge(s({ right: 60 })).hit, 0.6);
  // the range: about 8 in 10 is the promise
  assert.equal(E.judge(s({ inRange: 78 })).range, "ok");
  assert.equal(E.judge(s({ inRange: 50 })).range, "narrow");
  assert.equal(E.judge(s({ inRange: 100, weeks: 100 })).range, "wide");
  assert.equal(E.judge(s({ inRange: 78 })).cover, 0.78);
  // the best guess against assuming no change
  assert.equal(E.judge(s({ missBest: 0.0500, missFlat: 0.0505 })).guess, "same");
  assert.equal(E.judge(s({ missBest: 0.04, missFlat: 0.05 })).guess, "closer");
  assert.equal(E.judge(s({ missBest: 0.06, missFlat: 0.05 })).guess, "further");
  assert.equal(E.judge(s({ missBest: 0, missFlat: 0 })).guess, "same");
});

test("a poor track record holds confidence down, and nothing ever raises it", () => {
  const s = (leans, right, leanWeeks = 8) => ({ leans, right, leanWeeks });
  const good = s(40, 26), soso = s(40, 21), poor = s(40, 16), thin = s(6, 0), fewWeeks = s(40, 0, 3);
  // a coin with poor past calls can't say High or Medium
  assert.deepEqual(E.capConfidence("high", poor, good), { confidence: "low", held: "coin", right: 16, leans: 40 });
  assert.equal(E.capConfidence("medium", poor, good).confidence, "low");
  // right less than 55% of the time (the odds a lean needs): no High
  assert.deepEqual(E.capConfidence("high", soso, good), { confidence: "medium", held: "coin", right: 21, leans: 40 });
  assert.deepEqual(E.capConfidence("medium", soso, good), { confidence: "medium", held: null });
  // a good record changes nothing
  assert.deepEqual(E.capConfidence("high", good, poor), { confidence: "high", held: null });
  // too few of the coin's own calls: go by all coins together
  assert.equal(E.capConfidence("high", thin, poor).held, "all");
  assert.equal(E.capConfidence("high", fewWeeks, poor).confidence, "low");
  assert.equal(E.capConfidence("high", thin, good).confidence, "high");
  // nothing to go on: left alone
  assert.deepEqual(E.capConfidence("high", null, null), { confidence: "high", held: null });
  assert.deepEqual(E.capConfidence("high", thin, undefined), { confidence: "high", held: null });
  // never raised, and Low and coin flips are never touched
  for (const rec of [good, soso, poor, thin, null]) {
    assert.equal(E.capConfidence("low", rec, rec).confidence, "low");
    assert.equal(E.capConfidence("none", rec, rec).confidence, "none");
    assert.notEqual(E.capConfidence("medium", rec, rec).confidence, "high");
  }
  // exactly on the lines: 50% right allows Medium, 55% allows High
  assert.equal(E.capConfidence("high", s(40, 20), null).confidence, "medium");
  assert.equal(E.capConfidence("high", s(40, 22), null).confidence, "high");
});

// The no-future check for the Track record's own replay. Every price after day `cut` is changed.
// A call made on or before that day must not move at all, and its result (`later`) must not move
// if its 7 days had already ended by then. Returns how many calls broke that rule.
function futureLeaks(engine, coins, span, cut) {
  const before = engine.replayCalls(coins, span);
  const changed = coins.map((c) => ({ id: c.id, daily: { start: START, closes: c.daily.closes.map((x, k) => (k > cut ? x * (k % 2 ? 3 : 0.2) : x)) } }));
  const after = engine.replayCalls(changed, span);
  const key = (c) => c.coin + ":" + c.day;
  const then = new Map(after.map((c) => [key(c), c]));
  let checked = 0, leaks = 0;
  for (const c of before) {
    if (c.day > dayOf(cut)) continue;
    checked++;
    const d = then.get(key(c));
    const same = d && ["lean", "confidence", "price", "low", "best", "high"].every((f) => c[f] === d[f]) && (c.day + engine.AHEAD > dayOf(cut) || c.later === d.later);
    if (!same) leaks++;
  }
  return { checked, leaks, total: before.length };
}

test("the track record never sees the future: changing later prices changes no earlier call", () => {
  const coins = world({ seed: 21, coins: 12 });
  // days 318 to 357 are replayed; everything after day 340 is changed
  const r = futureLeaks(E, coins, 40, 340);
  assert.equal(r.total, 12 * 40);
  assert.equal(r.checked, 12 * 23);
  assert.equal(r.leaks, 0);
});

test("planted bugs get caught: a replay that peeks, and a score that's backwards", () => {
  const coins = world({ seed: 21, coins: 12 });
  // 1. the look-alike library is allowed to see setups that hadn't finished yet
  const peekLibrary = planted("const prep = prepare(lib, day);", "const prep = prepare(lib, day + 30);");
  assert.ok(futureLeaks(peekLibrary, coins, 40, 340).leaks > 0, "a library that peeks 30 days ahead wasn't caught");
  // 2. the coin's own prices run 3 days past the day of the call
  const peekPrices = planted("{ closes: c.px.slice(0, i) }, c.px[i]", "{ closes: c.px.slice(0, i + 3) }, c.px[i + 3]");
  assert.ok(futureLeaks(peekPrices, coins, 40, 340).leaks > 0, "prices that run 3 days ahead weren't caught");
  // 3. right and wrong swapped
  const backwards = planted('(c.lean === "up") === (c.later > c.price)', '(c.lean === "up") === (c.later < c.price)');
  const calls = [{ coin: "a", day: 0, lean: "up", confidence: "low", price: 100, low: 90, best: 102, high: 110, later: 105 }];
  assert.equal(E.scoreCalls(calls).right, 1);
  assert.equal(backwards.scoreCalls(calls).right, 0, "a backwards score wasn't caught");
  // 4. a poor record that no longer holds confidence down
  const noCap = planted("hit < CAP_LOW ? \"low\"", "hit < 0 ? \"low\"");
  const poor = { leans: 40, right: 12, leanWeeks: 8 };
  assert.equal(E.capConfidence("high", poor, null).confidence, "low");
  assert.notEqual(noCap.capConfidence("high", poor, null).confidence, "low", "a missing cap wasn't caught");
});

test("the track record's replay matches a second, separate replay", () => {
  const coins = world({ seed: 5 });
  const mine = E.replayCalls(coins, 30);
  const other = replay(coins, 30 - 1); // the helper above replays span + 1 days
  assert.equal(mine.length, other.length);
  assert.equal(mine.length, 25 * 30);
  const a = score(other), s = E.scoreCalls(mine);
  assert.equal(s.leans, a.leans);
  assert.ok(s.leans === 0 || Math.abs(s.right / s.leans - a.hit) < 1e-12);
  assert.ok(Math.abs(s.inRange / s.n - a.cover) < 1e-12);
  // the last day replayed is the last one whose 7 days have ended
  assert.equal(Math.max(...mine.map((c) => c.day)), dayOf(365 - 1 - E.AHEAD));
  assert.equal(Math.min(...mine.map((c) => c.day)), dayOf(365 - E.AHEAD - 30));
});

test("a full 90-day record adds up, coin by coin", () => {
  const coins = world({ seed: 44 });
  // one coin starts later and one has too little history: both are handled, neither crashes
  coins[3] = { id: coins[3].id, daily: { start: E.dayIso(dayOf(100)), closes: coins[3].daily.closes.slice(100) } };
  coins[4] = { id: coins[4].id, daily: { start: E.dayIso(dayOf(330)), closes: coins[4].daily.closes.slice(330) } };
  const rec = E.trackRecord(coins);
  assert.equal(rec.days, E.RECORD_DAYS);
  assert.equal(rec.from, E.dayIso(dayOf(365 - E.AHEAD - 90)));
  assert.equal(rec.to, E.dayIso(dayOf(365 - 1 - E.AHEAD)));
  assert.equal(rec.coins.length, 24, "the coin with too little history has no record");
  assert.equal(rec.all.n, 24 * 90);
  for (const f of ["n", "flips", "leans", "right", "inRange"]) assert.equal(rec.coins.reduce((a, c) => a + c[f], 0), rec.all[f], f);
  for (const lv of ["low", "medium", "high"]) for (const k of [0, 1]) assert.equal(rec.coins.reduce((a, c) => a + c.conf[lv][k], 0), rec.all.conf[lv][k]);
  for (const s of [rec.all, ...rec.coins]) {
    allFinite(s);
    assert.equal(s.flips + s.leans, s.n);
    assert.equal(s.conf.low[0] + s.conf.medium[0] + s.conf.high[0], s.leans);
    assert.equal(s.conf.low[1] + s.conf.medium[1] + s.conf.high[1], s.right);
    assert.ok(s.right <= s.leans && s.inRange <= s.n && s.leanWeeks <= s.weeks && s.weeks <= 13);
  }
  // nothing to replay: a plain null, never a crash
  assert.equal(E.trackRecord([]), null);
  assert.equal(E.trackRecord(null), null);
  assert.equal(E.trackRecord(coins.slice(0, 1).map((c) => ({ id: c.id, daily: { start: START, closes: c.daily.closes.slice(0, 80) } }))), null);
  assert.deepEqual(E.replayCalls(coins, 0), []);
});

test("the record is honest: no pattern reads as a coin flip, a real pattern shows up", () => {
  // with no real pattern, the record must never claim the leans beat a coin flip
  for (let seed = 2000; seed < 2004; seed++) {
    const rec = E.trackRecord(world({ seed }), 45);
    const j = E.judge(rec.all);
    assert.notEqual(j.leans, "better", "seed " + seed + " claimed to beat a coin flip: " + rec.all.right + " of " + rec.all.leans);
    assert.notEqual(j.range, "narrow", "seed " + seed + " range held " + j.cover);
  }
  const rec = E.trackRecord(world({ seed: 303, momentum: 0.6 }), 60);
  const j = E.judge(rec.all);
  assert.ok(j.hit > 0.56, "right " + (j.hit * 100).toFixed(1) + "% of leans");
  assert.notEqual(j.leans, "worse");
  assert.notEqual(j.leans, "few");
});
