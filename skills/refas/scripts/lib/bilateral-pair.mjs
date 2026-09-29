import {assertDigest, assertId, deepFreeze, digestBytes, digestJson} from './canonical.mjs';
import {parseGlb} from './glb.mjs';
import {validateRelationalStructure} from './relational-structure.mjs';

export const BILATERAL_PAIR_REALIZATION_SCHEMA = 'refas.bilateral-pair-realization/v1';

const COMPONENT_BYTES = new Map([[5121,1],[5123,2],[5125,4],[5126,4]]);
const TYPE_COMPONENTS = new Map([['SCALAR',1],['VEC2',2],['VEC3',3],['VEC4',4]]);

function strings(values, label, {required = false} = {}) {
  const out = [...new Set((values ?? []).map(String).map((value) => value.trim()).filter(Boolean))].sort();
  if (required && !out.length) throw new Error(`${label} requires at least one reference`);
  return out;
}

function finiteArray(value, length, label, fallback) {
  const raw = value == null ? fallback : value;
  if (!Array.isArray(raw) || raw.length !== length || !raw.every(Number.isFinite)) throw new Error(`${label} must contain ${length} finite numbers`);
  return raw.map((item) => Object.is(item, -0) ? 0 : Number(item));
}

function accessorValues(json, binary, accessorIndex, label, {type = null, componentTypes = null} = {}) {
  if (!Number.isInteger(accessorIndex) || accessorIndex < 0) throw new Error(`${label} accessor index is invalid`);
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor) throw new Error(`${label} accessor is missing`);
  if (accessor.sparse) throw new Error(`${label} sparse accessors are not supported`);
  if (accessor.normalized === true) throw new Error(`${label} normalized accessors are not supported`);
  if (type != null && accessor.type !== type) throw new Error(`${label} must use ${type}`);
  if (componentTypes != null && !componentTypes.has(accessor.componentType)) throw new Error(`${label} component type is invalid`);
  const view = json.bufferViews?.[accessor.bufferView];
  if (!view || view.buffer !== 0) throw new Error(`${label} must use the embedded buffer`);
  const componentBytes = COMPONENT_BYTES.get(accessor.componentType);
  const components = TYPE_COMPONENTS.get(accessor.type);
  if (!componentBytes || !components) throw new Error(`${label} accessor format is unsupported`);
  const elementBytes = componentBytes * components;
  const viewOffset = Number(view.byteOffset ?? 0);
  const viewLength = Number(view.byteLength);
  const accessorOffset = Number(accessor.byteOffset ?? 0);
  if (![viewOffset, viewLength, accessorOffset].every((value) => Number.isInteger(value) && value >= 0)) throw new Error(`${label} accessor/view offsets are invalid`);
  if (viewOffset + viewLength > binary.length) throw new Error(`${label} bufferView exceeds BIN bounds`);
  const stride = Number(view.byteStride ?? elementBytes);
  if (!Number.isInteger(stride) || stride < elementBytes || stride % componentBytes !== 0) throw new Error(`${label} accessor stride is invalid`);
  const count = Number(accessor.count);
  if (!Number.isInteger(count) || count < 1) throw new Error(`${label} accessor count is invalid`);
  const start = viewOffset + accessorOffset;
  const values = [];
  const dv = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  const read = (offset) => {
    if (accessor.componentType === 5121) return dv.getUint8(offset);
    if (accessor.componentType === 5123) return dv.getUint16(offset, true);
    if (accessor.componentType === 5125) return dv.getUint32(offset, true);
    if (accessor.componentType === 5126) {
      const value = dv.getFloat32(offset, true);
      if (!Number.isFinite(value)) throw new Error(`${label} contains non-finite values`);
      return Object.is(value, -0) ? 0 : value;
    }
    throw new Error(`${label} accessor component type is unsupported`);
  };
  for (let index = 0; index < count; index += 1) {
    const base = start + index * stride;
    if (base < viewOffset || base + elementBytes > viewOffset + viewLength || base + elementBytes > binary.length) throw new Error(`${label} accessor exceeds bufferView/BIN bounds`);
    if (components === 1) values.push(read(base));
    else {
      const row = [];
      for (let component = 0; component < components; component += 1) row.push(read(base + component * componentBytes));
      values.push(row);
    }
  }
  return values;
}

