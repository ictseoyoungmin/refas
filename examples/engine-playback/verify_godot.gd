extends SceneTree
## Import the delivered GLB and evaluate its animation in a separate consumer.
## This headless observation does not measure GPU appearance, collisions, or FPS.

var report = {"schema": "refas.godot.playback/v1", "ok": false, "checks": [], "samples": []}
var configuration = {}
var nodes = {}
var node_paths = {}
var source_nodes = {}
var vertex_matches = {}
var morph_meshes = {}
var rest_surfaces = {}

func _initialize():
	call_deferred("_run")

func check(label, ok, details = null):
	report.checks.append({"name": label, "ok": bool(ok), "details": details})
	return bool(ok)

func positive_finite(value):
	return (value is float or value is int) and is_finite(float(value)) and value > 0

func finish():
	report.ok = not report.checks.is_empty()
	for item in report.checks:
		report.ok = report.ok and item.ok
	if configuration.has("output"):
		var file = FileAccess.open(configuration.output, FileAccess.WRITE)
		if file:
			file.store_string(JSON.stringify(report, "\t", true) + "\n")
		else:
			report.ok = false
	print(JSON.stringify({"ok": report.ok, "output": configuration.get("output"),
		"samples": report.samples.size(), "failed": report.checks.filter(func(item): return not item.ok)}))
	quit(0 if report.ok else 1)

func matrix_rows(value):
	return [[value.basis.x.x, value.basis.y.x, value.basis.z.x, value.origin.x],
		[value.basis.x.y, value.basis.y.y, value.basis.z.y, value.origin.y],
		[value.basis.x.z, value.basis.y.z, value.basis.z.z, value.origin.z], [0, 0, 0, 1]]

func matrix_error(actual, expected):
	var maximum = 0.0
	if not expected is Array or expected.size() != 4:
		return INF
	for row in range(4):
		if not expected[row] is Array or expected[row].size() != 4:
			return INF
		for column in range(4):
			maximum = max(maximum, abs(actual[row][column] - expected[row][column]))
	return maximum

func named_node(node_name):
	# Exact paths are relative to the imported scene, never the SceneTree root.
	# A bare name still has to identify one node even if it is a direct child.
	if node_name == "." or "/" in node_name:
		return node_paths.get(node_name.trim_prefix("./"))
	if source_nodes.has(node_name):
		return source_nodes[node_name][0] if source_nodes[node_name].size() == 1 else null
	if not nodes.has(node_name) or nodes[node_name].size() != 1:
		return null
	return nodes[node_name][0]

func skinned_point(mesh_node, arrays, surface_index, vertex_index, rest_association = false):
	# Exercise the imported Skin, joint indices, weights and inverse-bind poses
	# with Godot's evaluated skeleton. This CPU observation is not a GPU render.
	var vertices = arrays[Mesh.ARRAY_VERTEX]
	if mesh_node.mesh.get_blend_shape_count() > 0:
		var key = mesh_node.get_instance_id()
		if not morph_meshes.has(key):
			# Use the consumer's public blend-shape evaluator, preserving its
			# normalized/relative semantics. Cache once per node and sample.
			morph_meshes[key] = mesh_node.bake_mesh_from_current_blend_shape_mix()
		if morph_meshes[key] == null:
			return null
		vertices = morph_meshes[key].surface_get_arrays(surface_index)[Mesh.ARRAY_VERTEX]
		if vertices.size() != arrays[Mesh.ARRAY_VERTEX].size():
			return null
	if not mesh_node.skin:
		return mesh_node.global_transform * vertices[vertex_index]
	var skeleton = mesh_node.get_node_or_null(mesh_node.skeleton)
	if not skeleton is Skeleton3D:
		return null
	var weights = arrays[Mesh.ARRAY_WEIGHTS]
	var joints = arrays[Mesh.ARRAY_BONES]
	if weights == null or joints == null or vertices.is_empty() or weights.size() != joints.size():
		return null
	var influences = int(weights.size() / vertices.size())
	if influences != 4 and influences != 8:
		return null
	var result = Vector3.ZERO
	var weight_sum = 0.0
	for index in range(influences):
		var offset = vertex_index * influences + index
		var weight = weights[offset]
		if weight == 0:
			continue
		var bind = joints[offset]
		if bind < 0 or bind >= mesh_node.skin.get_bind_count():
			return null
		var bone_name = mesh_node.skin.get_bind_name(bind)
		var bone = skeleton.find_bone(bone_name) if not str(bone_name).is_empty() else mesh_node.skin.get_bind_bone(bind)
		if bone < 0 or bone >= skeleton.get_bone_count():
			return null
		result += weight * (skeleton.get_bone_global_pose(bone) * mesh_node.skin.get_bind_pose(bind) * vertices[vertex_index])
		weight_sum += weight
	if abs(weight_sum - 1.0) > 0.0001:
		return null
	if rest_association:
		# Association only: UNORM16 storage can make otherwise normalized
		# weights sum to 0.9999847. Do not let that common rest-space offset
		# hide the corresponding vertex. The actual deformation below keeps
		# the imported raw weights, as the consumer renderer does.
		result /= weight_sum
	return skeleton.global_transform * result

