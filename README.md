# Best Guess

Free crypto odds, honestly. See which way a few coins are leaning, why, and how often calls like that have been right before. Works on any phone or computer. No account, no ads, no tracking.

**Open the app:** https://bestguess-apps.github.io/best-guess/

**Run the self-test:** https://bestguess-apps.github.io/best-guess/selftest.html

## Who it's for

Friends and family who are curious about crypto and want an honest read instead of hype. Best Guess tells you how much to trust today's guess for a coin, never what to do with it: no buy or sell wording, no alerts, no price targets. Most days the honest answer is "coin flip," and it says so.

## What's inside

- **Today:** your watchlist of up to 10 coins, picked from the top 25 (stablecoins and wrapped copies left out), with prices that update live
- **A 7-day forecast for each coin:** which way it's leaning (or "coin flip"), the odds and a confidence level, a best guess and likely price range on a small fan chart, key price levels, and the reasons in plain words. Best Guess's own engine makes it by finding past look-alike setups across all the coins and seeing what happened 7 days later.
- **"In short":** each forecast starts with one plain sentence on how much to trust today's lean, honest when past leans did no better than guessing. It also shows what a made-up $100 would likely be worth in a week, last week's call checked against what happened, a note when a coin is swinging much more than usual, and a **Before you decide** checklist about you, not the coin.
- **Worth a look:** up to 3 coins a day whose leans stand out (medium or high confidence, and past leans that were right at least 55% of the time), or a plain "Nothing stands out today." A pick can be added to your coins from its forecast.
- **Track record:** the last 90 days of calls replayed without seeing the future, next to a plain coin flip and the easy guess (saying "up" or "down" every time), shown even when it looks bad. A coin with poor past calls can't show high confidence.
- **Old prices are said, never hidden:** if the saved prices get 2 days old, the top of the app says so, and at a week old, forecasts and Worth a look pause until prices update
- **Data check** in About: whether saved prices, live prices, the track record and saving are working
- **Share:** sends the official link, with nothing about you attached
- **Works offline** from the Home Screen, with the last prices it saw

## Add it to your home screen

- **iPhone or iPad:** open the link in Safari → tap **Share** → **Add to Home Screen**
- **Android:** open the link in Chrome → tap **Install Best Guess** in About, or **⋮** → **Install app** (or **Add to Home screen**)
- **Computer:** in Chrome or Edge, click the install icon at the right end of the address bar

The Home Screen app works offline too, with the last prices it saw. On iPhone and iPad, your watchlist there is separate from Safari's, so pick your coins again after adding it. The same tips are in the app, under About → Put it on your Home Screen.

## Tested on

Results are tied to the version and date they were run. When the app changes, these results only describe the version listed.

| Version | Date | Browser and device | Result |
|---|---|---|---|
| 1.2.0 | Nov 12, 2026 | The published GitHub Pages site, Safari engine (WebKit) on a real iPhone (iOS 18.7), opened from the Home Screen | ✓ Passed, 536 automated checks |
| 1.2.0 | Nov 12, 2026 | Chrome (Blink engine) on Linux, headless: in 7 time zones (5 with daylight saving, 2 without), at 3 sizes | ✓ Passed, 608 automated checks in each zone with daylight saving and 536 in each without |
| 1.1.0 | Nov 12, 2026 | The published GitHub Pages site, Safari engine (WebKit) on a real iPhone (iOS 18.7), opened from the Home Screen | ✓ Passed, 384 automated checks |
| 1.1.0 | Nov 12, 2026 | Chrome (Blink engine) on Linux, headless: in 7 time zones (5 with daylight saving, 2 without), at 3 sizes | ✓ Passed, 456 automated checks in each zone with daylight saving and 384 in each without |
| 1.0.0 | Nov 10, 2026 | The published GitHub Pages site, Safari engine (WebKit) on a real iPhone (iOS 18.7), in Safari and from the Home Screen | ✓ Passed twice, 351 automated checks each time |
| 1.0.0 | Nov 10, 2026 | Chrome (Blink engine) on Linux, headless: in 7 time zones (5 with daylight saving, 2 without) at 320px and 390px wide, and at 3 sizes in the release check | ✓ Passed, 423 automated checks in each zone with daylight saving and 351 in each without |

The self-test arrived in 1.0.0. How earlier versions were checked is in [`CHANGELOG.md`](CHANGELOG.md). VoiceOver was last tried on a real iPhone at 1.0.0, and the owner reported it works.

**What the automated checks cover:** with a made-up market of 25 coins, the first open before prices arrive, every forecast's odds, range and reasons, In short, the made-up $100 (and that it matches the likely range), last week's call, the big swing note, the facts next to Not financial advice, Before you decide, Worth a look's picks, the Track record and the easy guess (worked out a second way and compared with the screen), the confidence cap, old prices (the warning at 2 days and the pause at a week), adding and removing coins, text size and tabs, the share sheet and copy, the time limit on live prices, CoinGecko being busy, a live answer that isn't usable, damaged settings, settings saved by a newer version left alone, the forecast date at month ends, leap days and the days around daylight saving changes in the phone's own time zone, what comes back on reopening (it reloads the page 3 times), the privacy lock and offline use. Its last step reads this site's real prices and asks CoinGecko for one price, and shows those as facts, not pass or fail, since CoinGecko can be busy. Every publish also runs the engine, track record and price fetcher tests, and stops if any fails.

