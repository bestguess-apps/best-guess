# Best Guess: progress

Read this and how-to-update.md before changing anything. Decisions below were made on purpose; don't "fix" them without asking.

## What it is
A free crypto forecaster for friends and family. Pick coins from the top 25 and see which way each is leaning over the next 7 days, how confident that is, a likely price range, and how often the engine has been right before. Not financial advice. A simple web tool (project type 2), with live outside data.

## Where things stand (Nov 10, 2026)
- **Stage 1 (the pipes), version 0.1.0:** built and tested in headless Chrome with made-up prices (see CHANGELOG). Pages is on (source: GitHub Actions). The first Publish run (Nov 10, 02:02 UTC) got all 25 coins with a full year of history from CoinGecko in 26 requests, with no "busy" answers, and published the site. **Stage 1 is done:** on a real iPhone (Nov 10, 02:22 UTC), About → Data check said "25 coins, updated 20 minutes ago" and "Live prices: Working," so CoinGecko allows the live check from a real phone browser.
- **Stage 2 (the forecasting engine), version 0.2.0:** built and tested with made-up prices (see CHANGELOG). Each watchlist row shows its 7-day lean; tapping it opens the forecast (odds, confidence, best guess, likely range on a fan chart, key levels, why, how it works). Edit coins (1 to 10) and a Share button are in. **Stage 2 is done:** on a real iPhone (Nov 10), the forecasts looked right on real prices, and About → Data check showed 25 coins saved, live prices working and settings saving.
- **Stage 3 (the Track record), version 0.3.0:** built and tested with made-up prices (see CHANGELOG). The Track record tab shows the 90-day replay for all coins and each coin, the record holds confidence down, and Publish works the replay out and adds it to prices.json. **Checked on a real iPhone (Nov 10):** the owner went through the live site at version 0.4.0 (About and Data check, Worth a look, Track record, VoiceOver) and reported everything looked good.
- **Stage 4 (Worth a look), version 0.4.0:** built and tested with made-up prices (see CHANGELOG). The Worth a look tab names up to 3 coins, out of all 25, whose leans stand out, or says "Nothing stands out today" and why. A forecast opened from it has an "Add to my coins" button when the coin isn't on the watchlist. **Checked on a real iPhone (Nov 10):** the owner went through the live site at version 0.4.0 (About and Data check, Worth a look, Track record, VoiceOver) and reported everything looked good. Worth a look said "Nothing stands out today" that day, so the Add to my coins button hasn't been seen on a real phone yet. Check it the first day a pick shows up.
- Stage 5 not started.

## Where it lives
- Repo: github.com/bestguess-apps/best-guess (its own GitHub org, apart from freeforgood-apps)
- Website: https://bestguess-apps.github.io/best-guess/ (published by the Publish workflow, not from a branch)
- Storage key: `best-guess-v1` (one small object: watchlist, text size, tab, last live prices). Cache prefix: `best-guess-`.
- Files: `index.html` (the app; its first script block is the forecasting engine, `BestGuessEngine`), `test_engine.mjs` (engine tests, run by Publish), `add_record.mjs` and `test_add_record.mjs` (the publish step that adds the Track record to prices.json), `sw.js`, `manifest.webmanifest`, icons, `rebuild.py` (lock and version), `fetch_prices.py` and `test_fetch_prices.py` (the price fetcher), `.github/workflows/publish.yml` and `tag-new-versions.yml`.
- `prices.json` exists only on the website. It's made at publish time and never committed. It holds the prices and, under `record`, the Track record.

