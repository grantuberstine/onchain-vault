import { initBackground } from './bg.js';

// ---------- State ----------
const state = {
  data: null,
  activeFilter: 'all',       // Vault filter
  shareFilter: 'all',        // Share view filter
  activeTab: 'share',
  initialized: { share: false, vault: false, wall: false, carousel: false },
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ---------- Boot ----------
async function boot() {
  initBackground($('#bg-canvas'));

  try {
    const res = await fetch('./nfts.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Failed to load nfts.json (${res.status})`);
    state.data = await res.json();
  } catch (err) {
    console.error(err);
    $('#share-loader').textContent = 'Could not load collection data.';
    return;
  }

  paintStats(state.data);
  initTabs();
  initModal();

  // Share is the default tab — initialize immediately so first paint is the preview
  await initShareView();
}

function paintStats(data) {
  $('#stat-total').textContent = data.totalCount;
  $('#stat-collections').textContent = data.collections.length;
}

// ---------- Tabs ----------
function initTabs() {
  $$('.tab').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  // Add a subtle backdrop to the tabs strip once the page starts to scroll,
  // so the cards stay readable over scrolling content.
  const tabsEl = $('.tabs');
  const onScroll = () => tabsEl.classList.toggle('scrolled', window.scrollY > 24);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

async function switchTab(name) {
  if (state.activeTab === name) return;
  state.activeTab = name;

  $$('.tab').forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', on ? 'true' : 'false');
  });

  $$('.view').forEach((v) => {
    const on = v.id === name;
    v.classList.toggle('active', on);
    v.hidden = !on;
  });

  // Lazy-init each view on first show
  if (name === 'share' && !state.initialized.share) await initShareView();
  if (name === 'vault' && !state.initialized.vault) initVaultView();
  if (name === 'wall' && !state.initialized.wall) await initWallView();
  if (name === 'carousel' && !state.initialized.carousel) await initCarouselView();

  // Scroll to top of view content
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================================
// Share view (default tab)
// ============================================================================
let collageMod = null;

async function initShareView() {
  if (state.initialized.share) return;
  state.initialized.share = true;

  renderShareFilters();

  try {
    collageMod = await import('./views/collage.js');
    const canvas = $('#collage-canvas');
    await collageMod.initCollage({ canvas, nfts: state.data.nfts });
    collageMod.renderCollage('bento');
    $('#share-loader').classList.add('hidden');
  } catch (e) {
    console.error('Collage failed:', e);
    $('#share-loader').textContent = 'Could not load preview.';
    return;
  }

  // Layout switcher
  $$('.share-controls [data-layout]').forEach((b) => {
    b.addEventListener('click', () => {
      $$('.share-controls [data-layout]').forEach((x) => {
        const on = x === b;
        x.classList.toggle('active', on);
        x.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      collageMod.renderCollage(b.dataset.layout);
    });
  });

  // Save Image — native share on mobile, download on desktop
  $('#save-image').addEventListener('click', saveImage);
  $('#download-image').addEventListener('click', () => collageMod.downloadCollage(currentFilename()));

  // Hint text varies by capability
  if (!canUseNativeShare()) {
    $('#share-hint').textContent = 'Click Save image to download the PNG, then drop it anywhere.';
  }
}

// Web Share works best on real touch devices. On desktop Chrome it pops a
// system share dialog that's clunky for image saving — so only use it on
// actual phones/tablets and fall back to download elsewhere.
function canUseNativeShare() {
  if (!navigator.canShare || !navigator.share) return false;
  const isTouchPrimary = matchMedia('(pointer: coarse)').matches;
  const isMobileUA = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return isTouchPrimary || isMobileUA;
}

function renderShareFilters() {
  const data = state.data;
  const chips = [
    { id: 'all', label: 'Everything', count: data.totalCount },
    { id: 'featured', label: 'Featured only', count: data.featuredCount },
    // top collections that have at least 2 NFTs
    ...data.collections.filter((c) => c.count >= 2).slice(0, 8).map((c) => ({
      id: `col:${c.name}`, label: c.name, count: c.count
    })),
    { id: 'wallet:0x3ed0b065e6fd906ca20e4ebe080ea72c4325339a', label: 'Wallet A', count: data.nfts.filter(n => n.wallet === '0x3ed0b065e6fd906ca20e4ebe080ea72c4325339a').length },
    { id: 'wallet:0x28f6acf1de13ccd96d5b01a1aaf9716f6c7be644', label: 'Wallet B', count: data.nfts.filter(n => n.wallet === '0x28f6acf1de13ccd96d5b01a1aaf9716f6c7be644').length },
  ];

  $('#share-filters').innerHTML = chips.map((c) => `
    <button class="chip ${c.id === state.shareFilter ? 'active' : ''}" data-share-filter="${escapeAttr(c.id)}">
      ${escapeHtml(c.label)}<span class="chip-count">${c.count}</span>
    </button>
  `).join('');

  $('#share-filters').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-share-filter]');
    if (!btn) return;
    state.shareFilter = btn.dataset.shareFilter;
    $$('#share-filters .chip').forEach((b) => b.classList.toggle('active', b === btn));
    applyShareFilter();
  });
}

function applyShareFilter() {
  if (!collageMod) return;
  const filter = state.shareFilter;
  let subset;
  if (filter === 'all') subset = state.data.nfts;
  else if (filter === 'featured') subset = state.data.nfts.filter((n) => n.featured);
  else if (filter.startsWith('col:')) {
    const name = filter.slice(4);
    subset = state.data.nfts.filter((n) => n.collection === name);
  } else if (filter.startsWith('wallet:')) {
    const addr = filter.slice(7);
    subset = state.data.nfts.filter((n) => n.wallet === addr);
  } else subset = state.data.nfts;

  if (subset.length === 0) return;
  collageMod.setCollageNfts(subset);
  // Use the currently-active layout button
  const active = $('.share-controls [data-layout].active');
  collageMod.renderCollage(active ? active.dataset.layout : 'bento');
}

function currentFilename() {
  const f = state.shareFilter;
  if (f === 'all') return 'snapshot.png';
  if (f === 'featured') return 'featured.png';
  if (f.startsWith('col:')) return `${slug(f.slice(4))}.png`;
  if (f.startsWith('wallet:')) return `${f.slice(7).slice(0, 10)}.png`;
  return 'snapshot.png';
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function saveImage() {
  if (!collageMod) return;
  const btn = $('#save-image');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span aria-hidden="true">…</span> Preparing…';

  try {
    const blob = await collageMod.collageToBlob('image/png');
    if (!blob) throw new Error('Failed to render');
    const file = new File([blob], currentFilename(), { type: 'image/png' });

    if (canUseNativeShare() && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: "bibbellydaddy's NFTs",
          text: 'Snapshot of an NFT collection',
        });
        btn.innerHTML = '<span aria-hidden="true">✓</span> Saved';
      } catch (e) {
        // User canceled share — silently restore
        if (e.name !== 'AbortError') console.warn(e);
      }
    } else {
      // Desktop fallback: trigger download
      collageMod.downloadCollage(currentFilename());
      btn.innerHTML = '<span aria-hidden="true">✓</span> Downloaded';
    }
  } catch (e) {
    console.error(e);
    btn.innerHTML = '<span aria-hidden="true">!</span> Failed — try Download PNG';
  } finally {
    setTimeout(() => {
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    }, 1800);
  }
}

