"""Best Guess price fetcher. GitHub Actions runs it a few times a day.

It gets the top coins and a year of daily prices from CoinGecko's free keyless API
and writes prices.json for the website. It's careful with CoinGecko's free limit
(roughly 5 requests a minute, shared by everyone on the same internet address):
  - it waits between requests and backs off when CoinGecko says it's busy,
  - it reuses the last published file if that's still fresh (safe to run twice),
  - it reuses each coin's history when it already has yesterday's price,
  - if anything fails, it keeps the last good prices instead of publishing nothing.

Usage:
  python3 -I fetch_prices.py --out _site/prices.json [--previous previous.json] [--dry-run]

It only reads from CoinGecko and only writes the one --out file. No keys, no secrets.
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

API = "https://api.coingecko.com/api/v3"
MENU_SIZE = 25           # coins people can pick from
CANDIDATES = 60          # look at more than 25, so stablecoins and wrapped coins can be skipped
HISTORY_DAYS = 365
MAX_HISTORY = 400
GAP_SECONDS = 13         # about 4.6 requests a minute
FRESH_HOURS = 5          # a previous file newer than this is reused as is
BUDGET_SECONDS = 15 * 60 # stop asking after this long and keep old history (the job has 30 minutes)
MAX_BYTES = 5_000_000
UA = "best-guess-price-fetcher (+https://github.com/bestguess-apps/best-guess)"

ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
DAY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
CONTROL_RE = re.compile("[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]")

# Not worth forecasting: stablecoins (pegged to a dollar, euro or gold) and wrapped,
# staked or bridged copies of other coins (they just follow the original).
SKIP_SYMBOLS = {"dai", "usds", "tusd", "frax", "gho", "rlusd", "usd0", "usdd", "usde", "susde", "susds",
                "eurc", "eurs", "xaut", "paxg", "ustb", "buidl", "usdy", "ousg", "pyusd", "fdusd", "usd1"}
SKIP_SYMBOL_RE = re.compile(r"usd|eur", re.I)
SKIP_NAME_RE = re.compile(r"wrapped|staked|bridged|restaked|liquid staking|tokenized", re.I)
SKIP_ID_RE = re.compile(r"wrapped|staked|bridged|restak|-peg-|^weth$|^wbtc$|^wbnb$|^msol$|^jitosol$", re.I)


def log(msg):
    print(msg, flush=True)


def warn(msg):
    # Shows as a yellow note on the GitHub Actions run
    print("::warning::" + msg.replace("\n", " "), flush=True)


def clean_text(v, limit):
    return CONTROL_RE.sub("", v).strip()[:limit] if isinstance(v, str) else ""


def num(v, lo, hi):
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    v = float(v)
    return v if lo <= v <= hi and v == v else None


def real_day(s):
    if not isinstance(s, str) or not DAY_RE.match(s):
        return None
    try:
        return dt.date.fromisoformat(s)
    except ValueError:
        return None


def sig(x):
    """Round to 6 significant figures, so the file stays small."""
    return float("%.6g" % x)


# ---- talking to CoinGecko ----

class OutOfTime(RuntimeError):
    pass


class Client:
    def __init__(self, sleep=time.sleep, clock=time.monotonic, opener=urllib.request.urlopen, budget=BUDGET_SECONDS):
        self.sleep, self.clock, self.opener = sleep, clock, opener
        self.deadline = clock() + budget
        self.last = None
        self.calls = 0

    def pause(self, seconds):
        if self.clock() + seconds > self.deadline:
            raise OutOfTime("out of time for CoinGecko requests")
        self.sleep(seconds)

    def get(self, path, tries=4):
        for attempt in range(tries):
            if self.last is not None:
                wait = GAP_SECONDS - (self.clock() - self.last)
                if wait > 0:
                    self.pause(wait)
            if self.clock() > self.deadline:
                raise OutOfTime("out of time for CoinGecko requests")
            self.last = self.clock()
            self.calls += 1
            req = urllib.request.Request(API + path, headers={"Accept": "application/json", "User-Agent": UA})
            try:
                with self.opener(req, timeout=30) as res:
                    body = res.read(MAX_BYTES + 1)
                if len(body) > MAX_BYTES:
                    raise ValueError("CoinGecko's answer was too big")
                return json.loads(body)
            except urllib.error.HTTPError as e:
                if e.code != 429 and e.code < 500:
                    raise
                after = e.headers.get("Retry-After") if e.headers else None
                wait = int(after) if after and after.isdigit() and int(after) <= 300 else 30 * 2 ** attempt
                log("CoinGecko said %s; waiting %ss before trying again" % (e.code, wait))
                self.pause(wait)
            except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
                wait = 15 * 2 ** attempt
                log("Couldn't reach CoinGecko (%s); waiting %ss" % (type(e).__name__, wait))
                self.pause(wait)
        raise RuntimeError("CoinGecko didn't answer after %d tries" % tries)


# ---- picking the coins ----

def is_skipped(cid, symbol, name, price, ath, atl):
    s = symbol.lower()
    if s in SKIP_SYMBOLS or SKIP_SYMBOL_RE.search(s) or SKIP_NAME_RE.search(name) or SKIP_ID_RE.search(cid):
        return True
    # Unknown stablecoins: priced near $1 and never far from it
    if 0.9 <= price <= 1.1 and ath is not None and atl is not None and ath <= 1.6 and atl >= 0.5:
        return True
    return False


def pick_menu(markets):
    if not isinstance(markets, list):
        raise ValueError("CoinGecko's coin list wasn't a list")
    menu, seen = [], set()
    for m in markets:
        if not isinstance(m, dict):
            continue
        cid = m.get("id")
        if not isinstance(cid, str) or not ID_RE.match(cid) or cid in seen:
            continue
        price = num(m.get("current_price"), 1e-12, 1e9)
        rank = m.get("market_cap_rank")
        if price is None or not isinstance(rank, int) or isinstance(rank, bool) or not 0 < rank < 100000:
            continue
        symbol = clean_text(m.get("symbol"), 12)
        name = clean_text(m.get("name"), 40) or cid
        if is_skipped(cid, symbol, name, price, num(m.get("ath"), 0, 1e12), num(m.get("atl"), 0, 1e12)):
            continue
        seen.add(cid)
        change = num(m.get("price_change_percentage_24h"), -100, 100000)
        menu.append({"id": cid, "symbol": symbol.lower() or "?", "name": name, "rank": rank,
                     "price": sig(price), "change24h": None if change is None else round(change, 2)})
    menu.sort(key=lambda c: c["rank"])
    return menu[:MENU_SIZE]


# ---- daily history ----

def to_daily(chart, today):
    """CoinGecko's daily points are prices at 00:00 UTC. Keep one per day, before today, with no gaps."""
    pts = chart.get("prices") if isinstance(chart, dict) else None
    if not isinstance(pts, list):
        raise ValueError("no price history in CoinGecko's answer")
    by_day = {}
    for p in pts:
        if not (isinstance(p, list) and len(p) == 2):
            continue
        ms, price = num(p[0], 0, 1e14), num(p[1], 1e-12, 1e9)
        if ms is None or price is None:
            continue
        day = dt.datetime.fromtimestamp(ms / 1000, dt.timezone.utc).date()
        if day < today and day not in by_day:
            by_day[day] = price
    if len(by_day) < 30:
        raise ValueError("too little history (%d days)" % len(by_day))
    days = sorted(by_day)[-MAX_HISTORY:]
    closes, d, last = [], days[0], None
    while d <= days[-1]:
        last = by_day.get(d, last)   # a missing day repeats the day before
        closes.append(sig(last))
        d += dt.timedelta(days=1)
    closes = closes[-MAX_HISTORY:]
    start = days[-1] - dt.timedelta(days=len(closes) - 1)
    return {"start": start.isoformat(), "closes": closes}


