import * as THREE from 'three';
import { initBackground } from './bg.js';

// ---------- State ----------
const state = {
  data: null,
  activeFilter: 'all',
  activeTab: 'vault',
  collageReady: false,
  wallReady: false,
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
    $('#hero-loading').textContent = 'Could not load collection data.';
    return;
  }

  paintStats(state.data);
  initHero(state.data);
  renderFilters(state.data);
  renderGrid(state.data.nfts);
  initModal();
  initTabs();
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
  $$('[data-tab-link]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab(a.dataset.tabLink);
    });
  });
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

  // Lazy load heavy view modules
  if (name === 'collage' && !state.collageReady) {
    try {
      const mod = await import('./views/collage.js');
      const canvas = $('#collage-canvas');
      await mod.initCollage({ canvas, nfts: state.data.nfts });
      mod.renderCollage('bento');
      state.collageReady = true;
      // Wire layout switcher
      $$('.collage-controls .seg-btn').forEach((b) => {
        b.addEventListener('click', () => {
          $$('.collage-controls .seg-btn').forEach((x) => {
            const on = x === b;
            x.classList.toggle('active', on);
            x.setAttribute('aria-checked', on ? 'true' : 'false');
          });
          mod.renderCollage(b.dataset.layout);
        });
      });
      $('#dl-collage').addEventListener('click', () => mod.downloadCollage('bibbellydaddys-nfts.png'));
    } catch (e) {
      console.error('Collage view failed to load:', e);
      $('#collage .collage-stage').innerHTML = `<div class="view-error">Collage view failed to load.</div>`;
    }
  }

  if (name === 'wall' && !state.wallReady) {
    try {
      const mod = await import('./views/wall.js');
      mod.initWall({
        container: $('#wall-stage'),
        nfts: state.data.nfts,
        onTileClick: (nft) => openModal(nft),
      });
      state.wallReady = true;
    } catch (e) {
      console.error('Wall view failed to load:', e);
      $('#wall .wall-stage').innerHTML = `<div class="view-error">Wall view failed to load.</div>`;
    }
  }

  // Scroll into view nicely
  const target = $(`#${name}`);
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- Three.js Hero Wall ----------
function initHero(data) {
  const featured = data.nfts.filter((n) => n.featured);
  const minRing = 14;
  let ringNfts = featured.slice();
  if (ringNfts.length < minRing) {
    const extras = data.nfts.filter((n) => !n.featured).slice(0, minRing - ringNfts.length);
    ringNfts = ringNfts.concat(extras);
  }
  ringNfts = ringNfts.slice(0, 22);

  const canvas = $('#hero-canvas');
  const heroEl = $('#featured');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0.6, 13);
  camera.lookAt(0, 0, 0);

  // Subtle star particles
  const starCount = 420;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starPositions[3 * i] = (Math.random() - 0.5) * 80;
    starPositions[3 * i + 1] = (Math.random() - 0.5) * 50;
    starPositions[3 * i + 2] = -Math.random() * 40 - 5;
  }
  const starGeom = new THREE.BufferGeometry();
  starGeom.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.045,
    transparent: true,
    opacity: 0.5,
    sizeAttenuation: true,
  });
  const stars = new THREE.Points(starGeom, starMat);
  scene.add(stars);

  // Ring of NFT cards — positioned below the title for visual hierarchy
  const ring = new THREE.Group();
  ring.position.y = -1.4;
  ring.rotation.x = -0.12;
  scene.add(ring);

  const radius = 7.0;
  const cardHeight = 1.85;
  const loader = new THREE.TextureLoader();
  loader.crossOrigin = 'anonymous';

  const cards = [];
  let loadedCount = 0;

  ringNfts.forEach((nft, i) => {
    const angle = (i / ringNfts.length) * Math.PI * 2;

    // Placeholder until texture loads
    const geom = new THREE.PlaneGeometry(2, cardHeight);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x12121a,
      transparent: true,
      opacity: 1,
      side: THREE.FrontSide,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
    mesh.rotation.y = angle;
    mesh.userData = {
      nft,
      angle,
      baseY: 0,
      phase: Math.random() * Math.PI * 2,
      hover: 0,
    };
    ring.add(mesh);
    cards.push(mesh);

    // Progressive load: thumb first (fast), then full-res (crisp)
    loader.load(
      nft.thumb || nft.image,
      (thumbTex) => {
        thumbTex.colorSpace = THREE.SRGBColorSpace;
        thumbTex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
        const w = thumbTex.image?.naturalWidth || thumbTex.image?.width || 1;
        const h = thumbTex.image?.naturalHeight || thumbTex.image?.height || 1;
        const aspect = w / h;
        mesh.geometry.dispose();
        mesh.geometry = new THREE.PlaneGeometry(cardHeight * aspect, cardHeight);
        mesh.material.dispose();
        mesh.material = new THREE.MeshBasicMaterial({ map: thumbTex, side: THREE.FrontSide });

        loadedCount++;
        if (loadedCount >= Math.ceil(ringNfts.length * 0.6)) {
          $('#hero-loading').classList.add('hidden');
        }

        // Now upgrade to high-res in background
        loader.load(
          nft.image,
          (fullTex) => {
            fullTex.colorSpace = THREE.SRGBColorSpace;
            fullTex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 16);
            const old = mesh.material;
            mesh.material = new THREE.MeshBasicMaterial({ map: fullTex, side: THREE.FrontSide });
            // Dispose old texture and material
            if (old.map && old.map !== fullTex) old.map.dispose();
            old.dispose();
          },
          undefined,
          () => {/* keep thumb if high-res fails */}
        );
      },
      undefined,
      (err) => {
        console.warn('Texture failed:', nft.name, err);
        loadedCount++;
      }
    );
  });

  setTimeout(() => $('#hero-loading').classList.add('hidden'), 4000);

  // ---------- Resize ----------
  function resize() {
    const w = heroEl.clientWidth;
    const h = heroEl.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    if (w < 720) camera.position.z = 16;
    else if (w / h < 1.4) camera.position.z = 15;
    else camera.position.z = 13;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  // ---------- Interaction ----------
  let dragging = false;
  let dragVel = 0;
  let lastX = 0;
  let downX = 0;
  let downCard = null;
  let downTime = 0;
  let didDrag = false;

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(cards);
    return hits.length ? hits[0].object : null;
  }

  let hoverCard = null;

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    didDrag = false;
    lastX = downX = e.clientX;
    downTime = performance.now();
    dragVel = 0;
    downCard = pick(e.clientX, e.clientY);
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (dragging) {
      const dx = e.clientX - lastX;
      ring.rotation.y += dx * 0.005;
      dragVel = dx * 0.005;
      lastX = e.clientX;
      if (Math.abs(e.clientX - downX) > 8) didDrag = true;
    } else {
      const hit = pick(e.clientX, e.clientY);
      if (hit !== hoverCard) {
        hoverCard = hit;
        canvas.style.cursor = hit ? 'pointer' : 'grab';
      }
    }
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    if (!didDrag && performance.now() - downTime < 500) {
      const hit = pick(e.clientX, e.clientY);
      if (hit && hit === downCard) {
        openModal(hit.userData.nft);
      }
    }
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => { if (dragging) dragging = false; });

  // ---------- Animation loop ----------
  const clock = new THREE.Clock();
  // Faster idle rotation than before — feels alive
  const IDLE_SPIN = 0.0042;

  function tick() {
    const t = clock.getElapsedTime();
    if (!dragging) {
      ring.rotation.y += dragVel || IDLE_SPIN;
      dragVel *= 0.93;
    }

    cards.forEach((m) => {
      m.position.y = Math.sin(t * 0.9 + m.userData.phase) * 0.09;
      const target = (m === hoverCard) ? 1.08 : 1.0;
      m.userData.hover += (target - m.userData.hover) * 0.12;
      m.scale.set(m.userData.hover, m.userData.hover, m.userData.hover);
    });

    stars.rotation.y = t * 0.02;

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ---------- Filters ----------
function renderFilters(data) {
  const filters = $('#filters');
  const total = data.totalCount;
  const topCols = data.collections.slice(0, 8);

  const chips = [
    { id: 'all', label: 'All', count: total },
    { id: 'featured', label: 'Featured', count: data.featuredCount },
    ...topCols.map((c) => ({ id: `col:${c.name}`, label: c.name, count: c.count })),
    { id: 'wallet:0x3ed0b065e6fd906ca20e4ebe080ea72c4325339a', label: 'Wallet 1', count: data.nfts.filter(n => n.wallet === '0x3ed0b065e6fd906ca20e4ebe080ea72c4325339a').length },
    { id: 'wallet:0x28f6acf1de13ccd96d5b01a1aaf9716f6c7be644', label: 'Wallet 2', count: data.nfts.filter(n => n.wallet === '0x28f6acf1de13ccd96d5b01a1aaf9716f6c7be644').length },
  ];

  filters.innerHTML = chips.map((c) => `
    <button class="filter-chip ${c.id === state.activeFilter ? 'active' : ''}" data-filter="${c.id}">
      ${escapeHtml(c.label)}<span class="count">${c.count}</span>
    </button>
  `).join('');

  filters.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-chip');
    if (!btn) return;
    state.activeFilter = btn.dataset.filter;
    $$('.filter-chip').forEach((b) => b.classList.toggle('active', b === btn));
    applyFilter();
  });
}

function applyFilter() {
  const filter = state.activeFilter;
  const cards = $$('.card');
  cards.forEach((card) => {
    const nft = JSON.parse(card.dataset.nft);
    let show = true;
    if (filter === 'all') show = true;
    else if (filter === 'featured') show = nft.featured;
    else if (filter.startsWith('col:')) show = nft.collection === filter.slice(4);
    else if (filter.startsWith('wallet:')) show = nft.wallet === filter.slice(7);
    card.style.display = show ? '' : 'none';
  });
}

// ---------- Grid ----------
function renderGrid(nfts) {
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

// ---------- Modal ----------
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
  $('#modal-wallet').textContent = nft.walletShort;
  $('#modal-wallet').title = nft.wallet;
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
