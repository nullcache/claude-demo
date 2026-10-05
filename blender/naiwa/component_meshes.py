"""Build the static measured character with independently animatable arms.

``build_components(voxel=.003, faces=200000)`` returns
``(body, eyes, {'L': arm_L, 'R': arm_R}, mouth_line)``.

The single shared volume pass preserves the same shape controls, coordinates,
materials, eyes, and neutral mouth as build.py. Body and arms are separate
closed surfaces. The face budget is ``faces`` for the body and ``faces//4``
for each arm, with a minimum arm budget of 8,000 triangles. No rig is added.
"""
from __future__ import annotations

import time
import numpy as np
import bpy
import bmesh
import build
import shape


def _mesh_qc(obj):
    """Check actual Blender topology after cleanup/decimation, not raw MC."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    report = {'vertices': len(bm.verts), 'faces': len(bm.faces),
              'boundary_edges': sum(e.is_boundary for e in bm.edges),
              'wire_edges': sum(e.is_wire for e in bm.edges),
              'nonmanifold_edges': sum(not e.is_manifold for e in bm.edges),
              'isolated_vertices': sum(not v.link_edges for v in bm.verts)}
    bm.free()
    obj['mesh_qc'] = str(report)
    if any(report[k] for k in ('boundary_edges', 'wire_edges',
                               'nonmanifold_edges', 'isolated_vertices')):
        raise RuntimeError(f'Component must be closed and manifold: {obj.name}: {report}')
    return report


def _component_masks(obj, is_body):
    build.masks(obj)
    attr = obj.data.color_attributes['mask']
    values = np.empty(len(attr.data) * 4, dtype=np.float32)
    attr.data.foreach_get('color', values)
    values = values.reshape(-1, 4)
    if is_body:
        # The nearby dark hand must never stain the torso after it moves.
        values[:, 1] = 0.0
    else:
        # Independent arms inherit only the existing wrist/hand gradient.
        values[:, 0] = 0.0
        values[:, 2] = 0.0
    attr.data.foreach_set('color', values.ravel())


def build_components(voxel=.003, faces=200000):
    """Create independent body/arm meshes and the repository's neutral face.

    Resets the scene like ``build.build``. All body and arm vertices remain in
    world coordinates with identity transforms; this is the coordinate
    contract used by animation_safe.bind_body/bind_arm.
    """
    from skimage.measure import marching_cubes
    if voxel <= 0 or faces < 1000:
        raise ValueError('voxel must be positive and faces must be at least 1000')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    started = time.perf_counter()
    xs, ys, zs, volumes = shape.volume(float(voxel), components=True)
    expected = {'body', 'arm.L', 'arm.R'}
    if set(volumes) != expected:
        raise ValueError(f'Expected component volumes {expected}, got {set(volumes)}')
    print(f'COMPONENT_VOLUME {volumes["body"].shape} {time.perf_counter()-started:.1f}s', flush=True)
    origin = np.array([xs[0], ys[0], zs[0]], dtype=np.float64)
    material = build.skin_material()
    objects = {}
    for name in ('body', 'arm.L', 'arm.R'):
        volume = volumes.pop(name)
        if not np.isfinite(volume).all():
            raise ValueError(f'Nonfinite SDF values in {name}')
        boundaries = (volume[0], volume[-1], volume[:, 0], volume[:, -1],
                      volume[:, :, 0], volume[:, :, -1])
        if any(np.any(v <= 0) for v in boundaries):
            raise ValueError(f'{name} touches the sampling boundary; enlarge shape.BOUNDS.')
        # Mirror build.mesh_from_sdf's exact-zero guard to avoid degenerates.
        volume[np.abs(volume) < 1e-7] = 1e-7
        vertices, triangles, _, _ = marching_cubes(volume, level=0.0,
                                                   spacing=(voxel, voxel, voxel))
        del volume
        obj = build.make_mesh('Naiwa' if name == 'body' else 'Arm.' + name[-1],
                              vertices + origin, triangles)
        budget = int(faces) if name == 'body' else max(8000, int(faces) // 4)
        build.decimate(obj, budget)
        _component_masks(obj, is_body=name == 'body')
        obj.data.materials.append(material)
        obj['component'] = name
        qc = _mesh_qc(obj)
        print(f'COMPONENT_READY {name} {qc}', flush=True)
        objects[name] = obj
    eyes = build.make_eyes(build.eye_material())
    mouth_line = build.make_mouth_line()
    arms = {tag: objects['arm.' + tag] for tag in ('L', 'R')}
    print(f'COMPONENT_BUILD_DONE {time.perf_counter()-started:.1f}s', flush=True)
    return objects['body'], eyes, arms, mouth_line