def last_day(daily):
    start = real_day(daily.get("start")) if isinstance(daily, dict) else None
    closes = daily.get("closes") if isinstance(daily, dict) else None
    if not start or not isinstance(closes, list) or not closes:
        return None
    return start + dt.timedelta(days=len(closes) - 1)


# ---- the last published file ----

def read_previous(path):
    """Read and check the last published prices.json. Anything odd means: don't reuse it."""
    if not path or not os.path.exists(path):
        return None
    try:
        with open(path, "rb") as f:
            raw = f.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            return None
        j = json.loads(raw)
    except (OSError, ValueError):
        return None
    if not isinstance(j, dict) or j.get("app") != "best-guess" or j.get("v") != 1:
        return None
    try:
        fetched = dt.datetime.fromisoformat(str(j.get("fetched")).replace("Z", "+00:00"))
    except ValueError:
        return None
    coins = []
    for c in j.get("coins") if isinstance(j.get("coins"), list) else []:
        if not isinstance(c, dict) or not isinstance(c.get("id"), str) or not ID_RE.match(c["id"]):
            continue
        price = num(c.get("price"), 1e-12, 1e9)
        rank = c.get("rank")
        if price is None or not isinstance(rank, int) or isinstance(rank, bool):
            continue
        daily = c.get("daily")
        if daily is not None:
            closes = daily.get("closes") if isinstance(daily, dict) else None
            ok = (last_day(daily) and isinstance(closes, list) and len(closes) <= MAX_HISTORY
                  and all(num(x, 1e-12, 1e9) is not None for x in closes))
            daily = {"start": daily["start"], "closes": closes} if ok else None
        change = num(c.get("change24h"), -100, 100000)
        coins.append({"id": c["id"], "symbol": clean_text(c.get("symbol"), 12).lower() or "?",
                      "name": clean_text(c.get("name"), 40) or c["id"], "rank": rank, "price": price,
                      "change24h": change, "daily": daily})
    if not coins:
        return None
    return {"app": "best-guess", "v": 1, "fetched": fetched.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "source": "CoinGecko", "coins": coins, "_fetched_at": fetched}


