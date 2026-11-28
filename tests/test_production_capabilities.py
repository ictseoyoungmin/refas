"""Installed discovery must describe real source without executing a DCC."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

SKILL = Path(__file__).resolve().parents[1] / "skills/refas"
sys.path.insert(0, str(SKILL / "scripts"))
from production.capabilities import search


class CapabilityTests(unittest.TestCase):
    def test_short_tasks_find_existing_contracts(self):
        for query, expected in (("thickness", "thickness-field"), ("두께", "thickness-field"),
                                ("create", "surface-patch"), ("loft", "section-surface"),
                                ("surface binding", "surface-binding"), ("lattice", "native-lattice"),
                                ("joint handles", "local-edit"), ("국소", "local-edit"),
                                ("closed loop", "boundary-bridge"), ("암홀", "boundary-bridge"),
                                ("compare", "fixed-view-comparison"),
                                ("attach badge", "surface-mount"), ("decal", "surface-projection"),
                                ("hinge", "native-motion"), ("힌지", "native-motion"),
                                ("wheel arch", "boundary-bridge")):
            self.assertEqual([row["id"] for row in search(query=query)["matches"]], [expected])
        self.assertEqual(search(query="unknown modeling tool")["matches"], [])
        rows = search()["matches"]
        self.assertEqual(len({row["id"] for row in rows}), len(rows))
        self.assertTrue(all((SKILL / row["guide"]).is_file() for row in rows))
        row = search(route_id="thickness-field")["matches"][0]
        self.assertIn("minimum", row["callables"][0]["signature"])
        self.assertEqual(row["callables"][0]["authoringImport"],
                         "from thickness_field import grade_thickness")
        for args in ({"query": " "}, {"query": "!!!"}, {"route_id": "missing"},
                     {"query": "curve", "route_id": "native-curve"}):
            with self.assertRaises(ValueError):
                search(**args)

    def test_guides_point_to_real_sections_and_keep_file_paths(self):
        for row in search()["matches"]:
            guide = SKILL / row["guide"]
            self.assertTrue(guide.is_file(), row["id"])
            prose = re.sub(r"^```[^\n]*\n.*?^```[^\n]*$", "", guide.read_text(), flags=re.M | re.S)
            headings = re.findall(r"^#{1,6} (.+)$", prose, flags=re.M)
            anchors = {re.sub(r"[^\w -]", "", title.lower()).replace(" ", "-")
                       for title in headings}
            self.assertIn(row["guideAnchor"], anchors, row["id"])
            self.assertTrue(row["prerequisites"].strip(), row["id"])
        motion = search(route_id="native-motion")["matches"][0]
        self.assertEqual(motion["environment"], "Ordinary bpy recipe")
        self.assertEqual(motion["callables"], [])
        bridge = search(query="wheel arch")["matches"][0]
        self.assertIn("existing", bridge["prerequisites"])
        self.assertIn("Does not generate wheel openings", bridge["limitations"])

    def test_no_match_hint_preserves_strict_search(self):
        for query in ("unknown modeling tool", "attach badge unknown", "decall", "car generation"):
            result = search(query=query)
            self.assertEqual(result["matches"], [])
            self.assertIn("omit --query", result["hint"])
        self.assertNotIn("hint", search())
        self.assertNotIn("hint", search(query="decal"))

    def test_whole_form_tasks_expose_preparation_and_native_limits(self):
        for query in ("car body", "차체 윤곽"):
            self.assertEqual({row["id"] for row in search(query=query)["matches"]},
                             {"surface-patch", "section-surface", "sculpt-brush"})
        self.assertEqual({row["id"] for row in search(query="단면")["matches"]},
                         {"surface-patch", "section-surface"})
        sections = search(query="feature rails")["matches"][0]
        self.assertEqual(sections["id"], "section-surface")
        self.assertIn("parameters", sections["callables"][0]["signature"])
        self.assertIn("feature_names", sections["callables"][0]["signature"])
        self.assertIn("overshoot", sections["limitations"])
        for query, expected in (("blockout", "sculpt-brush"), ("음각", "engrave-path"),
                                ("union", "boolean-form"), ("메시 통합", "boolean-form"),
                                ("곡면에 배지를 붙이기", "surface-mount")):
            self.assertEqual([row["id"] for row in search(query=query)["matches"]], [expected])
        sculpt = search(route_id="sculpt-brush")["matches"][0]
        self.assertIn("world-space", sculpt["prerequisites"])
        self.assertIn("not evaluated", sculpt["limitations"])
        self.assertIn("mask", sculpt["callables"][0]["signature"])
        groove = search(route_id="engrave-path")["matches"][0]
        self.assertIn("intersect", groove["limitations"])
        self.assertIn("radius", groove["callables"][0]["signature"])

    def test_copied_cli_reads_current_signature_without_site_packages(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            copied = root / "installed skill"
            shutil.copytree(SKILL, copied, ignore=shutil.ignore_patterns("__pycache__"))
            env = {**os.environ, "PATH": str(root / "no-executables"), "PYTHONPATH": "",
                   "PYTHONNOUSERSITE": "1"}
            cli = [sys.executable, "-B", "-S", str(copied / "scripts/produce.py"),
                   "authoring-capabilities"]
            def run(*args):
                return subprocess.run([*cli, *args], cwd=root, env=env,
                                      text=True, capture_output=True, timeout=20)
            before = sorted(str(p.relative_to(root)) for p in root.rglob("*"))
            result = run()
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(len(json.loads(result.stdout)["matches"]), len(search()["matches"]))
            self.assertEqual(before, sorted(str(p.relative_to(root)) for p in root.rglob("*")))
            result = run("--query", "decal")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)["matches"][0]["id"], "surface-projection")
            result = run("--query", "unknown modeling tool")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)["matches"], [])
            self.assertIn("omit --query", json.loads(result.stdout)["hint"])
            # A harmless extra argument in the copy must be discovered from AST.
            helper = copied / "scripts/production/thickness_field.py"
            text = helper.read_text()
            text = text.replace("caps=None", "caps=None, discovery_probe=False", 1)
            self.assertIn("discovery_probe", text)
            helper.write_text(text)
            result = run("--id", "thickness-field")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("discovery_probe", json.loads(result.stdout)["matches"][0]["callables"][0]["signature"])
            # Missing advertised source is an error, not stale documentation.
            helper.write_text(text.replace("def grade_thickness(", "def removed_function(", 1))
            result = run("--id", "thickness-field")
            self.assertEqual(result.returncode, 1)
            self.assertIn("callable is missing", json.loads(result.stderr)["error"])
            result = run("--id", "not-installed")
            self.assertEqual(result.returncode, 1)
            self.assertEqual(run("--query", "thickness", "--id", "thickness-field").returncode, 2)


if __name__ == "__main__":
    unittest.main()
