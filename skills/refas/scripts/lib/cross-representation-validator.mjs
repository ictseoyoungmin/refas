import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {createCanonicalExportView, validateBackendExportBindings} from './backend-export.mjs';
import {validateRepresentationCapacityBindings} from './representation-capacity.mjs';
import {canonicalizeBackendRigidTransform, validateNormalizedRepresentationBindings} from './representation-normalizer.mjs';

export const CROSS_REPRESENTATION_VALIDATION_SCHEMA = 'refas.cross-representation-validation/v1';
export const CROSS_REPRESENTATION_OUTCOMES = Object.freeze(['EQUIVALENT', 'LOSSY', 'DRIFT', 'UNRESOLVED', 'INVALID']);

const OUTCOME_SET = new Set(CROSS_REPRESENTATION_OUTCOMES);
const EXPORT_DISPOSITION_SET = new Set(['EMITTED_EXACT', 'EMITTED_APPROXIMATION', 'OMITTED_UNSUPPORTED']);
const TOP_LEVEL_KEYS = new Set(['schema','validationId','scopeId','canonicalBinding','capacityBinding','representationBinding','findings','summary','policy','validationDigest']);
const CANONICAL_BINDING_KEYS = new Set(['canonicalViewDigest','bundleDigest','rootClosureDigest','rootModuleId','identityProjectionDigest']);
const CAPACITY_BINDING_KEYS = new Set(['profileId','backend','capacityDigest']);
const REPRESENTATION_BINDING_KEYS = new Set(['normalizationId','normalizationDigest','semanticDigest','exportId','exportDigest','normalizerImplementationDigest']);
const FINDING_KEYS = new Set(['findingId','obligationId','semanticPath','subjectIds','ownerCapability','outcome','exportDisposition','reasonCode','summary','canonicalValue','normalizedValue','loss']);
const LOSS_KEYS = new Set(['kind','reason','strategy','retainedSemantics','lossSemantics']);
const SUMMARY_KEYS = new Set(['total','equivalent','lossy','drift','unresolved','invalid']);
const POLICY_KEYS = new Set(['canonicalStateRemainsAuthoritative','normalizedRepresentationIsEvidenceOnly','p11ObligationIdentityIsComparisonIdentity','p13ReplayRequiredBeforeComparison','oneTypedOutcomePerObligation','declaredRepresentationLossStaysExplicit','aggregateScoresCannotOverrideFindings','declaredDivergenceRequiresDownstreamContract','validationDoesNotAuthorizePhysicalClaims']);
const CANONICAL_POLICY = Object.freeze({canonicalStateRemainsAuthoritative:true,normalizedRepresentationIsEvidenceOnly:true,p11ObligationIdentityIsComparisonIdentity:true,p13ReplayRequiredBeforeComparison:true,oneTypedOutcomePerObligation:true,declaredRepresentationLossStaysExplicit:true,aggregateScoresCannotOverrideFindings:true,declaredDivergenceRequiresDownstreamContract:true,validationDoesNotAuthorizePhysicalClaims:true});
const CONTROL_RE = /[\u0000-\u001f\u007f]/u;

const STRING_SEMANTIC_PATHS = new Set([
  'collision.self-policy',
  'mechanism.kind',
  'actuation.kind',
  'actuation.coordinate-class',
  'control.coordinate-class',
  'runtime.coordinate-class',
]);
const NULLABLE_STRING_SEMANTIC_PATHS = new Set(['control.mode']);
const RECORD_SEMANTIC_PATHS = new Set([
  'identity.entity',
  'composition.interface',
  'identity.relation',
  'composition.contains',
  'collision.geometry',
  'collision.filter',
  'articulation.topology',
  'articulation.reference-configuration',
  'articulation.joint-limit',
  'mechanism.topology',
  'transmission.coordinate-space',
  'transmission.coordinate-map',
  'transmission.velocity-map',
  'transmission.effort-map',
  'transmission.external-implementation',
  'control.command-space',
  'runtime.endpoint',
  'runtime.locator',
  'runtime.calibration',
]);
const NULLABLE_RECORD_SEMANTIC_PATHS = new Set([
  'actuation.position-range',
  'actuation.velocity-limit',
  'actuation.effort-limit',
  'actuation.stiffness',
  'actuation.damping',
  'actuation.armature',
  'actuation.response-latency',
  'control.gains',
  'control.delay',
  'runtime.transport-delay',
]);
const STRING_SET_SEMANTIC_PATHS = new Set(['compatibility.family']);
const NULLABLE_STRING_SET_SEMANTIC_PATHS = new Set(['actuation.control-modes']);

