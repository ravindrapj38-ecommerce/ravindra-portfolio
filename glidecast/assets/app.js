// Glidecast recorder/editor. Everything runs locally in the browser:
//   record (getDisplayMedia + MediaRecorder) → detect activity (frame diffing)
//   → zoom segments → composite on <canvas> → export (captureStream + MediaRecorder).
(() => {
  'use strict';

  const CFG = window.APP_CONFIG;
  const License = window.License;
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, p) => a + (b - a) * p;
  const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const fmt = (t) => { t = Math.max(0, t || 0); return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`; };
  let uidN = 0;
  const uid = () => `z${++uidN}`;

  // ── Backgrounds ───────────────────────────────────────────────
  // base: linear gradient [from, to] at `angle` (CSS degrees); blobs: [color, x, y, radius] soft glows.
  const BACKGROUNDS = [
    { id: 'aurora',   base: ['#1e1b4b', '#4c1d95'], angle: 135, blobs: [['#a78bfa', 0.15, 0.2, 0.6], ['#22d3ee', 0.9, 0.85, 0.55]] },
    { id: 'ocean',    base: ['#0c4a6e', '#1e3a8a'], angle: 160, blobs: [['#38bdf8', 0.2, 0.9, 0.6], ['#818cf8', 0.85, 0.1, 0.5]] },
    { id: 'graphite', base: ['#18181b', '#27272a'], angle: 180, blobs: [['#52525b', 0.5, 0.0, 0.7]] },
    { id: 'cloud',    base: ['#e0e7ff', '#f5f3ff'], angle: 135, blobs: [['#c4b5fd', 0.1, 0.9, 0.6], ['#a5f3fc', 0.9, 0.1, 0.5]] },
    { id: 'sunset',   base: ['#7c2d12', '#9d174d'], angle: 135, blobs: [['#fb923c', 0.15, 0.15, 0.6], ['#f472b6', 0.9, 0.9, 0.55]], pro: true },
    { id: 'mint',     base: ['#064e3b', '#134e4a'], angle: 140, blobs: [['#34d399', 0.1, 0.1, 0.55], ['#5eead4', 0.9, 0.95, 0.5]], pro: true },
    { id: 'midnight', base: ['#020617', '#0f172a'], angle: 180, blobs: [['#6366f1', 0.5, 1.05, 0.7]], pro: true },
    { id: 'peach',    base: ['#fed7aa', '#fecdd3'], angle: 135, blobs: [['#fdba74', 0.1, 0.1, 0.6], ['#f9a8d4', 0.95, 0.9, 0.55]], pro: true },
    { id: 'lilac',    base: ['#ede9fe', '#fae8ff'], angle: 120, blobs: [['#c084fc', 0.85, 0.15, 0.6], ['#93c5fd', 0.1, 0.9, 0.6]], pro: true },
    { id: 'forest',   base: ['#14532d', '#1c1917'], angle: 160, blobs: [['#4ade80', 0.1, 0.0, 0.55]], pro: true },
    { id: 'rose',     base: ['#4c0519', '#1e1b4b'], angle: 135, blobs: [['#fb7185', 0.15, 0.15, 0.6], ['#a78bfa', 0.9, 0.9, 0.55]], pro: true },
    { id: 'paper',    base: ['#f4f4f5', '#e4e4e7'], angle: 180, blobs: [], pro: true },
  ];

  const ASPECTS = { '16:9': [16, 9], '9:16': [9, 16], '1:1': [1, 1], '4:3': [4, 3] };
  const T_TRANS = 0.75; // seconds for a zoom in/out/pan transition
  const SETTINGS_KEY = 'glidecast.settings';
  const DEFAULTS = { bg: 'aurora', padding: 0.07, radius: 16, shadow: true, aspect: '16:9', zoom: 1.8, sensitivity: 'medium', quality: '720', mic: true, sysAudio: false };

  const loadSettings = () => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; } };
  const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch { /* ignore */ } };

  const state = {
    url: null,
    duration: 0,
    samples: [],
    segments: [],
    selected: null,
    trimStart: 0,
    trimEnd: 0,
    settings: { ...DEFAULTS, ...loadSettings() },
    customBg: null,
    exportUrl: null,
    exportBlob: null,
    exportName: '',
  };

  const els = {
    views: { start: $('#view-start'), recording: $('#view-recording'), editor: $('#view-editor') },
    video: $('#video'),
    anaVideo: $('#ana-video'),
    preview: $('#preview'),
    stage: $('#stage'),
    track: $('#tl-track'),
    segs: $('#tl-segs'),
    playhead: $('#tl-playhead'),
    trimL: $('#tl-trim-l'),
    trimR: $('#tl-trim-r'),
    time: $('#time'),
    recTime: $('#rec-time'),
    overlay: $('#overlay'),
    dlg: $('#dlg'),
    toast: $('#toast'),
  };
  const pctx = els.preview.getContext('2d');

  // ── Small UI helpers ──────────────────────────────────────────
  let toastTimer = 0;
  function toast(msg, ms = 3800) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), ms);
  }

  function show(name) {
    Object.entries(els.views).forEach(([k, el]) => { el.hidden = k !== name; });
  }

  let overlayCancel = null;
  function showOverlay(text, { progress = false, note = '', cancelLabel = '', onCancel = null } = {}) {
    $('#overlay-text').textContent = text;
    $('#overlay-bar').hidden = !progress;
    $('#overlay-fill').style.width = '0%';
    $('#overlay-note').textContent = note;
    const btn = $('#overlay-cancel');
    btn.hidden = !onCancel;
    btn.textContent = cancelLabel || 'Cancel';
    overlayCancel = onCancel;
    els.overlay.hidden = false;
  }
  const setOverlayText = (t) => { $('#overlay-text').textContent = t; };
  const setOverlayProgress = (p) => { $('#overlay-fill').style.width = `${clamp(p, 0, 1) * 100}%`; };
  const hideOverlay = () => { els.overlay.hidden = true; overlayCancel = null; };
  $('#overlay-cancel').addEventListener('click', () => overlayCancel && overlayCancel());

  function waitEvent(el, ev, timeout = 8000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { cleanup(); reject(new Error(`timeout waiting for ${ev}`)); }, timeout);
      const ok = () => { cleanup(); resolve(); };
      const bad = () => { cleanup(); reject(new Error('media error')); };
      function cleanup() { clearTimeout(t); el.removeEventListener(ev, ok); el.removeEventListener('error', bad); }
      el.addEventListener(ev, ok, { once: true });
      el.addEventListener('error', bad, { once: true });
    });
  }

  const waitVisible = () => new Promise((resolve) => {
    if (!document.hidden) return resolve();
    const on = () => { if (!document.hidden) { document.removeEventListener('visibilitychange', on); resolve(); } };
    document.addEventListener('visibilitychange', on);
  });

  function pickMime(list) {
    if (!window.MediaRecorder) return '';
    return list.find((m) => MediaRecorder.isTypeSupported(m)) || '';
  }

  // MediaRecorder WebM files have no duration header; seeking far forces the browser to compute it.
  function fixDuration(v) {
    return new Promise((resolve) => {
      if (Number.isFinite(v.duration) && v.duration > 0) return resolve(v.duration);
      const done = () => {
        clearTimeout(timer);
        v.removeEventListener('timeupdate', onUpdate);
        const d = v.duration;
        v.currentTime = 0;
        resolve(Number.isFinite(d) ? d : NaN);
      };
      const onUpdate = () => { if (Number.isFinite(v.duration)) done(); };
      const timer = setTimeout(done, 4000);
      v.addEventListener('timeupdate', onUpdate);
      v.currentTime = 1e101;
    });
  }

  // ── Plan gating ───────────────────────────────────────────────
  const isPro = () => License.isPro();
  const bgById = (id) => BACKGROUNDS.find((b) => b.id === id);

  function sanitizeForPlan() {
    const s = state.settings;
    if (!isPro()) {
      const bg = bgById(s.bg);
      if (s.bg === 'custom' || !bg || bg.pro) s.bg = 'aurora';
      if (s.quality !== '720') s.quality = '720';
    }
    if (s.bg === 'custom' && !state.customBg) s.bg = 'aurora';
    if (!ASPECTS[s.aspect]) s.aspect = '16:9';
  }

  function refreshPlanUI() {
    const pro = isPro();
    sanitizeForPlan();
    const badge = $('#plan-badge');
    badge.textContent = pro ? 'Pro' : 'Free';
    badge.classList.toggle('pro', pro);
    $('#btn-upgrade').hidden = pro;
    $('#free-note').textContent = pro
      ? 'Pro: unlimited length, HD export, no watermark.'
      : `Free plan: recordings up to ${Math.round(CFG.free.maxSeconds / 60)} minutes, 720p export with a small watermark.`;
    $('#wm-note').textContent = pro ? '' : 'Free exports include a small watermark. Upgrade to remove it.';
    [...$('#set-quality').options].forEach((o) => {
      o.textContent = o.textContent.replace(' · Pro', '') + (o.value !== '720' && !pro ? ' · Pro' : '');
    });
    renderSwatches();
    syncControls();
    renderLicense();
  }

  // ── Background rendering (cached) ─────────────────────────────
  let noiseCanvas = null;
  function noise() {
    if (noiseCanvas) return noiseCanvas;
    noiseCanvas = document.createElement('canvas');
    noiseCanvas.width = noiseCanvas.height = 160;
    const c = noiseCanvas.getContext('2d');
    const img = c.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    return noiseCanvas;
  }

  const hexA = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };

  function paintBackground(ctx, W, H, bgId) {
    if (bgId === 'custom' && state.customBg) {
      const img = state.customBg;
      const r = Math.max(W / img.width, H / img.height);
      const w = img.width * r;
      const h = img.height * r;
      ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      return;
    }
    const bg = bgById(bgId) || BACKGROUNDS[0];
    const rad = ((bg.angle - 90) * Math.PI) / 180;
    const len = (Math.abs(W * Math.cos(rad)) + Math.abs(H * Math.sin(rad))) / 2;
    const g = ctx.createLinearGradient(W / 2 - Math.cos(rad) * len, H / 2 - Math.sin(rad) * len, W / 2 + Math.cos(rad) * len, H / 2 + Math.sin(rad) * len);
    g.addColorStop(0, bg.base[0]);
    g.addColorStop(1, bg.base[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    bg.blobs.forEach(([color, x, y, r]) => {
      const R = r * Math.max(W, H);
      const rg = ctx.createRadialGradient(x * W, y * H, 0, x * W, y * H, R);
      rg.addColorStop(0, hexA(color, 0.6));
      rg.addColorStop(1, hexA(color, 0));
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
    });
    // Subtle film grain keeps gradients from banding.
    ctx.save();
    ctx.globalAlpha = 0.035;
    ctx.fillStyle = ctx.createPattern(noise(), 'repeat');
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  const bgCache = new Map();
  let customBgVersion = 0;
  function getBackground(W, H) {
    const key = `${state.settings.bg}|${W}x${H}|${customBgVersion}`;
    let c = bgCache.get(key);
    if (!c) {
      if (bgCache.size > 6) bgCache.clear();
      c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      paintBackground(c.getContext('2d'), W, H, state.settings.bg);
      bgCache.set(key, c);
    }
    return c;
  }

  // ── Camera (zoom) timeline ────────────────────────────────────
  let keyframes = [{ t: 0, c: { s: 1, x: 0.5, y: 0.5 } }];

  function buildKeyframes() {
    const base = { s: 1, x: 0.5, y: 0.5 };
    const segs = state.segments;
    const kf = [{ t: 0, c: base }];
    segs.forEach((g, i) => {
      const c = { s: g.zoom, x: g.cx, y: g.cy };
      const last = kf[kf.length - 1];
      const startT = Math.max(g.start, last.t);
      if (startT > last.t) kf.push({ t: startT, c: last.c });
      kf.push({ t: Math.max(startT + 0.01, Math.min(startT + T_TRANS, g.end)), c });
      const next = segs[i + 1];
      if (next && next.start - g.end < T_TRANS) return; // hold, then pan straight to the next zoom
      const endT = Math.max(g.end, kf[kf.length - 1].t);
      kf.push({ t: endT, c });
      kf.push({ t: endT + T_TRANS, c: base });
    });
    keyframes = kf;
  }

  function cameraAt(t) {
    const kf = keyframes;
    if (t <= kf[0].t) return kf[0].c;
    for (let i = 0; i < kf.length - 1; i++) {
      const a = kf[i];
      const b = kf[i + 1];
      if (t <= b.t) {
        const span = b.t - a.t;
        const p = span <= 0 ? 1 : ease((t - a.t) / span);
        return {
          s: Math.exp(lerp(Math.log(a.c.s), Math.log(b.c.s), p)),
          x: lerp(a.c.x, b.c.x, p),
          y: lerp(a.c.y, b.c.y, p),
        };
      }
    }
    return kf[kf.length - 1].c;
  }

  // ── Compositing ───────────────────────────────────────────────
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function layout(W, H, vw, vh) {
    const pad = state.settings.padding * Math.min(W, H);
    const r = Math.min((W - 2 * pad) / vw, (H - 2 * pad) / vh);
    const w = vw * r;
    const h = vh * r;
    return { x: (W - w) / 2, y: (H - h) / 2, w, h };
  }

  let lastPreviewXform = null;

  function drawFrame(ctx, W, H, t, preview) {
    const v = els.video;
    const s = state.settings;
    const k = Math.min(W, H) / 1080;
    const L = layout(W, H, v.videoWidth || 16, v.videoHeight || 9);
    const cam = cameraAt(t);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(getBackground(W, H), 0, 0);

    const hw = W / (2 * cam.s);
    const hh = H / (2 * cam.s);
    const px = clamp(L.x + cam.x * L.w, hw, W - hw);
    const py = clamp(L.y + cam.y * L.h, hh, H - hh);
    ctx.translate(W / 2, H / 2);
    ctx.scale(cam.s, cam.s);
    ctx.translate(-px, -py);
    if (preview) lastPreviewXform = { s: cam.s, px, py, L, W, H };

    const rad = s.radius * k;
    if (s.shadow) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 70 * k;
      ctx.shadowOffsetY = 24 * k;
      roundRect(ctx, L.x, L.y, L.w, L.h, rad);
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    roundRect(ctx, L.x, L.y, L.w, L.h, rad);
    ctx.clip();
    if (v.readyState >= 2) ctx.drawImage(v, L.x, L.y, L.w, L.h);
    else { ctx.fillStyle = '#111'; ctx.fillRect(L.x, L.y, L.w, L.h); }
    ctx.restore();
    roundRect(ctx, L.x, L.y, L.w, L.h, rad);
    ctx.lineWidth = 1.5 * k;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.stroke();

    // Focus marker for the zoom being edited (preview only).
    const g = state.selected;
    if (preview && g) {
      const fx = L.x + g.cx * L.w;
      const fy = L.y + g.cy * L.h;
      const r = (26 * k) / cam.s;
      ctx.beginPath();
      ctx.arc(fx, fy, r, 0, Math.PI * 2);
      ctx.lineWidth = (3 * k) / cam.s;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(fx, fy, r * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = '#a78bfa';
      ctx.fill();
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!isPro()) drawWatermark(ctx, W, H, k);
  }

  function drawWatermark(ctx, W, H, k) {
    const text = `Made with ${CFG.name}`;
    ctx.font = `600 ${Math.round(22 * k)}px Inter, system-ui, sans-serif`;
    const tw = ctx.measureText(text).width;
    const ph = 44 * k;
    const pw = tw + 40 * k;
    const x = W - pw - 28 * k;
    const y = H - ph - 28 * k;
    roundRect(ctx, x, y, pw, ph, ph / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 20 * k, y + ph / 2 + 1);
  }

  function outputSize(q) {
    const [a, b] = ASPECTS[state.settings.aspect];
    const short = Number(q);
    const even = (n) => Math.round(n / 2) * 2;
    return a >= b ? { W: even((short * a) / b), H: short } : { W: short, H: even((short * b) / a) };
  }

  function resizePreview() {
    const { W, H } = outputSize(720);
    if (els.preview.width !== W || els.preview.height !== H) {
      els.preview.width = W;
      els.preview.height = H;
    }
  }

  // ── Activity detection (auto-zoom) ────────────────────────────
  function createAnalyzer() {
    const w = 320;
    const h = 180;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    let prev = null;
    return {
      sample(src) {
        ctx.drawImage(src, 0, 0, w, h);
        const d = ctx.getImageData(0, 0, w, h).data;
        const l = new Uint8Array(w * h);
        for (let i = 0, j = 0; i < l.length; i++, j += 4) l[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
        if (!prev) { prev = l; return null; }
        let n = 0; let sx = 0; let sy = 0; let x0 = w; let y0 = h; let x1 = -1; let y1 = -1;
        for (let y = 0; y < h; y++) {
          const row = y * w;
          for (let x = 0; x < w; x++) {
            const i = row + x;
            if (Math.abs(l[i] - prev[i]) > 28) {
              n++; sx += x; sy += y;
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
              if (y < y0) y0 = y;
              if (y > y1) y1 = y;
            }
          }
        }
        prev = l;
        if (!n) return { n: 0, frac: 0, bw: 0, bh: 0, cx: 0.5, cy: 0.5 };
        return { n, frac: n / (w * h), bw: (x1 - x0 + 1) / w, bh: (y1 - y0 + 1) / h, cx: (sx / n + 0.5) / w, cy: (sy / n + 0.5) / h };
      },
    };
  }

  function classify(s, sensitivity) {
    const minPx = { low: 24, medium: 10, high: 5 }[sensitivity] || 10;
    if (s.n < minPx) return 'idle';
    const box = s.bw * s.bh;
    if (s.frac > 0.15 || (box > 0.45 && s.frac > 0.04)) return 'scene'; // scroll, page change
    if (box > 0.18) return 'travel'; // scattered changes (e.g. cursor flying across)
    return 'focus';
  }

  function buildSegments(samples, duration, zoom, sensitivity) {
    const R = 0.22;   // max drift (normalized) within one zoom
    const GAP = 1.2;  // idle seconds that end a zoom
    const segs = [];
    let cur = null;
    const median = (arr) => { const a = [...arr].sort((x, y) => x - y); return a[a.length >> 1]; };
    // Robust aim: weighted mean of the points near the median, so a stray sample can't drag the zoom.
    const aim = (pts) => {
      const mx = median(pts.map((p) => p.x));
      const my = median(pts.map((p) => p.y));
      let sx = 0; let sy = 0; let sw = 0;
      pts.forEach((p) => { if (Math.hypot(p.x - mx, p.y - my) <= 0.1) { sx += p.x * p.w; sy += p.y * p.w; sw += p.w; } });
      return sw ? { cx: sx / sw, cy: sy / sw } : { cx: mx, cy: my };
    };
    const close = () => {
      if (cur && (cur.pts.length >= 2 || cur.px >= 30)) {
        const start = Math.max(0, cur.t0 - 0.35);
        let end = Math.min(duration, cur.t1 + 0.9);
        if (end - start < 1.6) end = Math.min(duration, start + 1.6);
        segs.push({ id: uid(), start, end, zoom, ...aim(cur.pts), auto: true });
      }
      cur = null;
    };
    for (const s of samples) {
      const kind = classify(s, sensitivity);
      if (kind === 'focus') {
        if (cur && (Math.hypot(s.cx - cur.sx / cur.w, s.cy - cur.sy / cur.w) > R || s.t - cur.t1 > GAP)) close();
        if (!cur) cur = { t0: s.t, t1: s.t, sx: 0, sy: 0, w: 0, px: 0, pts: [] };
        // Tight, localized changes (a click, a menu) say more about focus than a cursor sweeping past.
        const w = 1 / (s.bw * s.bh + 0.002);
        cur.t1 = s.t; cur.sx += s.cx * w; cur.sy += s.cy * w; cur.w += w; cur.px += s.n;
        cur.pts.push({ x: s.cx, y: s.cy, w });
      } else if (kind === 'scene') {
        close();
      } else if (cur && s.t - cur.t1 > GAP) {
        close();
      }
    }
    close();

    const out = [];
    for (const g of segs) {
      const p = out[out.length - 1];
      if (p && g.start - p.end < 1.0 && Math.hypot(g.cx - p.cx, g.cy - p.cy) < R) {
        p.end = Math.max(p.end, g.end);
        p.cx = (p.cx + g.cx) / 2;
        p.cy = (p.cy + g.cy) / 2;
        continue;
      }
      if (p && g.start < p.end) p.end = g.start;
      out.push(g);
    }
    return out.filter((g) => g.end - g.start >= 1.0);
  }

  function normalizeSegments() {
    const d = state.duration;
    state.segments.forEach((g) => { g.start = clamp(g.start, 0, d); g.end = clamp(g.end, 0, d); });
    state.segments.sort((a, b) => a.start - b.start);
    for (let i = 1; i < state.segments.length; i++) {
      const p = state.segments[i - 1];
      const g = state.segments[i];
      if (g.start < p.end) p.end = g.start;
    }
    state.segments = state.segments.filter((g) => g.end - g.start >= 0.2);
    if (state.selected && !state.segments.includes(state.selected)) state.selected = null;
  }

  function segmentsChanged() {
    buildKeyframes();
    renderTimeline();
    updateSegPanel();
  }

  function rebuildAutoZooms() {
    const s = state.settings;
    const manual = state.segments.filter((g) => !g.auto);
    const autos = buildSegments(state.samples, state.duration, s.zoom, s.sensitivity)
      .filter((a) => !manual.some((m) => a.start < m.end && a.end > m.start));
    state.segments = [...manual, ...autos];
    state.selected = null;
    normalizeSegments();
    segmentsChanged();
    return autos.length;
  }

  let analysisCancelled = false;
  async function analyze() {
    analysisCancelled = false;
    showOverlay('Finding the moments to zoom into…', {
      progress: true,
      cancelLabel: 'Skip',
      onCancel: () => { analysisCancelled = true; },
    });
    if (document.hidden) {
      setOverlayText('Come back to this tab to continue…');
      await waitVisible();
      setOverlayText('Finding the moments to zoom into…');
    }
    const v = els.anaVideo;
    const samples = [];
    try {
      v.src = state.url;
      await waitEvent(v, 'loadedmetadata');
      await fixDuration(v);
      if (v.currentTime !== 0) { v.currentTime = 0; await waitEvent(v, 'seeked', 4000).catch(() => {}); }
      const dur = state.duration;
      v.playbackRate = dur > 90 ? 8 : 4;
      await v.play();
      const an = createAnalyzer();
      await new Promise((resolve) => {
        let last = -1;
        const onVis = () => { if (document.hidden) v.pause(); else v.play().catch(() => {}); };
        document.addEventListener('visibilitychange', onVis);
        const done = () => { document.removeEventListener('visibilitychange', onVis); v.pause(); resolve(); };
        const step = () => {
          if (analysisCancelled) return done();
          const t = v.currentTime;
          if (t - last >= 0.2 && v.readyState >= 2) {
            last = t;
            const s = an.sample(v);
            if (s) samples.push({ t, ...s });
            setOverlayProgress(t / dur);
          }
          if (v.ended || t >= dur - 0.05) return done();
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    } catch (e) {
      console.warn('Analysis failed', e);
    }
    v.removeAttribute('src');
    v.load();
    state.samples = samples;
    const n = rebuildAutoZooms();
    hideOverlay();
    if (analysisCancelled) toast('Auto-zoom skipped. Add zooms with “+ Add zoom”.');
    else toast(n ? `Added ${n} auto-zoom${n > 1 ? 's' : ''}. Press play to preview.` : 'No clear focus moments found. Add zooms with “+ Add zoom”.');
  }

  // ── Recording ─────────────────────────────────────────────────
  let rec = null;

  async function startRecording() {
    const s = state.settings;
    let display;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 60 }, cursor: 'always' },
        audio: s.sysAudio,
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
        systemAudio: s.sysAudio ? 'include' : 'exclude',
      });
    } catch {
      toast('Screen sharing was cancelled.');
      return;
    }

    let mic = null;
    if (s.mic) {
      try { mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
      catch { toast('Microphone unavailable, so recording without voice.'); }
    }

    const sources = [display, mic].filter((m) => m && m.getAudioTracks().length);
    let audioCtx = null;
    let audioTracks = [];
    if (sources.length === 1) {
      audioTracks = sources[0].getAudioTracks();
    } else if (sources.length > 1) {
      audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();
      sources.forEach((m) => audioCtx.createMediaStreamSource(m).connect(dest));
      audioTracks = dest.stream.getAudioTracks();
    }

    const stopAll = () => {
      [display, mic].forEach((m) => m && m.getTracks().forEach((t) => t.stop()));
      if (audioCtx) audioCtx.close().catch(() => {});
    };

    const stream = new MediaStream([...display.getVideoTracks(), ...audioTracks]);
    const mime = pickMime(['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']);
    let mr;
    try {
      mr = new MediaRecorder(stream, { ...(mime && { mimeType: mime }), videoBitsPerSecond: 12e6 });
    } catch (e) {
      stopAll();
      toast(`Could not start the recorder: ${e.message}`);
      return;
    }

    const chunks = [];
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = async () => {
      const r = rec;
      rec = null;
      clearInterval(r.timer);
      stopAll();
      const elapsed = (performance.now() - r.t0) / 1000;
      const blob = new Blob(chunks, { type: mr.mimeType || mime || 'video/webm' });
      if (!blob.size) {
        show('start');
        toast('Nothing was recorded.');
        return;
      }
      await loadMedia(blob, elapsed);
    };
    display.getVideoTracks()[0].addEventListener('ended', stopRecording);

    const limit = isPro() ? Infinity : CFG.free.maxSeconds;
    rec = { mr, t0: performance.now(), timer: 0 };
    mr.start(1000);
    els.recTime.textContent = '0:00';
    $('#rec-limit').textContent = Number.isFinite(limit) ? `Free plan: stops automatically at ${fmt(limit)}.` : '';
    show('recording');
    rec.timer = setInterval(() => {
      if (!rec) return;
      const t = (performance.now() - rec.t0) / 1000;
      els.recTime.textContent = fmt(t);
      if (t >= limit) {
        stopRecording();
        toast(`Free recordings stop at ${fmt(limit)}. Upgrade to Pro for unlimited length.`, 6000);
      }
    }, 250);
  }

  function stopRecording() {
    if (rec && rec.mr.state !== 'inactive') rec.mr.stop();
  }

  // ── Loading media into the editor ─────────────────────────────
  async function loadMedia(blob, knownDuration) {
    showOverlay('Loading video…');
    if (state.url) URL.revokeObjectURL(state.url);
    state.url = URL.createObjectURL(blob);
    const v = els.video;
    v.src = state.url;
    try {
      await waitEvent(v, 'loadedmetadata', 15000);
    } catch {
      hideOverlay();
      show('start');
      toast('This video format is not supported by your browser.');
      return;
    }
    let d = await fixDuration(v);
    if (!Number.isFinite(d) || d <= 0) d = knownDuration || 0;
    if (!d) {
      hideOverlay();
      show('start');
      toast('Could not read the video length.');
      return;
    }
    state.duration = d;
    state.trimStart = 0;
    state.trimEnd = d;
    state.segments = [];
    state.samples = [];
    state.selected = null;
    clearExport();
    show('editor');
    resizePreview();
    segmentsChanged();
    await analyze();
  }

  function importFile(file) {
    if (!file) return;
    if (!file.type.startsWith('video/') && !/\.(webm|mp4|mov|m4v|mkv)$/i.test(file.name)) {
      toast('Please choose a video file.');
      return;
    }
    loadMedia(file, 0);
  }

  // ── Playback ──────────────────────────────────────────────────
  let audio = null;
  function ensureAudio() {
    if (audio) { audio.ctx.resume().catch(() => {}); return audio; }
    try {
      const ctx = new AudioContext();
      const src = ctx.createMediaElementSource(els.video);
      const monitor = ctx.createGain();
      const dest = ctx.createMediaStreamDestination();
      src.connect(monitor).connect(ctx.destination);
      src.connect(dest);
      audio = { ctx, monitor, dest };
    } catch (e) {
      console.warn('Audio graph unavailable', e);
      audio = null;
    }
    return audio;
  }

  function togglePlay() {
    if (exporting) return;
    ensureAudio();
    const v = els.video;
    if (v.paused) {
      if (v.currentTime < state.trimStart || v.currentTime >= state.trimEnd - 0.05) v.currentTime = state.trimStart;
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }

  function seek(t) {
    els.video.currentTime = clamp(t, 0, state.duration);
  }

  els.video.addEventListener('play', () => { $('#ic-play').hidden = true; $('#ic-pause').hidden = false; });
  els.video.addEventListener('pause', () => { $('#ic-play').hidden = false; $('#ic-pause').hidden = true; });

  function frameLoop() {
    if (!els.views.editor.hidden) {
      const v = els.video;
      if (!v.paused && !exporting && v.currentTime >= state.trimEnd) v.pause();
      drawFrame(pctx, els.preview.width, els.preview.height, v.currentTime, true);
      const d = state.duration || 1;
      els.playhead.style.left = `${(v.currentTime / d) * 100}%`;
      els.time.textContent = `${fmt(v.currentTime)} / ${fmt(state.duration)}`;
    }
    requestAnimationFrame(frameLoop);
  }

  // ── Timeline ──────────────────────────────────────────────────
  const pct = (t) => (t / (state.duration || 1)) * 100;

  function renderTimeline() {
    els.segs.innerHTML = state.segments.map((g) => `
      <div class="tl-seg${g === state.selected ? ' sel' : ''}" data-id="${g.id}" style="left:${pct(g.start)}%;width:${pct(g.end - g.start)}%">
        <span class="h l"></span><span class="lbl">${g.zoom.toFixed(1)}×</span><span class="h r"></span>
      </div>`).join('');
    els.trimL.style.width = `${pct(state.trimStart)}%`;
    els.trimR.style.width = `${100 - pct(state.trimEnd)}%`;
  }

  function select(g, { seekTo = true } = {}) {
    state.selected = g;
    if (g && seekTo) {
      els.video.pause();
      seek(Math.min(g.start + T_TRANS + 0.05, (g.start + g.end) / 2));
    }
    els.stage.classList.toggle('aiming', !!g);
    renderTimeline();
    updateSegPanel();
  }

  function updateSegPanel() {
    const g = state.selected;
    $('#seg-panel').hidden = !g;
    els.stage.classList.toggle('aiming', !!g);
    if (!g) return;
    $('#seg-range').textContent = `${g.start.toFixed(1)}s to ${g.end.toFixed(1)}s`;
    $('#seg-zoom').value = g.zoom;
    $('#seg-zoom-val').textContent = `${g.zoom.toFixed(1)}×`;
  }

  let drag = null;
  els.track.addEventListener('pointerdown', (e) => {
    if (!state.duration || exporting) return;
    const rect = els.track.getBoundingClientRect();
    const segEl = e.target.closest('.tl-seg');
    els.track.setPointerCapture(e.pointerId);
    if (!segEl) {
      select(null, { seekTo: false });
      drag = { mode: 'scrub', rect };
      seek(((e.clientX - rect.left) / rect.width) * state.duration);
      return;
    }
    const g = state.segments.find((x) => x.id === segEl.dataset.id);
    if (!g) return;
    const i = state.segments.indexOf(g);
    const mode = e.target.classList.contains('l') ? 'l' : e.target.classList.contains('r') ? 'r' : 'move';
    drag = {
      mode, g, rect, x0: e.clientX, start: g.start, end: g.end, moved: false,
      min: i > 0 ? state.segments[i - 1].end : 0,
      max: i < state.segments.length - 1 ? state.segments[i + 1].start : state.duration,
    };
    select(g, { seekTo: false });
  });

  els.track.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (drag.mode === 'scrub') {
      seek(((e.clientX - drag.rect.left) / drag.rect.width) * state.duration);
      return;
    }
    const dt = ((e.clientX - drag.x0) / drag.rect.width) * state.duration;
    if (Math.abs(e.clientX - drag.x0) > 3) drag.moved = true;
    const { g } = drag;
    const MIN = 0.4;
    if (drag.mode === 'l') g.start = clamp(drag.start + dt, drag.min, g.end - MIN);
    else if (drag.mode === 'r') g.end = clamp(drag.end + dt, g.start + MIN, drag.max);
    else {
      const len = drag.end - drag.start;
      g.start = clamp(drag.start + dt, drag.min, drag.max - len);
      g.end = g.start + len;
    }
    g.auto = false;
    buildKeyframes();
    renderTimeline();
    updateSegPanel();
  });

  const endDrag = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.g) {
      if (!d.moved) select(d.g);
      else seek(d.mode === 'r' ? d.g.end - 0.05 : Math.min(d.g.start + T_TRANS + 0.05, (d.g.start + d.g.end) / 2));
      normalizeSegments();
      segmentsChanged();
    }
  };
  els.track.addEventListener('pointerup', endDrag);
  els.track.addEventListener('pointercancel', endDrag);

  function nearestFocus(t) {
    let best = null;
    for (const s of state.samples) {
      if (Math.abs(s.t - t) > 1.5 || classify(s, 'high') !== 'focus') continue;
      if (!best || Math.abs(s.t - t) < Math.abs(best.t - t)) best = s;
    }
    return best;
  }

  function addZoom() {
    if (!state.duration) return;
    const t = els.video.currentTime;
    const inside = state.segments.find((g) => t >= g.start && t < g.end);
    if (inside) { select(inside); toast('There’s already a zoom here, so it’s now selected.'); return; }
    const next = state.segments.find((g) => g.start > t);
    const end = Math.min(state.duration, t + 2.5, next ? next.start : Infinity);
    if (end - t < 0.5) { toast('Not enough room here. Move the playhead to a free spot.'); return; }
    const near = nearestFocus(t);
    const g = { id: uid(), start: t, end, zoom: state.settings.zoom, cx: near ? near.cx : 0.5, cy: near ? near.cy : 0.5, auto: false };
    state.segments.push(g);
    normalizeSegments();
    buildKeyframes();
    select(g);
    toast('Zoom added. Click the preview to aim it.');
  }

  function deleteSelected() {
    const g = state.selected;
    if (!g) return;
    state.segments = state.segments.filter((x) => x !== g);
    state.selected = null;
    segmentsChanged();
  }

  els.preview.addEventListener('click', (e) => {
    const g = state.selected;
    const x = lastPreviewXform;
    if (!g || !x) { togglePlay(); return; }
    const r = els.preview.getBoundingClientRect();
    const X = ((e.clientX - r.left) / r.width) * x.W;
    const Y = ((e.clientY - r.top) / r.height) * x.H;
    const compX = (X - x.W / 2) / x.s + x.px;
    const compY = (Y - x.H / 2) / x.s + x.py;
    g.cx = clamp((compX - x.L.x) / x.L.w, 0, 1);
    g.cy = clamp((compY - x.L.y) / x.L.h, 0, 1);
    g.auto = false;
    segmentsChanged();
  });

  // ── Export ────────────────────────────────────────────────────
  let exporting = false;

  function clearExport() {
    if (state.exportUrl) URL.revokeObjectURL(state.exportUrl);
    state.exportUrl = null;
    state.exportBlob = null;
    $('#result').hidden = true;
  }

  async function startExport() {
    if (exporting || !state.duration) return;
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
      toast('Exporting is not supported in this browser. Please use Chrome, Edge or Firefox.');
      return;
    }
    const pro = isPro();
    const len = state.trimEnd - state.trimStart;
    if (!pro && len > CFG.free.maxSeconds + 0.5) {
      openUpgrade(`Free exports are limited to ${fmt(CFG.free.maxSeconds)}. Trim the video or upgrade to Pro for unlimited length.`);
      return;
    }
    const { W, H } = outputSize(pro ? state.settings.quality : '720');
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const a = ensureAudio();
    const vtrack = canvas.captureStream(30).getVideoTracks()[0];
    const tracks = [vtrack, ...(a ? a.dest.stream.getAudioTracks() : [])];
    const mime = pickMime([
      'video/mp4;codecs=avc1.640028,mp4a.40.2',
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4', // Safari
    ]);
    let mr;
    try {
      mr = new MediaRecorder(new MediaStream(tracks), { ...(mime && { mimeType: mime }), videoBitsPerSecond: Math.round(W * H * 30 * 0.14) });
    } catch (e) {
      vtrack.stop();
      toast(`Export failed to start: ${e.message}`);
      return;
    }

    exporting = true;
    clearExport();
    select(null, { seekTo: false });
    const v = els.video;
    v.pause();
    v.currentTime = state.trimStart;
    await waitEvent(v, 'seeked', 5000).catch(() => {});
    drawFrame(ctx, W, H, v.currentTime, false);

    const chunks = [];
    let cancelled = false;
    let finished = false;
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

    const onVis = () => {
      if (finished) return;
      if (document.hidden) { v.pause(); if (mr.state === 'recording') mr.pause(); }
      else { if (mr.state === 'paused') mr.resume(); v.play().catch(() => {}); }
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      v.pause();
      document.removeEventListener('visibilitychange', onVis);
      if (mr.state !== 'inactive') mr.stop();
    };
    mr.onstop = () => {
      exporting = false;
      if (a) a.monitor.gain.value = 1;
      vtrack.stop();
      hideOverlay();
      if (cancelled) { toast('Export cancelled.'); return; }
      showResult(new Blob(chunks, { type: (mr.mimeType || mime || 'video/webm').split(';')[0] }));
    };

    showOverlay(`Rendering ${W}×${H} video…`, {
      progress: true,
      note: 'Keep this tab open and visible. Rendering runs in real time.',
      onCancel: () => { cancelled = true; finish(); },
    });
    document.addEventListener('visibilitychange', onVis);
    if (a) a.monitor.gain.value = 0; // render silently; audio still goes to the file

    mr.start(500);
    try { await v.play(); } catch (e) { cancelled = true; finish(); toast(`Playback failed: ${e.message}`); return; }
    const step = () => {
      if (finished) return;
      const t = v.currentTime;
      drawFrame(ctx, W, H, t, false);
      setOverlayProgress((t - state.trimStart) / (len || 1));
      if (t >= state.trimEnd - 0.01 || v.ended) { finish(); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function showResult(blob) {
    state.exportBlob = blob;
    state.exportUrl = URL.createObjectURL(blob);
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
    state.exportName = `${CFG.name.toLowerCase()}-${stamp}.${ext}`;
    const dl = $('#btn-download');
    dl.href = state.exportUrl;
    dl.download = state.exportName;
    $('#result-meta').textContent = `✓ Ready: ${ext.toUpperCase()} · ${(blob.size / 1048576).toFixed(1)} MB`;
    $('#result').hidden = false;
    $('#btn-share').hidden = !navigator.share;
    toast('Your video is ready!');
  }

  async function shareResult() {
    if (!state.exportBlob) return;
    const file = new File([state.exportBlob], state.exportName, { type: state.exportBlob.type });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Screen recording' });
      } else {
        toast('Your browser can’t share files directly. Download it and drop it into Slack, email, YouTube…', 5000);
      }
    } catch (e) {
      if (e.name !== 'AbortError') toast('Sharing failed. Download the file instead.');
    }
  }

  // ── Sidebar controls ──────────────────────────────────────────
  function renderSwatches() {
    const pro = isPro();
    const wrap = $('#swatches');
    wrap.innerHTML = '';
    BACKGROUNDS.forEach((bg) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `sw${state.settings.bg === bg.id ? ' on' : ''}${bg.pro && !pro ? ' locked' : ''}`;
      b.title = bg.id[0].toUpperCase() + bg.id.slice(1) + (bg.pro && !pro ? ' (Pro)' : '');
      const glow = bg.blobs[0] ? `radial-gradient(circle at ${bg.blobs[0][1] * 100}% ${bg.blobs[0][2] * 100}%, ${hexA(bg.blobs[0][0], 0.7)}, transparent 60%),` : '';
      b.style.background = `${glow} linear-gradient(${bg.angle}deg, ${bg.base[0]}, ${bg.base[1]})`;
      b.addEventListener('click', () => {
        if (bg.pro && !pro) { openUpgrade('That background is part of Pro, along with HD export and no watermark.'); return; }
        setSetting('bg', bg.id);
      });
      wrap.appendChild(b);
    });
    const up = document.createElement('label');
    up.className = `sw sw-upload${state.settings.bg === 'custom' ? ' on' : ''}${!pro ? ' locked' : ''}`;
    up.title = 'Upload your own image (Pro)';
    if (state.settings.bg === 'custom' && state.customBg) {
      up.style.background = `center/cover url(${state.customBg.src})`;
    } else {
      up.textContent = '+';
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.hidden = true;
    up.appendChild(input);
    up.addEventListener('click', (e) => {
      if (!pro) { e.preventDefault(); openUpgrade('Custom background images are part of Pro.'); }
    });
    input.addEventListener('change', () => {
      const f = input.files[0];
      if (!f) return;
      const img = new Image();
      img.onload = () => { state.customBg = img; customBgVersion++; setSetting('bg', 'custom'); };
      img.onerror = () => toast('Could not load that image.');
      img.src = URL.createObjectURL(f);
    });
    wrap.appendChild(up);
  }

  function syncControls() {
    const s = state.settings;
    $('#opt-mic').checked = s.mic;
    $('#opt-sys').checked = s.sysAudio;
    $('#set-padding').value = s.padding;
    $('#pad-val').textContent = `${Math.round(s.padding * 100)}%`;
    $('#set-radius').value = s.radius;
    $('#rad-val').textContent = `${s.radius}px`;
    $('#set-shadow').checked = s.shadow;
    $('#set-aspect').value = s.aspect;
    $('#set-zoom').value = s.zoom;
    $('#zoom-val').textContent = `${Number(s.zoom).toFixed(1)}×`;
    $('#set-sens').value = s.sensitivity;
    $('#set-quality').value = s.quality;
  }

  function setSetting(key, value) {
    state.settings[key] = value;
    if (key === 'aspect') resizePreview();
    if (key === 'bg') renderSwatches();
    saveSettings();
    syncControls();
  }

  $('#opt-mic').addEventListener('change', (e) => setSetting('mic', e.target.checked));
  $('#opt-sys').addEventListener('change', (e) => setSetting('sysAudio', e.target.checked));
  $('#set-padding').addEventListener('input', (e) => setSetting('padding', Number(e.target.value)));
  $('#set-radius').addEventListener('input', (e) => setSetting('radius', Number(e.target.value)));
  $('#set-shadow').addEventListener('change', (e) => setSetting('shadow', e.target.checked));
  $('#set-aspect').addEventListener('change', (e) => setSetting('aspect', e.target.value));
  $('#set-zoom').addEventListener('input', (e) => {
    const z = Number(e.target.value);
    setSetting('zoom', z);
    state.segments.forEach((g) => { if (g.auto) g.zoom = z; });
    segmentsChanged();
  });
  $('#set-sens').addEventListener('change', (e) => {
    setSetting('sensitivity', e.target.value);
    if (state.samples.length) {
      const n = rebuildAutoZooms();
      toast(`${n} auto-zoom${n === 1 ? '' : 's'} detected.`);
    }
  });
  $('#set-quality').addEventListener('change', (e) => {
    if (e.target.value !== '720' && !isPro()) {
      e.target.value = '720';
      openUpgrade('1080p and 1440p exports are part of Pro.');
      return;
    }
    setSetting('quality', e.target.value);
  });

  $('#seg-zoom').addEventListener('input', (e) => {
    const g = state.selected;
    if (!g) return;
    g.zoom = Number(e.target.value);
    g.auto = false;
    segmentsChanged();
  });
  $('#seg-done').addEventListener('click', () => select(null, { seekTo: false }));
  $('#seg-delete').addEventListener('click', deleteSelected);

  $('#btn-redetect').addEventListener('click', () => {
    if (!state.url) return;
    state.segments = state.segments.filter((g) => !g.auto);
    analyze();
  });
  $('#btn-clear-zooms').addEventListener('click', () => {
    state.segments = [];
    state.selected = null;
    segmentsChanged();
  });
  $('#btn-add-zoom').addEventListener('click', addZoom);
  $('#btn-play').addEventListener('click', togglePlay);
  $('#btn-trim-in').addEventListener('click', () => {
    state.trimStart = clamp(els.video.currentTime, 0, state.trimEnd - 0.5);
    renderTimeline();
  });
  $('#btn-trim-out').addEventListener('click', () => {
    state.trimEnd = clamp(els.video.currentTime, state.trimStart + 0.5, state.duration);
    renderTimeline();
  });
  $('#btn-export').addEventListener('click', startExport);
  $('#btn-share').addEventListener('click', shareResult);
  $('#btn-new').addEventListener('click', () => {
    if (exporting) return;
    els.video.pause();
    show('start');
  });

  $('#btn-record').addEventListener('click', startRecording);
  $('#btn-stop').addEventListener('click', stopRecording);
  $('#file-input').addEventListener('change', (e) => { importFile(e.target.files[0]); e.target.value = ''; });
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (e) => { e.preventDefault(); importFile(e.dataTransfer.files[0]); });

  document.addEventListener('keydown', (e) => {
    if (els.views.editor.hidden || els.dlg.open) return;
    if (e.target.closest('input, select, textarea')) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && state.selected) { e.preventDefault(); deleteSelected(); }
    else if (e.key === 'Escape' && state.selected) select(null, { seekTo: false });
  });

  // ── Upgrade / license dialog ──────────────────────────────────
  function openUpgrade(reason) {
    $('#dlg-reason').textContent = reason || 'HD exports, no watermark, unlimited length and every background.';
    renderLicense();
    if (!els.dlg.open) els.dlg.showModal();
  }

  function renderLicense() {
    const info = License.info();
    const pro = isPro();
    $('#dlg-plans').hidden = pro;
    $('#lic-manage').hidden = !info;
    $('#lic-portal').hidden = !CFG.customerPortal;
    if (CFG.customerPortal) $('#lic-portal').href = CFG.customerPortal;
    const status = $('#lic-status');
    if (CFG.devForcePro) status.textContent = 'Developer mode: Pro is unlocked by config.';
    else if (info && info.valid) status.textContent = `✓ Pro is active${info.email ? ` for ${info.email}` : ''}.`;
    else if (info) status.textContent = `This license is ${info.status || 'inactive'}. Renew your subscription, then click Activate again.`;
    else status.textContent = 'Your key is in the receipt email after checkout.';
    if (info) $('#lic-key').value = info.key;
  }

  (() => {
    const m = CFG.pricing.monthly;
    const y = CFG.pricing.yearly;
    $('[data-p="monthly"]').textContent = `$${m}/mo`;
    $('[data-p="yearly"]').textContent = `$${y}/yr`;
    const save = Math.round((1 - y / (m * 12)) * 100);
    $('#dlg [data-save]').textContent = save > 0 ? `Save ${save}%: just $${(y / 12).toFixed(y % 12 ? 2 : 0)}/mo` : '';
    document.querySelectorAll('[data-buy]').forEach((a) => {
      const link = CFG.checkout[a.dataset.buy];
      a.href = link || '#';
      a.addEventListener('click', (e) => {
        if (!link) { e.preventDefault(); toast('Checkout isn’t configured yet. Add your Lemon Squeezy links in assets/config.js.', 5000); }
      });
    });
  })();

  $('#btn-upgrade').addEventListener('click', () => openUpgrade());
  $('#btn-license').addEventListener('click', () => openUpgrade(isPro() ? 'Thanks for supporting Glidecast!' : undefined));
  $('#lic-activate').addEventListener('click', async () => {
    const btn = $('#lic-activate');
    btn.disabled = true;
    $('#lic-status').textContent = 'Checking…';
    try {
      await License.activate($('#lic-key').value);
      toast('Pro unlocked. Enjoy!');
    } catch (e) {
      $('#lic-status').textContent = e.message;
    } finally {
      btn.disabled = false;
    }
  });
  $('#lic-deactivate').addEventListener('click', async () => {
    await License.deactivate();
    $('#lic-key').value = '';
    toast('License removed from this browser.');
  });

  License.onChange(refreshPlanUI);

  // ── Boot ──────────────────────────────────────────────────────
  document.querySelectorAll('[data-cfg="name"]').forEach((el) => { el.textContent = CFG.name; });
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    $('#btn-record').disabled = true;
    $('#btn-record').style.opacity = 0.5;
    $('#unsupported').hidden = false;
  }
  refreshPlanUI();
  resizePreview();
  buildKeyframes();
  requestAnimationFrame(frameLoop);
  License.refresh();

  // Exposed for automated tests / debugging.
  window.__glidecast = { state, loadMedia, cameraAt, buildSegments };
})();
