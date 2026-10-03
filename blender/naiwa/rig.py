"""给奶娃加骨骼、表情和动作。

骨骼（.L 在 +X，即角色自己的左边）：
  root → hips → spine → chest → head
  chest → upperarm.L/R → forearm.L/R → hand.L/R
  hips  → thigh.L/R → shin.L/R → foot.L/R
蒙皮权重直接按 shape.py 里每个部位的距离场算（离哪块近就跟哪根骨头走，关节处平滑过渡）。

表情：骨架对象上的自定义属性（0..1），通过驱动器控制
  laugh  捧腹大笑：嘴张成 D 形（形态键 + 口腔/牙齿/舌头），眼睛眯成 ^ ^
  blink  眨眼（上下眼皮合拢）
  mouth  张嘴说话（小一号的 D 形嘴）
"""
from __future__ import annotations

import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import shape  # noqa: E402
from build import node, srgb, SKIN  # noqa: E402

import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Euler, Matrix, Quaternion, Vector  # noqa: E402

FPS = 24


def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


# ───────────────────────── 骨骼 ─────────────────────────

KNEE = (shape.HIP + shape.ANKLE) / 2 + np.array([0.004, -0.004, 0.0])


def toe_point(s):
    yaw = shape.FOOT_YAW * s
    fwd = np.array([math.sin(yaw) * -1 * -1, -math.cos(yaw), 0.0])
    c = shape.mirror(shape.FOOT_C, s)
    return c + np.array([math.sin(yaw), -math.cos(yaw), 0.0]) * shape.FOOT_R[1] * 0.95 + np.array([0, 0, -0.002])


BONES = [
    # 名字, 头, 尾, 父骨骼, 是否变形
    ('root', (0, 0, 0), (0, 0.18, 0), None, False),
    ('hips', (0, 0.01, 0.26), (0, 0.01, 0.43), 'root', True),
    ('spine', (0, 0.01, 0.43), (0, 0.01, 0.60), 'hips', True),
    ('chest', (0, 0.01, 0.60), (0, 0.0, 0.765), 'spine', True),
    ('head', (0, 0.0, 0.765), (0, -0.03, 1.0), 'chest', True),
]
for s, tag in ((1, 'L'), (-1, 'R')):
    m = lambda v: tuple(shape.mirror(np.asarray(v, float), s))
    ma = lambda v: tuple(shape.arm_to_apose(shape.mirror(np.asarray(v, float), s), s))  # 手臂骨骼按 A-pose 放
    BONES += [
        (f'upperarm.{tag}', ma(shape.SHOULDER), ma(shape.ELBOW), 'chest', True),
        (f'forearm.{tag}', ma(shape.ELBOW), ma(shape.WRIST), f'upperarm.{tag}', True),
        (f'hand.{tag}', ma(shape.WRIST), ma(shape.WRIST + np.array([-0.004, -0.004, -0.125])), f'forearm.{tag}', True),
        (f'thigh.{tag}', m(shape.HIP + np.array([0, 0, 0.03])), m(KNEE), 'hips', True),
        (f'shin.{tag}', m(KNEE), m(shape.ANKLE), f'thigh.{tag}', True),
        (f'foot.{tag}', m(shape.ANKLE), tuple(toe_point(s)), f'shin.{tag}', True),
    ]


def make_armature():
    arm = bpy.data.armatures.new('NaiwaRig')
    arm.display_type = 'STICK'
    ob = bpy.data.objects.new('NaiwaRig', arm)
    bpy.context.scene.collection.objects.link(ob)
    ob.show_in_front = True
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    if True:
        for name, h, t, parent, deform in BONES:
            eb = arm.edit_bones.new(name)
            eb.head = h
            eb.tail = t
            eb.use_deform = deform
            if parent:
                eb.parent = arm.edit_bones[parent]
                eb.use_connect = (Vector(h) - arm.edit_bones[parent].tail).length < 1e-4
            # 四肢的弯曲轴（局部 X）朝向角色的左右，躯干的局部 Z 朝前
            eb.align_roll(Vector((0, -1, 0)) if name != 'root' else Vector((0, 0, 1)))
        bpy.ops.object.mode_set(mode='OBJECT')
    for pb in ob.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    # 表情属性
    for k in ('laugh', 'blink', 'mouth'):
        ob[k] = 0.0
        ob.id_properties_ui(k).update(min=0.0, max=1.0, soft_min=0.0, soft_max=1.0, description={'laugh': '捧腹大笑', 'blink': '眨眼', 'mouth': '张嘴'}[k])
    return ob


