"""奶娃（网络 meme 里的“奶龙/奶蛙”）的形体定义：一个有向距离场（SDF）。

所有尺寸以身高 = 1 归一化（脚底 z=0，头顶 z=1），角色面朝 -Y，角色的左手在 +X。
比例从参考图量出来：
  正面 laugh-gallery/奶蛙-静站绿眼.png（身宽、手臂、腿、脚、眼睛、嘴的位置）
  侧面 emotes/奶蛙-侧立.png（前后厚度、头往前探、下巴下面的内收）——这张图的奶娃比正面那张胖，
       厚度统一乘 0.8，让肚子处的厚度约为身宽的 1.1 倍（和 3/4 角度的图一致）
身体是一串上下叠放、彼此平滑融合的椭球（每一层的宽/厚/前后偏移取自上面的轮廓），四肢是圆锥台，
手指脚趾是胶囊/小球，眼眶是凸起的小球。
"""
from __future__ import annotations

import numpy as np
from scipy.interpolate import PchipInterpolator

# ── 轮廓（z, 半宽 a, 前后中心 c（负=往前）, 前后半径 r）──────────────────────
PROFILE = np.array([
    # z      a      c       r
    [0.202, 0.000, 0.008, 0.000],
    [0.208, 0.150, 0.008, 0.130],
    [0.214, 0.210, 0.008, 0.180],
    [0.228, 0.248, 0.006, 0.226],
    [0.240, 0.258, 0.004, 0.252],
    [0.268, 0.267, 0.002, 0.286],
    [0.300, 0.272, 0.000, 0.302],
    [0.350, 0.276, 0.002, 0.298],
    [0.411, 0.274, 0.006, 0.286],
    [0.471, 0.268, 0.011, 0.268],
    [0.532, 0.258, 0.018, 0.244],
    [0.592, 0.247, 0.024, 0.214],
    [0.653, 0.232, 0.027, 0.182],
    [0.713, 0.205, 0.028, 0.156],
    [0.758, 0.176, 0.016, 0.148],
    [0.804, 0.153, -0.004, 0.148],
    [0.840, 0.143, -0.016, 0.144],
    [0.880, 0.139, -0.030, 0.136],
    [0.909, 0.134, -0.037, 0.128],
    [0.940, 0.118, -0.042, 0.110],
    [0.965, 0.092, -0.046, 0.086],
    [0.985, 0.058, -0.050, 0.054],
    [0.997, 0.020, -0.052, 0.020],
])
_A = PchipInterpolator(PROFILE[:, 0], PROFILE[:, 1], extrapolate=False)
_C = PchipInterpolator(PROFILE[:, 0], PROFILE[:, 2], extrapolate=False)
_R = PchipInterpolator(PROFILE[:, 0], PROFILE[:, 3], extrapolate=False)


def profile(z):
    z = np.asarray(z, dtype=np.float64)
    a = np.nan_to_num(_A(z), nan=0.0)
    c = np.nan_to_num(_C(np.clip(z, PROFILE[0, 0], PROFILE[-1, 0])), nan=0.0)
    r = np.nan_to_num(_R(z), nan=0.0)
    return a, c, r


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
    m2 = (~m1) & (np.sign(y) * a2 * y2 < k)
    m3 = ~(m1 | m2)
    out[m1] = np.sqrt(x2[m1] + z2[m1]) * il2 - rb
    out[m2] = np.sqrt(x2[m2] + y2[m2]) * il2 - ra
    out[m3] = (np.sqrt(x2[m3] * a2 * il2) + y[m3] * rr) * il2 - ra
    return out


def sd_capsule(p, a, b, r):
    return sd_round_cone(p, a, b, r, r)


def sd_polyline(p, pts, r):
    d = np.full(len(p), 1e9)
    for a, b in zip(pts[:-1], pts[1:]):
        d = np.minimum(d, sd_capsule(p, a, b, r))
    return d


# ── 各部位 ───────────────────────────────────────────────────────────────────

def mirror(v, s):
    return np.array([v[0] * s, v[1], v[2]])


