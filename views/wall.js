/**
 * Wall view — multi-row horizontal parallax gallery
 *
 * Pattern A: 3 rows of NFTs stacked vertically; cursor X position drives
 * horizontal scrolling of all rows, each at a slightly different speed for
 * parallax depth. Touch users get drag-with-momentum.
 *
 * Exports:
 *   initWall({ container, nfts, onTileClick? })
 *   destroyWall()
 *
 * Fires a `wall:tile-click` CustomEvent on the container with detail: { nft }.
 */

// Module-scope state so destroyWall() can clean up the active instance
let active = null;

const ROW_COUNT = 3;
// Per-row speed — kept nearly uniform to avoid disorienting parallax drift.
// Tiny variation gives a hint of depth without making the wall feel "spazzy."
const ROW_SPEEDS = [1.04, 1.00, 0.96];
// Easing factor for smooth follow (lower = floatier).
const EASE = 0.06;
// Auto-pan velocity at full deflection (only kicks in near the edges).
const MAX_VELOCITY = 0.55;
// Dead zone size (fraction of stage width). Wide so most of the stage is
// "rest" and only the edges trigger drift — easier to click without panning.
const DEAD_ZONE = 0.40;

/**
 * Initialize the wall.
 * @param {Object} opts
 * @param {HTMLElement} opts.container - the .wall-stage element
 * @param {Array} opts.nfts - the NFT array
 * @param {Function} [opts.onTileClick] - optional click callback (nft) => void
 */