// ============================================================================
// Vault view (masonry grid + filters)
// ============================================================================

function initVaultView() {
  if (state.initialized.vault) return;
  state.initialized.vault = true;
  renderVaultFilters(state.data);
  renderVaultGrid(state.data.nfts);
}

function renderVaultFilters(data) {
  const filters = $('#filters');
  const total = data.totalCount;
  const topCols = data.collections.slice(0, 8);

  const chips = [
    { id: 'all', label: 'All', count: total },
    { id: 'featured', label: 'Featured', count: data.featuredCount },
    ...topCols.map((c) => ({ id: `col:${c.name}`, label: c.name, count: c.count })),
    { id: 'wallet:0x3ed0b065e6fd906ca20e4ebe080ea72c4325339a', label: 'Wallet A', count: data.nfts.filter(n => n.wallet === '0x3ed0b065e6fd906ca20e4ebe080ea72c4325339a').length },
    { id: 'wallet:0x28f6acf1de13ccd96d5b01a1aaf9716f6c7be644', label: 'Wallet B', count: data.nfts.filter(n => n.wallet === '0x28f6acf1de13ccd96d5b01a1aaf9716f6c7be644').length },
  ];

  filters.innerHTML = chips.map((c) => `
    <button class="filter-chip ${c.id === state.activeFilter ? 'active' : ''}" data-filter="${escapeAttr(c.id)}">
      ${escapeHtml(c.label)}<span class="count">${c.count}</span>
    </button>
  `).join('');

  filters.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-chip');
    if (!btn) return;
    state.activeFilter = btn.dataset.filter;
    $$('.filter-chip').forEach((b) => b.classList.toggle('active', b === btn));
    applyVaultFilter();
  });
}