# ───────────────────────── 权重 ─────────────────────────

def chain_param(P, pts):
    """顶点在折线 pts 上最近点的参数：第 i 段对应 [i, i+1]。"""
    best = np.full(len(P), 1e9)
    par = np.zeros(len(P))
    for i, (a, b) in enumerate(zip(pts[:-1], pts[1:])):
        ab = b - a
        t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1)
        q = a + t[:, None] * ab
        d = np.linalg.norm(P - q, axis=1)
        m = d < best
        best[m] = d[m]
        par[m] = i + t[m]
    return par


def skin_weights(body, rig):
    P = np.array([v.co[:] for v in body.data.vertices])
    d = shape.parts(P)
    W = {b[0]: np.zeros(len(P)) for b in BONES if b[4]}
    groups = {'body': d['body']}
    for tag in ('L', 'R'):
        groups[f'arm.{tag}'] = np.minimum(d[f'upperarm.{tag}'], d[f'forearm.{tag}'])
        groups[f'hand.{tag}'] = d[f'hand.{tag}']
        groups[f'leg.{tag}'] = d[f'leg.{tag}']
        groups[f'foot.{tag}'] = d[f'foot.{tag}']
    keys = list(groups)
    # 手臂贴着身体的那圈顶点优先跟手臂走（否则抬手时会把身体侧面拉成蹼）
    bias = {k: (-0.007 if k.startswith(('arm', 'hand')) else 0.0) for k in keys}
    D = np.stack([groups[k] + bias[k] for k in keys], axis=1)
    tau = 0.008
    E = np.exp(-(D - D.min(axis=1, keepdims=True)) / tau)
    E /= E.sum(axis=1, keepdims=True)
    G = {k: E[:, i] for i, k in enumerate(keys)}
    z = P[:, 2]
    # 躯干按高度分给 hips/spine/chest/head
    # 头（含整张脸）刚性跟着 head 骨；胯/腰、腰/胸之间的过渡放宽，弯腰时不起折痕
    w_head = ss(0.70, 0.755, z)
    w_chest = ss(0.52, 0.66, z) * (1 - w_head)
    w_hips = 1 - ss(0.32, 0.52, z)
    w_spine = np.clip(1 - w_head - w_chest - w_hips, 0, 1)
    for name, w in (('hips', w_hips), ('spine', w_spine), ('chest', w_chest), ('head', w_head)):
        W[name] += G['body'] * w
    for s, tag in ((1, 'L'), (-1, 'R')):
        S, E_, Wr = (shape.arm_to_apose(shape.mirror(v, s), s) for v in (shape.SHOULDER, shape.ELBOW, shape.WRIST))
        Hd = shape.arm_to_apose(shape.mirror(shape.WRIST + np.array([0, 0, -0.125]), s), s)
        par = chain_param(P, [S, E_, Wr, Hd])
        armw = G[f'arm.{tag}']
        w_up = 1 - ss(0.82, 1.18, par)
        w_fa = ss(0.82, 1.18, par) * (1 - ss(1.85, 2.15, par))
        w_hd = ss(1.85, 2.15, par)
        sh = 1 - ss(0.0, 0.25, par)  # 肩膀根部一部分跟着胸
        W['chest'] += armw * w_up * sh * 0.6
        W[f'upperarm.{tag}'] += armw * w_up * (1 - sh * 0.6)
        W[f'forearm.{tag}'] += armw * w_fa
        W[f'hand.{tag}'] += armw * w_hd + G[f'hand.{tag}']
        H, K, A = (shape.mirror(v, s) for v in (shape.HIP + np.array([0, 0, 0.03]), KNEE, shape.ANKLE))
        lp = chain_param(P, [H, K, A])
        legw = G[f'leg.{tag}']
        top = 1 - ss(0.0, 0.35, lp)
        W['hips'] += legw * top * 0.5
        W[f'thigh.{tag}'] += legw * (1 - ss(0.8, 1.2, lp)) * (1 - top * 0.5)
        W[f'shin.{tag}'] += legw * ss(0.8, 1.2, lp)
        fw = G[f'foot.{tag}']
        ank = 1 - ss(0.0, 0.03, A[2] + 0.01 - z)  # 脚踝上沿一点点给小腿
        W[f'shin.{tag}'] += fw * ank * 0.5
        W[f'foot.{tag}'] += fw * (1 - ank * 0.5)
    total = sum(W.values())
    for name, w in W.items():
        w = w / np.maximum(total, 1e-6)
        vg = body.vertex_groups.new(name=name)
        idx = np.nonzero(w > 0.002)[0]
        for i in idx:
            vg.add([int(i)], float(w[i]), 'REPLACE')
    mod = body.modifiers.new('Armature', 'ARMATURE')
    mod.object = rig
    body.parent = rig


