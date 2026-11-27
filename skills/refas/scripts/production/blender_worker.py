#!/usr/bin/env python3
"""Execute one trusted production script inside Blender and observe its output.

Run with Blender, not the host Python interpreter::

    blender -b --factory-startup --threads 2 --python-exit-code 1 \
        --python blender_worker.py -- --job job.json

This worker does not judge reference likeness or game readiness. The native
scene is the editable source; the GLB and review renders are derived products.
Diagnostic lights and cameras are created only after saving/exporting it.
"""
from __future__ import annotations

import argparse
from array import array
from contextlib import contextmanager
import hashlib
import json
import math
from pathlib import Path
import runpy
import sys
import traceback

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from review import validate_review
from mesh_audit import _is_curve_tessellation

import bpy
from mathutils import Vector


SCHEMA = "refas.production.result/v2"
VIEWS = {"hero": (1.45, -2.2, 1.15), "front": (0, -1, 0),
         "side": (1, 0, 0), "back": (0, 1, 0), "top": (0, 0, 1)}
GEOMETRY_TYPES = {"MESH", "CURVE"}
ASSET_TYPES = GEOMETRY_TYPES | {"ARMATURE", "EMPTY", "LATTICE"}
LIMITATIONS = [
    "Diagnostic views are unregistered; they do not establish reference likeness.",
    "GLB reimport checks geometry counts, bounds and basic feature presence, not visual equivalence.",
    "Fingerprints hash recorded action curves and current-frame scene state; they do not establish correctness at every animation or simulation frame.",
    "Node-group internals and drivers are not exhaustively represented by the state fingerprints.",
    "Static mesh modifiers are evaluated for GLB export; unapplied non-armature modifiers on skinned or shape-key meshes are unsupported.",
    "Hidden or excluded asset meshes and curves are rejected. Explicit refas_role=construction meshes stay in native source, remain enabled in the scene/view layer, and require object-level hide_render; they are omitted from asset surface counts, bounds and delivery.",
    "Construction geometry is evaluated for static modifier delivery at the selected frame; its geometry animation is not automatically baked.",
    "Classic curves retain their editable controls in native output; convert selected final curves explicitly to meshes before delivery. Curve deformation is not automatically baked for export.",
    "Lattices retain editable deformation controls in native output, not render geometry. Keep cages enabled in the scene/view layer; apply the intended deformation and remove cages explicitly before delivery. Lattice animation is not automatically baked.",
    "Object instances must be realized into explicit scene objects; text, surfaces and other unsupported geometry must be converted before production submission.",
    "Unrealized evaluated instances, including Geometry Nodes instances, are rejected; realize their geometry before production inspection or export.",
    "Viewport/render modifier visibility and enabled subdivision levels must agree so inventory, export and diagnostic renders use the same declared geometry.",
    "Procedural Blender materials may need baking for faithful GLB appearance.",
]


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n", encoding="utf-8")


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                    allow_nan=False).encode()).hexdigest()


