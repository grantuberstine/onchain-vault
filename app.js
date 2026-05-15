import * as THREE from 'three';

// ---------- State ----------
const state = {
  data: null,
  activeFilter: 'all',
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ---------- Boot ----------
async function boot() {
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
}

function paintStats(data) {
  $('#stat-total').textContent = data.totalCount;
  $('#stat-collections').textContent = data.collections.length;
}

// ---------- Three.js Hero Wall ----------
function initHero(data) {
  const featured = data.nfts.filter((n) => n.featured);
  // Fallback: if too few featured, pad with non-featured so the ring isn't sparse.
  const minRing = 14;
  let ringNfts = featured.slice();
  if (ringNfts.length < minRing) {
    const extras = data.nfts.filter((n) => !n.featured).slice(0, minRing - ringNfts.length);
    ringNfts = ringNfts.concat(extras);
  }
  // Keep ring size reasonable
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
  const starCount = 360;
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
    opacity: 0.55,
    sizeAttenuation: true,
  });
  const stars = new THREE.Points(starGeom, starMat);
  scene.add(stars);

  // Ring of NFT cards — positioned below the title for visual hierarchy
  const ring = new THREE.Group();
  ring.position.y = -1.4;
  ring.rotation.x = -0.12; // slight tilt — cards lean toward viewer
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
      color: 0x1a1a22,
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

    loader.load(
      nft.thumb || nft.image,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
        const w = tex.image?.naturalWidth || tex.image?.width || 1;
        const h = tex.image?.naturalHeight || tex.image?.height || 1;
        const aspect = w / h;
        mesh.geometry.dispose();
        mesh.geometry = new THREE.PlaneGeometry(cardHeight * aspect, cardHeight);
        mesh.material.dispose();
        mesh.material = new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide });
        mesh.material.color = new THREE.Color(0xffffff);

        loadedCount++;
        if (loadedCount >= Math.ceil(ringNfts.length * 0.6)) {
          $('#hero-loading').classList.add('hidden');
        }
      },
      undefined,
      (err) => {
        console.warn('Texture failed:', nft.name, err);
        loadedCount++;
      }
    );
  });

  // Safety: hide loading after 3.5s no matter what
  setTimeout(() => $('#hero-loading').classList.add('hidden'), 3500);

  // ---------- Resize ----------
  function resize() {
    const w = heroEl.clientWidth;
    const h = heroEl.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Pull camera back more on portrait/small viewports so the ring still fits
    if (w < 720) camera.position.z = 16;
    else if (w / h < 1.4) camera.position.z = 15;
    else camera.position.z = 13;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  // ---------- Interaction: drag to rotate, click to open ----------
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
      // Hover highlight
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
  canvas.addEventListener('pointerleave', () => {
    if (dragging) { dragging = false; }
  });

  // ---------- Animation loop ----------
  const clock = new THREE.Clock();
  function tick() {
    const t = clock.getElapsedTime();
    if (!dragging) {
      // Idle auto-rotation + decay of any flick velocity
      ring.rotation.y += dragVel || 0.0018;
      dragVel *= 0.93;
    }

    // Per-card subtle float + hover scale
    cards.forEach((m) => {
      m.position.y = Math.sin(t * 0.9 + m.userData.phase) * 0.08;
      const target = (m === hoverCard) ? 1.08 : 1.0;
      m.userData.hover += (target - m.userData.hover) * 0.12;
      const s = 1 + m.userData.hover - 1; // = m.userData.hover
      m.scale.set(s, s, s);
    });

    // Stars: slow drift
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
    // Re-hydrate full nft from state by id
    const full = state.data.nfts.find((n) => n.id === nft.id) || nft;
    openModal(full);
  });
}

function slimNft(n) {
  // We embed a tiny subset on the data attr to keep DOM size sane;
  // full NFT looked up by id at click time.
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