# 手臂：肩 → 肘 → 腕（左臂 +X，右臂镜像）
SHOULDER, ELBOW, WRIST = np.array([0.196, 0.012, 0.628]), np.array([0.284, 0.002, 0.470]), np.array([0.292, -0.016, 0.348])
R_SHOULDER, R_ELBOW, R_WRIST = 0.060, 0.056, 0.037
# 手：掌心朝身体；三根手指往下、末端往里勾；拇指在前面
PALM_C, PALM_R = np.array([0.294, -0.020, 0.310]), np.array([0.026, 0.040, 0.050])
FINGERS = [
    # (根部, 中段, 指尖, 半径)
    (np.array([0.293, -0.047, 0.280]), np.array([0.290, -0.050, 0.245]), np.array([0.272, -0.048, 0.226]), 0.0150),
    (np.array([0.294, -0.020, 0.274]), np.array([0.291, -0.020, 0.236]), np.array([0.272, -0.019, 0.216]), 0.0160),
    (np.array([0.293, 0.007, 0.278]), np.array([0.290, 0.009, 0.244]), np.array([0.273, 0.009, 0.226]), 0.0150),
]
THUMB = (np.array([0.283, -0.052, 0.330]), np.array([0.272, -0.072, 0.306]), np.array([0.261, -0.076, 0.290]), 0.0150)

# 腿：大腿根 → 脚踝
HIP, ANKLE = np.array([0.138, 0.006, 0.250]), np.array([0.172, -0.004, 0.052])
R_HIP, R_ANKLE = 0.100, 0.058
# 脚：扁椭球 + 四个脚趾，往外撇 14°
FOOT_C, FOOT_R, FOOT_YAW = np.array([0.190, -0.034, 0.020]), np.array([0.072, 0.088, 0.020]), np.radians(14)
TOES = [(-0.051, 0.0195), (-0.017, 0.0215), (0.017, 0.0215), (0.051, 0.0195)]  # (相对 x, 半径)

# 眼睛：头部 z=0.915 处，偏离正前方 ±50°
EYE_Z, EYE_ANGLE, EYE_R = 0.898, np.radians(42), 0.043


def head_surface(theta, z):
    """头部横截面上、偏离正前方 theta 的表面点和外法线。"""
    a, c, r = (float(v) for v in profile(z))
    x = a * np.sin(theta)
    y = c - r * np.cos(theta)
    n = np.array([np.sin(theta) / a, -np.cos(theta) / r, 0.0])
    return np.array([x, y, z]), n / np.linalg.norm(n)


def eye_frame(side):
    """返回 (眼球中心, 视线方向)。side=+1 左眼（+X），-1 右眼。"""
    pt, n = head_surface(EYE_ANGLE * side, EYE_Z)
    n = n + np.array([0, 0, 0.06])
    n /= np.linalg.norm(n)
    center = pt + n * 0.007
    look = n * 0.3 + np.array([0, -1.0, 0]) * 0.7
    look /= np.linalg.norm(look)
    return center, look


MOUTH_Z = 0.832


def mouth_line():
    """嘴：一道细细的线，嘴角往下勾一点。"""
    pts = []
    for u in np.linspace(-1, 1, 11):
        theta = u * 0.42
        pt, n = head_surface(theta, MOUTH_Z - 0.005 * u ** 4)
        pts.append(pt - n * 0.002)
    return np.array(pts)


# 建模用 A-pose：手臂绕肩膀往外张开 ARM_ABDUCT，内侧有完整的皮；默认姿势再用骨骼放回身体两侧。
# 上面量出来的手臂坐标都是“放下来”的位置，这里在求距离时把查询点反向转回去再算。
ARM_ABDUCT = np.radians(30)
ARM_PIVOT = np.array([0.175, 0.012, 0.640])


def arm_rot(s, angle=None):
    """把“放下的手臂”转到 A-pose 的旋转（绕 Y 轴，左臂往 +X 张开）。"""
    a = ARM_ABDUCT if angle is None else angle
    th = -a * s  # 左臂（s=+1）往外张开是绕 +Y 转负角
    c, sn = np.cos(th), np.sin(th)
    return np.array([[c, 0, sn], [0, 1, 0], [-sn, 0, c]])


def arm_to_apose(v, s):
    """把放下手臂时的一个点（已镜像到 s 侧）转到 A-pose。"""
    pv = mirror(ARM_PIVOT, s)
    return arm_rot(s) @ (np.asarray(v) - pv) + pv


def arm_query(p, s):
    """把查询点从 A-pose 反向转回“手臂放下”的坐标系。"""
    pv = mirror(ARM_PIVOT, s)
    R = arm_rot(s)
    return (p - pv) @ R + pv  # 行向量乘 R 等于乘 R 的逆（R 是正交阵）


def foot_local(p, s):
    c = mirror(FOOT_C, s)
    q = p - c
    yaw = FOOT_YAW * s
    cs, sn = np.cos(-yaw), np.sin(-yaw)
    x = q[:, 0] * cs - q[:, 1] * sn
    y = q[:, 0] * sn + q[:, 1] * cs
    return np.stack([x, y, q[:, 2]], axis=1)


