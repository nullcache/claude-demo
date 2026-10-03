"""奶娃（网络 meme 里的“奶龙/奶蛙”）的形体定义：一个有向距离场（SDF）。

所有尺寸以身高 = 1 归一化（脚底 z=0，头顶 z=1），角色面朝 -Y，角色的左手在 +X。
比例从三张参考图逐行量出来（refs/ 下，按身高归一化、以两脚中点为中心）：
  正面站姿            → 身体（含手臂）每个高度的宽度、腿、手、脚趾、眼睛、嘴的位置
  三视图的侧面 / 背面   → 每个高度的前后边界（肚子、背、头往前探、下巴下的内收）、尾巴
身体和头是一整块“放样”：每个高度的横截面是椭圆（半宽 a、中心 yc、前后半径 ry），
三条曲线用 PCHIP 插值，头顶和身体底部各收成圆顶。手臂、腿是圆锥台，手指/脚趾是小球和胶囊。
"""
from __future__ import annotations

import numpy as np
from scipy.interpolate import PchipInterpolator

# ── 身体 + 头：正面半宽 a(z) ───────────────────────────────────────────────────
FRONT = np.array([
    # z      a
    [0.104, 0.000],
    [0.112, 0.105],
    [0.125, 0.160],
    [0.145, 0.196],
    [0.170, 0.218],
    [0.200, 0.236],
    [0.240, 0.258],
    [0.280, 0.273],
    [0.320, 0.282],
    [0.380, 0.287],
    [0.420, 0.284],
    [0.460, 0.274],
    [0.500, 0.256],
    [0.540, 0.239],
    [0.580, 0.222],
    [0.620, 0.206],
    [0.660, 0.198],
    [0.700, 0.182],
    [0.730, 0.168],
    [0.760, 0.157],
    [0.800, 0.137],
    [0.840, 0.121],
    [0.880, 0.113],
    [0.920, 0.106],
    [0.945, 0.098],
    [0.965, 0.083],
    [0.980, 0.066],
    [0.991, 0.046],
    [0.997, 0.026],
    [1.000, 0.000],
])
# 0.42 以上是躯干本身：手臂（粗胖的上臂、圆圆的肩头）挂在两侧，正面剪影 = 躯干 + 手臂

# ── 侧面：前边界 yf、后边界 yb（模型坐标，负 = 往前）──────────────────────────────
# 量自三视图侧面（脸朝右），去掉了凸出的眼睛、嘴尖和尾巴
SIDE = np.array([
    # z      yf      yb
    [0.104, -0.010, -0.010],
    [0.112, -0.075, 0.060],
    [0.125, -0.100, 0.100],
    [0.145, -0.122, 0.140],
    [0.170, -0.152, 0.180],
    [0.200, -0.185, 0.214],
    [0.240, -0.219, 0.243],
    [0.280, -0.243, 0.258],
    [0.320, -0.258, 0.262],
    [0.360, -0.265, 0.254],
    [0.400, -0.265, 0.245],
    [0.440, -0.261, 0.238],
    [0.480, -0.250, 0.227],
    [0.520, -0.239, 0.219],
    [0.560, -0.221, 0.208],
    [0.600, -0.199, 0.199],
    [0.640, -0.179, 0.188],
    [0.680, -0.161, 0.176],
    [0.720, -0.152, 0.159],
    [0.760, -0.161, 0.139],
    [0.800, -0.183, 0.112],
    [0.840, -0.212, 0.080],
    [0.880, -0.222, 0.042],
    [0.920, -0.218, 0.009],
    [0.945, -0.209, -0.008],
    [0.965, -0.198, -0.027],
    [0.980, -0.181, -0.042],
    [0.991, -0.160, -0.065],
    [0.997, -0.142, -0.085],
    [1.000, -0.112, -0.112],
])
Z_BOT, Z_TOP = FRONT[0, 0], FRONT[-1, 0]


