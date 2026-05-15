// views/collage.js
// Self-contained collage view module — renders bibbellydaddy's NFT collection
// as a high-resolution shareable image to a <canvas>, with three layouts.
//
// Exports:
//   initCollage({ canvas, nfts, onLayoutChange? })
//   renderCollage(layout)
//   downloadCollage(filename)
//   bindCollageControls(containerEl, layouts?)

// ---------- Module state ----------
const state = {
  canvas: null,
  ctx: null,
  nfts: [],
  featured: [],
  others: [],
  images: new Map(),       // id -> HTMLImageElement (loaded)
  layout: 'bento',
  ready: false,
  rafId: 0,
  resizeTimer: 0,
  onLayoutChange: null,
};

// Internal canvas resolution. We render at this size for crisp downloads
// and let CSS scale the element responsively.
const RES = {
  bento:  { w: 2400, h: 1500 },
  grid:   { w: 2400, h: 1500 },
  mosaic: { w: 2400, h: 1500 },
};

// Brand tokens (kept in sync with style.css)
const BRAND = {
  bg:      '#07070a',
  bg2:     '#0c0c14',
  text:    '#f3f3f7',
  dim:     '#a0a0b0',
  faint:   '#65656f',
  accent:  '#b388ff',
  accent2: '#5ee0ff',
  accent3: '#ff8ad8',
  gold:    '#ffd66e',
};

// ============================================================================
// Public API
// ============================================================================

export async function initCollage(opts) {
  if (!opts || !opts.canvas) throw new Error('initCollage: canvas is required');
  state.canvas = opts.canvas;
  state.ctx = opts.canvas.getContext('2d');
  state.nfts = Array.isArray(opts.nfts) ? opts.nfts.slice() : [];
  state.featured = state.nfts.filter((n) => n.featured);
  state.others = state.nfts.filter((n) => !n.featured);
  state.onLayoutChange = typeof opts.onLayoutChange === 'function' ? opts.onLayoutChange : null;

  // Pre-load every image once, in parallel. Skip animated GIFs if we can — for
  // GIFs, the browser will rasterize the first frame to canvas which is fine.
  await preloadImages(state.nfts);
  state.ready = true;

  // Render initial layout
  renderCollage(state.layout);

  // Rerender on resize so the high-res canvas can adapt aspect if we ever want
  // it to (currently fixed aspect). Debounced.
  window.addEventListener('resize', () => {
    clearTimeout(state.resizeTimer);
    state.resizeTimer = setTimeout(() => renderCollage(state.layout), 120);
  });

  return state;
}

export function renderCollage(layout) {
  if (!state.ready) return;
  if (layout && layout !== state.layout) state.layout = layout;
  cancelAnimationFrame(state.rafId);
  state.rafId = requestAnimationFrame(() => {
    const res = RES[state.layout] || RES.bento;
    setupCanvas(res.w, res.h);
    drawBackground(res.w, res.h);
    if (state.layout === 'bento')  drawBento(res.w, res.h);
    if (state.layout === 'grid')   drawGrid(res.w, res.h);
    if (state.layout === 'mosaic') drawMosaic(res.w, res.h);
    drawOverlay(res.w, res.h);
    drawCornerMark(res.w, res.h);
    if (state.onLayoutChange) state.onLayoutChange(state.layout);
  });
}

export function downloadCollage(filename = 'bibbellydaddys-nfts.png') {
  if (!state.canvas) return;
  state.canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 0);
  }, 'image/png');
}

export function bindCollageControls(containerEl, layouts = ['bento', 'grid', 'mosaic']) {
  if (!containerEl) return;
  const buttons = containerEl.querySelectorAll('[data-layout]');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const layout = btn.getAttribute('data-layout');
      if (!layouts.includes(layout)) return;
      buttons.forEach((b) => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-checked', active ? 'true' : 'false');
      });
      renderCollage(layout);
    });
  });
  const dl = containerEl.querySelector('#dl-collage');
  if (dl) dl.addEventListener('click', () => downloadCollage());
}