# ───────────────────────── 脸 ─────────────────────────

MOUTH_TOP = shape.MOUTH_Z + 0.004
MOUTH_HALF_W = 0.084
MOUTH_DEPTH = 0.084


def d_shape(x, z, scale=1.0):
    """D 形嘴（上沿平、下沿圆）里的程度：>0 在里面。返回 (inside, 归一化深度 0..1)。"""
    w = MOUTH_HALF_W * scale
    u = np.clip(np.abs(x) / w, 0, 1.5)
    bottom = MOUTH_TOP - MOUTH_DEPTH * scale * np.sqrt(np.clip(1 - u ** 2, 0, 1))
    top = MOUTH_TOP
    inside_x = 1 - np.clip((np.abs(x) - w) / 0.006 + 1, 0, 1)
    inside_z = np.clip((top - z) / 0.005, 0, 1) * np.clip((z - bottom) / 0.005, 0, 1)
    depthn = np.clip((top - z) / max(MOUTH_DEPTH * scale, 1e-4), 0, 1)
    return inside_x * inside_z, depthn


def cavity_depth(u, v, scale):
    """口腔深度：u 横向 -1..1，v 从上沿 0 到下沿 1。边缘为 0，中间最深。"""
    return 0.036 * scale * np.sqrt(np.clip(1 - u * u, 0, 1)) * np.sin(np.clip(v, 0, 1) * math.pi) ** 0.6


def mouth_uv(x, z, scale):
    w = MOUTH_HALF_W * scale
    u = x / w
    bottom = MOUTH_TOP - MOUTH_DEPTH * scale * np.sqrt(np.clip(1 - u * u, 0, 1))
    v = (MOUTH_TOP - z) / np.maximum(MOUTH_TOP - bottom, 1e-5)
    return u, v


def mouth_shape_key(body, name, scale):
    """把嘴的 D 形区域往里推，形成口腔；下巴跟着往下张开一点。"""
    me = body.data
    if not me.shape_keys:
        body.shape_key_add(name='Basis', from_mix=False)
    sk = body.shape_key_add(name=name, from_mix=False)
    P = np.array([v.co[:] for v in me.vertices])
    N = np.array([v.normal[:] for v in me.vertices])
    x, y, z = P.T
    a, c, r = shape.profile(z)
    frontish = (y < c - 0.6 * r)
    u, v = mouth_uv(x, z, scale)
    inside = frontish & (np.abs(u) < 1) & (v > 0) & (v < 1)
    depth = np.where(inside, cavity_depth(u, v, scale) + 0.004 * scale, 0.0)
    # 边缘一圈也往里收一点，嘴唇更利落
    rim = frontish & ~inside & (np.abs(u) < 1.15) & (v > -0.12) & (v < 1.12)
    depth = np.where(rim, 0.002 * scale, depth)
    bottom = MOUTH_TOP - MOUTH_DEPTH * scale
    chin = frontish * np.exp(-((x / (MOUTH_HALF_W * 1.4 * scale)) ** 2)) * ss(bottom - 0.07, bottom, z) * (1 - ss(bottom, bottom + 0.02, z)) * (1 - inside)
    off = -N * depth[:, None] + np.stack([np.zeros_like(x), -0.004 * chin * scale, -0.010 * chin * scale], axis=1)
    sk.data.foreach_set('co', (P + off).astype(np.float32).ravel())
    return sk


