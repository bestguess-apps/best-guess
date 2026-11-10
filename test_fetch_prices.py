"""Tests for fetch_prices.py, using made-up data only (no network).

Run:  python3 test_fetch_prices.py
"""
import datetime as dt
import io
import json
import os
import pathlib
import sys
import tempfile
import unittest
import urllib.error

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import fetch_prices as fp  # noqa: E402

NOW = dt.datetime(2026, 11, 10, 6, 17, tzinfo=dt.timezone.utc)
DAY_MS = 86400000


def market(cid, rank, price=10.0, symbol=None, name=None, ath=None, atl=None, change=1.5):
    return {"id": cid, "symbol": symbol or cid[:4], "name": name or cid.title(), "current_price": price,
            "market_cap_rank": rank, "price_change_percentage_24h": change,
            "ath": ath if ath is not None else price * 3, "atl": atl if atl is not None else price / 10}


def chart(days=365, end=NOW, price=100.0, skip=()):
    start = dt.datetime(end.year, end.month, end.day, tzinfo=dt.timezone.utc) - dt.timedelta(days=days)
    pts = []
    for i in range(days + 1):
        t = start + dt.timedelta(days=i)
        if i in skip:
            continue
        pts.append([int(t.timestamp() * 1000), price + i])
    pts.append([int(end.timestamp() * 1000), price + days + 0.5])   # CoinGecko adds a "now" point
    return {"prices": pts}


class FakeClient:
    def __init__(self, markets, charts=None, fail_markets=False, fail_ids=()):
        self.markets, self.charts = markets, charts or {}
        self.fail_markets, self.fail_ids = fail_markets, set(fail_ids)
        self.calls = 0
        self.paths = []

    def get(self, path):
        self.calls += 1
        self.paths.append(path)
        if path.startswith("/coins/markets"):
            if self.fail_markets:
                raise RuntimeError("busy")
            return self.markets
        cid = path.split("/")[2]
        if cid in self.fail_ids:
            raise RuntimeError("busy")
        return self.charts.get(cid, chart())


class PickMenu(unittest.TestCase):
    def test_skips_stablecoins_and_wrapped_coins(self):
        ms = [market("bitcoin", 1, 100000, "btc"), market("tether", 3, 1.0, "usdt", ath=1.32, atl=0.57),
              market("usd-coin", 6, 1.0, "usdc"), market("dai", 20, 1.0, "dai"),
              market("wrapped-bitcoin", 14, 99000, "wbtc", "Wrapped Bitcoin"), market("staked-ether", 8, 3500, "steth", "Lido Staked Ether"),
              market("weth", 30, 3500, "weth", "WETH"), market("mystery-dollar", 40, 1.0, "mdl", ath=1.2, atl=0.9),
              market("tether-gold", 45, 2600, "xaut"), market("ethereum", 2, 3500, "eth"), market("cardano", 9, 0.98, "ada", ath=3.09, atl=0.02)]
        ids = [c["id"] for c in fp.pick_menu(ms)]
        self.assertEqual(ids, ["bitcoin", "ethereum", "cardano"])

    def test_cleans_and_checks_fields(self):
        ms = [market("good", 2, name="Nice\u202eCoin<img src=x onerror=alert(1)>\n" + "x" * 80),
              market("Bad ID", 1), market("../etc", 3), market("dup", 4), market("dup", 5),
              {"id": "noprice", "market_cap_rank": 6, "current_price": "1"}, market("nan", 7, price=float("nan")),
              market("norank", None), "junk", market("neg", 8, price=-1), market("boolrank", True)]
        menu = fp.pick_menu(ms)
        self.assertEqual([c["id"] for c in menu], ["good", "dup"])
        self.assertNotIn("\u202e", menu[0]["name"])
        self.assertNotIn("\n", menu[0]["name"])
        self.assertLessEqual(len(menu[0]["name"]), 40)
        with self.assertRaises(ValueError):
            fp.pick_menu({"error": "x"})

    def test_keeps_top_25_by_rank(self):
        ms = [market("coin-%d" % i, 60 - i) for i in range(60)]
        menu = fp.pick_menu(ms)
        self.assertEqual(len(menu), 25)
        self.assertEqual(menu[0]["rank"], 1)
        self.assertEqual(menu[-1]["rank"], 25)


