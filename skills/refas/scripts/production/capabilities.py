"""Find installed authoring helpers and native recipes without importing Blender."""
import ast
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[2]
ROUTES = (
    ("surface-patch", "Create native surfaces from explicit outlines and sections with shared boundary vertices.",
     "create build initial surface patch profile section coons linear bezier boundary shape car body 차체 윤곽 생성 제작 초기 면 단면 경계 직선 곡선",
     "Blender Python", "production-assemblies.md",
     ("surface_patch.sample_profile", "surface_patch.build_surface"),
     "Four corresponding boundaries per patch; explicit straight/Bezier intent and shared cage vertices, not automatic reference interpretation, G1 continuity or collision-free surfaces.",
     "create-surfaces-from-outlines-and-sections",
     "Reference-derived named boundary samples, four oriented boundary uses per patch, equal opposite sample counts and shared corner coordinates."),
    ("sculpt-brush", "Reshape a whole native base cage or a masked region with world-space sculpt brushes.",
     "blockout sculpt grab draw inflate smooth flatten proportion silhouette car body torso jacket whole form 블록아웃 조형 스컬프트 전체 비례 실루엣 차체 윤곽 형상 다듬기",
     "Blender Python", "production-form.md", ("sculpt.sculpt_brush",),
     "Edits existing base-cage vertices, not evaluated modifier output; no remeshing, added detail resolution, collision solving or automatic reference interpretation. Inspect the evaluated result.",
     "reshape-the-whole-or-a-masked-region",
     "Single-user mesh in Object Mode, world-space brush center/radius and movement or strength; optional vertex selection, weighted group mask and world-axis symmetry."),
    ("boolean-form", "Cut openings or combine prepared solid forms with a retained native Boolean.",
     "boolean cut carve subtract difference union merge combine intersect opening hole solid mesh 절개 절삭 구멍 결합 통합 메시 합치기",
     "Blender Python", "production-form.md", ("mesh_form.boolean_form",),
     "Prepared mesh operands and an editable Boolean, not automatic operand construction, watertight repair or animation baking. Cage layers survive; evaluated topology and new-face UVs need inspection.",
     "cut-or-combine-prepared-forms",
     "Scene-linked target and independently authored mesh operand; explicit operation and optional insertion point before an existing target modifier. The operand becomes an enabled construction mesh hidden from render/export."),
    ("engrave-path", "Carve a groove or incised pattern along an authored world-space path.",
     "engrave engraving incision groove pattern ornament path carve 음각 문양 새기기 홈 경로 조각",
     "Blender Python", "production-form.md", ("mesh_form.engrave_path",),
     "Round-section path cutter; the path must intersect the solid. No automatic surface projection, minimum remaining thickness or lettering recognition.",
     "engrave-a-path-on-the-form",
     "World-space path points and positive cutter radius, a solid target and deliberate path depth; optional closed path and modifier insertion point."),
    ("local-edit", "Move several local handles jointly while freezing the outside cage.",
     "local edit handle fixed deformation dimension shell pair obstacle ray gap 국소 편집 핸들 고정 변형 치수 간격",
     "Blender Python", "production-assemblies.md", ("local_edit.edit_region",),
     "Static unparented cage; optional plain Solidify then Bevel then Weighted Normal. Shell pairs measure the Solidify prefix, not final finish thickness; rejects conflicting sampled bounds, not a general constraint solver.",
     "edit-several-local-targets-with-a-fixed-surrounding-cage",
     "Existing cage region (vertex indices or binary group), absolute world-space handle targets, displacement and tolerance bounds."),
    ("surface-projection", "Fit a prepared surface layer with bounded native projection and rollback.",
     "projection shrinkwrap conform flexible patch layer fit gap miss decal stripe lettering 투영 곡면 피팅 패치 맞춤 간격 데칼 줄무늬 글자",
     "Blender Python", "production-assemblies.md", ("surface_project.project_region",),
     "Static complete-component binary masks and supported native stacks; finite fit observations, not a general constraint solver.",
     "fit-prepared-flexible-surface-layers",
     "Static unparented source/target, complete-component binary source mask, local axis/direction and world-space bounds. Optional compatible Project prefix, then optional Solidify and Bevel in order; unit source-axis scale and rigid target transform."),
    ("boundary-bridge", "Join explicit existing cage boundaries with native surface transitions.",
     "bridge boundary join transition roll lapel fender curvature closed loop armhole wheel arch 경계 접합 전이 라펠 곡률 닫힌 고리 암홀 휠아치",
     "Blender Python", "production-assemblies.md", ("boundary_bridge.bridge_boundaries",),
     "One static open-chain or explicit closed-loop topology edit; preserves the source cage, not evaluated margins or exact G1 continuity. Does not generate wheel openings.",
     "join-existing-cage-boundaries",
     "Two existing disjoint ordered boundaries with equal vertex counts in one static cage, explicit correspondence, compatible winding and cuts; a wheel arch must already have those boundaries."),
    ("blind-recess", "Cut and revise an actual blind recess from a selected surface and convex outline.",
     "recess cavity intake socket cut depth floor wall groove 홈 매입 흡기구 절삭 깊이 벽 바닥",
     "Blender Python", "production-assemblies.md", ("recess.cut_recess",),
     "Static solid host and convex prismatic cut; sampled floor/wall limits, not cloth pockets or global minimum thickness.",
     "cut-a-blind-recess-from-a-surface-outline",
     "Closed static unparented solid, front-facing selection ray/tangent, convex outline enclosing the origin, depth and remaining floor/wall bounds in world units."),
    ("surface-mount", "Place and bind a rigid detail to an evaluated surface using its contact footprint.",
     "mount bind follow attach button badge buckle bracket mirror stud rigid surface placement 부착 배치 배지 배지를 곡면에 붙이기 버클 장식 추종 단추",
     "Blender Python", "production-assemblies.md",
     ("surface_mount.surface_frame", "surface_mount.place_on_surface",
      "surface_mount.bind_on_surface", "surface_mount.check_surface_mount"),
     "Optional native same-topology attachment with explicit planar samples; no automatic rebind, whole-part collision or animation bake.",
     "mount-rigid-details-on-the-actual-surface",
     "For initial placement/binding: static unparented part, at least three noncollinear local-XY contact samples, host-selection ray/tangent and gap bounds. Checking uses the saved bound part."),
    ("thickness-field", "Limit an explicit thickness field along mesh edges.",
     "thickness taper gradient minimum cap shell 두께 변화율", "Python standard library",
     "production-assemblies.md", ("thickness_field.grade_thickness",),
     "Checks graph constraints only; inspect the evaluated shell and contact separately.",
     "establish-scale-and-hierarchy-before-detail",
     "Vertices/edges in one length unit, requested/minimum thickness and maximum gradient; optional protected indices/caps."),
    ("surface-binding", "Transport an authored section with an explicitly selected triangle.",
     "surface binding attachment trim piping frame 부착 표면 파이핑", "Python standard library",
     "production-assemblies.md", ("surface_binding.surface_sample", "surface_binding.bind_surface_points",
                                  "surface_binding.transport_surface_points"),
     "Requires matching ordered topology; does not select a face or resolve collisions.",
     "follow-a-deforming-surface-with-an-attached-section",
     "Selected oriented host triangle, barycentric weights and authored section points in one space; matching ordered topology across poses."),
    ("mesh-observation", "Inspect evaluated topology or an explicit anchor gap.",
     "mesh topology hole winding degenerate anchor gap 메시 토폴로지 간격", "Blender Python",
     "production-topology.md", ("mesh_audit.audit_mesh", "mesh_audit.anchor_gap"),
     "Read-only bounded observations; not automatic repair or whole-asset certification.",
     "inspect-before-choosing-an-operation",
     "Evaluated mesh/classic-curve surface and meters_per_unit; gap checks also need an object-local anchor, target and maximum gap."),
    ("native-curve", "Keep editable Bezier, POLY or NURBS controls through native iterations.",
     "curve spline bevel piping cable 곡선 파이핑 케이블", "Ordinary bpy recipe",
     "production-assemblies.md", (),
     "Use run and inspect; explicitly convert selected final curves before delivery.",
     "shape-cables-and-trim-with-native-curves",
     "Authored classic curve controls/profile and matching viewport/render resolution."),
    ("native-lattice", "Shape an existing asset with an editable Blender Lattice cage.",
     "lattice cage broad local deformation sculpt 케이지 변형 조형", "Ordinary bpy recipe",
     "production-assemblies.md", (),
     "Protect and inspect cage and host separately; delivery does not automatically bake animation.",
     "shape-a-region-with-an-editable-lattice",
     "Enabled scene-linked lattice and host, deliberate cage placement and an optional host region group."),
    ("construction-mesh", "Retain editable Boolean cutters and surface-fitting sources.",
     "construction boolean cutter shrinkwrap projection opening 제작 불리언 투영 개구부", "Ordinary bpy recipe",
     "production-assemblies.md", (),
     "Explicit construction meshes remain enabled and hidden from render; ordinary hidden meshes are not inferred.",
     "use-a-native-cutter-for-other-boolean-constructions",
     "Enabled scene-linked source mesh with explicit construction role and hide_render=True."),
    ("fixed-view-comparison", "Compare captured fixed views against declared preservation regions.",
     "compare review silhouette coverage camera preservation 비교 실루엣 보존 카메라", "Production CLI: compare",
     "production-review.md", (),
     "Coverage preservation is not source likeness, target improvement or visual approval.",
     "optional-coverage-preservation-check",
     "Two captured revisions with the same transparent review and explicit nonoverlapping regions, including a protected region."),
    ("native-motion", "Build rigid joint motion with named pivots and explicit parenting.",
     "joint pivot hinge door scissor articulation rotation parent motion 힌지 피벗 문 도어 관절 회전 부모",
     "Ordinary bpy recipe", "production-assemblies.md", (),
     "Explicit authoring recipe; no automatic hinge placement, collision clearance or animation bake.",
     "make-the-motion-hierarchy-explicit",
     "Named joint center/axis and explicit moving-part/attachment parenting; evaluate newly positioned pivots before preserving neutral world transforms."),
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
    for key, summary, keywords, environment, guide, calls, limit, anchor, prerequisites in ROUTES:
        haystack = " ".join((key, summary, keywords, *calls)).casefold()
        if (route_id is not None and key != route_id) or any(term not in haystack for term in terms):
            continue
        relative = "references/" + guide
        if not (ROOT / relative).is_file():
            raise ValueError("advertised authoring guide is missing: " + relative)
        matches.append({"id": key, "summary": summary, "environment": environment,
                        "guide": relative, "guideAnchor": anchor, "prerequisites": prerequisites,
                        "callables": [_callable(name) for name in calls],
                        "limitations": limit})
    result = {"query": query, "id": route_id, "matches": matches,
              "scope": "Installed helpers and optional recipes; no Blender execution or project mutation."}
    if query is not None and not matches:
        result["hint"] = ("No installed route matched every search term. Try a shorter operation term such as "
                          "mount, projection, bridge or hinge, or omit --query to list all routes. "
                          "Ordinary bpy authoring remains available.")
    return result
