# Best Guess: progress

Read this and how-to-update.md before changing anything. Decisions below were made on purpose; don't "fix" them without asking.

## What it is
A free crypto forecaster for friends and family. Pick coins from the top 25 and see which way each is leaning over the next 7 days, how confident that is, a likely price range, and how often the engine has been right before. Not financial advice. A simple web tool (project type 2), with live outside data.

## Where things stand (Nov 9, 2026)
- **Stage 1 (the pipes), version 0.1.0:** built and tested in headless Chrome with made-up prices (see CHANGELOG). Waiting on: Pages turned on (source: GitHub Actions), the first Publish run with real CoinGecko data, and About → Data check on a real iPhone saying both saved and live prices work.
- Stages 2 to 5 not started.

## Where it lives
- Repo: github.com/bestguess-apps/best-guess (its own GitHub org, apart from freeforgood-apps)
- Website: https://bestguess-apps.github.io/best-guess/ (published by the Publish workflow, not from a branch)
- Storage key: `best-guess-v1` (one small object: watchlist, text size, tab, last live prices). Cache prefix: `best-guess-`.
- Files: `index.html` (the app), `sw.js`, `manifest.webmanifest`, icons, `rebuild.py` (lock and version), `fetch_prices.py` and `test_fetch_prices.py` (the price fetcher), `.github/workflows/publish.yml` and `tag-new-versions.yml`.
- `prices.json` exists only on the website. It's made at publish time and never committed.

## Next up
1. **Finish stage 1:** turn on Pages (Settings → Pages → Source: GitHub Actions), run Publish, check the run, then About → Data check on the iPhone.
2. **Update the app skills** with what stage 1 proved: apps in other orgs, and apps with live outside data (privacy lock, honest promise, data checks, rate limits, publishing with Actions).
3. **Org security settings:** match freeforgood-apps' settings on bestguess-apps and the Usage Saver org.
4. **Stage 2, the forecasting engine:** for each coin, read a year of daily prices, size up the setup (trend vs 20- and 50-day averages, 7- and 30-day momentum, how much it swings, how stretched it is), find past look-alike setups and what happened 7 days later, then show: odds and a confidence level, a most-likely price and likely range for 7 days on a small fan chart, and key levels (recent highs and lows the price keeps bumping into). Plain functions with `node --test` tests. Also: editing the watchlist (up to 10 coins from the menu).
5. **Stage 3, Track record:** replay the engine over the last 90 days without letting it see the future, compared with a coin flip and with "no change."
6. **Stage 4, Worth a look:** the day's 1 to 3 strongest, best-tested leans, or "Nothing stands out today."
7. **Stage 5, first release:** self-test page (`#st-go`, `#st-sum`), toolkit release check, accessibility check, security release check, CHANGELOG, then the iPhone self-test and VoiceOver run.

## Ground rules
- Free, with no ads, accounts, tracking, exchange or referral links, wallets or payments. Never "buy" or "sell" wording, no "guaranteed", no AI hype.
- "Not financial advice" sits on every forecast screen, not only in About.
- Honest numbers: when history says about 50%, say "coin flip." Show the track record even when it's bad.
- Keep the creator anonymous: no real names, emails or Claude links in code, commits or anything public. Commits in UTC.
- Verify before calling anything tested, and say exactly what ran.

## Decisions
- **Its own GitHub org (bestguess-apps), not freeforgood-apps:** keeps a money-related app apart from the free-for-everyone apps. It also gets its own web address, so no storage is shared with other apps.
- **The name Best Guess:** "Hunch" is already a crypto coin on CoinGecko (it would show up in the app's own data) and a crypto betting app, and "Crypto Weather" is an existing crypto app. No crypto or forecast app called Best Guess turned up.
- **Talks to one outside service, on purpose:** the privacy lock allows `https://api.coingecko.com` for the live check. This is an exception to the skills' "no outside requests" rule until the skills are updated after stage 1. Nothing about the person is sent; the About screen says so plainly.
- **Prices from both places:** GitHub fetches the top 25 coins and their history a few times a day (private, instant, works offline), and the phone does one live check per visit (fresh prices). People pick from a menu of 25 because GitHub can't know anyone's private watchlist.
- **Published by GitHub Actions** (Pages source "GitHub Actions"), not "Deploy from a branch": prices are added at publish time, so the repo doesn't fill up with price commits.
- **`prices.json` is network-first in sw.js** (everything else is cache-first), so offline people get the last prices and online people never get stuck with old ones.
- **CoinGecko keyless, no account:** free and anonymous. Limit is about 5 requests a minute per internet address. If CoinGecko tightens it, the fix is a free CoinGecko key stored as a GitHub Actions secret, never in the app. That needs a sign-up, so ask first.
- **Stablecoins and wrapped, staked or bridged coins are left out:** they're pegged or just follow another coin, so forecasting them is pointless.
- **Daily history = CoinGecko's 00:00 UTC prices,** one per day before today, with missing days filled by the day before.
- **7-day look-ahead:** steadier and more honest than day to day.
- **Forecast shows:** odds with confidence, a 7-day likely range with a fan chart, and key levels. "Your guess vs Best Guess" was offered and not picked.
- **Track record is recalculated from price history,** not saved, so there's nothing to lose and no backup system (project type 2).
- **No coin logos:** they'd load from CoinGecko's image servers and share people's internet address. Symbol badges instead.
- **No feedback email in v1:** friends and family tell the person who shared it. That also avoids tying it to the freeforgood-apps email.
- **Commits:** same as the other apps: the GitHub account's private noreply address as author, Claude as committer (so they show Verified), dates in UTC, no Claude links. Chosen knowing it shows the same account behind both orgs.
- **Fonts:** the same built-in fonts as Till Payday (Atkinson Hyperlegible, Bricolage Grotesque, DM Mono; SIL Open Font License). Own colors (indigo), contrast computed in code.

## Known limits
- GitHub Pages can't set headers, so the lock is a meta tag and `frame-ancestors` (clickjacking) isn't possible.
- Scheduled runs can be late, and GitHub pauses them in public repos after 60 days without changes (see how-to-update.md).
- CoinGecko says keyless access isn't meant for production, and GitHub's shared runner addresses may get "busy" answers more often. The fetcher waits, retries and falls back to the last good prices.