func match_vertex(probe):
	var node = named_node(probe.node)
	if node == null:
		return null
	var candidates = [node] + node.find_children("*", "MeshInstance3D", true, false)
	var target = Vector3(probe.restWorld[0], probe.restWorld[1], probe.restWorld[2])
	var best = null
	var distance = INF
	for candidate in candidates:
		if not candidate is MeshInstance3D or not candidate.mesh:
			continue
		for surface in range(candidate.mesh.get_surface_count()):
			var cache_key = str(candidate.get_instance_id()) + ":" + str(surface)
			if not rest_surfaces.has(cache_key):
				var arrays = candidate.mesh.surface_get_arrays(surface)
				var positions = []
				for vertex in range(arrays[Mesh.ARRAY_VERTEX].size()):
					positions.append(skinned_point(candidate, arrays, surface, vertex, true))
				rest_surfaces[cache_key] = {"arrays": arrays, "positions": positions}
			var cached = rest_surfaces[cache_key]
			for vertex in range(cached.positions.size()):
				var point = cached.positions[vertex]
				if point != null and point.distance_to(target) < distance:
					distance = point.distance_to(target)
					best = {"node": candidate, "arrays": cached.arrays, "vertex": vertex,
						"surface": surface, "restMatchDistance": distance}
	if distance > configuration.get("vertexMatchTolerance", 0.00001):
		return null
	return best