function assertRecord(value,label){if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`${label} must be an object`);return value;}
function assertKnownKeys(value,allowed,label){assertRecord(value,label);const extras=Object.keys(value).filter((key)=>!allowed.has(key));if(extras.length)throw new Error(`${label} contains unsupported field(s): ${extras.sort().join(', ')}`);}
function text(value,label,{maxLength=2048}={}){if(typeof value!=='string'||!value.length||value.trim()!==value||value.length>maxLength)throw new Error(`${label} must be a trimmed non-empty string up to ${maxLength} characters`);if(CONTROL_RE.test(value))throw new Error(`${label} must not contain control characters`);return value;}
function idArray(value,label){if(!Array.isArray(value)||!value.length)throw new Error(`${label} must be a non-empty array`);const ids=value.map((item,index)=>assertId(item,`${label}[${index}]`)).sort();if(new Set(ids).size!==ids.length)throw new Error(`${label} must contain unique IDs`);return ids;}
function cloneJson(value,label){try{return structuredClone(value);}catch{throw new Error(`${label} must be structured-cloneable`);}}
function sameJson(left,right){return digestJson(left)===digestJson(right);}
function isRecord(value){return Boolean(value)&&typeof value==='object'&&!Array.isArray(value);}
function isFiniteNumber(value){return typeof value==='number'&&Number.isFinite(value);}
function isFiniteVector(value,length){return Array.isArray(value)&&value.length===length&&value.every(isFiniteNumber);}
function isFiniteMatrix(value,size){return Array.isArray(value)&&value.length===size&&value.every((row)=>isFiniteVector(row,size));}
function isCanonicalJson(value){if(value===null||typeof value==='string'||typeof value==='boolean')return true;if(isFiniteNumber(value))return true;if(Array.isArray(value))return value.every(isCanonicalJson);if(!isRecord(value))return false;return Object.values(value).every(isCanonicalJson);}
function isStringSet(value){return Array.isArray(value)&&value.every((item)=>typeof item==='string'&&item.length>0&&item.trim()===item&&!CONTROL_RE.test(item))&&new Set(value).size===value.length;}
function isRigidTransform(value){if(!isRecord(value))return false;const keys=Object.keys(value);if(!keys.includes('translation_m')||!keys.includes('rotation_quat_xyzw')||keys.some((key)=>!['parentId','translation_m','rotation_quat_xyzw'].includes(key)))return false;if(value.parentId!=null&&(typeof value.parentId!=='string'||!value.parentId.length))return false;return isFiniteVector(value.translation_m,3)&&isFiniteVector(value.rotation_quat_xyzw,4);}
function isJointFrameRecord(value){return isRecord(value)&&isRigidTransform(value.parentJointFrame)&&isRigidTransform(value.childJointFrame);}

