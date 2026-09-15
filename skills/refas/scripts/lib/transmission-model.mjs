import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {validatePhysicalIdentityGraph} from './physical-identity-graph.mjs';
import {
  mechanismArticulationProjection,
  physicalMechanismIdentityProjection,
  validateMechanismGraph,
} from './mechanism-graph.mjs';
import {validateSemanticAuthoritySet} from './semantic-authority.mjs';

export const TRANSMISSION_MODEL_SCHEMA = 'refas.transmission-model/v1';
export const PHYSICAL_TRANSMISSION_IDENTITY_BINDING_SCHEMA = 'refas.physical-transmission-identity-binding/v1';
export const PHYSICAL_TRANSMISSION_IDENTITY_PROJECTION_SCHEMA = 'refas.physical-transmission-identity-projection/v1';
export const TRANSMISSION_MECHANISM_BINDING_SCHEMA = 'refas.transmission-mechanism-binding/v1';
export const TRANSMISSION_MECHANISM_PROJECTION_SCHEMA = 'refas.transmission-mechanism-projection/v1';
export const TRANSMISSION_MAPPING_KINDS = Object.freeze(['IDENTITY','RATIO','LINEAR_MATRIX','NONLINEAR','EXTERNAL_SOLVER']);

const MAPPING_KIND_SET = new Set(TRANSMISSION_MAPPING_KINDS);
const COORDINATE_IDENTITY_KINDS = new Set(['virtual-joint','actuator']);
const CONSTRUCTION_AUTHORITIES = new Set(['observed','inferred','engineered']);
const TOP_LEVEL_KEYS = new Set(['schema','scopeId','sourceSha256','identityGraph','mechanismGraph','articulationGraph','identityBinding','mechanismBinding','transmissions','policy','transmissionDigest']);
const BINDING_KEYS = new Set(['schema','sourceSchema','projectionDigest']);
const TRANSMISSION_KEYS = new Set(['transmissionId','mapsRelationIds','contextMechanismIds','inputSpace','outputSpace','mapping','authoritySubjectId']);
const SPACE_KEYS = new Set(['id','coordinates','order']);
const COORDINATE_KEYS = new Set(['id','semanticIdentityId']);
const MODEL_REF_KEYS = new Set(['schema','id','digest']);

function assertRecord(value,label){if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`${label} must be an object`);return value;}
function assertKnownKeys(value,allowed,label){assertRecord(value,label);const extras=Object.keys(value).filter((key)=>!allowed.has(key));if(extras.length)throw new Error(`${label} contains unsupported field(s): ${extras.sort().join(', ')}`);}
function finite(value,label){if(typeof value!=='number'||!Number.isFinite(value))throw new Error(`${label} must be a finite number`);return Object.is(value,-0)?0:value;}
function normalizedIds(value,label,{nonEmpty=false,sort=true}={}){if(!Array.isArray(value))throw new Error(`${label} must be an array`);if(nonEmpty&&!value.length)throw new Error(`${label} must not be empty`);const ids=value.map((item,index)=>assertId(item,`${label}[${index}]`));if(new Set(ids).size!==ids.length)throw new Error(`${label} must contain unique IDs`);return sort?[...ids].sort():ids;}
function sameSet(left,right){return left.length===right.length&&[...left].sort().every((value,index)=>value===[...right].sort()[index]);}
function validateIdentityGraph(identityGraph){const validation=validatePhysicalIdentityGraph(identityGraph);if(!validation.valid)throw new Error(`identityGraph is invalid: ${validation.errors.join('; ')}`);return identityGraph;}

export function transmissionMappingAuthoritySubjectId(transmissionId){const id=assertId(transmissionId,'transmissionId'),readable=`${id}:transmission-mapping`;if(readable.length<=128)return assertId(readable,'authoritySubjectId');return assertId(`transmission:${digestJson({transmissionId:id,kind:'mapping'}).slice(0,48)}`,'authoritySubjectId');}