func _run():
	var arguments = OS.get_cmdline_user_args()
	if arguments.size() != 1:
		check("configuration", false, "Pass one absolute JSON configuration path after --")
		finish()
		return
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(arguments[0]))
	if not parsed is Dictionary:
		check("configuration", false, "Configuration must be a JSON object")
		finish()
		return
	configuration = parsed
	if not check("requiredConfiguration", configuration.has_all(["asset", "clip", "samples", "output", "tolerance"])
			and configuration.get("samples", []).size() >= 3
			and positive_finite(configuration.get("tolerance", 0))
			and positive_finite(configuration.get("vertexTolerance", 0.00002))
			and positive_finite(configuration.get("vertexMatchTolerance", 0.00001))):
		finish()
		return
	report.tolerances = {"matrix": configuration.tolerance,
		"skinVertexM": configuration.get("vertexTolerance", 0.00002),
		"restVertexMatchM": configuration.get("vertexMatchTolerance", 0.00001)}
	report.engine = Engine.get_version_info()
	report.assetSha256 = FileAccess.get_sha256(configuration.asset)
	report.mode = "headless GLTFDocument import and AnimationPlayer evaluation; no GPU or FPS claim"
	report.vertexEvaluation = "Godot bake_mesh_from_current_blend_shape_mix, then imported Skin binds/weights and evaluated Skeleton3D poses, or the live mesh global transform for unskinned vertices"
	report.restAssociation = "Normalize weight sum only to associate the rest vertex; actual deformation retains imported raw quantized weights"
	var document = GLTFDocument.new()
	var state = GLTFState.new()
	var imported = document.append_from_file(configuration.asset, state)
	if not check("import", imported == OK, imported):
		finish()
		return
	var scene = document.generate_scene(state, configuration.get("bakeFps", 30), false, false)
	if not check("sceneGenerated", scene != null):
		finish()
		return
	root.add_child(scene)
	await process_frame
	var all_nodes = [scene] + scene.find_children("*", "", true, false)
	var players = []
	var geometry = {"meshes": 0, "surfaces": 0, "triangles": 0, "skinnedMeshes": 0, "skeletons": []}
	for node in all_nodes:
		var key = str(node.name)
		var relative_path = str(scene.get_path_to(node))
		node_paths[relative_path] = node
		if not nodes.has(key):
			nodes[key] = []
		nodes[key].append(node)
		if node is AnimationPlayer:
			players.append(node)
		if node is Skeleton3D:
			geometry.skeletons.append({"name": key, "bones": node.get_bone_count(),
				"path": "." if relative_path == "." else "./" + relative_path})
		if node is MeshInstance3D and node.mesh:
			geometry.meshes += 1
			geometry.surfaces += node.mesh.get_surface_count()
			if node.skin and node.skin.get_bind_count() > 0 and node.get_node_or_null(node.skeleton) is Skeleton3D:
				geometry.skinnedMeshes += 1
			for surface in range(node.mesh.get_surface_count()):
				var arrays = node.mesh.surface_get_arrays(surface)
				if node.mesh.surface_get_primitive_type(surface) == Mesh.PRIMITIVE_TRIANGLES:
					var count = arrays[Mesh.ARRAY_INDEX].size() if arrays[Mesh.ARRAY_INDEX] != null else 0
					if count == 0:
						count = arrays[Mesh.ARRAY_VERTEX].size()
					geometry.triangles += count / 3
	# Join original mesh names through the importer's assigned names to live
	# nodes. GLTFState scene-node pointers can be stale after mesh recreation.
	report.sourceNodeResolution = []
	var encoded_nodes = state.get_nodes()
	for index in range(encoded_nodes.size()):
		var encoded = encoded_nodes[index]
		var original_name = str(encoded.original_name)
		if encoded.mesh < 0 or original_name.is_empty():
			continue
		var assigned_name = str(encoded.get_name())
		var matches = nodes.get(assigned_name, []).filter(func(n): return n is MeshInstance3D)
		if not source_nodes.has(original_name):
			source_nodes[original_name] = []
		source_nodes[original_name].append(matches[0] if matches.size() == 1 else null)
		if not check("sourceMeshIdentity:" + original_name, matches.size() == 1, assigned_name):
			continue
		report.sourceNodeResolution.append({"gltfNodeIndex": index, "gltfMeshIndex": encoded.mesh,
			"originalName": original_name, "importerAssignedName": assigned_name,
			"actualPath": str(scene.get_path_to(matches[0]))})
	report.geometry = geometry
	check("nonemptyMeshes", geometry.meshes > 0)
	if configuration.has("expectedTriangles"):
		check("triangleCount", geometry.triangles == configuration.expectedTriangles, geometry.triangles)
	if configuration.has("requiredSkinnedMeshes"):
		check("skinBindings", geometry.skinnedMeshes >= configuration.requiredSkinnedMeshes, geometry.skinnedMeshes)
	var player = null
	var animations = []
	for item in players:
		for clip in item.get_animation_list():
			animations.append(str(clip))
		if item.has_animation(configuration.clip):
			if player != null:
				check("uniqueClipPlayer", false)
				finish()
				return
			player = item
	report.animations = animations
	if not check("namedAnimation", player != null, configuration.clip):
		finish()
		return
	var animation = player.get_animation(configuration.clip)
	report.clip = {"name": configuration.clip, "lengthSeconds": animation.length, "tracks": animation.get_track_count()}
	check("animatedTracks", animation.get_track_count() > 0)
	player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
	player.play(configuration.clip)
	var baseline = {}
	var maximum_motion = 0.0
	for sample in configuration.samples:
		if not check("sampleRange", sample.time >= 0 and sample.time <= animation.length + 0.00001, sample.time):
			continue
		player.seek(sample.time, true)
		player.advance(0)
		morph_meshes.clear()
		# Reuse expensive skin/morph association positions between this sample's
		# probes only. Actual deformation is evaluated fresh for every probe.
		rest_surfaces.clear()
		for node in all_nodes:
			if node is Skeleton3D:
				node.force_update_all_bone_transforms()
		# BoneAttachment3D children observe the sought pose during the normal
		# SceneTree update, after Skeleton3D transforms have been forced.
		await process_frame
		var row = {"time": sample.time, "probes": [], "maxMatrixError": 0.0, "vertexProbes": []}
		if not check("nonemptySampleProbes", sample.has("probes") and not sample.probes.is_empty()):
			continue
		for probe in sample.probes:
			var node = named_node(probe.node)
			var label = probe.node + (":" + probe.bone if probe.has("bone") else "")
			if not check("probeNode:" + label, node is Node3D):
				continue
			var transform = node.global_transform
			if probe.has("bone"):
				if not check("probeSkeleton:" + label, node is Skeleton3D):
					continue
				var bone = node.find_bone(probe.bone)
				if not check("probeBone:" + label, bone >= 0):
					continue
				transform = node.global_transform * node.get_bone_global_pose(bone)
			var actual = matrix_rows(transform)
			var error = matrix_error(actual, probe.expected)
			row.maxMatrixError = max(row.maxMatrixError, error)
			row.probes.append({"name": label, "actual": actual, "maxError": error})
			check("nativeMatrix:" + label, error <= configuration.tolerance, error)
			if not baseline.has(label):
				baseline[label] = actual
			else:
				maximum_motion = max(maximum_motion, matrix_error(actual, baseline[label]))
		for probe in sample.get("vertexProbes", []):
			var label = probe.node + ":" + probe.label
			if not vertex_matches.has(label):
				vertex_matches[label] = match_vertex(probe)
			var match = vertex_matches[label]
			if not check("restVertexMatch:" + label, match != null):
				continue
			var actual = skinned_point(match.node, match.arrays, match.surface, match.vertex)
			if not check("skinVertexData:" + label, actual != null):
				continue
			var expected = Vector3(probe.expected[0], probe.expected[1], probe.expected[2])
			var error = actual.distance_to(expected)
			var morph_weights = {}
			for index in range(match.node.get_blend_shape_count()):
				morph_weights[str(match.node.mesh.get_blend_shape_name(index))] = match.node.get_blend_shape_value(index)
			row.vertexProbes.append({"name": label, "actual": [actual.x, actual.y, actual.z],
				"distanceM": error, "restMatchDistanceM": match.restMatchDistance,
				"surface": match.surface, "vertex": match.vertex, "blendShapeWeights": morph_weights})
			check("nativeSkinVertex:" + label, error <= configuration.get("vertexTolerance", 0.00002), error)
		report.samples.append(row)
	report.maximumObservedMatrixChange = maximum_motion
	check("actualMovement", maximum_motion > configuration.get("minimumMovement", 0.001), maximum_motion)
	finish()
