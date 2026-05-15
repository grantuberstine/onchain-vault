// Post-processing: compress and resize the downloaded images so the repo stays light.
// Thumbnails (used in grid + 3D wall) → max 480px, q80.
// Full images (used in modal viewer) → max 1400px, q85.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const IMG_DIR = path.join(ROOT, 'images');
const THUMB_DIR = path.join(IMG_DIR, 'thumb');

async function optimize(file, maxDim, quality) {
  const ext = path.extname(file).slice(1).toLowerCase();
  if (ext === 'svg' || ext === 'gif') return null; // leave vectors and animations alone
  const before = fs.statSync(file).size;
  if (before < 80 * 1024 && (ext === 'jpg' || ext === 'jpeg' || ext === 'webp')) {
    return { before, after: before, skipped: true };
  }
  const buf = fs.readFileSync(file);
  let pipeline = sharp(buf).resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true });
  if (ext === 'png') {
    // Convert PNG to JPEG only if no alpha and image is large
    const meta = await sharp(buf).metadata();
    if (meta.hasAlpha) {
      pipeline = pipeline.png({ quality, compressionLevel: 9, palette: true });
    } else {
      pipeline = pipeline.jpeg({ quality, mozjpeg: true });
      file = file.replace(/\.png$/i, '.jpg');
    }
  } else if (ext === 'webp') {
    pipeline = pipeline.webp({ quality });
  } else {
    pipeline = pipeline.jpeg({ quality, mozjpeg: true });
  }
  const out = await pipeline.toBuffer();
  fs.writeFileSync(file, out);
  return { before, after: out.length, skipped: false, newFile: file };
}

async function processDir(dir, maxDim, quality, label) {
  const files = fs.readdirSync(dir)
    .filter(f => !fs.statSync(path.join(dir, f)).isDirectory())
    .map(f => path.join(dir, f));
  let totalBefore = 0, totalAfter = 0, processed = 0, renamed = [];
  for (const f of files) {
    try {
      const r = await optimize(f, maxDim, quality);
      if (!r) continue;
      totalBefore += r.before;
      totalAfter += r.after;
      processed++;
      if (r.newFile && r.newFile !== f) {
        renamed.push({ oldPath: f, newPath: r.newFile });
        fs.unlinkSync(f);
      }
    } catch (e) {
      console.warn(`  ✗ ${path.basename(f)}: ${e.message}`);
    }
  }
  const mb = (n) => (n / 1024 / 1024).toFixed(2);
  console.log(`${label}: ${processed} files | ${mb(totalBefore)}MB → ${mb(totalAfter)}MB`);
  return renamed;
}

(async () => {
  console.log('Optimizing thumbnails…');
  const renamedThumbs = await processDir(THUMB_DIR, 480, 80, '  thumbs');
  console.log('Optimizing full images…');
  const renamedFull = await processDir(IMG_DIR, 1400, 85, '  full  ');

  // Patch nfts.json to update any renamed (.png → .jpg) paths
  const dataPath = path.join(ROOT, 'nfts.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const allRenames = [...renamedThumbs, ...renamedFull].map(r => ({
    oldRel: path.relative(ROOT, r.oldPath).replace(/\\/g, '/'),
    newRel: path.relative(ROOT, r.newPath).replace(/\\/g, '/'),
  }));
  const renameMap = Object.fromEntries(allRenames.map(r => [r.oldRel, r.newRel]));
  let patched = 0;
  for (const nft of data.nfts) {
    if (renameMap[nft.image]) { nft.image = renameMap[nft.image]; patched++; }
    if (renameMap[nft.thumb]) { nft.thumb = renameMap[nft.thumb]; }
  }
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  console.log(`Patched ${patched} extension references in nfts.json`);
})();