## Next up
1. ~~Finish stage 1~~ (done Nov 9).
2. ~~Update the app skills~~ with what stage 1 proved (done: app-new-project has "Live outside data", with Best Guess as the reference).
3. ~~Org security settings~~ on bestguess-apps and the Usage Saver org (done Nov 2026).
4. ~~Stage 2, the forecasting engine~~ (done Nov 10, version 0.2.0, checked on a real iPhone).
5. ~~Stage 3, Track record~~ (done Nov 10, version 0.3.0, checked on a real iPhone).
6. ~~Stage 4, Worth a look~~ (done Nov 10, version 0.4.0, checked on a real iPhone).
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
- **The Track record (stage 3), and why:**
  - **Worked out on GitHub, not on the phone** (the owner's pick). The 2,250 forecasts take about 1.5 seconds on a fast computer and would take several on an older phone, and the record is needed on every open because it feeds confidence. `add_record.mjs` runs in Publish after the fetch, with the engine code from index.html, and adds `record` to prices.json. If it fails, prices still publish and the app says the track record isn't ready.
  - **The app treats the record as outside data:** whole numbers that must add up, or it isn't used at all. It stores counts only; the app works out percentages and verdicts with the engine's `judge()`, so the words can't disagree with the numbers.
  - **Luck is judged by separate weeks, not raw calls.** 90 days of overlapping 7-day calls on coins that move together is about 13 examples, not 2,250. Measured on made-up markets: when coins move mostly together, judging by weeks is about right (a wrong "better or worse than a coin flip" 3% of the time); when they move less together it's stricter than needed. Real coins move together a lot, so it stays strict. That means a verdict needs a big gap from 50%, and most results will read "could still be luck." The raw counts are always shown.
  - **"Too few to tell"** below 10 leans from 4 separate weeks (20 calls for the range and the best guess). Most single coins will say this, since most days are coin flips. That's honest, not a bug.
  - **The cap on confidence:** leans right under 50% means Low at most; under 55% (the odds a lean needs) means no High. It goes by the coin's own leans when there are enough, otherwise by all coins together, and does nothing when neither has enough. It only lowers confidence, and never changes the lean or the odds.
  - **"Leans by confidence" shows the look-alikes' own ratings,** before the cap. Capping inside the replay would need a track record of the track record, and a year of prices is too short for that. The screen says so.
  - **A lean is right** when the price ended on its side 7 days later (a down lean counts if it didn't end higher). "How far off" is the average gap from the real price, as a share of the price on the day of the call.
  - **Coin flip is the only yardstick for leans.** Not shown: how often prices simply rose in those 90 days, which would help read a one-sided market. Could be added later.
- **Worth a look (stage 4), and why:**
  - **All 25 coins, not just the watchlist** (the owner's pick): that's what makes the tab different from Today. It uses the saved prices for coins off the watchlist; the live check still asks only about the watchlist, so nothing new leaves the phone.
  - **The bar** (the owner's picks): medium or high confidence after the track record's cap, and past leans right at least 55% of the time, going by the coin's own leans when there are enough, otherwise all coins together. No track record to test against means no picks. Up to 3, strongest first (confidence, then odds).
  - **55%, not 50%:** the first plan was "not worse than a coin flip." On made-up markets with no real pattern that named a coin on about 1 day in 3, with picks right half the time. At 55% (the same odds a lean needs) it was about 1 day in 4, and real patterns barely changed. "Proven better than luck" was offered too, and not picked: the tab would be empty almost every day.
  - **The engine decides, not the screen:** `standouts()` is a plain function with tests, planted bugs and an honesty test. The screen only shows what it returns, plus the counts behind an empty day.
  - **It says when picks aren't separate:** two or three names get a line that coins move together, so they're closer to one call.
  - **"Add to my coins"** shows in a forecast only when that coin isn't on the watchlist (the owner's pick), and a full list gets a plain message instead. After adding, a short note takes the focus so VoiceOver reads it.
  - **Not built:** an "On your list" tag on picks, and a "Closest today" near miss on empty days. Both were offered and not picked.
- **Edit coins:** 1 to 10 coins from the menu, shown in size order. The last coin can't be removed, because an empty list would quietly fall back to the top 5.
- **Share button, no donation button:** a tip jar was considered (Nov 2026) and left out: it breaks the "no payments" ground rule, looks like paying for tips on a money app, payouts need the owner's legal identity, and the fees eat most of a small tip. Share sends only the official link (share sheet, or copies the link on a tap), with no tracking or referral bits.
- **Fonts:** the same built-in fonts as Till Payday (Atkinson Hyperlegible, Bricolage Grotesque, DM Mono; SIL Open Font License). Own colors (indigo), contrast computed in code.

## Known limits
- How often forecasts are right has only been tested on made-up prices in code. The Track record now shows it on real prices, on the live site only, and it's shown even if it's bad.
- The Track record covers one 90-day stretch, about 13 separate weeks. A run of good or bad luck that long is possible, and the app says so.
- Worth a look can still name a coin by luck. On made-up markets with no real pattern it did on about 1 day in 4, and those picks were coin flips. Lucky stretches bunch up: once the 90-day record looks good by chance, picks can show for days in a row. The screen says a pick is still a guess.
- A coin added from Worth a look shows its saved price until the next live check (at most one a minute).
- A year of prices holds only about 50 separate weeks, so confidence stays modest on purpose, and most days say "coin flip."
- GitHub Pages can't set headers, so the lock is a meta tag and `frame-ancestors` (clickjacking) isn't possible.
- Scheduled runs can be late, and GitHub pauses them in public repos after 60 days without changes (see how-to-update.md).
- CoinGecko says keyless access isn't meant for production, and GitHub's shared runner addresses may get "busy" answers more often. The fetcher waits, retries and falls back to the last good prices.
