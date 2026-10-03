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


SKIN = '#F5BF1F'
BELLY = '#E8C688'
GREY = '#6B6650'
MOUTH_LINE = '#5A3A1E'
IRIS = '#8CC98B'
IRIS_RIM = '#2F5A2E'
PUPIL = '#080808'


# ───────────────────────── 网格 ─────────────────────────

def mesh_from_sdf(voxel):
    from scipy.ndimage import gaussian_filter1d
    from skimage.measure import marching_cubes
    b = shape.BOUNDS
    xs = np.arange(b[0, 0], b[0, 1] + voxel, voxel)
    ys = np.arange(b[1, 0], b[1, 1] + voxel, voxel)
    zs = np.arange(b[2, 0], b[2, 1] + voxel, voxel)
    vol = np.empty((len(xs), len(ys), len(zs)), np.float32)
    X, Y = np.meshgrid(xs, ys, indexing='ij')
    t = time.time()
    # 先算身体主干，沿 z 方向高斯模糊（σ≈6mm）抹掉叠层椭球之间的细横纹，再和四肢、眼眶合成
    loft = np.empty_like(vol)
    for k, z in enumerate(zs):
        P = np.stack([X.ravel(), Y.ravel(), np.full(X.size, z)], axis=1)
        loft[:, :, k] = shape.body_loft(P).reshape(X.shape)
    loft = gaussian_filter1d(loft, sigma=0.006 / voxel, axis=2, mode='nearest')
    for k, z in enumerate(zs):
        P = np.stack([X.ravel(), Y.ravel(), np.full(X.size, z)], axis=1)
        d, _ = shape.sdf(P, loft[:, :, k].ravel())
        vol[:, :, k] = d.reshape(X.shape)
    print(f'SDF {vol.shape} {time.time() - t:.1f}s', flush=True)
    v, f, _, _ = marching_cubes(vol, level=0.0, spacing=(voxel, voxel, voxel))
    v = v + b[:, 0]
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
    """颜色属性：R = 肚皮，G = 灰色手脚，B = 嘴缝。"""
    me = ob.data
    P = np.array([v.co[:] for v in me.vertices])
    d = shape.parts(P)
    rest = np.minimum.reduce([d['body']] + [d[k] for k in d if k.startswith(('upperarm', 'forearm', 'leg'))])
    hf = np.minimum.reduce([d[k] for k in d if k.startswith(('hand', 'foot'))])
    grey = 1 / (1 + np.exp(-(rest - hf) / 0.0025))
    # 肚皮：从正面投影的椭圆，只在身体正面
    x, y, z = P.T
    a, c, r = shape.profile(z)
    e = (x / 0.226) ** 2 + ((z - 0.448) / 0.180) ** 2
    belly = np.clip((1.03 - e) / 0.06, 0, 1)
    belly = belly * belly * (3 - 2 * belly)
    front = np.clip((c - y) / (0.55 * np.maximum(r, 1e-3)), 0, 1)
    armness = np.minimum.reduce([d[k] for k in d if k.startswith(('upperarm', 'forearm', 'hand'))])
    on_body = np.clip((armness - d['body']) / 0.006 + 0.5, 0, 1)
    belly = belly * front * on_body * (1 - grey)
    col = np.stack([belly, grey, np.zeros_like(belly), np.ones_like(belly)], axis=1)
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
    c = mix(sep.outputs[1], c, srgb(GREY), 50, 100)
    c = mix(sep.outputs[2], c, srgb(MOUTH_LINE), 250, 50)
    nt.links.new(c, bs.inputs['Base Color'])
    # 粗糙度：灰色手脚更哑
    rough = node(nt, 'ShaderNodeMapRange', 250, -200)
    nt.links.new(sep.outputs[1], rough.inputs['Value'])
    rough.inputs['To Min'].default_value = 0.5
    rough.inputs['To Max'].default_value = 0.72
    nt.links.new(rough.outputs['Result'], bs.inputs['Roughness'])
    bs.inputs['Subsurface Weight'].default_value = 0.15
    bs.inputs['Subsurface Radius'].default_value = (1.0, 0.8, 0.35)
    bs.inputs['Subsurface Scale'].default_value = 0.03
    bs.inputs['Sheen Weight'].default_value = 0.25
    bs.inputs['Sheen Roughness'].default_value = 0.45
    # 很细的皮肤颗粒
    tc = node(nt, 'ShaderNodeTexCoord', -600, -400)
    nz = node(nt, 'ShaderNodeTexNoise', -400, -400)
    nz.inputs['Scale'].default_value = 180.0
    nz.inputs['Detail'].default_value = 3.0
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    bump = node(nt, 'ShaderNodeBump', 300, -400)
    bump.inputs['Strength'].default_value = 0.05
    bump.inputs['Distance'].default_value = 0.002
    nt.links.new(nz.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bs.inputs['Normal'])
    return m


