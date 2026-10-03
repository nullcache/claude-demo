"""生成奶娃模型：SDF → 网格 → 材质 → 眼睛 →（骨骼、表情、动作见 rig.py）。

    python blender/naiwa/build.py --voxel 0.004 --preview OUTDIR      # 只出正/侧面预览图
需要 bpy（pip install bpy==4.5.*）、numpy<2、scipy、scikit-image。
"""
from __future__ import annotations

import argparse
import math
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import shape  # noqa: E402

import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402


def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c) + (1.0,)


SKIN = '#DEB04E'       # 暖黄（哑光）
BELLY = '#D3B988'      # 奶油色肚皮
HAND = '#54452A'       # 深橄榄棕的手
TOE = '#47361F'        # 深棕色脚趾
MOUTH_LINE = '#5E3D1F'
IRIS = '#8DB088'       # 灰绿虹膜
IRIS_RIM = '#5E7F5A'
PUPIL = '#050505'


# ───────────────────────── 网格 ─────────────────────────

def mesh_from_sdf(voxel):
    from skimage.measure import marching_cubes
    t = time.time()
    xs, ys, zs, vol = shape.volume(voxel)
    print(f'SDF {vol.shape} {time.time() - t:.1f}s', flush=True)
    # 网格点上的值恰好为 0 时 marching cubes 会生成零面积三角形（法线乱跳、渲染出小亮点），稍微挪开一点
    vol = np.where(np.abs(vol) < 1e-7, 1e-7, vol)
    v, f, _, _ = marching_cubes(vol, level=0.0, spacing=(voxel, voxel, voxel))
    v = v + np.array([xs[0], ys[0], zs[0]])
    print(f'marching cubes: {len(v)} verts {len(f)} faces', flush=True)
    return v, f


def make_mesh(name, v, f):
    import bmesh
    me = bpy.data.meshes.new(name)
    me.from_pydata(v.tolist(), [], f.tolist())
    me.update()
    # 法线统一朝外（口腔形态键是沿法线往里推的，方向必须对）
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    for p in me.polygons:
        p.use_smooth = True
    return ob


def decimate(ob, target_faces):
    n = len(ob.data.polygons)
    if n <= target_faces:
        return
    mod = ob.modifiers.new('dec', 'DECIMATE')
    mod.ratio = target_faces / n
    mod.use_collapse_triangulate = False
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def masks(ob):
    """颜色属性：R = 肚皮，G = 深色的手，B = 深色脚趾。"""
    me = ob.data
    P = np.array([v.co[:] for v in me.vertices])
    d = shape.parts(P)
    x, y, z = P.T
    # 手：腕部往上有一小段渐变
    rest = np.minimum.reduce([d['body'], d['tail']] + [d[k] for k in d if k.startswith(('upperarm', 'forearm', 'leg', 'foot'))])
    hand = np.minimum.reduce([d[k] for k in d if k.startswith('hand')])
    wrist_z = shape.WRIST[2] + 0.012
    hand_c = 1 / (1 + np.exp(-(rest - hand) / 0.004))
    fore = np.minimum.reduce([d[k] for k in d if k.startswith('forearm')])
    on_fore = 1 / (1 + np.exp(-(np.minimum(d['body'], d['tail']) - fore) / 0.003))
    grad = np.clip((wrist_z + 0.03 - z) / 0.03, 0, 1)
    dark = np.maximum(hand_c, grad * grad * (3 - 2 * grad) * on_fore)
    toes = np.minimum.reduce([d[k] for k in d if k.startswith('toes')])
    legs = np.minimum.reduce([d[k] for k in d if k.startswith(('leg', 'foot'))])
    toe = 1 / (1 + np.exp(-(legs - toes) / 0.0015))
    # 肚皮：从正面投影的椭圆，只在身体正面，边缘柔和
    a, yc, ry = shape.profile(z)
    e = (x / 0.272) ** 2 + ((z - 0.447) / 0.196) ** 2
    belly = np.clip((1.10 - e) / 0.30, 0, 1)
    belly = belly * belly * (3 - 2 * belly)
    front = np.clip((yc - y) / (0.25 * np.maximum(ry, 1e-3)), 0, 1)
    armness = np.minimum.reduce([d[k] for k in d if k.startswith(('upperarm', 'forearm', 'hand'))])
    on_body = np.clip((armness - d['body']) / 0.006 + 0.5, 0, 1)
    belly = belly * front * on_body * (1 - dark) * (1 - toe)
    col = np.stack([belly, dark * (1 - toe), toe, np.ones_like(belly)], axis=1)
    attr = me.color_attributes.new('mask', 'FLOAT_COLOR', 'POINT')
    attr.data.foreach_set('color', col.astype(np.float32).ravel())
    return d


