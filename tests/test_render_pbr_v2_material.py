"""R14-06C: material pixels from original barycentric fragments, not flat fallback."""
from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import numpy as np
from PIL import Image

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"skills/refas/scripts"))
from benchmark_render_cpu import create_fixture
from render_glb import Primitive,parse_glb
from render_pbr_v2_visibility import njit, numba_config
from render_pbr_v2_material import (
    srgb_to_linear,linear_to_srgb,shade_visible,validate_opaque_materials,
    _pbr_preview,
    render_material_preview)


def fixture():
    xyz=np.array([[-.5,-.4,.45],[.5,-.4,.45],[0.,.6,.45]],dtype=float)
    normals=np.tile(np.array([0.,0.,-1.]),(3,1))
    vertex=np.array([[.01,.01,.01],[.36,.04,.08],[.04,.49,.16]])
    primitive=Primitive(xyz,normals,np.array([[0,1,2]],dtype=np.int64),
                        np.array([1.,1.,1.]),0.0,.65,0,"triangle",
                        vertex_colors=vertex)
    model={"scenes":[{"nodes":[0]}],"scene":0,"nodes":[{"mesh":0}],
           "meshes":[{"primitives":[{"attributes":{"POSITION":0,"NORMAL":1,"COLOR_0":2},"material":0}]}],
           "materials":[{"pbrMetallicRoughness":{"baseColorFactor":[.8,.7,.6,1],
                         "metallicFactor":.0,"roughnessFactor":.65},"doubleSided":True}]}
    return primitive,model