function determinant3(matrix) {
  const [a,b,c,d,e,f,g,h,i] = matrix;
  return a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);
}

function nodeTransform(node, label) {
  if (node.matrix != null) {
    const matrix = finiteArray(node.matrix, 16, `${label}.matrix`, null);
    const parityDet = determinant3([
      matrix[0],matrix[4],matrix[8],
      matrix[1],matrix[5],matrix[9],
      matrix[2],matrix[6],matrix[10],
    ]);
    if (Math.abs(parityDet) < 1e-12) throw new Error(`${label} matrix is singular`);
    return {
      mode:'matrix',
      matrix,
      translation:[matrix[12],matrix[13],matrix[14]],
      scale:null,
      parity: parityDet < 0 ? -1 : 1,
      digest:digestJson({matrix}),
    };
  }
  const translation = finiteArray(node.translation, 3, `${label}.translation`, [0,0,0]);
  const rotation = finiteArray(node.rotation, 4, `${label}.rotation`, [0,0,0,1]);
  const scale = finiteArray(node.scale, 3, `${label}.scale`, [1,1,1]);
  const scaleProduct = scale[0]*scale[1]*scale[2];
  if (Math.abs(scaleProduct) < 1e-12) throw new Error(`${label} scale is singular`);
  const payload = {translation,rotation,scale};
  return {mode:'trs',...payload,parity:scaleProduct < 0 ? -1 : 1,digest:digestJson(payload)};
}

function activeSceneNodeIndices(json) {
  const sceneIndex = Number(json.scene ?? 0);
  if (!Number.isInteger(sceneIndex) || sceneIndex < 0 || sceneIndex >= (json.scenes?.length ?? 0)) throw new Error('candidate active scene is invalid');
  const roots = json.scenes[sceneIndex]?.nodes ?? [];
  if (!Array.isArray(roots) || !roots.length) throw new Error('candidate active scene has no nodes');
  const active = new Set(), visiting = new Set();
  const visit = (nodeIndex) => {
    if (!Number.isInteger(nodeIndex) || nodeIndex < 0 || nodeIndex >= (json.nodes?.length ?? 0)) throw new Error('candidate scene references an invalid node');
    if (visiting.has(nodeIndex)) throw new Error('candidate node hierarchy contains a cycle');
    if (active.has(nodeIndex)) return;
    visiting.add(nodeIndex);
    const node = json.nodes[nodeIndex];
    for (const child of node.children ?? []) visit(child);
    visiting.delete(nodeIndex);
    active.add(nodeIndex);
  };
  for (const root of roots) visit(root);
  return active;
}

function partRecord(json, binary, activeNodes, partId) {
  const matches = [...activeNodes].map((index)=>({node:json.nodes[index],index}))
    .filter(({node}) => (node.extras?.refasPartId ?? node.name) === partId);
  if (matches.length !== 1) throw new Error(`active candidate scene must contain exactly one node for bilateral entity ${partId}`);
  const {node,index:nodeIndex} = matches[0];
  if (node.skin != null || node.weights != null) throw new Error(`bilateral entity ${partId} cannot use skin or morph weights in the initial bilateral contract`);
  const mesh = json.meshes?.[node.mesh];
  if (!mesh || (mesh.primitives?.length ?? 0) !== 1) throw new Error(`bilateral entity ${partId} requires exactly one mesh primitive`);
  if (mesh.weights != null) throw new Error(`bilateral entity ${partId} cannot use mesh morph weights in the initial bilateral contract`);
  const primitive = mesh.primitives[0];
  if (primitive.mode != null && primitive.mode !== 4) throw new Error(`bilateral entity ${partId} must use triangle mode`);
  if ((primitive.targets?.length ?? 0) > 0) throw new Error(`bilateral entity ${partId} cannot use morph targets in the initial bilateral contract`);
  if (primitive.attributes?.JOINTS_0 != null || primitive.attributes?.WEIGHTS_0 != null) throw new Error(`bilateral entity ${partId} cannot use skinned vertex attributes in the initial bilateral contract`);
  const positions = accessorValues(json,binary,primitive.attributes?.POSITION,`${partId}.POSITION`,{type:'VEC3',componentTypes:new Set([5126])});
  const indices = accessorValues(json,binary,primitive.indices,`${partId}.indices`,{type:'SCALAR',componentTypes:new Set([5121,5123,5125])});
  if (indices.length % 3 !== 0) throw new Error(`${partId} index count must be divisible by three`);
  if (!indices.every((index)=>Number.isInteger(index)&&index>=0&&index<positions.length)) throw new Error(`${partId} indices must address POSITION vertices`);
  return {
    entityId:partId,
    nodeIndex,
    meshIndex:node.mesh,
    restGeometryDigest:digestJson({positions,indices}),
    constructionExecutionDigest:mesh.extras?.refasConstructionExecution?.executionDigest ?? null,
    constructionPermitDigest:mesh.extras?.refasConstructionExecution?.permitDigest ?? null,
    transform:nodeTransform(node,`node ${partId}`),
  };
}