def _smooth_curve(zs, vals, sigma=0.022, keep_lo=0.17, keep_hi=0.95):
    """量出来的点有像素级噪声，直接插值会在每个点留下一道细棱。先密采样，再在中段做高斯平滑
    （两端的圆顶保持原样），最后在密集点上重新插值。"""
    from scipy.ndimage import gaussian_filter1d
    raw = PchipInterpolator(zs, vals)
    zd = np.linspace(zs[0], zs[-1], 1200)
    vd = raw(zd)
    sm = gaussian_filter1d(vd, sigma / (zd[1] - zd[0]), mode='nearest')
    w = np.clip((zd - keep_lo) / 0.04, 0, 1) * np.clip((keep_hi - zd) / 0.03, 0, 1)
    return PchipInterpolator(zd, vd * (1 - w) + sm * w, extrapolate=False)


_A = _smooth_curve(FRONT[:, 0], FRONT[:, 1])
_YF = _smooth_curve(SIDE[:, 0], SIDE[:, 1])
_YB = _smooth_curve(SIDE[:, 0], SIDE[:, 2])
_dA, _dYF, _dYB = _A.derivative(), _YF.derivative(), _YB.derivative()


def profile(z):
    """返回 (a, yc, ry)：该高度横截面椭圆的半宽、前后中心、前后半径。"""
    z = np.clip(np.asarray(z, dtype=np.float64), Z_BOT, Z_TOP)
    a = np.nan_to_num(_A(z), nan=0.0)
    yf, yb = np.nan_to_num(_YF(z), nan=0.0), np.nan_to_num(_YB(z), nan=0.0)
    return a, (yf + yb) / 2, (yb - yf) / 2


def face_power(z, front):
    """横截面的“方度”：身体是椭圆（2），头的前半边略方（脸比较平，眼睛落在脸的两个前角上）。"""
    w = np.clip((z - 0.74) / 0.10, 0, 1) * np.clip((0.995 - z) / 0.05, 0, 1)
    return 2.0 + 0.55 * w * front


def _rho(u, v, n):
    au, av = np.abs(u) + 1e-12, np.abs(v) + 1e-12
    r = (au ** n + av ** n) ** (1 / n)
    du = np.sign(u) * au ** (n - 1) * r ** (1 - n)
    dv = np.sign(v) * av ** (n - 1) * r ** (1 - n)
    return r, du, dv


def sd_torso(p):
    """身体+头的距离：放样隐函数除以梯度长度（贴近表面时就是真实距离，远处只保证正负号）。"""
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    zc = np.clip(z, Z_BOT + 1e-4, Z_TOP - 1e-4)
    a = np.maximum(_A(zc), 1e-4)
    yf, yb = _YF(zc), _YB(zc)
    yc, ry = (yf + yb) / 2, np.maximum((yb - yf) / 2, 1e-4)
    da = _dA(zc)
    dyc, dry = (_dYF(zc) + _dYB(zc)) / 2, (_dYB(zc) - _dYF(zc)) / 2
    u, v = x / a, (y - yc) / ry
    n = face_power(zc, (v < 0).astype(float))
    rho, du, dv = _rho(u, v, n)
    gx = du / a
    gy = dv / ry
    gz = du * (-u * da / a) + dv * (-(dyc + v * dry) / ry)
    d = (rho - 1) / np.sqrt(gx * gx + gy * gy + gz * gz)
    # 放样两端之外：到端点的距离
    top = np.array([0.0, -0.112, Z_TOP])
    bot = np.array([0.0, -0.010, Z_BOT])
    d = np.where(z >= Z_TOP, np.linalg.norm(p - top, axis=1), d)
    d = np.where(z <= Z_BOT, np.linalg.norm(p - bot, axis=1), d)
    return d


def torso_inside(p):
    """只判断在不在身体里（建网格时配合距离变换用）。"""
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    a, yc, ry = profile(z)
    ok = (z > Z_BOT) & (z < Z_TOP) & (a > 0) & (ry > 0)
    with np.errstate(divide='ignore', invalid='ignore'):
        u, v = x / a, (y - yc) / ry
        n = face_power(z, (v < 0).astype(float))
        r = np.abs(u) ** n + np.abs(v) ** n
    return ok & (r < 1)


# ── SDF 基本体 ───────────────────────────────────────────────────────────────

