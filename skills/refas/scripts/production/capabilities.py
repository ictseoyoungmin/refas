"""Find installed authoring helpers and native recipes without importing Blender."""
import ast
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[2]
ROUTES = (
    ("local-edit", "Move several local handles jointly while freezing the outside cage.",
     "local edit handle fixed deformation dimension shell pair obstacle ray gap 국소 편집 핸들 고정 변형 치수 간격",
     "Blender Python", "production-assemblies.md", ("local_edit.edit_region",),
     "Small static mesh displacement with explicit size, shell-pair and directional gap checks; rejects a conflicting proposal, not a general constraint solver."),
    ("surface-projection", "Fit a prepared surface layer with bounded native projection and rollback.",
     "projection shrinkwrap conform flexible patch layer fit gap miss 투영 곡면 피팅 패치 맞춤 간격",
     "Blender Python", "production-assemblies.md", ("surface_project.project_region",),
     "Static complete-component binary masks and supported native stacks; finite fit observations, not a general constraint solver."),
    ("boundary-bridge", "Join explicit existing cage boundaries with native surface transitions.",
     "bridge boundary join transition roll lapel fender curvature closed loop armhole 경계 접합 전이 라펠 곡률 닫힌 고리 암홀",
     "Blender Python", "production-assemblies.md", ("boundary_bridge.bridge_boundaries",),
     "One static open-chain or explicit closed-loop topology edit; preserves the source cage, not evaluated margins or exact G1 continuity."),
    ("blind-recess", "Cut and revise an actual blind recess from a selected surface and convex outline.",
     "recess cavity intake socket cut depth floor wall groove 홈 매입 흡기구 절삭 깊이 벽 바닥",
     "Blender Python", "production-assemblies.md", ("recess.cut_recess",),
     "Static solid host and convex prismatic cut; sampled floor/wall limits, not cloth pockets or global minimum thickness."),
    ("surface-mount", "Place and bind a rigid detail to an evaluated surface using its contact footprint.",
     "mount bind follow button badge buckle bracket mirror stud rigid surface placement 부착 배치 배지 버클 장식 추종 단추",
     "Blender Python", "production-assemblies.md",
     ("surface_mount.surface_frame", "surface_mount.place_on_surface",
      "surface_mount.bind_on_surface", "surface_mount.check_surface_mount"),
     "Optional native same-topology attachment with explicit planar samples; no automatic rebind, whole-part collision or animation bake."),
    ("thickness-field", "Limit an explicit thickness field along mesh edges.",
     "thickness taper gradient minimum cap shell 두께 변화율", "Python standard library",
     "production-assemblies.md", ("thickness_field.grade_thickness",),
     "Checks graph constraints only; inspect the evaluated shell and contact separately."),
    ("surface-binding", "Transport an authored section with an explicitly selected triangle.",
     "surface binding attachment trim piping frame 부착 표면 파이핑", "Python standard library",
     "production-assemblies.md", ("surface_binding.surface_sample", "surface_binding.bind_surface_points",
                                  "surface_binding.transport_surface_points"),
     "Requires matching ordered topology; does not select a face or resolve collisions."),
    ("mesh-observation", "Inspect evaluated topology or an explicit anchor gap.",
     "mesh topology hole winding degenerate anchor gap 메시 토폴로지 간격", "Blender Python",
     "production-topology.md", ("mesh_audit.audit_mesh", "mesh_audit.anchor_gap"),
     "Read-only bounded observations; not automatic repair or whole-asset certification."),
    ("native-curve", "Keep editable Bezier, POLY or NURBS controls through native iterations.",
     "curve spline bevel piping cable 곡선 파이핑 케이블", "Ordinary bpy recipe",
     "production-assemblies.md", (),
     "Use run and inspect; explicitly convert selected final curves before delivery."),
    ("native-lattice", "Shape an existing asset with an editable Blender Lattice cage.",
     "lattice cage broad local deformation sculpt 케이지 변형 조형", "Ordinary bpy recipe",
     "production-assemblies.md", (),
     "Protect and inspect cage and host separately; delivery does not automatically bake animation."),
    ("construction-mesh", "Retain editable Boolean cutters and surface-fitting sources.",
     "construction boolean cutter shrinkwrap projection opening 제작 불리언 투영 개구부", "Ordinary bpy recipe",
     "production-assemblies.md", (),
     "Explicit construction meshes remain enabled and hidden from render; ordinary hidden meshes are not inferred."),
    ("fixed-view-comparison", "Compare captured fixed views against declared preservation regions.",
     "compare review silhouette coverage camera preservation 비교 실루엣 보존 카메라", "Production CLI: compare",
     "production-review.md", (),
     "Coverage preservation is not source likeness, target improvement or visual approval."),
)


def _callable(name):
    module, function = name.split(".")
    source = ROOT / "scripts" / "production" / (module + ".py")
    tree = ast.parse(source.read_text(encoding="utf-8"), filename=str(source))
    node = next((item for item in tree.body
                 if isinstance(item, ast.FunctionDef) and item.name == function), None)
    if node is None:
        raise ValueError("advertised authoring callable is missing: " + name)
    return {"name": name,
            "authoringImport": "from " + module + " import " + function,
            "signature": function + "(" + ast.unparse(node.args) + ")"}


def search(*, query=None, route_id=None):
    """Return matching installed routes; no query lists all, no match returns [].

    Use short task terms. All whitespace-separated terms must occur in the
    route's name, summary, keywords or callable names. Exact IDs bypass search.
    Signatures come from source, not imported modules or a duplicated API list.
    """
    if query is not None and route_id is not None:
        raise ValueError("choose a query or an exact capability ID")
    if query is not None and (not isinstance(query, str) or not query.strip()):
        raise ValueError("query must contain search terms")
    if route_id is not None and route_id not in {row[0] for row in ROUTES}:
        raise ValueError("unknown authoring capability: " + str(route_id))
    terms = re.findall(r"\w+", query.casefold()) if query is not None else []
    if query is not None and not terms:
        raise ValueError("query must contain search terms")
    matches = []
    for key, summary, keywords, environment, guide, calls, limit in ROUTES:
        haystack = " ".join((key, summary, keywords, *calls)).casefold()
        if (route_id is not None and key != route_id) or any(term not in haystack for term in terms):
            continue
        relative = "references/" + guide
        if not (ROOT / relative).is_file():
            raise ValueError("advertised authoring guide is missing: " + relative)
        matches.append({"id": key, "summary": summary, "environment": environment,
                        "guide": relative, "callables": [_callable(name) for name in calls],
                        "limitations": limit})
    return {"query": query, "id": route_id, "matches": matches,
            "scope": "Installed helpers and optional recipes; no Blender execution or project mutation."}