function normalizeSpace(raw,label){
  assertKnownKeys(raw,SPACE_KEYS,label);
  const id=assertId(raw.id,`${label}.id`);
  if(!Array.isArray(raw.coordinates)||!raw.coordinates.length)throw new Error(`${label}.coordinates must contain at least one coordinate`);
  const coordinates=raw.coordinates.map((coordinate,index)=>{const coordinateLabel=`${label}.coordinates[${index}]`;assertKnownKeys(coordinate,COORDINATE_KEYS,coordinateLabel);return{id:assertId(coordinate.id,`${coordinateLabel}.id`),semanticIdentityId:assertId(coordinate.semanticIdentityId,`${coordinateLabel}.semanticIdentityId`)};}).sort((a,b)=>a.id.localeCompare(b.id));
  if(new Set(coordinates.map((coordinate)=>coordinate.id)).size!==coordinates.length)throw new Error(`${label}.coordinate IDs must be unique`);
  if(new Set(coordinates.map((coordinate)=>coordinate.semanticIdentityId)).size!==coordinates.length)throw new Error(`${label}.semantic identity IDs must be unique within one coordinate space`);
  const order=normalizedIds(raw.order,`${label}.order`,{nonEmpty:true,sort:false});
  if(!sameSet(order,coordinates.map((coordinate)=>coordinate.id)))throw new Error(`${label}.order must contain every coordinate ID exactly once`);
  return{id,coordinates,order};
}

function normalizeModelRef(raw,label,expectedSchema){assertKnownKeys(raw,MODEL_REF_KEYS,label);if(raw.schema!==expectedSchema)throw new Error(`${label}.schema must be ${expectedSchema}`);return{schema:raw.schema,id:assertId(raw.id,`${label}.id`),digest:assertDigest(raw.digest,`${label}.digest`)};}
function normalizeMatrix(raw,rows,cols,label){if(!Array.isArray(raw)||raw.length!==rows)throw new Error(`${label} must contain exactly ${rows} row(s)`);return raw.map((row,rowIndex)=>{if(!Array.isArray(row)||row.length!==cols)throw new Error(`${label}[${rowIndex}] must contain exactly ${cols} column(s)`);return row.map((value,columnIndex)=>finite(value,`${label}[${rowIndex}][${columnIndex}]`));});}
function normalizeVector(raw,length,label){if(!Array.isArray(raw)||raw.length!==length)throw new Error(`${label} must contain exactly ${length} number(s)`);return raw.map((value,index)=>finite(value,`${label}[${index}]`));}

function normalizeMapping(raw,inputDim,outputDim,label){
  assertRecord(raw,label);const kind=String(raw.kind??'').trim().toUpperCase();if(!MAPPING_KIND_SET.has(kind))throw new Error(`${label}.kind must be one of: ${TRANSMISSION_MAPPING_KINDS.join(', ')}`);
  if(kind==='IDENTITY'){
    assertKnownKeys(raw,new Set(['kind']),label);if(inputDim!==outputDim)throw new Error(`${label} IDENTITY requires equal input/output dimensions`);return{kind};
  }
  if(kind==='RATIO'){
    assertKnownKeys(raw,new Set(['kind','ratio','offset']),label);if(inputDim!==1||outputDim!==1)throw new Error(`${label} RATIO requires scalar input and output spaces`);const ratio=finite(raw.ratio,`${label}.ratio`);if(Math.abs(ratio)<=1e-15)throw new Error(`${label}.ratio must be non-zero`);return{kind,ratio,offset:finite(raw.offset,`${label}.offset`)};
  }
  if(kind==='LINEAR_MATRIX'){
    assertKnownKeys(raw,new Set(['kind','matrix','offset']),label);return{kind,matrix:normalizeMatrix(raw.matrix,outputDim,inputDim,`${label}.matrix`),offset:normalizeVector(raw.offset,outputDim,`${label}.offset`)};
  }
  if(kind==='NONLINEAR'){
    assertKnownKeys(raw,new Set(['kind','positionModelRef','jacobianModelRef']),label);return{kind,positionModelRef:normalizeModelRef(raw.positionModelRef,`${label}.positionModelRef`,'refas.transmission-nonlinear-position/v1'),jacobianModelRef:normalizeModelRef(raw.jacobianModelRef,`${label}.jacobianModelRef`,'refas.transmission-nonlinear-jacobian/v1')};
  }
  assertKnownKeys(raw,new Set(['kind','solverRef']),label);return{kind,solverRef:normalizeModelRef(raw.solverRef,`${label}.solverRef`,'refas.transmission-solver/v1')};
}