const AXIS_INDEX=Object.freeze({x:0,y:1,z:2});

function sharedMirrorPlacement(left,right,relation) {
  const axisIndex=AXIS_INDEX[relation.mirrorAxis];
  if(axisIndex==null) throw new Error('bilateral pair mirror axis is invalid');
  const expectedLeftSign=relation.leftHalfSpace==='negative'?-1:1;
  const expectedRightSign=-expectedLeftSign;
  const halfSpan=Number(relation.lateralSpan?.halfSpan);
  const tolerance=Math.max(1e-8,Math.abs(halfSpan)*1e-6);
  const leftCoordinate=left.transform.translation?.[axisIndex];
  const rightCoordinate=right.transform.translation?.[axisIndex];
  if(!Number.isFinite(leftCoordinate)||!Number.isFinite(rightCoordinate)) throw new Error('bilateral pair placement requires finite node translations');
  if(Math.abs(leftCoordinate-expectedLeftSign*halfSpan)>tolerance||Math.abs(rightCoordinate-expectedRightSign*halfSpan)>tolerance) {
    throw new Error('bilateral pair candidate does not realize the declared lateral half-span on the mirror axis');
  }
  if(left.transform.mode!=='trs'||right.transform.mode!=='trs') {
    throw new Error('shared-mirrored bilateral pair requires explicit TRS node transforms so the mirror axis is auditable');
  }
  const leftScale=left.transform.scale,rightScale=right.transform.scale;
  for(let axis=0;axis<3;axis+=1){
    if(Math.abs(Math.abs(leftScale[axis])-Math.abs(rightScale[axis]))>1e-10) {
      throw new Error('shared-mirrored bilateral pair requires matching absolute node scale');
    }
    const leftSign=Math.sign(leftScale[axis]),rightSign=Math.sign(rightScale[axis]);
    if(axis===axisIndex){
      if(leftSign===rightSign) throw new Error('shared-mirrored bilateral pair must flip scale on the declared mirror axis');
    }else if(leftSign!==rightSign){
      throw new Error('shared-mirrored bilateral pair may only flip scale on the declared mirror axis');
    }
  }
  return {
    mirrorAxis:relation.mirrorAxis,
    leftHalfSpace:relation.leftHalfSpace,
    halfSpan,
    tolerance,
    leftCoordinate,
    rightCoordinate,
    leftMirrorScaleSign:Math.sign(leftScale[axisIndex]),
    rightMirrorScaleSign:Math.sign(rightScale[axisIndex]),
  };
}

function bilateralRelation(structure, relationId) {
  const validation = validateRelationalStructure(structure);
  if (!validation.valid) throw new Error(`relational structure is invalid: ${validation.errors.join('; ')}`);
  const id = assertId(relationId,'relationId');
  const relation = structure.relations.find((item)=>item.id===id);
  if (!relation) throw new Error(`unknown bilateral relation: ${id}`);
  if (relation.kind !== 'bilateral-pair') throw new Error(`${id} is not a bilateral-pair relation`);
  return relation;
}