// ============================================================================
// Setup helpers
// ============================================================================

function setupCanvas(w, h) {
  const c = state.canvas;
  c.width = w;
  c.height = h;
  // CSS sizing is handled in collage.css (max-width: 100%; height: auto)
  state.ctx.imageSmoothingEnabled = true;
  state.ctx.imageSmoothingQuality = 'high';
}

function preloadImages(nfts) {
  const tasks = nfts.map((nft) => new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => { state.images.set(nft.id, img); resolve(); };
    img.onerror = () => { resolve(); }; // resolve so one bad image doesn't kill the rest
    // Resolve relative to where the *page* lives (not the module path).
    // The host page is at the project root, so nft.image like "images/foo.png"
    // is correct as-is.
    img.src = nft.image;
  }));
  return Promise.all(tasks);
}

// ============================================================================
// Background + overlay
// ============================================================================

function drawBackground(w, h) {
  const ctx = state.ctx;
  // Deep base
  ctx.fillStyle = BRAND.bg;
  ctx.fillRect(0, 0, w, h);

  // Subtle ambient gradients matching the site
  const g1 = ctx.createRadialGradient(w * 0.15, h * -0.1, 0, w * 0.15, h * -0.1, Math.max(w, h) * 0.7);
  g1.addColorStop(0, 'rgba(179, 136, 255, 0.20)');
  g1.addColorStop(1, 'rgba(179, 136, 255, 0)');
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, w, h);

  const g2 = ctx.createRadialGradient(w * 0.9, h * 0.1, 0, w * 0.9, h * 0.1, Math.max(w, h) * 0.6);
  g2.addColorStop(0, 'rgba(94, 224, 255, 0.15)');
  g2.addColorStop(1, 'rgba(94, 224, 255, 0)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, w, h);

  const g3 = ctx.createRadialGradient(w * 0.5, h * 1.1, 0, w * 0.5, h * 1.1, Math.max(w, h) * 0.7);
  g3.addColorStop(0, 'rgba(255, 138, 216, 0.13)');
  g3.addColorStop(1, 'rgba(255, 138, 216, 0)');
  ctx.fillStyle = g3;
  ctx.fillRect(0, 0, w, h);

  // Very subtle noise feels — skip heavy noise to keep file size small
}