def file_hash(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def number(value):
    value = float(value)
    if not math.isfinite(value):
        raise ValueError("Scene contains a non-finite numeric value")
    return round(value, 8)


def vector(value):
    return [number(x) for x in value]


def values_hash(collection, name, width=1, code="f"):
    values = array(code, [0]) * (len(collection) * width)
    collection.foreach_get(name, values)
    return hashlib.sha256(values.tobytes()).hexdigest()


def properties(owner, excluded=()):
    """Record scalar RNA properties without traversing Blender's object graph."""
    result = {}
    for prop in owner.bl_rna.properties:
        key = prop.identifier
        if key in excluded or key == "rna_type" or prop.is_readonly:
            continue
        if prop.type not in {"BOOLEAN", "INT", "FLOAT", "STRING", "ENUM"}:
            continue
        value = getattr(owner, key)
        if getattr(prop, "is_array", False):
            value = [number(x) if isinstance(x, float) else x for x in value]
        elif isinstance(value, float):
            value = number(value)
        elif isinstance(value, set):
            value = sorted(value)
        result[key] = value
    return result


def object_role(obj):
    """An explicit native role chooses surface scope; hiding alone does not."""
    role = obj.get("refas_role", "asset")
    if not isinstance(role, str) or role not in {"asset", "construction"}:
        raise ValueError("refas_role must be asset or construction: " + obj.name)
    if role == "construction" and obj.type != "MESH":
        raise ValueError("The construction role supports MESH objects only: " + obj.name)
    return role


def object_references(owner):
    """Read direct RNA object/collection pointers, not node trees or drivers."""
    references = {}
    for prop in owner.bl_rna.properties:
        if prop.type != "POINTER" or prop.identifier == "rna_type":
            continue
        value = getattr(owner, prop.identifier)
        if isinstance(value, (bpy.types.Object, bpy.types.Collection)):
            references[prop.identifier] = value
    return references


def references_record(owner):
    result = {}
    for field, value in object_references(owner).items():
        row = {"type": "OBJECT" if isinstance(value, bpy.types.Object) else "COLLECTION",
               "name": value.name}
        if isinstance(value, bpy.types.Collection):
            row["objects"] = sorted(obj.name for obj in value.all_objects)
        result[field] = row
    return result


def enabled_layer_members():
    """Keep per-object hide_set distinct from disabled/excluded collections."""
    objects, collections = set(), set()

    def visit(layer):
        if layer.exclude or layer.hide_viewport or layer.collection.hide_viewport:
            return
        collections.add(layer.collection)
        objects.update(obj for obj in layer.collection.objects if not obj.hide_viewport)
        for child in layer.children:
            visit(child)

    visit(bpy.context.view_layer.layer_collection)
    return objects, collections


def image_record(image):
    packed = list(image.packed_files) if image.packed_files else []
    if packed:
        contents = [hashlib.sha256(x.packed_file.data).hexdigest() for x in packed]
    elif image.packed_file:
        contents = [hashlib.sha256(image.packed_file.data).hexdigest()]
    else:
        contents = []
    return {"name": image.name, "source": image.source, "size": list(image.size),
            "colorSpace": image.colorspace_settings.name, "packedSha256": contents}


def material_record(material):
    if material is None:
        return None
    state = {"name": material.name, "diffuseColor": vector(material.diffuse_color),
             "metallic": number(material.metallic), "roughness": number(material.roughness),
             "useNodes": material.use_nodes}
    if material.use_nodes and material.node_tree:
        nodes = []
        for node in sorted(material.node_tree.nodes, key=lambda x: x.name):
            entry = {"name": node.name, "type": node.bl_idname,
                     "properties": properties(node, {"location", "width", "height", "select", "label"}),
                     "inputs": []}
            for socket in node.inputs:
                value = getattr(socket, "default_value", None)
                if isinstance(value, (str, bool, int)) or value is None:
                    pass
                elif isinstance(value, float):
                    value = number(value)
                elif hasattr(value, "__len__"):
                    value = vector(value)
                else:
                    value = getattr(value, "name", None)
                entry["inputs"].append({"identifier": socket.identifier, "value": value})
            if getattr(node, "image", None):
                entry["image"] = image_record(node.image)
            if getattr(node, "color_ramp", None):
                entry["ramp"] = {"interpolation": node.color_ramp.interpolation,
                                 "elements": [[number(e.position), vector(e.color)] for e in node.color_ramp.elements]}
            if getattr(node, "node_tree", None):
                entry["nodeGroup"] = node.node_tree.name
            nodes.append(entry)
        state["nodes"] = nodes
        state["links"] = sorted([link.from_node.name, link.from_socket.identifier,
                                 link.to_node.name, link.to_socket.identifier]
                                for link in material.node_tree.links)
    state["fingerprint"] = digest(state)
    return state


def mesh_record(mesh):
    mesh.calc_loop_triangles()
    return {"vertices": len(mesh.vertices), "edges": len(mesh.edges),
            "polygons": len(mesh.polygons), "triangles": len(mesh.loop_triangles),
            "positions": values_hash(mesh.vertices, "co", 3),
            "edgeVertices": values_hash(mesh.edges, "vertices", 2, "i"),
            "loopVertices": values_hash(mesh.loops, "vertex_index", code="i"),
            "polygonSizes": values_hash(mesh.polygons, "loop_total", code="i"),
            "materialIndices": values_hash(mesh.polygons, "material_index", code="i"),
            "smoothPolygons": values_hash(mesh.polygons, "use_smooth", code="b"),
            "uvLayers": [{"name": layer.name, "coordinates": values_hash(layer.data, "uv", 2),
                          "activeRender": layer.active_render} for layer in mesh.uv_layers],
            "colorAttributes": [{"name": attr.name, "domain": attr.domain, "type": attr.data_type,
                                 "colors": values_hash(attr.data, "color", 4)} for attr in mesh.color_attributes]}


def action_record(action):
    if action is None:
        return None
    curves = []
    for curve in getattr(action, "fcurves", []):
        # Dense baked animation belongs in the native file and GLB. Hash every
        # key/sample here instead of duplicating their arrays in scene.json
        # (and again in each NLA strip). Interior changes remain observable.
        state = {"path": curve.data_path, "index": curve.array_index,
                 "extrapolation": curve.extrapolation, "mute": curve.mute,
                 "autoSmoothing": curve.auto_smoothing,
                 "keys": [{"co": vector(p.co), "left": vector(p.handle_left),
                           "right": vector(p.handle_right),
                           "leftType": p.handle_left_type, "rightType": p.handle_right_type,
                           "interpolation": p.interpolation, "easing": p.easing,
                           "amplitude": number(p.amplitude), "back": number(p.back),
                           "period": number(p.period)} for p in curve.keyframe_points],
                 "samples": [vector(p.co) for p in curve.sampled_points],
                 "modifiers": [{"type": m.type, "properties": properties(m),
                                "controlPoints": [properties(p) for p in getattr(m, "control_points", [])]}
                               for m in curve.modifiers]}
        curves.append({"path": curve.data_path, "index": curve.array_index,
                       "keyframeCount": len(state["keys"]), "sampleCount": len(state["samples"]),
                       "modifierCount": len(state["modifiers"]), "stateSha256": digest(state)})
    return {"name": action.name, "representation": "fcurve-state-sha256/v1",
            "frameRange": vector(action.frame_range), "properties": properties(action, {"name"}),
            "curves": curves}


def animation_record(animation):
    if animation is None:
        return None
    return {"action": action_record(animation.action),
            "tracks": [{"name": track.name, "mute": track.mute, "solo": track.is_solo,
                        "strips": [{"name": strip.name, "start": number(strip.frame_start),
                                    "end": number(strip.frame_end),
                                    "properties": properties(strip, {"name", "select"}),
                                    "action": action_record(strip.action)} for strip in track.strips]}
                       for track in animation.nla_tracks]}


def control_points_hash(points):
    """Hash authored controls, including dormant handles/keys, without rounding."""
    rows = []
    for point in points:
        row = {"type": point.bl_rna.identifier}
        for name in ("co", "location", "handle_left", "handle_right", "handle_left_type", "handle_right_type",
                     "handle_type_1", "handle_type_2",
                     "tilt", "radius", "weight", "weight_softbody"):
            if not hasattr(point, name):
                continue
            value = getattr(point, name)
            row[name] = list(value) if hasattr(value, "__len__") and not isinstance(value, str) else value
        rows.append(row)
    return digest(rows)


def curve_record(curve):
    """Keep source controls distinct from the current evaluated mesh."""
    profile = curve.bevel_profile
    return {"properties": properties(curve, {"name", "tag", "use_extra_user", "is_runtime_data"}),
            "bevelObject": curve.bevel_object.name if curve.bevel_object else None,
            "taperObject": curve.taper_object.name if curve.taper_object else None,
            "bevelProfile": {"properties": properties(profile), "controlPointCount": len(profile.points),
                             "controlPointsSha256": control_points_hash(profile.points)}
                            if profile else None,
            "animation": animation_record(curve.animation_data),
            "splines": [{"type": spline.type, "properties": properties(spline),
                         "controlPointCount": len(spline.bezier_points) + len(spline.points),
                         "controlPointsSha256": control_points_hash(
                             spline.bezier_points if spline.type == "BEZIER" else spline.points)}
                        for spline in curve.splines]}


def lattice_record(lattice):
    """Retain the editable cage without counting its points as surface geometry."""
    return {"properties": properties(lattice, {"name", "tag", "use_extra_user", "is_runtime_data"}),
            "controlPointCount": len(lattice.points),
            "restPositions": values_hash(lattice.points, "co", 3),
            "deformedPositions": values_hash(lattice.points, "co_deform", 3),
            "softbodyWeights": values_hash(lattice.points, "weight_softbody"),
            "animation": animation_record(lattice.animation_data)}


def object_record(obj, depsgraph):
    state = {"name": obj.name, "type": obj.type, "role": object_role(obj),
             "parent": obj.parent.name if obj.parent else None,
             "parentType": obj.parent_type, "parentBone": obj.parent_bone,
             "matrixWorld": [vector(row) for row in obj.matrix_world],
             "matrixLocal": [vector(row) for row in obj.matrix_local],
             "hideRender": obj.hide_render, "hideViewport": obj.hide_viewport,
             "modifiers": [{"type": m.type, "properties": properties(m), "dependencies": references_record(m),
                            "object": getattr(getattr(m, "object", None), "name", None)} for m in obj.modifiers],
             "constraints": [{"type": c.type, "properties": properties(c), "dependencies": references_record(c),
                              "target": getattr(getattr(c, "target", None), "name", None)} for c in obj.constraints]}
    if obj.type == "MESH":
        state["mesh"] = mesh_record(obj.data)
    elif obj.type == "CURVE":
        state["curve"] = curve_record(obj.data)
    elif obj.type == "LATTICE":
        state["lattice"] = lattice_record(obj.data)
        state["shapeKeyEvaluation"] = {"showOnlyShapeKey": obj.show_only_shape_key,
                                       "activeShapeKeyIndex": obj.active_shape_key_index}
    if obj.type in GEOMETRY_TYPES:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=depsgraph)
        try:
            if mesh is None:
                raise ValueError("No evaluated mesh; the curve is empty or contains unrealized instances: " + obj.name)
            state["evaluatedMesh"] = mesh_record(mesh)
        finally:
            evaluated.to_mesh_clear()
        state["materialSlots"] = [{"link": slot.link, "material": material_record(slot.material)}
                                  for slot in obj.material_slots]
    if obj.type in {"MESH", "LATTICE"}:
        groups = {group.index: group.name for group in obj.vertex_groups}
        points = obj.data.vertices if obj.type == "MESH" else obj.data.points
        weights = [[index, [[groups.get(g.group), number(g.weight) if obj.type == "MESH" else g.weight]
                            for g in point.groups]]
                   for index, point in enumerate(points) if point.groups]
        state["vertexGroups"] = [group.name for group in obj.vertex_groups]
        state["weights"] = digest(weights)
    if obj.type in GEOMETRY_TYPES | {"LATTICE"}:
        state["shapeKeys"] = []
        if obj.data.shape_keys:
            state["shapeKeyAnimation"] = animation_record(obj.data.shape_keys.animation_data)
            if obj.type in {"CURVE", "LATTICE"}:
                state[obj.type.lower() + "KeySettings"] = properties(
                    obj.data.shape_keys, {"name", "tag", "use_extra_user", "is_runtime_data"})
            for key in obj.data.shape_keys.key_blocks:
                entry = {"name": key.name, "value": number(key.value),
                         "relativeKey": key.relative_key.name,
                         "positions": values_hash(key.data, "co", 3)}
                if obj.type in {"CURVE", "LATTICE"}:
                    entry.update(properties=properties(key, {"name"}), frame=number(key.frame),
                                 controlPointsSha256=control_points_hash(key.data))
                state["shapeKeys"].append(entry)
    if obj.type == "ARMATURE":
        state["bones"] = [{"name": bone.name, "parent": bone.parent.name if bone.parent else None,
                           "head": vector(bone.head_local), "tail": vector(bone.tail_local),
                           "matrix": [vector(row) for row in bone.matrix_local], "deform": bone.use_deform}
                          for bone in sorted(obj.data.bones, key=lambda x: x.name)]
        state["pose"] = [{"name": bone.name, "matrix": [vector(row) for row in bone.matrix]}
                         for bone in sorted(obj.pose.bones, key=lambda x: x.name)]
    animation = obj.animation_data
    if animation:
        state["animation"] = animation_record(animation)
    state["fingerprint"] = digest(state)
    return state