export function initWall(opts) {
  if (!opts || !opts.container) {
    console.warn('[wall] initWall called without container');
    return;
  }
  // Tear down any previous instance before building a fresh one
  if (active) destroyWall();

  const { container, nfts, onTileClick } = opts;

  if (!Array.isArray(nfts) || nfts.length === 0) {
    container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-dim)">No NFTs to display.</div>';
    return;
  }

  // The track is where rows live; reuse if present, else create
  let track = container.querySelector('.wall-track');
  if (!track) {
    track = document.createElement('div');
    track.className = 'wall-track';
    container.appendChild(track);
  }
  track.innerHTML = '';

  // Ensure edge vignettes exist (host already supplies them, but be defensive)
  if (!container.querySelector('.wall-edge-left')) {
    const l = document.createElement('div'); l.className = 'wall-edge wall-edge-left'; l.setAttribute('aria-hidden', 'true');
    container.appendChild(l);
  }
  if (!container.querySelector('.wall-edge-right')) {
    const r = document.createElement('div'); r.className = 'wall-edge wall-edge-right'; r.setAttribute('aria-hidden', 'true');
    container.appendChild(r);
  }

  // Distribute NFTs round-robin into rows so featured pieces are spread evenly
  const rowBuckets = Array.from({ length: ROW_COUNT }, () => []);
  // Shuffle within each row deterministically (Fisher-Yates with seeded order = NFT id hash)
  // We want a visually-balanced spread, so just round-robin then offset row 1 & 2 for stagger.
  nfts.forEach((nft, i) => {
    rowBuckets[i % ROW_COUNT].push(nft);
  });
  // Rotate each row by a different offset so the same tiles aren't always vertically aligned
  rowBuckets[1] = rotate(rowBuckets[1], Math.floor(rowBuckets[1].length / 3));
  rowBuckets[2] = rotate(rowBuckets[2], Math.floor(rowBuckets[2].length / 2));

  // Build rows
  const rows = rowBuckets.map((bucket, rowIdx) => buildRow(bucket, rowIdx));
  rows.forEach((row) => track.appendChild(row.el));

  // Per-row state: rendered position (for translate3d) and target position
  // We work in negative numbers (track scrolls left as cursor goes right).
  const rowState = rows.map(() => ({ pos: 0, target: 0 }));

  // Pointer / drag state
  const pointer = {
    inside: false,
    x: 0,                // last pointer X within stage (0..width)
    normX: 0,            // -1..+1 (center = 0)
    dragging: false,
    dragStartX: 0,
    dragStartPos: [0, 0, 0],
    lastDragX: 0,
    lastDragT: 0,
    velocity: 0,         // px / ms — for momentum on release
  };

  // We use a normalised drift velocity computed from normX.
  // When the user is hovering toward the right edge, we want to scroll left
  // (revealing more tiles). When near the left edge, we want to scroll right.
  // Each frame we integrate that velocity into the target position.

  let width = container.clientWidth;
  let height = container.clientHeight;
  // The actual content width per row — needed for wrap-around
  let rowWidths = rows.map((r) => r.contentWidth);

  function recompute() {
    width = container.clientWidth;
    height = container.clientHeight;
    rowWidths = rows.map((r) => measureRowWidth(r.el));
    // Re-clamp current positions in case viewport got narrower
    rowState.forEach((s, i) => {
      const w = rowWidths[i] || 1;
      s.pos = wrap(s.pos, w);
      s.target = wrap(s.target, w);
    });
  }

  // ResizeObserver keeps us responsive without polling
  const ro = new ResizeObserver(recompute);
  ro.observe(container);
  recompute();

  // ----- Pointer handlers (pointer events cover mouse + touch + pen) -----
  function onPointerEnter(e) {
    pointer.inside = true;
    updatePointer(e);
  }
  function onPointerLeave() {
    pointer.inside = false;
    pointer.normX = 0; // drift to rest
    // End any in-progress drag
    if (pointer.dragging) endDrag();
  }
  function onPointerMove(e) {
    updatePointer(e);
    if (pointer.dragging) {
      const now = performance.now();
      const dx = e.clientX - pointer.lastDragX;
      const dt = Math.max(1, now - pointer.lastDragT);
      pointer.velocity = dx / dt; // px/ms — sign matches drag direction
      pointer.lastDragX = e.clientX;
      pointer.lastDragT = now;
      // Move all rows by dx (with row-speed multiplier baked into the integrator)
      // We treat dx as a direct delta to row targets (so the wall sticks to the finger).
      for (let i = 0; i < rowState.length; i++) {
        rowState[i].target += dx * ROW_SPEEDS[i];
        rowState[i].pos += dx * ROW_SPEEDS[i]; // bypass easing for direct drag
      }
    }
  }
  function onPointerDown(e) {
    // Only primary button / single touch
    if (e.button != null && e.button !== 0) return;
    pointer.dragging = true;
    pointer.dragStartX = e.clientX;
    pointer.lastDragX = e.clientX;
    pointer.lastDragT = performance.now();
    pointer.velocity = 0;
    pointer.dragStartPos = rowState.map((s) => s.pos);
    container.classList.add('is-grabbing');
    // Capture so we keep getting events even if pointer leaves the stage briefly
    try { container.setPointerCapture(e.pointerId); } catch (_) {}
  }
  function onPointerUp(e) {
    if (!pointer.dragging) return;
    endDrag();
    try { container.releasePointerCapture(e.pointerId); } catch (_) {}
    // Suppress the click that would fire on the tile under the release point
    // if the user actually dragged (vs. a tap). 14px is more forgiving.
    const totalDrag = Math.abs(e.clientX - pointer.dragStartX);
    if (totalDrag > 14) {
      container._suppressClick = true;
      setTimeout(() => { container._suppressClick = false; }, 80);
    }
  }
  function endDrag() {
    pointer.dragging = false;
    container.classList.remove('is-grabbing');
    // Gentle momentum — was too flingy before.
    const momentum = pointer.velocity * 60;
    for (let i = 0; i < rowState.length; i++) {
      rowState[i].target += momentum * ROW_SPEEDS[i];
    }
    pointer.velocity = 0;
  }

  function updatePointer(e) {
    const rect = container.getBoundingClientRect();
    pointer.x = e.clientX - rect.left;
    // Normalize to -1..+1, with a big dead zone in the center.
    let n = (pointer.x / rect.width) * 2 - 1; // -1..+1
    if (Math.abs(n) < DEAD_ZONE) n = 0;
    else n = (n - Math.sign(n) * DEAD_ZONE) / (1 - DEAD_ZONE);
    pointer.normX = clamp(n, -1, 1) * MAX_VELOCITY;
  }

  container.addEventListener('pointerenter', onPointerEnter);
  container.addEventListener('pointerleave', onPointerLeave);
  container.addEventListener('pointermove', onPointerMove);
  container.addEventListener('pointerdown', onPointerDown);
  container.addEventListener('pointerup', onPointerUp);
  container.addEventListener('pointercancel', onPointerUp);

  // Scroll-wheel → horizontal pan, native feel
  function onWheel(e) {
    if (!pointer.inside) return;
    // Prefer horizontal delta; many trackpads send it. Fall back to vertical.
    const delta = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * -1.0;
    if (!delta) return;
    e.preventDefault();
    for (let i = 0; i < rowState.length; i++) {
      rowState[i].target += delta * ROW_SPEEDS[i] * 0.6;
    }
  }
  container.addEventListener('wheel', onWheel, { passive: false });

  // Arrow keys when the wall has focus
  function onKey(e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const step = container.clientWidth * 0.25 * (e.key === 'ArrowRight' ? -1 : 1);
    for (let i = 0; i < rowState.length; i++) {
      rowState[i].target += step * ROW_SPEEDS[i];
    }
  }
  container.tabIndex = 0;
  container.addEventListener('keydown', onKey);

  // Tile click → fire CustomEvent + optional callback
  function onTrackClick(e) {
    if (container._suppressClick) return; // it was a drag, not a tap
    const tile = e.target.closest('.wall-tile');
    if (!tile) return;
    const nftId = tile.dataset.nftId;
    const nft = nfts.find((n) => n.id === nftId);
    if (!nft) return;
    container.dispatchEvent(new CustomEvent('wall:tile-click', { detail: { nft }, bubbles: true }));
    if (typeof onTileClick === 'function') onTileClick(nft);
  }
  track.addEventListener('click', onTrackClick);

  // Hover dim — when one tile is hovered, dim the others on the same row
  function onTrackPointerOver(e) {
    const tile = e.target.closest('.wall-tile');
    if (!tile) return;
    const row = tile.closest('.wall-row');
    if (!row) return;
    row.querySelectorAll('.wall-tile').forEach((t) => {
      if (t !== tile) t.classList.add('is-dimmed');
    });
  }
  function onTrackPointerOut(e) {
    const tile = e.target.closest('.wall-tile');
    if (!tile) return;
    const row = tile.closest('.wall-row');
    if (!row) return;
    // If we're leaving the tile entirely, undim the row
    // (relatedTarget tells us where we're heading)
    if (!row.contains(e.relatedTarget)) {
      row.querySelectorAll('.wall-tile.is-dimmed').forEach((t) => t.classList.remove('is-dimmed'));
    } else {
      // Moved to another tile — let pointerover handle re-dimming
    }
  }
  track.addEventListener('pointerover', onTrackPointerOver);
  track.addEventListener('pointerout', onTrackPointerOut);

  // ----- Visibility / scroll pause -----
  // Pause the auto-drift when the stage isn't visible.
  let visible = true;
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.target === container) {
          visible = entry.isIntersecting;
        }
      }
    },
    { threshold: 0.05 }
  );
  io.observe(container);

  // ----- Animation loop -----
  let rafId = 0;
  let lastT = performance.now();
  function tick(now) {
    const dt = Math.min(50, now - lastT); // clamp dt so tab-switch doesn't fling
    lastT = now;

    // Only integrate auto-pan when the stage is visible and the user isn't dragging.
    // The cursor's normX drives a drift velocity (pixels per frame at 60fps reference).
    if (visible && !pointer.dragging && pointer.inside) {
      // Negative because cursor right → scroll left
      const baseVel = -pointer.normX * 2.4; // softer than before (was 6)
      const frameScale = dt / 16.67;
      for (let i = 0; i < rowState.length; i++) {
        rowState[i].target += baseVel * ROW_SPEEDS[i] * frameScale;
      }
    }

    // Ease each row's actual position toward its target
    for (let i = 0; i < rowState.length; i++) {
      const s = rowState[i];
      // Use a dt-adjusted ease so motion is consistent across refresh rates
      const e = 1 - Math.pow(1 - EASE, dt / 16.67);
      s.pos += (s.target - s.pos) * e;
      // Wrap into the row's content width so we get seamless infinite scrolling
      const w = rowWidths[i] || 1;
      s.pos = wrap(s.pos, w);
      s.target = wrap(s.target, w);
      // Apply transform — translate3d for GPU
      rows[i].el.style.transform = `translate3d(${s.pos.toFixed(2)}px, 0, 0)`;
    }

    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);

  // ----- Save active instance for destroyWall -----
  active = {
    container,
    track,
    cleanup() {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      io.disconnect();
      container.removeEventListener('pointerenter', onPointerEnter);
      container.removeEventListener('pointerleave', onPointerLeave);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerUp);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('keydown', onKey);
      track.removeEventListener('click', onTrackClick);
      track.removeEventListener('pointerover', onTrackPointerOver);
      track.removeEventListener('pointerout', onTrackPointerOut);
      track.innerHTML = '';
      container.classList.remove('is-grabbing');
      const hint = container.querySelector('.wall-hint');
      if (hint) hint.remove();
    },
  };

  // Add a brief usage hint
  const hint = document.createElement('div');
  hint.className = 'wall-hint';
  hint.innerHTML = '<span class="wall-hint-dot"></span><span>Drag, scroll, or hover the edges · Click any tile</span>';
  container.appendChild(hint);
}

