# Best Guess: changelog

## 0.1.0 (Nov 9, 2026)
- First version, for testing the plumbing (stage 1). Not shared yet.
- Today shows your watchlist (the top 5 coins to start) with each coin's price and how it moved in the last 24 hours. Prices come from this website, refreshed about every 6 hours, plus a live check with CoinGecko each time you open it.
- Works offline with the last prices it saw, installs to the Home Screen, follows light and dark mode, and has a text size button.
- About has a Data check that says whether saved and live prices are working, and why not if they aren't.
- Worth a look and Track record say what's coming.
- A price fetcher on GitHub gets the top 25 coins and a year of daily prices from CoinGecko's free keyless service, staying under its limit, stopping after 15 minutes if CoinGecko is struggling, and keeping the last good prices if anything fails.
- Tested: 21 fetcher tests passed, and 5 of 5 planted bugs were caught. A simulated publish run with CoinGecko unreachable kept going and published the app without prices (or with the last good prices when there were some). 49 browser checks passed in headless Chrome with made-up prices: live and saved prices, live prices failing two ways, missing, damaged, wrong and newer price files, a hostile coin name (shown as plain text, nothing ran), offline through the service worker, tabs with arrow keys, the About sheet with focus and Esc, text size, no sideways scrolling at 320px with extra large text, and the privacy lock blocking other sites. The accessibility checker found nothing on the main screen, About, the other tabs and the "prices didn't load" screen, at 4 sizes in light and dark. Contrast computed for 15 color pairs in both themes; all pass. Not yet tested: real CoinGecko data and the live check on a real iPhone (step 1 of the first run).