def bounds(objects, depsgraph):
    points = []
    for obj in objects:
        if obj.type not in GEOMETRY_TYPES:
            continue
        evaluated = obj.evaluated_get(depsgraph)
        if obj.type == "CURVE":
            # Curve.bound_box includes controls/handles and can stay unchanged
            # while shape keys deform the surface. Observe actual tessellation.
            mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=depsgraph)
            try:
                if mesh is None:
                    raise ValueError("No evaluated mesh; the curve is empty or contains unrealized instances: " + obj.name)
                points.extend(evaluated.matrix_world @ vertex.co for vertex in mesh.vertices)
            finally:
                evaluated.to_mesh_clear()
        else:
            points.extend(evaluated.matrix_world @ Vector(corner) for corner in evaluated.bound_box)
    if not points:
        raise ValueError("No evaluated mesh or curve geometry to observe")
    low = Vector([min(p[i] for p in points) for i in range(3)])
    high = Vector([max(p[i] for p in points) for i in range(3)])
    return {"min": vector(low), "max": vector(high), "dimensions": vector(high - low)}


def inventory():
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    objects = list(bpy.context.scene.objects)
    rows = [object_record(obj, depsgraph) for obj in sorted(objects, key=lambda x: x.name)]
    asset_rows = [row for row in rows if row["role"] == "asset"]
    meshes = [row for row in asset_rows if row["type"] == "MESH"]
    curves = [row for row in asset_rows if row["type"] == "CURVE"]
    geometry = meshes + curves
    result = {"schema": "refas.production.scene/v2", "blenderVersion": bpy.app.version_string,
              "frame": bpy.context.scene.frame_current, "objects": rows,
              "timing": {"fps": bpy.context.scene.render.fps,
                         "fpsBase": number(bpy.context.scene.render.fps_base),
                         "subframe": number(bpy.context.scene.frame_subframe)},
              "units": {"system": bpy.context.scene.unit_settings.system,
                        "scaleLength": number(bpy.context.scene.unit_settings.scale_length)},
              "statistics": {"objects": len(rows), "meshes": len(meshes), "curves": len(curves),
                             "constructionMeshes": sum(row["role"] == "construction" for row in rows),
                             "lattices": sum(row["type"] == "LATTICE" for row in rows),
                             "vertices": sum(row["evaluatedMesh"]["vertices"] for row in geometry),
                             "triangles": sum(row["evaluatedMesh"]["triangles"] for row in geometry),
                             "armatures": sum(row["type"] == "ARMATURE" for row in rows),
                             "shapeKeyObjects": sum(bool(row.get("shapeKeys")) for row in asset_rows),
                             "uvObjects": sum(bool(row.get("mesh", row["evaluatedMesh"])["uvLayers"]) for row in geometry),
                             "materialSlots": sum(len(row["materialSlots"]) for row in geometry)},
              "bounds": bounds([obj for obj in objects if object_role(obj) == "asset"], depsgraph),
              "limitations": LIMITATIONS}
    result["fingerprint"] = digest({"frame": result["frame"], "timing": result["timing"],
                                    "units": result["units"], "objects": rows})
    return result


def require_visible_geometry():
    """Require a visible asset and explicitly hidden, enabled construction meshes."""
    enabled, _ = enabled_layer_members()
    for obj in bpy.context.scene.objects:
        role = object_role(obj)
        if role == "construction":
            if not obj.hide_render:
                raise ValueError("Construction meshes require object-level hide_render=True: " + obj.name)
            if obj not in enabled:
                raise ValueError("Construction meshes must be enabled in the scene and active view layer: " + obj.name)
        elif obj.type in ASSET_TYPES:
            parent = obj.parent
            while parent:
                if object_role(parent) == "construction":
                    raise ValueError("Construction meshes cannot be ancestors of delivered objects: "
                                     + parent.name + " -> " + obj.name)
                parent = parent.parent
    render_visible = set()

    def visit(collection, hidden=False):
        hidden = hidden or collection.hide_render
        if not hidden:
            render_visible.update(obj.name for obj in collection.objects)
        for child in collection.children:
            visit(child, hidden)

    visit(bpy.context.scene.collection)
    hidden = [obj.name for obj in bpy.context.scene.objects if obj.type in GEOMETRY_TYPES
              and object_role(obj) == "asset"
              and (obj.hide_render or obj.name not in render_visible
                   or not obj.visible_get(view_layer=bpy.context.view_layer))]
    if hidden:
        raise ValueError("Hidden or excluded meshes or curves are unsupported by the production workflow; "
                         "unhide them or remove helper geometry from the asset scene: "
                         + ", ".join(sorted(hidden)))


