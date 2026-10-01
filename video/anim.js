'use strict';
/*
 * 筑梦绿发，聚力启航 —— 10s 二维纯色块液态 MG 动画
 * 所有画面都是 t(秒) 的纯函数：renderFrame(t)。逐帧离线渲染保证 60fps 稳定输出。
 */
(() => {
  const W = 1920, H = 1080;
  const cv = document.getElementById('c');
  const ctx = cv.getContext('2d');
  const TAU = Math.PI * 2, PI = Math.PI, DEG = PI / 180;

  // ───────────────────────── palette ─────────────────────────
  const COL = {
    bg: '#D4F3EC',       // 开场柔和浅薄荷青
    bgBlob: '#C4EEE3',   // 背景流体（略深的薄荷）
    mint: '#7ED8C6',     // 薄荷青流体
    emerald: '#12A574',  // 翡翠绿流体
    jade: '#45C493',     // 浅一级的绿叶
    white: '#FFFFFF',
    blue: '#9DD3F5',     // 浅蓝
    orange: '#FF8A3D',   // 活力橙
    pale: '#D3F1E1',     // 终版浅绿
  };
  const PAL = {
    girl: {
      skin: '#F7D0B5', skinD: '#EBBB9B', hair: '#2A1F1C', tip: COL.emerald,
      top: '#FFFFFF', topD: '#E3EEF1', sleeve: '#9DD3F5', sleeveD: '#86C2E9', detail: '#9DD3F5',
      pants: '#D3D9E2', pantsD: '#BEC6D1', shoe: '#9DD3F5', shoeD: '#86C2E9',
      eye: '#2A1F1C', mouth: '#C2584A',
    },
    boy: {
      skin: '#E9B18B', skinD: '#D89C75', hair: '#16161B',
      top: '#078A5E', topD: '#05744E', sleeve: '#078A5E', sleeveD: '#05744E', detail: '#078A5E',
      pants: '#FFFFFF', pantsD: '#E2E9ED', shoe: '#FFFFFF', shoeD: '#E2E9ED',
      eye: '#1C1818', mouth: '#A9483A',
    },
  };
  const MONO = new Proxy({}, { get: () => '#FFFFFF' });

  // ───────────────────────── math ─────────────────────────
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, u) => a + (b - a) * u;
  const prog = (t, a, b) => clamp((t - a) / (b - a));
  const ss = (a, b, t) => { const x = prog(t, a, b); return x * x * (3 - 2 * x); };
  const bump = (t, a, b, c, d) => ss(a, b, t) * (1 - ss(c, d, t));
  const E = {
    io3: x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    io2: x => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
    o3: x => 1 - Math.pow(1 - x, 3),
    o2: x => 1 - (1 - x) * (1 - x),
    i2: x => x * x,
    i3: x => x * x * x,
    oBack: (x, s = 1.6) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2),
  };
  const P2 = {
    add: (p, q) => [p[0] + q[0], p[1] + q[1]],
    sub: (p, q) => [p[0] - q[0], p[1] - q[1]],
    mul: (p, k) => [p[0] * k, p[1] * k],
    lerp: (p, q, u) => [lerp(p[0], q[0], u), lerp(p[1], q[1], u)],
  };
  // 角度约定（侧视绑定）：0 = 竖直向下，正值 = 向前(+x)
  const dir = (a, L = 1) => [Math.sin(a) * L, Math.cos(a) * L];

  // Hermite 关键帧：[[t, value, slope?], ...]
  function keys(k) {
    return t => {
      if (t <= k[0][0]) return k[0][1];
      const n = k.length;
      if (t >= k[n - 1][0]) return k[n - 1][1];
      let i = 0;
      while (t > k[i + 1][0]) i++;
      const [t0, v0, d0 = 0] = k[i], [t1, v1, d1 = 0] = k[i + 1];
      const h = t1 - t0, u = (t - t0) / h, u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * v0 + (u3 - 2 * u2 + u) * h * d0 +
        (-2 * u3 + 3 * u2) * v1 + (u3 - u2) * h * d1;
    };
  }
  function integral(f, t0, t1, dt = 1 / 2000) {
    const n = Math.ceil((t1 - t0) / dt) + 1;
    const acc = new Float64Array(n);
    for (let i = 1; i < n; i++) {
      const a = t0 + (i - 1) * dt, b = t0 + i * dt;
      acc[i] = acc[i - 1] + (f(a) + f(b)) * 0.5 * dt;
    }
    return t => {
      const x = (clamp(t, t0, t1) - t0) / dt;
      const i = Math.min(n - 2, Math.floor(x)), u = x - i;
      return acc[i] * (1 - u) + acc[i + 1] * u;
    };
  }
  // 关键姿态轨道：[[t, a, b], ...]，段间 easeInOutCubic
  function poseTrack(k) {
    return t => {
      if (t <= k[0][0]) return [k[0][1], k[0][2]];
      const n = k.length;
      if (t >= k[n - 1][0]) return [k[n - 1][1], k[n - 1][2]];
      let i = 0;
      while (t > k[i + 1][0]) i++;
      const u = E.io3(prog(t, k[i][0], k[i + 1][0]));
      return [lerp(k[i][1], k[i + 1][1], u), lerp(k[i][2], k[i + 1][2], u)];
    };
  }

  // ───────────────────────── drawing primitives ─────────────────────────
  function addCircle(p, x, y, r) {
    if (r <= 0.05) return;
    p.moveTo(x + r, y);
    p.arc(x, y, r, 0, TAU, false);
    p.closePath();
  }
  // 两圆外公切线围成的四边形（与两圆一起构成凸包），统一为正向绕序
  function addHull(p, x1, y1, r1, x2, y2, r2) {
    const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy);
    if (d < 1e-6 || d <= Math.abs(r1 - r2)) return;
    const ux = dx / d, uy = dy / d;
    const g = Math.acos(clamp((r1 - r2) / d, -1, 1));
    const c = Math.cos(g), s = Math.sin(g);
    const ax = ux * c - uy * s, ay = ux * s + uy * c;
    const bx = ux * c + uy * s, by = -ux * s + uy * c;
    const q = [
      [x1 + r1 * ax, y1 + r1 * ay], [x2 + r2 * ax, y2 + r2 * ay],
      [x2 + r2 * bx, y2 + r2 * by], [x1 + r1 * bx, y1 + r1 * by],
    ];
    let area = 0;
    for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) % 4];
      area += a[0] * b[1] - b[0] * a[1];
    }
    if (area < 0) q.reverse();
    p.moveTo(q[0][0], q[0][1]);
    p.lineTo(q[1][0], q[1][1]);
    p.lineTo(q[2][0], q[2][1]);
    p.lineTo(q[3][0], q[3][1]);
    p.closePath();
  }
  // 变宽“胶囊链”：所有子路径同向绕序，nonzero 填充即并集 —— 无描边、无接缝
  function chainPath(pts, rs, p = new Path2D()) {
    for (let i = 0; i < pts.length; i++) addCircle(p, pts[i][0], pts[i][1], rs[i]);
    for (let i = 0; i < pts.length - 1; i++) {
      addHull(p, pts[i][0], pts[i][1], Math.max(rs[i], 0.01), pts[i + 1][0], pts[i + 1][1], Math.max(rs[i + 1], 0.01));
    }
    return p;
  }
  function chain(c, pts, rs, color) {
    c.fillStyle = color;
    c.fill(chainPath(pts, rs), 'nonzero');
  }
  function ribbon(c, st, color) {
    if (!st) return;
    chain(c, st.pts, st.ws.map(w => Math.max(0, w * 0.5)), color);
  }
  function circle(c, x, y, r, color) {
    if (r <= 0.05) return;
    c.fillStyle = color;
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.fill();
  }
  function ellipse(c, x, y, rx, ry, rot, color) {
    if (rx <= 0.05 || ry <= 0.05) return;
    c.fillStyle = color;
    c.beginPath();
    c.ellipse(x, y, rx, ry, rot, 0, TAU);
    c.fill();
  }
  function smoothClosed(c, pts) {
    const n = pts.length;
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      c.bezierCurveTo(
        p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
        p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6,
        p2[0], p2[1]);
    }
    c.closePath();
  }
  function fillSmooth(c, pts, color) {
    c.fillStyle = color;
    c.beginPath();
    smoothClosed(c, pts);
    c.fill();
  }
  function blobPts(cx, cy, rx, ry, t, seed, amp, n = 14, rot = 0) {
    const pts = [];
    const cr = Math.cos(rot), sr = Math.sin(rot);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const k = 1 + amp * (0.55 * Math.sin(2 * a + t * 1.7 + seed) +
        0.3 * Math.sin(3 * a - t * 1.3 + seed * 1.7) +
        0.15 * Math.sin(5 * a + t * 2.3 + seed * 0.7));
      const x = Math.cos(a) * rx * k, y = Math.sin(a) * ry * k;
      pts.push([cx + x * cr - y * sr, cy + x * sr + y * cr]);
    }
    return pts;
  }
  function blob(c, cx, cy, rx, ry, t, seed, amp, color, n, rot) {
    if (rx <= 0.1 || ry <= 0.1) return;
    fillSmooth(c, blobPts(cx, cy, rx, ry, t, seed, amp, n, rot), color);
  }

  // ───────────────────────── goo（液态融合）─────────────────────────
  // 先在离屏画布画白色形体 → 高斯模糊 → alpha 阈值，得到边缘柔和融合的纯色块
  const gA = document.createElement('canvas'); gA.width = W; gA.height = H;
  const gAc = gA.getContext('2d');
  const gB = document.createElement('canvas'); gB.width = W; gB.height = H;
  const gBc = gB.getContext('2d', { willReadFrequently: true });
  const hexRGB = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  function goo(c, box, blur, color, draw) {
    const x = Math.max(0, Math.floor(box[0])), y = Math.max(0, Math.floor(box[1]));
    const w = Math.min(W - x, Math.ceil(box[2])), h = Math.min(H - y, Math.ceil(box[3]));
    if (w <= 0 || h <= 0) return;
    gAc.setTransform(1, 0, 0, 1, 0, 0);
    gAc.clearRect(0, 0, W, H);
    gAc.save();
    gAc.fillStyle = '#fff';
    draw(gAc);
    gAc.restore();
    gBc.setTransform(1, 0, 0, 1, 0, 0);
    gBc.clearRect(x, y, w, h);
    gBc.filter = blur > 0.25 ? `blur(${blur.toFixed(2)}px)` : 'none';
    gBc.drawImage(gA, 0, 0);
    gBc.filter = 'none';
    const img = gBc.getImageData(x, y, w, h);
    const d = img.data;
    const [r, g, b] = hexRGB(color);
    const ww = Math.min(0.5, 0.27 / Math.max(blur, 0.01));
    const lo = 0.5 - ww, hi = 0.5 + ww, inv = 1 / (hi - lo);
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3] / 255;
      let o;
      if (a <= lo) o = 0;
      else if (a >= hi) o = 1;
      else { const u = (a - lo) * inv; o = u * u * (3 - 2 * u); }
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = Math.round(o * 255);
    }
    gBc.putImageData(img, x, y);
    c.drawImage(gB, x, y, w, h, x, y, w, h);
  }

  // ───────────────────────── 时间轴常量 ─────────────────────────
  const T_REL = 2.36;      // 男孩推出种子
  const T_SPLIT = 3.9;     // 种壳打开
  const T_STILL = 9.3;     // 之后画面完全静止

  // 摄像机：从左向右平稳跟随 → 追随种子加速 → 减速停稳
  const camVel = keys([[0, 470], [2.2, 470], [2.72, 2900], [3.45, 260, -900], [3.9, 120], [10, 120]]);
  const camX = integral(camVel, 0, 10);

  // ───────────────────────── 侧视奔跑人物 ─────────────────────────
  const RUN_PERIOD = 0.62;
  const HIP_Y = 600;
  const S_GIRL = 1.1, S_BOY = 1.16;
  const boyWX = t => 1010 + 520 * t;
  const gapX = t => 262 - 34 * bump(t, 0.42, 0.78, 1.1, 1.45);
  const RIG = { torso: 120, neck: 15, headR: 33, ua: 64, fa: 60, th: 92, sh: 90 };

  const girlArmW = t => ss(0.42, 0.72, t) * (1 - ss(1.02, 1.4, t));
  const girlArmPose = () => [1.3, 0.14];
  const boyArmW = t => ss(0.45, 0.72, t) * (1 - ss(2.55, 2.95, t));
  const boyArmPose = poseTrack([
    [0.72, -1.22, 0.2], [1.08, -1.22, 0.2],      // 向后伸手接种子
    [1.42, 0.3, 1.82], [1.95, 0.3, 1.82],        // 收到胸前，两颗种子融合
    [2.2, -0.05, 2.35],                          // 蓄力
    [2.36, 1.42, 0.06], [2.6, 1.3, 0.2],         // 向前推出
  ]);

  function runnerRig(kind, t) {
    const girl = kind === 'girl';
    const s = girl ? S_GIRL : S_BOY;
    const wx = girl ? boyWX(t) - gapX(t) : boyWX(t);
    const x = wx - camX(t), y = HIP_Y;
    const phase = t / RUN_PERIOD + (girl ? 0.04 : 0);
    const P = phase * TAU;
    const bob = 7 * Math.cos(2 * P);
    const lean = 0.17 + 0.02 * Math.sin(2 * P);
    const S = q => [x + s * q[0], y + s * (q[1] + bob)];
    const up = [Math.sin(lean), -Math.cos(lean)];
    const shL = P2.mul(up, RIG.torso * 0.88);
    const neckL = P2.mul(up, RIG.torso * 0.98);
    const hl = lean * 0.35;
    const headL = P2.add(neckL, [Math.sin(hl) * (RIG.neck + RIG.headR * 0.85), -Math.cos(hl) * (RIG.neck + RIG.headR * 0.85)]);

    const leg = q => {
      const th = 0.18 + 0.78 * Math.sin(q);
      const kn = 0.15 + 1.55 * Math.pow(0.5 + 0.5 * Math.cos(q - 0.1), 2.2);
      const knee = dir(th, RIG.th);
      const ank = P2.add(knee, dir(th - kn, RIG.sh));
      const fa = th - kn + PI / 2 - 0.12 + 0.22 * Math.sin(q);
      return {
        hip: S([0, 0]), knee: S(knee), ank: S(ank),
        heel: S(P2.add(ank, dir(fa, -9))), toe: S(P2.add(ank, dir(fa, 30))),
      };
    };
    const arm = (q, override, w) => {
      let a = -0.8 * Math.sin(q), b = 1.5 - 0.25 * Math.sin(q);
      if (override && w > 0) { a = lerp(a, override[0], w); b = lerp(b, override[1], w); }
      const el = P2.add(shL, dir(a, RIG.ua));
      const wr = P2.add(el, dir(a + b, RIG.fa));
      const hand = P2.add(wr, dir(a + b, 7));
      return { sh: S(shL), el: S(el), wr: S(wr), hand: S(hand), f: a + b };
    };
    const nearOverride = girl ? girlArmPose() : boyArmPose(t);
    const nearW = girl ? girlArmW(t) : boyArmW(t);
    return {
      kind, s, x, y, bob, lean, hl, P,
      hipS: S([0, 0]), neckS: S(neckL), headS: S(headL),
      legNear: leg(P), legFar: leg(P + PI),
      armNear: arm(P, nearOverride, nearW), armFar: arm(P + PI, null, 0),
      armR: girl ? 10 : 11.5, legR: girl ? [15, 12.5, 10] : [16.5, 13.5, 11],
    };
  }

  function drawRunner(c, R) {
    const p = PAL[R.kind], s = R.s, girl = R.kind === 'girl';
    const arm = (A, far) => {
      const sk = far ? p.skinD : p.skin;
      chain(c, [A.sh, A.el, A.wr], [s * R.armR, s * R.armR * 0.95, s * R.armR * 0.85], sk);
      circle(c, A.hand[0], A.hand[1], s * R.armR * 1.08, sk);
      const sl = P2.lerp(A.sh, A.el, 0.62);
      chain(c, [A.sh, sl], [s * (R.armR + 4.5), s * (R.armR + 3.5)], far ? p.sleeveD : p.sleeve);
    };
    const leg = (L, far) => {
      chain(c, [L.hip, L.knee, L.ank], R.legR.map(r => r * s), far ? p.pantsD : p.pants);
      chain(c, [L.heel, L.toe], [s * 10.5, s * 8.5], far ? p.shoeD : p.shoe);
    };
    arm(R.armFar, true);
    leg(R.legFar, true);
    leg(R.legNear, false);
    // 臀部（裤）
    c.save();
    c.translate(R.hipS[0], R.hipS[1]);
    c.rotate(R.lean);
    c.scale(s, s);
    ellipse(c, -2, 2, 28, 22, 0, p.pants);
    c.restore();
    // 颈
    chain(c, [P2.lerp(R.neckS, R.hipS, 0.06), R.headS], [s * 9.5, s * 9.5], p.skin);
    // 躯干
    c.save();
    c.translate(R.hipS[0], R.hipS[1]);
    c.rotate(R.lean);
    c.scale(s, s);
    c.fillStyle = p.top;
    c.beginPath();
    c.roundRect(-29, -RIG.torso - 4, 58, RIG.torso + 16, [22, 26, 10, 10]);
    c.fill();
    if (girl) {
      c.save();
      c.clip();
      c.fillStyle = p.detail;
      c.fillRect(-40, -RIG.torso * 0.6, 80, 11);
      c.restore();
    }
    c.restore();
    // 头
    c.save();
    c.translate(R.headS[0], R.headS[1]);
    c.rotate(R.hl);
    c.scale(s, s);
    drawSideHead(c, p, girl, R.P);
    c.restore();
    arm(R.armNear, false);
  }

  function drawSideHead(c, p, girl, P) {
    if (girl) {
      const sw = 4 * Math.sin(2 * P + 1.2), sy = 2.5 * Math.cos(2 * P + 1.2);
      const back = [[6, -38], [-16, -39], [-35, -25], [-43, -2], [-45, 22], [-44 + sw, 44 + sy],
        [-30 + sw, 51 + sy], [-12 + sw * 0.6, 46 + sy], [-1, 30], [4, 10], [10, -20]];
      c.save();
      c.beginPath();
      smoothClosed(c, back);
      c.fillStyle = p.hair;
      c.fill();
      c.clip();
      c.fillStyle = p.tip;
      c.fillRect(-70, 36 + sy, 90, 40);
      c.restore();
    }
    circle(c, 0, 0, RIG.headR, p.skin);
    ellipse(c, 9, 13, 23, 20, 0, p.skin);
    circle(c, 31, 3, 5.5, p.skin);
    if (!girl) ellipse(c, -6, 3, 6.5, 8.5, 0, p.skinD);
    ellipse(c, 17, -3, 3.4, 4.6, 0, p.eye);
    c.fillStyle = p.mouth;
    c.beginPath();
    c.ellipse(22, 16, 6.2, 4.2, -0.25, 0, PI);
    c.fill();
    const front = girl
      ? [[-37, -6], [-34, -28], [-18, -41], [6, -43], [26, -34], [37, -17], [39, -5], [27, -12],
        [14, -17], [2, -16], [-10, -10], [-20, -1], [-29, 8]]
      : [[-35, 8], [-38, -14], [-28, -35], [-6, -44], [18, -42], [34, -31], [39, -17], [30, -16],
        [18, -20], [4, -18], [-8, -10], [-16, 0], [-24, 12]];
    fillSmooth(c, front, p.hair);
  }

  // ───────────────────────── 种子 ─────────────────────────
  const SEED_R = 12;
  const seedOffset = (A, along, side) => {
    const d = dir(A.f), n = [d[1], -d[0]];
    return [A.hand[0] + d[0] * along + n[0] * side, A.hand[1] + d[1] * along + n[1] * side];
  };
  // 手中种子（t < T_REL）：返回 [{x,y,r}]，以及是否需要液态融合
  function seedsInHands(t, G, B) {
    const sG = G.s, sB = B.s;
    const girlSeed = seedOffset(G.armNear, 7 * sG, -2 * sG);
    const mp = E.io3(prog(t, 1.5, 1.9));
    const slotA = seedOffset(B.armNear, lerp(7, 9, mp) * sB, lerp(-9, 0, mp) * sB);
    const slotB = seedOffset(B.armNear, lerp(7, 9, mp) * sB, lerp(10, 0, mp) * sB);
    const rB = lerp(SEED_R, SEED_R * 1.42, mp) * sB;
    let passing;
    if (t < 0.9) passing = { p: girlSeed, r: SEED_R * sG };
    else if (t < 1.08) {
      const u = E.io3(prog(t, 0.9, 1.08));
      const p = P2.lerp(girlSeed, slotB, u);
      p[1] -= 26 * Math.sin(PI * u);
      passing = { p, r: lerp(SEED_R * sG, rB, u) };
    } else passing = { p: slotB, r: rB };
    return { list: [{ p: slotA, r: rB }, passing], merging: t > 1.4 && t < 2.0, mp };
  }

  let FX = null, FY = null; // 飞行轨迹（屏幕坐标），在 init 时由出手点确定
  function initFlight() {
    const G = runnerRig('girl', T_REL), B = runnerRig('boy', T_REL);
    const h = seedsInHands(T_REL, G, B).list[0].p;
    FX = keys([[T_REL, h[0], 1500], [2.8, 1500, 250], [3.15, 1230, -700], [3.55, 960, 0]]);
    FY = keys([[T_REL, h[1], -120], [2.8, 455, 0], [3.2, 560, 280], [3.55, 640, 0]]);
  }
  const SEED_REST = [960, 640];
  const seedR = t => lerp(SEED_R * 1.42 * S_BOY, 64, E.oBack(prog(t, 3.18, 3.82), 1.3));

  function drawFlyingSeed(c, t) {
    const x = FX(t), y = FY(t);
    const dt = 1 / 240;
    const vx = (FX(t + dt) + camX(t + dt) - FX(t - dt) - camX(t - dt)) / (2 * dt);
    const vy = (FY(t + dt) - FY(t - dt)) / (2 * dt);
    const sp = Math.hypot(vx, vy);
    const st = 1 + clamp((sp - 500) / 2600, 0, 0.9) * (1 - ss(3.2, 3.5, t));
    const r = seedR(t);
    const spread = bump(t, 3.32, 3.56, 3.6, 3.88);
    const rx = r * st * (1 + 0.32 * spread), ry = (r / Math.sqrt(st)) * (1 - 0.16 * spread);
    const rot = sp > 1 ? Math.atan2(vy, vx) * (1 - ss(3.3, 3.5, t)) : 0;
    const wob = 0.035 * ss(3.4, 3.7, t);
    blob(c, x, y, rx, ry, t * 2, 1.3, wob, COL.white, 14, rot);
    const rc = r * 0.75 * E.o3(prog(t, 3.3, 3.86));
    blob(c, x, y + 2, rc, rc, t * 2.4, 4.1, 0.05 * ss(3.4, 3.7, t), COL.emerald, 12, 0);
  }

  // 宽阔液态尾迹（世界坐标中“铺下”的色带，随后回收进种子）
  function drawTrail(c, t) {
    if (t <= T_REL + 0.004 || t >= 3.62) return;
    const k = ss(2.95, 3.6, t);
    const tau0 = T_REL + (t - T_REL) * k;
    const n = 96;
    const cx = camX(t);
    const base = [];
    for (let i = 0; i < n; i++) {
      const tau = lerp(tau0, t, i / (n - 1));
      const wx = FX(tau) + camX(tau);
      base.push([wx - cx, FY(tau), wx]);
    }
    const grow = (0.35 + 0.65 * ss(T_REL, 2.75, t)) * (1 - ss(3.3, 3.62, t));
    const bands = [
      { col: COL.mint, W: 250, dy: -8, amp: 28, ph: 0 },
      { col: COL.emerald, W: 130, dy: 18, amp: 20, ph: 1.7 },
      { col: COL.blue, W: 44, dy: -74, amp: 16, ph: 3.1 },
    ];
    for (const b of bands) {
      const pts = [], ws = [];
      for (let i = 0; i < n; i++) {
        const sP = i / (n - 1);
        const f = 1 - Math.pow(sP, 3);
        const [x, y, wx] = base[i];
        pts.push([x, y + b.dy * f + b.amp * Math.sin(0.0045 * wx - 6 * t + b.ph) * f]);
        const g = (0.35 + 0.65 * ss(0, 0.3, sP)) * (1 - 0.88 * ss(0.72, 1, sP));
        ws.push(b.W * grow * g);
      }
      ribbon(c, { pts, ws }, b.col);
    }
  }

  // 背景薄荷流体（世界坐标，配合镜头横移制造跟随感）
  const BG_BLOBS = [
    [250, 1060, 430, 260], [1500, 20, 380, 210], [2500, 1080, 470, 280], [3500, 30, 430, 230],
    [4500, 1060, 500, 300], [5500, 10, 460, 260], [6500, 1070, 520, 300],
  ];
  function drawBgBlobs(c, t) {
    const k = 1 - E.io3(prog(t, 3.2, 3.85));
    if (k <= 0) return;
    const cx = camX(t);
    BG_BLOBS.forEach((b, i) => {
      const x = b[0] - cx;
      if (x < -700 || x > W + 700) return;
      blob(c, x, b[1], b[2] * k, b[3] * k, t, i * 2.1, 0.06, COL.bgBlob, 14, 0);
    });
  }

  // ───────────────────────── 生长形态（C 段）─────────────────────────
  const N_RIB = 72;
  const stemTop = t => {
    const e = E.oBack(prog(t, 3.92, 4.42), 1.2);
    return [960 + 6 * Math.sin(t * 3.1) * ss(4.4, 4.8, t), 640 - 210 * e];
  };
  function stemForm(t) { // s=0 顶端，s=1 底端
    const e2 = E.o3(prog(t, 3.92, 4.4)), e3 = E.o3(prog(t, 3.92, 4.3));
    const top = stemTop(t), bot = [960, 640 + 50 * e2];
    const wt = lerp(96, 26, e3), wb = lerp(96, 46, e3);
    const pts = [], ws = [];
    for (let i = 0; i < N_RIB; i++) {
      const s = i / (N_RIB - 1);
      const p = P2.lerp(top, bot, s);
      p[0] += 10 * Math.sin(PI * s) * Math.sin(t * 2.6) * ss(4.3, 4.8, t);
      pts.push(p);
      ws.push(lerp(wt, wb, s));
    }
    return { pts, ws };
  }
  function leafForm(t, side) { // side -1 左叶, +1 右叶
    const dly = side < 0 ? 0 : 0.07;
    const open = E.oBack(prog(t, 4.12 + dly, 4.66 + dly), 1.5);
    const curl = ss(4.7, 5.05, t);
    const phi = side * (lerp(0.12, 1.0, open) + 0.07 * Math.sin(t * 3 + side) * ss(4.6, 4.9, t) - 0.18 * curl);
    const L = (side < 0 ? 272 : 252) * E.o3(prog(t, 4.1 + dly, 4.6 + dly));
    const Wm = (side < 0 ? 130 : 120) * E.o3(prog(t, 4.15 + dly, 4.68 + dly));
    const k = side * (0.65 + 0.55 * curl);
    const st = stemTop(t);
    let p = [st[0], st[1] + 4];
    const pts = [], ws = [];
    for (let i = 0; i < N_RIB; i++) {
      const s = i / (N_RIB - 1);
      pts.push(p.slice());
      ws.push(Wm * Math.pow(Math.sin(PI * s), 0.85) * (1 - 0.15 * s));
      const a = phi + k * s;
      p = [p[0] + Math.sin(a) * L / (N_RIB - 1), p[1] - Math.cos(a) * L / (N_RIB - 1)];
    }
    return { pts, ws };
  }
  function orangeForm(t) { // s=0 底, s=1 顶 —— 橙色“希望”花芯
    const ro = 36 * E.oBack(prog(t, 4.38, 4.74), 2);
    const h = 52 * E.io3(prog(t, 4.68, 5.02));
    const st = stemTop(t);
    const b = [st[0], st[1] + 6];
    const pts = [], ws = [];
    for (let i = 0; i < N_RIB; i++) {
      const s = i / (N_RIB - 1);
      pts.push([b[0] + 6 * Math.sin(PI * s) * Math.sin(t * 4), b[1] - h * s]);
      ws.push(2 * ro * lerp(1, 0.25, Math.pow(s, 1.4)));
    }
    return { pts, ws };
  }
  function crescentForm(t, side) { // 白色种壳 → 两片弯月，以底部为轴向两侧打开
    const op = E.oBack(prog(t, 3.92, 4.4), 1.3);
    const sink = E.io3(prog(t, 4.35, 5.0));
    const rm = 56, cx = 960, cy = 640;
    const pv = [cx, cy + rm];
    const ang = -side * op * 1.05 - side * 0.35 * sink;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const pts = [], ws = [];
    for (let i = 0; i < N_RIB; i++) {
      const s = i / (N_RIB - 1);
      const a = side < 0 ? PI / 2 + PI * s : PI / 2 - PI * s;
      const q = [cx + Math.cos(a) * rm - pv[0], cy + Math.sin(a) * rm - pv[1]];
      pts.push([pv[0] + q[0] * ca - q[1] * sa + side * (30 * op + 60 * sink), pv[1] + q[0] * sa + q[1] * ca + 34 * sink]);
      const taper = Math.pow(Math.sin(PI * (0.02 + 0.96 * s)), 0.7 * clamp(op));
      ws.push((16 + 16 * clamp(op)) * taper);
    }
    return { pts, ws };
  }

  // ───────────────────────── 流体带 / 旋涡（D 段）─────────────────────────
  const OMEGA = integral(keys([[5.0, 0], [5.5, 3], [6.3, 8], [6.75, 7], [7.3, 2], [7.8, 0.4], [10, 0]]), 4.9, 10);
  const RIN = keys([[5.0, 70], [5.6, 150], [6.3, 50], [6.7, 25], [7.0, 140, 400], [7.6, 1500]]);
  const ROUT = keys([[5.0, 330], [5.55, 1000], [6.05, 780, -900], [6.6, 340], [6.8, 330], [7.25, 1900, 2500], [7.6, 2600]]);
  const WIND = keys([[5.0, 0.6], [5.6, 1.5], [6.6, 5.0], [6.8, 5.0], [7.3, 2.0]]);
  const WSC = keys([[5.0, 1], [5.5, 1.5], [6.2, 1.25], [6.6, 0.95], [7.0, 1.1], [7.5, 0.8]]);
  const CV = t => [960, lerp(470, 540, E.io3(prog(t, 5.0, 6.2)))];
  const CD = [960, 410];

  const ARMS = [
    { col: COL.mint, th: 210, W: 160, enter: true, t0: 4.9 },
    { col: COL.mint, th: 40, W: 150, enter: true, t0: 4.9, fin: 'mint' },
    { col: COL.blue, th: 120, W: 46, enter: true, t0: 4.9 },
    { col: COL.white, th: 160, W: 60, from: t => crescentForm(t, -1), t0: T_SPLIT },
    { col: COL.white, th: 0, W: 60, from: t => crescentForm(t, 1), t0: T_SPLIT },
    { col: COL.jade, th: 320, W: 120, from: t => leafForm(t, 1), t0: 4.1 },
    { col: COL.emerald, th: 240, W: 130, from: t => leafForm(t, -1), t0: 4.1, fin: 'emerald' },
    { col: COL.emerald, th: 80, W: 90, from: stemForm, t0: T_SPLIT, rk: 0.9 },
    { col: COL.orange, th: 280, W: 48, from: orangeForm, t0: 4.38, rk: 0.6 },
  ];
  function armForm(arm, t) {
    const [cx, cy] = CV(t);
    const enter = arm.enter ? 1300 * (1 - E.o3(prog(t, 4.9, 5.85))) : 0;
    const rk = arm.rk || 1;
    const rin = RIN(t) * rk + enter, rout = ROUT(t) * rk + enter * 1.2;
    const wind = WIND(t), th = arm.th * DEG + 0.3 + OMEGA(t);
    const wsc = WSC(t);
    const pts = [], ws = [];
    for (let i = 0; i < N_RIB; i++) {
      const s = i / (N_RIB - 1);
      const R = rin + (rout - rin) * s, a = th - wind * s;
      pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
      ws.push(arm.W * wsc * Math.pow(Math.sin(PI * (0.03 + 0.94 * s)), 0.6) * (1.15 - 0.4 * s));
    }
    return { pts, ws };
  }
  const FINAL_ARC = {
    emerald: { r: 322, a0: 215 * DEG, a1: 112 * DEG, W: 34 },
    mint: { r: 322, a0: 22 * DEG, a1: -78 * DEG, W: 28 },
  };
  function finalArcForm(id, t) {
    const f = FINAL_ARC[id];
    const live = 1 - ss(8.8, T_STILL, t);
    const pts = [], ws = [];
    for (let i = 0; i < N_RIB; i++) {
      const s = i / (N_RIB - 1);
      const a = lerp(f.a0, f.a1, s);
      const r = f.r + 6 * Math.sin(PI * s * 2 + t * 3) * live;
      pts.push([CD[0] + Math.cos(a) * r, CD[1] + Math.sin(a) * r]);
      ws.push(f.W * Math.pow(Math.sin(PI * (0.02 + 0.96 * s)), 0.7));
    }
    return { pts, ws };
  }
  const mixLinear = (A, B, m) => ({
    pts: A.pts.map((p, i) => P2.lerp(p, B.pts[i], m)),
    ws: A.ws.map((w, i) => lerp(w, B.ws[i], m)),
  });
  // 极坐标插值：让旋涡臂沿顺时针“旋入”终版弧线
  function mixPolar(A, cA, B, cB, m) {
    const pol = (p, c) => [Math.hypot(p[0] - c[0], p[1] - c[1]), Math.atan2(p[1] - c[1], p[0] - c[0])];
    const mid = Math.floor(A.pts.length / 2);
    const am = pol(A.pts[mid], cA)[1], bm = pol(B.pts[mid], cB)[1];
    let d0 = (bm - am) % TAU;
    if (d0 < 0) d0 += TAU;
    const c = P2.lerp(cA, cB, m);
    const pts = A.pts.map((p, i) => {
      const [ra, aa] = pol(p, cA), [rb, ab] = pol(B.pts[i], cB);
      let d = ab - aa;
      d += Math.round((d0 - d) / TAU) * TAU;
      const r = lerp(ra, rb, m), a = aa + d * m;
      return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r];
    });
    return { pts, ws: A.ws.map((w, i) => lerp(w, B.ws[i], m)) };
  }
  function armState(arm, t) {
    if (t < arm.t0) return null;
    if (!arm.fin && t > 7.7) return null;
    const mA = E.io3(prog(t, 4.95, 5.65));
    let st;
    if (arm.from && mA < 1) {
      const a = arm.from(t);
      st = mA <= 0 ? a : mixLinear(a, armForm(arm, t), mA);
    } else st = armForm(arm, t);
    if (arm.fin) {
      const mF = E.io3(prog(t, 6.88, 7.75));
      if (mF > 0) st = mixPolar(st, CV(t), finalArcForm(arm.fin, t), CD, mF);
    }
    return st;
  }

  // ───────────────────────── 终版人物（正视）─────────────────────────
  const GIRL_G = [836, 640], BOY_G = [1090, 640];
  const GIRL_S = 1.0, BOY_S = 1.04;
  function standingPose(kind, t) {
    if (kind === 'girl') {
      const u = E.oBack(prog(t, 7.86, 8.5), 1.15);
      return { L: [0.14, 0.1], R: [lerp(0.14, 1.95, u), lerp(0.1, -0.12, u)], look: 4 };
    }
    const u = E.oBack(prog(t, 7.92, 8.32), 1.2);
    const env = bump(t, 8.3, 8.42, 8.95, 9.22);
    const wave = 0.32 * Math.sin((t - 8.3) * TAU * 1.9) * env;
    return { L: [0.12, 0.08], R: [lerp(0.12, 2.35, u), lerp(0.08, 0.6, u) + wave], look: 3 };
  }
  function drawStanding(c, kind, g, sc, pose, mono) {
    const p = mono ? MONO : PAL[kind];
    const boy = kind === 'boy';
    c.save();
    c.translate(g[0], g[1]);
    c.scale(sc, sc);
    const legR = boy ? [19, 16.5, 14] : [17.5, 15, 12.5];
    for (const sd of [-1, 1]) chain(c, [[sd * 18, -205], [sd * 20, -112], [sd * 22, -24]], legR, p.pants);
    for (const sd of [-1, 1]) ellipse(c, sd * 28, -12, 25, 12, 0, p.shoe);
    c.fillStyle = p.pants;
    c.beginPath();
    c.roundRect(boy ? -40 : -37, -228, boy ? 80 : 74, 48, 16);
    c.fill();
    c.fillStyle = p.skin;
    c.beginPath();
    c.roundRect(-11, -362, 22, 40, 9);
    c.fill();
    // 躯干
    c.fillStyle = p.top;
    c.beginPath();
    if (boy) {
      c.moveTo(-40, -186); c.lineTo(40, -186); c.lineTo(48, -298);
      c.quadraticCurveTo(52, -342, 12, -344); c.lineTo(-12, -344);
      c.quadraticCurveTo(-52, -342, -48, -298); c.closePath();
    } else {
      c.moveTo(-35, -186); c.lineTo(35, -186); c.lineTo(42, -296);
      c.quadraticCurveTo(45, -338, 10, -340); c.lineTo(-10, -340);
      c.quadraticCurveTo(-45, -338, -42, -296); c.closePath();
    }
    c.fill();
    if (!mono && !boy) {
      c.fillStyle = p.detail;
      c.beginPath();
      c.moveTo(-14, -340); c.lineTo(14, -340); c.lineTo(0, -316); c.closePath();
      c.fill();
    }
    if (!mono && !boy) {
      // 齐肩短发（后层）+ 翡翠绿发梢
      c.save();
      c.beginPath();
      c.moveTo(-45, -388);
      c.bezierCurveTo(-47, -428, -24, -446, 0, -446);
      c.bezierCurveTo(24, -446, 47, -428, 45, -388);
      c.lineTo(46, -346); c.quadraticCurveTo(46, -333, 34, -335);
      c.lineTo(-34, -335); c.quadraticCurveTo(-46, -333, -46, -346);
      c.closePath();
      c.fillStyle = p.hair;
      c.fill();
      c.clip();
      c.fillStyle = p.tip;
      c.fillRect(-60, -357, 120, 30);
      c.restore();
    } else if (mono && !boy) {
      c.beginPath();
      c.roundRect(-46, -446, 92, 112, 40);
      c.fill();
    }
    // 手臂
    const shX = boy ? 41 : 35, ua = 70, fa = 64, ar = boy ? 12 : 10.5;
    for (const sd of [-1, 1]) {
      const [a, b] = sd < 0 ? pose.L : pose.R;
      const sh = [sd * shX, -322];
      const el = [sh[0] + sd * Math.sin(a) * ua, sh[1] + Math.cos(a) * ua];
      const wr = [el[0] + sd * Math.sin(a + b) * fa, el[1] + Math.cos(a + b) * fa];
      const hd = [wr[0] + sd * Math.sin(a + b) * 7, wr[1] + Math.cos(a + b) * 7];
      chain(c, [sh, el, wr], [ar, ar * 0.95, ar * 0.85], p.skin);
      circle(c, hd[0], hd[1], ar * 1.12, p.skin);
      chain(c, [sh, P2.lerp(sh, el, 0.55)], [ar + 5, ar + 4], p.sleeve);
    }
    // 头
    const hr = boy ? [34, 39] : [33, 38];
    ellipse(c, -hr[0] + 1, -390, 7, 10, 0, p.skinD);
    ellipse(c, hr[0] - 1, -390, 7, 10, 0, p.skinD);
    ellipse(c, 0, -393, hr[0], hr[1], 0, p.skin);
    if (!mono) {
      const lk = pose.look;
      ellipse(c, -12 + lk, -391, 3.8, 5.4, 0, p.eye);
      ellipse(c, 12 + lk, -391, 3.8, 5.4, 0, p.eye);
      c.fillStyle = p.mouth;
      c.beginPath();
      c.ellipse(lk, -371, 9.5, 6.8, 0, 0, PI);
      c.fill();
    }
    c.fillStyle = p.hair;
    c.beginPath();
    if (boy) {
      c.moveTo(-37, -380);
      c.bezierCurveTo(-41, -432, -14, -447, 4, -446);
      c.bezierCurveTo(29, -445, 43, -428, 37, -382);
      c.bezierCurveTo(33, -404, 20, -414, 2, -414);
      c.bezierCurveTo(-16, -414, -28, -404, -31, -380);
    } else {
      c.moveTo(-37, -384);
      c.bezierCurveTo(-39, -430, -14, -443, 4, -442);
      c.bezierCurveTo(28, -441, 42, -425, 37, -390);
      c.bezierCurveTo(30, -408, 14, -419, -4, -415);
      c.bezierCurveTo(-20, -411, -30, -400, -35, -372);
    }
    c.closePath();
    c.fill();
    c.restore();
  }
  // 人物剪影中心（用于液态凝聚）
  const silCenter = (g, sc) => [g[0], g[1] - 225 * sc];

  // ───────────────────────── 标题 ─────────────────────────
  const TITLE = '筑梦绿发，聚力启航';
  const TITLE_Y = 815, TITLE_FS = 112, TITLE_LS = 16;
  const glyphX = (() => {
    const adv = TITLE_FS + TITLE_LS;
    const total = adv * TITLE.length - TITLE_LS;
    return [...TITLE].map((ch, i) => 960 - total / 2 + adv * i + TITLE_FS / 2);
  })();
  function drawTitleGlyphs(c, t, preBlur) {
    c.font = `900 ${TITLE_FS}px TitleBlack`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    [...TITLE].forEach((ch, i) => {
      const u = prog(t, 8.0 + i * 0.075, 8.72 + i * 0.075);
      if (u <= 0) return;
      const a = clamp(u * 2.2);
      const b = preBlur ? 26 * (1 - E.o3(u)) : 0;
      c.save();
      c.globalAlpha = a;
      c.filter = b > 0.25 ? `blur(${b.toFixed(2)}px)` : 'none';
      c.fillText(ch, glyphX[i], TITLE_Y);
      c.restore();
    });
  }

  // ───────────────────────── 主渲染 ─────────────────────────
  function renderFrame(t) {
    const c = ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.filter = 'none';
    c.globalAlpha = 1;
    c.fillStyle = COL.bg;
    c.fillRect(0, 0, W, H);

    // A/B：奔跑、传递、推出、飞行尾迹
    if (t < 3.9) drawBgBlobs(c, t);
    drawTrail(c, t);
    if (t < 3.5) {
      const G = runnerRig('girl', t), B = runnerRig('boy', t);
      if (G.x > -300) drawRunner(c, G);
      if (B.x > -300) drawRunner(c, B);
      if (t < T_REL) {
        const sd = seedsInHands(t, G, B);
        if (sd.merging) {
          const xs = sd.list.map(q => q.p[0]), ys = sd.list.map(q => q.p[1]);
          const box = [Math.min(...xs) - 70, Math.min(...ys) - 70, Math.max(...xs) - Math.min(...xs) + 140, Math.max(...ys) - Math.min(...ys) + 140];
          const blur = 5 * (1 - ss(1.86, 1.98, t));
          goo(c, box, blur, COL.white, g => sd.list.forEach(q => circle(g, q.p[0], q.p[1], q.r, '#fff')));
        } else {
          sd.list.forEach(q => circle(c, q.p[0], q.p[1], q.r, COL.white));
        }
      }
    }
    if (t >= T_REL && t < T_SPLIT) drawFlyingSeed(c, t);

    // E：白色新空间 + 浅绿底盘
    if (t > 6.78) {
      const rw = 1260 * E.io3(prog(t, 6.78, 7.4));
      const cvp = CV(t);
      blob(c, cvp[0], cvp[1], rw, rw, t * 2, 0.4, 0.06 * (1 - ss(7.3, 7.45, t)), COL.white, 16, 0);
    }
    if (t > 7.12) {
      const u = prog(t, 7.12, 7.62);
      const rd = 300 * E.oBack(u, 1.3);
      const cen = P2.lerp(CV(t), CD, E.io3(u));
      blob(c, cen[0], cen[1], rd, rd, t * 1.6, 2.2, 0.03 * (1 - ss(8.8, T_STILL, t)), COL.pale, 16, 0);
    }

    // C/D：种壳、新芽、叶片、流体带、旋涡
    if (t >= T_SPLIT) ARMS.forEach(arm => ribbon(c, armState(arm, t), arm.col));

    // 旋涡核心
    const RC = keys([[5.55, 0], [6.35, 72], [6.85, 84]]);
    if (t > 5.55 && t < 6.9) {
      const cvp = CV(t);
      blob(c, cvp[0], cvp[1], RC(t), RC(t), t * 3, 5.5, 0.05, COL.emerald, 14, 0);
    }

    // E：核心一分为二 → 液态凝聚成两个人物剪影 → 液面上升填色
    if (t >= 6.9) {
      const gp = standingPose('girl', t), bp = standingPose('boy', t);
      if (t < 7.98) {
        const cvp = CV(t);
        const sp = E.io3(prog(t, 6.9, 7.3));
        const k = E.oBack(prog(t, 7.1, 7.6), 1.4);
        const rb = lerp(84, 58, sp) * (1 - E.i2(prog(t, 7.2, 7.56)));
        const blur = 16 * (1 - E.io3(prog(t, 7.25, 7.7)));
        const gc = silCenter(GIRL_G, GIRL_S), bc = silCenter(BOY_G, BOY_S);
        goo(c, [560, 60, 800, 700], blur, COL.emerald, g => {
          [[gc, GIRL_G, GIRL_S, 'girl', gp], [bc, BOY_G, BOY_S, 'boy', bp]].forEach(([cen, gg, sc, kind, pose]) => {
            const bp2 = P2.lerp(cvp, cen, sp);
            circle(g, bp2[0], bp2[1], rb, '#fff');
            if (k > 0.001) {
              g.save();
              g.translate(cen[0], cen[1]);
              g.scale(lerp(0.3, 1, k), lerp(0.12, 1, k));
              g.translate(-cen[0], -cen[1]);
              drawStanding(g, kind, gg, sc, pose, true);
              g.restore();
            }
          });
        });
      }
      const wipe = (g, sc, t0, t1) => {
        const u = E.io3(prog(t, t0, t1));
        const lvl = lerp(g[1] + 12, g[1] - 470 * sc, u);
        const amp = 9 * (1 - ss(t1 - 0.12, t1, t));
        c.beginPath();
        c.moveTo(g[0] - 220, g[1] + 80);
        for (let x = -220; x <= 220; x += 8) c.lineTo(g[0] + x, lvl + amp * Math.sin(x * 0.045 + t * 14));
        c.lineTo(g[0] + 220, g[1] + 80);
        c.closePath();
      };
      [[GIRL_G, GIRL_S, 'girl', gp, 7.5, 7.94], [BOY_G, BOY_S, 'boy', bp, 7.56, 8.0]].forEach(([g, sc, kind, pose, t0, t1]) => {
        if (t < t0) return;
        c.save();
        if (t < t1) { wipe(g, sc, t0, t1); c.clip(); }
        drawStanding(c, kind, g, sc, pose, false);
        c.restore();
      });
    }

    // F：标题由流体凝聚成形
    if (t >= 8.0) {
      if (t < T_STILL) {
        goo(c, [300, TITLE_Y - 150, 1320, 300], 0, COL.emerald, g => drawTitleGlyphs(g, t, true));
      } else {
        c.fillStyle = COL.emerald;
        drawTitleGlyphs(c, t, false);
      }
    }
  }

  window.renderFrame = renderFrame;
  window.renderPNG = t => { renderFrame(t); return cv.toDataURL('image/png').split(',')[1]; };
  window.animReady = document.fonts.load(`900 ${TITLE_FS}px TitleBlack`, TITLE).then(() => {
    initFlight();
    renderFrame(0);
    return true;
  });

  // 浏览器预览：?play 循环播放，?t=秒 定格
  const qs = new URLSearchParams(location.search);
  window.animReady.then(() => {
    if (qs.has('t')) renderFrame(parseFloat(qs.get('t')));
    else if (qs.has('play')) {
      const start = performance.now();
      const loop = now => { renderFrame(((now - start) / 1000) % 10); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
  });
})();