# ───────────────────────── 材质 ─────────────────────────

def node(nt, kind, x, y, **kw):
    n = nt.nodes.new(kind)
    n.location = (x, y)
    for k, v in kw.items():
        setattr(n, k, v)
    return n


def skin_material():
    m = bpy.data.materials.new('NaiwaSkin')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = node(nt, 'ShaderNodeOutputMaterial', 900, 0)
    bs = node(nt, 'ShaderNodeBsdfPrincipled', 600, 0)
    nt.links.new(bs.outputs[0], out.inputs[0])
    at = node(nt, 'ShaderNodeAttribute', -600, 0, attribute_name='mask')
    sep = node(nt, 'ShaderNodeSeparateColor', -400, 0)
    nt.links.new(at.outputs['Color'], sep.inputs[0])

    def mix(fac, a, b, x, y):
        n = node(nt, 'ShaderNodeMix', x, y)
        n.data_type = 'RGBA'
        nt.links.new(fac, n.inputs['Factor'])
        for slot, v in (('A', a), ('B', b)):
            if isinstance(v, tuple):
                n.inputs[slot].default_value = v
            else:
                nt.links.new(v, n.inputs[slot])
        return n.outputs['Result']

    c = mix(sep.outputs[0], srgb(SKIN), srgb(BELLY), -150, 150)
    c = mix(sep.outputs[1], c, srgb(HAND), 50, 100)
    c = mix(sep.outputs[2], c, srgb(TOE), 250, 50)
    nt.links.new(c, bs.inputs['Base Color'])
    # 粗糙度：灰色手脚更哑
    rough = node(nt, 'ShaderNodeMapRange', 250, -200)
    nt.links.new(sep.outputs[1], rough.inputs['Value'])
    rough.inputs['To Min'].default_value = 0.55
    rough.inputs['To Max'].default_value = 0.65
    nt.links.new(rough.outputs['Result'], bs.inputs['Roughness'])
    bs.inputs['Subsurface Weight'].default_value = 0.5
    bs.inputs['Subsurface Radius'].default_value = (1.0, 0.45, 0.15)
    bs.inputs['Subsurface Scale'].default_value = 0.016
    bs.inputs['Specular IOR Level'].default_value = 0.35
    # 很细的皮肤颗粒
    tc = node(nt, 'ShaderNodeTexCoord', -600, -400)
    nz = node(nt, 'ShaderNodeTexNoise', -400, -400)
    nz.inputs['Scale'].default_value = 180.0
    nz.inputs['Detail'].default_value = 3.0
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    bump = node(nt, 'ShaderNodeBump', 300, -400)
    bump.inputs['Strength'].default_value = 0.02
    bump.inputs['Distance'].default_value = 0.002
    nt.links.new(nz.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bs.inputs['Normal'])
    return m


def eye_material():
    """眼睛圆盘：UV 中心 = 圆盘中心，半径 0.5 = 圆盘边缘。大黑瞳（略偏下）+ 灰绿虹膜，外圈深一点。"""
    m = bpy.data.materials.new('NaiwaEye')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = node(nt, 'ShaderNodeOutputMaterial', 1100, 0)
    bs = node(nt, 'ShaderNodeBsdfPrincipled', 800, 0)
    nt.links.new(bs.outputs[0], out.inputs[0])
    uv = node(nt, 'ShaderNodeUVMap', -900, 0)
    sub = node(nt, 'ShaderNodeVectorMath', -700, 0, operation='SUBTRACT')
    nt.links.new(uv.outputs['UV'], sub.inputs[0])
    sub.inputs[1].default_value = (0.5, 0.5, 0.0)
    ln = node(nt, 'ShaderNodeVectorMath', -500, 100, operation='LENGTH')
    nt.links.new(sub.outputs[0], ln.inputs[0])
    sub2 = node(nt, 'ShaderNodeVectorMath', -500, -100, operation='SUBTRACT')
    nt.links.new(sub.outputs[0], sub2.inputs[0])
    sub2.inputs[1].default_value = (-0.08, -0.10, 0.0)  # 瞳孔中心比圆盘中心低 0.2R、往鼻梁一侧 0.16R
    ln2 = node(nt, 'ShaderNodeVectorMath', -300, -100, operation='LENGTH')
    nt.links.new(sub2.outputs[0], ln2.inputs[0])
    iris = node(nt, 'ShaderNodeValToRGB', -100, 150)
    nt.links.new(ln.outputs['Value'], iris.inputs['Fac'])
    cr = iris.color_ramp
    cr.elements[0].position = 0.36
    cr.elements[0].color = srgb(IRIS)
    cr.elements[1].position = 0.50
    cr.elements[1].color = srgb(IRIS_RIM)
    pup = node(nt, 'ShaderNodeMapRange', -100, -150)
    nt.links.new(ln2.outputs['Value'], pup.inputs['Value'])
    r = shape.PUPIL / shape.EYE_DISC * 0.5
    pup.inputs['From Min'].default_value = r - 0.012
    pup.inputs['From Max'].default_value = r + 0.006
    pup.inputs['To Min'].default_value = 1.0
    pup.inputs['To Max'].default_value = 0.0
    mx = node(nt, 'ShaderNodeMix', 300, 0)
    mx.data_type = 'RGBA'
    nt.links.new(pup.outputs['Result'], mx.inputs['Factor'])
    nt.links.new(iris.outputs['Color'], mx.inputs['A'])
    mx.inputs['B'].default_value = srgb(PUPIL)
    nt.links.new(mx.outputs['Result'], bs.inputs['Base Color'])
    bs.inputs['Roughness'].default_value = 0.45
    bs.inputs['Specular IOR Level'].default_value = 0.3
    bs.inputs['Coat Weight'].default_value = 0.08
    bs.inputs['Coat Roughness'].default_value = 0.3
    return m