Chrome's engine also powers Microsoft Edge, Chromebooks, Android phones, Samsung Internet, Brave and Opera. Safari's engine powers Safari and nearly every other browser on iPhone and iPad.

### Run the self-test yourself

Open Best Guess, tap **About** → **Run self-test**, then tap **Run self-test** again. In a few seconds it taps through the whole app with made-up coins and prices and shows a pass/fail report you can copy, with the version it checked on the first line. It saves to its own separate storage, so it never touches your real coins. It needs an internet connection to open. Send the report to the person who shared Best Guess with you.

## Privacy

- No accounts, ads, analytics or tracking, and no exchange or referral links, wallets or payments.
- Your watchlist and settings save on this device only. Nothing about you is sent anywhere.
- Saved prices and the track record come from this website, refreshed about every 6 hours: GitHub fetches prices from CoinGecko and works the track record out from them.
- For live prices, your phone asks CoinGecko for the latest prices of the coins on your watchlist. CoinGecko sees that request like any website visit, and nothing else. Price data from [CoinGecko](https://www.coingecko.com). Best Guess isn't affiliated with CoinGecko.
- A built-in privacy lock: the browser blocks the page from contacting any site other than this one and CoinGecko's price service.
- No coin logos: they'd load from CoinGecko's image servers and share your internet address with them, so the app shows a symbol badge instead.
- Like any site, GitHub Pages logs visitors' IP addresses for security; see the [GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

## Accessibility

Designed for phones first, with large tap targets, screen-reader labels, a text size button (**A**: normal, large or extra large), light and dark themes that follow your device's setting, and text colors that meet WCAG 2.2 AA contrast. It works with iPhone's Increase Contrast and Reduce Motion settings, and each fan chart has a spoken description of its range and best guess. On computers, the keyboard works too: ← and → (or Home and End) move between tabs, and Esc closes a panel. If anything is hard to use, please tell the person who shared Best Guess with you.

## Not financial advice

Best Guess's odds are a best guess from past prices. Past prices can't promise what comes next, and crypto can drop fast. Never put in money you can't afford to lose. Every forecast says "Not financial advice," with two facts from that coin's own past year: its biggest 7-day drop, and how often it was lower a week later.

## About the forecasts

For each coin, Best Guess sizes up today's setup, finds the 50 moments in the past year, across all the coins it follows, that looked most like it, and checks where each price was 7 days later. Odds stay close to 50-50 unless those look-alikes clearly agree: under 55% either way, it says "coin flip." The full explanation is in the app, under About → How the odds work.

Best Guess was built with help from AI (Claude, made by Anthropic). Its engine has its own tests, including honesty tests on made-up markets with no real pattern, which fail if it starts claiming more than it knows. The Track record shows how its calls really did, good or bad.

## Feedback

Best Guess is shared among friends and family, so there's no feedback email. Ideas or problems? Tell the person who shared it with you. If something isn't working, run the self-test and send them the report.

Best Guess is a one-person volunteer project, so fixes can take a while. Please don't send personal details you don't want to share.

## Files

| File | What it does |
|---|---|
| `index.html` | The whole app in one file (about 307 KB, most of it the built-in fonts). Its first script is the forecasting engine |
| `selftest.html` | The automated self-test, with made-up prices. Uses separate storage, so it's safe to share |
| `sw.js` | Lets the app work offline after the first visit. Keep it next to `index.html` |
| `manifest.webmanifest` | The app's install details: name, icons and how it opens |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`, `favicon-32.png` | The app icons |
| `rebuild.py` | Run after any change to `index.html`: refreshes the privacy lock, rebuilds the self-test and sets the version everywhere |
| `fetch_prices.py` | The price fetcher GitHub runs a few times a day. Makes `prices.json`, which lives only on the website and is never committed |
| `add_record.mjs` | Works out the Track record at publish time and adds it to `prices.json` |
| `test_engine.mjs`, `test_add_record.mjs`, `test_fetch_prices.py` | Tests for the engine, the Track record step and the fetcher. Every publish runs them |
| `README.md` | This page |
| `CHANGELOG.md` | What changed in each version, and how it was tested |
| `PROGRESS.md` | Where the project stands, the decisions behind it, and the rules for working on it |
| `how-to-update.md` | The steps for any change and release, what must not break, and phone steps |
| `SECURITY.md` | How to report a security problem privately |
| `.gitignore` | Keeps private files, like keys, from being uploaded by mistake |

## Updating the app

Follow [`how-to-update.md`](how-to-update.md): edit `index.html`, run `rebuild.py`, test, then commit to this repository. GitHub does the rest: the **Publish** workflow fetches prices, adds the Track record and publishes the site, and **Tag new versions** adds the version tag. Everyone's watchlist and settings carry over. After an update, run the self-test again on a real iPhone and add new rows to **Tested on**.

© 2026 Best Guess
