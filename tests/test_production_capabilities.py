"""Installed discovery must describe real source without executing a DCC."""
import json
import os
from pathlib import Path
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
                                ("surface binding", "surface-binding"), ("lattice", "native-lattice"),
                                ("joint handles", "local-edit"), ("국소", "local-edit"),
                                ("compare", "fixed-view-comparison")):
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