class PureMaterialChecks(unittest.TestCase):
    def test_studio_shading_keeps_rough_metals_readable_from_three_directions(self):
        # Legacy three-light-only rendering collapsed dark forged metal toward
        # black outside its fixed key-light direction. A studio inspection
        # preview must preserve finite curvature/ambient reflections.
        n=np.array([[0.,1.,0.],[.6,.6,.52],[0.,0.,1.]],dtype=float)
        eye=np.repeat(np.array([[0.,0.,1.]]),(3),axis=0)
        metal=np.repeat(np.array([[.18,.22,.25]]),(3),axis=0)
        values=_pbr_preview(metal,n,eye,.78,.7)
        self.assertEqual(values.shape,(3,3))
        self.assertTrue(np.isfinite(values).all())
        self.assertTrue(((values>=0)&(values<=1)).all())
        self.assertGreater(float(values.min()),.035,'unlit-looking metal must not collapse to black')
        self.assertGreater(float(np.ptp(values,axis=0).max()),.02,'normal variation must remain visible')
        np.testing.assert_array_equal(values,_pbr_preview(metal,n,eye,.78,.7))

    def test_studio_pbr_preserves_roughness_and_dielectric_vs_metal_contrast(self):
        n=np.array([[.2,.9,.3],[.6,.5,.6]],dtype=float)
        eye=np.array([[0.,0.,1.],[0.,0.,1.]])
        base=np.broadcast_to(np.array([.42,.22,.09]),(2,3))
        wood=_pbr_preview(base,n,eye,0.0,.9)
        bronze=_pbr_preview(base,n,eye,.83,.4)
        self.assertTrue(np.isfinite(wood).all())
        self.assertGreater(float(np.max(np.abs(wood-bronze))),.05)
        self.assertGreater(float(np.min(wood)),.035)

    def test_iec_piecewise_transfer_and_inverse(self):
        values=np.array([[0,.0031308,.18,.9]],dtype=float)
        expected=np.array([[0,.040449936, .46135613,.95468717]])
        np.testing.assert_allclose(linear_to_srgb(values),expected,atol=2e-7)
        np.testing.assert_allclose(srgb_to_linear(linear_to_srgb(values)),values,atol=1e-12)

    def test_gltf_white_default_and_error_on_unhandled_texture(self):
        p,model=fixture()
        model["materials"][0]["pbrMetallicRoughness"].pop("baseColorFactor")
        specs=validate_opaque_materials(model,[p])
        np.testing.assert_array_equal(specs[0][0],[1,1,1])
        model["textures"]=[{"source":0}]
        model["images"]=[{"uri":"unsupported.png"}]
        model["materials"][0]["pbrMetallicRoughness"]["baseColorTexture"]={"index":0}
        with self.assertRaisesRegex(ValueError,"PBR_V2_UNSUPPORTED_MATERIAL.*texture"):
            validate_opaque_materials(model,[p])
        del model["textures"]
        del model["images"]
        del model["materials"][0]["pbrMetallicRoughness"]["baseColorTexture"]
        model["materials"][0]["normalTexture"]={"index":0}
        with self.assertRaisesRegex(ValueError,"PBR_V2_UNSUPPORTED_MATERIAL"):
            validate_opaque_materials(model,[p])

    def test_vertex_alpha_and_transparency_refuse(self):
        p,model=fixture()
        p.vertex_alpha=np.array([1,.5,1],dtype=float)
        with self.assertRaisesRegex(ValueError,"PBR_V2_UNSUPPORTED_MATERIAL.*alpha"):
            validate_opaque_materials(model,[p])
        p.vertex_alpha=None
        model["materials"][0]["alphaMode"]="BLEND"
        with self.assertRaisesRegex(ValueError,"PBR_V2_UNSUPPORTED_MATERIAL.*alpha"):
            validate_opaque_materials(model,[p])

    def test_visible_pixel_independent_source_barycentric_color_oracle(self):
        p,model=fixture()
        vis={
            "winnerSourceTriangle":np.array([[-1,0],[-1,-1]],dtype=np.int64),
            "sourceWeights":np.array([
                [[0,0,0],[.25,.5,.25]],
                [[0,0,0],[0,0,0]]],dtype=float),
            "primitiveBySourceTriangle":np.array([0],dtype=np.int32)
        }
        specs=validate_opaque_materials(model,[p])
        images,stats=shade_visible([p],vis,specs,np.array([0,0,0]),
                                   ("albedo","object-id","normal","beauty"))
        source_color=.25*p.vertex_colors[0]+.5*p.vertex_colors[1]+.25*p.vertex_colors[2]
        expected=np.rint(linear_to_srgb(source_color*np.array([.8,.7,.6]))*255).astype(np.uint8)
        np.testing.assert_array_equal(images["albedo"][0,1],expected)
        self.assertEqual(stats["shadedPixels"],1)
        self.assertEqual(stats["coveredPixels"],1)
        np.testing.assert_array_equal(images["albedo"][0,0],[12,15,19])
        self.assertFalse(np.array_equal(images["beauty"][0,1],images["albedo"][0,1]))
        # Material declaration is not a spatial or source image certificate.
        self.assertEqual(stats["claimScope"],"material-preview-only")
        self.assertFalse(stats["certificationEligible"])

    def test_fragment_occlusion_only_shades_winner(self):
        a,model=fixture()
        b=Primitive(a.positions.copy()+[0,0,.2],a.normals.copy(),a.indices.copy(),
             np.ones(3),0.,.65,1,"hidden",vertex_colors=np.ones((3,3)))
        model["meshes"][0]["primitives"].append({"attributes":{"POSITION":0,"NORMAL":1,"COLOR_0":2},"material":0})
        vis={"winnerSourceTriangle":np.array([[0,-1],[-1,-1]],dtype=np.int64),
             "sourceWeights":np.array([[[.2,.2,.6],[0,0,0]],
                                       [[0,0,0],[0,0,0]]],dtype=float),
             "primitiveBySourceTriangle":np.array([0,1],dtype=np.int32)}
        images,metrics=shade_visible([a,b],vis,validate_opaque_materials(model,[a,b]),
            np.zeros(3),("albedo",))
        self.assertEqual(metrics["shadedPixels"],1)
        self.assertFalse(np.array_equal(images["albedo"][0,0],[255,255,255]))