function normalizeTransmission(raw,index){
  const label=`transmissions[${index}]`;assertKnownKeys(raw,TRANSMISSION_KEYS,label);
  const transmissionId=assertId(raw.transmissionId,`${label}.transmissionId`),mapsRelationIds=normalizedIds(raw.mapsRelationIds,`${label}.mapsRelationIds`,{nonEmpty:true}),contextMechanismIds=normalizedIds(raw.contextMechanismIds??[],`${label}.contextMechanismIds`);
  const inputSpace=normalizeSpace(raw.inputSpace,`${label}.inputSpace`),outputSpace=normalizeSpace(raw.outputSpace,`${label}.outputSpace`);if(inputSpace.id===outputSpace.id)throw new Error(`${label} inputSpace.id and outputSpace.id must differ`);
  const coordinateIds=[...inputSpace.coordinates,...outputSpace.coordinates].map((coordinate)=>coordinate.id);if(new Set(coordinateIds).size!==coordinateIds.length)throw new Error(`${label} coordinate IDs must be unique across input/output spaces`);
  const mapping=normalizeMapping(raw.mapping,inputSpace.order.length,outputSpace.order.length,`${label}.mapping`);
  const expectedAuthority=transmissionMappingAuthoritySubjectId(transmissionId),authoritySubjectId=raw.authoritySubjectId==null?expectedAuthority:assertId(raw.authoritySubjectId,`${label}.authoritySubjectId`);if(authoritySubjectId!==expectedAuthority)throw new Error(`${label}.authoritySubjectId must be canonical subject ${expectedAuthority}`);
  return{transmissionId,mapsRelationIds,contextMechanismIds,inputSpace,outputSpace,mapping,authoritySubjectId};
}

function normalizeIdentityBinding(raw,label='identityBinding'){assertKnownKeys(raw,BINDING_KEYS,label);if(raw.schema!==PHYSICAL_TRANSMISSION_IDENTITY_BINDING_SCHEMA)throw new Error(`${label}.schema must be ${PHYSICAL_TRANSMISSION_IDENTITY_BINDING_SCHEMA}`);if(raw.sourceSchema!=='refas.physical-identity-graph/v1')throw new Error(`${label}.sourceSchema must be refas.physical-identity-graph/v1`);return{schema:raw.schema,sourceSchema:raw.sourceSchema,projectionDigest:assertDigest(raw.projectionDigest,`${label}.projectionDigest`)};}
function normalizeMechanismBinding(raw,label='mechanismBinding'){if(raw==null)return null;assertKnownKeys(raw,BINDING_KEYS,label);if(raw.schema!==TRANSMISSION_MECHANISM_BINDING_SCHEMA)throw new Error(`${label}.schema must be ${TRANSMISSION_MECHANISM_BINDING_SCHEMA}`);if(raw.sourceSchema!=='refas.mechanism-graph/v1')throw new Error(`${label}.sourceSchema must be refas.mechanism-graph/v1`);return{schema:raw.schema,sourceSchema:raw.sourceSchema,projectionDigest:assertDigest(raw.projectionDigest,`${label}.projectionDigest`)};}