def smin(a, b, k):
    if np.isscalar(k) and k <= 0:
        return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b * (1 - h) + a * h - k * h * (1 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def sd_ellipsoid(p, c, r):
    q = (p - np.asarray(c)) / np.asarray(r)
    k0 = np.linalg.norm(q, axis=-1)
    k1 = np.linalg.norm(q / np.asarray(r), axis=-1)
    return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)


def sd_sphere(p, c, r):
    return np.linalg.norm(p - np.asarray(c), axis=-1) - r


def sd_round_cone(p, a, b, ra, rb):
    """两端半径不同的胶囊（Inigo Quilez 的 round cone）。"""
    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64)
    ba = b - a
    l2 = ba @ ba
    rr = ra - rb
    a2 = l2 - rr * rr
    il2 = 1.0 / l2
    pa = p - a
    y = pa @ ba
    z = y - l2
    xv = pa * l2 - np.outer(y, ba)
    x2 = np.einsum('ij,ij->i', xv, xv)
    y2 = y * y * l2
    z2 = z * z * l2
    k = np.sign(rr) * rr * rr * x2
    out = np.empty(len(p))
    m1 = np.sign(z) * a2 * z2 > k
    m2 = np.sign(y) * a2 * y2 < k
    m3 = ~(m1 | m2)
    out[m1] = np.sqrt(x2[m1] + z2[m1]) * il2 - rb
    out[m2] = np.sqrt(x2[m2] + y2[m2]) * il2 - ra
    out[m3] = (np.sqrt(x2[m3] * a2 * il2) + y[m3] * rr) * il2 - ra
    return out


def sd_capsule(p, a, b, r):
    return sd_round_cone(p, a, b, r, r)


def mirror(v, s):
    return np.array([v[0] * s, v[1], v[2]])


# ── 手臂（左臂 +X，右臂镜像）：从身体两侧垂下，上臂和身体融成一块 ─────────────────────
SHOULDER, ELBOW, WRIST = np.array([0.206, 0.000, 0.640]), np.array([0.282, 0.012, 0.500]), np.array([0.310, -0.030, 0.410])
R_SHOULDER, R_ELBOW, R_WRIST = 0.064, 0.060, 0.050
# 手：深橄榄色的小手，掌心朝身体，三根短手指往下、指尖微微往外张，拇指在前
PALM_C, PALM_R = np.array([0.322, -0.040, 0.374]), np.array([0.027, 0.033, 0.033])
FINGERS = [
    # (根部, 中段, 指尖, 半径)：往下再往身体一侧勾
    (np.array([0.326, -0.064, 0.356]), np.array([0.326, -0.066, 0.334]), np.array([0.311, -0.064, 0.322]), 0.0122),
    (np.array([0.328, -0.040, 0.350]), np.array([0.328, -0.040, 0.326]), np.array([0.312, -0.039, 0.315]), 0.0130),
    (np.array([0.326, -0.016, 0.354]), np.array([0.326, -0.014, 0.332]), np.array([0.311, -0.014, 0.322]), 0.0122),
]
THUMB = (np.array([0.310, -0.070, 0.390]), np.array([0.302, -0.082, 0.376]), np.array([0.295, -0.084, 0.366]), 0.0118)

# ── 腿：粗短的柱子（横截面前后略长），脚就是柱子底部往前多一点 ─────────────────────────
HIP, ANKLE = np.array([0.140, 0.010, 0.230]), np.array([0.140, 0.004, 0.050])
R_HIP, R_ANKLE = 0.090, 0.080
LEG_DEPTH = 1.20  # 前后半径 / 左右半径
FOOT_C, FOOT_R, FOOT_YAW = np.array([0.140, -0.010, 0.030]), np.array([0.084, 0.092, 0.032]), 0.0
# 脚趾：每只脚前沿三颗深棕色圆指甲
TOES = [(-0.054, 0.019), (0.0, 0.020), (0.054, 0.019)]  # (相对 x, 半径)
TOE_Y, TOE_Z = -0.090, 0.016

