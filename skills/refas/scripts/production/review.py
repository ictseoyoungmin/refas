"""Explicit diagnostic cameras and lighting, without claiming source registration."""
import math
import re


SCHEMA = "refas.production.review/v2"


def _number(value, label, low, high):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(label + " must be a finite number")
    if not low <= value <= high:
        raise ValueError(label + " is outside its supported range")
    return float(value)


def _vector(value, label, low=-1e6, high=1e6):
    if not isinstance(value, list) or len(value) != 3:
        raise ValueError(label + " must contain three numbers")
    return [_number(x, label, low, high) for x in value]


def validate_review(value):
    if not isinstance(value, dict) or value.get("schema") != SCHEMA:
        raise ValueError("invalid production review schema")
    if set(value) - {"schema", "views", "lighting", "background", "transparent"}:
        raise ValueError("unknown production review field")
    views = value.get("views")
    if not isinstance(views, list) or not 1 <= len(views) <= 12:
        raise ValueError("review must define between one and twelve views")
    result = {"schema": SCHEMA, "views": []}
    names = set()
    for view in views:
        if not isinstance(view, dict) or set(view) - {"name", "position", "target", "orthoScale", "reference"}:
            raise ValueError("invalid review view fields")
        name = view.get("name")
        if not isinstance(name, str) or not re.fullmatch(r"[a-z][a-z0-9-]{0,47}", name) or name in names:
            raise ValueError("review names must be unique portable names")
        names.add(name)
        position = _vector(view.get("position"), "camera.position")
        target = _vector(view.get("target"), "camera.target")
        if sum((a-b)**2 for a, b in zip(position, target)) < 1e-12:
            raise ValueError("camera position and target must differ")
        record = {"name": name, "position": position, "target": target,
                  "orthoScale": _number(view.get("orthoScale"), "camera.orthoScale", 1e-6, 1e6)}
        if "reference" in view:
            ref = view["reference"]
            if not isinstance(ref, dict) or set(ref) != {"sourceSha256", "regionPixels"}:
                raise ValueError("reference must identify sourceSha256 and regionPixels")
            if not isinstance(ref["sourceSha256"], str) or not re.fullmatch(r"[0-9a-f]{64}", ref["sourceSha256"]):
                raise ValueError("invalid reference source digest")
            region = ref["regionPixels"]
            if (not isinstance(region, list) or len(region) != 4 or
                    any(type(n) is not int or n < 0 for n in region) or region[0] >= region[2] or region[1] >= region[3]):
                raise ValueError("reference region must be positive pixel extents")
            record["reference"] = {"sourceSha256": ref["sourceSha256"], "regionPixels": list(region)}
        result["views"].append(record)
    light = value.get("lighting")
    if not isinstance(light, dict) or set(light) != {"center", "radius"}:
        raise ValueError("review must fix lighting center and radius")
    result["lighting"] = {"center": _vector(light["center"], "lighting.center"),
                          "radius": _number(light["radius"], "lighting.radius", 1e-6, 1e6)}
    result["background"] = _vector(value.get("background", [0.065, 0.08, 0.115]), "background", 0, 1)
    if type(value.get("transparent", False)) is not bool:
        raise ValueError("transparent must be boolean")
    result["transparent"] = value.get("transparent", False)
    return result
