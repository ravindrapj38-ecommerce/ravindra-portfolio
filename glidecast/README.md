# Glidecast: browser screen recorder with auto-zoom (SaaS)

A complete, static website that sells a monthly/yearly subscription (USD):

| File | What it is |
|---|---|
| `index.html` | Marketing landing page (hero demo, features, pricing, FAQ) |
| `app.html` | The product: record → auto-zoom → style → export → share |
| `legal.html` | Terms, Privacy and Refund policy (required by payment providers) |
| `assets/config.js` | **The only file you need to edit**: name, prices, checkout links |
| `assets/app.js` | Recorder, auto-zoom detection, timeline editor, renderer, exporter |
| `assets/license.js` | Pro unlock via Lemon Squeezy license keys |

There's no server, database or monthly hosting bill: everything runs in the visitor's browser.

## What the product does

- **Records** a tab, window or the whole screen (+ microphone and tab/system audio), or imports any video.
- **Auto-zoom**: after recording, it scans the video for localized activity (clicks, menus opening, typing, cursor dwelling) and creates zoom segments. Scrolling and page changes are ignored. The camera eases in, pans between spots and eases out.
- **Editor**: drag or resize zooms on the timeline, change depth, click the preview to re-aim, trim start/end.
- **Style**: 12 gradient backgrounds (+ custom image), padding, rounded corners, soft shadow, 16:9 / 9:16 / 1:1 / 4:3.
- **Export** MP4 (Chrome/Edge/Safari) or WebM, 720p–1440p, then download or use the native Share sheet.

### Free vs Pro (enforced in `app.js`, limits in `config.js`)

| | Free | Pro |
|---|---|---|
| Length | 5 min | Unlimited |
| Export | 720p + small watermark | 1080p / 1440p, no watermark |
| Backgrounds | 4 | 12 + upload your own |

## Go-live checklist (getting paid in USD)

1. **Payments: Lemon Squeezy** (https://lemonsqueezy.com). It is a *Merchant of Record*, so it handles global sales tax/VAT and pays out to Indian bank accounts (or PayPal). That makes it the simplest choice for a seller in India. Paddle works similarly.
   - Create a store, then a product **"Glidecast Pro"** with two subscription variants: **$12/month** and **$96/year**.
   - In the product, enable **License keys** (activation limit around 3, length "Same as subscription"), so keys expire when a subscription is cancelled.
   - Optional: set the post-purchase redirect to `https://YOUR-SITE/glidecast/app.html`.
2. **Edit `assets/config.js`**: paste the two checkout URLs, your `storeId` and `productIds`, `supportEmail`, and `customerPortal` (`https://YOURSTORE.lemonsqueezy.com/billing`). Keep `pricing` in sync with the products.
3. **Test** in Lemon Squeezy *test mode*: buy with a test card, paste the emailed key into the app (License → Activate) and confirm the watermark disappears.
4. **Review `legal.html`** (business name, refund window) and set a real support email. Lemon Squeezy checks these pages during store approval.
5. **Deploy**: this repo works on GitHub Pages as-is (Settings → Pages → deploy from branch). The product is then at `https://<user>.github.io/ravindra-portfolio/glidecast/`. For credibility, buy a domain (e.g. `glidecast.app`) and point it at Pages or Netlify/Vercel/Cloudflare Pages (all free). Screen capture requires **HTTPS**, which all of these provide.
6. **Rename** freely: change `name` in `config.js` and find/replace "Glidecast" in the HTML `<title>`/meta tags.

## Growth ideas once it's live

- Launch on Product Hunt, Hacker News (Show HN), r/SaaS, r/sideproject, and r/webdev, and post before/after clips on X and LinkedIn. The free watermark advertises the product on every shared video.
- SEO pages: "free screen recorder with zoom", "Screen Studio alternative for Windows", "how to record a product demo".
- Add later: webcam bubble, cursor smoothing/highlight, GIF export, shareable cloud links (that needs a backend and storage, a natural Team plan).

## Notes and limits

- License checks run in the browser, so a determined user could bypass them. That's a common trade-off for no-backend indie tools. Add a server-side check if it ever matters.
- Rendering runs in real time (a 3-minute video takes about 3 minutes to export), and the tab must stay visible during analysis and export.
- Best in desktop Chrome/Edge. Firefox works. On mobile, import works but recording doesn't.

## Local testing

```bash
cd glidecast && python3 -m http.server 8000   # open http://localhost:8000
```
Set `devForcePro: true` in `config.js` to try Pro features locally (never deploy that).