function semanticIdentityIds(transmission){return[...new Set([...transmission.inputSpace.coordinates,...transmission.outputSpace.coordinates].map((coordinate)=>coordinate.semanticIdentityId))].sort();}
export function physicalTransmissionIdentityProjection(identityGraph,transmissions){
  validateIdentityGraph(identityGraph);if(!Array.isArray(transmissions)||!transmissions.length)throw new Error('physical transmission identity projection requires transmission records');
  const entityById=new Map(identityGraph.entities.map((entity)=>[entity.id,entity])),relationById=new Map(identityGraph.relations.map((relation)=>[relation.id,relation]));
  const projected=transmissions.map((transmission)=>{
    const transmissionEntity=entityById.get(transmission.transmissionId);if(!transmissionEntity)throw new Error(`transmission references unknown physical identity: ${transmission.transmissionId}`);if(transmissionEntity.kind!=='transmission')throw new Error(`transmission ${transmission.transmissionId} must bind a P01 transmission identity, found ${transmissionEntity.kind}`);
    const coordinateIds=semanticIdentityIds(transmission),coordinates=coordinateIds.map((id)=>{const entity=entityById.get(id);if(!entity)throw new Error(`transmission ${transmission.transmissionId} references unknown coordinate identity: ${id}`);if(!COORDINATE_IDENTITY_KINDS.has(entity.kind))throw new Error(`transmission coordinate ${id} must reference virtual-joint or actuator, found ${entity.kind}`);return{id:entity.id,kind:entity.kind};});
    const mechanisms=transmission.contextMechanismIds.map((id)=>{const entity=entityById.get(id);if(!entity)throw new Error(`transmission ${transmission.transmissionId} references unknown mechanism context: ${id}`);if(entity.kind!=='mechanism')throw new Error(`transmission mechanism context ${id} must reference mechanism, found ${entity.kind}`);return{id:entity.id,kind:entity.kind};});
    const mapsRelations=transmission.mapsRelationIds.map((relationId)=>{const relation=relationById.get(relationId);if(!relation)throw new Error(`transmission ${transmission.transmissionId} references unknown MAPS relation: ${relationId}`);if(relation.kind!=='MAPS'||relation.sourceId!==transmission.transmissionId)throw new Error(`relation ${relationId} must be MAPS from transmission ${transmission.transmissionId}`);return{id:relation.id,kind:relation.kind,sourceId:relation.sourceId,targetIds:[...relation.targetIds]};}).sort((a,b)=>a.id.localeCompare(b.id));
    const expectedTargets=[...new Set([...coordinateIds,...transmission.contextMechanismIds])].sort(),actualTargets=[...new Set(mapsRelations.flatMap((relation)=>relation.targetIds))].sort();if(digestJson(expectedTargets)!==digestJson(actualTargets))throw new Error(`transmission ${transmission.transmissionId} MAPS targets must equal mapping coordinate identities plus mechanism context`);
    return{transmission:{id:transmissionEntity.id,kind:transmissionEntity.kind},mapsRelations,coordinates,mechanisms};
  }).sort((a,b)=>a.transmission.id.localeCompare(b.transmission.id));
  return deepFreeze({schema:PHYSICAL_TRANSMISSION_IDENTITY_PROJECTION_SCHEMA,scopeId:identityGraph.scopeId,sourceSha256:identityGraph.sourceSha256,transmissions:projected});
}
function identityBindingFor(identityGraph,transmissions){return{schema:PHYSICAL_TRANSMISSION_IDENTITY_BINDING_SCHEMA,sourceSchema:identityGraph.schema,projectionDigest:digestJson(physicalTransmissionIdentityProjection(identityGraph,transmissions))};}

export function transmissionMechanismProjection(mechanismGraph,identityGraph,articulationGraph,mechanismIds){
  const ids=normalizedIds(mechanismIds,'mechanismIds');if(!ids.length)return null;
  const mechanismValidation=validateMechanismGraph(mechanismGraph);if(!mechanismValidation.valid)throw new Error(`mechanismGraph is invalid: ${mechanismValidation.errors.join('; ')}`);
  validateIdentityGraph(identityGraph);assertRecord(articulationGraph,'articulationGraph');
  if(mechanismGraph.scopeId!==identityGraph.scopeId||mechanismGraph.sourceSha256!==identityGraph.sourceSha256)throw new Error('mechanismGraph scope/source does not match identityGraph');
  if(articulationGraph.scopeId!==identityGraph.scopeId||articulationGraph.sourceSha256!==identityGraph.sourceSha256)throw new Error('articulationGraph scope/source does not match identityGraph');
  const mechanismById=new Map(mechanismGraph.mechanisms.map((mechanism)=>[mechanism.mechanismId,mechanism])),mechanisms=ids.map((id)=>{const mechanism=mechanismById.get(id);if(!mechanism)throw new Error(`transmission references mechanism ${id} not present in current mechanism graph`);return structuredClone(mechanism);});
  const jointIds=[...new Set(mechanisms.flatMap((mechanism)=>mechanism.realizedJointIds))].sort();
  return deepFreeze({schema:TRANSMISSION_MECHANISM_PROJECTION_SCHEMA,scopeId:identityGraph.scopeId,sourceSha256:identityGraph.sourceSha256,mechanisms,physicalIdentityProjection:physicalMechanismIdentityProjection(identityGraph,mechanisms),articulationProjection:mechanismArticulationProjection(articulationGraph,jointIds,{identityGraph,mechanisms})});
}
function mechanismBindingFor(mechanismGraph,identityGraph,articulationGraph,mechanismIds){const projection=transmissionMechanismProjection(mechanismGraph,identityGraph,articulationGraph,mechanismIds);return projection?{schema:TRANSMISSION_MECHANISM_BINDING_SCHEMA,sourceSchema:'refas.mechanism-graph/v1',projectionDigest:digestJson(projection)}:null;}

