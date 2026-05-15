// One-time data processor: combine both wallets, download images locally,
// tag featured pieces, write final nfts.json.
const fs = require('fs');
const path = require('path');

const FEATURED_COLLECTIONS = new Set([
  'Bored Ape Yacht Club',
  'KILLABEARS',
  'Pudgy Penguins',
  'Doodles',
  'Chimpers',
  'RENGA',
  'DEGEN TOONZ',
  'Invisible Friends',
  'VeeFriends Series 2',
  'Lil Pudgys',
  'KILLABITS',
  'Street Trash',
  'fwogs',
]);

const ROOT = path.join(__dirname, '..');
const IMG_DIR = path.join(ROOT, 'images');
const THUMB_DIR = path.join(IMG_DIR, 'thumb');
fs.mkdirSync(IMG_DIR, { recursive: true });
fs.mkdirSync(THUMB_DIR, { recursive: true });

const wallets = {
  '0x3ed0b065e6fd906ca20e4ebe080ea72c4325339a': require('./wallet1.json'),
  '0x28f6acf1de13ccd96d5b01a1aaf9716f6c7be644': require('./wallet2.json'),
};

function safeId(contract, tokenId) {
  return `${contract.toLowerCase()}_${String(tokenId).slice(0, 32)}`;
}

function extFromUrl(url, contentType) {
  const u = url.toLowerCase();
  if (contentType?.includes('png')) return 'png';
  if (contentType?.includes('webp')) return 'webp';
  if (contentType?.includes('gif')) return 'gif';
  if (contentType?.includes('jpeg') || contentType?.includes('jpg')) return 'jpg';
  if (contentType?.includes('svg')) return 'svg';
  if (u.endsWith('.png')) return 'png';
  if (u.endsWith('.webp')) return 'webp';
  if (u.endsWith('.gif')) return 'gif';
  if (u.endsWith('.jpg') || u.endsWith('.jpeg')) return 'jpg';
  if (u.endsWith('.svg')) return 'svg';
  return 'png'; // sensible default
}

// If a URL is on a flaky IPFS gateway, expand into a list of alternate gateways.
function expandIpfsAlternatives(url) {
  if (!url) return [];
  const ipfsMatch = url.match(/\/ipfs\/(.+)$/);
  if (!ipfsMatch) return [url];
  const cidAndPath = ipfsMatch[1];
  const gateways = [
    `https://nftstorage.link/ipfs/${cidAndPath}`,
    `https://cloudflare-ipfs.com/ipfs/${cidAndPath}`,
    `https://gateway.pinata.cloud/ipfs/${cidAndPath}`,
    `https://ipfs.filebase.io/ipfs/${cidAndPath}`,
    `https://alchemy.mypinata.cloud/ipfs/${cidAndPath}`,
    url,
  ];
  return [...new Set(gateways)];
}

async function tryFetch(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; NFT-Collector/1.0)',
      'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    },
  });
  return res;
}

async function download(url, destPathNoExt, label) {
  if (!url) return null;
  const candidates = expandIpfsAlternatives(url);
  for (const candidate of candidates) {
    try {
      const res = await tryFetch(candidate);
      if (!res.ok) {
        if (candidates.length > 1) continue; // try next gateway
        console.warn(`  ✗ ${label}: HTTP ${res.status} for ${candidate}`);
        return null;
      }
      const ct = res.headers.get('content-type') || '';
      // Sanity check: must be an image
      if (!ct.startsWith('image/') && !candidate.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i)) {
        if (candidates.length > 1) continue;
      }
      const ext = extFromUrl(candidate, ct);
      const buf = Buffer.from(await res.arrayBuffer());
      const file = `${destPathNoExt}.${ext}`;
      fs.writeFileSync(file, buf);
      return path.relative(ROOT, file).replace(/\\/g, '/');
    } catch (e) {
      if (candidates.length > 1) continue;
      console.warn(`  ✗ ${label}: ${e.message} for ${candidate}`);
      return null;
    }
  }
  console.warn(`  ✗ ${label}: all gateways failed for ${url}`);
  return null;
}

(async () => {
  const nfts = [];
  let i = 0;
  const all = [];
  for (const [wallet, data] of Object.entries(wallets)) {
    for (const n of data.ownedNfts) {
      all.push({ wallet, n });
    }
  }
  console.log(`Processing ${all.length} NFTs…`);

  for (const { wallet, n } of all) {
    i++;
    const collection = n.contract?.openSeaMetadata?.collectionName || n.contract?.name || 'Unknown';
    if (n.contract?.symbol === 'ENS') continue; // text-only

    const id = safeId(n.contract.address, n.tokenId);
    const fullSrc = n.image?.cachedUrl || n.image?.pngUrl || n.image?.originalUrl;
    const thumbSrc = n.image?.thumbnailUrl || n.image?.pngUrl || fullSrc;

    if (!fullSrc) {
      console.warn(`  • [${i}/${all.length}] ${collection} #${n.tokenId}: no image url`);
      continue;
    }

    const label = `[${i}/${all.length}] ${collection} #${n.tokenId}`;
    console.log(label);

    const full = await download(fullSrc, path.join(IMG_DIR, id), 'full');
    const thumb = await download(thumbSrc, path.join(THUMB_DIR, id), 'thumb');

    if (!full && !thumb) {
      console.warn(`  ✗ Skipping ${collection} #${n.tokenId} - no image downloaded`);
      continue;
    }

    nfts.push({
      id,
      wallet: wallet.toLowerCase(),
      walletShort: wallet.slice(0, 6) + '…' + wallet.slice(-4),
      name: n.name || `${collection} #${n.tokenId}`,
      collection,
      collectionSlug: n.contract?.openSeaMetadata?.collectionSlug || '',
      contract: n.contract.address,
      tokenId: n.tokenId,
      image: full || thumb,
      thumb: thumb || full,
      description: (n.description || n.contract?.openSeaMetadata?.description || '').slice(0, 400),
      tokenType: n.tokenType,
      featured: FEATURED_COLLECTIONS.has(collection),
      openSeaUrl: `https://opensea.io/assets/ethereum/${n.contract.address}/${n.tokenId}`,
    });
  }

  // Sort: featured first, then by collection, then by token id
  nfts.sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    if (a.collection !== b.collection) return a.collection.localeCompare(b.collection);
    const an = parseInt(a.tokenId, 10), bn = parseInt(b.tokenId, 10);
    return (isNaN(an) || isNaN(bn)) ? a.tokenId.localeCompare(b.tokenId) : an - bn;
  });

  const collectionStats = {};
  nfts.forEach(n => {
    collectionStats[n.collection] = (collectionStats[n.collection] || 0) + 1;
  });

  const out = {
    generatedAt: new Date().toISOString(),
    wallets: Object.keys(wallets),
    totalCount: nfts.length,
    featuredCount: nfts.filter(n => n.featured).length,
    collections: Object.entries(collectionStats)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count })),
    nfts,
  };

  fs.writeFileSync(path.join(ROOT, 'nfts.json'), JSON.stringify(out, null, 2));
  console.log(`\n✓ Wrote nfts.json with ${nfts.length} NFTs (${out.featuredCount} featured).`);
  console.log('Collections:', out.collections);
})();
