# README screenshots

Capture the public summary at the top of the page in dark mode on mobile,
tablet and desktop, then render all three real screenshots inside device frames.
The app itself is never modified and no summary-generation action is triggered.

## First use

From the repository root, install the isolated capture dependencies and browser:

```sh
npm ci --prefix scripts/readme-preview
npm exec --prefix scripts/readme-preview -- playwright install chromium
```

Node 22.18 or newer is required. This tool has its own lockfile and does not
change the backend dependencies. To use an already installed Google Chrome,
skip the browser installation and add `--channel chrome` below.

## Regenerate

```sh
npm --prefix scripts/readme-preview run generate -- --date 2026-11-01
```

Change only the date to show another saved daily summary. The script uses the
normal calendar controls and fails if the requested date cannot be selected or
does not load. Each capture starts in a fresh browser context, uses English,
UTC and dark system appearance, and resets the internal reading scroll to the top.
No saved browser login or private credentials are needed.

Output goes to `docs/assets/readme-preview/`:

- `showcase.png`: the composition, ready to embed in the README when needed;
- `mobile.png`, `tablet.png`, `desktop.png`: original 2x screenshots;
- `capture.json`: source URL, date, viewport sizes and capture time.

Live content may change even for the same date. These are product screenshots,
not deterministic golden tests. A failed capture leaves the previous images intact.

## Adjust the presentation

Edit `device-showcase.html` to change the background, device frames, placement
or copy. Edit `sizes` in `generate.mts` to change the capture viewports; keep the
image aspect ratios and size captions in the HTML in sync.

Optional arguments:

```sh
npm --prefix scripts/readme-preview run generate -- \
  --date 2026-11-01 \
  --url https://social-monitor.app/summaries \
  --out docs/assets/readme-preview \
  --channel chrome
```

The output path is relative to the repository root. URLs must be public HTTP(S)
pages without credentials, query strings or fragments. The tool does not save
browser storage, session tokens or network payloads.

Validate tooling changes with `npm --prefix scripts/readme-preview run typecheck`,
then regenerate and visually inspect all three screenshots and the final composition.
This captures the deployed web product; it does not replace Marionette checks for
Flutter UI changes.