def body_loft(p):
    """身体主干：叠放的椭球，平滑融合。建网格时会沿 z 方向再模糊一下，抹掉层与层之间的细横纹。"""
    body = np.full(len(p), 1e9)
    for z0 in np.arange(0.18, 0.99, 0.018):
        a, c, r = (float(v) for v in profile(z0))
        if a < 0.01:
            continue
        h = 0.05
        e = sd_ellipsoid(p, (0.0, c, z0), (a * 0.985, r * 0.985, h))
        body = smin(body, e, 0.02)
    return body


def parts(p, loft=None):
    """各部位的距离（未合并），用来上色和分配骨骼权重。loft 可以传入预先算好（并模糊过）的身体主干。"""
    d = {}
    body = body_loft(p) if loft is None else loft
    # 下巴下面那条往里收的弧、尖尖的上唇（像鸟喙）
    mp, _ = head_surface(0.0, MOUTH_Z + 0.010)
    snout = sd_ellipsoid(p, mp + np.array([0, 0.010, 0.002]), (0.062, 0.012, 0.016))
    body = smin(body, snout, 0.012)
    # 眼眶：眼球后半圈鼓起来的皮，前面挖出眼球的位置，让眼球露出大半
    for s in (1, -1):
        c, look = eye_frame(s)
        body = smin(body, sd_sphere(p, c - look * 0.022, EYE_R * 0.92), 0.012)
        body = smax(body, -sd_sphere(p, c, EYE_R * 1.03), 0.004)
    d['body'] = body

    for s, tag in ((1, 'L'), (-1, 'R')):
        S, E, W_ = mirror(SHOULDER, s), mirror(ELBOW, s), mirror(WRIST, s)
        pa = arm_query(p, s)
        d[f'upperarm.{tag}'] = sd_round_cone(pa, S, E, R_SHOULDER, R_ELBOW)
        d[f'forearm.{tag}'] = sd_round_cone(pa, E, W_, R_ELBOW, R_WRIST)
        hand = sd_ellipsoid(pa, mirror(PALM_C, s), PALM_R)
        hand = smin(hand, sd_capsule(pa, W_, mirror(PALM_C, s) + np.array([0, 0, 0.02]), 0.033), 0.012)
        for a, b, c, r in FINGERS + [THUMB]:
            f = smin(sd_capsule(pa, mirror(a, s), mirror(b, s), r), sd_round_cone(pa, mirror(b, s), mirror(c, s), r, r * 0.86), 0.004)
            hand = smin(hand, f, 0.006)
        d[f'hand.{tag}'] = hand
        d[f'leg.{tag}'] = sd_round_cone(p, mirror(HIP, s), mirror(ANKLE, s), R_HIP, R_ANKLE)
        fl = foot_local(p, s)
        foot = sd_ellipsoid(fl, (0, 0, 0), FOOT_R)
        for dx, rt in TOES:
            foot = smin(foot, sd_sphere(fl, (dx, -FOOT_R[1] * 0.86, rt * 0.92 - 0.002), rt), 0.006)
        foot = smax(foot, -(fl[:, 2] + 0.028), 0.004)  # 脚底压平
        d[f'foot.{tag}'] = foot
    return d


def combine(d):
    """合成一整块皮：肩、腿根融合得软一些，手臂贴着身体的地方留一道折痕。"""
    total = d['body']
    for tag in ('L', 'R'):
        arm = smin(d[f'upperarm.{tag}'], d[f'forearm.{tag}'], 0.02)
        arm = smin(arm, d[f'hand.{tag}'], 0.012)
        total = smin(total, arm, 0.012)
        # 肩膀单独用大一点的融合半径
        sgn = 1 if tag == 'L' else -1
        sh = sd_sphere_np(arm_query(d['_p'], sgn), mirror(SHOULDER + np.array([-0.022, 0.0, 0.018]), sgn), R_SHOULDER * 0.92)
        total = smin(total, sh, 0.05)
        leg = smin(d[f'leg.{tag}'], d[f'foot.{tag}'], 0.015)
        # 大腿外侧和肚子下沿融得软一些，裆下面的拱形保持清楚；屁股底部前后收圆
        p_ = d['_p']
        outer = np.clip((np.abs(p_[:, 0]) - 0.06) / 0.08, 0, 1)
        fb = np.clip((np.abs(p_[:, 1] - HIP[1]) - 0.05) / 0.08, 0, 1)  # 大腿前后侧也融软，侧面不会像裙边
        total = smin(total, leg, 0.018 + 0.03 * np.maximum(outer, fb))
    return total


def sd_sphere_np(p, c, r):
    return sd_sphere(p, c, r)


def sdf(p, loft=None):
    d = parts(p, loft)
    d['_p'] = p
    return combine(d), d


BOUNDS = np.array([[-0.54, 0.54], [-0.36, 0.36], [-0.005, 1.06]])