def require_supported_objects():
    """Do not silently omit native renderable types from export or observation."""
    instanced = [obj.name for obj in bpy.context.scene.objects if obj.instance_type != "NONE"]
    if instanced:
        raise ValueError("Object instancing is unsupported by the production workflow; realize instances "
                         "into explicit scene objects first: " + ", ".join(sorted(instanced)))
    unsupported = [obj.name + ":" + obj.type for obj in bpy.context.scene.objects
                   if obj.type not in ASSET_TYPES | {"CAMERA", "LIGHT"}]
    if unsupported:
        raise ValueError("Convert unsupported geometry to meshes before production export or inspection: "
                         + ", ".join(unsupported))
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    instancers = {instance.parent.name if instance.parent else instance.object.name
                  for instance in depsgraph.object_instances
                  if instance.is_instance and not _is_curve_tessellation(instance)}
    if instancers:
        raise ValueError("Evaluated geometry instances are unsupported by the production workflow; "
                         "use Realize Instances or convert them to explicit mesh objects first: "
                         + ", ".join(sorted(instancers)))


def require_matching_modifier_evaluation():
    """Inventory/export use the viewport graph; Cycles uses render settings."""
    mismatched = []
    enabled_objects, enabled_collections = enabled_layer_members()
    pending = [(obj, False) for obj in bpy.context.scene.objects]
    visited = set()

    def follow_references(owner, construction_source):
        for dependency in object_references(owner).values():
            if isinstance(dependency, bpy.types.Collection):
                members = list(dependency.all_objects)
                if (construction_source or any(object_role(obj) == "construction" for obj in members)):
                    if dependency not in enabled_collections:
                        raise ValueError("Construction dependency collections must be enabled in the scene "
                                         "and active view layer: " + dependency.name)
                pending.extend((obj, construction_source) for obj in members)
            else:
                pending.append((dependency, construction_source))

    while pending:
        obj, construction_source = pending.pop()
        construction_source = construction_source or object_role(obj) == "construction"
        identity = (obj, construction_source)
        if identity in visited:
            continue
        visited.add(identity)
        if construction_source and obj not in enabled_objects:
            raise ValueError("Construction dependencies must be enabled in the scene and active view layer: "
                             + obj.name)
        if object_role(obj) == "construction" and not obj.hide_render:
            raise ValueError("Construction meshes require object-level hide_render=True: " + obj.name)
        if obj.parent:
            pending.append((obj.parent, construction_source))
        for constraint in obj.constraints:
            follow_references(constraint, construction_source)
        if obj.type not in GEOMETRY_TYPES | {"LATTICE"}:
            continue
        if obj.type == "LATTICE" and (obj.name not in bpy.context.scene.objects
                or not obj.visible_get(view_layer=bpy.context.view_layer)):
            raise ValueError("Lattice cages must be enabled in the scene and active view layer "
                             "for consistent surface evaluation: " + obj.name)
        if obj.type == "CURVE":
            # Bevel/taper helpers can be local datablocks outside the scene.
            # Their render tessellation still changes the visible host surface.
            pending.extend((dependency, construction_source)
                           for dependency in (obj.data.bevel_object, obj.data.taper_object)
                           if dependency is not None)
            if obj.data.render_resolution_u:
                if any(spline.resolution_u != obj.data.render_resolution_u
                       for spline in obj.data.splines if spline.type != "POLY"):
                    mismatched.append(obj.name + " (viewport/render curve resolution)")
        for modifier in obj.modifiers:
            follow_references(modifier, construction_source)
            reason = None
            if modifier.show_viewport != modifier.show_render:
                reason = "viewport/render visibility"
            elif (modifier.show_viewport and modifier.type in {"SUBSURF", "MULTIRES"}
                  and modifier.levels != modifier.render_levels):
                reason = "viewport/render subdivision levels"
            if reason:
                mismatched.append(obj.name + ":" + modifier.name + " (" + reason + ")")
    if mismatched:
        raise ValueError("Different viewport/render modifier evaluation is unsupported; "
                         "match both settings or apply the intended geometry before production: "
                         + ", ".join(sorted(mismatched)))


def require_portable_scene():
    """Support self-contained native geometry and packed still textures explicitly."""
    require_visible_geometry()
    require_supported_objects()
    require_matching_modifier_evaluation()
    if bpy.data.libraries:
        raise ValueError("Linked Blender libraries are unsupported; make required data local first")
    for kind in ("movieclips", "cache_files", "sounds"):
        if any(item.users for item in getattr(bpy.data, kind, [])):
            raise ValueError("External " + kind + " are outside the current portable-scene contract")
    for image in bpy.data.images:
        if not image.users or image.type in {"RENDER_RESULT", "COMPOSITING"}:
            continue
        if image.source not in {"FILE", "GENERATED"}:
            raise ValueError("Only still image textures can be packed: " + image.name)
        packed = bool(image.packed_file or image.packed_files)
        if image.is_dirty or not packed:
            if not packed and image.source == "FILE" and not Path(bpy.path.abspath(image.filepath)).is_file():
                raise FileNotFoundError("Missing texture: " + image.name)
            # A packed file can still contain the old pixels after an in-memory
            # paint/edit. Refresh it before both fingerprinting and native save.
            image.pack()
        if not image.packed_file and not image.packed_files:
            raise ValueError("Texture could not be packed: " + image.name)
    bpy.ops.file.pack_all()


def glb_counts(path):
    data = Path(path).read_bytes()
    if data[:4] != b"glTF" or int.from_bytes(data[4:8], "little") != 2:
        raise ValueError("Exporter did not write a GLB 2 file")
    length = int.from_bytes(data[12:16], "little")
    if data[16:20] != b"JSON":
        raise ValueError("GLB JSON chunk missing")
    document = json.loads(data[20:20 + length])
    triangles = 0
    for node in document.get("nodes", []):
        if "mesh" not in node:
            continue
        for primitive in document["meshes"][node["mesh"]]["primitives"]:
            if primitive.get("mode", 4) != 4:
                raise ValueError("Only triangle GLB primitives are supported by the current verification")
            accessor = primitive.get("indices", primitive["attributes"]["POSITION"])
            triangles += document["accessors"][accessor]["count"] // 3
    return {"nodes": len(document.get("nodes", [])), "meshes": len(document.get("meshes", [])),
            "triangles": triangles, "materials": len(document.get("materials", [])),
            "skins": len(document.get("skins", [])), "animations": len(document.get("animations", [])),
            "cameras": len(document.get("cameras", [])),
            "lights": len(document.get("extensions", {}).get("KHR_lights_punctual", {}).get("lights", [])),
            "morphMeshes": sum(any(p.get("targets") for p in mesh["primitives"])
                               for mesh in document.get("meshes", []))}


