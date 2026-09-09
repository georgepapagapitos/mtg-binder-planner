#!/usr/bin/env node
// Nightly user journey — the app driven in a real browser, end to end.
//
// Registers a fresh account, loads the sample collection through the UI,
// creates a deck through the UI, then walks every hub and deep route the
// router owns, at a phone viewport (touch) and a desktop one, in Chrome and
// in Firefox. For every screen it records what a green unit suite cannot:
//
//   - an uncaught exception or console error on the page
//   - horizontal overflow (the page body must never scroll sideways)
//   - an empty body (a render crash paints nothing, and paints it quietly)
//   - a missing document title
//   - a screenshot, so a failure comes with the picture
//
// Any of the first four fails the run. Screenshots + report.json land in
// --out. Run by .github/workflows/nightly-journey.yml against a production
// build served by the backend; locally:
//
//   node scripts/journey.mjs --base http://localhost:3742 --browser chrome --out /tmp/journey
//   node scripts/journey.mjs --base http://localhost:3742 --browser firefox --viewports desktop
//
// Browser binaries: JOURNEY_CHROME / JOURNEY_FIREFOX override the defaults
// (macOS app bundles, Linux /usr/bin). puppeteer-core drives Chrome over CDP
// and Firefox over WebDriver BiDi; no browser download.
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const argv = process.argv.slice(2);
const opt = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};
const BASE = opt('--base', 'http://localhost:3737').replace(/\/$/, '');
const BROWSER = opt('--browser', 'chrome');
const OUT = path.resolve(opt('--out', `journey-${BROWSER}`));
const VIEWPORTS = opt('--viewports', 'phone,desktop').split(',');
const SETTLE_MS = Number(opt('--settle', 1500));

const TIERS = {
  phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
};

function executable() {
  const env = BROWSER === 'firefox' ? process.env.JOURNEY_FIREFOX : process.env.JOURNEY_CHROME;
  if (env) return env;
  const candidates =
    BROWSER === 'firefox'
      ? [
          '/Applications/Firefox.app/Contents/MacOS/firefox',
          '/usr/bin/firefox',
          '/snap/bin/firefox',
        ]
      : [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
          '/usr/bin/chromium-browser',
          '/usr/bin/chromium',
        ];
  const found = candidates.find((c) => existsSync(c));
  if (!found) throw new Error(`no ${BROWSER} binary found; set JOURNEY_${BROWSER.toUpperCase()}`);
  return found;
}

/**
 * Console noise that is not a defect of ours: the browser's own "Failed to
 * load resource" lines for answers the app handles (a guest's 401 on the
 * session probe, a 404 the not-found page renders, a rate limit), benign
 * observer warnings, devtools nags. Everything else fails the screen.
 */
