"""Create an original editable headset fixture using ordinary Blender Python.

This is a workflow fixture, not an image reconstruction or a game-ready claim.
Coordinates are metres, Z up, with the listener facing negative Y.
"""
import math

import bpy
from mathutils import Vector


def material(name, color, roughness, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*color, 1)
    mat.roughness, mat.metallic = roughness, metallic
    shader = next(node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    return mat


WHITE = material("Ceramic White", (0.78, 0.82, 0.86), 0.28)
NAVY = material("Deep Navy", (0.012, 0.025, 0.060), 0.32, 0.12)
PAD = material("Soft Charcoal", (0.018, 0.024, 0.032), 0.82)
METAL = material("Brushed Aluminium", (0.54, 0.59, 0.66), 0.25, 0.85)
ACCENT = material("Muted Blue", (0.035, 0.12, 0.22), 0.36, 0.35)


def mesh_object(name, vertices, faces, mat, uv_faces=None):
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    mesh.materials.append(mat)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    uv = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        coords = uv_faces[polygon.index] if uv_faces else [(0, 0), (1, 0), (1, 1), (0, 1)]
        for index, loop in enumerate(polygon.loop_indices):
            uv.data[loop].uv = coords[index % len(coords)]
    return obj


def rounded_box(name, location, dimensions, bevel, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    mod = obj.modifiers.new("Soft machined edges", "BEVEL")
    mod.width, mod.segments = bevel, 4
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for face in obj.data.polygons:
        face.use_smooth = True
    normal = obj.modifiers.new("Face normals", "WEIGHTED_NORMAL")
    normal.keep_sharp = True
    bpy.ops.object.modifier_apply(modifier=normal.name)
    return obj


def ribbon(name, rx, rz, base, thickness, width, mat, start=0, end=math.pi):
    vertices, faces, uv = [], [], []
    steps = 64
    for i in range(steps + 1):
        angle = start + (end - start) * i / steps
        center = Vector((rx * math.cos(angle), 0, base + rz * math.sin(angle)))
        normal = Vector((rz * math.cos(angle), 0, rx * math.sin(angle))).normalized()
        for sign, y in ((-1, -width / 2), (-1, width / 2), (1, width / 2), (1, -width / 2)):
            vertices.append(tuple(center + normal * thickness * sign / 2 + Vector((0, y, 0))))
    for i in range(steps):
        for j in range(4):
            faces.append((i * 4 + j, i * 4 + (j + 1) % 4,
                          (i + 1) * 4 + (j + 1) % 4, (i + 1) * 4 + j))
            uv.append([(i / steps, j / 4), (i / steps, (j + 1) / 4),
                       ((i + 1) / steps, (j + 1) / 4), ((i + 1) / steps, j / 4)])
    faces.extend([(3, 2, 1, 0), tuple(steps * 4 + j for j in range(4))])
    uv.extend([[(0, 0), (0, 1), (1, 1), (1, 0)]] * 2)
    obj = mesh_object(name, vertices, faces, mat, uv)
    obj["part_role"] = "headband"
    return obj


def ellipse_disc(name, x, y, z, ry, rz, depth, mat):
    count = 64
    vertices = [(x + side * depth / 2, y + ry * math.cos(2 * math.pi * i / count),
                 z + rz * math.sin(2 * math.pi * i / count))
                for side in (-1, 1) for i in range(count)]
    faces = [(i, (i + 1) % count, count + (i + 1) % count, count + i) for i in range(count)]
    faces.extend([tuple(reversed(range(count))), tuple(range(count, count * 2))])
    obj = mesh_object(name, vertices, faces, mat)
    # Analytic cylindrical UVs, plus planar UVs on the two ends.
    uv = obj.data.uv_layers.active
    for face in obj.data.polygons:
        for loop_index in face.loop_indices:
            vertex_index = obj.data.loops[loop_index].vertex_index
            angle = 2 * math.pi * (vertex_index % count) / count
            uv.data[loop_index].uv = ((math.cos(angle) + 1) / 2, (math.sin(angle) + 1) / 2)
        if face.index >= count:
            face.use_smooth = False
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new("Rounded cup edge", "BEVEL")
    mod.width, mod.segments = min(0.003, depth * 0.3), 3
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def ellipse_ring(name, x, center_z, ry, rz, tube, depth, mat):
    around, cross = 64, 12
    vertices, faces, uv = [], [], []
    for i in range(around):
        theta = 2 * math.pi * i / around
        for j in range(cross):
            phi = 2 * math.pi * j / cross
            vertices.append((x + depth * math.sin(phi),
                             (ry + tube * math.cos(phi)) * math.cos(theta),
                             center_z + (rz + tube * math.cos(phi)) * math.sin(theta)))
    for i in range(around):
        for j in range(cross):
            faces.append((i * cross + j, ((i + 1) % around) * cross + j,
                          ((i + 1) % around) * cross + (j + 1) % cross, i * cross + (j + 1) % cross))
            uv.append([(i / around, j / cross), ((i + 1) / around, j / cross),
                       ((i + 1) / around, (j + 1) / cross), (i / around, (j + 1) / cross)])
    return mesh_object(name, vertices, faces, mat, uv)


def tube(name, points, radius, mat):
    vertices, faces, uv = [], [], []
    sides = 12
    for i, point in enumerate(points):
        point = Vector(point)
        tangent = Vector(points[min(i + 1, len(points) - 1)]) - Vector(points[max(i - 1, 0)])
        tangent.normalize()
        normal = tangent.cross(Vector((0, 0, 1)))
        if normal.length < 0.01:
            normal = tangent.cross(Vector((0, 1, 0)))
        normal.normalize()
        binormal = tangent.cross(normal).normalized()
        for j in range(sides):
            angle = 2 * math.pi * j / sides
            vertices.append(tuple(point + radius * (math.cos(angle) * normal + math.sin(angle) * binormal)))
    for i in range(len(points) - 1):
        for j in range(sides):
            faces.append((i * sides + j, i * sides + (j + 1) % sides,
                          (i + 1) * sides + (j + 1) % sides, (i + 1) * sides + j))
            uv.append([(i / (len(points) - 1), j / sides), (i / (len(points) - 1), (j + 1) / sides),
                       ((i + 1) / (len(points) - 1), (j + 1) / sides), ((i + 1) / (len(points) - 1), j / sides)])
    faces.extend([tuple(reversed(range(sides))), tuple((len(points) - 1) * sides + j for j in range(sides))])
    uv.extend([[((math.cos(2 * math.pi * j / sides) + 1) / 2,
                 (math.sin(2 * math.pi * j / sides) + 1) / 2) for j in range(sides)]] * 2)
    return mesh_object(name, vertices, faces, mat, uv)


scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1
scene["fixture"] = "Original RefAs production headset; no image reference"
ribbon("HeadbandOuter", 0.103, 0.120, 0.164, 0.006, 0.035, WHITE)
ribbon("HeadbandSpine", 0.107, 0.124, 0.164, 0.002, 0.020, NAVY, 0.10, math.pi - 0.10)
ribbon("HeadbandComfortPad", 0.095, 0.111, 0.166, 0.010, 0.029, PAD, 0.40, math.pi - 0.40)

for side, sign in (("Left", -1), ("Right", 1)):
    x, z = sign * 0.101, 0.121
    ellipse_disc(side + "CupShell", x, 0, z, 0.040, 0.054, 0.030, WHITE)
    ellipse_disc(side + "CupFace", x + sign * 0.017, 0, z, 0.033, 0.047, 0.006, NAVY)
    ellipse_ring(side + "CupTrim", x + sign * 0.021, z, 0.031, 0.044, 0.0012, 0.0012, METAL)
    ellipse_disc(side + "DriverGrille", x - sign * 0.020, 0, z, 0.030, 0.043, 0.004, PAD)
    ellipse_ring(side + "EarCushion", x - sign * 0.026, z, 0.028, 0.041, 0.010, 0.011, PAD)
    rail = rounded_box(side + "AdjustmentRail", (sign * 0.102, 0, 0.194), (0.006, 0.017, 0.045), 0.002, METAL)
    rail["adjustment_axis"] = "local Z; translate with the attached cup assembly"
    points = [(x + sign * 0.004, -0.041 * math.cos(math.pi * i / 20),
               z + 0.054 * math.sin(math.pi * i / 20)) for i in range(21)]
    tube(side + "Yoke", points, 0.004, NAVY)
    rounded_box(side + "Joint", (x + sign * 0.004, 0, z + 0.054), (0.012, 0.025, 0.011), 0.003, WHITE)
    for tick in range(3):
        rounded_box(side + "RailMark" + str(tick + 1),
                    (sign * 0.106, -0.0005, 0.186 + tick * 0.005), (0.0005, 0.009, 0.0008), 0.0002, NAVY)
    rounded_box(side + "CupBadge", (x + sign * 0.022, -0.001, z), (0.0012, 0.013, 0.023), 0.002, ACCENT)

mic_points = []
for i in range(25):
    t = i / 24
    mic_points.append((-0.103 + 0.060 * t * t, -0.025 - 0.100 * t, 0.089 - 0.016 * math.sin(t * math.pi)))
tube("DetachableMicrophoneBoom", mic_points, 0.0028, NAVY)
rounded_box("MicrophoneCapsule", mic_points[-1], (0.013, 0.021, 0.010), 0.004, PAD)
rounded_box("MicrophoneMount", (-0.104, -0.027, 0.090), (0.016, 0.013, 0.015), 0.003, METAL)

bpy.context.view_layer.update()
print("Created original headset fixture with", len(scene.objects), "editable mesh parts")
