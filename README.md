# Tyler's NFT Vault

An interactive 3D showcase of an Ethereum NFT collection across two wallets — built as a single-page static site with vanilla HTML/CSS/JS + Three.js, ready to deploy on GitHub Pages.

**Live demo:** _publish via GitHub Pages — see below._

## What's in here

- **Hero**: a rotating 3D ring of featured pieces (Bored Apes, KILLABEARS, Pudgy Penguins, Doodles, Chimpers, RENGA, etc.). Drag to spin, click any card to inspect.
- **The Full Vault**: a masonry mosaic of every NFT in the collection with filters by collection and by wallet.
- **Modal viewer**: full-size image, metadata, and direct link to OpenSea.
- **Fully self-contained**: all images are downloaded and optimized locally — no third-party CDN at runtime, so it won't break if Alchemy or IPFS gateways change.

## Wallets tracked

```
0x3ed0b065e6fd906ca20e4ebe080ea72c4325339a
0x28f6acf1de13ccd96d5b01a1aaf9716f6c7be644
```

## File layout

```
.
├── index.html          # Page shell
├── style.css           # Theme + layout
├── app.js              # Three.js scene + grid + filters + modal
├── nfts.json           # Final processed dataset consumed by app.js
├── images/             # Optimized full-size NFT images (used in modal)
│   └── thumb/          # Smaller versions (used in grid + 3D ring)
└── data/
    ├── wallet1.json    # Raw Alchemy API response for wallet 1
    ├── wallet2.json    # Raw Alchemy API response for wallet 2
    ├── process.js      # Combines wallets, downloads images, writes nfts.json
    └── optimize-images.js  # Resizes/compresses images
```

## Deploy to GitHub Pages

1. Create a new GitHub repo (e.g. `tyler-nfts`).
2. From this directory:
   ```bash
   git init
   git add .
   git commit -m "initial site"
   git branch -M main
   git remote add origin https://github.com/<your-username>/tyler-nfts.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / root → Save**.
4. Wait ~60 seconds. Your site will be live at `https://<your-username>.github.io/tyler-nfts/`.

The `.nojekyll` file tells GitHub Pages to skip its Jekyll processor and just serve the files as-is.

## Refreshing the data (optional)

If you want to regenerate the snapshot:

1. Fetch fresh wallet data (Alchemy's public demo key works for low volumes):
   ```bash
   curl -H "Origin: https://www.alchemy.com" \
     "https://eth-mainnet.g.alchemy.com/nft/v3/docs-demo/getNFTsForOwner?owner=0x3ed0b065e6fd906ca20e4ebe080ea72c4325339a&withMetadata=true&excludeFilters[]=SPAM&pageSize=100" \
     -o data/wallet1.json
   curl -H "Origin: https://www.alchemy.com" \
     "https://eth-mainnet.g.alchemy.com/nft/v3/docs-demo/getNFTsForOwner?owner=0x28f6acf1de13ccd96d5b01a1aaf9716f6c7be644&withMetadata=true&excludeFilters[]=SPAM&pageSize=100" \
     -o data/wallet2.json
   ```
2. Re-run the pipeline (requires Node 18+):
   ```bash
   npm install sharp --no-save
   node data/process.js
   node data/optimize-images.js
   ```

## Running locally

Any static server works:

```bash
python -m http.server 8000
# or
npx serve .
```

Then open <http://localhost:8000>.

## Credits

- Data via [Alchemy NFT API](https://docs.alchemy.com/reference/nft-api-quickstart)
- 3D ring built with [Three.js](https://threejs.org)
- Fonts: Inter + Space Grotesk via Google Fonts
