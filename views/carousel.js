// views/carousel.js
// 3D rotating ring of featured NFTs.
// Extracted from the original hero implementation — now its own tab.

import * as THREE from 'three';

let _inited = false;

export function initCarousel({ container, canvas, loadingEl, nfts, onTileClick }) {
  if (_inited) return;
  _inited = true;

  const featured = nfts.filter((n) => n.featured);
  const minRing = 14;
  let ringNfts = featured.slice();
  if (ringNfts.length < minRing) {
    const extras = nfts.filter((n) => !n.featured).slice(0, minRing - ringNfts.length);
    ringNfts = ringNfts.concat(extras);
  }
  ringNfts = ringNfts.slice(0, 22);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0.6, 13);
  camera.lookAt(0, 0, 0);

  // Stars
  const starCount = 420;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starPositions[3 * i] = (Math.random() - 0.5) * 80;
    starPositions[3 * i + 1] = (Math.random() - 0.5) * 50;
    starPositions[3 * i + 2] = -Math.random() * 40 - 5;
  }
  const starGeom = new THREE.BufferGeometry();
  starGeom.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(
    starGeom,
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.045, transparent: true, opacity: 0.5, sizeAttenuation: true })
  );
  scene.add(stars);

  // Ring
  const ring = new THREE.Group();
  ring.position.y = -1.0;
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
    const geom = new THREE.PlaneGeometry(2, cardHeight);
    const mat = new THREE.MeshBasicMaterial({ color: 0x12121a, transparent: true, opacity: 1, side: THREE.FrontSide });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
    mesh.rotation.y = angle;
    mesh.userData = { nft, angle, baseY: 0, phase: Math.random() * Math.PI * 2, hover: 0 };
    ring.add(mesh);
    cards.push(mesh);

    // Progressive load: thumb first, then full-res swap
    loader.load(nft.thumb || nft.image, (thumbTex) => {
      thumbTex.colorSpace = THREE.SRGBColorSpace;
      thumbTex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
      const w = thumbTex.image?.naturalWidth || 1;
      const h = thumbTex.image?.naturalHeight || 1;
      const aspect = w / h;
      mesh.geometry.dispose();
      mesh.geometry = new THREE.PlaneGeometry(cardHeight * aspect, cardHeight);
      mesh.material.dispose();
      mesh.material = new THREE.MeshBasicMaterial({ map: thumbTex, side: THREE.FrontSide });

      loadedCount++;
      if (loadedCount >= Math.ceil(ringNfts.length * 0.6) && loadingEl) {
        loadingEl.classList.add('hidden');
      }

      // High-res upgrade
      loader.load(nft.image, (fullTex) => {
        fullTex.colorSpace = THREE.SRGBColorSpace;
        fullTex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 16);
        const old = mesh.material;
        mesh.material = new THREE.MeshBasicMaterial({ map: fullTex, side: THREE.FrontSide });
        if (old.map && old.map !== fullTex) old.map.dispose();
        old.dispose();
      });
    }, undefined, () => { loadedCount++; });
  });

  if (loadingEl) setTimeout(() => loadingEl.classList.add('hidden'), 4500);

  // Resize relative to container
  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight || 600;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    if (w < 720) camera.position.z = 16;
    else if (w / h < 1.4) camera.position.z = 15;
    else camera.position.z = 13;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);
  // Also re-resize on next frame in case tab just became visible
  requestAnimationFrame(() => requestAnimationFrame(resize));

  // Interaction
  let dragging = false, dragVel = 0, lastX = 0, downX = 0, downCard = null, downTime = 0, didDrag = false;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hoverCard = null;

  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(cards);
    return hits.length ? hits[0].object : null;
  }

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true; didDrag = false;
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
      if (hit !== hoverCard) { hoverCard = hit; canvas.style.cursor = hit ? 'pointer' : 'grab'; }
    }
  });
  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    if (!didDrag && performance.now() - downTime < 500) {
      const hit = pick(e.clientX, e.clientY);
      if (hit && hit === downCard && onTileClick) onTileClick(hit.userData.nft);
    }
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => { if (dragging) dragging = false; });

  const clock = new THREE.Clock();
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