export function createBilateralPairRealization({
  glb,
  relationalStructure,
  relationId,
  cameraExplanation,
  poseEvidence = [],
  evidenceRefs = [],
} = {}) {
  const candidate = Buffer.from(glb ?? []);
  if (!candidate.length) throw new Error('bilateral pair realization requires candidate GLB bytes');
  const {json,binary} = parseGlb(candidate);
  const relation = bilateralRelation(relationalStructure,relationId);
  const activeNodes = activeSceneNodeIndices(json);
  const left = partRecord(json,binary,activeNodes,relation.leftEntityId);
  const right = partRecord(json,binary,activeNodes,relation.rightEntityId);

  const cameraRefs = strings(cameraExplanation?.evidenceRefs,'cameraExplanation.evidenceRefs',{required:true});
  const cameraHypothesisDigest = cameraExplanation?.hypothesisDigest == null ? null : assertDigest(cameraExplanation.hypothesisDigest,'cameraExplanation.hypothesisDigest');
  const poseByEntity = new Map();
  for (const [index,raw] of poseEvidence.entries()) {
    const entityId = assertId(raw?.entityId,`poseEvidence[${index}].entityId`);
    if (poseByEntity.has(entityId)) throw new Error('poseEvidence entity IDs must be unique');
    poseByEntity.set(entityId,{
      entityId,
      explanation:String(raw?.explanation ?? '').trim(),
      evidenceRefs:strings(raw?.evidenceRefs,`poseEvidence[${index}].evidenceRefs`,{required:true}),
    });
  }
  for (const entityId of [relation.leftEntityId,relation.rightEntityId]) {
    const pose = poseByEntity.get(entityId);
    if (!pose || !pose.explanation) throw new Error(`bilateral entity ${entityId} requires pose explanation evidence`);
  }
  if (poseByEntity.size !== 2) throw new Error('poseEvidence must cover exactly the paired entities');

  let mirrorPlacement=null;
  if (relation.restGeometryPolicy === 'shared-mirrored') {
    if (left.restGeometryDigest !== right.restGeometryDigest) throw new Error('bilateral pair uses independent rest geometry under shared-mirrored policy');
    if (left.transform.parity === right.transform.parity) throw new Error('shared-mirrored bilateral pair must realize opposite transform parity across the sagittal plane');
    mirrorPlacement=sharedMirrorPlacement(left,right,relation);
  } else if (relation.restGeometryPolicy === 'observed-intrinsic-asymmetry') {
    const axisIndex=AXIS_INDEX[relation.mirrorAxis];
    const expectedLeftSign=relation.leftHalfSpace==='negative'?-1:1;
    const halfSpan=Number(relation.lateralSpan?.halfSpan),tolerance=Math.max(1e-8,Math.abs(halfSpan)*1e-6);
    const leftCoordinate=left.transform.translation?.[axisIndex],rightCoordinate=right.transform.translation?.[axisIndex];
    if(Math.abs(leftCoordinate-expectedLeftSign*halfSpan)>tolerance||Math.abs(rightCoordinate+expectedLeftSign*halfSpan)>tolerance) {
      throw new Error('intrinsic bilateral pair candidate does not realize the declared lateral half-span on the mirror axis');
    }
    if (relation.intrinsicAsymmetry?.authority !== 'observed' || !(relation.intrinsicAsymmetry?.evidenceRefs?.length > 0)) {
      throw new Error('intrinsic bilateral rest asymmetry lacks observed source evidence');
    }
  } else {
    throw new Error('unsupported bilateral rest geometry policy');
  }

  const instances = [left,right].map((part)=>({
    entityId:part.entityId,
    side:part.entityId===relation.leftEntityId?'left':'right',
    restGeometryDigest:part.restGeometryDigest,
    constructionExecutionDigest:part.constructionExecutionDigest,
    constructionPermitDigest:part.constructionPermitDigest,
    transformDigest:part.transform.digest,
    transformParity:part.transform.parity,
    mirrorAxisCoordinate:part.transform.translation[AXIS_INDEX[relation.mirrorAxis]],
    mirrorAxisScaleSign:part.transform.scale==null?null:Math.sign(part.transform.scale[AXIS_INDEX[relation.mirrorAxis]]),
    poseExplanation:poseByEntity.get(part.entityId),
  }));
  const payload = {
    schema:BILATERAL_PAIR_REALIZATION_SCHEMA,
    scopeId:relationalStructure.scopeId,
    sourceSha256:relationalStructure.sourceSha256,
    candidateSha256:digestBytes(candidate),
    relationalStructureDigest:relationalStructure.structureDigest,
    relationId:relation.id,
    relationDigest:digestJson(relation),
    sagittalPlaneId:relation.sagittalPlaneId,
    mirrorAxis:relation.mirrorAxis,
    leftHalfSpace:relation.leftHalfSpace,
    restGeometryPolicy:relation.restGeometryPolicy,
    lateralSpan:structuredClone(relation.lateralSpan),
    intrinsicAsymmetry:relation.intrinsicAsymmetry==null?null:structuredClone(relation.intrinsicAsymmetry),
    mirrorPlacement,
    cameraExplanation:{hypothesisDigest:cameraHypothesisDigest,evidenceRefs:cameraRefs},
    instances,
    evidenceRefs:strings(evidenceRefs,'evidenceRefs',{required:true}),
    policy:{
      pairRestGeometryComesFromCandidateBytes:true,
      sharedPairUsesOneRestGeometry:true,
      sharedPairRequiresMirrorParity:true,
      sharedPairMirrorAxisIsExplicit:true,
      declaredLateralSpanIsRealized:true,
      visibleAsymmetryRequiresCameraAndPoseExplanation:true,
      intrinsicAsymmetryRequiresObservedSourceEvidence:true,
      imagePlaneSeparationCannotAuthorizeLateralSpan:true,
    },
  };
  return deepFreeze({...payload,realizationDigest:digestJson(payload)});
}

