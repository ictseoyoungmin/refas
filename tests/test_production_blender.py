"""Opt-in real Blender checks for the production worker's artifact boundaries.

REFAS_BLENDER_TESTS=1 PYTHONDONTWRITEBYTECODE=1 python3 -m unittest \
    discover -s tests -p test_production_blender.py
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
WORKER = ROOT / "skills/refas/scripts/production/blender_worker.py"
EXAMPLES = ROOT / "examples/production-workflow"
BLENDER = os.environ.get("BLENDER_EXE") or shutil.which("blender")


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


@unittest.skipUnless(os.environ.get("REFAS_BLENDER_TESTS") == "1" and BLENDER,
                     "Set REFAS_BLENDER_TESTS=1 with Blender installed for real integration checks")
class ProductionBlenderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="refas-production-test-")
        cls.root = Path(cls.temp.name)
        cls.create = cls.run_job("create", script=str(EXAMPLES / "create_headset.py"),
                                 views=["hero", "side"])
        cls.source = cls.root / "create/scene.blend"
        cls.source_sha = sha(cls.source)
        cls.revised = cls.run_job("revise", script=str(EXAMPLES / "revise_headset.py"),
                                  baseBlend=str(cls.source), views=["hero", "side"])

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    @classmethod
    def run_job(cls, name, expect_success=True, **kwargs):
        job = {"operation": "edit", "outputDir": str(cls.root / name), "views": [],
               "render": {"engine": "CYCLES", "samples": 2, "size": 96}, **kwargs}
        job_path = cls.root / (name + ".json")
        job_path.write_text(json.dumps(job), encoding="utf-8")
        result = subprocess.run([str(BLENDER), "-b", "--factory-startup", "--threads", "2",
                                 "--python-exit-code", "1", "--python", str(WORKER), "--", "--job", str(job_path)],
                                env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
                                capture_output=True, text=True, timeout=90)
        (cls.root / (name + ".log")).write_text(result.stdout + result.stderr)
        if expect_success and result.returncode:
            raise AssertionError(result.stdout[-4000:] + result.stderr[-4000:])
        if not expect_success:
            return result
        return json.loads((cls.root / name / "result.json").read_text())

    def test_native_and_glb_reopen_with_actual_png_observations(self):
        for name, result in (("create", self.create), ("revise", self.revised)):
            self.assertTrue(result["ok"])
            self.assertTrue(result["verification"]["native"]["fingerprintMatches"])
            self.assertEqual((self.root / name / "scene.blend").read_bytes()[:7], b"BLENDER")
            self.assertTrue(all(result["verification"]["glb"]["checks"].values()))
            encoded = result["verification"]["glb"]["encoded"]
            self.assertEqual(encoded["cameras"], 0)
            self.assertEqual(encoded["lights"], 0)
            self.assertEqual(len(result["observations"]), 2)
            for observation in result["observations"]:
                png = (self.root / name / observation["path"]).read_bytes()
                self.assertEqual(png[:8], b"\x89PNG\r\n\x1a\n")
                self.assertEqual(struct.unpack(">II", png[16:24]), (96, 96))
                self.assertEqual(observation["registration"], "unregistered")
            scene = json.loads((self.root / name / "scene.json").read_text())
            self.assertEqual(scene["statistics"]["meshes"], 30)
            self.assertEqual(scene["statistics"]["objects"], 30)
            self.assertTrue(all(row["type"] == "MESH" for row in scene["objects"]))

    def test_local_revision_preserves_other_parts_and_native_source_bytes(self):
        before = json.loads((self.root / "create/scene.json").read_text())
        after = json.loads((self.root / "revise/scene.json").read_text())
        a = {row["name"]: row["fingerprint"] for row in before["objects"]}
        b = {row["name"]: row["fingerprint"] for row in after["objects"]}
        self.assertEqual(a.keys(), b.keys())
        self.assertEqual([name for name in a if a[name] != b[name]], ["HeadbandComfortPad"])
        self.assertEqual(sha(self.source), self.source_sha)
        self.assertEqual(before["bounds"], after["bounds"])
        for a_view, b_view in zip(self.create["observations"], self.revised["observations"]):
            self.assertEqual(a_view["camera"], b_view["camera"])

    def test_standalone_legacy_import_opens_native_and_glb_with_actual_observations(self):
        from test_production_import import create_legacy_project
        from production import project
        installed = self.root / "installed-import-skill"
        shutil.copytree(ROOT / "skills/refas", installed)
        entry = installed / "scripts/produce.py"
        reference = (self.root / "create/view-hero.png").read_bytes()
        original_scene = json.loads((self.root / "create/scene.json").read_text())
        for route, artifact in (("native", self.source), ("glb", self.root / "create/asset.glb")):
            with self.subTest(route=route):
                legacy = create_legacy_project(self.root / ("legacy-" + route), artifact.read_bytes(),
                                               artifact.suffix, reference)
                before = project.inventory(legacy["root"])
                target = self.root / ("imported-" + route)
                process = subprocess.run([sys.executable, "-B", str(entry), "import-v1",
                    "--root", str(target), "--source-project", str(legacy["root"]),
                    "--checkpoint", legacy["checkpoint"], "--artifact", legacy["artifact"],
                    "--name", "Imported " + route, "--blender", str(BLENDER),
                    "--views", "front", "--size", "96", "--samples", "2"],
                    capture_output=True, text=True, timeout=90)
                self.assertEqual(process.returncode, 0, process.stderr[-4000:] + process.stdout[-4000:])
                result = json.loads(process.stdout)
                self.assertTrue(project.verify_project(target)["ok"])
                revision = project.load_revision(target)
                self.assertEqual(revision["kind"], "import-v1")
                self.assertEqual(revision["migration"]["route"], route)
                self.assertEqual(revision["migration"]["certification"],
                                 {"inherited": False, "status": "not-evaluated"})
                self.assertEqual(project.inventory(legacy["root"]), before)
                self.assertEqual(Path(result["inputs"]["import/asset" + artifact.suffix]).read_bytes(), artifact.read_bytes())
                self.assertEqual(Path(result["outputs"]["blend"]).read_bytes()[:7], b"BLENDER")
                self.assertEqual(Path(result["outputs"]["glb"]).read_bytes()[:4], b"glTF")
                png = Path(result["observations"][0]["path"]).read_bytes()
                self.assertEqual(png[:8], b"\x89PNG\r\n\x1a\n")
                self.assertEqual(struct.unpack(">II", png[16:24]), (96, 96))
                self.assertTrue(revision["verification"]["native"]["fingerprintMatches"])
                self.assertTrue(all(revision["verification"]["glb"]["checks"].values()))
                imported_scene = json.loads(Path(result["outputs"]["scene"]).read_text())
                self.assertEqual(imported_scene["statistics"]["meshes"], original_scene["statistics"]["meshes"])
                self.assertEqual(imported_scene["statistics"]["triangles"], original_scene["statistics"]["triangles"])
                if route == "native":
                    self.assertEqual(imported_scene["fingerprint"], original_scene["fingerprint"])
                self.assertEqual(revision["assessment"],
                                 {"referenceResemblance": "not-evaluated", "gameReadiness": "not-evaluated"})
        self.assertEqual(sha(self.source), self.source_sha)

    def test_public_cli_reference_refresh_manual_import_and_exact_restore(self):
        reference = self.root / "create/view-hero.png"
        review = self.root / "reference-refresh-review.json"
        review.write_text(json.dumps({"schema": "refas.production.review/v2",
            "lighting": {"center": [0, 0, 0.1], "radius": 0.3},
            "background": [0.8, 0.85, 0.9], "transparent": True,
            "views": [{"name": "front", "position": [0, -2, 0.1],
                       "target": [0, 0, 0.1], "orthoScale": 0.8,
                       "reference": {"sourceSha256": sha(reference), "regionPixels": [0, 0, 96, 96]}}]}))
        demo = self.root / "reference-refresh"
        result = subprocess.run([sys.executable, "-B", str(ROOT / "examples/reference-refresh/run.py"),
            "--root", str(demo), "--skill-root", str(ROOT / "skills/refas"),
            "--input-blend", str(self.source), "--reference", str(reference), "--review-spec", str(review),
            "--manual-edit", str(EXAMPLES / "revise_headset.py"), "--blender", str(BLENDER)],
            capture_output=True, text=True, timeout=180)
        self.assertEqual(result.returncode, 0, result.stderr[-4000:] + result.stdout[-4000:])
        report = json.loads((demo / "result.json").read_text())
        self.assertTrue(report["ok"])
        self.assertEqual(report["commandCount"], 12)
        self.assertTrue(all(report["checks"].values()))
        revisions = demo / "project/.refas2/revisions"
        before = json.loads((revisions / report["stages"]["first"]["head"] / "artifacts/scene.json").read_text())
        after_dir = revisions / report["stages"]["adopted"]["head"] / "artifacts"
        after = json.loads((after_dir / "scene.json").read_text())
        a = {row["name"]: row["fingerprint"] for row in before["objects"]}
        b = {row["name"]: row["fingerprint"] for row in after["objects"]}
        self.assertEqual(a.keys(), b.keys())
        self.assertEqual([name for name in a if a[name] != b[name]], ["HeadbandComfortPad"])
        png = (after_dir / "view-front.png").read_bytes()
        self.assertEqual(png[:8], b"\x89PNG\r\n\x1a\n")
        self.assertEqual(struct.unpack(">II", png[16:24]), (128, 128))
        self.assertEqual(sha(self.source), self.source_sha)

    def test_inspection_does_not_resave_or_mutate_inputs(self):
        glb = self.root / "create/asset.glb"
        original_glb = sha(glb)
        result = self.run_job("inspect", operation="inspect", baseBlend=str(self.source), assetGlb=str(glb))
        self.assertTrue(result["ok"])
        self.assertEqual(result["outputs"], {"scene": "scene.json"})
        self.assertEqual(sha(self.source), self.source_sha)
        self.assertEqual(sha(glb), original_glb)

    def test_fixed_review_camera_and_lighting_survive_changed_bounds(self):
        spec = self.root / "fixed-review.json"
        spec.write_text(json.dumps({"schema": "refas.production.review/v2",
            "lighting": {"center": [0, 0, 0.1], "radius": 0.3},
            "background": [0.8, 0.85, 0.9], "transparent": True,
            "views": [{"name": "registered-hypothesis", "position": [0, -2, 0.1],
                       "target": [0, 0, 0.1], "orthoScale": 0.8}]}))
        script = self.root / "change-bounds.py"
        script.write_text("import bpy\nbpy.data.objects['HeadbandOuter'].location.x += 0.3\n")
        before = self.run_job("fixed-before", operation="inspect", baseBlend=str(self.source),
                              reviewSpec=str(spec), views=["registered-hypothesis"])
        after = self.run_job("fixed-after", script=str(script), baseBlend=str(self.source),
                             reviewSpec=str(spec), views=["registered-hypothesis"])
        a, b = before["observations"][0], after["observations"][0]
        self.assertEqual(a["camera"], b["camera"])
        self.assertEqual(a["lighting"], b["lighting"])
        self.assertEqual(a["renderer"], b["renderer"])
        self.assertNotEqual(a["sourceSceneFingerprint"], b["sourceSceneFingerprint"])
        self.assertEqual(a["registration"], "unregistered")
        self.assertEqual(a["framing"], "fixed-review-spec")
        self.assertEqual(sha(self.source), self.source_sha)

    def test_inspection_rejects_curves_instead_of_silently_omitting_them(self):
        source = self.root / "native-with-curve.blend"
        script = self.root / "native-with-curve.py"
        script.write_text('''import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_cube_add()
bpy.ops.curve.primitive_bezier_circle_add(radius=2)
bpy.context.object.name = "VisiblePiping"
bpy.context.object.data.bevel_depth = 0.1
bpy.ops.wm.save_as_mainfile(filepath=''' + repr(str(source)) + ''')
''')
        built = subprocess.run([str(BLENDER), "-b", "--factory-startup", "--threads", "2",
                                "--python-exit-code", "1", "--python", str(script)],
                               capture_output=True, text=True, timeout=60)
        self.assertEqual(built.returncode, 0, built.stdout[-2000:])
        original = sha(source)
        result = self.run_job("inspect-curve", expect_success=False, operation="inspect",
                              baseBlend=str(source), views=["front"])
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("VisiblePiping:CURVE", result.stdout + result.stderr)
        self.assertFalse((self.root / "inspect-curve/view-front.png").exists())
        self.assertEqual(sha(source), original)

    def test_instances_cannot_render_outside_the_inventoried_asset_scope(self):
        source = self.root / "native-with-instance.blend"
        script = self.root / "native-with-instance.py"
        script.write_text('''import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_cube_add()
hidden_collection = bpy.data.collections.new("InstanceContents")
bpy.ops.curve.primitive_bezier_circle_add(radius=2)
piping = bpy.context.object
piping.data.bevel_depth = 0.1
for collection in list(piping.users_collection):
    collection.objects.unlink(piping)
hidden_collection.objects.link(piping)
instance = bpy.data.objects.new("UninventoriedDecoration", None)
instance.instance_type = "COLLECTION"
instance.instance_collection = hidden_collection
bpy.context.scene.collection.objects.link(instance)
bpy.ops.wm.save_as_mainfile(filepath=''' + repr(str(source)) + ''')
''')
        built = subprocess.run([str(BLENDER), "-b", "--factory-startup", "--threads", "2",
                                "--python-exit-code", "1", "--python", str(script)],
                               capture_output=True, text=True, timeout=60)
        self.assertEqual(built.returncode, 0, built.stdout[-2000:])
        original = sha(source)
        noop = self.root / "instance-noop.py"
        noop.write_text("# Preserve the input scene.\n")
        for operation in ("inspect", "edit"):
            result = self.run_job(operation + "-instance", expect_success=False,
                operation=operation, baseBlend=str(source), script=str(noop), views=["front"])
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("UninventoriedDecoration", result.stdout + result.stderr)
            self.assertFalse((self.root / (operation + "-instance") / "view-front.png").exists())
        self.assertEqual(sha(source), original)

    def native_fixture(self, name, body):
        source = self.root / (name + ".blend")
        script = self.root / (name + ".py")
        script.write_text("import bpy\nbpy.ops.wm.read_factory_settings(use_empty=True)\n"
                          + body + "\nbpy.ops.wm.save_as_mainfile(filepath=" + repr(str(source)) + ")\n")
        result = subprocess.run([str(BLENDER), "-b", "--factory-startup", "--threads", "2",
                                 "--python-exit-code", "1", "--python", str(script)],
                                capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode, 0, result.stdout[-2000:] + result.stderr[-2000:])
        return source

    def test_legacy_native_import_refuses_uncaptured_libraries_and_image_files(self):
        from test_production_import import create_legacy_project
        from production import legacy_import, project
        cases = [
            ("linked-library", "no linked libraries", '''
with bpy.data.libraries.load(''' + repr(str(self.source)) + ''', link=True) as (source, target):
    target.objects = ["HeadbandOuter"]
bpy.context.scene.collection.objects.link(target.objects[0])
'''),
            ("external-image", "packed image textures", '''
bpy.ops.mesh.primitive_cube_add()
material = bpy.data.materials.new("UncapturedTexture")
material.use_nodes = True
texture = material.node_tree.nodes.new("ShaderNodeTexImage")
texture.image = bpy.data.images.load(''' + repr(str(self.root / "create/view-hero.png")) + ''')
bpy.context.object.data.materials.append(material)
''')]
        for name, message, body in cases:
            with self.subTest(resource=name):
                native = self.native_fixture("legacy-" + name, body)
                legacy = create_legacy_project(self.root / ("legacy-project-" + name), native.read_bytes(), ".blend")
                before = project.inventory(legacy["root"])
                target = self.root / ("rejected-import-" + name)
                with self.assertRaises(project.ProductionError):
                    legacy_import.import_v1(target, legacy["root"], legacy["checkpoint"], legacy["artifact"],
                                            "Rejected import", blender=str(BLENDER), views=[])
                state = project.status(target)
                self.assertIsNone(state["head"])
                self.assertEqual(len(state["incompleteRuns"]), 1)
                run = state["incompleteRuns"][0]
                self.assertEqual(run["status"], "failed")
                failed = target / ".refas2/runs" / run["id"] / "artifacts/result.json"
                self.assertIn(message, json.loads(failed.read_text())["error"]["message"])
                self.assertEqual(project.inventory(legacy["root"]), before)

    def test_legacy_glb_required_extension_failure_never_publishes(self):
        from test_production_import import create_legacy_project
        from production import legacy_import, project
        data = (self.root / "create/asset.glb").read_bytes()
        length = struct.unpack("<I", data[12:16])[0]
        document = json.loads(data[20:20 + length])
        extension = "REFAS_unverified_test_extension"
        document["extensionsUsed"] = [*document.get("extensionsUsed", []), extension]
        document["extensionsRequired"] = [*document.get("extensionsRequired", []), extension]
        payload = json.dumps(document).encode()
        payload += b" " * (-len(payload) % 4)
        tail = data[20 + length:]
        changed = (b"glTF" + struct.pack("<II", 2, 20 + len(payload) + len(tail)) +
                   struct.pack("<I", len(payload)) + b"JSON" + payload + tail)
        legacy = create_legacy_project(self.root / "legacy-required-extension", changed)
        before = project.inventory(legacy["root"])
        target = self.root / "rejected-required-extension"
        with self.assertRaises(project.ProductionError):
            legacy_import.import_v1(target, legacy["root"], legacy["checkpoint"], legacy["artifact"],
                                    "Unsupported required extension", blender=str(BLENDER), views=[])
        state = project.status(target)
        self.assertIsNone(state["head"])
        self.assertEqual(state["incompleteRuns"][0]["status"], "failed")
        run = target / ".refas2/runs" / state["incompleteRuns"][0]["id"]
        self.assertIn(extension, json.loads((run / "artifacts/result.json").read_text())["error"]["message"])
        migration = json.loads((run / "inputs/import/migration.json").read_text())
        self.assertIn(extension, migration["artifact"]["extensionsRequired"])
        self.assertEqual(project.inventory(legacy["root"]), before)

    def test_geometry_node_instances_are_rejected_until_realized(self):
        source = self.native_fixture("geometry-instances", '''
bpy.ops.mesh.primitive_cube_add()
obj = bpy.context.object
obj.name = "InstancedShell"
group = bpy.data.node_groups.new("Decorations", "GeometryNodeTree")
group.interface.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
group.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
source_node = group.nodes.new("NodeGroupInput")
output = group.nodes.new("NodeGroupOutput")
cube = group.nodes.new("GeometryNodeMeshCube")
cube.inputs["Size"].default_value = (0.2, 0.2, 0.2)
instances = group.nodes.new("GeometryNodeInstanceOnPoints")
join = group.nodes.new("GeometryNodeJoinGeometry")
group.links.new(source_node.outputs["Geometry"], instances.inputs["Points"])
group.links.new(cube.outputs["Mesh"], instances.inputs["Instance"])
group.links.new(source_node.outputs["Geometry"], join.inputs["Geometry"])
group.links.new(instances.outputs["Instances"], join.inputs["Geometry"])
group.links.new(join.outputs["Geometry"], output.inputs["Geometry"])
obj.modifiers.new("Decorations", "NODES").node_group = group
''')
        original = sha(source)
        noop = self.root / "instances-noop.py"
        noop.write_text("# Keep all source geometry.\n")
        for operation in ("edit", "inspect"):
            with self.subTest(operation=operation):
                name = operation + "-geometry-instances"
                result = self.run_job(name, expect_success=False, operation=operation,
                                      baseBlend=str(source), script=str(noop), views=["front"])
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("Realize Instances", result.stdout + result.stderr)
                self.assertIn("InstancedShell", result.stdout + result.stderr)
                self.assertFalse((self.root / name / "asset.glb").exists())
                self.assertFalse((self.root / name / "view-front.png").exists())
        self.assertEqual(sha(source), original)
        repair = self.root / "realize-decorations.py"
        repair.write_text('''import bpy
group = bpy.data.node_groups["Decorations"]
output = next(node for node in group.nodes if node.type == "GROUP_OUTPUT")
link = output.inputs["Geometry"].links[0]
socket = link.from_socket
group.links.remove(link)
realize = group.nodes.new("GeometryNodeRealizeInstances")
group.links.new(socket, realize.inputs["Geometry"])
group.links.new(realize.outputs["Geometry"], output.inputs["Geometry"])
''')
        result = self.run_job("realized-decorations", baseBlend=str(source), script=str(repair))
        scene = json.loads((self.root / "realized-decorations/scene.json").read_text())
        self.assertEqual(scene["statistics"]["triangles"], 108)
        self.assertEqual(result["verification"]["glb"]["encoded"]["triangles"], 108)
        self.assertTrue(all(result["verification"]["glb"]["checks"].values()))
        self.assertEqual(sha(source), original)

    def test_render_only_and_differently_subdivided_geometry_are_rejected(self):
        cases = {
            "render-only-bevel": 'm = obj.modifiers.new("EdgeShape", "BEVEL")\n'
                                 'm.width = 0.2\nm.segments = 3\nm.show_viewport = False\n',
            "viewport-only-bevel": 'm = obj.modifiers.new("EdgeShape", "BEVEL")\n'
                                   'm.width = 0.2\nm.segments = 3\nm.show_render = False\n',
            "different-subdivision": 'm = obj.modifiers.new("EdgeShape", "SUBSURF")\n'
                                     'm.levels = 1\nm.render_levels = 2\n',
        }
        noop = self.root / "modifier-noop.py"
        noop.write_text("# Keep the native modifier settings.\n")
        for case, body in cases.items():
            source = self.native_fixture(case, 'bpy.ops.mesh.primitive_cube_add()\n'
                                         'obj = bpy.context.object\nobj.name = "Shell"\n' + body)
            original = sha(source)
            for operation in ("edit", "inspect"):
                with self.subTest(case=case, operation=operation):
                    name = operation + "-" + case
                    result = self.run_job(name, expect_success=False, operation=operation,
                                          baseBlend=str(source), script=str(noop), views=["front"])
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn("viewport/render", result.stdout + result.stderr)
                    self.assertIn("Shell:EdgeShape", result.stdout + result.stderr)
                    self.assertFalse((self.root / name / "asset.glb").exists())
                    self.assertFalse((self.root / name / "view-front.png").exists())
            self.assertEqual(sha(source), original)

    def test_static_modifiers_export_evaluated_geometry_without_losing_morphs(self):
        script = self.root / "mixed-modifiers.py"
        script.write_text('''import bpy
bpy.ops.mesh.primitive_cube_add(location=(-2, 0, 0))
body = bpy.context.object
body.name = "BeveledBody"
modifier = body.modifiers.new("EditableBevel", "BEVEL")
modifier.width = 0.15
modifier.segments = 3
bpy.ops.mesh.primitive_cube_add(location=(2, 0, 0))
morph = bpy.context.object
morph.name = "MorphPanel"
morph.shape_key_add(name="Basis")
raised = morph.shape_key_add(name="Raised")
for vertex in raised.data:
    if vertex.co.z > 0:
        vertex.co.z += 0.3
''', encoding="utf-8")
        result = self.run_job("mixed-modifiers", script=str(script))
        scene = json.loads((self.root / "mixed-modifiers/scene.json").read_text())
        objects = {row["name"]: row for row in scene["objects"]}
        body = objects["BeveledBody"]
        self.assertEqual([m["type"] for m in body["modifiers"]], ["BEVEL"])
        self.assertGreater(body["evaluatedMesh"]["triangles"], body["mesh"]["triangles"])
        self.assertEqual([k["name"] for k in objects["MorphPanel"]["shapeKeys"]], ["Basis", "Raised"])
        encoded = result["verification"]["glb"]["encoded"]
        self.assertEqual(encoded["triangles"], scene["statistics"]["triangles"])
        self.assertEqual(encoded["morphMeshes"], 1)
        self.assertTrue(all(result["verification"]["glb"]["checks"].values()))

    def test_rigid_hinge_hierarchy_and_pose_survive_native_and_glb_reopen(self):
        script = self.root / "rigid-arm.py"
        script.write_text('''import bpy, math
def pivot(name, location, parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    obj.location = location
    return obj
def part(name, parent, location, scale):
    bpy.ops.mesh.primitive_cube_add()
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    obj.location = location
    for vertex in obj.data.vertices:
        vertex.co.x *= scale[0]
        vertex.co.y *= scale[1]
        vertex.co.z *= scale[2]
    bevel = obj.modifiers.new("EditableEdge", "BEVEL")
    bevel.width = 0.004
    bevel.segments = 2
    return obj
root = pivot("ShoulderPivot", (0.2, -0.1, 0.8))
root.rotation_euler.z = math.radians(20)
part("UpperArmor", root, (0, 0, -0.12), (0.04, 0.05, 0.12))
hinge = pivot("ElbowPivot", (0, 0, -0.28), root)
part("ForearmArmor", hinge, (0, 0, -0.12), (0.03, 0.04, 0.12))
wrist = pivot("WristPivot", (0, 0, -0.25), hinge)
part("HandArmor", wrist, (0, 0, -0.04), (0.04, 0.02, 0.04))
''', encoding="utf-8")
        self.run_job("rigid-arm-before", script=str(script))
        baseline = self.root / "rigid-arm-before/scene.blend"
        baseline_sha = sha(baseline)
        edit = self.root / "bend-elbow.py"
        edit.write_text("import bpy, math\nbpy.data.objects['ElbowPivot'].rotation_euler.x = math.pi / 2\n")
        result = self.run_job("rigid-arm-after", script=str(edit), baseBlend=str(baseline))
        self.assertTrue(result["verification"]["native"]["fingerprintMatches"])
        self.assertTrue(all(result["verification"]["glb"]["checks"].values()))
        before = {o["name"]: o for o in json.loads(
            (self.root / "rigid-arm-before/scene.json").read_text())["objects"]}
        after = {o["name"]: o for o in json.loads(
            (self.root / "rigid-arm-after/scene.json").read_text())["objects"]}
        self.assertEqual(before.keys(), after.keys())
        for name in ("ShoulderPivot", "UpperArmor"):
            self.assertEqual(before[name]["fingerprint"], after[name]["fingerprint"])
        for name in ("ForearmArmor", "WristPivot", "HandArmor"):
            for a_row, b_row in zip(before[name]["matrixLocal"], after[name]["matrixLocal"]):
                for a, b in zip(a_row, b_row):
                    self.assertAlmostEqual(a, b, delta=1e-6)
            self.assertNotEqual(before[name]["matrixWorld"], after[name]["matrixWorld"])
        for name in ("UpperArmor", "ForearmArmor", "HandArmor"):
            self.assertEqual(before[name]["mesh"], after[name]["mesh"])
            self.assertEqual(before[name]["evaluatedMesh"], after[name]["evaluatedMesh"])
            self.assertEqual([m["type"] for m in after[name]["modifiers"]], ["BEVEL"])
        # Independently reopen both formats: the worker's count/bounds checks do
        # not establish that a rigid articulation remains an editable hierarchy.
        probe = self.root / "probe-rigid-arm.py"
        output = self.root / "rigid-arm-readback.json"
        paths = [("native", str(self.root / "rigid-arm-after/scene.blend")),
                 ("glb", str(self.root / "rigid-arm-after/asset.glb"))]
        probe.write_text('''import bpy, json, math
from mathutils import Vector
records = {}
for kind, path in ''' + repr(paths) + ''':
    if kind == "native":
        bpy.ops.wm.open_mainfile(filepath=path, load_ui=False, use_scripts=False)
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=path)
    bpy.context.view_layer.update()
    root = bpy.data.objects["ShoulderPivot"]
    hinge = bpy.data.objects["ElbowPivot"]
    upper = bpy.data.objects["UpperArmor"]
    hand = bpy.data.objects["HandArmor"]
    assert hinge.parent == root
    assert bpy.data.objects["ForearmArmor"].parent == hinge
    assert bpy.data.objects["WristPivot"].parent == hinge
    assert hand.parent == bpy.data.objects["WristPivot"]
    # The hand's origin is 0.29 m below the elbow in local rest coordinates.
    expected = root.matrix_world @ Vector((0, 0.29, -0.28))
    assert (hand.matrix_world.translation - expected).length < 1e-6
    objects = {obj.name: {"parent": obj.parent.name if obj.parent else None,
               "world": [list(row) for row in obj.matrix_world]}
               for obj in bpy.context.scene.objects}
    upper_before = upper.matrix_world.copy()
    hinge.rotation_mode = "XYZ"
    hinge.rotation_euler.x = math.pi / 3
    bpy.context.view_layer.update()
    expected = root.matrix_world @ Vector((0, 0.29 * math.sin(math.pi / 3),
                                          -0.28 - 0.29 * math.cos(math.pi / 3)))
    assert (hand.matrix_world.translation - expected).length < 1e-6
    assert max(abs(a - b) for row_a, row_b in zip(upper_before, upper.matrix_world)
               for a, b in zip(row_a, row_b)) < 1e-7
    records[kind] = {"objects": objects, "handAtSixtyDegrees": list(hand.matrix_world.translation)}
with open(''' + repr(str(output)) + ''', "w") as stream:
    json.dump(records, stream)
''', encoding="utf-8")
        checked = subprocess.run([str(BLENDER), "-b", "--factory-startup", "--threads", "2",
                                  "--python-exit-code", "1", "--python", str(probe)],
                                 capture_output=True, text=True, timeout=90)
        self.assertEqual(checked.returncode, 0, checked.stdout[-2000:] + checked.stderr[-2000:])
        records = json.loads(output.read_text())
        native, glb = records["native"], records["glb"]
        self.assertEqual(native["objects"].keys(), glb["objects"].keys())
        for name, native_object in native["objects"].items():
            glb_object = glb["objects"][name]
            self.assertEqual(native_object["parent"], glb_object["parent"])
            for native_row, glb_row in zip(native_object["world"], glb_object["world"]):
                for a, b in zip(native_row, glb_row):
                    self.assertAlmostEqual(a, b, delta=1e-6)
        for a, b in zip(native["handAtSixtyDegrees"], glb["handAtSixtyDegrees"]):
            self.assertAlmostEqual(a, b, delta=1e-6)
        self.assertEqual(sha(baseline), baseline_sha)

    def test_submillimetre_bone_motion_survives_glb_middle_frame(self):
        script = self.root / "tiny-bone-motion.py"
        script.write_text('''import bpy
scene = bpy.context.scene
scene.frame_start, scene.frame_end, scene.render.fps = 1, 3, 30
data = bpy.data.armatures.new("MotionBones")
rig = bpy.data.objects.new("MotionRig", data)
scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
for name in ("KeyedMotion", "BakedMotion"):
    bone = data.edit_bones.new(name)
    bone.head, bone.tail = (0, 0, 0), (0, 0.2, 0)
bpy.ops.object.mode_set(mode="OBJECT")
follow = rig.pose.bones["BakedMotion"].constraints.new("COPY_LOCATION")
follow.target, follow.subtarget = rig, "KeyedMotion"
follow.owner_space = follow.target_space = "POSE"
for name, bone, offset in (("KeyedPanel", "KeyedMotion", 0),
                           ("BakedPanel", "BakedMotion", 0.2)):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([(offset, 0, 0), (offset+0.1, 0, 0),
                     (offset, 0.1, 0)], [], [(0, 1, 2)])
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    obj.vertex_groups.new(name=bone).add([0, 1, 2], 1.0, "REPLACE")
    obj.modifiers.new("MotionSkin", "ARMATURE").object = rig
pose = rig.pose.bones["KeyedMotion"]
for frame, movement in ((1, 0), (2, 0.00008), (3, 0)):
    pose.location.x = movement
    pose.keyframe_insert("location", frame=frame)
rig.animation_data.action.name = "TinyMotion"
for curve in rig.animation_data.action.fcurves:
    for key in curve.keyframe_points:
        key.interpolation = "LINEAR"
scene.frame_set(1)
bpy.context.view_layer.update()
''', encoding="utf-8")
        result = self.run_job("tiny-bone-motion", script=str(script))
        self.assertTrue(result["verification"]["native"]["fingerprintMatches"])
        # Rest bounds alone cannot observe an excursion whose two endpoints are
        # equal. Reopen both files and measure the actual skinned middle pose,
        # including a constrained bone without its own keyed channel.
        native = self.root / "tiny-bone-motion/scene.blend"
        glb = self.root / "tiny-bone-motion/asset.glb"
        native_sha, glb_sha = sha(native), sha(glb)
        output = self.root / "tiny-bone-motion-readback.json"
        probe = self.root / "probe-tiny-bone-motion.py"
        probe.write_text('''import bpy, json
records = {}
for kind, path in ''' + repr([("native", str(native)), ("glb", str(glb))]) + ''':
    if kind == "native":
        bpy.ops.wm.open_mainfile(filepath=path, load_ui=False, use_scripts=False)
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.context.scene.render.fps = 30
        bpy.ops.import_scene.gltf(filepath=path, disable_bone_shape=True)
    records[kind] = {}
    for frame in (1, 2, 3):
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        graph = bpy.context.evaluated_depsgraph_get()
        records[kind][frame] = {}
        for name in ("KeyedPanel", "BakedPanel"):
            obj = bpy.data.objects[name].evaluated_get(graph)
            mesh = obj.to_mesh()
            records[kind][frame][name] = sorted(list(obj.matrix_world @ v.co)
                                               for v in mesh.vertices)
            obj.to_mesh_clear()
with open(''' + repr(str(output)) + ''', "w") as stream:
    json.dump(records, stream)
''', encoding="utf-8")
        checked = subprocess.run([str(BLENDER), "-b", "--factory-startup", "--threads", "2",
                                  "--python-exit-code", "1", "--python", str(probe)],
                                 capture_output=True, text=True, timeout=90)
        self.assertEqual(checked.returncode, 0, checked.stdout[-2000:] + checked.stderr[-2000:])
        records = json.loads(output.read_text())
        for name in ("KeyedPanel", "BakedPanel"):
            native_motion = (records["native"]["2"][name][0][0]
                             - records["native"]["1"][name][0][0])
            self.assertAlmostEqual(native_motion, 0.00008, delta=2e-7)
            for frame in ("1", "2", "3"):
                expected, actual = records["native"][frame][name], records["glb"][frame][name]
                self.assertEqual(len(expected), len(actual))
                for source_vertex, exported_vertex in zip(expected, actual):
                    for source_value, exported_value in zip(source_vertex, exported_vertex):
                        self.assertAlmostEqual(source_value, exported_value, delta=2e-6,
                                               msg=f"{name} at frame {frame}")
        self.assertEqual(sha(native), native_sha)
        self.assertEqual(sha(glb), glb_sha)

    def test_tiny_positive_skin_weights_survive_glb_motion(self):
        script = self.root / "tiny-skin-weight.py"
        script.write_text('''import bpy
scene = bpy.context.scene
scene.frame_start, scene.frame_end, scene.render.fps = 1, 3, 30
data = bpy.data.armatures.new("FineSkin")
rig = bpy.data.objects.new("FineRig", data)
scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
for name in ("Fixed", "FineMotion", "AuxA", "AuxB", "AuxC"):
    bone = data.edit_bones.new(name)
    bone.head, bone.tail = (0, 0, 0), (0, 0.2, 0)
bpy.ops.object.mode_set(mode="OBJECT")
mesh = bpy.data.meshes.new("WeightedPanel")
mesh.from_pydata([(0, 0, 0), (0.1, 0, 0), (0, 0.1, 0)], [], [(0, 1, 2)])
obj = bpy.data.objects.new("WeightedPanel", mesh)
scene.collection.objects.link(obj)
for name, weight in (("Fixed", 0.49995), ("FineMotion", 0.00005),
                     ("AuxA", 0.2), ("AuxB", 0.2), ("AuxC", 0.1)):
    obj.vertex_groups.new(name=name).add([0, 1, 2], weight, "REPLACE")
obj.modifiers.new("FineSkin", "ARMATURE").object = rig
for frame, movement in ((1, 0), (2, 1), (3, 0)):
    rig.pose.bones["FineMotion"].location.x = movement
    rig.pose.bones["FineMotion"].keyframe_insert("location", frame=frame)
rig.animation_data.action.name = "FineInfluence"
for curve in rig.animation_data.action.fcurves:
    for key in curve.keyframe_points:
        key.interpolation = "LINEAR"
scene.frame_set(1)
bpy.context.view_layer.update()
''', encoding="utf-8")
        result = self.run_job("tiny-skin-weight", script=str(script))
        self.assertTrue(result["verification"]["native"]["fingerprintMatches"])
        native = self.root / "tiny-skin-weight/scene.blend"
        glb = self.root / "tiny-skin-weight/asset.glb"
        native_sha, glb_sha = sha(native), sha(glb)
        output = self.root / "tiny-skin-weight-readback.json"
        probe = self.root / "probe-tiny-skin-weight.py"
        probe.write_text('''import bpy, json
records = {}
for kind, path in ''' + repr([("native", str(native)), ("glb", str(glb))]) + ''':
    if kind == "native":
        bpy.ops.wm.open_mainfile(filepath=path, load_ui=False, use_scripts=False)
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.context.scene.render.fps = 30
        bpy.ops.import_scene.gltf(filepath=path, disable_bone_shape=True)
    obj = bpy.data.objects["WeightedPanel"]
    records[kind] = {"weights": [{obj.vertex_groups[g.group].name: g.weight
                                  for g in vertex.groups if g.weight > 0}
                                 for vertex in obj.data.vertices], "poses": {}}
    for frame in (1, 2, 3):
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = evaluated.to_mesh()
        records[kind]["poses"][frame] = sorted(list(evaluated.matrix_world @ v.co)
                                               for v in mesh.vertices)
        evaluated.to_mesh_clear()
with open(''' + repr(str(output)) + ''', "w") as stream:
    json.dump(records, stream)
''', encoding="utf-8")
        checked = subprocess.run([str(BLENDER), "-b", "--factory-startup", "--threads", "2",
                                  "--python-exit-code", "1", "--python", str(probe)],
                                 capture_output=True, text=True, timeout=90)
        self.assertEqual(checked.returncode, 0, checked.stdout[-2000:] + checked.stderr[-2000:])
        records = json.loads(output.read_text())
        for kind in ("native", "glb"):
            for weights in records[kind]["weights"]:
                self.assertEqual(set(weights), {"Fixed", "FineMotion", "AuxA", "AuxB", "AuxC"})
                self.assertAlmostEqual(weights["FineMotion"], 0.00005, delta=1e-9)
        source = records["native"]["poses"]
        self.assertAlmostEqual(source["2"][0][0] - source["1"][0][0], 0.00005, delta=2e-7)
        for frame in ("1", "2", "3"):
            expected, actual = source[frame], records["glb"]["poses"][frame]
            self.assertEqual(len(expected), len(actual))
            for source_vertex, exported_vertex in zip(expected, actual):
                for source_value, exported_value in zip(source_vertex, exported_vertex):
                    self.assertAlmostEqual(source_value, exported_value, delta=2e-6,
                                           msg=f"Tiny skin influence at frame {frame}")
        self.assertEqual(sha(native), native_sha)
        self.assertEqual(sha(glb), glb_sha)

    def test_skin_export_preservation_restores_state_after_error(self):
        probe = self.root / "skin-export-error-cleanup.py"
        output = self.root / "skin-export-error-cleanup.json"
        probe.write_text('''import hashlib, json, runpy
from pathlib import Path
worker = runpy.run_path(''' + repr(str(WORKER)) + ''')
from io_scene_gltf2.blender.exp.primitive_extract import PrimitiveCreator
name = "_PrimitiveCreator__get_bone_data"
original = getattr(PrimitiveCreator, name)
source = Path(original.__code__.co_filename)
before = hashlib.sha256(source.read_bytes()).hexdigest()
try:
    with worker["preserve_positive_skin_weights"]():
        raise RuntimeError("forced export failure")
except RuntimeError as error:
    assert str(error) == "forced export failure", str(error)
record = {"originalFunctionRestored": getattr(PrimitiveCreator, name) is original,
          "installedSourceUnchanged": hashlib.sha256(source.read_bytes()).hexdigest() == before}
with open(''' + repr(str(output)) + ''', "w") as stream:
    json.dump(record, stream)
''', encoding="utf-8")
        checked = subprocess.run([str(BLENDER), "-b", "--factory-startup", "--threads", "2",
                                  "--python-exit-code", "1", "--python", str(probe)],
                                 capture_output=True, text=True, timeout=60)
        self.assertEqual(checked.returncode, 0, checked.stdout[-2000:] + checked.stderr[-2000:])
        self.assertEqual(json.loads(output.read_text()),
                         {"originalFunctionRestored": True, "installedSourceUnchanged": True})

    def test_dirty_packed_texture_pixels_survive_native_save_and_glb_export(self):
        script = self.root / "packed-texture.py"
        script.write_text('''import bpy
bpy.ops.mesh.primitive_cube_add()
material = bpy.data.materials.new("PaintedSurface")
material.use_nodes = True
image = bpy.data.images.new("Paint", width=4, height=4)
image.pixels[:] = [0.8, 0.2, 0.1, 1.0] * 16
texture = material.node_tree.nodes.new("ShaderNodeTexImage")
texture.image = image
material.node_tree.links.new(texture.outputs["Color"], material.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
bpy.context.object.data.materials.append(material)
''', encoding="utf-8")
        self.run_job("packed-before", script=str(script))
        original = self.root / "packed-before/scene.blend"
        original_sha = sha(original)
        edit = self.root / "paint-edit.py"
        edit.write_text('''import bpy
image = bpy.data.images["Paint"]
image.pixels[:] = [0.1, 0.2, 0.8, 1.0] * 16
image.update()
''', encoding="utf-8")
        self.run_job("packed-after", script=str(edit), baseBlend=str(original))
        samples = self.root / "packed-pixels.json"
        paths = [("before", str(original), False),
                 ("native", str(self.root / "packed-after/scene.blend"), False),
                 ("glb", str(self.root / "packed-after/asset.glb"), True)]
        probe = self.root / "read-packed-pixels.py"
        probe.write_text('''import bpy, json
result = {}
for label, filename, is_glb in ''' + repr(paths) + ''':
    if is_glb:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=filename)
    else:
        bpy.ops.wm.open_mainfile(filepath=filename, load_ui=False, use_scripts=False)
    images = [image for image in bpy.data.images if image.users and image.packed_file and len(image.pixels)]
    assert len(images) == 1, [(image.name, image.users) for image in bpy.data.images]
    result[label] = list(images[0].pixels[:4])
with open(''' + repr(str(samples)) + ''', "w") as stream:
    json.dump(result, stream)
''', encoding="utf-8")
        inspection = subprocess.run([str(BLENDER), "-b", "--factory-startup", "--threads", "2",
                                     "--python-exit-code", "1", "--python", str(probe)],
                                    env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
                                    capture_output=True, text=True, timeout=90)
        self.assertEqual(inspection.returncode, 0, inspection.stdout[-2000:] + inspection.stderr[-2000:])
        values = json.loads(samples.read_text())
        self.assertGreater(values["before"][0], values["before"][2])
        for label in ("native", "glb"):
            for actual, expected in zip(values[label], [0.1, 0.2, 0.8, 1.0]):
                self.assertAlmostEqual(actual, expected, delta=1 / 255 + 1e-6)
        self.assertEqual(sha(original), original_sha)

    def test_unknown_view_and_stale_output_are_rejected(self):
        bad_view = self.run_job("bad-view", expect_success=False,
                                script=str(EXAMPLES / "create_headset.py"), views=["guessed-view"])
        self.assertNotEqual(bad_view.returncode, 0)
        self.assertFalse((self.root / "bad-view/scene.blend").exists())
        stale = self.run_job("create", expect_success=False, script=str(EXAMPLES / "create_headset.py"))
        self.assertNotEqual(stale.returncode, 0)
        self.assertEqual(sha(self.source), self.source_sha)
        self.assertTrue(json.loads((self.root / "create/result.json").read_text())["ok"])
        old = self.root / "old-evidence"
        old.mkdir()
        (old / "notes.txt").write_text("prior attempt")
        rejected = self.run_job("old-evidence", expect_success=False, script=str(EXAMPLES / "create_headset.py"))
        self.assertNotEqual(rejected.returncode, 0)
        self.assertEqual(sorted(path.name for path in old.iterdir()), ["notes.txt"])

    def test_hidden_object_and_collection_helpers_are_not_exported_as_success(self):
        for kind in ("object", "collection"):
            with self.subTest(kind=kind):
                script = self.root / ("hidden-" + kind + ".py")
                code = '''import bpy
bpy.ops.mesh.primitive_cube_add(location=(20, 0, 0))
helper = bpy.context.object
helper.name = "HiddenAuthoringHelper"
'''
                if kind == "object":
                    code += "helper.hide_render = True\n"
                else:
                    code += '''collection = bpy.data.collections.new("HiddenHelpers")
bpy.context.scene.collection.children.link(collection)
for previous in list(helper.users_collection):
    previous.objects.unlink(helper)
collection.objects.link(helper)
collection.hide_render = True
'''
                script.write_text(code, encoding="utf-8")
                result = self.run_job("hidden-" + kind, expect_success=False,
                                      script=str(script), baseBlend=str(self.source), views=["hero"])
                self.assertNotEqual(result.returncode, 0)
                report = json.loads((self.root / ("hidden-" + kind) / "result.json").read_text())
                self.assertFalse(report["ok"])
                self.assertIn("Hidden or excluded meshes", report["error"]["message"])
                self.assertFalse((self.root / ("hidden-" + kind) / "scene.blend").exists())
                self.assertEqual(sha(self.source), self.source_sha)

    def test_script_failure_retains_previous_native_and_is_not_success(self):
        script = self.root / "failing.py"
        script.write_text("import bpy\nbpy.data.objects['HeadbandOuter'].location.x += 1\nraise RuntimeError('intentional failure')\n")
        failed = self.run_job("failed", expect_success=False, script=str(script), baseBlend=str(self.source))
        self.assertNotEqual(failed.returncode, 0)
        self.assertFalse(json.loads((self.root / "failed/result.json").read_text())["ok"])
        self.assertFalse((self.root / "failed/scene.blend").exists())
        self.assertEqual(sha(self.source), self.source_sha)


if __name__ == "__main__":
    unittest.main()