# ── 尾巴：从后腰往后伸出的粗短尾巴，尖端略微上翘 ────────────────────────────────────
TAIL = [  # (中心, 半径)：水平往后伸的锥形尾巴，尖端钝圆、微微上翘
    (np.array([0.0, 0.150, 0.225]), 0.095),
    (np.array([0.0, 0.370, 0.250]), 0.017),
]
TAIL_SQUASH = (1.28, 1.15)  # 左右、上下方向各压扁一点
# 尾巴下沿：从尾尖一条长长的斜线一直连到脚后跟（像恐龙尾巴，尾根和大腿连成一体）
TAIL_FIN = ((np.array([0.0, 0.358, 0.240]), 0.016), (np.array([0.0, 0.180, 0.176]), 0.026))

# ── 脸 ─────────────────────────────────────────────────────────────────────────
# 眼睛：贴在头顶前侧的圆盘（大球露出一小块球冠），虹膜灰绿、大黑瞳
EYE_X, EYE_Z = 0.071, 0.923
EYE_DISC = 0.038      # 露出来的圆盘半径（含外圈深色环）
EYE_BULGE = 0.0110    # 圆盘鼓出皮肤的高度（侧面也看得见）
EYE_R = (EYE_DISC ** 2 + EYE_BULGE ** 2) / (2 * EYE_BULGE)  # 眼球半径
PUPIL = 0.0205        # 瞳孔半径（在圆盘上量）
MOUTH_Z = 0.862
MOUTH_HALF = 0.037


def torso_surface(x, z):
    """身体正面（y 最小一侧）在 (x, z) 处的表面点和外法线。"""
    a, yc, ry = (float(v) for v in profile(z))
    t = np.clip(x / a, -0.999, 0.999)
    n = float(face_power(z, 1.0))
    y = yc - ry * (1 - abs(t) ** n) ** (1 / n)
    p = np.array([[x, y, z]])
    e = 1e-4
    g = np.array([(sd_torso(p + d) - sd_torso(p - d))[0] for d in np.eye(3) * e]) / (2 * e)
    return p[0], g / np.linalg.norm(g)


def head_surface(theta, z):
    """头部横截面上、偏离正前方 theta（弧度）的表面点和外法线（兼容旧接口）。"""
    a, yc, ry = (float(v) for v in profile(z))
    return torso_surface(a * np.sin(theta), z)


EYE_YAW = np.radians(27)  # 眼睛朝前偏外 27°（正面看圆盘宽:高 ≈ 0.89），视线水平


def eye_frame(side):
    """返回 (眼球中心, 视线方向)。side=+1 左眼（+X），-1 右眼。"""
    pt, n = torso_surface(EYE_X * side, EYE_Z)
    axis = np.array([np.sin(EYE_YAW) * side, -np.cos(EYE_YAW), 0.0])
    center = pt + axis * (EYE_BULGE - EYE_R)
    return center, axis


def mouth_line():
    """嘴：一道平滑的弧线（中间高、两头低）。点落在真实表面上（含上唇的檐）。"""
    pts = []
    for u in np.linspace(-1, 1, 15):
        z = MOUTH_Z + 0.0065 * (1 - u * u)
        pt, n = torso_surface(u * MOUTH_HALF, z)
        # 沿法线找到合成后表面（parts 里加了鼻梁和小尖）
        for _ in range(3):
            d = sdf(pt[None])[0][0]
            pt = pt - n * d
        pts.append(pt + n * 0.0003)
    return np.array(pts)


# 手臂姿势：ARM_ABDUCT=0 时就是参考图的自然垂放
ARM_ABDUCT = 0.0
ARM_PIVOT = np.array([0.175, 0.004, 0.660])


def arm_rot(s, angle=None):
    a = ARM_ABDUCT if angle is None else angle
    th = -a * s
    c, sn = np.cos(th), np.sin(th)
    return np.array([[c, 0, sn], [0, 1, 0], [-sn, 0, c]])


def arm_to_apose(v, s):
    pv = mirror(ARM_PIVOT, s)
    return arm_rot(s) @ (np.asarray(v) - pv) + pv


def arm_query(p, s):
    pv = mirror(ARM_PIVOT, s)
    return (p - pv) @ arm_rot(s) + pv


