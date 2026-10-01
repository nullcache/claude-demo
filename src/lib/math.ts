export type P = [number, number];

export const PI = Math.PI;
export const TAU = PI * 2;
export const DEG = PI / 180;

export const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
export const prog = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
export const ss = (a: number, b: number, t: number) => {
  const x = prog(t, a, b);
  return x * x * (3 - 2 * x);
};
/** 0 → 1 (a..b) 保持 → 0 (c..d) */
export const bump = (t: number, a: number, b: number, c: number, d: number) => ss(a, b, t) * (1 - ss(c, d, t));

export const E = {
  io2: (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
  io3: (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  io4: (x: number) => (x < 0.5 ? 8 * x ** 4 : 1 - Math.pow(-2 * x + 2, 4) / 2),
  o2: (x: number) => 1 - (1 - x) * (1 - x),
  o3: (x: number) => 1 - Math.pow(1 - x, 3),
  o4: (x: number) => 1 - Math.pow(1 - x, 4),
  i2: (x: number) => x * x,
  i3: (x: number) => x * x * x,
  oBack: (x: number, s = 1.6) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2),
  oElastic: (x: number) =>
    x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (TAU / 3)) + 1,
};

export const V = {
  add: (p: P, q: P): P => [p[0] + q[0], p[1] + q[1]],
  sub: (p: P, q: P): P => [p[0] - q[0], p[1] - q[1]],
  mul: (p: P, k: number): P => [p[0] * k, p[1] * k],
  lerp: (p: P, q: P, u: number): P => [lerp(p[0], q[0], u), lerp(p[1], q[1], u)],
  len: (p: P) => Math.hypot(p[0], p[1]),
  norm: (p: P): P => {
    const l = Math.hypot(p[0], p[1]) || 1;
    return [p[0] / l, p[1] / l];
  },
  /** y 轴向下坐标系里，正角度 = 屏幕上顺时针 */
  rot: (p: P, a: number): P => {
    const c = Math.cos(a), s = Math.sin(a);
    return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
  },
};

/** Hermite 关键帧 [[t, value, slope?], ...] */
export function keys(k: Array<[number, number, number?]>) {
  return (t: number) => {
    if (t <= k[0][0]) return k[0][1];
    const n = k.length;
    if (t >= k[n - 1][0]) return k[n - 1][1];
    let i = 0;
    while (t > k[i + 1][0]) i++;
    const [t0, v0, d0 = 0] = k[i];
    const [t1, v1, d1 = 0] = k[i + 1];
    const h = t1 - t0, u = (t - t0) / h, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * v0 + (u3 - 2 * u2 + u) * h * d0 + (-2 * u3 + 3 * u2) * v1 + (u3 - u2) * h * d1;
  };
}

/** 数值积分（速度 → 位移），返回可查询的函数 */
export function integral(f: (t: number) => number, t0: number, t1: number, dt = 1 / 2000) {
  const n = Math.ceil((t1 - t0) / dt) + 1;
  const acc = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const a = t0 + (i - 1) * dt, b = t0 + i * dt;
    acc[i] = acc[i - 1] + (f(a) + f(b)) * 0.5 * dt;
  }
  return (t: number) => {
    const x = (clamp(t, t0, t1) - t0) / dt;
    const i = Math.min(n - 2, Math.floor(x)), u = x - i;
    return acc[i] * (1 - u) + acc[i + 1] * u;
  };
}

/** 循环（相位 0..1）上的 Hermite 样条：用于跑步循环中的脚/手轨迹 */
export function cycle(k: Array<[number, P]>) {
  const n = k.length;
  const tan = (m: number): P => {
    const a = (m - 1 + n) % n, b = (m + 1) % n;
    let ta = k[a][0], tb = k[b][0];
    if (a > m) ta -= 1;
    if (b < m) tb += 1;
    const dt = tb - ta;
    return [(k[b][1][0] - k[a][1][0]) / dt, (k[b][1][1] - k[a][1][1]) / dt];
  };
  const tans = k.map((_, i) => tan(i));
  return (ph: number): P => {
    const p = ((ph % 1) + 1) % 1;
    let i = n - 1;
    for (let j = 0; j < n; j++) if (k[j][0] <= p) i = j;
    const j = (i + 1) % n;
    const t0 = k[i][0];
    const t1 = j === 0 ? k[0][0] + 1 : k[j][0];
    let pp = p;
    if (pp < t0) pp += 1;
    const h = t1 - t0, u = (pp - t0) / h, u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    return [
      h00 * k[i][1][0] + h10 * h * tans[i][0] + h01 * k[j][1][0] + h11 * h * tans[j][0],
      h00 * k[i][1][1] + h10 * h * tans[i][1] + h01 * k[j][1][1] + h11 * h * tans[j][1],
    ];
  };
}
export function cycleS(k: Array<[number, number]>) {
  const c = cycle(k.map(([t, v]) => [t, [v, 0]] as [number, P]));
  return (ph: number) => c(ph)[0];
}