def make_mouth_line():
    """闭嘴时的那道嘴缝：一根贴着脸的细管。"""
    pts = shape.mouth_line()
    center = pts.mean(axis=0)
    cu = bpy.data.curves.new('MouthLine', 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = 0.0018
    cu.bevel_resolution = 3
    sp = cu.splines.new('POLY')
    sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        sp.points[i].co = (*(p - center), 1.0)
    ob = bpy.data.objects.new('MouthLine', cu)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = center
    m = bpy.data.materials.new('MouthLine')
    m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = srgb(MOUTH_LINE)
    m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.6
    cu.materials.append(m)
    return ob


def make_eyes(mat, scale=1.0):
    """眼睛：贴着头皮长出来的一片“镜片”。圆盘内往外鼓 EYE_BULGE，圆盘外沉到皮下，所以边缘和皮肤严丝合缝。"""
    eyes = []
    R = shape.EYE_DISC
    nr, nt_ = 26, 72
    rs = np.concatenate([np.linspace(0, 1, 20), np.linspace(1, 1.25, nr - 20 + 1)[1:]]) * R
    th = np.linspace(0, 2 * np.pi, nt_, endpoint=False)
    for s, tag in ((1, 'L'), (-1, 'R')):
        pt, w = shape.eye_frame(s)
        pt = pt + w * (shape.EYE_R - shape.EYE_BULGE)  # 圆盘中心在皮肤上
        u = np.cross([0.0, 0.0, 1.0], w)
        u /= np.linalg.norm(u)
        v = np.cross(w, u)
        rr, tt = np.meshgrid(rs[1:], th, indexing='ij')
        rr = np.concatenate([[0.0], rr.ravel()])
        tt = np.concatenate([[0.0], tt.ravel()])
        q = pt + np.outer(rr * np.cos(tt), u) + np.outer(rr * np.sin(tt), v)
        # 沿视线方向投到皮肤上
        t = np.zeros(len(q))
        for _ in range(6):
            p = q + np.outer(t, w)
            d = shape.sdf(p)[0]
            e = 1e-4
            dd = (shape.sdf(p + w * e)[0] - d) / e
            t = t - d / np.clip(dd, 0.25, None)
        x = rr / R
        bulge = np.where(x < 1, shape.EYE_BULGE * np.clip(1 - x * x, 0, 1) ** 0.6, -0.0006 - 0.006 * (x - 1) / 0.25)
        P = q + np.outer(t + bulge, w)
        faces = []
        for j in range(nt_):
            faces.append((0, 1 + j, 1 + (j + 1) % nt_))
        for i in range(len(rs) - 2):
            for j in range(nt_):
                a = 1 + i * nt_ + j
                b = 1 + i * nt_ + (j + 1) % nt_
                faces.append((a, a + nt_, b + nt_, b))
        me = bpy.data.meshes.new(f'Eye.{tag}')
        me.from_pydata((P - pt).tolist(), [], faces)
        me.update()
        uvl = me.uv_layers.new(name='UVMap')
        uvx = 0.5 + 0.5 * x * np.cos(tt) * s
        uvy = 0.5 + 0.5 * x * np.sin(tt)
        for poly in me.polygons:
            for li in poly.loop_indices:
                vi = me.loops[li].vertex_index
                uvl.data[li].uv = (uvx[vi], uvy[vi])
        for poly in me.polygons:
            poly.use_smooth = True
        ob = bpy.data.objects.new(f'Eye.{tag}', me)
        bpy.context.scene.collection.objects.link(ob)
        ob.location = Vector(pt) * scale
        ob.scale = (scale, scale, scale)
        ob.data.materials.append(mat)
        eyes.append(ob)
    return eyes


# ───────────────────────── 场景（预览用） ─────────────────────────

def studio(height=1.0):
    """白色无缝背景 + 前上方的大柔光，和参考图的棚拍效果接近。"""
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 24
    sc.cycles.use_denoising = True
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    w = bpy.data.worlds.new('World')
    sc.world = w
    w.use_nodes = True
    wn = w.node_tree
    bg = wn.nodes['Background']
    bg.inputs[0].default_value = srgb('#ffffff')
    bg.inputs[1].default_value = 0.22
    # 相机直接看到的背景是浅灰白（和参考图一样），照明用的环境光弱一些
    bg2 = wn.nodes.new('ShaderNodeBackground')
    bg2.inputs[0].default_value = srgb('#ECECEC')
    bg2.inputs[1].default_value = 1.0
    lp = wn.nodes.new('ShaderNodeLightPath')
    mixs = wn.nodes.new('ShaderNodeMixShader')
    wn.links.new(lp.outputs['Is Camera Ray'], mixs.inputs[0])
    wn.links.new(bg.outputs[0], mixs.inputs[1])
    wn.links.new(bg2.outputs[0], mixs.inputs[2])
    wn.links.new(mixs.outputs[0], wn.nodes['World Output'].inputs[0])
    bpy.ops.mesh.primitive_plane_add(size=40)
    floor = bpy.context.object
    floor.name = 'Floor'
    fm = bpy.data.materials.new('Floor')
    fm.use_nodes = True
    fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = srgb('#C9C8C4')
    fm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1.0
    floor.data.materials.append(fm)
    floor.is_shadow_catcher = True

    def area(name, loc, energy, size):
        l = bpy.data.lights.new(name, 'AREA')
        l.energy = energy
        l.size = size
        o = bpy.data.objects.new(name, l)
        sc.collection.objects.link(o)
        o.location = Vector(loc) * height
        o.rotation_euler = (Vector((0, 0, 0.55 * height)) - o.location).to_track_quat('-Z', 'Y').to_euler()
        return o

    area('Key', (-0.8, -2.3, 3.2), 125 * height ** 2, 2.6 * height)
    area('Fill', (2.6, -2.4, 1.2), 10 * height ** 2, 4.0 * height)
    area('Rim', (0.8, 3.0, 2.6), 40 * height ** 2, 3.0 * height)
    cam = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    return cam


def aim(cam, loc, target, lens=50):
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = lens


def render(path, res=(640, 640), samples=24):
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.cycles.samples = samples
    sc.render.filepath = path
    t = time.time()
    bpy.ops.render.render(write_still=True)
    print('render', path, f'{time.time() - t:.1f}s', flush=True)


def build(voxel=0.004, faces=120000):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    v, f = mesh_from_sdf(voxel)
    body = make_mesh('Naiwa', v, f)
    decimate(body, faces)
    print('faces after decimate', len(body.data.polygons), flush=True)
    masks(body)
    body.data.materials.append(skin_material())
    eyes = make_eyes(eye_material())
    make_mouth_line()
    return body, eyes


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--voxel', type=float, default=0.004)
    ap.add_argument('--faces', type=int, default=120000)
    ap.add_argument('--preview', default='')
    ap.add_argument('--save', default='')
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    body, eyes = build(args.voxel, args.faces)
    if args.preview:
        os.makedirs(args.preview, exist_ok=True)
        cam = studio()
        # 和三视图一样的机位：正面、侧面（脸朝画面右边）、背面
        for name, loc in (('front', (0, -3.4, 0.55)), ('side', (-3.4, 0, 0.55)), ('back', (0, 3.4, 0.55)),
                          ('three_quarter', (-1.9, -2.8, 0.75))):
            aim(cam, loc, (0, 0, 0.5), 85)
            render(os.path.join(args.preview, f'{name}.png'), (720, 720), 32)
    if args.save:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.save))