class Daily(unittest.TestCase):
    def test_one_point_per_day_before_today(self):
        d = fp.to_daily(chart(days=365), NOW.date())
        self.assertEqual(len(d["closes"]), 365)
        self.assertEqual(fp.last_day(d), NOW.date() - dt.timedelta(days=1))
        self.assertEqual(d["start"], (NOW.date() - dt.timedelta(days=365)).isoformat())
        self.assertEqual(d["closes"][0], 100.0)

    def test_gaps_repeat_the_day_before(self):
        d = fp.to_daily(chart(days=60, skip=(10, 11)), NOW.date())
        self.assertEqual(len(d["closes"]), 60)
        self.assertEqual(d["closes"][10], d["closes"][9])
        self.assertEqual(d["closes"][11], d["closes"][9])
        self.assertEqual(d["closes"][12], 112.0)

    def test_too_little_or_broken_history(self):
        with self.assertRaises(ValueError):
            fp.to_daily(chart(days=10), NOW.date())
        with self.assertRaises(ValueError):
            fp.to_daily({"prices": "nope"}, NOW.date())
        bad = chart(days=40)
        bad["prices"][5] = ["x", 1]
        bad["prices"][6] = [1, -5]
        self.assertEqual(len(fp.to_daily(bad, NOW.date())["closes"]), 40)

    def test_never_longer_than_400_days(self):
        self.assertEqual(len(fp.to_daily(chart(days=500), NOW.date())["closes"]), 400)


def published(coins=30, fetched=NOW - dt.timedelta(hours=7), last=None):
    last = last or (NOW.date() - dt.timedelta(days=1))
    start = last - dt.timedelta(days=99)
    return {"app": "best-guess", "v": 1, "fetched": fetched.strftime("%Y-%m-%dT%H:%M:%SZ"), "source": "CoinGecko",
            "coins": [{"id": "coin-%d" % i, "symbol": "c%d" % i, "name": "Coin %d" % i, "rank": i + 1, "price": 5.0,
                       "change24h": 1.0, "daily": {"start": start.isoformat(), "closes": [1.0] * 100}} for i in range(coins)]}


def write_json(obj):
    f = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False)
    json.dump(obj, f)
    f.close()
    return f.name


class Previous(unittest.TestCase):
    def test_reads_a_good_file(self):
        p = fp.read_previous(write_json(published()))
        self.assertEqual(len(p["coins"]), 30)

    def test_rejects_odd_files(self):
        for bad in [{"app": "other", "v": 1}, {"app": "best-guess", "v": 2, "fetched": "2026-11-10T00:00:00Z", "coins": []},
                    {"app": "best-guess", "v": 1, "fetched": "yesterday", "coins": []}, [1, 2], "text"]:
            self.assertIsNone(fp.read_previous(write_json(bad)))
        self.assertIsNone(fp.read_previous("/nope/missing.json"))
        self.assertIsNone(fp.read_previous(None))
        g = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False)
        g.write("{not json")
        g.close()
        self.assertIsNone(fp.read_previous(g.name))

    def test_drops_bad_history(self):
        doc = published(coins=2)
        doc["coins"][0]["daily"]["closes"][3] = "x"
        doc["coins"][1]["daily"] = {"start": "2026-02-30", "closes": [1.0]}
        p = fp.read_previous(write_json(doc))
        self.assertIsNone(p["coins"][0]["daily"])
        self.assertIsNone(p["coins"][1]["daily"])


def filler(n, first_rank):
    return [market("filler-%d" % i, first_rank + i) for i in range(n)]


class Build(unittest.TestCase):
    def test_fresh_previous_is_kept_without_asking_coingecko(self):
        prev = fp.read_previous(write_json(published(fetched=NOW - dt.timedelta(hours=2))))
        c = FakeClient([])
        self.assertIs(fp.build(prev, NOW, c), prev)
        self.assertEqual(c.calls, 0)

    def test_reuses_history_that_already_has_yesterday(self):
        prev = fp.read_previous(write_json(published(coins=3)))
        c = FakeClient([market("coin-0", 1), market("coin-1", 2), market("newcoin", 3)] + filler(3, 4))
        data = fp.build(prev, NOW, c)
        self.assertEqual([x["id"] for x in data["coins"]][:3], ["coin-0", "coin-1", "newcoin"])
        self.assertEqual(c.calls, 5)   # the list, plus history for the 4 coins it didn't have
        self.assertEqual(len(data["coins"][0]["daily"]["closes"]), 100)
        self.assertEqual(len(data["coins"][2]["daily"]["closes"]), 365)

    def test_old_history_is_refreshed(self):
        prev = fp.read_previous(write_json(published(coins=1, last=NOW.date() - dt.timedelta(days=3))))
        c = FakeClient([market("coin-0", 1)] + filler(4, 2))
        data = fp.build(prev, NOW, c)
        self.assertEqual(c.calls, 6)
        self.assertEqual(len(data["coins"][0]["daily"]["closes"]), 365)

    def test_a_failed_coin_keeps_its_old_history(self):
        prev = fp.read_previous(write_json(published(coins=1, last=NOW.date() - dt.timedelta(days=3))))
        c = FakeClient([market("coin-0", 1), market("other", 2)] + filler(3, 3), fail_ids={"coin-0", "other"})
        data = fp.build(prev, NOW, c)
        self.assertEqual(len(data["coins"][0]["daily"]["closes"]), 100)
        self.assertIsNone(data["coins"][1]["daily"])

    def test_coin_list_failure_keeps_last_prices(self):
        prev = fp.read_previous(write_json(published()))
        self.assertIs(fp.build(prev, NOW, FakeClient([], fail_markets=True)), prev)
        self.assertIsNone(fp.build(None, NOW, FakeClient([], fail_markets=True)))
        self.assertIs(fp.build(prev, NOW, FakeClient([market("a", 1)])), prev)   # too few usable coins


