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

function accessorValues(json, binary, accessorIndex, label) {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor) throw new Error(`${label} accessor is missing`);
  if (accessor.sparse) throw new Error(`${label} sparse accessors are not supported`);
  const view = json.bufferViews?.[accessor.bufferView];
  if (!view || view.buffer !== 0) throw new Error(`${label} must use the embedded buffer`);
  const componentBytes = COMPONENT_BYTES.get(accessor.componentType);
  const components = TYPE_COMPONENTS.get(accessor.type);
  if (!componentBytes || !components) throw new Error(`${label} accessor format is unsupported`);
  const elementBytes = componentBytes * components;
  const stride = Number(view.byteStride ?? elementBytes);
  if (!Number.isInteger(stride) || stride < elementBytes) throw new Error(`${label} accessor stride is invalid`);
  const count = Number(accessor.count);
  if (!Number.isInteger(count) || count < 1) throw new Error(`${label} accessor count is invalid`);
  const start = Number(view.byteOffset ?? 0) + Number(accessor.byteOffset ?? 0);
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
    if (base < 0 || base + elementBytes > binary.length) throw new Error(`${label} accessor exceeds BIN bounds`);
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

function partRecord(json, binary, partId) {
  const matches = (json.nodes ?? []).map((node,index)=>({node,index})).filter(({node}) => (node.extras?.refasPartId ?? node.name) === partId);
  if (matches.length !== 1) throw new Error(`candidate must contain exactly one node for bilateral entity ${partId}`);
  const {node,index:nodeIndex} = matches[0];
  const mesh = json.meshes?.[node.mesh];
  if (!mesh || (mesh.primitives?.length ?? 0) !== 1) throw new Error(`bilateral entity ${partId} requires exactly one mesh primitive`);
  const primitive = mesh.primitives[0];
  if (primitive.mode != null && primitive.mode !== 4) throw new Error(`bilateral entity ${partId} must use triangle mode`);
  const positions = accessorValues(json,binary,primitive.attributes?.POSITION,`${partId}.POSITION`);
  const indices = accessorValues(json,binary,primitive.indices,`${partId}.indices`);
  if (!positions.every((point)=>Array.isArray(point)&&point.length===3)) throw new Error(`${partId} POSITION must be VEC3`);
  if (!indices.every(Number.isInteger)) throw new Error(`${partId} indices must be integer SCALAR`);
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
  const left = partRecord(json,binary,relation.leftEntityId);
  const right = partRecord(json,binary,relation.rightEntityId);

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

  if (relation.restGeometryPolicy === 'shared-mirrored') {
    if (left.restGeometryDigest !== right.restGeometryDigest) throw new Error('bilateral pair uses independent rest geometry under shared-mirrored policy');
    if (left.transform.parity === right.transform.parity) throw new Error('shared-mirrored bilateral pair must realize opposite transform parity across the sagittal plane');
  } else if (relation.restGeometryPolicy === 'observed-intrinsic-asymmetry') {
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
    restGeometryPolicy:relation.restGeometryPolicy,
    lateralSpan:structuredClone(relation.lateralSpan),
    intrinsicAsymmetry:relation.intrinsicAsymmetry==null?null:structuredClone(relation.intrinsicAsymmetry),
    cameraExplanation:{hypothesisDigest:cameraHypothesisDigest,evidenceRefs:cameraRefs},
    instances,
    evidenceRefs:strings(evidenceRefs,'evidenceRefs',{required:true}),
    policy:{
      pairRestGeometryComesFromCandidateBytes:true,
      sharedPairUsesOneRestGeometry:true,
      sharedPairRequiresMirrorParity:true,
      visibleAsymmetryRequiresCameraAndPoseExplanation:true,
      intrinsicAsymmetryRequiresObservedSourceEvidence:true,
      imagePlaneSeparationCannotAuthorizeLateralSpan:true,
    },
  };
  return deepFreeze({...payload,realizationDigest:digestJson(payload)});
}

export function validateBilateralPairRealization(value,{glb,relationalStructure}={}) {
  const errors=[];
  try {
    if (value?.schema!==BILATERAL_PAIR_REALIZATION_SCHEMA) errors.push('invalid bilateral pair realization schema');
    const recreated=createBilateralPairRealization({
      glb,
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
    if (recreated.realizationDigest!==value?.realizationDigest) errors.push('bilateral pair realization digest mismatch');
    if (digestJson(recreated)!==digestJson(value)) errors.push('bilateral pair realization is not canonical');
  } catch(error) {
    errors.push(error.message);
  }
  return {valid:errors.length===0,errors};
}