export function destroyWall() {
  if (!active) return;
  active.cleanup();
  active = null;
}

/* ----------------- helpers ----------------- */

/**
 * Build a single row. We duplicate the tile list 2x so the row is wide enough
 * to wrap seamlessly — when pos crosses the original-width boundary we wrap
 * back, and the duplicate copies provide continuous content.
 */
function buildRow(items, rowIdx) {
  const el = document.createElement('div');
  el.className = 'wall-row';
  el.dataset.row = String(rowIdx);

  // Duplicate items so the row is wide enough for seamless wrap.
  // We need at least 2x viewport width worth; duplicating 2-3x covers wide screens.
  // Since rows are 21 tiles each (63/3), 3x = 63 tiles per row — plenty for ultrawide.
  const dupes = 3;
  const renderItems = [];
  for (let d = 0; d < dupes; d++) {
    items.forEach((nft) => renderItems.push(nft));
  }

  const frag = document.createDocumentFragment();
  renderItems.forEach((nft, i) => {
    frag.appendChild(buildTile(nft, i));
  });
  el.appendChild(frag);

  // contentWidth gets measured later after layout
  return { el, contentWidth: 0, items };
}

function buildTile(nft, index) {
  const a = document.createElement('div');
  a.className = 'wall-tile' + (nft.featured ? ' featured' : '');
  a.dataset.nftId = nft.id;
  a.setAttribute('role', 'button');
  a.setAttribute('aria-label', `${nft.name || 'NFT'} — ${nft.collection || ''}`);
  a.tabIndex = -1; // not in tab order — the masonry grid handles a11y nav

  const img = document.createElement('img');
  img.src = nft.thumb || nft.image;
  img.alt = nft.name || '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.draggable = false;

  const caption = document.createElement('div');
  caption.className = 'wall-tile-caption';
  caption.innerHTML = `<span class="col">${escapeHtml(nft.collection || '')}</span>${escapeHtml(nft.name || '')}`;

  a.appendChild(img);
  a.appendChild(caption);
  return a;
}

/**
 * Measure the rendered width of one "original" copy of the row (i.e. the
 * width of one block of unique tiles, not all duplicates). We measure by
 * summing every tile width + gap up to the first repeated index.
 *
 * Simpler & reliable: the row's scrollWidth divided by dupe count.
 */
function measureRowWidth(rowEl) {
  const total = rowEl.scrollWidth;
  // Find a way to know dupe count — we stored 3x; we can recompute by reading children
  // and dividing by the count where the cycle repeats. Since we control duplication,
  // just hard-divide by 3.
  return total / 3;
}

function wrap(pos, period) {
  if (period <= 0) return pos;
  // JS % can be negative; coerce to [-period, 0] window so the row never
  // shows empty space when translated to the right.
  let p = pos % period;
  if (p > 0) p -= period;
  return p;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function rotate(arr, n) {
  if (!arr.length) return arr;
  const k = ((n % arr.length) + arr.length) % arr.length;
  return arr.slice(k).concat(arr.slice(0, k));
}

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
