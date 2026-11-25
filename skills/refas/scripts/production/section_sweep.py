"""Sampled section sweep: explicit profile correspondence, no scene mutation.

Open guide only. Every sample has an ordered 2D profile in the same units as
its center. Index j always denotes the same authored feature. This cannot infer
semantic correspondences, smooth a guide, or certify surface intersection.
Use vertices/faces with bpy Mesh.from_pydata; retain the author's controls.
"""
from dataclasses import dataclass
from math import cos, sin, hypot, isfinite, fsum
from numbers import Real

_EPS = 1e-10  # relative, dimensionless conditioning threshold


@dataclass(frozen=True)
class Sweep:
    vertices: tuple
    faces: tuple
    frames: tuple  # (u, v, tangent), one per input center, including twist


def _point(values, n):
    values = tuple(values)
    if len(values) != n or any(isinstance(x, bool) or not isinstance(x, Real)
                                or not isfinite(x) for x in values):
        raise ValueError(f"expected {n} finite coordinates")
    return tuple(float(x) for x in values)


def _sub(a, b):
    return tuple(x-y for x, y in zip(a, b))


def _add(a, b):
    return tuple(x+y for x, y in zip(a, b))


def _mul(a, k):
    return tuple(x*k for x in a)


def _dot(a, b):
    return fsum(x*y for x, y in zip(a, b))


def _cross(a, b):
    x, y, z = a
    p, q, r = b
    return (y*r-z*q, z*p-x*r, x*q-y*p)


def _unit(a):
    length = hypot(*a)
    if not isfinite(length) or length == 0:
        raise ValueError("zero or nonfinite vector")
    return tuple(x/length for x in a)


def _perpendicular(u, t):
    u = _unit(u)
    v = _cross(t, u)
    if hypot(*v) <= _EPS:
        raise ValueError("initial direction parallel to tangent")
    return _unit(_cross(_unit(v), t))


def _transport(u, a, b):
    # Rodrigues shortest rotation, using cross(a,b) without normalizing the
    # rotation axis. No arbitrary world-axis switch at an inflection.
    d = max(-1., min(1., _dot(a, b)))
    if 1+d <= _EPS:
        raise ValueError("ambiguous near-antiparallel tangents; refine guide")
    k = _cross(a, b)
    return _perpendicular(_add(_add(u, _cross(k, u)),
                               _mul(_cross(k, _cross(k, u)), 1/(1+d))), b)


def _orient(a, b, c):
    x, y = _sub(b, a)
    p, q = _sub(c, a)
    return x*q-y*p


def _intersects(a, b, c, d):
    # Coordinates normalized by profile size; near contacts are refused.
    if any(max(a[k], b[k]) < min(c[k], d[k])-_EPS or
           max(c[k], d[k]) < min(a[k], b[k])-_EPS for k in range(2)):
        return False
    p, q = _orient(a, b, c), _orient(a, b, d)
    r, s = _orient(c, d, a), _orient(c, d, b)
    return (min(p,q) <= _EPS and max(p,q) >= -_EPS and
            min(r,s) <= _EPS and max(r,s) >= -_EPS)


def _validate_profile(profile, closed, cap):
    origin = profile[0]
    centered = tuple(_sub(p, origin) for p in profile)
    scale = max(hypot(*p) for p in centered)
    if not isfinite(scale) or scale == 0:
        raise ValueError("collapsed profile")
    p = tuple(tuple(x/scale for x in v) for v in centered)
    n = len(p)
    edges = [(i,(i+1)%n) for i in range(n if closed else n-1)]
    for i,j in edges:
        if hypot(*_sub(p[i],p[j])) <= _EPS:
            raise ValueError("duplicate or near-coincident profile vertices")
    for i in range(0 if closed else 1,n if closed else n-1):
        a, b, c = p[(i-1)%n], p[i], p[(i+1)%n]
        if abs(_orient(a,b,c)) <= _EPS and _dot(_sub(a,b),_sub(c,b)) > 0:
            raise ValueError("backtracking profile")
    for k,(i,j) in enumerate(edges):
        for l,m in edges[k+1:]:
            if len({i,j,l,m}) == 4 and _intersects(p[i],p[j],p[l],p[m]):
                raise ValueError("self-crossing or touching profile")
    if closed:
        area2 = fsum(_orient((0,0),p[i],p[j]) for i,j in edges)
        if area2 <= _EPS:
            raise ValueError("closed profiles require nondegenerate CCW order")
        if cap and any(_orient(p[(i-1)%n],p[i],p[(i+1)%n]) <= _EPS for i in range(n)):
            raise ValueError("end caps currently require strictly convex profiles")