const IGNORED_CONSOLE =
  /favicon|net::ERR_ABORTED|Failed to load resource.*(401|404|429)|ResizeObserver loop|Download the React DevTools|\[vite\]|DevTools|^Cross-Origin Request Blocked|^Access to fetch at 'https:\/\/api\.scryfall\.com/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (s) =>
  s
    .replace(/^\//, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '') || 'root';

/** Click the first element whose visible text matches, waiting for it to exist. */
async function clickText(page, re, { timeout = 15000, within = 'button, a, [role=button]' } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const hit = await page.evaluate(
      ({ src, flags, sel }) => {
        const rx = new RegExp(src, flags);
        const el = [...document.querySelectorAll(sel)].find(
          (e) => rx.test((e.textContent ?? '').trim()) && !e.disabled
        );
        if (!el) return false;
        el.scrollIntoView({ block: 'center' });
        el.click();
        return true;
      },
      { src: re.source, flags: re.flags, sel: within }
    );
    if (hit) return;
    await sleep(250);
  }
  throw new Error(`no clickable element matching ${re}`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    browser: BROWSER,
    executablePath: executable(),
    headless: true,
    protocolTimeout: 300_000,
    args:
      BROWSER === 'firefox'
        ? []
        : ['--no-first-run', '--no-default-browser-check', '--disable-gpu'],
  });
  const results = [];
  let seeded = null;
  try {
    for (const tierName of VIEWPORTS) {
      const tier = TIERS[tierName];
      if (!tier) throw new Error(`unknown viewport ${tierName}`);
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      await page.setViewport(tier);
      const consoleErrors = [];
      page.on('console', (m) => {
        if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
      });
      page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e).slice(0, 300)));

      const visit = async (route, label = route) => {
        consoleErrors.length = 0;
        await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await sleep(SETTLE_MS);
        await record(label);
      };
      const record = async (label) => {
        await sleep(300);
        const m = await page.evaluate(() => {
          const de = document.documentElement;
          const text = document.body?.innerText ?? '';
          return {
            url: location.pathname + location.search,
            title: document.title,
            overflow: Math.max(0, de.scrollWidth - de.clientWidth),
            emptyBody: !document.body || text.trim().length === 0,
          };
        });
        const errs = consoleErrors.filter((e) => !IGNORED_CONSOLE.test(e));
        const file = `${slug(label)}__${tierName}.png`;
        await page.screenshot({ path: path.join(OUT, file) }).catch(() => {});
        const rec = {
          browser: BROWSER,
          viewport: tierName,
          label,
          landed: m.url,
          title: m.title,
          overflow: m.overflow,
          emptyBody: m.emptyBody,
          consoleErrors: errs.slice(0, 5),
          file,
        };
        rec.fail = rec.overflow > 0 || rec.emptyBody || !rec.title || errs.length > 0;
        results.push(rec);
        console.log(
          `${rec.fail ? 'FAIL' : ' ok '} ${BROWSER.padEnd(7)} ${tierName.padEnd(7)} ${label.padEnd(36)} ` +
            `overflow=${rec.overflow} empty=${rec.emptyBody} errors=${errs.length}` +
            (rec.landed !== label.split('?')[0] && !label.includes('{')
              ? ` landed=${rec.landed}`
              : '')
        );
        if (errs.length) for (const e of errs) console.log(`        ${e}`);
      };

      // --- Guest: the marketing landing, a guide, and a route nobody owns.
      await visit('/');
      await visit('/decks/discover');
      await visit('/this-route-does-not-exist');

      // --- Sign up once (the second viewport signs in to the same account).
      if (!seeded) {
        seeded = {
          username: `journey${Date.now().toString(36)}`.slice(0, 20),
          password: 'journey-pass-' + Date.now(),
        };
        const status = await page.evaluate(async (creds) => {
          const r = await fetch('/api/auth/register', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(creds),
          });
          return r.status;
        }, seeded);
        if (status !== 201) throw new Error(`register → ${status}`);
      } else {
        const status = await page.evaluate(async (creds) => {
          const r = await fetch('/api/auth/login', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(creds),
          });
          return r.status;
        }, seeded);
        if (status !== 200) throw new Error(`login → ${status}`);
      }
      await page.evaluate(() => {
        localStorage.setItem('sc-ever-visited-app', '1');
        localStorage.setItem('sc-seen-nav-v2-tip', '1');
      });

      // --- Seed through the UI on the first pass: sample binders + cards.
      await visit('/collection/binders');
      if (tierName === VIEWPORTS[0]) {
        // Fresh account: "Try it out" on the empty state; with cards already
        // present it reads "Load sample binders". Either opens the intro dialog.
        await clickText(page, /^(Try it out|Load sample binders)$/);
        await clickText(page, /^Load sample/, { within: '[role=dialog] button' });
        await page.waitForFunction(
          () => document.querySelectorAll('a[href*="/collection/binders/"]').length > 0,
          { timeout: 90_000 }
        );
        await sleep(SETTLE_MS);
        await record('/collection/binders (after samples)');
      } else {
        await page.waitForFunction(
          () => document.querySelectorAll('a[href*="/collection/binders/"]').length > 0,
          { timeout: 90_000 }
        );
      }
      const binderHref = await page.evaluate(
        () =>
          document.querySelector('a[href*="/collection/binders/"]')?.getAttribute('href') ?? null
      );

      // --- Create a deck through the UI on the first pass.
      let deckHref = null;
      await visit('/decks/new');
      if (tierName === VIEWPORTS[0]) {
        // Commander is the default format: pick the first suggested commander,
        // then "Start blank" (the commander only, every card by hand).
        await page.waitForSelector('.commander-result-card', { timeout: 60_000 });
        await page.evaluate(() => document.querySelector('.commander-result-card')?.click());
        await clickText(page, /^Start blank$/, { timeout: 60_000 });
        await page.waitForFunction(() => /^\/decks\/deck_/.test(location.pathname), {
          timeout: 60_000,
        });
        await sleep(SETTLE_MS);
        await record('/decks/{deck} (just created)');
        deckHref = await page.evaluate(() => location.pathname);
      } else {
        await visit('/decks');
        deckHref = await page.evaluate(
          () =>
            document
              .querySelector('a[href^="/decks/deck_"]')
              ?.getAttribute('href')
              ?.split(/[?#]/)[0] ?? null
        );
      }

      // --- The signed-in walk.
      const routes = [
        '/home',
        '/collection',
        '/collection/binders',
        binderHref,
        '/collection/lists',
        '/collection/sets',
        '/collection/combos',
        '/decks',
        '/decks/saved',
        '/decks/compare',
        '/decks/cube',
        deckHref,
        deckHref && `${deckHref}?view=stats`,
        deckHref && `${deckHref}?view=power`,
        deckHref && `${deckHref}?view=tune`,
        deckHref && `${deckHref}/playtest`,
        '/play',
        '/play?tab=online',
        '/play?tab=nights',
        '/play?tab=history',
        '/friends',
        '/trades',
        '/pods',
        '/you',
        '/settings',
        '/search?q=sol+ring',
        '/tags',
        '/rules',
        `/u/${seeded.username}`,
      ].filter(Boolean);
      for (const r of routes) await visit(r);
      await context.close();
    }
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => r.fail);
  await writeFile(
    path.join(OUT, 'report.json'),
    JSON.stringify({ base: BASE, browser: BROWSER, results }, null, 2)
  );
  console.log(
    `\n${BROWSER}: ${results.length} screens, ${failed.length} failed` +
      (failed.length
        ? `\n${failed.map((r) => `  - ${r.viewport} ${r.label}: ${r.emptyBody ? 'empty body; ' : ''}${r.overflow ? `overflow ${r.overflow}px; ` : ''}${!r.title ? 'no title; ' : ''}${r.consoleErrors.join(' | ')}`).join('\n')}`
        : '')
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
