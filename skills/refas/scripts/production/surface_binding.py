"""Transport authored points with one explicit triangle of a deforming surface.

Use from ordinary Blender authoring scripts. Supply evaluated surface vertices
and attached points in the same coordinate space and units. Build one sample per
mesh/pose, then reuse it for every attached section. Nothing reads or writes a
Blender scene, chooses a nearest face, changes input arrays, or saves a report.

The barycentric anchor follows the triangle; its orthonormal frame transports
point offsets rigidly, so surface stretch does not scale attachment thickness.
The first ordered edge defines the tangent and winding defines the normal,
including on mirrored surfaces. This is a local attachment construction, not a
collision solver. A section can still intersect other parts of a curved surface.

Topology checks require stable vertex identities. A coordinate-only semantic
vertex permutation with unchanged indices cannot be distinguished from motion.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import math
from numbers import Integral, Real
import struct


@dataclass(frozen=True)
class SurfaceSample:
    vertices: tuple
    triangles: tuple
    topology: str


@dataclass(frozen=True)
class SurfaceBinding:
    topology: str
    triangle_index: int
    triangle: tuple
    barycentric: tuple
    offsets: tuple


def _triple(values, label):
    try:
        values = tuple(values)
    except TypeError as exc:
        raise ValueError(label + " must contain three finite coordinates") from exc
    if len(values) != 3:
        raise ValueError(label + " must contain three finite coordinates")
    if any(isinstance(x, bool) or not isinstance(x, Real) or not math.isfinite(x)
           for x in values):
        raise ValueError(label + " must contain three finite coordinates")
    result = tuple(float(x) for x in values)
    if not all(math.isfinite(x) for x in result):
        raise ValueError(label + " exceeds supported numeric range")
    return result


def _index(value, count, label):
    if isinstance(value, bool) or not isinstance(value, Integral) or not 0 <= value < count:
        raise ValueError(label + " must be an existing integer index")
    return int(value)


def surface_sample(vertices, triangles):
    """Copy a surface and fingerprint its complete ordered triangle topology.

    ``triangles`` contains three vertex indices per triangle, not polygon IDs.
    Keep this order fixed across poses; explicitly triangulate an authoring mesh
    when its automatic tessellation changes. Only selected binding triangles
    must be geometrically nondegenerate; unrelated faces are not audited here.
    """
    vertices = tuple(_triple(p, "surface vertex") for p in vertices)
    checked = []
    for triangle in triangles:
        triangle = tuple(triangle)
        if len(triangle) != 3:
            raise ValueError("surface triangles must have three vertex indices")
        checked.append(tuple(_index(i, len(vertices), "triangle vertex") for i in triangle))
    triangles = tuple(checked)
    fingerprint = hashlib.sha256(struct.pack("<QQ", len(vertices), len(triangles)))
    for triangle in triangles:
        fingerprint.update(struct.pack("<QQQ", *triangle))
    return SurfaceSample(vertices, triangles, fingerprint.hexdigest())


def _minus(a, b):
    return tuple(x - y for x, y in zip(a, b))


def _dot(a, b):
    return math.fsum(x * y for x, y in zip(a, b))


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def _unit(vector):
    length = math.hypot(*vector)
    if not math.isfinite(length) or length == 0:
        raise ValueError("binding triangle is degenerate or outside supported numeric range")
    return tuple(x / length for x in vector)


def _frame(sample, index, barycentric):
    a, b, c = (sample.vertices[i] for i in sample.triangles[index])
    ab, ac = _minus(b, a), _minus(c, a)
    tangent, other = _unit(ab), _unit(ac)
    normal = _cross(tangent, other)
    # Dimensionless conditioning, independent of metres, centimetres or scale.
    if math.hypot(*normal) <= 1e-12:
        raise ValueError("binding triangle is degenerate or nearly collinear")
    normal = _unit(normal)
    bitangent = _unit(_cross(normal, tangent))
    # Cancellation in a skinny triangle's first cross product can leave its
    # normal slightly nonorthogonal. Complete the rigid basis from two axes.
    normal = _unit(_cross(tangent, bitangent))
    anchor = tuple(math.fsum((a[i], barycentric[1] * ab[i], barycentric[2] * ac[i]))
                   for i in range(3))
    if not all(math.isfinite(x) for x in anchor):
        raise ValueError("binding anchor exceeds supported numeric range")
    return anchor, (tangent, bitangent, normal)


def bind_surface_points(sample, triangle_index, points, *, barycentric):
    """Bind one point or a whole rigid section to an explicitly selected face.

    Supply three nonnegative barycentric weights summing to one. The authored
    anchor and offsets are retained; this function never projects or corrects
    an already intersecting attachment. Use a separate binding for each section
    that must follow a different part of the surface.
    """
    triangle_index = _index(triangle_index, len(sample.triangles), "binding triangle")
    barycentric = _triple(barycentric, "barycentric weights")
    total = math.fsum(barycentric)
    if min(barycentric) < 0 or abs(total - 1) > 1e-10:
        raise ValueError("barycentric weights must be nonnegative and sum to one")
    barycentric = tuple(x / total for x in barycentric)
    points = tuple(_triple(point, "attachment point") for point in points)
    if not points:
        raise ValueError("at least one attachment point is required")
    anchor, axes = _frame(sample, triangle_index, barycentric)
    offsets = tuple(tuple(_dot(_minus(point, anchor), axis) for axis in axes) for point in points)
    if any(not math.isfinite(x) for offset in offsets for x in offset):
        raise ValueError("attachment offsets exceed supported numeric range")
    return SurfaceBinding(sample.topology, triangle_index, sample.triangles[triangle_index],
                          barycentric, offsets)


def transport_surface_points(binding, sample):
    """Return new positions on a matching sample without modifying either input.

    The complete ordered topology must match, not merely the selected face.
    A rigid triangle rotation through more than 90 degrees is valid: comparing
    normals with the initial frame would incorrectly reject ordinary motion.
    """
    if sample.topology != binding.topology:
        raise ValueError("surface topology changed; select and bind the attachment again")
    if sample.triangles[binding.triangle_index] != binding.triangle:
        raise ValueError("binding triangle identity or winding changed")
    anchor, axes = _frame(sample, binding.triangle_index, binding.barycentric)
    result = tuple(tuple(math.fsum((anchor[i], *(offset[j] * axes[j][i] for j in range(3))))
                         for i in range(3)) for offset in binding.offsets)
    if any(not math.isfinite(x) for point in result for x in point):
        raise ValueError("transported points exceed supported numeric range")
    return result