class Main(unittest.TestCase):
    def test_writes_a_clean_file(self):
        out = os.path.join(tempfile.mkdtemp(), "site", "prices.json")
        prev = write_json(published(fetched=NOW - dt.timedelta(hours=1)))
        self.assertEqual(fp.main(["--out", out, "--previous", prev], client=FakeClient([]), now=NOW), 0)
        doc = json.load(open(out))
        self.assertEqual(doc["app"], "best-guess")
        self.assertNotIn("_fetched_at", doc)
        self.assertEqual(len(doc["coins"]), 30)

    def test_dry_run_and_nothing_to_publish_write_nothing(self):
        d = tempfile.mkdtemp()
        out = os.path.join(d, "prices.json")
        self.assertEqual(fp.main(["--out", out, "--dry-run"], client=FakeClient([market("coin-%d" % i, i + 1) for i in range(6)]), now=NOW), 0)
        self.assertFalse(os.path.exists(out))
        self.assertEqual(fp.main(["--out", out], client=FakeClient([], fail_markets=True), now=NOW), 0)
        self.assertFalse(os.path.exists(out))


class FakeRes:
    def __init__(self, body):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def read(self, n):
        return self.body[:n]


class ClientPacing(unittest.TestCase):
    def test_waits_between_requests_and_backs_off_when_busy(self):
        sleeps, t = [], [0.0]
        answers = [urllib.error.HTTPError("u", 429, "busy", {"Retry-After": "7"}, io.BytesIO()),
                   FakeRes(b'{"ok": 1}'), FakeRes(b'{"ok": 2}')]

        def opener(req, timeout):
            self.assertIn("best-guess", req.get_header("User-agent"))
            a = answers.pop(0)
            if isinstance(a, Exception):
                raise a
            return a

        def sleep(s):
            sleeps.append(s)
            t[0] += s

        c = fp.Client(sleep=sleep, clock=lambda: t[0], opener=opener)
        self.assertEqual(c.get("/a"), {"ok": 1})
        self.assertEqual(c.get("/b"), {"ok": 2})
        self.assertEqual(sleeps[0], 7)                       # CoinGecko's Retry-After
        self.assertAlmostEqual(sleeps[1], fp.GAP_SECONDS - 7)  # rest of the gap before the retry
        self.assertAlmostEqual(sleeps[2], fp.GAP_SECONDS)      # full gap before the next request

    def test_gives_up_and_does_not_retry_real_errors(self):
        def not_found(req, timeout):
            raise urllib.error.HTTPError("u", 404, "nope", {}, io.BytesIO())
        with self.assertRaises(urllib.error.HTTPError):
            fp.Client(sleep=lambda s: None, opener=not_found).get("/x")

        def down(req, timeout):
            raise urllib.error.URLError("down")
        with self.assertRaises(RuntimeError):
            fp.Client(sleep=lambda s: None, opener=down).get("/x", tries=3)

    def test_stops_within_its_time_budget(self):
        t = [0.0]
        markets = json.dumps([market("coin-%d" % i, i + 1) for i in range(25)]).encode()

        def opener(req, timeout):
            if "/coins/markets" in req.full_url:
                return FakeRes(markets)
            t[0] += 30   # each failed try also takes time
            raise urllib.error.URLError("down")

        def sleep(s):
            t[0] += s

        prev = fp.read_previous(write_json(published(coins=25, last=NOW.date() - dt.timedelta(days=3))))
        c = fp.Client(sleep=sleep, clock=lambda: t[0], opener=opener)
        data = fp.build(prev, NOW, c)
        self.assertLessEqual(t[0], fp.BUDGET_SECONDS + 60)
        self.assertEqual(len(data["coins"]), 25)
        self.assertTrue(all(x["daily"] and len(x["daily"]["closes"]) == 100 for x in data["coins"]))

    def test_refuses_huge_answers(self):
        c = fp.Client(sleep=lambda s: None, opener=lambda r, timeout: FakeRes(b"1" * (fp.MAX_BYTES + 5)))
        with self.assertRaises(ValueError):
            c.get("/x")


if __name__ == "__main__":
    unittest.main(verbosity=1)