export function validateBilateralPairRealizationRecord(value,{relationalStructure,candidateAssetSha256=null}={}) {
  const errors=[];
  try {
    if (value?.schema!==BILATERAL_PAIR_REALIZATION_SCHEMA) errors.push('invalid bilateral pair realization schema');
    const structureValidation=validateRelationalStructure(relationalStructure);
    if(!structureValidation.valid) throw new Error(`relational structure is invalid: ${structureValidation.errors.join('; ')}`);
    const candidate=assertDigest(candidateAssetSha256??value?.candidateSha256,'candidateSha256');
    if(value?.candidateSha256!==candidate) errors.push('bilateral realization does not bind the expected candidate');
    if(value?.scopeId!==relationalStructure.scopeId||value?.sourceSha256!==relationalStructure.sourceSha256||value?.relationalStructureDigest!==relationalStructure.structureDigest) {
      errors.push('bilateral realization does not bind the exact relational structure');
    }
    const relation=bilateralRelation(relationalStructure,value?.relationId);
    if(value?.relationDigest!==digestJson(relation)) errors.push('bilateral realization relation digest mismatch');
    if(value?.sagittalPlaneId!==relation.sagittalPlaneId) errors.push('bilateral realization sagittal plane mismatch');
    if(value?.mirrorAxis!==relation.mirrorAxis) errors.push('bilateral realization mirror axis mismatch');
    if(value?.leftHalfSpace!==relation.leftHalfSpace) errors.push('bilateral realization left half-space mismatch');
    if(value?.restGeometryPolicy!==relation.restGeometryPolicy) errors.push('bilateral realization rest policy mismatch');
    if(digestJson(value?.lateralSpan)!==digestJson(relation.lateralSpan)) errors.push('bilateral realization lateral span mismatch');
    if(digestJson(value?.intrinsicAsymmetry??null)!==digestJson(relation.intrinsicAsymmetry??null)) errors.push('bilateral realization intrinsic asymmetry mismatch');

    const cameraRefs=strings(value?.cameraExplanation?.evidenceRefs,'cameraExplanation.evidenceRefs',{required:true});
    const cameraHypothesisDigest=value?.cameraExplanation?.hypothesisDigest==null?null:assertDigest(value.cameraExplanation.hypothesisDigest,'cameraExplanation.hypothesisDigest');
    const rawInstances=Array.isArray(value?.instances)?value.instances:[];
    if(rawInstances.length!==2) throw new Error('bilateral realization requires exactly two instances');
    const expectedIds=[relation.leftEntityId,relation.rightEntityId];
    const instances=rawInstances.map((instance,index)=>{
      const entityId=assertId(instance?.entityId,`instances[${index}].entityId`);
      if(entityId!==expectedIds[index]) throw new Error('bilateral realization instances must be canonical left/right order');
      const side=index===0?'left':'right';
      if(instance?.side!==side) throw new Error(`bilateral instance ${entityId} side is invalid`);
      const restGeometryDigest=assertDigest(instance?.restGeometryDigest,`instances[${index}].restGeometryDigest`);
      const constructionExecutionDigest=instance?.constructionExecutionDigest==null?null:assertDigest(instance.constructionExecutionDigest,`instances[${index}].constructionExecutionDigest`);
      const constructionPermitDigest=instance?.constructionPermitDigest==null?null:assertDigest(instance.constructionPermitDigest,`instances[${index}].constructionPermitDigest`);
      const transformDigest=assertDigest(instance?.transformDigest,`instances[${index}].transformDigest`);
      if(![-1,1].includes(instance?.transformParity)) throw new Error(`instances[${index}].transformParity is invalid`);
      const mirrorAxisCoordinate=Number(instance?.mirrorAxisCoordinate);
      if(!Number.isFinite(mirrorAxisCoordinate)) throw new Error(`instances[${index}].mirrorAxisCoordinate must be finite`);
      const mirrorAxisScaleSign=instance?.mirrorAxisScaleSign==null?null:Number(instance.mirrorAxisScaleSign);
      if(mirrorAxisScaleSign!=null&&![-1,1].includes(mirrorAxisScaleSign)) throw new Error(`instances[${index}].mirrorAxisScaleSign is invalid`);
      const explanation=String(instance?.poseExplanation?.explanation??'').trim();
      if(!explanation) throw new Error(`instances[${index}] requires pose explanation`);
      if(instance?.poseExplanation?.entityId!==entityId) throw new Error(`instances[${index}] pose explanation entity mismatch`);
      const evidenceRefs=strings(instance?.poseExplanation?.evidenceRefs,`instances[${index}].poseExplanation.evidenceRefs`,{required:true});
      return {entityId,side,restGeometryDigest,constructionExecutionDigest,constructionPermitDigest,transformDigest,transformParity:instance.transformParity,mirrorAxisCoordinate,mirrorAxisScaleSign,poseExplanation:{entityId,explanation,evidenceRefs}};
    });
    let mirrorPlacement=null;
    const expectedLeftSign=relation.leftHalfSpace==='negative'?-1:1;
    const halfSpan=Number(relation.lateralSpan.halfSpan),tolerance=Math.max(1e-8,Math.abs(halfSpan)*1e-6);
    const leftCoordinate=instances[0].mirrorAxisCoordinate,rightCoordinate=instances[1].mirrorAxisCoordinate;
    if(Math.abs(leftCoordinate-expectedLeftSign*halfSpan)>tolerance||Math.abs(rightCoordinate+expectedLeftSign*halfSpan)>tolerance) {
      errors.push('bilateral realization does not reproduce the declared lateral half-span');
    }
    if(relation.restGeometryPolicy==='shared-mirrored'){
      if(instances[0].restGeometryDigest!==instances[1].restGeometryDigest) errors.push('bilateral pair uses independent rest geometry under shared-mirrored policy');
      if(instances[0].transformParity===instances[1].transformParity) errors.push('shared-mirrored bilateral pair must realize opposite transform parity across the sagittal plane');
      if(instances.some((instance)=>instance.mirrorAxisScaleSign==null)) errors.push('shared-mirrored bilateral realization requires auditable mirror-axis scale signs');
      else if(instances[0].mirrorAxisScaleSign===instances[1].mirrorAxisScaleSign) errors.push('shared-mirrored bilateral realization does not flip the declared mirror axis');
      mirrorPlacement={mirrorAxis:relation.mirrorAxis,leftHalfSpace:relation.leftHalfSpace,halfSpan,tolerance,leftCoordinate,rightCoordinate,leftMirrorScaleSign:instances[0].mirrorAxisScaleSign,rightMirrorScaleSign:instances[1].mirrorAxisScaleSign};
    }else if(relation.restGeometryPolicy==='observed-intrinsic-asymmetry'){
      if(relation.intrinsicAsymmetry?.authority!=='observed'||!(relation.intrinsicAsymmetry?.evidenceRefs?.length>0)) errors.push('intrinsic bilateral rest asymmetry lacks observed source evidence');
    }
    const evidenceRefs=strings(value?.evidenceRefs,'evidenceRefs',{required:true});
    const policy={
      pairRestGeometryComesFromCandidateBytes:true,
      sharedPairUsesOneRestGeometry:true,
      sharedPairRequiresMirrorParity:true,
      sharedPairMirrorAxisIsExplicit:true,
      declaredLateralSpanIsRealized:true,
      visibleAsymmetryRequiresCameraAndPoseExplanation:true,
      intrinsicAsymmetryRequiresObservedSourceEvidence:true,
      imagePlaneSeparationCannotAuthorizeLateralSpan:true,
    };
    for(const [key,expected] of Object.entries(policy)) if(value?.policy?.[key]!==expected) errors.push(`bilateral realization policy is invalid: ${key}`);
    const canonicalPayload={
      schema:BILATERAL_PAIR_REALIZATION_SCHEMA,
      scopeId:relationalStructure.scopeId,
      sourceSha256:relationalStructure.sourceSha256,
      candidateSha256:candidate,
      relationalStructureDigest:relationalStructure.structureDigest,
      relationId:relation.id,
      relationDigest:digestJson(relation),
      sagittalPlaneId:relation.sagittalPlaneId,
      mirrorAxis:relation.mirrorAxis,
      leftHalfSpace:relation.leftHalfSpace,
      restGeometryPolicy:relation.restGeometryPolicy,
      lateralSpan:structuredClone(relation.lateralSpan),
      intrinsicAsymmetry:relation.intrinsicAsymmetry==null?null:structuredClone(relation.intrinsicAsymmetry),
      mirrorPlacement,
      cameraExplanation:{hypothesisDigest:cameraHypothesisDigest,evidenceRefs:cameraRefs},
      instances,
      evidenceRefs,
      policy,
    };
    if(value?.realizationDigest!==digestJson(canonicalPayload)) errors.push('bilateral pair realization digest mismatch');
    const suppliedPayload=structuredClone(value);delete suppliedPayload.realizationDigest;
    if(digestJson(canonicalPayload)!==digestJson(suppliedPayload)) errors.push('bilateral pair realization is not canonical');
  }catch(error){errors.push(error.message);}
  return {valid:errors.length===0,errors};
}