def _triangle_normal(a,b,c):
    ab, ac = _sub(b,a), _sub(c,a)
    scale = max(hypot(*ab), hypot(*ac))
    if not isfinite(scale) or scale == 0:
        raise ValueError("collapsed surface face")
    normal = _cross(tuple(x/scale for x in ab),tuple(x/scale for x in ac))
    if hypot(*normal) <= _EPS:
        raise ValueError("degenerate surface face; refine sections")
    return _unit(normal)


def sweep_sections(centers, profiles, initial_u, *, closed_profile, cap_ends=False,
                   twist=None):
    """Make a sampled open-guide sweep with explicit matching section vertices.

    Profiles use (u,v), with u x v = forward tangent. Closed profiles are CCW
    with no repeated seam vertex; open profiles are ordered polylines. Caps
    are optional and convex-only. Twist is absolute radians per sample, not
    accumulated transport. Tangents are chord bisectors at interior samples.
    Output has quad strips and optional triangles, no duplicate seam vertices.
    It refuses degenerate local faces and folded quads; not a collision or
    surface-fairing solver. Keep resolution high enough for the intended shape.
    """
    if type(closed_profile) is not bool or type(cap_ends) is not bool:
        raise ValueError("profile and cap flags must be booleans")
    if cap_ends and not closed_profile:
        raise ValueError("open profiles cannot have end caps")
    centers = tuple(_point(p,3) for p in centers)
    profiles = tuple(tuple(_point(p,2) for p in ring) for ring in profiles)
    n = len(centers)
    if n < 2 or len(profiles) != n:
        raise ValueError("one corresponding profile per guide sample required")
    m = len(profiles[0])
    if m < (3 if closed_profile else 2) or any(len(p) != m for p in profiles):
        raise ValueError("incompatible profile vertex counts")
    if centers[0] == centers[-1]:
        raise ValueError("closed guide unsupported")
    angles = tuple(0. for _ in centers) if twist is None else tuple(twist)
    if len(angles) != n or any(isinstance(x,bool) or not isinstance(x,Real)
                              or not isfinite(x) for x in angles):
        raise ValueError("one finite absolute twist per section required")
    segments = [_sub(b,a) for a,b in zip(centers,centers[1:])]
    lengths = [hypot(*s) for s in segments]
    if not all(isfinite(s) for s in lengths) or min(lengths) <= max(lengths)*_EPS:
        raise ValueError("duplicate or near-coincident guide samples")
    directions = [_unit(s) for s in segments]
    tangents = [directions[0]]
    for a,b in zip(directions,directions[1:]):
        if 1+_dot(a,b) <= _EPS:
            raise ValueError("guide reversal; refine guide")
        tangents.append(_unit(_add(a,b)))
    tangents.append(directions[-1])
    u = _perpendicular(_point(initial_u,3), tangents[0])
    frames, vertices, faces = [], [], []
    for i,(center,profile,t,angle) in enumerate(zip(centers,profiles,tangents,angles)):
        _validate_profile(profile,closed_profile,cap_ends and i in (0,n-1))
        if i:
            u = _transport(u,tangents[i-1],t)
        v = _unit(_cross(t,u))
        c,s = cos(angle),sin(angle)
        x = _add(_mul(u,c),_mul(v,s))
        y = _unit(_cross(t,x))
        frames.append((x,y,t))
        for a,b in profile:
            point = _add(center,_add(_mul(x,a),_mul(y,b)))
            if not all(isfinite(z) for z in point):
                raise ValueError("nonfinite output vertex")
            vertices.append(point)
    for i in range(n-1):
        for j in range(m if closed_profile else m-1):
            k = (j+1)%m
            face = (i*m+j,i*m+k,(i+1)*m+k,(i+1)*m+j)
            a,b,c,d = (vertices[index] for index in face)
            # Both possible Blender triangulations must be nondegenerate and
            # locally consistently oriented. This is not a global overlap test.
            if (_dot(_triangle_normal(a,b,c),_triangle_normal(a,c,d)) <= 0 or
                _dot(_triangle_normal(a,b,d),_triangle_normal(b,c,d)) <= 0):
                raise ValueError("folded surface quad; refine or correct sections")
            faces.append(face)
    if cap_ends:
        end = (n-1)*m
        for j in range(1,m-1):
            faces.extend(((0,j+1,j),(end,end+j,end+j+1)))
        for face in faces[-2*(m-2):]:
            _triangle_normal(*(vertices[i] for i in face))
    return Sweep(tuple(vertices),tuple(faces),tuple(frames))