def sd_leg(p, s):
    c = mirror(HIP, s)
    q = p - np.array([c[0], 0.0, 0.0])
    q = np.stack([q[:, 0], (q[:, 1] - c[1]) / LEG_DEPTH, q[:, 2]], axis=1)
    d = sd_round_cone(q, (0, 0, ANKLE[2]), (0, 0, HIP[2]), R_ANKLE, R_HIP)
    return d * (1 + (LEG_DEPTH - 1) * 0.5)


def sd_foot(p, s):
    q = p - mirror(FOOT_C, s)
    f = sd_ellipsoid(q, (0, 0, 0), FOOT_R)
    return f


def parts(p, torso=None):
    """各部位的距离（未合并），用来上色和分配骨骼权重。"""
    d = {}
    body = sd_torso(p) if torso is None else torso
    # “嘴套”：两眼之间往下到嘴的一块往前凸的区域，两边脸颊往后收
    mz, _ = torso_surface(0.0, 0.893)
    body = smin(body, sd_ellipsoid(p, mz + np.array([0, 0.014, 0]), (0.048, 0.025, 0.036)), 0.02)
    # 上唇沿嘴线微微鼓一点（很缓，正面看不出包，侧面看嘴线处是脸最靠前的地方）
    lip, _ = torso_surface(0.0, MOUTH_Z + 0.010)
    body = smin(body, sd_ellipsoid(p, lip + np.array([0, 0.008, 0.0]), (MOUTH_HALF * 1.1, 0.012, 0.014)), 0.02)
    # 眼睛是单独的眼球物体，嵌在头里只露出一小块球冠，皮肤不用挖
    d['body'] = body
    for s, tag in ((1, 'L'), (-1, 'R')):
        S, E, W_ = mirror(SHOULDER, s), mirror(ELBOW, s), mirror(WRIST, s)
        pa = arm_query(p, s)
        d[f'upperarm.{tag}'] = sd_round_cone(pa, S, E, R_SHOULDER, R_ELBOW)
        d[f'forearm.{tag}'] = sd_round_cone(pa, E, W_, R_ELBOW, R_WRIST)
        hand = sd_ellipsoid(pa, mirror(PALM_C, s), PALM_R)
        hand = smin(hand, sd_capsule(pa, W_, mirror(PALM_C, s), 0.032), 0.010)
        for a, b, c, r in FINGERS + [THUMB]:
            f = smin(sd_capsule(pa, mirror(a, s), mirror(b, s), r), sd_round_cone(pa, mirror(b, s), mirror(c, s), r, r * 0.85), 0.004)
            hand = smin(hand, f, 0.005)
        d[f'hand.{tag}'] = hand
        d[f'leg.{tag}'] = sd_leg(p, s)
        foot = sd_foot(p, s)
        foot = smax(foot, -p[:, 2], 0.004)  # 脚底平
        d[f'foot.{tag}'] = foot
        toes = np.full(len(p), 1e9)
        for dx, rt in TOES:
            c = mirror(FOOT_C, s) * np.array([1, 0, 0]) + np.array([dx * s, TOE_Y, TOE_Z])
            toes = np.minimum(toes, sd_ellipsoid(p, c, (rt, rt * 1.05, rt * 0.9)))
        d[f'toes.{tag}'] = toes
    sx, sz = TAIL_SQUASH
    zc = TAIL[0][0][2]
    q = np.stack([p[:, 0] * sx, p[:, 1], (p[:, 2] - zc) * sz + zc], axis=1)
    tail = np.full(len(p), 1e9)
    for (c0, r0), (c1, r1) in zip(TAIL[:-1], TAIL[1:]):
        c0q = np.array([c0[0], c0[1], (c0[2] - zc) * sz + zc])
        c1q = np.array([c1[0], c1[1], (c1[2] - zc) * sz + zc])
        tail = smin(tail, sd_round_cone(q, c0q, c1q, r0, r1), 0.02)
    tail = tail / (sx * sz) ** 0.5
    qf = p * np.array([sx, 1.0, 1.0])
    (f0, fr0), (f1, fr1) = TAIL_FIN
    fin = sd_round_cone(qf, f0, f1, fr0, fr1) / sx ** 0.5
    d['tail'] = smin(tail, fin, 0.03)
    return d