_bvh_cache = {}


def surface_hit(body, x, z):
    """从正前方往身体打一条射线，返回真实表面上的点和外法线（静止姿势）。"""
    from mathutils.bvhtree import BVHTree
    key = body.name
    if key not in _bvh_cache:
        me = body.data
        verts = [v.co.copy() for v in me.vertices]
        polys = [list(p.vertices) for p in me.polygons]
        _bvh_cache[key] = BVHTree.FromPolygons(verts, polys)
    hit, nrm, _, _ = _bvh_cache[key].ray_cast(Vector((x, -0.6, z)), Vector((0, 1, 0)))
    if hit is None:
        pt, n = shape.head_surface(0.0, z)
        return pt, n
    n = np.array(nrm[:])
    if n[1] > 0:
        n = -n
    return np.array(hit[:]), n


def mouth_lining(body, sk, name, scale, nu=40, nv=22):
    """口腔：规则网格铺在推进去的皮肤前面一点点。上沿一排白牙，下沿中间一小排下牙，舌头在下半部中间。
    基础形状收拢成嘴缝那条线（看不见），形态键 open 展开成口腔。"""
    verts_open, verts_closed, mats = [], [], []
    U = np.linspace(-1, 1, nu)
    V = np.linspace(0, 1, nv)
    for v in V:
        for u in U:
            w = MOUTH_HALF_W * scale
            x = u * w
            bottom = MOUTH_TOP - MOUTH_DEPTH * scale * math.sqrt(max(0.0, 1 - u * u))
            z = MOUTH_TOP - v * (MOUTH_TOP - bottom)
            pt, n = surface_hit(body, x, z)
            d = float(cavity_depth(np.array(u), np.array(v), scale)) + 0.0022 * scale
            verts_open.append(pt - n * d)
            pc, nc = surface_hit(body, x * 0.8, MOUTH_TOP - 0.006)
            verts_closed.append(pc - nc * 0.006)
    faces = []
    for j in range(nv - 1):
        for i in range(nu - 1):
            a0 = j * nu + i
            faces.append([a0, a0 + 1, a0 + nu + 1, a0 + nu])
            uc = (U[i] + U[i + 1]) / 2
            vc = (V[j] + V[j + 1]) / 2
            if vc < 0.20:
                mats.append(1)                       # 上牙
            elif vc > 0.80 and abs(uc) < 0.42:
                mats.append(1)                       # 下牙
            elif vc > 0.52 and abs(uc) < 0.62:
                mats.append(2)                       # 舌头
            else:
                mats.append(0)                       # 口腔
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(np.array(verts_closed).tolist(), [], faces)
    mesh.update()
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(ob)
    for pl, mi in zip(mesh.polygons, mats):
        pl.use_smooth = True
        pl.material_index = mi
    for m_ in (flat_mat('MouthInside', '#2A0B0A', 0.6), flat_mat('Teeth', '#F7F3EA', 0.3), flat_mat('Tongue', '#C9555A', 0.45)):
        mesh.materials.append(m_)
    ob.shape_key_add(name='Basis', from_mix=False)
    kb = ob.shape_key_add(name='open', from_mix=False)
    kb.data.foreach_set('co', np.array(verts_open, np.float32).ravel())
    return ob


def flat_mat(name, color, rough):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = srgb(color)
    b.inputs['Roughness'].default_value = rough
    return m