def eye_material():
    """眼球：沿局部 -Y 看出去，中心黑瞳 → 浅绿虹膜 → 深绿描边。"""
    m = bpy.data.materials.new('NaiwaEye')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = node(nt, 'ShaderNodeOutputMaterial', 900, 0)
    bs = node(nt, 'ShaderNodeBsdfPrincipled', 600, 0)
    nt.links.new(bs.outputs[0], out.inputs[0])
    tc = node(nt, 'ShaderNodeTexCoord', -800, 0)
    sep = node(nt, 'ShaderNodeSeparateXYZ', -600, 0)
    nt.links.new(tc.outputs['Object'], sep.inputs[0])
    # 与 -Y 的夹角：cos = -y / |p|（球半径 1）
    neg = node(nt, 'ShaderNodeMath', -400, 0, operation='MULTIPLY')
    nt.links.new(sep.outputs['Y'], neg.inputs[0])
    neg.inputs[1].default_value = -1.0
    ramp = node(nt, 'ShaderNodeValToRGB', -150, 0)
    nt.links.new(neg.outputs[0], ramp.inputs['Fac'])
    cr = ramp.color_ramp
    cr.interpolation = 'EASE'
    cr.elements[0].position = 0.30
    cr.elements[0].color = srgb(IRIS_RIM)
    cr.elements[1].position = 0.40
    cr.elements[1].color = srgb('#6FB46E')
    e = cr.elements.new(0.62)
    e.color = srgb(IRIS)
    e = cr.elements.new(0.885)
    e.color = srgb('#A6DAA2')
    e = cr.elements.new(0.90)
    e.color = srgb(PUPIL)
    nt.links.new(ramp.outputs['Color'], bs.inputs['Base Color'])
    bs.inputs['Roughness'].default_value = 0.35
    bs.inputs['Specular IOR Level'].default_value = 0.3
    bs.inputs['Coat Weight'].default_value = 0.45
    bs.inputs['Coat Roughness'].default_value = 0.08
    return m


def make_mouth_line():
    """闭嘴时的那道嘴缝：一根贴着脸的细管。"""
    pts = shape.mouth_line()
    center = pts.mean(axis=0)
    cu = bpy.data.curves.new('MouthLine', 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = 0.0036
    cu.bevel_resolution = 3
    sp = cu.splines.new('POLY')
    sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        _, n = shape.head_surface(0.0, p[2])
        sp.points[i].co = (*(p - center - n * 0.0004), 1.0)
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
    import bmesh
    eyes = []
    for s, tag in ((1, 'L'), (-1, 'R')):
        me = bpy.data.meshes.new(f'Eye.{tag}')
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=24, radius=1.0)
        for fc in bm.faces:
            fc.smooth = True
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(f'Eye.{tag}', me)
        bpy.context.scene.collection.objects.link(ob)
        ob.data.materials.append(mat)
        c, look = shape.eye_frame(s)
        # 局部 -Y 对准视线
        rot = Vector((0, -1, 0)).rotation_difference(Vector(look)).to_matrix().to_4x4()
        ob.matrix_world = Matrix.Translation(Vector(c) * scale) @ rot @ Matrix.Scale(shape.EYE_R * scale, 4)
        eyes.append(ob)
    return eyes


# ───────────────────────── 场景（预览用） ─────────────────────────

def studio(height=1.0):
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
    w.node_tree.nodes['Background'].inputs[0].default_value = srgb('#ffffff')
    w.node_tree.nodes['Background'].inputs[1].default_value = 0.22
    bpy.ops.mesh.primitive_plane_add(size=30)
    floor = bpy.context.object
    floor.name = 'Floor'
    fm = bpy.data.materials.new('Floor')
    fm.use_nodes = True
    fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = srgb('#F1F0EC')
    fm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.9
    floor.data.materials.append(fm)

    def area(name, loc, energy, size):
        l = bpy.data.lights.new(name, 'AREA')
        l.energy = energy
        l.size = size
        o = bpy.data.objects.new(name, l)
        sc.collection.objects.link(o)
        o.location = Vector(loc) * height
        o.rotation_euler = (Vector((0, 0, 0.55 * height)) - o.location).to_track_quat('-Z', 'Y').to_euler()
        return o

    area('Key', (-2.2, -3.0, 3.2), 230 * height ** 2, 2.5 * height)
    area('Fill', (3.0, -2.2, 1.6), 90 * height ** 2, 3.0 * height)
    area('Rim', (1.2, 3.0, 2.6), 160 * height ** 2, 2.0 * height)
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
        # 正面；侧面从 +X 看过去（脸朝画面左边，和参考图「侧立」一致）；3/4
        aim(cam, (0, -2.1, 0.52), (0, 0, 0.5), 50)
        render(os.path.join(args.preview, 'front.png'))
        aim(cam, (2.0, 0, 0.62), (0, 0, 0.5), 50)
        render(os.path.join(args.preview, 'side.png'))
        aim(cam, (1.25, -1.6, 0.78), (0, 0, 0.5), 50)
        render(os.path.join(args.preview, 'three_quarter.png'))
    if args.save:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.save))
