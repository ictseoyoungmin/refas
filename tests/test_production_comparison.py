"""Independent coverage oracles and read-only capture/transaction controls."""
import base64
import os
from pathlib import Path
import random
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "skills/refas/scripts"))
from production import image_compare as comparison, project
import test_production_project as fixtures

PASS, FAIL, UNKNOWN = "within-protected-limits", "protected-regression", "inconclusive"
SCHEMA = "refas.production.comparison/v2"
read, write = project.read_json, project.atomic_json


def region(rect, **options):
    return {"name": "protected", "role": "protected", "rectPixels": rect, "maxChangedPixels": 0, **options}


def mask(w, h, points):
    return [int((x, y) in points) for y in range(h) for x in range(w)]


def oracle(a, b, w, rect):
    # Independent coordinate sets; no implementation counting helpers.
    before, after = [{(i % w, i // w) for i, value in enumerate(values) if value
                     and rect[0] <= i % w < rect[2] and rect[1] <= i // w < rect[3]}
                     for values in (a, b)]
    changed, union = before ^ after, before | after
    bounds = ([min(x for x, y in changed), min(y for x, y in changed),
               max(x for x, y in changed)+1, max(y for x, y in changed)+1] if changed else None)
    return {"baselinePixels": len(before), "candidatePixels": len(after),
            "intersectionPixels": len(before & after), "unionPixels": len(union),
            "addedPixels": len(after - before), "removedPixels": len(before - after),
            "changedPixels": len(changed), "iou": len(before & after)/len(union) if union else None,
            "changedBoundsPixels": bounds}


class MaskComparisonTests(unittest.TestCase):
    def measure(self, a, b, w, h, rows=None):
        return comparison.compare_masks(a, b, w, h, {"regions": rows or [region([0, 0, w, h])]})

    def check(self, result, decision, **metrics):
        self.assertEqual(result["decision"], decision)
        self.assertEqual({k: result["global"][k] for k in metrics}, metrics)

    def test_pixel_limits_and_repeatability(self):
        a, b = mask(8, 8, {(1, 1)}), mask(8, 8, {(4, 5)})
        r = region([0, 0, 8, 8], maxChangedPixels=2)
        result = self.measure(a, b, 8, 8, [r])
        self.assertEqual(result, self.measure(a, b, 8, 8, [r]))
        self.check(result, PASS, iou=0, changedPixels=2, addedPixels=1, removedPixels=1,
                   changedBoundsPixels=[1, 1, 5, 6])
        self.check(self.measure(a, b, 8, 8, [dict(r, maxChangedPixels=1)]), FAIL)

    def test_point_set_oracle_global_and_local(self):
        rng = random.Random(741)
        rect = [2, 1, 6, 5]
        for _ in range(30):
            a, b = [[rng.randrange(2) for _ in range(42)] for _ in range(2)]
            result = self.measure(a, b, 7, 6, [region(rect, maxChangedPixels=42)])
            for row, area in ((result["global"], [0, 0, 7, 6]), (result["regions"][0]["metrics"], rect)):
                expected = oracle(a, b, 7, area)
                self.assertEqual({key: row[key] for key in expected}, expected)
        result = self.measure([1]*81, [1]*81, 9, 9, [region([3, 3, 6, 6])])
        self.check(result, PASS)
        self.assertEqual(result["regions"][0]["metrics"]["intersectionPixels"], 9)

    def test_holes_components_and_empty_evidence(self):
        square = {(x, y) for y in range(1, 7) for x in range(1, 7)}
        hole = {(x, y) for x in (3, 4) for y in (3, 4)}
        a = mask(10, 10, (square-hole) | {(8, 8)})
        self.check(self.measure(a, a, 10, 10), PASS, baselinePixels=33, iou=1)
        filled = self.measure(a, mask(10, 10, square | {(8, 8)}), 10, 10)
        self.check(filled, FAIL, changedPixels=4)
        self.assertLess(filled["global"]["iou"], 1)
        empty, point = [0]*16, mask(4, 4, {(1, 1)})
        self.check(self.measure(empty, empty, 4, 4), UNKNOWN, iou=None, changedBoundsPixels=None)
        self.check(self.measure(point, empty, 4, 4,
                   [region([0, 0, 4, 4], maxChangedPixels=1)]), UNKNOWN)
        self.check(self.measure(point, empty, 4, 4), FAIL)

    def test_local_loss_cannot_hide_in_global_average(self):
        a = [1]*640
        b = list(a)
        for i in range(3, 8):
            b[64+i] = 0
        rows = [{"name": "edit", "role": "target", "rectPixels": [0, 0, 16, 20]}, region([16, 0, 32, 20])]
        result = self.measure(a, b, 32, 20, rows)
        self.check(result, PASS)
        self.assertEqual(result["regions"][0]["status"], "changed")
        self.assertEqual(result["assessment"]["targetImprovement"], "not-evaluated")
        b[64+29] = 0
        result = self.measure(a, b, 32, 20, rows)
        self.check(result, FAIL)
        self.assertGreater(result["global"]["iou"], .98)
        self.assertEqual(result["regions"][1]["metrics"]["changedPixels"], 1)

    def test_invalid_inputs(self):
        r = region([0, 0, 4, 4])
        bad = [[], [dict(r, role="unknown")], [dict(r, rectPixels=[0, 0, 5, 4])],
               [dict(r, rectPixels=[0, 0, 0, 4])], [dict(r, maxChangedPixels=True)],
               [dict(r, maxContourMeanPixels=5)], [dict(r, extra=1)], [dict(r, role="target")],
               [r, dict(r, name="overlap")], [{k: v for k, v in r.items() if k != "maxChangedPixels"}],
               [{"name": "only", "role": "target", "rectPixels": [0, 0, 4, 4]}]]
        for rows in bad:
            with self.subTest(rows=rows), self.assertRaises(ValueError):
                comparison.validate_regions({"regions": rows}, 4, 4)
        for w, h, rows in [(17, 1, [region([i, 0, i+1, 1], name="p"+str(i)) for i in range(17)]),
                           (0, 4, [r]), (True, 4, [r]), (1025, 1024, [r])]:
            with self.assertRaises(ValueError):
                comparison.validate_regions({"regions": rows}, w, h)
        for values in ([0]*15, [0]*15+[2], [0]*15+[1.0], [0]*15+[None]):
            with self.assertRaises(ValueError):
                self.measure(values, [0]*16, 4, 4)

    @unittest.skipUnless(os.environ.get("REFAS_BLENDER_TESTS") == "1" and shutil.which("blender"), "Blender opt-in")
    def test_copied_decoder_alpha_and_top_left(self):
        # Independent PNG bytes: top row alpha127/128 straddles the .5 rule; bottom is protected.
        pngs = ("iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAYAAAC09K7GAAAAHUlEQVR4nGMQCeipB+IGIP4PxAwMIAIZM8BkYBgAf78OPlRjtiQAAAAASUVORK5CYII=",
                "iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAYAAAC09K7GAAAAG0lEQVR4nGMQCeipB2IGIP4PwgxQDhzDZOACAI0cDr2eU9aHAAAAAElFTkSuQmCC")
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            shutil.copy2(comparison.__file__, folder / "image_compare.py")
            for name, data in zip(("a", "b"), pngs):
                (folder / (name+".png")).write_bytes(base64.b64decode(data))
            script = "import sys\nsys.path.insert(0,'.')\nfrom image_compare import compare_images\n" + (
                "r=compare_images('a.png','b.png',{'regions':[{'name':'top','role':'target','rectPixels':[0,0,4,1]},"
                "{'name':'bottom','role':'protected','rectPixels':[0,2,4,3],'maxChangedPixels':0}]},[4,3])\n"
                "assert r['global']['baselinePixels']==3 and r['global']['changedBoundsPixels']==[1,0,4,1]\n"
                "assert r['decision']=='within-protected-limits'\n")
            done = subprocess.run(["blender", "-b", "--factory-startup", "--python-exit-code", "1",
                                   "--python-expr", script], cwd=directory, capture_output=True, text=True, timeout=60)
            self.assertEqual(done.returncode, 0, done.stdout+done.stderr)


class ComparisonProjectTests(unittest.TestCase):
    def setUp(self):
        fixtures.ProductionProjectTests.setUp(self)
        self.review, spec = fixtures.ProductionProjectTests.review_file(self)
        spec["transparent"] = True
        write(self.review, spec)
        self.view = spec["views"][0]["name"]
        self.regions = self.folder / "regions.json"
        write(self.regions, {"regions": [region([0, 0, 64, 64])]})
        self.a, self.b = self.publish(), self.publish()

    def publish(self, change=None):
        def worker(command, cwd, log, timeout):
            fixtures.fake_worker(command, cwd, log, timeout)
            out = Path(read(command[-1])["outputDir"])
            result = read(out / "result.json")
            scene = {"fingerprint": project.digest(self.script), "frame": 1, "blenderVersion": "test-double",
                     "timing": {"subframe": 0, "fps": 24, "fpsBase": 1}, "units": {"system": "NONE", "scaleLength": 1}}
            view = read(self.review)["views"][0]
            obs = result["observations"][0]
            obs.update(sha256=project.digest(out / obs["path"]), sourceSceneFingerprint=scene["fingerprint"],
                framing="fixed-review-spec", referenceRegion=view["reference"],
                lighting={"center": [0, 0, 0], "radius": 1, "rig": "three-area-lights/v1"},
                camera={**{k: view[k] for k in ("position", "target", "orthoScale")}, "projection": "orthographic",
                        "matrixWorld": [[int(i == j) for i in range(4)] for j in range(4)]},
                renderer={"size": [64, 64], "transparent": True, "samples": 1, "engine": "CYCLES", "device": "CPU",
                    "viewTransform": "AgX", "denoising": False, "worldColor": [.065, .08, .115], "worldStrength": .45})
            if change:
                field, value = change; keys = field.split(".")
                obj = {"scene": scene, "view": obs}
                for key in keys[:-1]:
                    obj = obj[key]
                if value is None: obj.pop(keys[-1])
                else: obj[keys[-1]] = value
            write(out / "scene.json", scene)
            write(out / "result.json", result)
            return .001
        return project.run_edit(self.root, self.script, "fixture", executor=worker, review_spec=self.review,
                                size=64, samples=1, output_profile="native")["head"]

    def observe(self, command, cwd, log, timeout):
        job = read(command[-1]); out = Path(job["outputDir"])
        self.temporary = Path(cwd)
        self.assertEqual(job["operation"], "compare")
        for name, path in job["comparisonImages"].items():
            self.assertEqual(project.digest(Path(path)), job["comparisonDigests"][name])
            self.assertFalse(Path(path).is_relative_to(self.root))
        write(out / "comparison.json", {"schema": SCHEMA, "inputSha256": job["comparisonDigests"], "decision": FAIL})
        write(out / "result.json", {"schema": "refas.production.result/v2", "ok": True,
                                   "outputs": {"comparison": "comparison.json"}})
        return .001

    def compare(self, a=None, b=None, worker=None):
        return project.compare_views(self.root, a or self.a, b or self.b, self.view, self.regions,
                                     executor=worker or self.observe)

    def refused(self, a=None, b=None, worker=None):
        before = project.inventory(self.root)
        with self.assertRaises(project.ProductionError):
            self.compare(a, b, worker or (lambda *args: self.fail("incomparable input executed")))
        self.assertEqual(project.inventory(self.root), before)

    def test_read_only_and_capture_contract(self):
        before = project.inventory(self.root)
        r = self.compare()
        self.assertEqual((r["baselineRevision"], r["candidateRevision"], r["persisted"]), (self.a, self.b, False))
        self.assertEqual(project.inventory(self.root), before)
        self.assertFalse(self.temporary.exists())
        self.assertNotEqual(self.publish(), self.b)
        for change in (("view.camera.orthoScale", 3), ("view.renderer.samples", 2), ("view.renderer.size", [32, 32]),
                       ("view.framing", "automatic-bounds"), ("view.sha256", "0"*64),
                       ("view.sourceSceneFingerprint", "0"*64), ("scene.frame", 2)):
            self.refused(b=self.publish(change))
        for field in ("view.renderer.viewTransform", "scene.timing.fps", "scene.units.system"):
            self.refused(self.publish((field, None)), self.publish((field, None)))

    def test_worker_identity_concurrency_and_staleness(self):
        def forged(*args):
            elapsed = self.observe(*args)
            out = Path(read(args[0][-1])["outputDir"])
            report = read(out / "comparison.json")
            report["inputSha256"]["baseline"] = "0"*64
            write(out / "comparison.json", report)
            return elapsed
        self.refused(worker=forged)
        self.assertFalse(self.temporary.exists())
        def concurrent(*args):
            elapsed = self.observe(*args)
            self.publish()
            return elapsed
        with self.assertRaises(project.ProductionError):
            self.compare(worker=concurrent)
        self.assertFalse(self.temporary.exists())
        reference = self.folder / "new.png"; reference.write_bytes(b"new source")
        project.replace_references(self.root, [reference], expected_sequence=project.load_project(self.root)["sequence"])
        self.refused()


if __name__ == "__main__":
    unittest.main()