function buildPayload(raw,{identityGraph=null,requireLiveIdentityGraph=false,mechanismGraph=null,articulationGraph=null}={}){
  assertKnownKeys(raw,TOP_LEVEL_KEYS,'transmissionModel');const scopeId=assertId(raw.scopeId,'scopeId'),sourceSha256=assertDigest(raw.sourceSha256,'sourceSha256');if(raw.schema!=null&&raw.schema!==TRANSMISSION_MODEL_SCHEMA)throw new Error(`schema must be ${TRANSMISSION_MODEL_SCHEMA}`);
  if(!Array.isArray(raw.transmissions)||!raw.transmissions.length)throw new Error('transmissions must contain at least one transmission');const transmissions=raw.transmissions.map((transmission,index)=>normalizeTransmission(transmission,index)).sort((a,b)=>a.transmissionId.localeCompare(b.transmissionId));if(new Set(transmissions.map((transmission)=>transmission.transmissionId)).size!==transmissions.length)throw new Error('transmission IDs must be unique');
  let identityBinding;if(identityGraph){validateIdentityGraph(identityGraph);if(identityGraph.scopeId!==scopeId||identityGraph.sourceSha256!==sourceSha256)throw new Error('identityGraph scope/source does not match transmission model');const live=identityBindingFor(identityGraph,transmissions);if(raw.identityBinding!=null&&digestJson(normalizeIdentityBinding(raw.identityBinding))!==digestJson(live))throw new Error('identityBinding does not bind the current transmission-relevant identity projection');identityBinding=live;}else{if(requireLiveIdentityGraph)throw new Error('identityGraph is required to create transmission model');identityBinding=normalizeIdentityBinding(raw.identityBinding);}
  const mechanismIds=[...new Set(transmissions.flatMap((transmission)=>transmission.contextMechanismIds))].sort();let mechanismBinding;if(mechanismIds.length){if(identityGraph&&mechanismGraph&&articulationGraph){const live=mechanismBindingFor(mechanismGraph,identityGraph,articulationGraph,mechanismIds);if(raw.mechanismBinding!=null&&digestJson(normalizeMechanismBinding(raw.mechanismBinding))!==digestJson(live))throw new Error('mechanismBinding does not bind the current referenced mechanism projection');mechanismBinding=live;}else if(requireLiveIdentityGraph)throw new Error('mechanismGraph and articulationGraph are required when transmission mechanism context is declared');else mechanismBinding=normalizeMechanismBinding(raw.mechanismBinding);}else{if(raw.mechanismBinding!=null)throw new Error('mechanismBinding must be null when no mechanism context is declared');mechanismBinding=null;}
  return{schema:TRANSMISSION_MODEL_SCHEMA,scopeId,sourceSha256,identityBinding,mechanismBinding,transmissions,policy:{mechanismAndTransmissionRemainDistinct:true,coordinateAndActuatorCapabilityRemainDistinct:true,vectorOrderIsExplicitSemanticState:true,backendOrderingIsNotSemanticIdentity:true,canonicalDirectionIsInputToOutput:true,velocityUsesJacobian:true,effortUsesJacobianTranspose:true,mechanismStructureDoesNotImplyMapping:true,transmissionMappingDoesNotImplyActuatorLimits:true,nonlinearExecutionRequiresDigestBoundModel:true,externalExecutionRequiresDigestBoundSolver:true,scopedIdentityBinding:true,graphDoesNotAuthorizeClosure:true}};
}