function canonicalizeSemanticValue(value,label='value'){
  if(value==null||typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number'){if(!Number.isFinite(value))throw new Error(`${label} must be finite`);return Object.is(value,-0)?0:value;}
  if(Array.isArray(value))return value.map((item,index)=>canonicalizeSemanticValue(item,`${label}[${index}]`));
  if(typeof value!=='object')throw new Error(`${label} must be canonical JSON-compatible data`);
  const keys=Object.keys(value), transform=keys.includes('translation_m')&&keys.includes('rotation_quat_xyzw')&&keys.every((key)=>['parentId','translation_m','rotation_quat_xyzw'].includes(key));
  if(transform){const normalized=canonicalizeBackendRigidTransform({translation_m:value.translation_m,rotation_quat_xyzw:value.rotation_quat_xyzw},label);return value.parentId==null?normalized:{parentId:assertId(value.parentId,`${label}.parentId`),...normalized};}
  const result={};for(const key of keys.sort())result[key]=canonicalizeSemanticValue(value[key],`${label}.${key}`);return result;
}

function componentForObligation(document,obligation){if(obligation.source?.kind!=='COMPONENT')return null;const component=(document.components??[]).find((item)=>item.componentId===obligation.source.componentId);if(!component)throw new Error(`canonical view is missing component ${obligation.source.componentId}`);if(component.schema!==obligation.source.schema||component.digest!==obligation.source.digest)throw new Error(`canonical component ${component.componentId} does not match P11 source binding`);return component;}
function entityForSubjects(document,subjectIds){const byId=new Map((document.identityProjection?.entities??[]).map((entity)=>[entity.id,entity]));for(const id of subjectIds)if(byId.has(id))return byId.get(id);throw new Error(`canonical view has no identity entity for subjects ${subjectIds.join(', ')}`);}
function relationForSubjects(document,subjectIds){const byId=new Map((document.identityProjection?.relations??[]).map((relation)=>[relation.id,relation]));for(const id of subjectIds)if(byId.has(id))return byId.get(id);throw new Error(`canonical view has no identity relation for subjects ${subjectIds.join(', ')}`);}
function recordBySubject(records,idKey,subjectIds,label){for(const id of subjectIds){const record=(records??[]).find((item)=>item?.[idKey]===id);if(record)return record;}throw new Error(`canonical view has no ${label} for subjects ${subjectIds.join(', ')}`);}
function colliderBySubjects(contract,subjectIds){for(const link of contract.links??[])for(const collider of link.colliders??[])if(subjectIds.includes(collider.id))return{link,collider};throw new Error(`canonical view has no collider for subjects ${subjectIds.join(', ')}`);}
function componentDependency(component,kind,predicate,label){const matches=(component.dependencies??[]).filter((dependency)=>dependency.kind===kind&&predicate(dependency.contract));if(matches.length!==1)throw new Error(`canonical view requires exactly one ${label}; found ${matches.length}`);return matches[0].contract;}
function canonicalValueForObligation(document,obligation){
  const path=obligation.semanticPath,subjects=obligation.subjectIds;
  if(obligation.source.kind==='IDENTITY'){
    if(path==='identity.entity'){const entity=entityForSubjects(document,subjects);return{id:entity.id,kind:entity.kind};}
    if(path==='frame.transform'){const entity=entityForSubjects(document,subjects);if(!entity.frame)throw new Error(`identity ${entity.id} has no frame`);return entity.frame;}
    if(path==='composition.interface'){const entity=entityForSubjects(document,subjects);return{id:entity.id,kind:entity.kind};}
    if(path==='compatibility.family')return[...(entityForSubjects(document,subjects).compatibilityFamilyIds??[])].sort();
    if(path==='identity.relation'||path==='composition.contains')return relationForSubjects(document,subjects);
    throw new Error(`P14 does not support identity semantic path ${path}`);
  }
  const component=componentForObligation(document,obligation),contract=component.contract;
  if(path.startsWith('dynamics.')){const link=recordBySubject(contract.links,'linkId',subjects,'dynamics link');if(path==='dynamics.mass')return link.mass?.value_kg??null;if(path==='dynamics.center-of-mass')return link.centerOfMass?.value_m??null;if(path==='dynamics.inertia')return link.inertia?.tensor_kg_m2??null;}
  if(path.startsWith('collision.')){if(path==='collision.self-policy')return recordBySubject(contract.links,'linkId',subjects,'collision link').selfCollisionPolicy;const{collider}=colliderBySubjects(contract,subjects);if(path==='collision.frame')return collider.frame;if(path==='collision.geometry')return collider.geometry;if(path==='collision.filter')return collider.filter;}
  if(path.startsWith('articulation.')){
    if(path==='articulation.topology'&&subjects.length===1&&subjects.includes(contract.rootLinkId))return{topology:contract.topology,rootLinkId:contract.rootLinkId};
    const joint=recordBySubject(contract.joints,'virtualJointId',subjects,'articulation joint');
    if(path==='articulation.topology')return{virtualJointId:joint.virtualJointId,parentLinkId:joint.parentLinkId,childLinkId:joint.childLinkId};
    if(path==='articulation.joint-frame')return{parentJointFrame:joint.parentJointFrame,childJointFrame:joint.childJointFrame};
    if(path==='articulation.reference-configuration')return{referenceAngle:joint.referenceAngle,referenceChildFrameInParent:joint.referenceChildFrameInParent};
    if(path==='articulation.joint-limit'){const typed=componentDependency(component,'ARTICULATED_JOINT',(candidate)=>candidate.id===joint.virtualJointId,`typed joint dependency ${joint.virtualJointId}`);return{jointType:typed.jointType,axisConvention:typed.axisConvention,limits:typed.limits};}
  }
  if(path.startsWith('mechanism.')){const mechanism=recordBySubject(contract.mechanisms,'mechanismId',subjects,'mechanism');if(path==='mechanism.kind')return mechanism.kind;if(path==='mechanism.topology')return{mechanismId:mechanism.mechanismId,realizesRelationIds:mechanism.realizesRelationIds,realizedJointIds:mechanism.realizedJointIds,members:mechanism.members,edges:mechanism.edges};}
  if(path.startsWith('transmission.')){
    const transmission=recordBySubject(contract.transmissions,'transmissionId',subjects,'transmission');
    if(path==='transmission.coordinate-space')return{inputSpace:transmission.inputSpace,outputSpace:transmission.outputSpace};
    if(path==='transmission.coordinate-map'||path==='transmission.velocity-map'||path==='transmission.effort-map')return transmission.mapping;
    if(path==='transmission.external-implementation'){const manifest=componentDependency(component,'TRANSMISSION_IMPLEMENTATION_MANIFEST',()=>true,'transmission implementation manifest');const refs=transmission.mapping?.kind==='NONLINEAR'?[transmission.mapping.positionModelRef,transmission.mapping.jacobianModelRef]:transmission.mapping?.kind==='EXTERNAL_SOLVER'?[transmission.mapping.solverRef]:[];const implementations=(manifest.implementations??[]).filter((item)=>refs.some((ref)=>ref?.schema===item.schema&&ref?.id===item.id&&ref?.digest===item.digest));return{artifactDigest:manifest.artifactDigest,implementations};}
  }
  if(path.startsWith('actuation.')){const actuator=recordBySubject(contract.actuators,'actuatorId',subjects,'actuator');if(path==='actuation.kind')return actuator.kind;if(path==='actuation.coordinate-class')return actuator.coordinateClass;if(path==='actuation.position-range')return actuator.positionRange?.value??null;if(path==='actuation.velocity-limit')return actuator.velocityLimit?.value??null;if(path==='actuation.effort-limit')return actuator.effortLimit?.value??null;if(path==='actuation.stiffness')return actuator.stiffness?.value??null;if(path==='actuation.damping')return actuator.damping?.value??null;if(path==='actuation.armature')return actuator.armature?.value??null;if(path==='actuation.control-modes')return actuator.supportedControlModes?.value??null;if(path==='actuation.response-latency')return actuator.responseLatency?.value??null;}
  if(path.startsWith('control.')){const profile=recordBySubject(contract.profiles,'profileId',subjects,'control profile');if(path==='control.coordinate-class')return profile.coordinateClass;if(path==='control.mode')return profile.mode?.value??null;if(path==='control.command-space')return profile.commandSpace;if(path==='control.gains')return profile.gainModel?.value??null;if(path==='control.delay')return profile.controllerDelay?.value??null;}
  if(path.startsWith('runtime.')){const binding=recordBySubject(contract.bindings,'bindingId',subjects,'runtime binding');if(path==='runtime.endpoint')return binding.selector;if(path==='runtime.coordinate-class')return binding.coordinateClass;if(path==='runtime.locator')return{device:binding.device?.value??null,bus:binding.bus?.value??null};if(path==='runtime.index')return binding.runtimeIndex?.value??null;if(path==='runtime.calibration')return{sign:binding.sign?.value??null,zeroOffset:binding.zeroOffset?.value??null,encoderScale:binding.encoderScale?.value??null};if(path==='runtime.transport-delay')return binding.transportDelay?.value??null;}
  throw new Error(`P14 does not support semantic path ${path}`);
}

function containsUnresolved(value){if(value===null)return true;if(Array.isArray(value))return value.some(containsUnresolved);if(value&&typeof value==='object')return Object.values(value).some(containsUnresolved);return false;}
function semanticValueStructurallyValid(path,value){
  if(path==='dynamics.mass')return value===null||isFiniteNumber(value);
  if(path==='dynamics.center-of-mass')return value===null||isFiniteVector(value,3);
  if(path==='dynamics.inertia')return value===null||isFiniteMatrix(value,3);
  if(path==='frame.transform'||path==='collision.frame')return isRigidTransform(value);
  if(path==='articulation.joint-frame')return isJointFrameRecord(value);
  if(path==='runtime.index')return value===null||(Number.isInteger(value)&&value>=0);
  if(STRING_SEMANTIC_PATHS.has(path))return typeof value==='string'&&value.length>0&&value.trim()===value&&!CONTROL_RE.test(value);
  if(NULLABLE_STRING_SEMANTIC_PATHS.has(path))return value===null||(typeof value==='string'&&value.length>0&&value.trim()===value&&!CONTROL_RE.test(value));
  if(STRING_SET_SEMANTIC_PATHS.has(path))return isStringSet(value);
  if(NULLABLE_STRING_SET_SEMANTIC_PATHS.has(path))return value===null||isStringSet(value);
  if(RECORD_SEMANTIC_PATHS.has(path))return isRecord(value)&&isCanonicalJson(value);
  if(NULLABLE_RECORD_SEMANTIC_PATHS.has(path))return value===null||(isRecord(value)&&isCanonicalJson(value));
  return false;
}
function canonicalBinding(view){return{canonicalViewDigest:view.canonicalViewDigest,bundleDigest:view.bundleBinding.bundleDigest,rootClosureDigest:view.bundleBinding.rootClosureDigest,rootModuleId:view.bundleBinding.rootModuleId,identityProjectionDigest:view.bundleBinding.identityProjectionDigest};}
function capacityBinding(profile){return{profileId:profile.profileId,backend:profile.backend,capacityDigest:profile.capacityDigest};}
function representationBinding(normalized){return{normalizationId:normalized.normalizationId,normalizationDigest:normalized.normalizationDigest,semanticDigest:normalized.semanticDigest,exportId:normalized.sourceBinding.exportId,exportDigest:normalized.sourceBinding.exportDigest,normalizerImplementationDigest:normalized.normalizer.implementationDigest};}
function lossFor(disposition){if(disposition.status==='OMITTED_UNSUPPORTED')return{kind:'UNSUPPORTED',reason:disposition.reason,strategy:null,retainedSemantics:[],lossSemantics:[]};if(disposition.status==='EMITTED_APPROXIMATION')return{kind:'APPROXIMATION',reason:disposition.approximation.reason,strategy:disposition.approximation.strategy,retainedSemantics:[...disposition.approximation.retainedSemantics],lossSemantics:[...disposition.approximation.lossSemantics]};return null;}
function findingId(backend,obligationId){return assertId(`cross-representation:${digestJson({backend,obligationId}).slice(0,48)}`,'findingId');}
function classify({disposition,entry,canonicalValue,semanticPath}){const normalizedValue=entry.value;if(disposition.status==='OMITTED_UNSUPPORTED')return{outcome:'LOSSY',reasonCode:'DECLARED_UNSUPPORTED',summary:'Target representation explicitly omits this semantic obligation.',loss:lossFor(disposition)};if(!semanticValueStructurallyValid(semanticPath,normalizedValue))return{outcome:'INVALID',reasonCode:'NORMALIZED_SEMANTIC_SHAPE_INVALID',summary:'Normalized backend value is structurally incompatible with the semantic-path value contract.',loss:null};if(disposition.status==='EMITTED_APPROXIMATION')return{outcome:'LOSSY',reasonCode:'DECLARED_APPROXIMATION',summary:'Target representation explicitly approximates this semantic obligation.',loss:lossFor(disposition)};if(containsUnresolved(canonicalValue))return{outcome:'UNRESOLVED',reasonCode:'CANONICAL_VALUE_UNRESOLVED',summary:'Canonical authority does not provide a complete positive value for this semantic obligation.',loss:null};if(sameJson(canonicalValue,normalizedValue))return{outcome:'EQUIVALENT',reasonCode:'EXACT_SEMANTIC_MATCH',summary:'Normalized backend semantics reproduce the current canonical semantic value.',loss:null};return{outcome:'DRIFT',reasonCode:'REPRESENTABLE_VALUE_MISMATCH',summary:'A representable emitted-exact semantic value differs from current canonical RefAs semantics.',loss:null};}
function buildFindings(profile,manifest,normalized,canonicalView){const entryById=new Map(normalized.entries.map((entry)=>[entry.obligationId,entry])),dispositionById=new Map(manifest.dispositions.map((item)=>[item.obligationId,item]));return profile.obligations.map((obligation)=>{const entry=entryById.get(obligation.obligationId),disposition=dispositionById.get(obligation.obligationId);if(!entry||!disposition)throw new Error(`comparison inventory is missing obligation ${obligation.obligationId}`);const canonicalValue=canonicalizeSemanticValue(canonicalValueForObligation(canonicalView,obligation),`canonical.${obligation.obligationId}`);if(!semanticValueStructurallyValid(obligation.semanticPath,canonicalValue))throw new Error(`canonical semantic value for ${obligation.semanticPath} violates its P14 value contract`);const classified=classify({disposition,entry,canonicalValue,semanticPath:obligation.semanticPath});return{findingId:findingId(profile.backend,obligation.obligationId),obligationId:obligation.obligationId,semanticPath:obligation.semanticPath,subjectIds:[...obligation.subjectIds].sort(),ownerCapability:'assembly',outcome:classified.outcome,exportDisposition:disposition.status,reasonCode:classified.reasonCode,summary:classified.summary,canonicalValue,normalizedValue:cloneJson(entry.value,`normalized.${obligation.obligationId}`),loss:classified.loss};}).sort((left,right)=>left.obligationId.localeCompare(right.obligationId));}
function summarize(findings){const summary={total:findings.length,equivalent:0,lossy:0,drift:0,unresolved:0,invalid:0};for(const finding of findings)summary[finding.outcome.toLowerCase()]+=1;return summary;}

export async function createCrossRepresentationValidation({validationId,capacityProfile,manifest,files,normalizedRepresentation,normalizer,bundle,identityGraph,components=[]}={}){
  const capacity=validateRepresentationCapacityBindings(capacityProfile,{bundle,identityGraph,components});if(!capacity.valid)throw new Error(`P11 representation capacity is not live: ${capacity.errors.join('; ')}`);
  const exportBinding=validateBackendExportBindings(manifest,{capacityProfile,bundle,identityGraph,components});if(!exportBinding.valid)throw new Error(`P12 backend export is not live: ${exportBinding.errors.join('; ')}`);
  const replay=await validateNormalizedRepresentationBindings(normalizedRepresentation,{capacityProfile,manifest,files,normalizer});if(!replay.valid)throw new Error(`P13 normalized representation is not replay-verified: ${replay.errors.join('; ')}`);
  const canonicalView=createCanonicalExportView({bundle,identityGraph,components});if(normalizedRepresentation.sourceBinding.canonicalViewDigest!==canonicalView.canonicalViewDigest)throw new Error('P13 canonical-view binding is stale relative to current canonical RefAs state');
  const findings=buildFindings(capacityProfile,manifest,normalizedRepresentation,canonicalView),payload={schema:CROSS_REPRESENTATION_VALIDATION_SCHEMA,validationId:assertId(validationId,'validationId'),scopeId:assertId(bundle.scopeId,'scopeId'),canonicalBinding:canonicalBinding(canonicalView),capacityBinding:capacityBinding(capacityProfile),representationBinding:representationBinding(normalizedRepresentation),findings,summary:summarize(findings),policy:{...CANONICAL_POLICY}};
  return deepFreeze({...payload,validationDigest:digestJson(payload)});
}

function normalizeCanonicalBinding(raw){assertKnownKeys(raw,CANONICAL_BINDING_KEYS,'canonicalBinding');return{canonicalViewDigest:assertDigest(raw.canonicalViewDigest,'canonicalBinding.canonicalViewDigest'),bundleDigest:assertDigest(raw.bundleDigest,'canonicalBinding.bundleDigest'),rootClosureDigest:assertDigest(raw.rootClosureDigest,'canonicalBinding.rootClosureDigest'),rootModuleId:assertId(raw.rootModuleId,'canonicalBinding.rootModuleId'),identityProjectionDigest:assertDigest(raw.identityProjectionDigest,'canonicalBinding.identityProjectionDigest')};}
function normalizeCapacityBinding(raw){assertKnownKeys(raw,CAPACITY_BINDING_KEYS,'capacityBinding');return{profileId:assertId(raw.profileId,'capacityBinding.profileId'),backend:text(raw.backend,'capacityBinding.backend',{maxLength:256}),capacityDigest:assertDigest(raw.capacityDigest,'capacityBinding.capacityDigest')};}
function normalizeRepresentationBinding(raw){assertKnownKeys(raw,REPRESENTATION_BINDING_KEYS,'representationBinding');return{normalizationId:assertId(raw.normalizationId,'representationBinding.normalizationId'),normalizationDigest:assertDigest(raw.normalizationDigest,'representationBinding.normalizationDigest'),semanticDigest:assertDigest(raw.semanticDigest,'representationBinding.semanticDigest'),exportId:assertId(raw.exportId,'representationBinding.exportId'),exportDigest:assertDigest(raw.exportDigest,'representationBinding.exportDigest'),normalizerImplementationDigest:assertDigest(raw.normalizerImplementationDigest,'representationBinding.normalizerImplementationDigest')};}
function normalizeLoss(raw,label){if(raw==null)return null;assertKnownKeys(raw,LOSS_KEYS,label);const kind=text(raw.kind,`${label}.kind`,{maxLength:32}).toUpperCase();if(!['APPROXIMATION','UNSUPPORTED'].includes(kind))throw new Error(`${label}.kind must be APPROXIMATION or UNSUPPORTED`);const strategy=raw.strategy==null?null:text(raw.strategy,`${label}.strategy`,{maxLength:128}),retainedSemantics=Array.isArray(raw.retainedSemantics)?raw.retainedSemantics.map((item,index)=>text(item,`${label}.retainedSemantics[${index}]`,{maxLength:256})).sort():[],lossSemantics=Array.isArray(raw.lossSemantics)?raw.lossSemantics.map((item,index)=>text(item,`${label}.lossSemantics[${index}]`,{maxLength:256})).sort():[];if(kind==='UNSUPPORTED'&&strategy!==null)throw new Error(`${label}.strategy must be null for UNSUPPORTED`);if(kind==='APPROXIMATION'&&strategy===null)throw new Error(`${label}.strategy is required for APPROXIMATION`);return{kind,reason:text(raw.reason,`${label}.reason`),strategy,retainedSemantics,lossSemantics};}
function expectedPersistedClassification({semanticPath,exportDisposition,canonicalValue,normalizedValue,loss}){
  if(exportDisposition==='OMITTED_UNSUPPORTED')return{outcome:'LOSSY',reasonCode:'DECLARED_UNSUPPORTED',lossKind:'UNSUPPORTED'};
  if(!semanticValueStructurallyValid(semanticPath,normalizedValue))return{outcome:'INVALID',reasonCode:'NORMALIZED_SEMANTIC_SHAPE_INVALID',lossKind:null};
  if(exportDisposition==='EMITTED_APPROXIMATION')return{outcome:'LOSSY',reasonCode:'DECLARED_APPROXIMATION',lossKind:'APPROXIMATION'};
  if(containsUnresolved(canonicalValue))return{outcome:'UNRESOLVED',reasonCode:'CANONICAL_VALUE_UNRESOLVED',lossKind:null};
  if(sameJson(canonicalValue,normalizedValue))return{outcome:'EQUIVALENT',reasonCode:'EXACT_SEMANTIC_MATCH',lossKind:null};
  return{outcome:'DRIFT',reasonCode:'REPRESENTABLE_VALUE_MISMATCH',lossKind:null};
}
function normalizeFindingRecord(raw,index){const label=`findings[${index}]`;assertKnownKeys(raw,FINDING_KEYS,label);const semanticPath=text(raw.semanticPath,`${label}.semanticPath`,{maxLength:160});const outcome=text(raw.outcome,`${label}.outcome`,{maxLength:32}).toUpperCase();if(!OUTCOME_SET.has(outcome))throw new Error(`${label}.outcome is not a P14 outcome`);const exportDisposition=text(raw.exportDisposition,`${label}.exportDisposition`,{maxLength:64}).toUpperCase();if(!EXPORT_DISPOSITION_SET.has(exportDisposition))throw new Error(`${label}.exportDisposition is not a P12 disposition`);if(raw.ownerCapability!=='assembly')throw new Error(`${label}.ownerCapability must be assembly`);const canonicalValue=canonicalizeSemanticValue(raw.canonicalValue,`${label}.canonicalValue`),normalizedValue=canonicalizeSemanticValue(raw.normalizedValue,`${label}.normalizedValue`);if(!semanticValueStructurallyValid(semanticPath,canonicalValue))throw new Error(`${label}.canonicalValue violates the ${semanticPath} semantic value contract`);const loss=normalizeLoss(raw.loss,`${label}.loss`),expected=expectedPersistedClassification({semanticPath,exportDisposition,canonicalValue,normalizedValue,loss});if(outcome!==expected.outcome)throw new Error(`${label}.outcome must be ${expected.outcome} for ${exportDisposition} under the ${semanticPath} value contract`);const reasonCode=text(raw.reasonCode,`${label}.reasonCode`,{maxLength:96});if(reasonCode!==expected.reasonCode)throw new Error(`${label}.reasonCode must be ${expected.reasonCode} for ${outcome}`);if(expected.lossKind===null&&loss!==null)throw new Error(`${label}.loss must be null for ${outcome}`);if(expected.lossKind!==null&&loss?.kind!==expected.lossKind)throw new Error(`${label}.loss.kind must be ${expected.lossKind} for ${outcome} + ${exportDisposition}`);if(exportDisposition==='OMITTED_UNSUPPORTED'&&normalizedValue!==null)throw new Error(`${label}.normalizedValue must be null for OMITTED_UNSUPPORTED`);return{findingId:assertId(raw.findingId,`${label}.findingId`),obligationId:assertId(raw.obligationId,`${label}.obligationId`),semanticPath,subjectIds:idArray(raw.subjectIds,`${label}.subjectIds`),ownerCapability:'assembly',outcome,exportDisposition,reasonCode,summary:text(raw.summary,`${label}.summary`),canonicalValue,normalizedValue,loss};}
function normalizeSummary(raw,findingCount){assertKnownKeys(raw,SUMMARY_KEYS,'summary');const result={};for(const key of SUMMARY_KEYS){const value=raw[key];if(!Number.isInteger(value)||value<0)throw new Error(`summary.${key} must be a non-negative integer`);result[key]=value;}if(result.total!==findingCount)throw new Error('summary.total must equal findings.length');if(result.equivalent+result.lossy+result.drift+result.unresolved+result.invalid!==result.total)throw new Error('summary outcome counts must sum to total');return result;}
function normalizePolicy(raw){assertKnownKeys(raw,POLICY_KEYS,'policy');if(!sameJson(raw,CANONICAL_POLICY))throw new Error('policy must equal the canonical P14 policy');return{...CANONICAL_POLICY};}
function normalizePersistedValidation(value){assertKnownKeys(value,TOP_LEVEL_KEYS,'cross-representation validation');if(value.schema!==CROSS_REPRESENTATION_VALIDATION_SCHEMA)throw new Error(`schema must be ${CROSS_REPRESENTATION_VALIDATION_SCHEMA}`);if(!Array.isArray(value.findings)||!value.findings.length)throw new Error('findings must contain one record per P11 obligation');const capacity=normalizeCapacityBinding(value.capacityBinding);const findings=value.findings.map(normalizeFindingRecord).sort((a,b)=>a.obligationId.localeCompare(b.obligationId));if(new Set(findings.map((item)=>item.obligationId)).size!==findings.length)throw new Error('findings contains duplicate obligationId values');if(new Set(findings.map((item)=>item.findingId)).size!==findings.length)throw new Error('findings contains duplicate findingId values');for(const finding of findings){const expected=findingId(capacity.backend,finding.obligationId);if(finding.findingId!==expected)throw new Error(`finding ${finding.obligationId} findingId must be canonical ${expected}`);}const payload={schema:value.schema,validationId:assertId(value.validationId,'validationId'),scopeId:assertId(value.scopeId,'scopeId'),canonicalBinding:normalizeCanonicalBinding(value.canonicalBinding),capacityBinding:capacity,representationBinding:normalizeRepresentationBinding(value.representationBinding),findings,summary:normalizeSummary(value.summary,findings.length),policy:normalizePolicy(value.policy)};if(!sameJson(payload.summary,summarize(findings)))throw new Error('summary does not reproduce from findings');const validationDigest=assertDigest(value.validationDigest,'validationDigest');if(digestJson(payload)!==validationDigest)throw new Error('validationDigest does not reproduce');return{...payload,validationDigest};}
export function validateCrossRepresentationValidation(value){const errors=[];try{const normalized=normalizePersistedValidation(value);if(!sameJson(normalized,value))errors.push('cross-representation validation is not canonical');}catch(error){errors.push(error.message);}return{valid:errors.length===0,errors};}
export async function validateCrossRepresentationValidationBindings(value,context={}){const errors=[],intrinsic=validateCrossRepresentationValidation(value);if(!intrinsic.valid)errors.push(`cross-representation validation invalid: ${intrinsic.errors.join('; ')}`);try{if(!errors.length){const recreated=await createCrossRepresentationValidation({validationId:value.validationId,...context});if(!sameJson(recreated,value))throw new Error('cross-representation validation is stale or does not reproduce from current canonical/backend evidence');}}catch(error){errors.push(error.message);}return{valid:errors.length===0,errors};}
