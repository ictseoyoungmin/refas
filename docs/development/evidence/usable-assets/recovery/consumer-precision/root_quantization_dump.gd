extends SceneTree
## Diagnostic only: dump raw consumer values for already-associated skin probes.
## Never substitutes normalized weights or changes the tested GLB/observer.

func vector_array(v):
	return [v.x, v.y, v.z]

func basis_rows(b):
	return [[b.x.x,b.y.x,b.z.x],[b.x.y,b.y.y,b.z.y],[b.x.z,b.y.z,b.z.z]]

func _initialize():
	call_deferred("run")

func run():
	var args = OS.get_cmdline_user_args()
	if args.size() != 3:
		quit(2)
		return
	var config = JSON.parse_string(FileAccess.get_file_as_string(args[0]))
	var observed = JSON.parse_string(FileAccess.get_file_as_string(args[1]))
	var document = GLTFDocument.new()
	var state = GLTFState.new()
	assert(document.append_from_file(config.asset, state) == OK)
	var scene = document.generate_scene(state, config.bakeFps, false, false)
	root.add_child(scene)
	await process_frame
	var all_nodes = [scene] + scene.find_children("*", "", true, false)
	var named = {}
	var player = null
	for node in all_nodes:
		var key = str(node.name)
		if not named.has(key):
			named[key] = []
		named[key].append(node)
		if node is AnimationPlayer and node.has_animation(config.clip):
			assert(player == null)
			player = node
	assert(player != null)
	player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
	player.play(config.clip)
	var output = {"schema":"refas.raw-consumer-weight-diagnostic/v1", "assetSha256":FileAccess.get_sha256(config.asset),
		"configurationSha256":FileAccess.get_sha256(args[0]), "observationsSha256":FileAccess.get_sha256(args[1]),
		"engine":Engine.get_version_info(), "scope":"Unselected garment probe; raw imported values, no precision threshold change", "samples":[]}
	for sample_index in range(config.samples.size()):
		var sample = config.samples[sample_index]
		player.seek(sample.time, true)
		player.advance(0)
		for node in all_nodes:
			if node is Skeleton3D:
				node.force_update_all_bone_transforms()
		var morphs = {}
		var measured = {}
		for point in observed.samples[sample_index].vertexProbes:
			measured[point.name] = point
		var row = {"time":sample.time,"probes":[]}
		for probe in sample.vertexProbes:
			var key = probe.node + ":" + probe.label
			assert(measured.has(key))
			var point = measured[key]
			assert(named.has(probe.node) and named[probe.node].size() == 1)
			var node = named[probe.node][0]
			assert(node is MeshInstance3D and node.skin != null)
			var skeleton = node.get_node_or_null(node.skeleton)
			assert(skeleton is Skeleton3D)
			var surface = int(point.surface)
			var vertex = int(point.vertex)
			var arrays = node.mesh.surface_get_arrays(surface)
			var base = arrays[Mesh.ARRAY_VERTEX][vertex]
			var position = base
			if node.mesh.get_blend_shape_count() > 0:
				if not morphs.has(probe.node):
					morphs[probe.node] = node.bake_mesh_from_current_blend_shape_mix()
				position = morphs[probe.node].surface_get_arrays(surface)[Mesh.ARRAY_VERTEX][vertex]
			var influence_count = int(arrays[Mesh.ARRAY_WEIGHTS].size()/arrays[Mesh.ARRAY_VERTEX].size())
			var influences = []
			var sum_weights = 0.0
			var local_point = Vector3.ZERO
			for influence in range(influence_count):
				var offset = vertex * influence_count + influence
				var weight = arrays[Mesh.ARRAY_WEIGHTS][offset]
				var bind = arrays[Mesh.ARRAY_BONES][offset]
				var bone_name = node.skin.get_bind_name(bind)
				var bone = skeleton.find_bone(bone_name) if not str(bone_name).is_empty() else node.skin.get_bind_bone(bind)
				assert(bone >= 0)
				var term = skeleton.get_bone_global_pose(bone) * node.skin.get_bind_pose(bind) * position
				influences.append({"bone":str(skeleton.get_bone_name(bone)),"bind":bind,"weight":weight,
					"localTerm":vector_array(term)})
				local_point += weight * term
				sum_weights += weight
			row.probes.append({"name":key,"node":probe.node,"surface":surface,"vertex":vertex,
				"basePosition":vector_array(base),"morphPosition":vector_array(position),
				"skeletonBasis":basis_rows(skeleton.global_transform.basis),"skeletonOrigin":vector_array(skeleton.global_position),
				"influences":influences,"weightSum":sum_weights,
				"actual":vector_array(skeleton.global_transform * local_point),"expected":probe.expected,
				"observedDistanceM":point.distanceM})
		output.samples.append(row)
	var file = FileAccess.open(args[2], FileAccess.WRITE)
	assert(file != null)
	file.store_string(JSON.stringify(output,"\t",true)+"\n")
	print(JSON.stringify({"samples":output.samples.size(),"output":args[2]}))
	quit(0)