function applyVaultFilter() {
  const filter = state.activeFilter;
  $$('#grid .card').forEach((card) => {
    const nft = JSON.parse(card.dataset.nft);
    let show = true;
    if (filter === 'all') show = true;
    else if (filter === 'featured') show = nft.featured;
    else if (filter.startsWith('col:')) show = nft.collection === filter.slice(4);
    else if (filter.startsWith('wallet:')) show = nft.wallet === filter.slice(7);
    card.style.display = show ? '' : 'none';
  });
}

function renderVaultGrid(nfts) {
  const grid = $('#grid');
  grid.innerHTML = nfts.map((n, i) => {
    const delay = Math.min(i * 22, 700);
    return `
      <article class="card ${n.featured ? 'featured' : ''}" data-nft='${escapeAttr(JSON.stringify(slimNft(n)))}' style="animation-delay:${delay}ms">
        ${n.featured ? '<span class="featured-pin">★ Featured</span>' : ''}
        <div class="card-image">
          <img src="${escapeAttr(n.thumb)}" alt="${escapeAttr(n.name)}" loading="lazy" decoding="async" />
        </div>
        <div class="card-overlay">
          <div class="collection-tag">${escapeHtml(n.collection)}</div>
          <div class="nft-name">${escapeHtml(n.name)}</div>
        </div>
      </article>
    `;
  }).join('');

  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    const nft = JSON.parse(card.dataset.nft);
    const full = state.data.nfts.find((n) => n.id === nft.id) || nft;
    openModal(full);
  });
}

function slimNft(n) {
  return { id: n.id, featured: n.featured, collection: n.collection, wallet: n.wallet };
}

// ============================================================================
// Wall view
// ============================================================================

async function initWallView() {
  if (state.initialized.wall) return;
  state.initialized.wall = true;
  try {
    const mod = await import('./views/wall.js');
    mod.initWall({
      container: $('#wall-stage'),
      nfts: state.data.nfts,
      onTileClick: (nft) => openModal(nft),
    });
  } catch (e) {
    console.error('Wall failed:', e);
    $('#wall-stage').innerHTML = '<div class="view-error">Could not load Wall.</div>';
  }
}

// ============================================================================
// Carousel view (3D ring)
// ============================================================================

async function initCarouselView() {
  if (state.initialized.carousel) return;
  state.initialized.carousel = true;
  try {
    const mod = await import('./views/carousel.js');
    mod.initCarousel({
      container: $('.carousel-stage'),
      canvas: $('#hero-canvas'),
      loadingEl: $('#hero-loading'),
      nfts: state.data.nfts,
      onTileClick: (nft) => openModal(nft),
    });
  } catch (e) {
    console.error('Carousel failed:', e);
    $('#hero-loading').textContent = 'Could not load 3D scene.';
  }
}

// ============================================================================
// Modal
// ============================================================================

function initModal() {
  const modal = $('#modal');
  modal.addEventListener('click', (e) => {
    if (e.target.dataset.close) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

function openModal(nft) {
  const modal = $('#modal');
  $('#modal-img').src = nft.image;
  $('#modal-img').alt = nft.name;
  $('#modal-collection').textContent = nft.collection;
  $('#modal-name').textContent = nft.name;
  $('#modal-desc').textContent = nft.description || 'No description provided.';
  $('#modal-token').textContent = nft.tokenId;
  $('#modal-contract').textContent = shortAddr(nft.contract);
  $('#modal-contract').title = nft.contract;
  $('#modal-type').textContent = nft.tokenType;
  $('#modal-opensea').href = nft.openSeaUrl;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const modal = $('#modal');
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

// ---------- Utils ----------
function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escapeAttr(s = '') {
  return String(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function shortAddr(a = '') {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

boot();