def combine(d):
    """合成一整块皮。"""
    # 尾巴上沿顺着后背平滑长出来，下沿轮廓清楚一点（背面看是一颗往下指的水滴）
    p_ = d['_p']
    k_tail = 0.024 + 0.06 * np.clip((p_[:, 2] - 0.22) / 0.12, 0, 1)
    total = smin(d['body'], d['tail'], k_tail)
    for tag in ('L', 'R'):
        arm = smin(d[f'upperarm.{tag}'], d[f'forearm.{tag}'], 0.02)
        arm = smin(arm, d[f'hand.{tag}'], 0.010)
        # 肩头和身体融得很软（圆圆的一包），往下整条手臂和身体之间留一道深折缝
        p_ = d['_p']
        k_arm = 0.005 + 0.07 * np.clip((p_[:, 2] - 0.60) / 0.10, 0, 1) ** 1.5
        total = smin(total, arm, k_arm)
        leg = smin(d[f'leg.{tag}'], d[f'foot.{tag}'], 0.03)
        leg = smin(leg, d[f'toes.{tag}'], 0.004)
        # 大腿外侧和肚子下沿稍微融软一点（肚子像个球垂在腿上，留一点折痕），裆下面的拱形保持清楚
        outer = np.clip((np.abs(p_[:, 0]) - 0.07) / 0.08, 0, 1)
        total = smin(total, leg, 0.014 + 0.026 * outer)
    return total


def sdf(p, torso=None):
    d = parts(p, torso)
    d['_p'] = p
    return combine(d), d


BOUNDS = np.array([[-0.42, 0.42], [-0.32, 0.44], [-0.005, 1.03]])


def volume(voxel):
    """在规则网格上求整体 SDF。躯干的距离用距离变换算（远处也准），贴近表面处用解析式（亚体素精度）。"""
    from scipy.ndimage import distance_transform_edt
    b = BOUNDS
    xs = np.arange(b[0, 0], b[0, 1] + voxel, voxel)
    ys = np.arange(b[1, 0], b[1, 1] + voxel, voxel)
    zs = np.arange(b[2, 0], b[2, 1] + voxel, voxel)
    X, Y = np.meshgrid(xs, ys, indexing='ij')
    inside = np.empty((len(xs), len(ys), len(zs)), bool)
    near = np.empty((len(xs), len(ys), len(zs)), np.float32)
    for k, z in enumerate(zs):
        P = np.stack([X.ravel(), Y.ravel(), np.full(X.size, z)], axis=1)
        inside[:, :, k] = torso_inside(P).reshape(X.shape)
        near[:, :, k] = sd_torso(P).reshape(X.shape)
    out = distance_transform_edt(~inside) * voxel
    inn = distance_transform_edt(inside) * voxel
    from scipy.ndimage import gaussian_filter
    torso = gaussian_filter(np.where(inside, -inn, out).astype(np.float32), 1.0)
    # 解析距离和距离变换对得上的地方（表面附近、融合区里）用解析值：没有体素台阶，融合处不会出波纹
    # 两者对得上的地方（表面附近、融合区里）平滑地换成解析值；身体底部的圆顶收得很急，
    # 那里解析距离不可靠，只在贴近表面时用。全部用连续权重，避免出现接缝。
    wz = (np.clip((zs - (Z_BOT + 0.03)) / 0.07, 0, 1) * np.clip((Z_TOP - 0.02 - zs) / 0.03, 0, 1))[None, None, :]
    agree = np.clip(1.5 - np.abs(near - torso) / (0.2 * np.abs(torso) + 2.0 * voxel), 0, 1)
    surf = np.clip(2.0 - np.abs(torso) / voxel, 0, 1)
    w = np.maximum(agree * wz, surf * agree)
    torso = torso + w * (near - torso)
    vol = np.empty_like(torso)
    for k, z in enumerate(zs):
        P = np.stack([X.ravel(), Y.ravel(), np.full(X.size, z)], axis=1)
        d, _ = sdf(P, torso[:, :, k].ravel())
        vol[:, :, k] = d.reshape(X.shape)
    return xs, ys, zs, vol