def verify_glb(path, source):
    encoded = glb_counts(path)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # Importer display-only bone shapes are not delivery geometry. Prevent
    # their creation rather than filtering legitimate asset meshes by name.
    timing = source["timing"]
    bpy.context.scene.render.fps = timing["fps"]
    bpy.context.scene.render.fps_base = timing["fpsBase"]
    result = bpy.ops.import_scene.gltf(filepath=str(path), disable_bone_shape=True)
    if "FINISHED" not in result:
        raise RuntimeError("GLB reimport did not finish")
    bpy.context.scene.frame_set(source["frame"], subframe=timing["subframe"])
    observed = inventory()
    checks = {"trianglesMatchEncoded": observed["statistics"]["triangles"] == encoded["triangles"],
              "trianglesMatchNative": observed["statistics"]["triangles"] == source["statistics"]["triangles"],
              "nonEmpty": observed["statistics"]["meshes"] > 0,
              "noDiagnosticCamerasOrLights": encoded["cameras"] == 0 and encoded["lights"] == 0}
    extent = max(source["bounds"]["dimensions"])
    tolerance = max(extent * 1e-4, 1e-6)
    checks["boundsMatchNative"] = all(abs(a - b) <= tolerance
                                     for side in ("min", "max")
                                     for a, b in zip(source["bounds"][side], observed["bounds"][side]))
    if source["statistics"]["armatures"]:
        checks["skinPresent"] = encoded["skins"] > 0
    if source["statistics"]["shapeKeyObjects"]:
        checks["morphsPresent"] = encoded["morphMeshes"] > 0
    if not all(checks.values()):
        raise ValueError("GLB round-trip verification failed: " + json.dumps(checks, sort_keys=True))
    return {"status": "passed", "checks": checks, "encoded": encoded,
            "reimportedStatistics": observed["statistics"], "reimportedBounds": observed["bounds"],
            "boundsTolerance": tolerance, "scope": "geometry counts, bounds and basic feature presence only"}


@contextmanager
def preserve_positive_skin_weights(required=True):
    """Disable the exporter's tiny-weight cutoff only for this export call.

    Blender 4.3's exporter has no public threshold option or skin-extraction
    hook. Guard the precise local constant and comparison before changing a
    temporary function object; retain the exporter's own gathering, sorting
    and neutral-bone behavior. Neither installed source nor native data changes.
    """
    if not required:
        yield
        return
    import ast
    import inspect
    import textwrap
    import types
    from io_scene_gltf2.blender.exp.primitive_extract import PrimitiveCreator

    name = "_PrimitiveCreator__get_bone_data"
    original = getattr(PrimitiveCreator, name, None)
    if original is None or not inspect.isfunction(original):
        raise RuntimeError("Installed glTF exporter has an unsupported skin-weight extractor")
    parsed = ast.parse(textwrap.dedent(inspect.getsource(original)))
    assignments = [node for node in ast.walk(parsed) if isinstance(node, ast.Assign)
                   and any(isinstance(target, ast.Name) and target.id == "min_influence"
                           for target in node.targets)]
    comparisons = [node for node in ast.walk(parsed) if isinstance(node, ast.Compare)
                   and isinstance(node.left, ast.Name) and node.left.id == "weight"
                   and len(node.ops) == 1 and isinstance(node.ops[0], ast.LtE)
                   and len(node.comparators) == 1
                   and isinstance(node.comparators[0], ast.Name)
                   and node.comparators[0].id == "min_influence"]
    uses = [node for node in ast.walk(parsed)
            if isinstance(node, ast.Name) and node.id == "min_influence"]
    filters = [node for node in ast.walk(parsed) if isinstance(node, ast.If)
               and node.test in comparisons and len(node.body) == 1
               and isinstance(node.body[0], ast.Continue) and not node.orelse]
    if (len(assignments) != 1 or len(comparisons) != 1 or len(uses) != 2
            or len(filters) != 1 or not isinstance(assignments[0].value, ast.Constant)):
        raise RuntimeError("Installed glTF skin-weight cutoff changed; preservation needs review")
    cutoff = assignments[0].value.value
    if cutoff == 0.0:
        yield
        return
    constants = original.__code__.co_consts
    source_literals = [node for node in ast.walk(parsed) if isinstance(node, ast.Constant)
                       and type(node.value) is float and node.value == cutoff]
    matching = [index for index, value in enumerate(constants)
                if type(value) is float and value == cutoff]
    if cutoff != 0.0001 or len(source_literals) != 1 or len(matching) != 1:
        raise RuntimeError("Installed glTF skin-weight cutoff is not the supported isolated constant")
    updated = list(constants)
    updated[matching[0]] = 0.0
    replacement = types.FunctionType(original.__code__.replace(co_consts=tuple(updated)),
                                     original.__globals__, original.__name__,
                                     original.__defaults__, original.__closure__)
    setattr(PrimitiveCreator, name, replacement)
    try:
        yield
    finally:
        setattr(PrimitiveCreator, name, original)


def require_delivery_geometry():
    curves = sorted(obj.name for obj in bpy.context.scene.objects if obj.type == "CURVE")
    if curves:
        raise ValueError("Delivery requires meshes; explicitly convert selected final CURVE objects "
                         "in a production edit before delivery (curve deformation is not automatically baked): "
                         + ", ".join(curves))
    lattices = sorted(obj.name for obj in bpy.context.scene.objects if obj.type == "LATTICE")
    if lattices:
        raise ValueError("Delivery cannot retain LATTICE cages; explicitly apply the intended deformation "
                         "at the selected frame and remove construction cages in a production edit "
                         "before delivery (lattice animation is not automatically baked): "
                         + ", ".join(lattices))


def export_scene(out):
    require_delivery_geometry()
    scene = bpy.context.scene
    objects = list(scene.objects)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    realized = []
    for obj in objects:
        if obj.type != "MESH" or object_role(obj) == "construction" or not obj.modifiers:
            continue
        deformable = bool(obj.data.shape_keys) or any(m.type == "ARMATURE" for m in obj.modifiers)
        if deformable:
            unsupported = [m.name for m in obj.modifiers if m.type != "ARMATURE"
                           and (m.show_viewport or m.show_render)]
            if unsupported:
                raise ValueError("Unapplied modifiers on skinned or shape-key meshes are unsupported: "
                                 + obj.name + " (" + ", ".join(unsupported) + ")")
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True,
                                              depsgraph=depsgraph)
        realized.append((obj, mesh))
    # Only this disposable in-memory export state is changed. The native scene
    # was saved first and is reopened after export. Gather meshes before changing
    # any objects so dependent modifiers see the same original dependency graph.
    for obj, mesh in realized:
        obj.data = mesh
        obj.modifiers.clear()
    for obj in objects:
        obj.select_set(obj.type in ASSET_TYPES and object_role(obj) == "asset")
    selected = [obj for obj in objects if obj.type in ASSET_TYPES and object_role(obj) == "asset"]
    bpy.context.view_layer.objects.active = next((obj for obj in selected if obj.type == "MESH"), None)
    has_skins = any(obj.type == "MESH" and any(m.type == "ARMATURE" and m.object
                    for m in obj.modifiers) for obj in selected)
    with preserve_positive_skin_weights(has_skins):
        result = bpy.ops.export_scene.gltf(filepath=str(out / "asset.glb"), export_format="GLB",
                                          use_selection=True, export_cameras=False, export_lights=False,
                                          export_animations=True, export_apply=False, export_extras=False,
                                          # Small authored motion and skin influences remain data.
                                          export_optimize_animation_size=False,
                                          export_optimize_animation_keep_anim_armature=True,
                                          export_all_influences=True,
                                          export_texcoords=True, export_normals=True, export_materials="EXPORT")
    if "FINISHED" not in result:
        raise RuntimeError("GLB export did not finish")