def lid_material(name, arc):
    """眼皮：和皮肤同色；arc=True 时正面画一道 ∩ 形的弧（笑眯眯的眼睛）。"""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = node(nt, 'ShaderNodeOutputMaterial', 900, 0)
    bs = node(nt, 'ShaderNodeBsdfPrincipled', 600, 0)
    nt.links.new(bs.outputs[0], out.inputs[0])
    bs.inputs['Roughness'].default_value = 0.55
    bs.inputs['Subsurface Weight'].default_value = 0.15
    bs.inputs['Subsurface Radius'].default_value = (1.0, 0.8, 0.35)
    bs.inputs['Subsurface Scale'].default_value = 0.03
    if not arc:
        # 合上的眼皮：中间一道细缝
        tc = node(nt, 'ShaderNodeTexCoord', -800, 0)
        sep = node(nt, 'ShaderNodeSeparateXYZ', -600, 0)
        nt.links.new(tc.outputs['Object'], sep.inputs[0])
        ab = node(nt, 'ShaderNodeMath', -400, 0, operation='ABSOLUTE')
        nt.links.new(sep.outputs['Z'], ab.inputs[0])
        mr = node(nt, 'ShaderNodeMapRange', -200, 0)
        nt.links.new(ab.outputs[0], mr.inputs['Value'])
        mr.inputs['From Min'].default_value = 0.05
        mr.inputs['From Max'].default_value = 0.11
        front = node(nt, 'ShaderNodeMapRange', -200, -250)
        nt.links.new(sep.outputs['Y'], front.inputs['Value'])
        front.inputs['From Min'].default_value = -0.3
        front.inputs['From Max'].default_value = -0.6
        mx = node(nt, 'ShaderNodeMath', 0, -100, operation='MULTIPLY')
        nt.links.new(front.outputs['Result'], mx.inputs[0])
        inv = node(nt, 'ShaderNodeMath', 0, 100, operation='SUBTRACT')
        inv.inputs[0].default_value = 1.0
        nt.links.new(mr.outputs['Result'], inv.inputs[1])
        nt.links.new(inv.outputs[0], mx.inputs[1])
        fac = mx.outputs[0]
    else:
        # ∩ 弧：以 (0, -1, -0.35) 为圆心、半径 0.55 的上半圆，只画在正面
        tc = node(nt, 'ShaderNodeTexCoord', -1000, 0)
        sep = node(nt, 'ShaderNodeSeparateXYZ', -800, 0)
        nt.links.new(tc.outputs['Object'], sep.inputs[0])
        zz = node(nt, 'ShaderNodeMath', -650, -100, operation='ADD')
        nt.links.new(sep.outputs['Z'], zz.inputs[0])
        zz.inputs[1].default_value = 0.3
        comb = node(nt, 'ShaderNodeCombineXYZ', -500, 0)
        nt.links.new(sep.outputs['X'], comb.inputs['X'])
        nt.links.new(zz.outputs[0], comb.inputs['Y'])
        ln = node(nt, 'ShaderNodeVectorMath', -350, 0, operation='LENGTH')
        nt.links.new(comb.outputs[0], ln.inputs[0])
        dist = node(nt, 'ShaderNodeMath', -200, 0, operation='SUBTRACT')
        nt.links.new(ln.outputs['Value'], dist.inputs[0])
        dist.inputs[1].default_value = 0.55
        ab = node(nt, 'ShaderNodeMath', -50, 0, operation='ABSOLUTE')
        nt.links.new(dist.outputs[0], ab.inputs[0])
        band = node(nt, 'ShaderNodeMapRange', 100, 0)
        nt.links.new(ab.outputs[0], band.inputs['Value'])
        band.inputs['From Min'].default_value = 0.09
        band.inputs['From Max'].default_value = 0.05
        upper = node(nt, 'ShaderNodeMapRange', 100, -200)
        nt.links.new(zz.outputs[0], upper.inputs['Value'])
        upper.inputs['From Min'].default_value = -0.05
        upper.inputs['From Max'].default_value = 0.08
        front = node(nt, 'ShaderNodeMapRange', 100, -400)
        nt.links.new(sep.outputs['Y'], front.inputs['Value'])
        front.inputs['From Min'].default_value = -0.2
        front.inputs['From Max'].default_value = -0.5
        m1 = node(nt, 'ShaderNodeMath', 300, -100, operation='MULTIPLY')
        nt.links.new(band.outputs['Result'], m1.inputs[0])
        nt.links.new(upper.outputs['Result'], m1.inputs[1])
        m2 = node(nt, 'ShaderNodeMath', 450, -150, operation='MULTIPLY')
        nt.links.new(m1.outputs[0], m2.inputs[0])
        nt.links.new(front.outputs['Result'], m2.inputs[1])
        fac = m2.outputs[0]
    mix = node(nt, 'ShaderNodeMix', 400, 200)
    mix.data_type = 'RGBA'
    nt.links.new(fac, mix.inputs['Factor'])
    mix.inputs['A'].default_value = srgb(SKIN)
    mix.inputs['B'].default_value = srgb('#3B2412')
    nt.links.new(mix.outputs['Result'], bs.inputs['Base Color'])
    return m


