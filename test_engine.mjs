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
  // rose: of the 5 leans, only day 0's price ended higher (100 is flat, not higher; day 21 is a coin flip)
  assert.equal(s.rose, 1);
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
  const peekPrices = planted("{ closes: px.slice(0, i) }, px[i]", "{ closes: px.slice(0, i + 3) }, px[i + 3]");
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
  for (const f of ["n", "flips", "leans", "right", "rose", "inRange"]) assert.equal(rec.coins.reduce((a, c) => a + c[f], 0), rec.all[f], f);
  for (const lv of ["low", "medium", "high"]) for (const k of [0, 1]) assert.equal(rec.coins.reduce((a, c) => a + c.conf[lv][k], 0), rec.all.conf[lv][k]);
  for (const s of [rec.all, ...rec.coins]) {
    allFinite(s);
    assert.equal(s.flips + s.leans, s.n);
    assert.equal(s.conf.low[0] + s.conf.medium[0] + s.conf.high[0], s.leans);
    assert.equal(s.conf.low[1] + s.conf.medium[1] + s.conf.high[1], s.right);
    assert.ok(s.right <= s.leans && s.inRange <= s.n && s.leanWeeks <= s.weeks && s.weeks <= 13);
    assert.ok(Number.isInteger(s.rose) && s.rose <= s.leans);
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

// ---- Worth a look ----
const rec = (leans, right, leanWeeks = 8) => ({ leans, right, leanWeeks });
const call = (id, lean, odds, confidence, score) => ({ id, fc: { ok: true, lean, odds, confidence }, score });

test("Worth a look keeps only clear, well-tested leans, strongest first", () => {
  const good = rec(40, 26), soso = rec(40, 21), poor = rec(40, 16), thin = rec(6, 6);
  const list = [
    call("flip", "flip", 52, "none", good),          // no lean
    call("low", "up", 58, "low", good),              // a lean, but low confidence
    call("poor", "up", 70, "high", poor),            // its own leans were right under half the time
    call("med-up", "up", 60, "medium", good),
    call("high-down", "down", 38, "high", good),     // 62% odds it's lower
    call("med-down", "down", 33, "medium", good),    // 67% odds it's lower: the strongest Medium
    call("soso", "up", 80, "high", soso),            // right 52.5% of the time: under the 55% a pick needs
    call("thin", "up", 61, "medium", thin),          // too few of its own leans: goes by all coins
    { id: "broken", fc: { ok: false, reason: "short-history" }, score: good },
    null,
  ];
  const look = E.standouts(list, good, 10);
  assert.deepEqual(look.picks.map((p) => p.id), ["high-down", "med-down", "thin", "med-up"]);
  assert.deepEqual(look.picks[0], { id: "high-down", lean: "down", odds: 38, strength: 62, confidence: "high", by: "coin", right: 26, leans: 40 });
  assert.deepEqual([look.picks[2].by, look.picks[2].right, look.picks[2].leans], ["all", 26, 40]);
  assert.deepEqual([look.checked, look.flips, look.leans, look.untested, look.passed], [8, 1, 7, 0, 4]);
  // by default it names 3 at most, and they're the same top 3
  const top = E.standouts(list, good);
  assert.equal(E.PICKS, 3);
  assert.deepEqual(top.picks.map((p) => p.id), ["high-down", "med-down", "thin"]);
  assert.equal(top.passed, 4);
  assert.equal(E.PICK_RIGHT, 0.55);
  // the order coins arrive in doesn't change who gets picked
  assert.deepEqual(E.standouts(list.slice().reverse(), good).picks.map((p) => p.id), ["high-down", "med-down", "thin"]);
  // when all coins together did poorly, a coin without enough of its own record can't stand out
  assert.deepEqual(E.standouts([call("thin", "up", 61, "medium", thin)], poor).picks, []);
});

test("Worth a look says nothing when nothing is tested or nothing leans, and never crashes", () => {
  const good = rec(40, 26), thin = rec(6, 6);
  const empty = { picks: [], checked: 0, flips: 0, leans: 0, untested: 0, passed: 0 };
  for (const junk of [undefined, null, [], "coins", [null, 5, {}, { fc: null }, { fc: { ok: false } }]]) assert.deepEqual(E.standouts(junk, good), empty);
  // every coin a coin flip
  const flips = E.standouts([call("a", "flip", 50, "none", good), call("b", "flip", 46, "none", good)], good);
  assert.deepEqual([flips.picks.length, flips.checked, flips.flips, flips.leans], [0, 2, 2, 0]);
  // strong leans, but no track record at all (the publish step failed), or too thin a one
  for (const all of [null, undefined, thin, rec(40, 30, 3)]) {
    const look = E.standouts([call("a", "up", 75, "high", null), call("b", "down", 20, "high", thin)], all);
    assert.deepEqual([look.picks.length, look.leans, look.untested], [0, 2, 2]);
  }
  // past leans right exactly 55% of the time are in; one short of that is out
  assert.equal(E.standouts([call("a", "up", 60, "medium", rec(40, 22))], null).picks.length, 1);
  assert.equal(E.standouts([call("a", "up", 60, "medium", rec(40, 21))], null).picks.length, 0);
  // it never raises confidence: every pick is Medium or High, and no higher than the forecast said
  const rank = { low: 1, medium: 2, high: 3 };
  for (const conf of ["low", "medium", "high"]) for (const score of [good, rec(40, 21), rec(40, 16), thin, null]) {
    for (const p of E.standouts([call("a", "up", 66, conf, score)], good).picks) {
      assert.ok(rank[p.confidence] >= 2 && rank[p.confidence] <= rank[conf], conf + " became " + p.confidence);
    }
  }
});

test("planted bugs in Worth a look get caught", () => {
  const good = rec(40, 26);
  const list = [call("low", "up", 58, "low", good), call("med", "up", 60, "medium", good), call("high", "down", 40, "high", good),
    call("down", "down", 30, "medium", good), call("extra", "up", 56, "medium", good)];
  const ids = (e) => e.standouts(list, good).picks.map((p) => p.id);
  assert.deepEqual(ids(E), ["high", "down", "med"]);
  // 1. the confidence bar dropped
  assert.equal(E.standouts(list, good).passed, 4);
  assert.equal(planted("rank[confidence] >= rank.medium", "rank[confidence] >= rank.low").standouts(list, good).passed, 5, "a missing confidence bar wasn't caught");
  // 2. weakest first
  assert.notDeepEqual(ids(planted("rank[b.confidence] - rank[a.confidence] || b.strength - a.strength", "rank[a.confidence] - rank[b.confidence] || a.strength - b.strength")), ids(E), "a backwards order wasn't caught");
  // 3. a down lean's strength read off the odds of going up
  assert.notDeepEqual(ids(planted('strength: fc.lean === "up" ? fc.odds : 100 - fc.odds', "strength: fc.odds")), ids(E), "a down lean ranked by its up odds wasn't caught");
  // 4. the limit of 3 ignored
  assert.equal(planted("ok.slice(0, Math.max(0, max))", "ok").standouts(list, good).picks.length, 4, "a missing limit wasn't caught");
  // 5. a poor record let through
  const poor = [call("poor", "up", 70, "medium", rec(40, 21))];
  assert.equal(E.standouts(poor, null).picks.length, 0);
  assert.equal(planted("s.right / s.leans < PICK_RIGHT) continue;", "s.right / s.leans < CAP_LOW) continue;").standouts(poor, null).picks.length, 1, "a so-so record getting through wasn't caught");
});

// One day's Worth a look on a made-up market, seeing nothing after day i: the forecasts, and the record up to then
function lookOn(coins, i, span = 45) {
  const cut = coins.map((c) => ({ id: c.id, daily: { start: START, closes: c.daily.closes.slice(0, i) } }));
  const record = E.trackRecord(cut, span);
  const by = new Map(record.coins.map((c) => [c.id, c]));
  const prep = E.prepare(E.buildLibrary(cut), dayOf(i));
  const list = coins.map((c) => ({ id: c.id, fc: E.forecastCoin(prep, { start: START, closes: c.daily.closes.slice(0, i) }, c.daily.closes[i]), score: by.get(c.id) }));
  return E.standouts(list, record.all);
}
function lookDays(opts, seeds) {
  const t = { days: 0, quiet: 0, picks: 0, right: 0 };
  for (const seed of seeds) {
    const coins = world({ seed, ...opts });
    for (let i = 300; i < 357; i += 8) {
      const look = lookOn(coins, i);
      assert.ok(look.picks.length <= E.PICKS);
      t.days++;
      if (!look.picks.length) t.quiet++;
      for (const p of look.picks) {
        assert.ok(p.confidence === "medium" || p.confidence === "high");
        const px = coins.find((c) => c.id === p.id).daily.closes;
        t.picks++;
        if ((p.lean === "up") === (px[i + E.AHEAD] > px[i])) t.right++;
      }
    }
  }
  return t;
}

test("Worth a look is honest: mostly quiet with no pattern, and right more often than not when one is there", () => {
  // with no real pattern, most days should say "Nothing stands out today"
  const none = lookDays({}, [3000, 3001, 3002, 3003]);
  assert.ok(none.quiet / none.days >= 0.65, "quiet on only " + none.quiet + " of " + none.days + " days with no pattern");
  // with a planted pattern it speaks up more, and its picks are right well over half the time
  const real = lookDays({ momentum: 0.6 }, [3000, 3001]);
  assert.ok(real.picks >= 8, real.picks + " picks in " + real.days + " days");
  assert.ok(real.right / real.picks >= 0.65, "right " + real.right + " of " + real.picks);
  assert.ok(real.quiet / real.days < none.quiet / none.days, "no busier with a real pattern than without one");
});

test("25 forecasts (every coin, for Worth a look) are quick enough for an older phone", () => {
  const coins = world({ seed: 12 });
  const t0 = performance.now();
  const prep = E.prepare(E.buildLibrary(coins), dayOf(365));
  const list = coins.map((c) => ({ id: c.id, fc: E.forecastCoin(prep, c.daily, c.daily.closes.at(-1)), score: null }));
  E.standouts(list, null);
  const ms = performance.now() - t0;
  assert.ok(ms < 1500, ms.toFixed(0) + " ms");
});

test("the easy guess takes whichever way happened more, on the same days the leans were made", () => {
  assert.deepEqual(E.easyGuess({ leans: 10, rose: 7 }), { word: "up", right: 7, of: 10 });
  assert.deepEqual(E.easyGuess({ leans: 10, rose: 3 }), { word: "down", right: 7, of: 10 });
  assert.deepEqual(E.easyGuess({ leans: 10, rose: 5 }), { word: "up", right: 5, of: 10 }, "a tie says up, right half the time");
  // the hand count above: 1 of 5 leans rose, so saying "down" every time was right 4 times
  const call = (lean, later) => ({ coin: "a", day: 0, lean, confidence: "low", price: 100, low: 90, best: 102, high: 110, later });
  const s = E.scoreCalls([call("up", 105), call("up", 95), call("down", 80), call("down", 100), call("up", 100), call("flip", 111)]);
  assert.deepEqual(E.easyGuess(s), { word: "down", right: 4, of: 5 });
  // nothing to show: no leans, an older file without the count, or counts that don't add up
  for (const bad of [null, undefined, {}, { leans: 0, rose: 0 }, { leans: 10 }, { leans: 10, rose: null }, { leans: 10, rose: 11 }, { leans: 10, rose: -1 }, { leans: 10, rose: 2.5 }]) {
    assert.equal(E.easyGuess(bad), null, JSON.stringify(bad));
  }
  // it's only shown: verdicts, the cap and the picks don't change with it
  const a = { n: 40, flips: 0, leans: 40, right: 30, weeks: 8, leanWeeks: 8, inRange: 32, conf: { low: [40, 30], medium: [0, 0], high: [0, 0] }, missBest: 0.05, missFlat: 0.06 };
  for (const rose of [0, 20, 40]) {
    const b = Object.assign({}, a, { rose });
    assert.deepEqual(E.judge(b), E.judge(a));
    assert.deepEqual(E.capConfidence("high", b, null), E.capConfidence("high", a, null));
  }
});

test("old saved prices: a warning at 2 days, forecasts paused at 7, and a bad date counts as fresh", () => {
  const now = Date.UTC(2026, 10, 12, 12), h = 3600000;
  assert.equal(E.OLD_DAYS, 2);
  assert.equal(E.PAUSE_DAYS, 7);
  assert.equal(E.priceAge(now, now), "fresh");
  assert.equal(E.priceAge(now - 6 * h, now), "fresh");
  assert.equal(E.priceAge(now - 48 * h + 1, now), "fresh");
  assert.equal(E.priceAge(now - 48 * h, now), "old");
  assert.equal(E.priceAge(now - 7 * 24 * h + 1, now), "old");
  assert.equal(E.priceAge(now - 7 * 24 * h, now), "paused");
  assert.equal(E.priceAge(now - 400 * 24 * h, now), "paused");
  assert.equal(E.priceAge(now + 3 * 24 * h, now), "fresh", "a phone clock that's behind");
  for (const bad of [NaN, undefined, null, "x", Infinity]) assert.equal(E.priceAge(bad, now), "fresh", String(bad));
});

test("planted bugs in the easy guess and old prices get caught", () => {
  const call = (lean, later) => ({ coin: "a", day: 0, lean, confidence: "low", price: 100, low: 90, best: 102, high: 110, later });
  const calls = [call("up", 105), call("flip", 111), call("flip", 120)];
  // 1. coin flips counted too: the easy guess would be scored on days the leans weren't made
  const allDays = planted("if (c.later > c.price) s.rose++;", "");
  const counted = loadEngine(block.replace('if (c.lean === "flip") { s.flips++; continue; }', 'if (c.later > c.price) s.rose++;\n      if (c.lean === "flip") { s.flips++; continue; }').replace("      if (c.later > c.price) s.rose++;\n      const level", "      const level"));
  assert.equal(E.scoreCalls(calls).rose, 1);
  assert.equal(allDays.scoreCalls(calls).rose, 0, "a missing count wasn't caught");
  assert.notEqual(counted.scoreCalls(calls).rose, 1, "counting coin flips wasn't caught");
  // 2. a tie that says down
  const tieDown = planted("const up = s.rose >= s.leans - s.rose;", "const up = s.rose > s.leans - s.rose;");
  assert.notEqual(tieDown.easyGuess({ leans: 10, rose: 5 }).word, "up", "a tie that says down wasn't caught");
  // 3. the pause a day late, and no warning at all
  const lateDay = planted("age >= PAUSE_DAYS * DAY_MS", "age >= (PAUSE_DAYS + 1) * DAY_MS");
  const noWarn = planted("age < OLD_DAYS * DAY_MS", "age < PAUSE_DAYS * DAY_MS");
  const now = Date.UTC(2026, 10, 12), d = 864e5;
  assert.notEqual(lateDay.priceAge(now - 7 * d, now), "paused", "a pause a day late wasn't caught");
  assert.notEqual(noWarn.priceAge(now - 3 * d, now), "old", "a missing warning wasn't caught");
});

// ---- 1.2.0: making a forecast easier to read ----
// A score like the Track record's: n calls, leans, right, leanWeeks, rose
const sc = (leans, right, rose, leanWeeks = 13) => ({ n: leans + 10, leans, right, rose, leanWeeks, weeks: leanWeeks });
const fcOf = (lean, confidence, odds = lean === "up" ? 60 : lean === "down" ? 40 : 50) => ({ ok: true, lean, confidence, odds });

test("In short: every case gets its own plain words", () => {
  const better = sc(40, 32, 20), easy = sc(40, 32, 34), worse = sc(40, 8, 20), even = sc(40, 21, 20), luck = sc(40, 25, 20), few = sc(5, 4, 2, 3);
  const cases = [
    [fcOf("flip", "none"), null, null, "flip", "No lean either way. For the next 7 days, it's a coin flip."],
    [fcOf("up", "low"), null, null, "none", "Leaning up a little, but the track record isn't ready yet to check it against. Treat it as a hint."],
    [fcOf("up", "low"), few, null, "few", "Leaning up a little, but there are too few past leans yet to check it against. Treat it as a hint."],
    [fcOf("down", "medium"), better, null, "better", "Leaning down with medium confidence, and its past leans did better than a coin flip. It's still a guess, not a sure thing."],
    [fcOf("up", "low"), better, null, "better", "Leaning up a little, and its past leans did better than a coin flip. Still, treat it as a hint."],
    [fcOf("up", "high"), easy, null, "easy", "Leaning up with high confidence, but its past leans did no better than just guessing up every time. Treat it as a hint."],
    [fcOf("up", "low"), worse, null, "worse", "Leaning up a little, but its past leans did worse than a coin flip. Don't count on it."],
    [fcOf("up", "low"), even, null, "even", "Leaning up a little, but its past leans were right 53% of the time, about what a coin flip gets. Treat it as a hint."],
    [fcOf("down", "medium"), luck, null, "luck", "Leaning down with medium confidence, but its past leans were right 63% of the time, which could still be luck. Treat it as a hint."],
    // too few of its own: all coins together stand in
    [fcOf("up", "medium"), few, even, "even", "Leaning up with medium confidence, but past leans across all coins were right 53% of the time, about what a coin flip gets. Treat it as a hint."],
  ];
  for (const [fc, own, all, key, text] of cases) assert.deepEqual(E.inShort(fc, own, all), { key, text });
  // the easy guess going "down" says so, and a tie with the leans still counts as not beating it
  assert.match(E.inShort(fcOf("down", "medium"), sc(40, 32, 8), null).text, /no better than just guessing down every time/);
  assert.equal(E.inShort(fcOf("up", "medium"), sc(40, 32, 32), null).key, "easy");
  // a score from before 1.1.0 (no rose) can't show the easy guess, so it reads as better than a coin flip
  assert.equal(E.inShort(fcOf("up", "medium"), Object.assign(sc(40, 32, 0), { rose: undefined }), null).key, "better");
  // no forecast, no sentence
  assert.equal(E.inShort({ ok: false, reason: "flat" }, better, better), null);
  assert.equal(E.inShort(null, null, null), null);
});

test("In short is honest: with no real pattern it rarely says better than a coin flip, and otherwise says to go easy", () => {
  const keys = {};
  for (const seed of [41, 42, 43]) {
    const coins = world({ seed });
    for (const cut of [300, 364]) {
      const past = coins.map((c) => ({ id: c.id, daily: { start: START, closes: c.daily.closes.slice(0, cut) } }));
      const rec = E.trackRecord(past), by = new Map(rec.coins.map((s) => [s.id, s]));
      const prep = E.prepare(E.buildLibrary(past), dayOf(cut));
      for (const c of coins) {
        const fc = E.forecastCoin(prep, { closes: c.daily.closes.slice(0, cut) }, c.daily.closes[cut]);
        if (!fc.ok) continue;
        fc.confidence = E.capConfidence(fc.confidence, by.get(c.id), rec.all).confidence;
        const s = E.inShort(fc, by.get(c.id), rec.all);
        keys[s.key] = (keys[s.key] || 0) + 1;
        assert.doesNotMatch(s.text, /\b(buy|sell|guarantee[ds]?|sure bet)\b/i);
        if (s.key !== "flip" && s.key !== "better") assert.match(s.text, /Treat it as a hint\.$|Don't count on it\.$/, s.text);
      }
    }
  }
  const leans = Object.entries(keys).filter(([k]) => k !== "flip").reduce((a, [, v]) => a + v, 0);
  assert.ok(leans >= 20, "too few leans to judge: " + JSON.stringify(keys));
  assert.ok((keys.better || 0) / leans <= 0.1, "with no pattern it said 'better than a coin flip' too often: " + JSON.stringify(keys));
});

test("planted bugs in In short get caught", () => {
  const easy = sc(40, 32, 34), worse = sc(40, 8, 20), luck = sc(40, 25, 20), few = sc(5, 4, 2, 3), even = sc(40, 21, 20);
  // 1. the easy guess no longer checked
  assert.equal(planted("if (easy && easy.right >= s.right) return", "if (false) return").inShort(fcOf("up", "medium"), easy, null).key, "better", "a missing easy-guess check wasn't caught");
  // 2. worse than a coin flip no longer said
  assert.notEqual(planted('if (verdict === "worse")', 'if (verdict === "never")').inShort(fcOf("up", "low"), worse, null).key, "worse", "a missing 'worse' wasn't caught");
  // 3. "about what a coin flip gets" stretched too far
  assert.equal(planted("Math.abs(hit - 50) <= 5", "Math.abs(hit - 50) <= 50").inShort(fcOf("up", "low"), luck, null).key, "even", "a stretched coin-flip band wasn't caught");
  // 4. the coin's own few leans used instead of all coins together
  assert.doesNotMatch(planted('const s = by === "coin" ? coinScore : allScore;\n    const whose', 'const s = coinScore;\n    const whose').inShort(fcOf("up", "medium"), few, even).text, /53%/, "using too few leans wasn't caught");
  assert.match(E.inShort(fcOf("up", "medium"), few, even).text, /53%/);
});

test("last week's call matches the track record's latest call for that coin, and is scored the same way", () => {
  const coins = world({ seed: 8, coins: 12 });
  const lib = E.buildLibrary(coins);
  const calls = E.replayCalls(coins, 3);
  const lastDay = Math.max(...calls.map((c) => c.day));
  assert.equal(lastDay, dayOf(365 - 1 - E.AHEAD));
  for (const c of coins) {
    const mine = E.lastCall(lib, c), theirs = calls.find((x) => x.coin === c.id && x.day === lastDay);
    assert.ok(mine && theirs, c.id + ": no call");
    for (const k of ["day", "lean", "odds", "confidence", "price", "low", "best", "high", "later"]) assert.equal(mine[k], theirs[k], c.id + ": " + k);
    assert.equal(mine.from, E.dayIso(lastDay));
    assert.equal(mine.to, E.dayIso(lastDay + E.AHEAD));
    assert.equal(mine.later, c.daily.closes[364]);
    // scored a second way, by hand
    const rose = mine.later > mine.price;
    assert.equal(mine.right, mine.lean === "flip" ? null : mine.lean === "up" ? rose : !rose);
    assert.equal(mine.inRange, mine.later >= mine.low && mine.later <= mine.high);
    assert.ok(Math.abs(mine.move - (mine.later / mine.price - 1)) < 1e-12);
    allFinite({ price: mine.price, low: mine.low, high: mine.high, move: mine.move });
  }
});

test("last week's call never sees past its own day, except the last price it's scored on", () => {
  const coins = world({ seed: 9, coins: 10 });
  const lib = E.buildLibrary(coins);
  const before = coins.map((c) => E.lastCall(lib, c));
  // shake every price after the call's day except the very last one, for every coin
  const shaken = coins.map((c) => {
    const px = c.daily.closes.slice(), i = px.length - 1 - E.AHEAD;
    for (let k = i + 1; k < px.length - 1; k++) px[k] *= k % 2 ? 1.3 : 0.7;
    return { id: c.id, daily: { start: c.daily.start, closes: px } };
  });
  const shakenLib = E.buildLibrary(shaken);
  const after = shaken.map((c) => E.lastCall(shakenLib, c));
  for (let k = 0; k < coins.length; k++) for (const f of ["lean", "odds", "low", "high", "later", "right"]) assert.equal(after[k][f], before[k][f], coins[k].id + ": " + f);
  // a call that peeks: its library sees 7 more days
  const peek = planted("const prep = prepare(lib, start + i);", "const prep = prepare(lib, start + i + 7);");
  const moved = shaken.some((c, k) => { const a = peek.lastCall(shakenLib, c), b = peek.lastCall(lib, coins[k]); return a.odds !== b.odds || a.low !== b.low; });
  assert.ok(moved, "a last week's call that peeks wasn't caught");
});

test("last week's call says nothing, without crashing, when there's no call to check", () => {
  const lib = E.buildLibrary(world({ seed: 10, coins: 8 }));
  const short = { id: "s", daily: { start: START, closes: Array.from({ length: E.MIN_DAYS + E.AHEAD }, (_, i) => 100 + Math.sin(i)) } };
  assert.equal(E.lastCall(lib, short), null);
  // just long enough, ending on the same day as the made-up market (so the look-alike library is full by then)
  assert.ok(E.lastCall(lib, { id: "ok", daily: { start: E.dayIso(dayOf(365 - E.MIN_DAYS - E.AHEAD - 1)), closes: Array.from({ length: E.MIN_DAYS + E.AHEAD + 1 }, (_, i) => 100 * Math.exp(0.02 * Math.sin(i * 1.7))) } }));
  for (const bad of [null, {}, { id: "x" }, { id: "x", daily: { start: "bad", closes: [1, 2, 3] } }, { id: "x", daily: { start: START, closes: "no" } }]) assert.equal(E.lastCall(lib, bad), null);
  assert.equal(E.lastCall([], world({ seed: 10, coins: 1 })[0]), null);
});

test("big swing note: much more than usual, and only about 1 day in 20 on made-up markets", () => {
  const r = rng(77);
  const walk = (n, sd, from = 100) => { const px = [from]; for (let i = 1; i < n; i++) px.push(px[i - 1] * Math.exp(sd * gauss(r))); return px; };
  const calm = walk(120, 0.01);
  const wild = calm.slice(0, 100).concat(walk(21, 0.03, calm[99]).slice(1));
  assert.equal(E.bigSwing(E.setupAt(calm, 119).raw), false);
  assert.equal(E.bigSwing(E.setupAt(wild, 119).raw), true);
  assert.equal(E.bigSwing(null), false);
  assert.equal(E.bigSwing({ swing: E.BIG_SWING }), true);
  assert.equal(E.bigSwing({ swing: E.BIG_SWING - 0.001 }), false);
  let n = 0, big = 0;
  for (const seed of [1, 2, 3]) for (const c of world({ seed })) for (let i = 60; i < 365; i++) {
    const s = E.setupAt(c.daily.closes, i);
    if (s) { n++; if (E.bigSwing(s.raw)) big++; }
  }
  assert.ok(big / n > 0.02 && big / n < 0.08, "big swings on " + (100 * big / n).toFixed(1) + "% of days");
  // planted: the bar dropped to plain "more than usual"
  const low = planted("return !!setup && setup.swing >= BIG_SWING;", "return !!setup && setup.swing >= 1.25;");
  let lowBig = 0;
  for (const c of world({ seed: 1 })) for (let i = 60; i < 365; i++) { const s = E.setupAt(c.daily.closes, i); if (s && low.bigSwing(s.raw)) lowBig++; }
  assert.ok(lowBig / (n / 3) > 0.08, "a lower bar wasn't caught");
});

test("past year facts match a count by hand", () => {
  const px = [100, 101, 102, 103, 104, 105, 106, 107, 90, 95, 120, 80];
  // 7-day stretches: 107/100, 90/101, 95/102, 120/103, 80/104
  const f = E.pastYear(px);
  assert.equal(f.days, 12);
  assert.equal(f.stretches, 5);
  assert.equal(f.fell, 3);
  assert.ok(Math.abs(f.drop - (1 - 80 / 104)) < 1e-12);
  assert.ok(Math.abs(f.fellShare - 3 / 5) < 1e-12);
  // a whole made-up year, a second way
  for (const c of world({ seed: 12, coins: 4, days: 400 })) {
    const all = c.daily.closes, year = all.slice(-365);
    let worst = 0, fell = 0;
    for (let i = 7; i < year.length; i++) { worst = Math.min(worst, year[i] / year[i - 7] - 1); if (year[i] < year[i - 7]) fell++; }
    const g = E.pastYear(all);
    assert.equal(g.days, 365);
    assert.equal(g.stretches, 358);
    assert.equal(g.fell, fell);
    assert.ok(Math.abs(g.drop + worst) < 1e-12);
  }
  // never fell: no drop at all
  assert.equal(E.pastYear([1, 2, 3, 4, 5, 6, 7, 8, 9]).drop, 0);
  assert.equal(E.pastYear([1, 2, 3, 4, 5, 6, 7]), null);
  assert.equal(E.pastYear(null), null);
  // planted: the whole history used instead of the past year
  const longer = world({ seed: 12, coins: 1, days: 400 })[0].daily.closes;
  assert.notEqual(planted("const px = closes.slice(-YEAR_DAYS);", "const px = closes.slice();").pastYear(longer).stretches, 358, "using more than a year wasn't caught");
});