def render_views(out, views, config, source, specification=None):
    if not views:
        return []
    original = bpy.context.scene
    review = bpy.data.scenes.new("__RefAsDiagnosticScene")
    for obj in original.objects:
        if obj.type in ASSET_TYPES:
            review.collection.objects.link(obj)
    bpy.context.window.scene = review
    review.render.fps = original.render.fps
    review.render.fps_base = original.render.fps_base
    review.frame_set(original.frame_current, subframe=original.frame_subframe)
    review.render.engine = "CYCLES"
    review.cycles.device = "CPU"
    review.cycles.samples = config["samples"]
    # Some Blender builds ship Cycles without OpenImageDenoise. Keep the
    # diagnostic backend explicit and portable instead of failing after export.
    review.cycles.use_denoising = False
    review.cycles.use_adaptive_sampling = False
    review.cycles.seed = 0
    review.render.threads_mode = "FIXED"
    review.render.threads = 2
    review.render.resolution_x = review.render.resolution_y = config["size"]
    review.render.resolution_percentage = 100
    review.render.image_settings.file_format = "PNG"
    review.render.image_settings.color_mode = "RGBA"
    review.render.film_transparent = specification["transparent"] if specification else False
    review.view_settings.view_transform = "AgX"
    review.world = bpy.data.worlds.new("__RefAsDiagnosticWorld")
    review.world.use_nodes = True
    background = next(node for node in review.world.node_tree.nodes if node.type == "BACKGROUND")
    background.inputs["Color"].default_value = (*specification["background"], 1) if specification else (0.065, 0.08, 0.115, 1)
    background.inputs["Strength"].default_value = 0.45
    low, high = Vector(source["bounds"]["min"]), Vector(source["bounds"]["max"])
    center = (low + high) / 2
    radius = max((high - low).length / 2, 0.001)
    if specification:
        center = Vector(specification["lighting"]["center"])
        radius = specification["lighting"]["radius"]
    fixed_views = {view["name"]: view for view in specification["views"]} if specification else {}
    for name, direction, energy, color, scale in [
            ("Key", (-1.4, -1.8, 2.4), 650, (1, 0.94, 0.86), 2.0),
            ("Fill", (1.8, -0.6, 0.8), 300, (0.72, 0.82, 1), 1.8),
            ("Rim", (0.6, 1.5, 2), 900, (0.75, 0.86, 1), 1.3)]:
        data = bpy.data.lights.new("__RefAs" + name, "AREA")
        data.energy, data.color, data.shape, data.size = energy * radius * radius, color, "DISK", radius * scale
        light = bpy.data.objects.new(data.name, data)
        review.collection.objects.link(light)
        light.location = center + Vector(direction) * radius
        light.rotation_euler = (center - light.location).to_track_quat("-Z", "Y").to_euler()
    data = bpy.data.cameras.new("__RefAsCamera")
    data.type = "ORTHO"
    data.ortho_scale = radius * 2.35
    data.clip_start, data.clip_end = radius * 0.01, radius * 20
    camera = bpy.data.objects.new("__RefAsCamera", data)
    review.collection.objects.link(camera)
    review.camera = camera
    observed = []
    for name in views:
        selected = fixed_views.get(name)
        target = Vector(selected["target"]) if selected else center
        if selected:
            camera.location = Vector(selected["position"])
            data.ortho_scale = selected["orthoScale"]
            distance = (camera.location - target).length
            data.clip_start = min(distance, data.ortho_scale) * 0.001
            data.clip_end = max(distance, data.ortho_scale) * 100
        else:
            camera.location = center + Vector(VIEWS[name]).normalized() * radius * 4
        camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
        bpy.context.view_layer.update()
        filename = "view-" + name + ".png"
        review.render.filepath = str(out / filename)
        bpy.ops.render.render(write_still=True, scene=review.name)
        if not (out / filename).is_file() or (out / filename).stat().st_size == 0:
            raise RuntimeError("Render produced no PNG: " + name)
        observed.append({"view": name, "path": filename, "sha256": file_hash(out / filename),
                         "registration": "unregistered", "sourceSceneFingerprint": source["fingerprint"],
                         "framing": "fixed-review-spec" if selected else "automatic-bounds",
                         "referenceRegion": selected.get("reference") if selected else None,
                         "lighting": {"center": vector(center), "radius": number(radius),
                                      "rig": "three-area-lights/v1"},
                         "renderer": {"engine": "CYCLES", "device": "CPU", "samples": config["samples"],
                                      "size": [config["size"], config["size"]], "viewTransform": "AgX",
                                      "denoising": False, "transparent": review.render.film_transparent,
                                      "worldColor": vector(background.inputs["Color"].default_value[:3]),
                                      "worldStrength": 0.45},
                         "camera": {"projection": "orthographic", "position": vector(camera.location),
                                    "target": vector(target), "orthoScale": number(data.ortho_scale),
                                    "matrixWorld": [vector(row) for row in camera.matrix_world]}})
    bpy.context.window.scene = original
    return observed


def exact_objects(names, field):
    """Resolve explicit scene names without substring matching or fallback."""
    missing = [name for name in names if bpy.context.scene.objects.get(name) is None]
    if missing:
        raise ValueError(field + " names missing from the native scene: " + ", ".join(missing))
    return [bpy.context.scene.objects[name] for name in names]


def protected_snapshot(names, frame):
    if not names:
        return {}
    scene = bpy.context.scene
    current = (scene.frame_current, scene.frame_subframe)
    try:
        scene.frame_set(frame[0], subframe=frame[1])
        bpy.context.view_layer.update()
        depsgraph = bpy.context.evaluated_depsgraph_get()
        return {obj.name: object_record(obj, depsgraph)["fingerprint"]
                for obj in exact_objects(names, "protectedObjects")}
    finally:
        scene.frame_set(current[0], subframe=current[1])


def require_protected(expected, frame):
    observed = protected_snapshot(list(expected), frame)
    changed = [name for name in expected if expected[name] != observed[name]]
    if changed:
        raise ValueError("Protected objects changed in recorded geometry, materials or state: "
                         + ", ".join(changed))


