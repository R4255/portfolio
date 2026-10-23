// Token Galaxy: one fixed canvas of particles that reshape into each section's "formation" as the page scrolls.
// Each formation writes absolute target positions + palette indices; particles spring toward a blend of the
// current and next formation. The cursor repels; holding makes a black hole; releasing explodes.

// Keep in sync with the split-layout media query in index.astro.
export const SPLIT_MQ = '(min-width: 900px) and (min-height: 480px), (min-width: 700px) and (max-height: 479px)';

const PAL = ['#8b7bff', '#3fd0ff', '#ff5ea8', '#ffd166', '#6ef0b0', '#e8e6ff', '#3a3566'];
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

export function initGalaxy() {
  const cv = document.getElementById('galaxy');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  // labels live on their own layer, cleared every frame, so they never leave trails when the page scrolls
  const lv = document.createElement('canvas'); lv.setAttribute('aria-hidden', 'true'); lv.className = 'galaxy-labels';
  cv.after(lv); const lx = lv.getContext('2d');
  const fine = matchMedia('(pointer: fine)').matches;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const splitMQ = matchMedia(SPLIT_MQ);

  /* ---------- budget: scale particle count to the device ---------- */
  let N = clamp(Math.round(innerWidth * innerHeight / 420), 1200, 3000);
  if ((navigator.hardwareConcurrency || 8) <= 4) N = Math.min(N, 1600);
  if (navigator.connection && navigator.connection.saveData) N = Math.min(N, 900);
  let active = N; // lowered at runtime if frames get slow

  const X = new Float32Array(N), Y = new Float32Array(N), VX = new Float32Array(N), VY = new Float32Array(N);
  const K = new Float32Array(N), C = new Uint8Array(N);
  for (let i = 0; i < N; i++) { X[i] = Math.random() * innerWidth; Y[i] = Math.random() * innerHeight; K[i] = .028 + Math.random() * .04; C[i] = 6; }
  const mk = () => ({ x: new Float32Array(N), y: new Float32Array(N), c: new Uint8Array(N), j: new Uint8Array(N) });
  const A = mk(), B = mk();

  let W = 0, H = 0, split = true;
  const mouse = { x: -9999, y: -9999, on: false };

  /* ---------- layout ---------- */
  // Where formations live: right of the panel on wide screens, top band on stacked (phone / portrait) screens.
  // Stacked layout: each section has its own `.stage` slot in the page flow; `box` is the slot (viewport coords)
  // of the formation being computed, so shapes scroll with their section instead of sitting under the text.
  let box = null;
  function stage(w, h) {
    if (split) {
      const g = Math.max(16, W * .05), pw = Math.min(440, W * .42), left = g + pw + 36, aw = W - left - g;
      return { cx: left + aw / 2, cy: (H + 56) / 2, s: Math.min(aw / w, (H - 120) / h, 1.3) };
    }
    const b = box || { top: 60, height: H * .46 };
    return { cx: W / 2, cy: b.top + b.height / 2, s: Math.min((W - 28) / w, (b.height - 28) / h, 1.15) };
  }
  const fontPx = s => Math.round(clamp(10 * s + 1, 9, 12));
  function label(txt, x, y, color = '#a3a0c6', align = 'center', size = 11) {
    lx.font = `${size}px "JetBrains Mono", monospace`; lx.fillStyle = color; lx.textAlign = align; lx.fillText(txt, x, y);
  }

  /* ---------- shapes ---------- */
  // Render text offscreen and pick N random filled pixels so density is even for any word.
  function sampleText(lines, boxW, boxH) {
    boxW = Math.max(40, Math.ceil(boxW)); boxH = Math.max(20, Math.ceil(boxH));
    const oc = document.createElement('canvas'); oc.width = boxW; oc.height = boxH;
    const o = oc.getContext('2d', { willReadFrequently: true });
    let fs = boxH / lines.length * .92;
    o.font = `800 ${fs}px Syne, sans-serif`;
    const mw = Math.max(...lines.map(l => o.measureText(l).width));
    if (mw > boxW * .98) fs *= boxW * .98 / mw;
    o.font = `800 ${fs}px Syne, sans-serif`; o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillStyle = '#fff';
    lines.forEach((l, i) => o.fillText(l, boxW / 2, boxH / 2 + (i - (lines.length - 1) / 2) * fs * .98));
    const d = o.getImageData(0, 0, boxW, boxH).data, filled = [];
    for (let y = 0; y < boxH; y++) for (let x = 0; x < boxW; x++) if (d[(y * boxW + x) * 4 + 3] > 140) filled.push(x, y);
    const out = { x: new Float32Array(N), y: new Float32Array(N), w: boxW }, cnt = filled.length / 2;
    for (let i = 0; i < N; i++) {
      const j = cnt ? Math.floor(Math.random() * cnt) : 0;
      out.x[i] = (cnt ? filled[2 * j] : 0) - boxW / 2 + Math.random() - .5;
      out.y[i] = (cnt ? filled[2 * j + 1] : 0) - boxH / 2 + Math.random() - .5;
    }
    return out;
  }

  const VALS = [74.4, 87.2, 87.7, 90.0, 93.1], RUNS = ['base', 'v2', 'v3', 'v4', 'v6'];
  const BW = 56, BG = 30, BX0 = -200, BASE = 140, BH = 280, bh = v => (v - 60) / 40 * BH;
  function buildBars() {
    const o = mk(), axisN = Math.floor(N * .05), hs = VALS.map(bh), sum = hs.reduce((a, b) => a + b, 0);
    let i = 0;
    for (; i < axisN; i++) { o.x[i] = -225 + Math.random() * 450; o.y[i] = BASE + 8 + Math.random() * 2.5; o.c[i] = 5; }
    for (let j = 0; j < 5; j++) {
      const n = j === 4 ? N - i : Math.round((N - axisN) * hs[j] / sum);
      for (let m = 0; m < n && i < N; m++, i++) { o.x[i] = BX0 + j * (BW + BG) + Math.random() * BW; o.y[i] = BASE - Math.random() * hs[j]; o.c[i] = j === 4 ? 3 : j % 2 ? 1 : 0; }
    }
    // shuffle so a reduced `active` count still samples every bar evenly
    for (let a = N - 1; a > 0; a--) { const b = Math.floor(Math.random() * (a + 1)); [o.x[a], o.x[b]] = [o.x[b], o.x[a]]; [o.y[a], o.y[b]] = [o.y[b], o.y[a]]; [o.c[a], o.c[b]] = [o.c[b], o.c[a]]; }
    return o;
  }

  const KC = 10, KR = 6, KB = 34, KG = 9, KPER = Math.ceil(N / (KC * KR)), KM = Math.ceil(Math.sqrt(KPER)), KSP = KB / KM;
  const KV_SN = new Float32Array(KC * KR), KV_PH = new Float32Array(KC * KR);
  const KOX = -(KC * KB + (KC - 1) * KG) / 2, KOY = -(KR * KB + (KR - 1) * KG) / 2;

  const UX = new Float32Array(N), UY = new Float32Array(N), UZ = new Float32Array(N);
  for (let i = 0; i < N; i++) { const y = 1 - 2 * (i + .5) / N, r = Math.sqrt(1 - y * y), th = i * 2.399963; UX[i] = Math.cos(th) * r; UY[i] = y; UZ[i] = Math.sin(th) * r; }

  /* consistent-hash ring state */
  const NODE_NAMES = ['node-a', 'node-b', 'node-c', 'node-d', 'node-e', 'node-f'], NODE_COL = [0, 1, 4, 3, 2, 5], VN = 10, RR = 165, ROUT = 255;
  const VNODES = [];
  for (let n = 0; n < 6; n++) for (let v = 0; v < VN; v++) VNODES.push({ a: hash(n * 131 + v * 7.7 + 3) * TAU, n });
  const RING_SHARE = .26, KEY_SHARE = .6; // remainder: node markers
  const ringEnd = Math.floor(N * RING_SHARE), keyEnd = ringEnd + Math.floor(N * KEY_SHARE);
  const baseAng = new Float32Array(N), ownN = new Uint8Array(N), ownD = new Float32Array(N);
  for (let i = 0; i < N; i++) baseAng[i] = i < ringEnd ? i / ringEnd * TAU : hash(i * 7.13 + 1) * TAU;
  let ringNodes = 4, ringMsg = '';
  function ownerOf(a, sorted) { for (const v of sorted) if (v.a >= a) return v; return sorted[0]; }
  function buildRing() {
    const sorted = VNODES.filter(v => v.n < ringNodes).sort((p, q) => p.a - q.a);
    for (let i = 0; i < keyEnd; i++) {
      const v = ownerOf(baseAng[i], sorted);
      ownN[i] = v.n; ownD[i] = ((v.a - baseAng[i]) + TAU) % TAU;
    }
    return sorted;
  }
  buildRing();
  function changeRing(delta) {
    const next = clamp(ringNodes + delta, 3, 6);
    if (next === ringNodes) return ringMsg;
    const before = Uint8Array.from(ownN.subarray(ringEnd, keyEnd)), prevN = ringNodes;
    ringNodes = next; buildRing();
    let moved = 0, modMoved = 0; const total = keyEnd - ringEnd;
    for (let i = ringEnd; i < keyEnd; i++) {
      if (ownN[i] !== before[i - ringEnd]) moved++;
      const h = Math.floor(hash(i * 3.7 + 11) * 1e6);
      if (h % prevN !== h % next) modMoved++;
    }
    const who = NODE_NAMES[Math.max(prevN, next) - 1];
    ringMsg = `${who} ${delta > 0 ? 'joined' : 'left'}: the ring remapped ${Math.round(moved / total * 100)}% of keys. hash % N would have remapped ${Math.round(modMoved / total * 100)}%.`;
    return ringMsg;
  }

  let SH = {};
  function buildShapes() {
    let name;
    if (split) { const nw = Math.min(W * .88, 1250); name = sampleText(['ROHIT GUPTA'], nw, Math.min(nw * .19, H * .26)); }
    else name = sampleText(['ROHIT', 'GUPTA'], W * .88, Math.min(W * .6, slotH(0) * .8));
    const hs = stage(560, 240).s, hiH = Math.min(slotH(stages.length - 1) * .7, 270);
    const hi = split ? sampleText(['SAY HI'], 560 * hs, 190 * hs) : sampleText(['SAY', 'HI'], Math.min(W * .72, 320), hiH);
    SH = { name, bars: SH.bars || buildBars(), hi, hiH };
  }

  /* ---------- formations ---------- */
  const textForm = (key, cols, place) => ({
    compute(t, o) {
      const sh = SH[key], { cx, cy } = place(), wave = reduce ? 0 : 2.5;
      for (let i = 0; i < active; i++) {
        o.x[i] = cx + sh.x[i]; o.y[i] = cy + sh.y[i] + Math.sin(t * 1.3 + sh.x[i] * .012) * wave;
        const f = sh.x[i] / sh.w + .5; o.c[i] = cols[f < .33 ? 0 : f < .66 ? 1 : 2];
      }
    },
  });

  const FORMS = {
    name: textForm('name', [0, 1, 2], () => split ? { cx: W / 2, cy: H < 600 ? H * .34 : H * .4 } : stage(1, 1)),

    bars: {
      w: 540, h: 440,
      compute(t, o) {
        const { cx, cy, s } = stage(this.w, this.h), b = SH.bars;
        for (let i = 0; i < active; i++) { o.x[i] = cx + b.x[i] * s; o.y[i] = cy + b.y[i] * s; o.c[i] = b.c[i]; }
      },
      labels() {
        const { cx, cy, s } = stage(this.w, this.h), fz = fontPx(s);
        label('TASK SUCCESS BY VERSION', cx, cy + (BASE - BH - 48) * s, '#a3a0c6', 'center', fz);
        VALS.forEach((v, j) => {
          const x = cx + (BX0 + j * (BW + BG) + BW / 2) * s;
          label(v.toFixed(1) + '%', x, cy + (BASE - bh(v) - 12) * s, j === 4 ? '#ffd166' : '#e8e6ff', 'center', fz);
          label(RUNS[j], x, cy + (BASE + 30) * s, '#a3a0c6', 'center', fz);
        });
      },
    },

    kv: {
      w: 470, h: 380, util: 0,
      compute(t, o) {
        const { cx, cy, s } = stage(this.w, this.h); let alloc = 0;
        const sn = KV_SN, ph = KV_PH;
        for (let b = 0; b < KC * KR; b++) { ph[b] = t * (.55 + hash(b) * .7) + hash(b + 99) * TAU; sn[b] = Math.sin(ph[b]); if (sn[b] > -.15) alloc++; }
        this.util = alloc / (KC * KR);
        for (let i = 0; i < active; i++) {
          const b = i % (KC * KR), slot = Math.floor(i / (KC * KR));
          const bx = KOX + (b % KC) * (KB + KG), by = KOY + Math.floor(b / KC) * (KB + KG);
          const scale = .35 + .65 * smooth(-.4, .05, sn[b]), on = sn[b] > -.15;
          const lx = ((slot % KM) + .5) * KSP - KB / 2, ly = (Math.floor(slot / KM) + .5) * KSP - KB / 2;
          o.x[i] = cx + (bx + KB / 2 + lx * scale) * s; o.y[i] = cy + (by + KB / 2 + ly * scale) * s;
          const req = Math.floor(ph[b] / TAU);
          o.c[i] = !on ? 6 : (b * 7 + Math.floor(t * .6)) % 29 === 0 ? 2 : [0, 1, 4][(req + b) % 3];
        }
      },
      labels() {
        const { cx, cy, s } = stage(this.w, this.h), fz = fontPx(s);
        label('PAGED KV CACHE · 60 BLOCKS', cx, cy + (KOY - 22) * s, '#a3a0c6', 'center', fz);
        label(`utilization ${Math.round(this.util * 100)}%`, cx, cy - KOY * s + 30 * s, '#6ef0b0', 'center', fz);
        if (s < .75) return;
        [['req A', 0], ['req B', 1], ['req C', 4], ['preempted', 2], ['free', 6]].forEach(([t, c], j) => {
          const x = cx + (-170 + j * 85) * s, y = cy - KOY * s + 54 * s;
          lx.fillStyle = PAL[c]; lx.fillRect(x - 30 * s, y - 7, 7, 7); label(t, x - 19 * s, y, '#a3a0c6', 'left', fz - 1);
        });
      },
    },

    sphere: {
      w: 440, h: 500, k: 0, q: null,
      compute(t, o) {
        const { cx, cy, s } = stage(this.w, this.h), R = 185 * s;
        const a = t * .22 + (mouse.on ? (mouse.x / W - .5) * 1.4 : 0), b = .35 + (mouse.on ? (mouse.y / H - .5) * .7 : 0);
        const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
        // touch devices have no hover, so the query wanders on its own
        const q = fine && mouse.on ? mouse : { x: cx + Math.cos(t * .7) * R * .45, y: cy + Math.sin(t * .9) * R * .35 };
        const qr2 = (58 * Math.max(s, .7)) ** 2;
        let k = 0;
        for (let i = 0; i < active; i++) {
          const x1 = UX[i] * ca + UZ[i] * sa, z1 = -UX[i] * sa + UZ[i] * ca;
          const y2 = UY[i] * cb - z1 * sb, z2 = UY[i] * sb + z1 * cb, p = 3 / (3 - z2);
          const sx = cx + x1 * R * p, sy = cy + y2 * R * p;
          o.x[i] = sx; o.y[i] = sy;
          if (z2 > 0 && (sx - q.x) ** 2 + (sy - q.y) ** 2 < qr2) { o.c[i] = 3; k++; }
          else o.c[i] = z2 > .35 ? 1 : z2 > -.25 ? 0 : 6;
        }
        this.k = k; this.q = q;
      },
      labels() {
        const { cx, cy, s } = stage(this.w, this.h), fz = fontPx(s);
        label('EMBEDDING SPACE · 5,183 ABSTRACTS', cx, cy - 228 * s, '#a3a0c6', 'center', fz);
        if (this.k) label(`query → top-k: ${this.k}`, this.q.x + 40, this.q.y - 36, '#ffd166', 'left', fz);
        else if (fine) label('move your cursor over the sphere', cx, cy + 236 * s, '#a3a0c6', 'center', fz);
      },
    },

    ring: {
      w: 600, h: 600,
      compute(t, o, dt) {
        const { cx, cy, s } = stage(this.w, this.h), sp = .2;
        for (let i = 0; i < active; i++) {
          let ang, r, c;
          if (i < ringEnd) { ang = baseAng[i]; r = RR + (hash(i) - .5) * 14; c = NODE_COL[ownN[i]]; }
          else if (i < keyEnd) {
            // a key falls onto the ring at its hash, then walks clockwise to its owner's virtual node
            const p = (t * sp + hash(i * 3.1)) % 1;
            if (p < sp * dt * 1.5) o.j[i] = 1;
            if (p < .55) { const e = p / .55; ang = baseAng[i]; r = ROUT - (ROUT - RR + 12) * e * e; }
            else { const e = (p - .55) / .45; ang = baseAng[i] + ownD[i] * smooth(0, 1, e); r = RR - 12; }
            c = NODE_COL[ownN[i]];
          } else {
            const n = (i - keyEnd) % ringNodes, home = VNODES[n * VN].a, d = hash(i * 1.3) * 11, th = hash(i * 2.7) * TAU;
            const hx = Math.cos(home) * RR, hy = Math.sin(home) * RR;
            o.x[i] = cx + (hx + Math.cos(th) * d) * s; o.y[i] = cy + (hy + Math.sin(th) * d) * s; o.c[i] = 5;
            continue;
          }
          o.x[i] = cx + Math.cos(ang) * r * s; o.y[i] = cy + Math.sin(ang) * r * s; o.c[i] = c;
        }
      },
      labels() {
        const { cx, cy, s } = stage(this.w, this.h), fz = fontPx(s);
        label('CONSISTENT HASH RING', cx, cy - 6, '#e8e6ff', 'center', fz);
        if (s > .7) label(`${ringNodes} nodes · keys find their owner`, cx, cy + 12, '#a3a0c6', 'center', fz - 1);
        for (let n = 0; n < ringNodes; n++) {
          const a = VNODES[n * VN].a;
          label(NODE_NAMES[n], cx + Math.cos(a) * (RR + 34) * s, cy + Math.sin(a) * (RR + 34) * s + 4, PAL[NODE_COL[n]], 'center', fz);
        }
      },
    },

    kafka: {
      get L() { return split ? 500 : 330; }, // lane length
      get w() { return this.L + 280; }, h: 330,
      compute(t, o, dt) {
        const L = this.L, { cx, cy, s } = stage(this.w, this.h), srcEnd = Math.floor(active * .12), sinkEnd = Math.floor(active * .24);
        for (let i = 0; i < active; i++) {
          let x, y, c;
          if (i < srcEnd) { x = -L / 2 - 100 + hash(i) * 52; y = -96 + hash(i + .5) * 192; c = 0; }
          else if (i < sinkEnd) { x = L / 2 + 48 + hash(i) * 52; y = -96 + hash(i + .5) * 192; c = 4; }
          else {
            const lane = i % 8, v = .16 + hash(lane + 40) * .1, p = (t * v + hash(i * 1.7)) % 1;
            if (p < v * dt * 1.5) o.j[i] = 1;
            x = -L / 2 + p * L; y = (lane - 3.5) * 24 + (hash(i * 9.1) - .5) * 4;
            c = p > .93 ? 4 : lane % 2 ? 1 : 0;
          }
          o.x[i] = cx + x * s; o.y[i] = cy + y * s; o.c[i] = c;
        }
      },
      labels() {
        const L = this.L, { cx, cy, s } = stage(this.w, this.h), fz = fontPx(s);
        label('POSTGRES', cx - (L / 2 + 74) * s, cy - 110 * s, '#8b7bff', 'center', fz);
        label('MONGODB', cx + (L / 2 + 74) * s, cy - 110 * s, '#6ef0b0', 'center', fz);
        label('CDC (AWS DMS) → KAFKA · 8 PARTITIONS', cx, cy - 128 * s, '#a3a0c6', 'center', fz);
        if (s > .7) for (let l = 0; l < 8; l++) label('p' + l, cx - (L / 2 + 8) * s, cy + ((l - 3.5) * 24 + 4) * s, '#6f6c92', 'right', fz - 1);
        label('600 GB+ · ZERO DOWNTIME', cx, cy + 132 * s, '#ffd166', 'center', fz);
      },
    },

    hi: Object.assign(textForm('hi', [2, 3, 3], () => stage(560, 240)), {
      labels() {
        const { cx, cy, s } = stage(560, 240), y = split ? cy + 120 * s : cy + SH.hiH / 2 + 22;
        label(fine ? 'hold anywhere · then let go' : 'long-press anywhere · then let go', cx, y, '#ff5ea8', 'center', split ? fontPx(s) : 11);
      },
    }),
  };

  /* ---------- scroll ---------- */
  const sections = [...document.querySelectorAll('[data-form]')], order = sections.map(s => s.dataset.form);
  let tops = [];
  const measure = () => { tops = sections.map(s => s.getBoundingClientRect().top + scrollY); };
  const stages = sections.map(s => s.querySelector('.stage'));
  const slotH = i => (stages[i] && stages[i].offsetHeight) || H * .5;
  let rects = [];
  function scrollPos() {
    if (!split) {
      // morph toward the next slot as it rises from the bottom of the screen; done once it's in the upper half
      rects = stages.map(s => s.getBoundingClientRect());
      let k = 0;
      while (k < rects.length - 1 && rects[k + 1].top < H * .42) k++;
      if (k >= rects.length - 1) return { k, e: 0 };
      return { k, e: smooth(0, 1, (H * .78 - rects[k + 1].top) / (H * .36)) };
    }
    const y = scrollY; let k = 0;
    while (k < tops.length - 1 && y >= tops[k + 1]) k++;
    if (k >= tops.length - 1) return { k: tops.length - 1, e: 0 };
    return { k, e: smooth(.15, .75, (y - tops[k]) / (tops[k + 1] - tops[k])) };
  }

  /* ---------- resize ---------- */
  let lastW = 0, lastH = 0;
  function resize(force) {
    const w = innerWidth, h = innerHeight;
    // mobile URL bars change height constantly while scrolling; only rebuild for real changes
    if (!force && w === lastW && Math.abs(h - lastH) < 120) { measure(); return; }
    lastW = w; lastH = h; W = w; H = h; split = splitMQ.matches;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lv.width = W * dpr; lv.height = H * dpr; lx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    buildShapes(); measure();
  }
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => resize(false), 150); });
  addEventListener('orientationchange', () => setTimeout(() => resize(true), 300));
  addEventListener('load', measure);
  document.fonts.ready.then(measure);
  if ('ResizeObserver' in window) new ResizeObserver(() => measure()).observe(document.querySelector('main'));

  /* ---------- cursor + black hole ---------- */
  let ring = null, dot = null;
  const rp = { x: -99, y: -99 };
  if (fine) {
    document.body.classList.add('custom-cursor');
    ring = document.createElement('div'); ring.className = 'cur-ring'; dot = document.createElement('div'); dot.className = 'cur-dot';
    document.body.append(ring, dot);
  }
  let holding = false, hold = 0, holdTimer = null, downAt = null;
  const startHold = () => { holding = true; document.body.classList.add('holding'); ring && ring.classList.add('hold'); };
  function endHold(explode) {
    clearTimeout(holdTimer); downAt = null;
    if (!holding) return;
    if (explode) for (let i = 0; i < active; i++) {
      const dx = X[i] - mouse.x, dy = Y[i] - mouse.y, d = Math.hypot(dx, dy) + 1;
      const imp = (2 + hold * 30) * Math.max(.15, 1 - d / 900) * (.6 + Math.random() * .8);
      VX[i] += dx / d * imp; VY[i] += dy / d * imp;
    }
    holding = false; hold = 0; document.body.classList.remove('holding'); ring && ring.classList.remove('hold');
    if (explode && navigator.vibrate && !fine) navigator.vibrate(30);
  }
  // pointer events can target document/window (e.g. leaving the page), which have no closest()
  const closest = (e, sel) => e.target instanceof Element ? e.target.closest(sel) : null;
  addEventListener('pointermove', e => {
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.on = true;
    if (downAt && e.pointerType !== 'mouse' && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 12) endHold(false);
    if (ring) ring.classList.toggle('link', !holding && !!closest(e, 'a, button'));
  }, { passive: true });
  document.addEventListener('mouseleave', () => { mouse.on = false; });
  addEventListener('pointerdown', e => {
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.on = true;
    if (closest(e, '[data-hold]')) { e.preventDefault(); startHold(); return; }
    if (closest(e, 'a, button, input, textarea, select') || e.button > 0) return;
    downAt = { x: e.clientX, y: e.clientY };
    if (e.pointerType === 'mouse') startHold(); else holdTimer = setTimeout(startHold, 380);
  });
  addEventListener('pointerup', () => endHold(true));
  addEventListener('pointercancel', () => endHold(false));
  addEventListener('contextmenu', e => { if (holding) e.preventDefault(); });
  addEventListener('blur', () => endHold(false));

  /* ---------- ring controls ---------- */
  const ringStat = document.getElementById('ring-stat');
  document.querySelectorAll('[data-ring]').forEach(b => b.addEventListener('click', () => {
    const msg = changeRing(+b.dataset.ring);
    if (ringStat) ringStat.textContent = msg;
  }));

  // keyboard users: hold Space/Enter on the "Hold me" button
  document.querySelectorAll('[data-hold]').forEach(b => {
    b.addEventListener('keydown', e => {
      if ((e.key !== ' ' && e.key !== 'Enter') || e.repeat || holding) return;
      e.preventDefault();
      const r = b.getBoundingClientRect(); mouse.x = r.left + r.width / 2; mouse.y = r.top + r.height / 2; mouse.on = true;
      startHold();
    });
    b.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') endHold(true); });
  });

  /* ---------- UI hooks ---------- */
  const hud = document.getElementById('hud');
  const dots = [...document.querySelectorAll('.dots button')];
  dots.forEach((d, i) => d.addEventListener('click', () => sections[i].scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' })));

  /* ---------- loop ---------- */
  let last = performance.now(), t = 0, frameN = 0, lastK = -1, slow = 0, lastSY = scrollY;
  function loop(now) {
    const raw = (now - last) / 1000, dt = Math.min(.05, raw), f = dt * 60; last = now; t += dt; frameN++;

    // adaptive quality: if frames stay slow, draw fewer particles (never below 700)
    if (raw < .1) { slow = slow * .97 + (raw > 1 / 40 ? 1 : 0) * .03; if (slow > .6 && active > 700 && frameN > 120) { active = Math.max(700, Math.floor(active * .75)); slow = 0; } }

    if (holding) hold = Math.min(1, hold + dt * .7);
    const { k, e } = scrollPos(), FA = FORMS[order[k]], FB = e > .001 ? FORMS[order[k + 1]] : null;
    box = split ? null : rects[k]; A.j.fill(0); FA.compute(t, A, dt);
    if (FB) { box = split ? null : rects[k + 1]; B.j.fill(0); FB.compute(t, B, dt); }
    // stacked: shapes are part of the page, so move every particle with the scroll (springs only handle morphing)
    const sy = scrollY, dsy = split ? 0 : sy - lastSY; lastSY = sy;
    const cur = order[e > .5 ? k + 1 : k];
    const noRepel = cur === 'sphere'; // the cursor is the search query there, so don't scatter its neighbours
    const spring = 1 - hold * .93, damp = Math.pow(.85, f), R = split ? 95 : 70, R2 = R * R;
    let loss = 0, lossN = 0;
    for (let i = 0; i < active; i++) {
      const tx = FB ? A.x[i] + (B.x[i] - A.x[i]) * e : A.x[i], ty = FB ? A.y[i] + (B.y[i] - A.y[i]) * e : A.y[i];
      C[i] = FB && e > .5 ? B.c[i] : A.c[i];
      // a formation that loops (a key or message restarting its journey) teleports instead of streaking back
      if (hold === 0 && ((e <= .5 && A.j[i]) || (FB && e > .5 && B.j[i]))) { X[i] = tx; Y[i] = ty; VX[i] = VY[i] = 0; }
      if (dsy) Y[i] -= dsy;
      const kk = (reduce ? .12 : K[i]) * spring * f;
      VX[i] += (tx - X[i]) * kk; VY[i] += (ty - Y[i]) * kk;
      if (mouse.on && (hold > 0 || !noRepel)) {
        const dx = X[i] - mouse.x, dy = Y[i] - mouse.y, d2 = dx * dx + dy * dy;
        if (hold > 0) {
          const d = Math.sqrt(d2) + 1, a = hold * Math.min(1.8, 170 / d) * f;
          VX[i] += (-dx / d * .85 + dy / d * 1.25) * a; VY[i] += (-dy / d * .85 - dx / d * 1.25) * a;
        } else if (d2 < R2 && fine) {
          const d = Math.sqrt(d2) + .1, p = (1 - d / R) ** 2 * 6 * f;
          VX[i] += dx / d * p; VY[i] += dy / d * p;
        }
      }
      VX[i] *= damp; VY[i] *= damp; X[i] += VX[i] * f; Y[i] += VY[i] * f;
      if (i % 23 === 0 && !A.j[i]) { loss += Math.abs(tx - X[i]) + Math.abs(ty - Y[i]); lossN++; }
    }

    // light trails, then particles drawn additively
    // fade the previous frame toward transparent; the page background shows through (no 8-bit ghosting)
    if (reduce) ctx.clearRect(0, 0, W, H);
    // every 6th frame fades harder: at .24 alone, 8-bit rounding leaves pixels stuck at alpha 2/255 forever
    else { ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = frameN % 6 ? 'rgba(0,0,0,.24)' : 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, W, H); }
    ctx.globalCompositeOperation = 'lighter';
    const sz = split ? 1.8 : 1.7, hs = sz / 2;
    for (let c = 0; c < PAL.length; c++) {
      ctx.fillStyle = PAL[c]; ctx.globalAlpha = c === 6 ? .5 : .82;
      for (let i = 0; i < active; i++) if (C[i] === c) ctx.fillRect(X[i] - hs, Y[i] - hs, sz, sz);
    }
    if (hold > 0) {
      const r = 14 + hold * 46, g = ctx.createRadialGradient(mouse.x, mouse.y, r * .3, mouse.x, mouse.y, r * 2.2);
      g.addColorStop(0, 'rgba(255,94,168,0)'); g.addColorStop(.35, `rgba(255,94,168,${.35 * hold})`); g.addColorStop(.6, `rgba(139,123,255,${.2 * hold})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(mouse.x, mouse.y, r * 2.2, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#010104'; ctx.beginPath(); ctx.arc(mouse.x, mouse.y, r * .45, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    const pos = k + e;
    lx.clearRect(0, 0, W, H);
    [[k, FA], [k + 1, FB]].forEach(([j, F]) => {
      if (!F || !F.labels) return;
      const a = clamp(1 - Math.abs(pos - j) * 2.5, 0, 1);
      if (a > .01) { box = split ? null : rects[j]; lx.globalAlpha = a; F.labels(); }
    });
    lx.globalAlpha = 1;

    if (ring) {
      rp.x += (mouse.x - rp.x) * .2; rp.y += (mouse.y - rp.y) * .2;
      ring.style.transform = `translate(${rp.x}px, ${rp.y}px)`; dot.style.transform = `translate(${mouse.x}px, ${mouse.y}px)`;
    }
    if (frameN % 6 === 0) {
      const L = lossN ? loss / lossN / 60 : 0;
      if (hud) hud.innerHTML = hold > 0 ? `loss <b class="c-pink">${L.toFixed(3)}</b> · collapsing…` : L < .07 ? `loss <b class="c-mint">${L.toFixed(3)}</b> · converged ✓` : `loss <b class="c-gold">${L.toFixed(3)}</b> · training…`;
      const on = Math.round(pos);
      if (on !== lastK) { dots.forEach((d, i) => d.classList.toggle('on', i === on)); lastK = on; }
    }
    requestAnimationFrame(loop);
  }

  resize(true);
  // re-sample text once the display font arrives, so letters use the real glyphs
  Promise.race([document.fonts.load('800 100px Syne'), new Promise(r => setTimeout(r, 1500))]).then(() => buildShapes());
  requestAnimationFrame(loop);
}