export function createTransmissionModel(input={}){const payload=buildPayload(input,{identityGraph:input.identityGraph??null,requireLiveIdentityGraph:true,mechanismGraph:input.mechanismGraph??null,articulationGraph:input.articulationGraph??null});return deepFreeze({...payload,transmissionDigest:digestJson(payload)});}
export function validateTransmissionModel(value){const errors=[];try{if(value?.schema!==TRANSMISSION_MODEL_SCHEMA)errors.push('invalid schema');const payload=buildPayload(value);const recreated={...payload,transmissionDigest:digestJson(payload)};if(recreated.transmissionDigest!==value?.transmissionDigest)errors.push('transmission model digest mismatch');if(digestJson(recreated)!==digestJson(value))errors.push('transmission model is not canonical');}catch(error){errors.push(error.message);}return{valid:errors.length===0,errors};}
export function validateTransmissionModelBindings(value,identityGraph,{mechanismGraph=null,articulationGraph=null}={}){const errors=[],validation=validateTransmissionModel(value);if(!validation.valid)errors.push(`transmission model invalid: ${validation.errors.join('; ')}`);try{if(!errors.length){const payload=buildPayload({...value,identityGraph,mechanismGraph,articulationGraph},{identityGraph,requireLiveIdentityGraph:true,mechanismGraph,articulationGraph});const recreated={...payload,transmissionDigest:digestJson(payload)};if(recreated.transmissionDigest!==value.transmissionDigest)errors.push('transmission model does not reproduce against current scoped dependencies');}}catch(error){errors.push(error.message);}return{valid:errors.length===0,errors};}
export function validateTransmissionModelAuthority(model,authoritySet){const errors=[],modelValidation=validateTransmissionModel(model),authorityValidation=validateSemanticAuthoritySet(authoritySet);if(!modelValidation.valid)errors.push(`transmission model invalid: ${modelValidation.errors.join('; ')}`);if(!authorityValidation.valid)errors.push(`authority set invalid: ${authorityValidation.errors.join('; ')}`);if(errors.length)return{valid:false,errors,missingSubjectIds:[]};if(authoritySet.scopeId!==model.scopeId||authoritySet.sourceSha256!==model.sourceSha256)errors.push('authority set scope/source does not match transmission model');if(authoritySet.targetSchema!==model.schema||authoritySet.targetDigest!==model.transmissionDigest)errors.push('authority set does not bind exact transmission model');const required=model.transmissions.map((transmission)=>transmission.authoritySubjectId).sort(),entryBySubject=new Map(authoritySet.entries.map((entry)=>[entry.subjectId,entry])),missingSubjectIds=required.filter((subjectId)=>!entryBySubject.has(subjectId));if(missingSubjectIds.length)errors.push(`missing semantic authority for transmission subject(s): ${missingSubjectIds.join(', ')}`);for(const subjectId of required){const entry=entryBySubject.get(subjectId);if(entry&&!CONSTRUCTION_AUTHORITIES.has(entry.authority))errors.push(`transmission subject ${subjectId} requires observed, inferred, or engineered authority`);}const unknownSubjectIds=authoritySet.entries.map((entry)=>entry.subjectId).filter((subjectId)=>!required.includes(subjectId)).sort();if(unknownSubjectIds.length)errors.push(`authority set references subject(s) outside transmission model: ${unknownSubjectIds.join(', ')}`);return{valid:errors.length===0,errors,missingSubjectIds,unknownSubjectIds};}

function orderedCoordinates(space){const byId=new Map(space.coordinates.map((coordinate)=>[coordinate.id,coordinate]));return space.order.map((id)=>byId.get(id));}
function executableAffine(transmission){const inputDim=transmission.inputSpace.order.length,outputDim=transmission.outputSpace.order.length,mapping=transmission.mapping;if(mapping.kind==='IDENTITY')return{matrix:Array.from({length:outputDim},(_,row)=>Array.from({length:inputDim},(_,column)=>row===column?1:0)),offset:Array(outputDim).fill(0)};if(mapping.kind==='RATIO')return{matrix:[[mapping.ratio]],offset:[mapping.offset]};if(mapping.kind==='LINEAR_MATRIX')return{matrix:mapping.matrix,offset:mapping.offset};throw new Error(`${mapping.kind} transmission requires its declared external nonlinear/solver evaluator`);}
function multiplyMatrixVector(matrix,vector){return matrix.map((row)=>row.reduce((sum,value,index)=>sum+value*vector[index],0));}
function transposeMultiply(matrix,vector){const cols=matrix[0]?.length??0;return Array.from({length:cols},(_,column)=>matrix.reduce((sum,row,rowIndex)=>sum+row[column]*vector[rowIndex],0));}

export function evaluateTransmissionMapping(transmission,{position,velocity,outputEffort}={}){
  const normalized=normalizeTransmission(transmission,0),inputDim=normalized.inputSpace.order.length,outputDim=normalized.outputSpace.order.length,qIn=normalizeVector(position,inputDim,'position'),dqIn=normalizeVector(velocity,inputDim,'velocity'),effortOut=normalizeVector(outputEffort,outputDim,'outputEffort'),{matrix,offset}=executableAffine(normalized),outputPosition=multiplyMatrixVector(matrix,qIn).map((value,index)=>value+offset[index]),outputVelocity=multiplyMatrixVector(matrix,dqIn),inputEffort=transposeMultiply(matrix,effortOut);
  return deepFreeze({inputCoordinateOrder:orderedCoordinates(normalized.inputSpace).map((coordinate)=>coordinate.id),outputCoordinateOrder:orderedCoordinates(normalized.outputSpace).map((coordinate)=>coordinate.id),outputPosition,outputVelocity,inputEffort,jacobian:matrix.map((row)=>[...row])});
}
