# bibbellydaddy's NFTs

An interactive snapshot of an Ethereum NFT collection — built as a static single-page site (vanilla HTML/CSS/JS + Three.js), ready for GitHub Pages.

## Four views

- **Share** (default) — pick a filter and a layout (Bento / Grid / Mosaic), preview a high-resolution snapshot, save it to your camera roll or download as PNG.
- **Vault** — masonry grid with collection / wallet filters and a detail modal.
- **Wall** — three rows of cursor-driven parallax tiles for a dense overview.
- **Carousel** — 3D rotating ring of featured pieces (Three.js).

## Stack

- Pure browser ES modules. No build step.
- All NFT images downloaded and optimized locally (~10 MB) — fully self-contained, no third-party CDN at runtime.
- Animated cursor-responsive background (canvas-based gradient orbs).
- Native Web Share API on mobile (file share) with download fallback on desktop.

## File layout

```
.
├── index.html
├── style.css                # shared theme
├── app.js                   # orchestrator + tab system
├── bg.js                    # animated background
├── nfts.json                # processed dataset
├── images/                  # full-size + thumb/ for grid use
└── views/
    ├── collage.js / .css    # Share view + PNG export
    ├── wall.js    / .css    # Wall view (cursor parallax)
    └── carousel.js          # 3D rotating ring
```

## Deploy

The static files in this repo deploy directly to GitHub Pages. The `.nojekyll` file tells Pages to skip its Jekyll processor.

## Refreshing the data

If the underlying NFT holdings change, regenerate the snapshot:

```bash
# Fresh wallet data via Alchemy's public demo endpoint
curl -H "Origin: https://www.alchemy.com" \
  "https://eth-mainnet.g.alchemy.com/nft/v3/docs-demo/getNFTsForOwner?owner=<addr>&withMetadata=true&excludeFilters[]=SPAM&pageSize=100" \
  -o data/<wallet>.json

# Rebuild
npm install sharp --no-save
node data/process.js
node data/optimize-images.js
```

## Local dev

```bash
python -m http.server 8000
# open http://localhost:8000
```
