extends SceneTree
func _initialize():
	call_deferred("run")
func rows(value):
	return [[value.basis.x.x,value.basis.y.x,value.basis.z.x,value.origin.x],[value.basis.x.y,value.basis.y.y,value.basis.z.y,value.origin.y],[value.basis.x.z,value.basis.y.z,value.basis.z.z,value.origin.z],[0,0,0,1]]
func run():
	var document=GLTFDocument.new()
	var state=GLTFState.new()
	var imported=document.append_from_file("/tmp/refas_review_weighted_skin/asset.glb",state)
	var scene=document.generate_scene(state,30,false,false)
	root.add_child(scene)
	await process_frame
	var player=scene.find_children("*","AnimationPlayer",true,false)[0]
	player.callback_mode_process=AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
	player.play("ReviewBlend");player.seek(1.0/30.0,true);player.advance(0)
	var report=[]
	for node in scene.find_children("*","MeshInstance3D",true,false):
		var skeleton=node.get_node_or_null(node.skeleton)
		skeleton.force_update_all_bone_transforms()
		var arrays=node.mesh.surface_get_arrays(0)
		var vertex=arrays[Mesh.ARRAY_VERTEX][0]
		var weight_sum=0.0
		var result=Vector3.ZERO
		var influence_rows=[]
		for i in range(4):
			var weight=arrays[Mesh.ARRAY_WEIGHTS][i]
			var bind=arrays[Mesh.ARRAY_BONES][i]
			weight_sum+=weight
			if weight==0:continue
			var bone_name=node.skin.get_bind_name(bind)
			var bone=skeleton.find_bone(bone_name) if not str(bone_name).is_empty() else node.skin.get_bind_bone(bind)
			var transformed=skeleton.get_bone_global_pose(bone)*node.skin.get_bind_pose(bind)*vertex
			result+=weight*transformed
			influence_rows.append({"weight":weight,"bind":bind,"bone":str(bone_name),"point":[transformed.x,transformed.y,transformed.z]})
		var raw=skeleton.global_transform*result
		var unskinned=node.global_transform*vertex
		var delta_point=skeleton.global_transform*(result+(1.0-weight_sum)*vertex)
		var normalized=skeleton.global_transform*(result/weight_sum)
		var baked=node.bake_mesh_from_current_skeleton_pose()
		var bakedpoint=node.global_transform*baked.surface_get_arrays(0)[Mesh.ARRAY_VERTEX][0] if baked else null
		report.append({"name":str(node.name),"unskinnedRestWorld":[unskinned.x,unskinned.y,unskinned.z],"deltaFormulaPoint":[delta_point.x,delta_point.y,delta_point.z],"weights":influence_rows,"weightSum":weight_sum,"rawPoint":[raw.x,raw.y,raw.z],"normalizedPoint":[normalized.x,normalized.y,normalized.z],"publicBakedPoint":[bakedpoint.x,bakedpoint.y,bakedpoint.z] if bakedpoint!=null else null,"meshGlobal":rows(node.global_transform),"skeletonGlobal":rows(skeleton.global_transform)})
	var file=FileAccess.open("/tmp/refas_review_skin_weights-diagnosis.json",FileAccess.WRITE)
	file.store_string(JSON.stringify(report,"\t",true))
	print(JSON.stringify(report))
	quit()