function drawOverlay(w, h) {
  const ctx = state.ctx;
  const pad = Math.round(w * 0.022);
  const titleSize = Math.round(w * 0.034);
  const subSize = Math.round(w * 0.014);

  // Bottom-left scrim so text reads cleanly over busy collages
  const scrimH = Math.round(h * 0.22);
  const scrim = ctx.createLinearGradient(0, h - scrimH, 0, h);
  scrim.addColorStop(0, 'rgba(7, 7, 10, 0)');
  scrim.addColorStop(0.5, 'rgba(7, 7, 10, 0.55)');
  scrim.addColorStop(1, 'rgba(7, 7, 10, 0.85)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, h - scrimH, w, scrimH);

  // Title
  ctx.fillStyle = BRAND.text;
  ctx.font = `700 ${titleSize}px "Space Grotesk", "Inter", system-ui, sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  // Faint shadow for legibility
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 2;
  ctx.fillText("bibbellydaddy's NFTs", pad, h - pad - subSize - 18);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Subtitle — pieces · collections · wallets
  const data = computeStats();
  const sub = `${data.total} pieces · ${data.collections} collections · 2 wallets`;
  ctx.fillStyle = BRAND.dim;
  ctx.font = `500 ${subSize}px "Inter", system-ui, sans-serif`;
  ctx.fillText(sub, pad, h - pad);

  // Tiny "snapshot" label, top-right
  const tagSize = Math.round(w * 0.011);
  ctx.font = `600 ${tagSize}px "Inter", system-ui, sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(243, 243, 247, 0.55)';
  const tag = 'ONCHAIN SNAPSHOT · ' + formatDate(new Date());
  ctx.fillText(tag, w - pad, pad + tagSize);
  ctx.textAlign = 'left';
}

function drawCornerMark(w, h) {
  // Gradient accent square in top-left
  const ctx = state.ctx;
  const pad = Math.round(w * 0.022);
  const size = Math.round(w * 0.022);
  const grad = ctx.createLinearGradient(pad, pad, pad + size, pad + size);
  grad.addColorStop(0, BRAND.accent);
  grad.addColorStop(0.5, BRAND.accent2);
  grad.addColorStop(1, BRAND.accent3);
  ctx.fillStyle = grad;
  roundRectPath(ctx, pad, pad, size, size, size * 0.27);
  ctx.fill();

  // Glow
  ctx.save();
  ctx.shadowColor = 'rgba(179, 136, 255, 0.6)';
  ctx.shadowBlur = 30;
  ctx.fillStyle = grad;
  roundRectPath(ctx, pad, pad, size, size, size * 0.27);
  ctx.fill();
  ctx.restore();

  // Brand wordmark to the right of the mark
  const fontSize = Math.round(w * 0.013);
  ctx.fillStyle = BRAND.text;
  ctx.font = `700 ${fontSize}px "Space Grotesk", "Inter", system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText('bibbellydaddy', pad + size + 12, pad + size / 2);
  ctx.textBaseline = 'alphabetic';
}

function computeStats() {
  // Use loaded data; fall back to counts derived from nfts array
  const collections = new Set(state.nfts.map((n) => n.collection)).size;
  return { total: state.nfts.length, collections };
}

function formatDate(d) {
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

// ============================================================================
// Layout: BENTO
// ============================================================================
//
// Curated grid where featured NFTs occupy large 2x2 / 2x1 cells and smaller
// tiles fill the rest. The composition is deterministic-but-shuffled so each
// load feels intentional. 12 columns × 7.5 rows on a 2400×1500 canvas.

function drawBento(w, h) {
  const ctx = state.ctx;
  const margin = Math.round(w * 0.022);
  const gutter = Math.round(w * 0.006);

  // 12 col × 8 row grid (each cell ~190 × 175 on a 2400x1500)
  const COLS = 12;
  const ROWS = 8;
  const innerW = w - margin * 2;
  const innerH = h - margin * 2;
  const cellW = (innerW - gutter * (COLS - 1)) / COLS;
  const cellH = (innerH - gutter * (ROWS - 1)) / ROWS;

  // Reserve some bottom rows for the title scrim — paint art into rows 0..6 (full)
  // and row 7 will be partly covered by the gradient scrim — that's fine.

  // Build a curated tile plan. Pattern carefully tuned so:
  //   - 4 big "hero" tiles (3x3) anchor the composition
  //   - several medium 2x2 and 2x3 tiles
  //   - the rest is 1x1 fill
  // Tiles are { col, row, cw, ch } where cw/ch are in grid cells.
  const plan = [
    // Top-left hero (3x3)
    { col: 0,  row: 0, cw: 3, ch: 3 },
    // Top-mid wide hero (3x3)
    { col: 3,  row: 0, cw: 3, ch: 3 },
    // Top-right tall (3x4)
    { col: 9,  row: 0, cw: 3, ch: 4 },
    // Middle-right (3x3)
    { col: 6,  row: 0, cw: 3, ch: 3 },
    // Middle band: 2x2 features
    { col: 0,  row: 3, cw: 2, ch: 2 },
    { col: 2,  row: 3, cw: 2, ch: 2 },
    { col: 4,  row: 3, cw: 3, ch: 2 },
    { col: 7,  row: 3, cw: 2, ch: 2 },
    // Right column continues
    { col: 9,  row: 4, cw: 3, ch: 2 },
    // Lower band: 2x3 large vertical
    { col: 0,  row: 5, cw: 3, ch: 3 },
    { col: 3,  row: 5, cw: 2, ch: 2 },
    { col: 5,  row: 5, cw: 2, ch: 3 },
    { col: 7,  row: 5, cw: 2, ch: 2 },
    { col: 9,  row: 6, cw: 3, ch: 2 },
    // Fill row 7 small cells under the medium tiles
    { col: 3,  row: 7, cw: 1, ch: 1 },
    { col: 4,  row: 7, cw: 1, ch: 1 },
    { col: 7,  row: 7, cw: 1, ch: 1 },
    { col: 8,  row: 7, cw: 1, ch: 1 },
  ];

  // Choose images: sort featured first by collection priority, then non-featured fill
  const priority = [
    'Bored Ape Yacht Club',
    'Pudgy Penguins',
    'KILLABEARS',
    'Doodles',
    'Chimpers',
    'RENGA',
    'Invisible Friends',
    'Lil Pudgys',
    'DEGEN TOONZ',
    'fwogs',
    'KILLABITS',
  ];
  const featuredSorted = state.featured.slice().sort((a, b) => {
    const ai = priority.indexOf(a.collection);
    const bi = priority.indexOf(b.collection);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  const fillSorted = state.others.slice().sort(() => 0); // keep input order, looks more organic
  const queue = featuredSorted.concat(fillSorted);

  // Sort plan by cell area, biggest first, so big tiles get the hero pieces
  const sortedPlan = plan
    .map((p, idx) => ({ ...p, _i: idx, area: p.cw * p.ch }))
    .sort((a, b) => b.area - a.area);

  let qi = 0;
  sortedPlan.forEach((tile) => {
    const nft = queue[qi % queue.length];
    qi += 1;
    const x = margin + tile.col * (cellW + gutter);
    const y = margin + tile.row * (cellH + gutter);
    const tw = tile.cw * cellW + (tile.cw - 1) * gutter;
    const th = tile.ch * cellH + (tile.ch - 1) * gutter;
    drawTile(nft, x, y, tw, th, {
      radius: Math.min(tw, th) * 0.04,
      glow: nft && nft.featured && tile.area >= 4,
      shadow: true,
    });
  });
}

// ============================================================================
// Layout: GRID
// ============================================================================
//
// Tight square grid. Number of columns scales with count. Featured tiles get
// a subtle glow border.

function drawGrid(w, h) {
  const ctx = state.ctx;
  const margin = Math.round(w * 0.022);
  const gutter = Math.round(w * 0.0035);

  const count = state.nfts.length;
  // Aim for a roughly 8x8 grid for 63 items
  let cols;
  if (count <= 36) cols = 6;
  else if (count <= 56) cols = 8;
  else cols = 9;
  const rows = Math.ceil(count / cols);

  // Reserve bottom strip for title scrim (~22%)
  const reserveBottom = Math.round(h * 0.10);
  const innerW = w - margin * 2;
  const innerH = h - margin * 2 - reserveBottom;
  const cellW = (innerW - gutter * (cols - 1)) / cols;
  // For consistent squares, use cellW as the cell side, then center the block
  const cellSide = Math.min(cellW, (innerH - gutter * (rows - 1)) / rows);
  const blockW = cells(cellSide, cols, gutter);
  const blockH = cells(cellSide, rows, gutter);
  const offsetX = margin + (innerW - blockW) / 2;
  const offsetY = margin + (innerH - blockH) / 2;

  // Sort: featured first, then by collection grouping for visual rhythm
  const priority = [
    'Bored Ape Yacht Club', 'KILLABEARS', 'Pudgy Penguins', 'Lil Pudgys',
    'Doodles', 'Chimpers', 'RENGA', 'Invisible Friends', 'DEGEN TOONZ',
    'fwogs', 'KILLABITS', 'Digital Slop', 'Street Trash', 'VeeFriends Series 2',
    'BitKings', 'Good Vibes Club', 'Vibetown Highkey Moments',
  ];
  const sorted = state.nfts.slice().sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    const ai = priority.indexOf(a.collection);
    const bi = priority.indexOf(b.collection);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  sorted.forEach((nft, i) => {
    if (i >= cols * rows) return;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = offsetX + col * (cellSide + gutter);
    const y = offsetY + row * (cellSide + gutter);
    drawTile(nft, x, y, cellSide, cellSide, {
      radius: cellSide * 0.08,
      glow: !!nft.featured,
      shadow: false,
    });
  });
}

function cells(side, n, gutter) {
  return side * n + gutter * (n - 1);
}

// ============================================================================
// Layout: MOSAIC
// ============================================================================
//
// Polaroid-scatter — slight rotation per tile, soft drop shadow, featured
// pieces are larger and positioned closer to centre. Uses a seeded shuffle so
// the layout is consistent across renders but feels organic.

function drawMosaic(w, h) {
  const ctx = state.ctx;
  const cx = w / 2;
  const cy = h / 2;

  // Sort: featured first
  const featured = state.featured.slice();
  const others = state.others.slice();

  // Seeded RNG so each render is identical (no flicker on resize)
  const rand = mulberry32(0xC0FFEE);

  // Place featured (large) tiles in a loose ring near the centre
  const featuredCount = featured.length;
  const ringRX = w * 0.30;
  const ringRY = h * 0.30;
  const baseSize = Math.min(w, h) * 0.20;

  const placements = [];

  featured.forEach((nft, i) => {
    const angle = (i / featuredCount) * Math.PI * 2 + rand() * 0.3;
    const r = 0.45 + rand() * 0.35; // 0.45–0.80 of ring
    const x = cx + Math.cos(angle) * ringRX * r;
    const y = cy + Math.sin(angle) * ringRY * r;
    const size = baseSize * (0.95 + rand() * 0.25);
    const rot = (rand() - 0.5) * 0.22; // ~ ±12.6deg
    placements.push({ nft, x, y, size, rot, featured: true });
  });

  // Place others as smaller scattered tiles further out (and some in the gaps)
  others.forEach((nft, i) => {
    // Mix inner gaps and outer scatter
    let x, y, size;
    const layer = i % 3;
    if (layer === 0) {
      // outer top
      x = rand() * w;
      y = rand() * h * 0.35;
    } else if (layer === 1) {
      // outer bottom (avoid the title scrim area at bottom 22%)
      x = rand() * w;
      y = h * 0.45 + rand() * h * 0.32;
    } else {
      // sides
      x = (rand() < 0.5 ? rand() * w * 0.18 : w * 0.82 + rand() * w * 0.18);
      y = rand() * h;
    }
    size = baseSize * (0.45 + rand() * 0.25);
    const rot = (rand() - 0.5) * 0.34; // up to ±19deg
    placements.push({ nft, x, y, size, rot, featured: false });
  });

  // Draw smaller tiles first (so featured land on top)
  placements.sort((a, b) => a.size - b.size);

  placements.forEach((p) => drawPolaroid(p));
}

function drawPolaroid(p) {
  const ctx = state.ctx;
  const { nft, x, y, size, rot, featured } = p;
  const img = state.images.get(nft.id);

  // Polaroid frame proportions: ~6% top/sides, ~14% bottom
  const frame = size * 0.045;
  const bottomFrame = size * 0.12;
  const total = size + frame * 2;
  const totalH = size + frame + bottomFrame;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.translate(-total / 2, -totalH / 2);

  // Drop shadow
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = featured ? 60 : 30;
  ctx.shadowOffsetY = featured ? 24 : 12;
  // Off-white frame
  ctx.fillStyle = '#f5f3ef';
  roundRectPath(ctx, 0, 0, total, totalH, size * 0.018);
  ctx.fill();

  // Reset shadow before drawing image so it doesn't double-shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Image area
  const ix = frame;
  const iy = frame;
  const iw = size;
  const ih = size;
  if (img) {
    drawImageCoverClipped(ctx, img, ix, iy, iw, ih, size * 0.005);
  } else {
    ctx.fillStyle = '#1a1a22';
    ctx.fillRect(ix, iy, iw, ih);
  }

  // Featured glow accent — a small colored stripe along the bottom of the frame
  if (featured) {
    const stripeY = iy + ih + bottomFrame * 0.55;
    const grad = ctx.createLinearGradient(ix, stripeY, ix + iw, stripeY);
    grad.addColorStop(0, BRAND.accent);
    grad.addColorStop(0.5, BRAND.accent2);
    grad.addColorStop(1, BRAND.accent3);
    ctx.fillStyle = grad;
    const sh = Math.max(2, size * 0.012);
    roundRectPath(ctx, ix, stripeY - sh / 2, iw, sh, sh / 2);
    ctx.fill();
  }

  // Collection name (tiny) on the bottom frame
  const labelSize = Math.max(10, size * 0.052);
  ctx.fillStyle = '#222';
  ctx.font = `600 ${labelSize}px "Inter", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = truncate(nft.collection || nft.name || '', 22);
  ctx.fillText(label, total / 2, iy + ih + bottomFrame * 0.82);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ctx.restore();
}

// ============================================================================
// Tile primitive — used by bento and grid
// ============================================================================

function drawTile(nft, x, y, w, h, opts) {
  const ctx = state.ctx;
  const radius = (opts && opts.radius) || 12;
  const glow = !!(opts && opts.glow);
  const shadow = !!(opts && opts.shadow);
  const img = nft ? state.images.get(nft.id) : null;

  ctx.save();

  // Drop shadow under tile
  if (shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 16;
  }
  // Background plate (in case image fails)
  ctx.fillStyle = '#15151b';
  roundRectPath(ctx, x, y, w, h, radius);
  ctx.fill();

  // Reset shadow so image isn't shadowed
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Image
  if (img) {
    drawImageCoverClipped(ctx, img, x, y, w, h, radius);
  }

  // Glow border for featured
  if (glow) {
    ctx.save();
    roundRectPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, radius);
    ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.006);
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, 'rgba(179, 136, 255, 0.85)');
    grad.addColorStop(0.5, 'rgba(94, 224, 255, 0.7)');
    grad.addColorStop(1, 'rgba(255, 138, 216, 0.85)');
    ctx.strokeStyle = grad;
    ctx.shadowColor = 'rgba(179, 136, 255, 0.5)';
    ctx.shadowBlur = 20;
    ctx.stroke();
    ctx.restore();
  } else {
    // Hairline edge for non-featured to keep tiles distinct on dark bg
    ctx.save();
    roundRectPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, radius);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

// ============================================================================
// Image drawing utility — object-fit: cover, with rounded clip
// ============================================================================

function drawImageCoverClipped(ctx, img, x, y, w, h, radius) {
  ctx.save();
  roundRectPath(ctx, x, y, w, h, radius);
  ctx.clip();

  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) {
    ctx.fillStyle = '#1a1a22';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    return;
  }
  // cover
  const targetAR = w / h;
  const imgAR = iw / ih;
  let sx, sy, sw, sh;
  if (imgAR > targetAR) {
    // image is wider than target -> crop sides
    sh = ih;
    sw = ih * targetAR;
    sx = (iw - sw) / 2;
    sy = 0;
  } else {
    // image is taller -> crop top/bottom
    sw = iw;
    sh = iw / targetAR;
    sx = 0;
    sy = (ih - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

// ============================================================================
// Small geometry helpers
// ============================================================================

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y,     x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x,     y + h, rr);
  ctx.arcTo(x,     y + h, x,     y,     rr);
  ctx.arcTo(x,     y,     x + w, y,     rr);
  ctx.closePath();
}

function truncate(str, n) {
  if (!str) return '';
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

// Seeded RNG (Mulberry32) — gives the mosaic a stable layout per session.
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
