// Animated, cursor-responsive background.
// Soft glowing orbs that drift across the page with subtle parallax.
// Lightweight: ~1ms/frame on a mid-range laptop.

export function initBackground(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;

  let w = 0, h = 0, dpr = 1;
  let mx = 0.5, my = 0.5; // normalized cursor [0..1]
  let targetMx = 0.5, targetMy = 0.5;

  // Orb palette uses the brand accent colors
  const orbs = [
    { color: [179, 136, 255], sx: 0.18, sy: 0.22, ox: 0, oy: 0, vx: 0.00009, vy: 0.00006, r: 0.55, parallax: 0.05, alpha: 0.55 },
    { color: [94, 224, 255],  sx: 0.82, sy: 0.18, ox: 0, oy: 0, vx: -0.00008, vy: 0.00007, r: 0.50, parallax: 0.04, alpha: 0.42 },
    { color: [255, 138, 216], sx: 0.55, sy: 0.85, ox: 0, oy: 0, vx: 0.00007, vy: -0.00008, r: 0.60, parallax: 0.06, alpha: 0.48 },
    { color: [124, 92, 255],  sx: 0.30, sy: 0.70, ox: 0, oy: 0, vx: -0.0001, vy: -0.00005, r: 0.45, parallax: 0.03, alpha: 0.40 },
    { color: [255, 195, 124], sx: 0.72, sy: 0.62, ox: 0, oy: 0, vx: 0.00006, vy: 0.00009, r: 0.35, parallax: 0.04, alpha: 0.28 },
  ];

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  function onMove(x, y) {
    targetMx = x / w;
    targetMy = y / h;
  }
  window.addEventListener('pointermove', (e) => onMove(e.clientX, e.clientY), { passive: true });
  // Touch — first finger as parallax
  window.addEventListener('touchmove', (e) => {
    if (e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });

  // Subtle grain pattern (drawn once)
  const grain = makeGrain(64);

  function makeGrain(size) {
    const off = document.createElement('canvas');
    off.width = off.height = size;
    const oc = off.getContext('2d');
    const img = oc.createImageData(size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 240 + Math.random() * 15;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = Math.random() * 22;
    }
    oc.putImageData(img, 0, 0);
    return off;
  }

  // Animation loop
  let last = performance.now();
  let visible = true;
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; });

  function draw(now) {
    if (!visible) { requestAnimationFrame(draw); return; }
    const dt = Math.min(now - last, 50);
    last = now;

    // Ease cursor
    mx += (targetMx - mx) * 0.04;
    my += (targetMy - my) * 0.04;

    // Base
    ctx.fillStyle = '#06060a';
    ctx.fillRect(0, 0, w, h);

    // Orbs on top
    ctx.globalCompositeOperation = 'screen';
    orbs.forEach((o, i) => {
      // Drift
      o.ox += o.vx * dt;
      o.oy += o.vy * dt;
      // Gentle bounce so they don't wander off forever
      if (o.ox > 0.18 || o.ox < -0.18) o.vx *= -1;
      if (o.oy > 0.18 || o.oy < -0.18) o.vy *= -1;

      const wave = Math.sin(now * 0.0002 + i * 1.7) * 0.04;
      const parX = (mx - 0.5) * o.parallax;
      const parY = (my - 0.5) * o.parallax;

      const px = (o.sx + o.ox + wave + parX) * w;
      const py = (o.sy + o.oy + Math.cos(now * 0.00018 + i * 1.3) * 0.04 + parY) * h;
      const radius = o.r * Math.max(w, h);

      const [r, g, b] = o.color;
      const a = o.alpha;
      const grad = ctx.createRadialGradient(px, py, 0, px, py, radius);
      grad.addColorStop(0, `rgba(${r},${g},${b},${a})`);
      grad.addColorStop(0.35, `rgba(${r},${g},${b},${a * 0.25})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    });

    // Grain overlay (very subtle)
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.6;
    const pattern = ctx.createPattern(grain, 'repeat');
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
}
