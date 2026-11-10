# Best Guess: progress

Read this and how-to-update.md before changing anything. Decisions below were made on purpose; don't "fix" them without asking.

## What it is
A free crypto forecaster for friends and family. Pick coins from the top 25 and see which way each is leaning over the next 7 days, how confident that is, a likely price range, and how often the engine has been right before. Not financial advice. A simple web tool (project type 2), with live outside data.

## Where things stand (Nov 10, 2026)
- **Stage 1 (the pipes), version 0.1.0:** built and tested in headless Chrome with made-up prices (see CHANGELOG). Pages is on (source: GitHub Actions). The first Publish run (Nov 10, 02:02 UTC) got all 25 coins with a full year of history from CoinGecko in 26 requests, with no "busy" answers, and published the site. **Stage 1 is done:** on a real iPhone (Nov 10, 02:22 UTC), About → Data check said "25 coins, updated 20 minutes ago" and "Live prices: Working," so CoinGecko allows the live check from a real phone browser.
- **Stage 2 (the forecasting engine), version 0.2.0:** built and tested with made-up prices (see CHANGELOG). Each watchlist row shows its 7-day lean; tapping it opens the forecast (odds, confidence, best guess, likely range on a fan chart, key levels, why, how it works). Edit coins (1 to 10) and a Share button are in. **Still to do:** check it on a real iPhone with real prices once Publish has run: open a few coins, and About → Data check.
- Stages 3 to 5 not started.

## Where it lives
- Repo: github.com/bestguess-apps/best-guess (its own GitHub org, apart from freeforgood-apps)
- Website: https://bestguess-apps.github.io/best-guess/ (published by the Publish workflow, not from a branch)
- Storage key: `best-guess-v1` (one small object: watchlist, text size, tab, last live prices). Cache prefix: `best-guess-`.
- Files: `index.html` (the app; its first script block is the forecasting engine, `BestGuessEngine`), `test_engine.mjs` (engine tests, run by Publish), `sw.js`, `manifest.webmanifest`, icons, `rebuild.py` (lock and version), `fetch_prices.py` and `test_fetch_prices.py` (the price fetcher), `.github/workflows/publish.yml` and `tag-new-versions.yml`.
- `prices.json` exists only on the website. It's made at publish time and never committed.

## Next up
1. ~~Finish stage 1~~ (done Nov 9).
2. ~~Update the app skills~~ with what stage 1 proved (done: app-new-project has "Live outside data", with Best Guess as the reference).
3. ~~Org security settings~~ on bestguess-apps and the Usage Saver org (done Nov 2026).
4. ~~Stage 2, the forecasting engine~~ (built Nov 10, version 0.2.0). Waiting on the real-iPhone check above.
5. **Stage 3, Track record:** replay the engine over the last 90 days without letting it see the future (`prepare(samples, asOfDay)` plus the closes up to that day, the way `replay()` in test_engine.mjs does), compared with a coin flip and with "no change." Speed matters here: 90 days × 25 coins is about 2,250 forecasts, which would take several seconds on an older phone at today's speed. Either speed up the look-alike search or work the replay out on GitHub at publish time and add it to prices.json. Also let the track record feed confidence (a coin whose calls have been poor shouldn't say High).
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
- **Talks to one outside service, on purpose:** the privacy lock allows `https://api.coingecko.com` for the live check, as the skills' "Live outside data" rules allow. Nothing about the person is sent; the About screen says so plainly.
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
- **History was rewritten, then the repo was recreated (Nov 10, 2026)** to scrub a personal detail from an early PROGRESS.md line. The rewrite alone wasn't enough: GitHub kept serving the old commits by ID, and the old Actions runs linked to them. So the old repo was renamed, a new empty `best-guess` was made (same name, same web address), the clean history was pushed, and the old repo was deleted. Actions history starts fresh from there. "Tag new versions" keeps its one addition to Till Payday's version: if a version tag points to a commit that's no longer in main's history, it moves the tag to the new commit. That tidies the tag list but doesn't hide the old commit. Normal tags are never touched, and if GitHub can't answer, it stops without changing anything. It checks whether a tag exists by gh's exit status, not its output: gh prints GitHub's "Not Found" reply too, which once made it skip every new tag (fixed Nov 10, 2026).
- **The engine (stage 2), and why:**
  - It describes each setup with six scale-free numbers (price vs 20- and 50-day averages and 7- and 30-day moves, all measured in that coin's daily swings; swings now vs usual; place in the 30-day range), so look-alikes can come from **all coins**, not just one. One coin's year is too few examples.
  - It uses the 50 closest look-alikes, weighting closer ones more, and counts how many **different weeks** they came from. Coins move together, so ten coins on the same day are one example, not ten.
  - Odds and the price range come from one mix: the look-alikes, plus general 7-day swings with no direction (worth 40 look-alikes). So thin evidence stays near 50-50, and the best guess can never point the other way from the lean.
  - **Pull toward 50-50 = 40, lean at 55% or more.** Tuned on made-up markets: at 12, it leaned on 54% of calls in markets with no real pattern; at 40, 20%, while still finding a planted pattern (right 67% of the time). Confidence: Medium needs 2 standard errors of agreement, High 2.8 and at least 15 separate weeks. The honesty test in test_engine.mjs fails if it starts overclaiming again.
  - Key levels are turning points (highest or lowest for 3 days each side) in the last 120 daily prices, grouped when close, needing 2 or more touches. Daily prices only, since the data has no daily highs and lows.
  - Forecast prices are rounded to 3 digits and key levels to 4: more digits would look more exact than a guess is.
  - Replays can't see the future: `prepare(samples, asOfDay)` only uses setups whose 7 days had ended by that day, and a test changes every later price to prove nothing moves.
  - It lives in its own script block in index.html (the app stays one file), and test_engine.mjs loads that block for `node --test`.
- **Edit coins:** 1 to 10 coins from the menu, shown in size order. The last coin can't be removed, because an empty list would quietly fall back to the top 5.
- **Share button, no donation button:** a tip jar was considered (Nov 2026) and left out: it breaks the "no payments" ground rule, looks like paying for tips on a money app, payouts need the owner's legal identity, and the fees eat most of a small tip. Share sends only the official link (share sheet, or copies the link on a tap), with no tracking or referral bits.
- **Fonts:** the same built-in fonts as Till Payday (Atkinson Hyperlegible, Bricolage Grotesque, DM Mono; SIL Open Font License). Own colors (indigo), contrast computed in code.

## Known limits
- Forecasts have only been tested on made-up prices so far. The Track record (stage 3) is the real test, and it will be shown even if it's bad.
- A year of prices holds only about 50 separate weeks, so confidence stays modest on purpose, and most days say "coin flip."
- GitHub Pages can't set headers, so the lock is a meta tag and `frame-ancestors` (clickjacking) isn't possible.
- Scheduled runs can be late, and GitHub pauses them in public repos after 60 days without changes (see how-to-update.md).
- CoinGecko says keyless access isn't meant for production, and GitHub's shared runner addresses may get "busy" answers more often. The fetcher waits, retries and falls back to the last good prices.