@unittest.skipUnless(njit is not None,"optional Numba not installed")
class MaterialVisibilityIntegration(unittest.TestCase):
    def test_one_visibility_four_opaque_passes_and_tile_parity(self):
        p,model=fixture()
        def run(tile,threads):
            return render_material_preview([p],model,
                    np.zeros(3),np.array([0,0,1]),np.array([0,1,0]),55,64,
                    tile_size=tile,threads=threads,max_working_mib=512)
        images,vis,stats=run(16,1)
        self.assertEqual(stats["visibility"]["inputTriangles"],1)
        self.assertEqual(stats["shadedPixels"],stats["visibility"]["coveredPixels"])
        self.assertGreater(stats["shadedPixels"],0)
        for size in (16,32,64):
            for threads in (1,min(2,numba_config.NUMBA_NUM_THREADS)):
                new,other,_=run(size,threads)
                for key in images:
                    np.testing.assert_array_equal(new[key],images[key])
                np.testing.assert_array_equal(other["winnerSourceTriangle"],
                                              vis["winnerSourceTriangle"])
                np.testing.assert_array_equal(other["sourceWeights"],vis["sourceWeights"])
        self.assertEqual(stats["claimScope"],"material-preview-only")


@unittest.skipUnless(njit is not None,"optional Numba not installed")
class MaterialCliIntegration(unittest.TestCase):
    def test_default_eight_view_pbr_uses_studio_v2(self):
        import hashlib
        import shutil
        if not shutil.which("node"): self.skipTest("Node unavailable")
        cli=Path(__file__).resolve().parents[1]/"skills/refas/scripts/refas.mjs"
        with tempfile.TemporaryDirectory(prefix="refas-default-v2-") as temp:
            root=Path(temp); glb=root/"asset.glb"; frame=root/"frame.json"
            create_fixture(glb,frame,"strands",120,31)
            out=root/"canonical"
            result=subprocess.run(["node",str(cli),"render-pbr","--glb",str(glb),
                "--frame",str(frame),"--out",str(out),"--size","64","--tile-size","32",
                "--max-working-mb","512","--timeout-seconds","120","--no-board"],
                text=True,capture_output=True,timeout=180)
            self.assertEqual(result.returncode,0,result.stderr[-6000:])
            report=json.loads((out/"render-report.json").read_text())
            self.assertEqual(report["claimScope"],"visual-fidelity")
            self.assertEqual(report["renderer"]["backend"],"numba-studio-pbr-v2")
            self.assertEqual(report["colorPipeline"]["toneMapping"],"ACES-fitted-v2")
            self.assertEqual(len(report["outputs"]),8)
            self.assertNotIn("presentation",report)
            self.assertEqual(report["materialSupport"]["supported"],
                             sorted(set(report["materialSupport"]["supported"])))
            self.assertEqual(report["materialSupport"]["unsupported"],
                             sorted(set(report["materialSupport"]["unsupported"])))
            # The canonical JS report verifier must accept the *exact*
            # independent Python v2 report, not just eight successful PNGs.
            from os.path import relpath
            root_repo=Path(__file__).resolve().parents[1]
            script=(
                "import fs from 'node:fs';"
                "import {validatePbrRenderReport} from './skills/refas/scripts/lib/pbr-render-report.mjs';"
                "const r=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));"
                "const v=validatePbrRenderReport(r);"
                "if(!v.valid){console.error(v.errors.join('; '));process.exit(2)}"
            )
            check=subprocess.run(["node","--input-type=module","-e",script,
                str(out/"render-report.json")],cwd=root_repo,
                text=True,capture_output=True,timeout=15)
            self.assertEqual(check.returncode,0,check.stderr)

            for row in report["outputs"]:
                file=out/Path(row["path"]).name
                self.assertTrue(file.exists(),file)
                self.assertEqual(hashlib.sha256(file.read_bytes()).hexdigest(),row["sha256"])

    def test_unified_cli_opaque_v2_preview_cache_and_certification_guard(self):
        import hashlib
        import shutil
        if not shutil.which("node"):
            self.skipTest("Node unavailable")
        cli=Path(__file__).resolve().parents[1]/"skills/refas/scripts/refas.mjs"
        with tempfile.TemporaryDirectory(prefix="refas-unified-pbr-") as tmp:
            root=Path(tmp); glb=root/"asset.glb"; frame=root/"frame.json"
            create_fixture(glb,frame,"strands",120,31)
            out=root/"preview"
            args=["node",str(cli),"preview-pbr","--glb",str(glb),"--frame",str(frame),
                  "--out",str(out),"--backend","opaque-v2","--views","hero,side",
                  "--size","48","--tile-size","32","--max-working-mb","512",
                  "--timeout-seconds","120","--reuse"]
            first=subprocess.run(args,text=True,capture_output=True,timeout=140)
            self.assertEqual(first.returncode,0,first.stderr[-4000:])
            report=json.loads((out/"preview-manifest.json").read_text())
            self.assertEqual(report["backend"],"opaque-v2")
            self.assertEqual(report["claimScope"],"preview-only")
            self.assertFalse(report["eligibleForCertification"])
            self.assertEqual([x["viewId"] for x in report["outputs"]],["hero","side"])
            self.assertFalse((out/"render-report.json").exists())
            for entry in report["outputs"]:
                data=(out/entry["path"]).read_bytes()
                self.assertEqual(hashlib.sha256(data).hexdigest(),entry["sha256"])
                self.assertEqual(np.asarray(Image.open(out/entry["path"])).shape,(48,48,3))
            cached=subprocess.run(args,text=True,capture_output=True,timeout=20)
            self.assertEqual(cached.returncode,0,cached.stderr)
            self.assertIn("REUSED",cached.stdout)
            (out/"hero.png").write_bytes(b"tampered")
            repaired=subprocess.run(args,text=True,capture_output=True,timeout=140)
            self.assertEqual(repaired.returncode,0,repaired.stderr[-4000:])
            self.assertIn('"PASS"',repaired.stdout)
            # Non-beauty views must be real v2 diagnostics, never mislabeled beauty.
            diag_args=list(args)
            diag_args[diag_args.index("--out")+1]=str(root/"diagnostics")
            diag_args[diag_args.index("--views")+1]="normal,albedo"
            diagnostic=subprocess.run(diag_args,text=True,capture_output=True,timeout=140)
            self.assertEqual(diagnostic.returncode,0,diagnostic.stderr[-4000:])
            diag=json.loads((root/"diagnostics"/"preview-manifest.json").read_text())
            self.assertEqual([x["viewId"] for x in diag["outputs"]],["normal","albedo"])
            normal=np.asarray(Image.open(root/"diagnostics"/"normal.png"))
            albedo=np.asarray(Image.open(root/"diagnostics"/"albedo.png"))
            self.assertFalse(np.array_equal(normal,albedo))
            forbidden=subprocess.run(["node",str(cli),"render-pbr","--glb",str(glb),
                "--frame",str(frame),"--out",str(root/"canonical"),"--backend","opaque-v2",
                "--neutral-clay"],text=True,capture_output=True,timeout=15)
            self.assertNotEqual(forbidden.returncode,0)
            self.assertIn("NEUTRAL_CLAY",forbidden.stderr)
            self.assertFalse((root/"canonical"/"render-report.json").exists())

    def test_actual_glb_cli_signed_output_preview_not_certification(self):
        worker=Path(__file__).resolve().parents[1]/"skills/refas/scripts/render_pbr_v2_material.py"
        with tempfile.TemporaryDirectory(prefix="refas-r14-06c-") as temp:
            root=Path(temp); glb=root/"asset.glb"; frame=root/"frame.json"
            create_fixture(glb,frame,"strands",120,31)
            out=root/"preview"
            proc=subprocess.run([sys.executable,str(worker),"--glb",str(glb),
                "--frame",str(frame),"--out",str(out),"--threads","1",
                "--size","48","--max-working-mb","512"],text=True,capture_output=True,
                timeout=120)
            self.assertEqual(proc.returncode,0,proc.stderr[-4000:])
            report=json.loads((out/"preview-report.json").read_text())
            self.assertEqual(report["status"],"COMPLETE")
            self.assertEqual(report["claimScope"],"material-preview-only")
            self.assertFalse(report["certificationEligible"])
            self.assertEqual(report["stats"]["visibility"]["inputTriangles"],120)
            self.assertEqual(len(report["outputs"]),4)
            import hashlib
            for row in report["outputs"]:
                data=(out/row["path"]).read_bytes()
                self.assertEqual(hashlib.sha256(data).hexdigest(),row["sha256"])
                self.assertEqual(np.asarray(Image.open(out/row["path"])).shape,(48,48,3))
            self.assertEqual(len(report["geometryDigests"]),3)


if __name__=="__main__":
    unittest.main()