def lids(eyes, rig):
    out = []
    for eye in eyes:
        for kind, mat in (('Lid', lid_material('Lid', False)), ('Happy', lid_material('Happy', True))):
            me = bpy.data.meshes.new(f'{kind}.{eye.name[-1]}')
            bm = bmesh.new()
            bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=20, radius=1.0)
            for f in bm.faces:
                f.smooth = True
            bm.to_mesh(me)
            bm.free()
            ob = bpy.data.objects.new(me.name, me)
            bpy.context.scene.collection.objects.link(ob)
            ob.data.materials.append(mat)
            ob.matrix_world = eye.matrix_world @ Matrix.Scale(1.07, 4)
            out.append((kind, ob))
    return out


def parent_to_bone(ob, rig, bone):
    mw = ob.matrix_world.copy()
    ob.parent = rig
    ob.parent_type = 'BONE'
    ob.parent_bone = bone
    bpy.context.view_layer.update()
    ob.matrix_world = mw


def add_driver(target, path, rig, expr, index=-1):
    fc = target.driver_add(path, index) if index >= 0 else target.driver_add(path)
    drv = fc.driver
    drv.type = 'SCRIPTED'
    for k in ('laugh', 'blink', 'mouth'):
        v = drv.variables.new()
        v.name = k
        v.type = 'SINGLE_PROP'
        v.targets[0].id = rig
        v.targets[0].data_path = f'["{k}"]'
    drv.expression = expr
    return fc


def face_rig(body, eyes, rig):
    sk_laugh = mouth_shape_key(body, 'Laugh', 1.0)
    sk_talk = mouth_shape_key(body, 'Talk', 0.55)
    add_driver(sk_laugh, 'value', rig, 'laugh')
    add_driver(sk_talk, 'value', rig, 'mouth*(1-laugh)')
    lin = mouth_lining(body, sk_laugh, 'MouthLaugh', 1.0)
    lin_t = mouth_lining(body, sk_talk, 'MouthTalk', 0.55)
    add_driver(lin.data.shape_keys.key_blocks['open'], 'value', rig, 'laugh')
    add_driver(lin_t.data.shape_keys.key_blocks['open'], 'value', rig, 'mouth*(1-laugh)')
    for ob in (lin, lin_t):
        parent_to_bone(ob, rig, 'head')
        # 口腔内衬跟着身体一起蒙皮会更准：直接复用头骨权重
    for e in eyes:
        parent_to_bone(e, rig, 'head')
    ml = bpy.data.objects.get('MouthLine')
    if ml:
        # 嘴缝的每个点贴到真实表面上
        sp = ml.data.splines[0]
        for i, p in enumerate(shape.mouth_line()):
            hit, n = surface_hit(body, p[0], p[2])
            sp.points[i].co = (*(hit + n * 0.0012 - np.array(ml.location)), 1.0)
        parent_to_bone(ml, rig, 'head')
        for i in range(3):
            add_driver(ml, 'scale', rig, 'max(0.0001, 1-min(1,(laugh+mouth)*12))', index=i)
    for kind, ob in lids(eyes, rig):
        parent_to_bone(ob, rig, 'head')
        if kind == 'Lid':
            # 眨眼：上下眼皮往中间合（只缩放 Z），笑的时候用不到
            expr = 'max(0.0001, min(1, blink*(1-laugh)))'
        else:
            expr = 'max(0.0001, min(1, (laugh-0.15)*2.5))'
        base = ob.scale.copy()
        add_driver(ob, 'scale', rig, f'{base[2]:.6f}*({expr})', index=2)
        # X/Y 也缩小一点，避免完全张开前露在外面
        add_driver(ob, 'scale', rig, f'{base[0]:.6f}*(0.97+0.03*min(1,({expr})*4))', index=0)
        add_driver(ob, 'scale', rig, f'{base[1]:.6f}*(0.97+0.03*min(1,({expr})*4))', index=1)
    return lin, lin_t


