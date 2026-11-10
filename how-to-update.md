# How to update Best Guess

This repo (bestguess-apps/best-guess) is the source, and it's what the website publishes. `index.html` is the whole app in one file.

## Release steps
1. Get the current files from this repo.
2. Edit `index.html`. Keep the app in one file.
3. Run `python3 rebuild.py <new version>` in the repo folder. It refreshes the privacy lock and sets the version in `index.html` and `sw.js`. After any script edit without a version change, run `python3 rebuild.py` on its own. `python3 rebuild.py --check` changes nothing and says whether the lock and versions are right.
4. Test everything the verify routine asks for. For the fetcher: `python3 test_fetch_prices.py`.
5. Save the changed files to this repo, plus a new CHANGELOG.md entry and an update to PROGRESS.md.
6. GitHub does the rest: the "Publish" workflow fetches prices and publishes the site, and "Tag new versions" adds the `vX.Y.Z` tag. Check that both runs passed.
7. Open the live site on a real iPhone and check About → Data check.

## Things that must not break
- **The privacy lock.** `index.html` carries a Content-Security-Policy that only lets scripts run whose exact sha256 fingerprint is listed, and only lets the page talk to this site and `https://api.coingecko.com`. Any script edit changes the fingerprint, so run `rebuild.py`. The Publish workflow refuses to publish a stale lock.
- **The web address and storage key never change.** The site is `bestguess-apps.github.io/best-guess/` and the storage key is `best-guess-v1`. The offline cache name must start with `best-guess-`, and sw.js only clears caches with that prefix.
- **prices.json is untrusted.** The app and the fetcher both check every field and build fresh objects from known fields only. Coin names go on screen as text only (the `el()` helper), never as HTML.
- **Be kind to CoinGecko's free limit** (about 5 requests a minute per internet address). The fetcher waits 13 seconds between requests, reuses fresh files and history it already has, and backs off when CoinGecko says it's busy. The app does at most one live check a minute.
- **If anything fails, keep the last good prices.** The fetcher never publishes an empty file over a good one.
- **APP_VERSION** in the app and the version in sw.js must match. `rebuild.py` sets both. "Tag new versions" reads APP_VERSION from `index.html`, so keep it written as `const APP_VERSION = "X.Y.Z";`.
- **No coin logos.** They'd load from CoinGecko's image servers and share people's internet address with them. The app shows a symbol badge instead.
- **Actions pinned to full commit SHAs** with a version comment, least permissions per job. Look up the real SHA when updating.

## Phone steps
- **Run the publish now:** repo → **Actions** → **Publish** → **Run workflow** → **Run workflow**.
- **Check a run:** repo → **Actions** → tap the run. Yellow notes mean the fetcher fell back to older prices for something.
- **If the schedule stops:** GitHub pauses scheduled runs in public repos after 60 days without any changes. Repo → **Actions** → **Publish** → **Enable workflow**.