def query_native(job, source_sha):
    """Read selected native samples without building delivery or render artifacts."""
    scene = bpy.context.scene
    topology_details = job.get("queryTopologyDetails", True)
    names = job.get("queryObjects")
    if names is None:
        names = sorted(obj.name for obj in scene.objects)
    objects = exact_objects(names, "queryObjects")
    original_frame = (scene.frame_current, scene.frame_subframe)
    frames = job.get("queryFrames")
    requested = [(frame, 0.0) for frame in frames] if frames is not None else [original_frame]
    units = {"system": scene.unit_settings.system, "scaleLength": number(scene.unit_settings.scale_length)}
    result = {"schema": "refas.production.query/v2", "blendSha256": source_sha,
              "blenderVersion": bpy.app.version_string, "objectNames": names, "units": units,
              "samples": [], "scope": "selected native objects at requested frames; no saved or exported model",
              "limitations": ["Samples do not establish continuous motion, collision freedom, visual likeness or game readiness.",
                              "Topology uses the native scene unit scale; the query does not independently establish real-world dimensions."]}
    try:
        for frame, subframe in requested:
            scene.frame_set(frame, subframe=subframe)
            if scene.frame_current != frame:
                raise ValueError("queryFrames contains a frame outside Blender's supported range")
            bpy.context.view_layer.update()
            depsgraph = bpy.context.evaluated_depsgraph_get()
            rows = []
            for obj in objects:
                evaluated = obj.evaluated_get(depsgraph)
                row = {"name": obj.name, "type": obj.type, "role": object_role(obj),
                       "parent": obj.parent.name if obj.parent else None,
                       "matrixWorld": [vector(value) for value in evaluated.matrix_world],
                       "visible": obj.visible_get(view_layer=bpy.context.view_layer),
                       "hideRender": obj.hide_render, "instanceType": obj.instance_type}
                if obj.type == "LATTICE":
                    data = obj.data
                    row["lattice"] = {"pointsU": data.points_u, "pointsV": data.points_v,
                                      "pointsW": data.points_w, "controlPointCount": len(data.points),
                                      "interpolationU": data.interpolation_type_u,
                                      "interpolationV": data.interpolation_type_v,
                                      "interpolationW": data.interpolation_type_w,
                                      "useOutside": data.use_outside}
                    row["shapeKeyEvaluation"] = {"showOnlyShapeKey": obj.show_only_shape_key,
                                                 "activeShapeKeyIndex": obj.active_shape_key_index}
                if obj.type in GEOMETRY_TYPES | {"LATTICE"}:
                    row["shapeKeys"] = [{"name": key.name, "value": number(key.value)}
                                        for key in obj.data.shape_keys.key_blocks] if obj.data.shape_keys else []
                if obj.type in GEOMETRY_TYPES:
                    mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=depsgraph)
                    try:
                        if mesh is None:
                            raise ValueError("No evaluated mesh; the curve is empty or contains unrealized instances: " + obj.name)
                        mesh.calc_loop_triangles()
                        row["mesh"] = {"vertices": len(mesh.vertices), "edges": len(mesh.edges),
                                       "polygons": len(mesh.polygons), "triangles": len(mesh.loop_triangles)}
                    finally:
                        evaluated.to_mesh_clear()
                    row["materials"] = [slot.material.name if slot.material else None for slot in obj.material_slots]
                    if obj.type == "CURVE":
                        row["curve"] = {"splines": len(obj.data.splines),
                                        "controlPoints": sum(len(spline.bezier_points) + len(spline.points)
                                                             for spline in obj.data.splines),
                                        "splineTypes": sorted({spline.type for spline in obj.data.splines})}
                    row["bounds"] = bounds([obj], depsgraph)
                    if job.get("queryTopology", False):
                        from mesh_audit import audit_mesh
                        audit = audit_mesh(obj, depsgraph=depsgraph, meters_per_unit=units["scaleLength"],
                                           max_details=8 if topology_details else 1)
                        row["topology"] = {key: audit[key] for key in
                            ("schema", "scope", "metersPerUnit", "lengthToleranceM", "statistics", "limitations")}
                        row["topology"]["detailsIncluded"] = topology_details
                        row["topology"]["details"] = {
                            key: value if topology_details else {**value, "items": [], "truncated": value["count"] > 0}
                            for key, value in audit.items() if isinstance(value, dict) and "truncated" in value}
                rows.append(row)
            result["samples"].append({"frame": frame, "subframe": number(subframe), "objects": rows})
    finally:
        scene.frame_set(original_frame[0], subframe=original_frame[1])
    if file_hash(job["baseBlend"]) != source_sha:
        raise ValueError("Native input bytes changed during read-only query")
    return result


def export_preflight():
    """Check supported exporter hooks without creating or exporting a model."""
    required = {"export_all_influences", "export_optimize_animation_size",
                "export_optimize_animation_keep_anim_armature"}
    available = {prop.identifier for prop in bpy.ops.export_scene.gltf.get_rna_type().properties}
    missing = sorted(required - available)
    if missing:
        raise RuntimeError("Installed glTF exporter lacks required options: " + ", ".join(missing))
    with preserve_positive_skin_weights():
        pass
    return {"schema": "refas.production.preflight/v2", "status": "passed",
            "blenderVersion": bpy.app.version_string, "requiredOptions": sorted(required),
            "positiveSkinWeightGuard": "supported-and-restored",
            "scope": "required exporter options and guarded positive-weight hook; no model export, rendering or quality validation"}


def validate_job(job):
    if job.get("operation") not in {"edit", "inspect", "query", "preflight", "compare"}:
        raise ValueError("operation must be edit, inspect, query, preflight or compare")
    if job.get("outputProfile", "delivery") not in {"native", "delivery"}:
        raise ValueError("outputProfile must be native or delivery")
    for field in ("protectedObjects", "queryObjects"):
        names = job.get(field)
        if names is not None and (not isinstance(names, list) or any(not isinstance(name, str) or not name for name in names)
                                  or len(names) != len(set(names))):
            raise ValueError(field + " must contain unique exact object names")
    frames = job.get("queryFrames")
    if frames is not None and (not isinstance(frames, list) or not frames or
                               any(type(frame) is not int for frame in frames) or len(frames) != len(set(frames))):
        raise ValueError("queryFrames must be a nonempty list of unique integers")
    if type(job.get("queryTopology", False)) is not bool:
        raise ValueError("queryTopology must be boolean")
    if type(job.get("queryTopologyDetails", True)) is not bool:
        raise ValueError("queryTopologyDetails must be boolean")
    if job["operation"] in {"query", "preflight", "compare"} and (job.get("views") or job.get("reviewSpec") or job.get("script")):
        raise ValueError("query, preflight and compare do not run scripts, save models or render views")
    if job["operation"] == "compare":
        if any(job.get(key) for key in ("baseBlend", "baseGlb", "assetGlb")):
            raise ValueError("compare accepts captured PNGs only")
        images, digests = job.get("comparisonImages"), job.get("comparisonDigests")
        if (not isinstance(images, dict) or set(images) != {"baseline", "candidate"}
                or not isinstance(digests, dict) or set(digests) != set(images)
                or any(not Path(path).is_absolute() or not Path(path).is_file() for path in images.values())):
            raise ValueError("compare requires two absolute PNG paths and their digests")
    out = Path(job["outputDir"])
    if not out.is_absolute():
        raise ValueError("outputDir must be absolute")
    views = job.get("views", [])
    specification = None
    if job.get("reviewSpec"):
        path = Path(job["reviewSpec"])
        if not path.is_absolute() or not path.is_file() or path.stat().st_size > 65536:
            raise ValueError("reviewSpec must be an existing absolute JSON file under 64 KiB")
        specification = validate_review(json.loads(path.read_text(encoding="utf-8")))
    supported = {view["name"] for view in specification["views"]} if specification else set(VIEWS)
    if not isinstance(views, list) or len(views) != len(set(views)) or any(view not in supported for view in views):
        raise ValueError("views must be unique names from: " + ", ".join(sorted(supported)))
    config = job.get("render", {})
    if config.get("engine", "CYCLES") != "CYCLES":
        raise ValueError("Only the explicitly tested CYCLES CPU backend is supported")
    for key, default, low, high in (("size", 384, 64, 2048), ("samples", 8, 1, 256)):
        value = config.get(key, default)
        if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
            raise ValueError(f"render.{key} must be an integer between {low} and {high}")
        config[key] = value
    for key in ("baseBlend", "baseGlb", "script", "assetGlb"):
        if job.get(key) and (not Path(job[key]).is_absolute() or not Path(job[key]).is_file()):
            raise ValueError(key + " must name an existing absolute file")
    if job.get("baseGlb") and (job.get("baseBlend") or job["operation"] != "edit"):
        raise ValueError("baseGlb is an edit input mutually exclusive with baseBlend")
    if job["operation"] in {"inspect", "query"} and not job.get("baseBlend"):
        raise ValueError(job["operation"] + " requires baseBlend")
    if job["operation"] == "edit" and not job.get("script"):
        raise ValueError("edit requires script")
    out.mkdir(parents=True, exist_ok=True)
    if any(out.iterdir()):
        raise ValueError("outputDir must be empty; do not overwrite earlier evidence")
    return out, views, config, specification