# ───────────────────────── 姿势工具 ─────────────────────────

def rest_matrix(rig, name):
    return rig.data.bones[name].matrix_local.to_3x3()


def rq(rig, name, axis, deg):
    """绕“骨架空间”的轴转 deg 度，换算成该骨骼的局部四元数。"""
    M = rest_matrix(rig, name)
    q_world = Quaternion(Vector(axis).normalized(), math.radians(deg))
    q = (M.inverted() @ q_world.to_matrix() @ M).to_quaternion()
    return q


def combine(*qs):
    out = Quaternion()
    for q in qs:
        out = q @ out
    return out


X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)


class Pose:
    """一帧的姿势：{骨骼: [(轴, 角度), ...]} + 根骨骼位移 + 表情。"""

    def __init__(self, **kw):
        self.rot = {}
        self.loc = {}
        self.props = {}
        for k, v in kw.items():
            if k in ('laugh', 'blink', 'mouth'):
                self.props[k] = v
            elif k.endswith('_loc'):
                self.loc[k[:-4].replace('_', '.')] = v
            else:
                self.rot[k.replace('_', '.')] = v


def bake_arms_down(body, rig):
    """权重是在 A-pose 下算的。把“手臂放下”烘焙成新的静止姿势：网格按权重变形到手臂垂放，
    骨架把这个姿势设为静止姿势，再重新挂上骨架修改器。之后所有动作都以手臂垂放为起点。"""
    a = math.degrees(shape.ARM_ABDUCT)
    rig.pose.bones['upperarm.L'].rotation_quaternion = rq(rig, 'upperarm.L', Y, a)
    rig.pose.bones['upperarm.R'].rotation_quaternion = rq(rig, 'upperarm.R', Y, -a)
    bpy.context.view_layer.update()
    vl = bpy.context.view_layer
    for o in vl.objects:
        o.select_set(False)
    vl.objects.active = body
    body.select_set(True)
    bpy.ops.object.modifier_apply(modifier='Armature')
    body.select_set(False)
    vl.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.select_all(action='SELECT')
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    mod = body.modifiers.new('Armature', 'ARMATURE')
    mod.object = rig


def key_pose(rig, frame, pose: Pose):
    for pb in rig.pose.bones:
        rots = pose.rot.get(pb.name, [])
        q = combine(*[rq(rig, pb.name, ax, deg) for ax, deg in rots]) if rots else Quaternion()
        pb.rotation_quaternion = q
        pb.keyframe_insert('rotation_quaternion', frame=frame)
        loc = pose.loc.get(pb.name)
        if loc is not None:
            M = rest_matrix(rig, pb.name)
            pb.location = M.inverted() @ Vector(loc)
        else:
            pb.location = (0, 0, 0)
        pb.keyframe_insert('location', frame=frame)
    for k in ('laugh', 'blink', 'mouth'):
        rig[k] = float(pose.props.get(k, 0.0))
        rig.keyframe_insert(f'["{k}"]', frame=frame)


def new_action(rig, name):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    if not rig.animation_data:
        rig.animation_data_create()
    rig.animation_data.action = act
    return act


def finish_action(act, cyclic=False):
    for fc in act.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = 'BEZIER'
        if cyclic:
            fc.modifiers.new('CYCLES')
