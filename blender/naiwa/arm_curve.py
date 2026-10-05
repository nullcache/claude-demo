"""Smooth swept arm SDF, retaining the repository's existing arm controls.

Integration in ``shape.parts`` (this module does not change ``shape``):

    arm = smooth_arm(p, s, shape_module)
    d[f'upperarm.{tag}'] = arm['upperarm']
    d[f'forearm.{tag}'] = arm['forearm']

The returned arrays use the same depth correction and rest/A-pose query as
``shape.parts``.  ``upperarm`` spans SHOULDER through ARM_MID to ELBOW;
``forearm`` spans ELBOW to WRIST.  They remain separate fields for weighting.
The centerline and radius are C1 PCHIP curves; no extra elbow sphere is added.
"""
from __future__ import annotations

from functools import lru_cache
import numpy as np
from scipy.interpolate import PchipInterpolator


@lru_cache(maxsize=16)
def _curves(control_values, radii, depth):
    points = np.asarray(control_values, dtype=np.float64).reshape(4, 3)
    order = np.argsort(points[:, 2])
    points = points[order]
    z = points[:, 2]
    if np.any(np.diff(z) <= 1e-9):
        raise ValueError('Arm controls must have distinct descending heights.')
    values = np.column_stack((points[:, 0], points[:, 1] / depth,
                              np.asarray(radii, dtype=np.float64)[order]))
    if np.any(values[:, 2] <= 0):
        raise ValueError('Arm radii must be positive.')
    curve = PchipInterpolator(z, values, axis=0, extrapolate=False)
    return curve, curve.derivative(), curve.derivative(2), z[0], z[-1]


def _distance(q, parameter, curve):
    value = curve(parameter)
    dx = value[:, 0] - q[:, 0]
    dy = value[:, 1] - q[:, 1]
    dz = parameter - q[:, 2]
    return np.sqrt(dx * dx + dy * dy + dz * dz) - value[:, 2]


def _closest_parameter(q, curve, derivative, second, z_min, z_max):
    # Initialize from the three control chords, including taper slope. This
    # avoids a height-only guess converging slowly near a rounded end cap.
    knots = curve.x
    values = curve(knots)
    centers = np.column_stack((values[:, :2], knots))
    z = np.clip(q[:, 2], z_min, z_max)
    best = np.full(len(q), np.inf)
    for i in range(len(knots) - 1):
        a, b = centers[i], centers[i + 1]
        line = b - a
        length2 = float(line @ line)
        length = np.sqrt(length2)
        pa = q - a
        along = np.einsum('ij,j->i', pa, line) / length
        radial = np.sqrt(np.maximum(0, np.einsum('ij,ij->i', pa, pa) - along * along))
        delta_radius = values[i + 1, 2] - values[i, 2]
        taper_denominator = np.sqrt(max(length2 - delta_radius ** 2, 1e-12))
        t = np.clip((along + delta_radius * radial / taper_denominator) / length, 0, 1)
        offset = pa - t[:, None] * line
        estimate = np.sqrt(np.einsum('ij,ij->i', offset, offset)) - (values[i, 2] + delta_radius * t)
        better = estimate < best
        z[better] = knots[i] + t[better] * (knots[i + 1] - knots[i])
        best[better] = estimate[better]
    max_step = (z_max - z_min) * .30
    for _ in range(3):
        value = curve(z)
        first = derivative(z)
        two = second(z)
        dx, dy, dz = value[:, 0] - q[:, 0], value[:, 1] - q[:, 1], z - q[:, 2]
        distance = np.sqrt(dx * dx + dy * dy + dz * dz)
        distance = np.maximum(distance, 1e-9)
        dot = dx * first[:, 0] + dy * first[:, 1] + dz
        speed2 = first[:, 0] ** 2 + first[:, 1] ** 2 + 1.0
        # Minimize |C(z)-q|-r(z), including radius slope; omitting it
        # systematically narrows a taper compared with a round cone.
        gradient = dot / distance - first[:, 2]
        curvature = ((speed2 + dx * two[:, 0] + dy * two[:, 1]) / distance
                     - dot * dot / distance ** 3 - two[:, 2])
        # Curvature can be negative far from a curved sweep. A positive
        # Gauss-Newton denominator keeps the update finite and directed.
        denominator = np.where(curvature > .05, curvature,
                               np.maximum(speed2 / distance, .05))
        step = np.clip(gradient / denominator, -max_step, max_step)
        z = np.clip(z - step, z_min, z_max)
    return z


def smooth_arm(p, s, shape):
    """Return upper/forearm distance arrays for points ``p`` of shape (N, 3).

    ``shape`` is the existing shape module or an object exposing SHOULDER,
    ARM_MID, ELBOW, WRIST, their R_* constants, ARM_DEPTH, and arm_query.
    ``s`` is +1 for anatomical left and -1 for right. Parameters are read
    on every call; cached splines automatically change when controls change.
    The operation is vectorized and allocates no point-by-segment tensor.
    """
    points = np.asarray(p, dtype=np.float64)
    if points.ndim != 2 or points.shape[1] != 3:
        raise ValueError('p must have shape (N, 3).')
    if s not in (-1, 1):
        raise ValueError('s must be +1 or -1.')
    depth = float(shape.ARM_DEPTH)
    if depth <= 0:
        raise ValueError('ARM_DEPTH must be positive.')
    controls = np.asarray([shape.SHOULDER, shape.ARM_MID, shape.ELBOW,
                           shape.WRIST], dtype=np.float64)
    radii = tuple(float(v) for v in (shape.R_SHOULDER, shape.R_MID,
                                     shape.R_ELBOW, shape.R_WRIST))
    curve, derivative, second, low, high = _curves(tuple(controls.ravel()), radii, depth)
    q = np.array(shape.arm_query(points, s), dtype=np.float64, copy=True)
    q[:, 0] *= s
    q[:, 1] /= depth
    if not len(q):
        return {'upperarm': np.empty(0), 'forearm': np.empty(0)}
    parameter = _closest_parameter(q, curve, derivative, second, low, high)
    elbow = float(shape.ELBOW[2])
    # A monotone sweep's nearest point for either subrange is its interior
    # stationary point or the subrange's endpoint. Check both endpoints,
    # too, to protect against unusual near-cap queries and control edits.
    upper = _distance(q, np.clip(parameter, elbow, high), curve)
    fore = _distance(q, np.clip(parameter, low, elbow), curve)
    at_elbow = _distance(q, np.full(len(q), elbow), curve)
    upper = np.minimum(upper, at_elbow)
    fore = np.minimum(fore, at_elbow)
    upper = np.minimum(upper, _distance(q, np.full(len(q), high), curve))
    fore = np.minimum(fore, _distance(q, np.full(len(q), low), curve))
    scale = depth ** .35
    return {'upperarm': upper * scale, 'forearm': fore * scale}