# ---- putting it together ----

def build(previous, now, client):
    """Returns the data to publish (or None if there's nothing good to publish)."""
    if previous and now - previous["_fetched_at"] < dt.timedelta(hours=FRESH_HOURS) and len(previous["coins"]) >= MENU_SIZE * 0.8:
        log("The published prices are from %s, still fresh, so they're kept as is." % previous["fetched"])
        return previous
    try:
        menu = pick_menu(client.get("/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=%d&page=1&sparkline=false" % CANDIDATES))
        if len(menu) < 5:
            raise ValueError("only %d usable coins" % len(menu))
    except Exception as e:  # keep the last good prices
        warn("Couldn't get the coin list from CoinGecko (%s). Keeping the last published prices." % e)
        return previous
    old = {c["id"]: c for c in previous["coins"]} if previous else {}
    today = now.date()
    yesterday = today - dt.timedelta(days=1)
    reused = fetched = failed = 0
    out_of_time = False
    for coin in menu:
        prev = old.get(coin["id"])
        prev_daily = prev.get("daily") if prev else None
        if prev_daily and last_day(prev_daily) and last_day(prev_daily) >= yesterday:
            coin["daily"] = prev_daily
            reused += 1
            continue
        try:
            coin["daily"] = to_daily(client.get("/coins/%s/market_chart?vs_currency=usd&days=%d&interval=daily" % (coin["id"], HISTORY_DAYS)), today)
            fetched += 1
        except OutOfTime:
            if not out_of_time:
                warn("Ran out of time asking CoinGecko. The rest of the coins keep their old history.")
                out_of_time = True
            coin["daily"] = prev_daily
            failed += 1
        except Exception as e:
            warn("No fresh history for %s (%s)%s." % (coin["id"], e, "; keeping the old one" if prev_daily else ""))
            coin["daily"] = prev_daily
            failed += 1
    log("Coins: %d. History fetched for %d, reused for %d, failed for %d. CoinGecko requests: %d."
        % (len(menu), fetched, reused, failed, client.calls))
    return {"app": "best-guess", "v": 1, "fetched": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "source": "CoinGecko", "coins": menu}


def write(data, out):
    data = {k: v for k, v in data.items() if not k.startswith("_")}
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    tmp = out + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"), ensure_ascii=True)
    os.replace(tmp, out)


def main(argv=None, client=None, now=None):
    ap = argparse.ArgumentParser(description="Fetch prices for Best Guess")
    ap.add_argument("--out", required=True, help="where to write prices.json")
    ap.add_argument("--previous", help="the last published prices.json, if any")
    ap.add_argument("--dry-run", action="store_true", help="do everything except write the file")
    args = ap.parse_args(argv)
    now = now or dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    previous = read_previous(args.previous)
    if args.previous and not previous:
        log("No usable previous prices (missing or not a Best Guess file).")
    data = build(previous, now, client or Client())
    if not data:
        warn("No prices to publish yet. The website will say prices aren't ready.")
        return 0
    if args.dry_run:
        log("Dry run: would write %d coins to %s" % (len(data["coins"]), args.out))
        return 0
    write(data, args.out)
    log("Wrote %s (%d coins, fetched %s)." % (args.out, len(data["coins"]), data["fetched"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
