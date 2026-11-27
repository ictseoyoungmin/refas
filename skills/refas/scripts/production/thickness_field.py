"""Grade an explicit thickness field over metric mesh edges, without scene edits.

Coordinates and thicknesses use the same length unit; max_gradient is unitless.
Only the supplied edges constrain the field. No manifold, collision, physical
thickness or evaluated-modifier claim is made. Import from an authoring script.
"""
from collections.abc import Mapping
import heapq
import math
from numbers import Integral, Real


_SCOPE = "edgewise thickness field only; inspect the evaluated mesh and poses separately"


def _sequence(value, label):
    try:
        return tuple(value)
    except TypeError as exc:
        raise ValueError(label + " must be a sequence") from exc


def _number(value, label, *, positive=False):
    if isinstance(value, bool) or not isinstance(value, Real):
        raise ValueError(label + " must be a finite number")
    try:
        value = float(value)
    except (OverflowError, ValueError) as exc:
        raise ValueError(label + " exceeds the numeric range") from exc
    if not math.isfinite(value) or (positive and value <= 0):
        raise ValueError(label + " must be finite" + (" and positive" if positive else ""))
    return value


def _index(value, count):
    if isinstance(value, bool) or not isinstance(value, Integral) or not 0 <= value < count:
        raise ValueError("existing integer vertex index required")
    return int(value)


def _field(value, count, label):
    values = (value,) * count if isinstance(value, Real) else _sequence(value, label)
    if len(values) != count:
        raise ValueError(label + " must have one value per vertex")
    return [_number(x, label, positive=True) for x in values]


def grade_thickness(vertices, edges, requested, *, minimum, max_gradient,
                    protected=(), caps=None):
    """Approximate the greatest non-increasing field with an edgewise slope bound.

    For upper bounds u=min(requested, caps), the unconstrained result is
    h[i]=min_j(u[j]+max_gradient*graph_distance(j,i)). Floating-point path sums
    are rounded conservatively to satisfy the edge bound, so the returned field
    approximates this mathematical maximum. Protected vertices must retain their
    requested thickness; minimum may be scalar or per vertex.
    Infeasible bounds return FAIL with vertexThickness=None. Malformed input
    raises ValueError. Inputs are copied, including successful no-edit cases.

    Duplicate/reversed edges are merged; isolated vertices keep their local
    bounds. Minimums and pins are exact in the returned field. Edge gradients
    allow 1e-12 relative floating-point error, with no absolute length epsilon.
    """
    points = []
    for point in _sequence(vertices, "vertices"):
        point = _sequence(point, "vertex")
        if len(point) != 3:
            raise ValueError("vertices must contain three coordinates")
        points.append(tuple(_number(x, "coordinate") for x in point))
    count = len(points)
    if not count:
        raise ValueError("at least one vertex required")
    request = _field(requested, count, "requested thickness")
    floor = _field(minimum, count, "minimum thickness")
    gradient = _number(max_gradient, "max_gradient", positive=True)
    pins = [_index(i, count) for i in _sequence(protected, "protected vertices")]
    if len(set(pins)) != len(pins):
        raise ValueError("duplicate protected vertex")
    if caps is not None and not isinstance(caps, Mapping):
        raise ValueError("caps must map vertex indices to thicknesses")
    upper = request.copy()
    for index, value in ({} if caps is None else caps).items():
        index = _index(index, count)
        upper[index] = min(upper[index], _number(value, "cap", positive=True))

    graph = [[] for _ in points]
    lengths = {}
    for edge in _sequence(edges, "edges"):
        edge = _sequence(edge, "edge")
        if len(edge) != 2:
            raise ValueError("edges must have two vertex indices")
        a, b = sorted(_index(i, count) for i in edge)
        if (a, b) in lengths:
            continue
        length = math.dist(points[a], points[b])
        cost = gradient * length
        if a == b or length <= 0 or not math.isfinite(length) or not math.isfinite(cost):
            raise ValueError("finite positive edge length and finite gradient cost required")
        lengths[a, b] = length
        graph[a].append((b, cost, length))
        graph[b].append((a, cost, length))

    field = upper.copy()
    queue = [(value, i) for i, value in enumerate(field)]
    heapq.heapify(queue)
    while queue:
        value, i = heapq.heappop(queue)
        if value > field[i]:
            continue
        for j, cost, length in graph[i]:
            candidate = value + cost
            # A rounded-up sum may violate a small edge increment even though
            # the thickness itself is accurate. Lower the bound, not the slope
            # test's tolerance; protected values are still checked exactly below.
            if math.isfinite(candidate):
                while candidate > value and (candidate - value) / length > gradient:
                    candidate = math.nextafter(candidate, -math.inf)
            if candidate < field[j]:
                field[j] = candidate
                heapq.heappush(queue, (candidate, j))

    # Impose hard lower bounds exactly, then verify the resulting field. This
    # tolerates summation roundoff without forgiving a conflict at small scales.
    field = [max(value, low) for value, low in zip(field, floor)]
    for i in pins:
        field[i] = request[i]
    maximum = max((abs(field[a] - field[b]) / length
                   for (a, b), length in lengths.items()), default=0.0)
    reason = None
    if any(not low <= value <= high for value, low, high in zip(field, floor, upper)):
        reason = "minimum or protected thickness conflicts with a local bound"
    elif maximum > gradient and not math.isclose(maximum, gradient, rel_tol=1e-12, abs_tol=0.0):
        reason = "minimum or protected thickness conflicts with the edge gradient"
    return {
        "status": "FAIL" if reason else "PASS",
        "vertexThickness": None if reason else field,
        "reducedVertices": None if reason else sum(x < y for x, y in zip(field, request)),
        "maxEdgeGradient": maximum if math.isfinite(maximum) else None,
        "reason": reason,
        "scope": _SCOPE,
    }
