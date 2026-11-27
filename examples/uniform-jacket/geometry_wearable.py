"""Float64 triangle contact observations in scene metres.

This task helper intentionally avoids mathutils.intersect_ray_tri: its native
small-triangle threshold missed independently proven millimetre-long crossings.
BVH overlap is only the caller's candidate generator. Contact includes boundary
touch; directly adjacent faces must be excluded by the caller when appropriate.
"""
import numpy as np


def triangle_contact(one, two):
    a = np.asarray(one, dtype=np.float64)
    b = np.asarray(two, dtype=np.float64)
    if a.shape != (3, 3) or b.shape != (3, 3):
        raise ValueError('A contact observation requires two 3D triangles.')
    if not np.isfinite(a).all() or not np.isfinite(b).all():
        raise ValueError('Non-finite triangle coordinates cannot be assessed.')

    # Translation reduces projection cancellation without changing the geometry.
    origin = a[0].copy()
    a = a - origin
    b = b - origin
    edges_a = np.roll(a, -1, axis=0) - a
    edges_b = np.roll(b, -1, axis=0) - b
    normal_a = np.cross(edges_a[0], edges_a[1])
    normal_b = np.cross(edges_b[0], edges_b[1])
    if not np.any(normal_a) or not np.any(normal_b):
        # Exact degeneracy is reported separately by mesh_audit and shell audit.
        return False

    edges = np.concatenate((edges_a, edges_b))
    axes = np.concatenate((
        np.asarray((normal_a, normal_b)),
        np.cross(edges_a[:, None, :], edges_b[None, :, :]).reshape(9, 3),
        np.cross(normal_a, edges),
        np.cross(normal_b, edges),
    ))
    lengths = np.linalg.norm(axes, axis=1)
    axes = axes[lengths > 0] / lengths[lengths > 0, None]
    projected_a = a @ axes.T
    projected_b = b @ axes.T
    span = float(np.ptp(np.concatenate((a, b)), axis=0).max())
    epsilon = max(1e-12, span * np.finfo(np.float64).eps * 64)
    separated = (
        (projected_a.max(axis=0) < projected_b.min(axis=0) - epsilon)
        | (projected_b.max(axis=0) < projected_a.min(axis=0) - epsilon)
    )
    return not bool(np.any(separated))