def execute(job):
    out, views, config, specification = validate_job(job)
    result = {"schema": SCHEMA, "ok": False, "operation": job["operation"],
              "blenderVersion": bpy.app.version_string, "outputs": {}, "observations": [],
              "verification": {}, "warnings": list(LIMITATIONS)}
    if job["operation"] == "compare":
        from image_compare import compare_images
        images = job["comparisonImages"]
        comparison = compare_images(images["baseline"], images["candidate"],
                                    job["comparisonRegions"], job["comparisonSize"])
        if comparison["inputSha256"] != job["comparisonDigests"]:
            raise ValueError("comparison image digests do not match the selected captures")
        write_json(out / "comparison.json", comparison)
        result.update(ok=True, outputs={"comparison": "comparison.json"}, warnings=[])
        write_json(out / "result.json", result)
        return result
    if job["operation"] == "preflight":
        preflight = export_preflight()
        write_json(out / "preflight.json", preflight)
        result.update(ok=True, outputs={"preflight": "preflight.json"}, warnings=[])
        result["verification"]["exportCompatibility"] = preflight
        write_json(out / "result.json", result)
        return result
    source_sha = file_hash(job["baseBlend"]) if job["operation"] == "query" else None
    if job.get("baseBlend"):
        bpy.ops.wm.open_mainfile(filepath=job["baseBlend"], load_ui=False, use_scripts=False)
        if job.get("legacyImport"):
            if bpy.data.libraries:
                raise ValueError("Legacy native import requires no linked libraries")
            if any(image.users and image.source == "FILE" and not (image.packed_file or image.packed_files)
                   for image in bpy.data.images):
                raise ValueError("Legacy native import requires packed image textures")
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        if job.get("baseGlb"):
            if "FINISHED" not in bpy.ops.import_scene.gltf(filepath=job["baseGlb"], disable_bone_shape=True):
                raise RuntimeError("GLB import did not finish")
    if job["operation"] == "query":
        query = query_native(job, source_sha)
        write_json(out / "query.json", query)
        result.update(ok=True, outputs={"query": "query.json"}, warnings=query["limitations"])
        result["verification"]["native"] = {"status": "passed", "scope": "read-only selected-object observation",
                                               "sourceSha256": source_sha, "inputUnchanged": True}
        write_json(out / "result.json", result)
        return result
    if job["operation"] == "edit":
        profile = job.get("outputProfile", "delivery")
        result["outputProfile"] = profile
        protected_names = job.get("protectedObjects", [])
        exact_objects(protected_names, "protectedObjects")
        if protected_names:
            require_portable_scene()
        protected_frame = (bpy.context.scene.frame_current, bpy.context.scene.frame_subframe)
        protected = protected_snapshot(protected_names, protected_frame)
        script = Path(job["script"])
        runpy.run_path(str(script), init_globals={"bpy": bpy, "REFAS_OUTPUT_DIR": str(out),
                                                 "REFAS_INPUT_DIR": str(script.parent)}, run_name="__main__")
        if bpy.context.object and bpy.context.object.mode != "OBJECT":
            bpy.ops.object.mode_set(mode="OBJECT")
        require_portable_scene()
        require_protected(protected, protected_frame)
        if profile == "delivery":
            require_delivery_geometry()
        before = inventory()
        bpy.ops.wm.save_as_mainfile(filepath=str(out / "scene.blend"), check_existing=False, compress=False)
        if profile == "delivery":
            export_scene(out)
        bpy.ops.wm.open_mainfile(filepath=str(out / "scene.blend"), load_ui=False, use_scripts=False)
        source = inventory()
        if before["fingerprint"] != source["fingerprint"]:
            raise ValueError("Native scene changed across save/reopen; inspect recorded-state preservation")
        require_protected(protected, protected_frame)
        result["verification"]["native"] = {"status": "passed", "reopened": True,
                                               "fingerprintMatches": True, "statistics": source["statistics"]}
        result["verification"]["protectedObjects"] = {"status": "passed" if protected else "not-requested",
            "objects": sorted(protected), "frame": protected_frame[0], "subframe": number(protected_frame[1]),
            "scope": "recorded-object-state-and-materials",
            "limitations": ["Compared at the source frame; drivers and node-group internals are not exhaustively represented."]}
        result["outputs"]["blend"] = "scene.blend"
        if profile == "delivery":
            result["verification"]["glb"] = verify_glb(out / "asset.glb", source)
            bpy.ops.wm.open_mainfile(filepath=str(out / "scene.blend"), load_ui=False, use_scripts=False)
            result["outputs"]["glb"] = "asset.glb"
        else:
            result["verification"]["glb"] = {"status": "not-requested", "reason": "native-output-profile"}
    else:
        require_visible_geometry()
        require_supported_objects()
        require_matching_modifier_evaluation()
        source = inventory()
        result["verification"]["native"] = {"status": "passed", "reopened": True,
                                               "statistics": source["statistics"], "scope": "current-frame inventory"}
        if job.get("assetGlb"):
            result["verification"]["glb"] = verify_glb(Path(job["assetGlb"]), source)
            bpy.ops.wm.open_mainfile(filepath=job["baseBlend"], load_ui=False, use_scripts=False)
    write_json(out / "scene.json", source)
    result["outputs"]["scene"] = "scene.json"
    result["observations"] = render_views(out, views, config, source, specification)
    result["ok"] = True
    write_json(out / "result.json", result)
    print("REFAS_RESULT " + json.dumps({"ok": True, "operation": result["operation"],
                                      "statistics": source["statistics"]}), flush=True)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--job", required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    job = json.loads(Path(args.job).read_text(encoding="utf-8"))
    out = Path(job.get("outputDir", "."))
    previous_evidence = out.is_dir() and any(out.iterdir())
    try:
        execute(job)
    except Exception as error:
        # Keep failure evidence without replacing a successful result or hiding the Blender exit code.
        if not previous_evidence and out.is_absolute() and out.is_dir() and not (out / "result.json").exists():
            write_json(out / "result.json", {"schema": SCHEMA, "ok": False,
                                             "operation": job.get("operation"),
                                             "error": {"type": type(error).__name__, "message": str(error)}})
        traceback.print_exc()
        raise


if __name__ == "__main__":
    main()