export function validateBilateralPairRealization(value,{glb,relationalStructure}={}) {
  const errors=[];
  try {
    const candidate=Buffer.from(glb??[]);
    if(!candidate.length) throw new Error('bilateral pair validation requires exact candidate GLB bytes');
    const recordValidation=validateBilateralPairRealizationRecord(value,{relationalStructure,candidateAssetSha256:digestBytes(candidate)});
    if(!recordValidation.valid) errors.push(...recordValidation.errors);
    const recreated=createBilateralPairRealization({
      glb:candidate,
      relationalStructure,
      relationId:value?.relationId,
      cameraExplanation:value?.cameraExplanation,
      poseEvidence:(value?.instances??[]).map((instance)=>({
        entityId:instance.entityId,
        explanation:instance.poseExplanation?.explanation,
        evidenceRefs:instance.poseExplanation?.evidenceRefs,
      })),
      evidenceRefs:value?.evidenceRefs,
    });
    if(recreated.realizationDigest!==value?.realizationDigest) errors.push('bilateral pair realization does not reproduce from exact candidate bytes');
    if(digestJson(recreated)!==digestJson(value)) errors.push('bilateral pair realization is not canonical');
  }catch(error){errors.push(error.message);}
  return {valid:[...new Set(errors)].length===0,errors:[...new Set(errors)]};
}
