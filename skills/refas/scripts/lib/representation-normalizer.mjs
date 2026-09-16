import {Buffer} from 'node:buffer';

import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {canonicalizePhysicalQuaternion} from './physical-identity-graph.mjs';
import {validateRepresentationCapacityProfile} from './representation-capacity.mjs';
import {validateBackendExportArtifacts, validateBackendExportManifest} from './backend-export.mjs';

export const NORMALIZED_REPRESENTATION_SCHEMA = 'refas.normalized-representation/v1';
export const NORMALIZED_REPRESENTATION_ENTRY_STATUSES = Object.freeze(['NORMALIZED', 'OMITTED_UNSUPPORTED']);
export const BACKEND_ROTATION_ORDERS = Object.freeze(['XYZ', 'XZY', 'YXZ', 'YZX', 'ZXY', 'ZYX']);
export const BACKEND_ROTATION_CONVENTIONS = Object.freeze(['INTRINSIC', 'EXTRINSIC']);
export const BACKEND_ANGLE_UNITS = Object.freeze(['rad', 'deg']);
export const BACKEND_TRANSLATION_UNITS = Object.freeze(['m', 'cm', 'mm']);

const ROTATION_ORDER_SET = new Set(BACKEND_ROTATION_ORDERS);
const ROTATION_CONVENTION_SET = new Set(BACKEND_ROTATION_CONVENTIONS);
const ANGLE_UNIT_SET = new Set(BACKEND_ANGLE_UNITS);
const TRANSLATION_UNIT_SCALE = new Map([['m', 1], ['cm', 0.01], ['mm', 0.001]]);
const TOP_LEVEL_KEYS = new Set(['schema', 'normalizationId', 'normalizer', 'sourceBinding', 'entries', 'semanticDigest', 'policy', 'normalizationDigest']);
const NORMALIZER_KEYS = new Set(['id', 'backend', 'version']);
const SOURCE_BINDING_KEYS = new Set(['exportId', 'exportDigest', 'backend', 'canonicalViewDigest', 'profileId', 'capacityDigest', 'artifactSetDigest']);
const ENTRY_KEYS = new Set(['obligationId', 'semanticPath', 'subjectIds', 'exportDisposition', 'status', 'sources', 'value', 'reason']);
const SOURCE_KEYS = new Set(['artifactId', 'locator']);
const RAW_NORMALIZER_KEYS = new Set(['id', 'backend', 'version', 'normalize']);
const RAW_RESULT_KEYS = new Set(['readings']);
const RAW_READING_KEYS = new Set(['obligationId', 'sources', 'value']);
const CONTROL_RE = /[\u0000-\u001f\u007f]/u;
const CANONICAL_POLICY = Object.freeze({
  backendDataNeverCanonical: true,
  onlyVerifiedArtifactBytesRead: true,
  p11ObligationsOwnSemanticIdentity: true,
  backendOrderingIsNotSemanticIdentity: true,
  unsupportedOmissionsRemainExplicit: true,
  canonicalTransformsUseMetersAndQuaternion: true,
  quaternionSignIsCanonical: true,
  sourceLocatorsRemainProvenanceOnly: true,
  crossRepresentationVerdictsRemainDownstream: true,
  declaredDivergenceRemainsDownstream: true,
  physicalClaimsRemainDownstream: true,
});
const POLICY_KEYS = new Set(Object.keys(CANONICAL_POLICY));

function assertRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}
function assertKnownKeys(value, allowed, label) {
  assertRecord(value, label);
  const extras = Object.keys(value).filter((key) => !allowed.has(key));
  if (extras.length) throw new Error(`${label} contains unsupported field(s): ${extras.sort().join(', ')}`);
}
function text(value, label, {maxLength = 2048} = {}) {
  if (typeof value !== 'string' || !value.length || value.trim() !== value || value.length > maxLength) throw new Error(`${label} must be a trimmed non-empty string up to ${maxLength} characters`);
  if (CONTROL_RE.test(value)) throw new Error(`${label} must not contain control characters`);
  return value;
}
function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number`);
  return Object.is(value, -0) ? 0 : value;
}
function vector(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) throw new Error(`${label} must contain exactly ${length} numbers`);
  return value.map((item, index) => finite(item, `${label}[${index}]`));
}
function idArray(value, label, {nonEmpty = true} = {}) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  if (nonEmpty && !value.length) throw new Error(`${label} must not be empty`);
  const ids = value.map((item, index) => assertId(item, `${label}[${index}]`)).sort();
  if (new Set(ids).size !== ids.length) throw new Error(`${label} must contain unique IDs`);
  return ids;
}
function cloneJson(value, label) {
  try { return structuredClone(value); }
  catch { throw new Error(`${label} must be structured-cloneable data`); }
}
function sameJson(left, right) { return digestJson(left) === digestJson(right); }
function stableTransformNumber(value) {
  const normalized = finite(value, 'transform number');
  if (Math.abs(normalized) <= 1e-12) return 0;
  return Math.round(normalized * 1e12) / 1e12;
}
function stableQuaternion(values, label) {
  return canonicalizePhysicalQuaternion(values, label).map(stableTransformNumber);
}
function multiplyQuaternion(left, right) {
  const [lx, ly, lz, lw] = left, [rx, ry, rz, rw] = right;
  return [lw*rx+lx*rw+ly*rz-lz*ry, lw*ry-lx*rz+ly*rw+lz*rx, lw*rz+lx*ry-ly*rx+lz*rw, lw*rw-lx*rx-ly*ry-lz*rz];
}
function axisQuaternion(axis, angle) {
  const half = angle / 2, s = Math.sin(half);
  if (axis === 'X') return [s,0,0,Math.cos(half)];
  if (axis === 'Y') return [0,s,0,Math.cos(half)];
  return [0,0,s,Math.cos(half)];
}
function eulerQuaternion({values, order, unit, convention}, label) {
  const normalizedOrder = text(order, `${label}.order`, {maxLength: 3}).toUpperCase();
  if (!ROTATION_ORDER_SET.has(normalizedOrder)) throw new Error(`${label}.order must be one of: ${BACKEND_ROTATION_ORDERS.join(', ')}`);
  const normalizedUnit = text(unit, `${label}.unit`, {maxLength: 8}).toLowerCase();
  if (!ANGLE_UNIT_SET.has(normalizedUnit)) throw new Error(`${label}.unit must be rad or deg`);
  const normalizedConvention = text(convention, `${label}.convention`, {maxLength: 16}).toUpperCase();
  if (!ROTATION_CONVENTION_SET.has(normalizedConvention)) throw new Error(`${label}.convention must be INTRINSIC or EXTRINSIC`);
  const angles = vector(values, 3, `${label}.values`).map((value) => normalizedUnit === 'deg' ? value * Math.PI / 180 : value);
  let result = [0,0,0,1];
  for (let index = 0; index < 3; index += 1) {
    const q = axisQuaternion(normalizedOrder[index], angles[index]);
    result = normalizedConvention === 'INTRINSIC' ? multiplyQuaternion(result, q) : multiplyQuaternion(q, result);
  }
  return stableQuaternion(result, `${label}.rotation_quat_xyzw`);
}
export function canonicalizeBackendRigidTransform(raw, label = 'backendTransform') {
  assertRecord(raw, label);
  if (raw.translation_m != null || raw.rotation_quat_xyzw != null) {
    assertKnownKeys(raw, new Set(['translation_m','rotation_quat_xyzw']), label);
    return deepFreeze({translation_m: vector(raw.translation_m,3,`${label}.translation_m`).map(stableTransformNumber), rotation_quat_xyzw: stableQuaternion(raw.rotation_quat_xyzw,`${label}.rotation_quat_xyzw`)});
  }
  assertKnownKeys(raw, new Set(['translation','translationUnit','rotation']), label);
  const unit = text(raw.translationUnit, `${label}.translationUnit`, {maxLength:8}).toLowerCase(), scale = TRANSLATION_UNIT_SCALE.get(unit);
  if (scale == null) throw new Error(`${label}.translationUnit must be one of: ${BACKEND_TRANSLATION_UNITS.join(', ')}`);
  const translation_m = vector(raw.translation,3,`${label}.translation`).map((value)=>stableTransformNumber(value*scale));
  const rotation = assertRecord(raw.rotation, `${label}.rotation`), kind = text(rotation.kind,`${label}.rotation.kind`,{maxLength:32}).toUpperCase();
  let rotation_quat_xyzw;
  if (kind === 'QUATERNION') {
    const order = text(rotation.order,`${label}.rotation.order`,{maxLength:4}).toUpperCase(), values=vector(rotation.values,4,`${label}.rotation.values`);
    if (order === 'XYZW') rotation_quat_xyzw = stableQuaternion(values, `${label}.rotation.values`);
    else if (order === 'WXYZ') rotation_quat_xyzw = stableQuaternion([values[1],values[2],values[3],values[0]], `${label}.rotation.values`);
    else throw new Error(`${label}.rotation.order must be XYZW or WXYZ for QUATERNION`);
  } else if (kind === 'EULER') rotation_quat_xyzw = eulerQuaternion(rotation, `${label}.rotation`);
  else throw new Error(`${label}.rotation.kind must be QUATERNION or EULER`);
  return deepFreeze({translation_m, rotation_quat_xyzw});
}
function canonicalizeSemanticValue(value, label='value') {
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return finite(value,label);
  if (Array.isArray(value)) return value.map((item,index)=>canonicalizeSemanticValue(item,`${label}[${index}]`));
  if (typeof value !== 'object') throw new Error(`${label} must be canonical JSON-compatible data`);
  const keys=Object.keys(value), transformKeys=new Set(keys), canonicalTransform=transformKeys.has('translation_m')&&transformKeys.has('rotation_quat_xyzw')&&[...transformKeys].every((key)=>['parentId','translation_m','rotation_quat_xyzw'].includes(key));
  if (canonicalTransform) { const transform=canonicalizeBackendRigidTransform({translation_m:value.translation_m,rotation_quat_xyzw:value.rotation_quat_xyzw},label); return value.parentId==null?transform:{parentId:assertId(value.parentId,`${label}.parentId`),...transform}; }
  const result={}; for(const key of keys.sort()) result[key]=canonicalizeSemanticValue(value[key],`${label}.${key}`); return result;
}
function normalizeNormalizer(raw) { assertKnownKeys(raw,RAW_NORMALIZER_KEYS,'normalizer'); if(typeof raw.normalize!=='function')throw new Error('normalizer.normalize must be a function'); return{id:assertId(raw.id,'normalizer.id'),backend:text(raw.backend,'normalizer.backend',{maxLength:256}),version:text(raw.version,'normalizer.version',{maxLength:128}),normalize:raw.normalize}; }
function persistedNormalizer(raw){assertKnownKeys(raw,NORMALIZER_KEYS,'normalizer');return{id:assertId(raw.id,'normalizer.id'),backend:text(raw.backend,'normalizer.backend',{maxLength:256}),version:text(raw.version,'normalizer.version',{maxLength:128})};}
function artifactSetDigest(manifest){return digestJson(manifest.artifacts);}
function sourceBinding(manifest,profile){return{exportId:manifest.exportId,exportDigest:manifest.exportDigest,backend:manifest.adapter.backend,canonicalViewDigest:manifest.canonicalBinding.canonicalViewDigest,profileId:profile.profileId,capacityDigest:profile.capacityDigest,artifactSetDigest:artifactSetDigest(manifest)};}
function normalizeSourceBinding(raw){assertKnownKeys(raw,SOURCE_BINDING_KEYS,'sourceBinding');return{exportId:assertId(raw.exportId,'sourceBinding.exportId'),exportDigest:assertDigest(raw.exportDigest,'sourceBinding.exportDigest'),backend:text(raw.backend,'sourceBinding.backend',{maxLength:256}),canonicalViewDigest:assertDigest(raw.canonicalViewDigest,'sourceBinding.canonicalViewDigest'),profileId:assertId(raw.profileId,'sourceBinding.profileId'),capacityDigest:assertDigest(raw.capacityDigest,'sourceBinding.capacityDigest'),artifactSetDigest:assertDigest(raw.artifactSetDigest,'sourceBinding.artifactSetDigest')};}
function assertProfileManifestBinding(profile,manifest){const pv=validateRepresentationCapacityProfile(profile);if(!pv.valid)throw new Error(`representation capacity profile is invalid: ${pv.errors.join('; ')}`);const mv=validateBackendExportManifest(manifest);if(!mv.valid)throw new Error(`backend export manifest is invalid: ${mv.errors.join('; ')}`);if(manifest.capacityBinding.profileId!==profile.profileId||manifest.capacityBinding.capacityDigest!==profile.capacityDigest||manifest.capacityBinding.backend!==profile.backend)throw new Error('P12 export capacity binding does not match the exact P11 profile');if(manifest.adapter.backend!==profile.backend)throw new Error('P12 export backend does not match the exact P11 profile backend');const a=profile.obligations.map((x)=>x.obligationId).sort(),b=manifest.dispositions.map((x)=>x.obligationId).sort();if(!sameJson(a,b))throw new Error('P12 disposition inventory does not match the exact P11 obligation inventory');}
function verifiedArtifacts(manifest,files){const validation=validateBackendExportArtifacts(manifest,files);if(!validation.valid)throw new Error(`backend artifact bytes are not verified: ${validation.errors.join('; ')}`);const byPath=new Map(manifest.artifacts.map((a)=>[a.path,a]));return files.map((file,index)=>{const d=byPath.get(file.path);if(!d)throw new Error(`files[${index}] path is not declared by P12 manifest: ${file.path}`);const content=typeof file.content==='string'?Buffer.from(file.content,'utf8'):Buffer.from(file.content);return{artifactId:d.artifactId,path:d.path,mediaType:d.mediaType,sha256:d.sha256,sizeBytes:d.sizeBytes,content};}).sort((a,b)=>a.artifactId.localeCompare(b.artifactId));}
function normalizeRawSource(raw,index,label){const l=`${label}.sources[${index}]`;assertKnownKeys(raw,SOURCE_KEYS,l);return{artifactId:assertId(raw.artifactId,`${l}.artifactId`),locator:text(raw.locator,`${l}.locator`,{maxLength:1024})};}
function normalizeRawReading(raw,index){const l=`readings[${index}]`;assertKnownKeys(raw,RAW_READING_KEYS,l);if(!Array.isArray(raw.sources)||!raw.sources.length)throw new Error(`${l}.sources must be a non-empty array`);const sources=raw.sources.map((x,i)=>normalizeRawSource(x,i,l)).sort((a,b)=>a.artifactId.localeCompare(b.artifactId)||a.locator.localeCompare(b.locator));const keys=sources.map((s)=>`${s.artifactId}\u0000${s.locator}`);if(new Set(keys).size!==keys.length)throw new Error(`${l}.sources must be unique`);return{obligationId:assertId(raw.obligationId,`${l}.obligationId`),sources,value:canonicalizeSemanticValue(raw.value,`${l}.value`)};}
function targetKey(target){return`${target.artifactId}\u0000${target.locator}`;}
function buildEntries(profile,manifest,readings){const readingById=new Map();for(const reading of readings){if(readingById.has(reading.obligationId))throw new Error(`normalizer returned duplicate reading for ${reading.obligationId}`);readingById.set(reading.obligationId,reading);}const obligationById=new Map(profile.obligations.map((o)=>[o.obligationId,o])),dispositionById=new Map(manifest.dispositions.map((d)=>[d.obligationId,d]));for(const id of readingById.keys())if(!obligationById.has(id))throw new Error(`normalizer returned reading for unknown P11 obligation ${id}`);const entries=[];for(const obligation of profile.obligations){const disposition=dispositionById.get(obligation.obligationId);if(!disposition)throw new Error(`P12 export is missing disposition for ${obligation.obligationId}`);const reading=readingById.get(obligation.obligationId)??null,base={obligationId:obligation.obligationId,semanticPath:obligation.semanticPath,subjectIds:[...obligation.subjectIds],exportDisposition:disposition.status};if(disposition.status==='OMITTED_UNSUPPORTED'){if(reading)throw new Error(`normalizer may not fabricate a value for unsupported omission ${obligation.obligationId}`);entries.push({...base,status:'OMITTED_UNSUPPORTED',sources:[],value:null,reason:disposition.reason});continue;}if(!reading)throw new Error(`normalizer did not return a reading for emitted obligation ${obligation.obligationId}`);const allowed=new Set(disposition.targets.map(targetKey));for(const source of reading.sources)if(!allowed.has(targetKey(source)))throw new Error(`normalizer source for ${obligation.obligationId} is not one of the P12 disposition targets: ${source.artifactId} ${source.locator}`);entries.push({...base,status:'NORMALIZED',sources:reading.sources,value:reading.value});}return entries.sort((a,b)=>a.obligationId.localeCompare(b.obligationId));}
function semanticProjection(entries){return entries.map((entry)=>({obligationId:entry.obligationId,semanticPath:entry.semanticPath,subjectIds:[...entry.subjectIds],status:entry.status,value:cloneJson(entry.value,`semanticProjection.${entry.obligationId}.value`)}));}
export async function runRepresentationNormalizer({normalizationId,normalizer,capacityProfile,manifest,files}={}){const n=normalizeNormalizer(normalizer);assertProfileManifestBinding(capacityProfile,manifest);if(n.backend!==manifest.adapter.backend)throw new Error(`normalizer backend ${n.backend} does not match P12 export backend ${manifest.adapter.backend}`);const artifacts=verifiedArtifacts(manifest,files);const input=Object.freeze({manifest:deepFreeze(cloneJson(manifest,'manifest')),obligations:deepFreeze(cloneJson(capacityProfile.obligations,'obligations')),artifacts:Object.freeze(artifacts.map((a)=>Object.freeze({...a})))});const raw=await n.normalize(input);assertKnownKeys(raw,RAW_RESULT_KEYS,'normalizer result');if(!Array.isArray(raw.readings))throw new Error('normalizer result.readings must be an array');const readings=raw.readings.map(normalizeRawReading).sort((a,b)=>a.obligationId.localeCompare(b.obligationId)),entries=buildEntries(capacityProfile,manifest,readings),semanticDigest=digestJson(semanticProjection(entries));const payload={schema:NORMALIZED_REPRESENTATION_SCHEMA,normalizationId:assertId(normalizationId,'normalizationId'),normalizer:{id:n.id,backend:n.backend,version:n.version},sourceBinding:sourceBinding(manifest,capacityProfile),entries,semanticDigest,policy:{...CANONICAL_POLICY}};return deepFreeze({...payload,normalizationDigest:digestJson(payload)});}
function normalizePersistedSource(raw,index,label){const l=`${label}.sources[${index}]`;assertKnownKeys(raw,SOURCE_KEYS,l);return{artifactId:assertId(raw.artifactId,`${l}.artifactId`),locator:text(raw.locator,`${l}.locator`,{maxLength:1024})};}
function normalizePersistedEntry(raw,index){const l=`entries[${index}]`;assertKnownKeys(raw,ENTRY_KEYS,l);const status=text(raw.status,`${l}.status`,{maxLength:64}).toUpperCase();if(!NORMALIZED_REPRESENTATION_ENTRY_STATUSES.includes(status))throw new Error(`${l}.status is not a P13 normalized entry status`);const exportDisposition=text(raw.exportDisposition,`${l}.exportDisposition`,{maxLength:64}).toUpperCase(),subjectIds=idArray(raw.subjectIds,`${l}.subjectIds`);if(!Array.isArray(raw.sources))throw new Error(`${l}.sources must be an array`);const sources=raw.sources.map((x,i)=>normalizePersistedSource(x,i,l)).sort((a,b)=>a.artifactId.localeCompare(b.artifactId)||a.locator.localeCompare(b.locator));if(new Set(sources.map(targetKey)).size!==sources.length)throw new Error(`${l}.sources must be unique`);const entry={obligationId:assertId(raw.obligationId,`${l}.obligationId`),semanticPath:text(raw.semanticPath,`${l}.semanticPath`,{maxLength:160}),subjectIds,exportDisposition,status,sources,value:canonicalizeSemanticValue(raw.value,`${l}.value`)};if(status==='OMITTED_UNSUPPORTED'){if(exportDisposition!=='OMITTED_UNSUPPORTED')throw new Error(`${l} omitted entry must bind OMITTED_UNSUPPORTED disposition`);if(sources.length)throw new Error(`${l}.sources must be empty for OMITTED_UNSUPPORTED`);if(entry.value!==null)throw new Error(`${l}.value must be null for OMITTED_UNSUPPORTED`);entry.reason=text(raw.reason,`${l}.reason`);}else{if(!['EMITTED_EXACT','EMITTED_APPROXIMATION'].includes(exportDisposition))throw new Error(`${l} normalized entry must bind an emitted P12 disposition`);if(!sources.length)throw new Error(`${l}.sources must not be empty for NORMALIZED`);if(raw.reason!=null)throw new Error(`${l}.reason is valid only for OMITTED_UNSUPPORTED`);}return entry;}
function normalizePolicy(raw){assertKnownKeys(raw,POLICY_KEYS,'policy');if(!sameJson(raw,CANONICAL_POLICY))throw new Error('policy must equal the canonical P13 policy');return{...CANONICAL_POLICY};}
function normalizePersistedRepresentation(value){assertKnownKeys(value,TOP_LEVEL_KEYS,'normalized representation');if(value.schema!==NORMALIZED_REPRESENTATION_SCHEMA)throw new Error(`schema must be ${NORMALIZED_REPRESENTATION_SCHEMA}`);const normalizationId=assertId(value.normalizationId,'normalizationId'),normalizer=persistedNormalizer(value.normalizer),source=normalizeSourceBinding(value.sourceBinding);if(normalizer.backend!==source.backend)throw new Error('normalizer.backend must match sourceBinding.backend');if(!Array.isArray(value.entries)||!value.entries.length)throw new Error('entries must contain at least one P11 obligation');const entries=value.entries.map(normalizePersistedEntry).sort((a,b)=>a.obligationId.localeCompare(b.obligationId));if(new Set(entries.map((e)=>e.obligationId)).size!==entries.length)throw new Error('entries contains duplicate obligationId values');const semanticDigest=assertDigest(value.semanticDigest,'semanticDigest');if(digestJson(semanticProjection(entries))!==semanticDigest)throw new Error('semanticDigest does not reproduce');const policy=normalizePolicy(value.policy),payload={schema:value.schema,normalizationId,normalizer,sourceBinding:source,entries,semanticDigest,policy},normalizationDigest=assertDigest(value.normalizationDigest,'normalizationDigest');if(digestJson(payload)!==normalizationDigest)throw new Error('normalizationDigest does not reproduce');return{...payload,normalizationDigest};}
export function validateNormalizedRepresentation(value){const errors=[];try{const normalized=normalizePersistedRepresentation(value);if(!sameJson(normalized,value))errors.push('normalized representation is not canonical');}catch(error){errors.push(error.message);}return{valid:errors.length===0,errors};}
export function validateNormalizedRepresentationBindings(value,{capacityProfile,manifest,files}={}){const errors=[],intrinsic=validateNormalizedRepresentation(value);if(!intrinsic.valid)errors.push(`normalized representation invalid: ${intrinsic.errors.join('; ')}`);try{if(!errors.length){assertProfileManifestBinding(capacityProfile,manifest);verifiedArtifacts(manifest,files);if(!sameJson(value.sourceBinding,sourceBinding(manifest,capacityProfile)))throw new Error('normalized representation source binding is stale');const obligationById=new Map(capacityProfile.obligations.map((x)=>[x.obligationId,x])),dispositionById=new Map(manifest.dispositions.map((x)=>[x.obligationId,x]));if(value.entries.length!==capacityProfile.obligations.length)throw new Error('normalized entry inventory does not match the P11 obligation inventory');for(const entry of value.entries){const obligation=obligationById.get(entry.obligationId);if(!obligation)throw new Error(`normalized entry references unknown P11 obligation ${entry.obligationId}`);if(entry.semanticPath!==obligation.semanticPath||!sameJson(entry.subjectIds,[...obligation.subjectIds].sort()))throw new Error(`normalized semantic identity drift for ${entry.obligationId}`);const disposition=dispositionById.get(entry.obligationId);if(!disposition||entry.exportDisposition!==disposition.status)throw new Error(`normalized export disposition drift for ${entry.obligationId}`);if(disposition.status==='OMITTED_UNSUPPORTED'){if(entry.status!=='OMITTED_UNSUPPORTED'||entry.reason!==disposition.reason)throw new Error(`normalized unsupported omission drift for ${entry.obligationId}`);}else{if(entry.status!=='NORMALIZED')throw new Error(`emitted P12 obligation ${entry.obligationId} must be NORMALIZED`);const allowed=new Set(disposition.targets.map(targetKey));for(const source of entry.sources)if(!allowed.has(targetKey(source)))throw new Error(`normalized source locator drift for ${entry.obligationId}`);}}}}catch(error){errors.push(error.message);}return{valid:errors.length===0,errors};}
function componentForObligation(document,obligation){if(obligation.source?.kind!=='COMPONENT')return null;const component=(document.components??[]).find((x)=>x.componentId===obligation.source.componentId);if(!component)throw new Error(`semantic JSON backend is missing component ${obligation.source.componentId}`);if(component.schema!==obligation.source.schema||component.digest!==obligation.source.digest)throw new Error(`semantic JSON component ${component.componentId} does not match P11 source binding`);return component;}
function entityForSubjects(document,subjectIds){const byId=new Map((document.identityProjection?.entities??[]).map((x)=>[x.id,x]));for(const id of subjectIds)if(byId.has(id))return byId.get(id);throw new Error(`semantic JSON backend has no identity entity for subjects ${subjectIds.join(', ')}`);}
function relationForSubjects(document,subjectIds){const byId=new Map((document.identityProjection?.relations??[]).map((x)=>[x.id,x]));for(const id of subjectIds)if(byId.has(id))return byId.get(id);throw new Error(`semantic JSON backend has no identity relation for subjects ${subjectIds.join(', ')}`);}
function recordBySubject(records,idKey,subjectIds,label){for(const id of subjectIds){const record=(records??[]).find((x)=>x?.[idKey]===id);if(record)return record;}throw new Error(`semantic JSON backend has no ${label} for subjects ${subjectIds.join(', ')}`);}
function colliderBySubjects(contract,subjectIds){for(const link of contract.links??[])for(const collider of link.colliders??[])if(subjectIds.includes(collider.id))return{link,collider};throw new Error(`semantic JSON backend has no collider for subjects ${subjectIds.join(', ')}`);}
function articulationDependency(component,kind,predicate,label){const matches=(component.dependencies??[]).filter((d)=>d.kind===kind&&predicate(d.contract));if(matches.length!==1)throw new Error(`semantic JSON backend requires exactly one ${label}; found ${matches.length}`);return matches[0].contract;}
function semanticJsonValueForObligation(document,obligation){const path=obligation.semanticPath,subjects=obligation.subjectIds;if(obligation.source.kind==='IDENTITY'){if(path==='identity.entity'){const e=entityForSubjects(document,subjects);return{id:e.id,kind:e.kind};}if(path==='frame.transform'){const e=entityForSubjects(document,subjects);if(!e.frame)throw new Error(`identity ${e.id} has no frame`);return e.frame;}if(path==='composition.interface'){const e=entityForSubjects(document,subjects);return{id:e.id,kind:e.kind};}if(path==='compatibility.family')return[...(entityForSubjects(document,subjects).compatibilityFamilyIds??[])].sort();if(path==='identity.relation'||path==='composition.contains')return relationForSubjects(document,subjects);throw new Error(`semantic JSON normalizer does not support identity semantic path ${path}`);}const component=componentForObligation(document,obligation),contract=component.contract;if(path.startsWith('dynamics.')){const link=recordBySubject(contract.links,'linkId',subjects,'dynamics link');if(path==='dynamics.mass')return link.mass?.value_kg??null;if(path==='dynamics.center-of-mass')return link.centerOfMass?.value_m??null;if(path==='dynamics.inertia')return link.inertia?.tensor_kg_m2??null;}if(path.startsWith('collision.')){if(path==='collision.self-policy')return recordBySubject(contract.links,'linkId',subjects,'collision link').selfCollisionPolicy;const{collider}=colliderBySubjects(contract,subjects);if(path==='collision.frame')return collider.frame;if(path==='collision.geometry')return collider.geometry;if(path==='collision.filter')return collider.filter;}if(path.startsWith('articulation.')){if(path==='articulation.topology'&&subjects.length===1&&subjects.includes(contract.rootLinkId))return{topology:contract.topology,rootLinkId:contract.rootLinkId};const joint=recordBySubject(contract.joints,'virtualJointId',subjects,'articulation joint');if(path==='articulation.topology')return{virtualJointId:joint.virtualJointId,parentLinkId:joint.parentLinkId,childLinkId:joint.childLinkId};if(path==='articulation.joint-frame')return{parentJointFrame:joint.parentJointFrame,childJointFrame:joint.childJointFrame};if(path==='articulation.reference-configuration')return{referenceAngle:joint.referenceAngle,referenceChildFrameInParent:joint.referenceChildFrameInParent};if(path==='articulation.joint-limit'){const typed=articulationDependency(component,'ARTICULATED_JOINT',(candidate)=>candidate.id===joint.virtualJointId,`typed joint dependency ${joint.virtualJointId}`);return{jointType:typed.jointType,axisConvention:typed.axisConvention,limits:typed.limits};}}if(path.startsWith('mechanism.')){const mechanism=recordBySubject(contract.mechanisms,'mechanismId',subjects,'mechanism');if(path==='mechanism.kind')return mechanism.kind;if(path==='mechanism.topology')return{mechanismId:mechanism.mechanismId,realizesRelationIds:mechanism.realizesRelationIds,realizedJointIds:mechanism.realizedJointIds,members:mechanism.members,edges:mechanism.edges};}if(path.startsWith('transmission.')){const transmission=recordBySubject(contract.transmissions,'transmissionId',subjects,'transmission');if(path==='transmission.coordinate-space')return{inputSpace:transmission.inputSpace,outputSpace:transmission.outputSpace};if(path==='transmission.coordinate-map'||path==='transmission.velocity-map'||path==='transmission.effort-map')return transmission.mapping;if(path==='transmission.external-implementation'){const m=articulationDependency(component,'TRANSMISSION_IMPLEMENTATION_MANIFEST',()=>true,'transmission implementation manifest');const implementations=(m.implementations??[]).filter((item)=>{const refs=transmission.mapping?.kind==='NONLINEAR'?[transmission.mapping.positionModelRef,transmission.mapping.jacobianModelRef]:transmission.mapping?.kind==='EXTERNAL_SOLVER'?[transmission.mapping.solverRef]:[];return refs.some((ref)=>ref?.schema===item.schema&&ref?.id===item.id&&ref?.digest===item.digest);});return{artifactDigest:m.artifactDigest,implementations};}}if(path.startsWith('actuation.')){const actuator=recordBySubject(contract.actuators,'actuatorId',subjects,'actuator');if(path==='actuation.kind')return actuator.kind;if(path==='actuation.coordinate-class')return actuator.coordinateClass;if(path==='actuation.position-range')return actuator.positionRange?.value??null;if(path==='actuation.velocity-limit')return actuator.velocityLimit?.value??null;if(path==='actuation.effort-limit')return actuator.effortLimit?.value??null;if(path==='actuation.stiffness')return actuator.stiffness?.value??null;if(path==='actuation.damping')return actuator.damping?.value??null;if(path==='actuation.armature')return actuator.armature?.value??null;if(path==='actuation.control-modes')return actuator.supportedControlModes?.value??null;if(path==='actuation.response-latency')return actuator.responseLatency?.value??null;}if(path.startsWith('control.')){const profile=recordBySubject(contract.profiles,'profileId',subjects,'control profile');if(path==='control.coordinate-class')return profile.coordinateClass;if(path==='control.mode')return profile.mode?.value??null;if(path==='control.command-space')return profile.commandSpace;if(path==='control.gains')return profile.gainModel?.value??null;if(path==='control.delay')return profile.controllerDelay?.value??null;}if(path.startsWith('runtime.')){const binding=recordBySubject(contract.bindings,'bindingId',subjects,'runtime binding');if(path==='runtime.endpoint')return binding.selector;if(path==='runtime.coordinate-class')return binding.coordinateClass;if(path==='runtime.locator')return{device:binding.device?.value??null,bus:binding.bus?.value??null};if(path==='runtime.index')return binding.runtimeIndex?.value??null;if(path==='runtime.calibration')return{sign:binding.sign?.value??null,zeroOffset:binding.zeroOffset?.value??null,encoderScale:binding.encoderScale?.value??null};if(path==='runtime.transport-delay')return binding.transportDelay?.value??null;}throw new Error(`semantic JSON normalizer does not support semantic path ${path}`);}
export function createSemanticJsonRepresentationNormalizer(){return Object.freeze({id:'refas-semantic-json-normalizer',backend:'refas-semantic-json',version:'1',normalize({manifest,obligations,artifacts}){const candidates=artifacts.filter((a)=>a.path==='semantic/physical-asset.json');if(candidates.length!==1)throw new Error(`refas-semantic-json requires exactly one semantic/physical-asset.json artifact; found ${candidates.length}`);const artifact=candidates[0];let document;try{document=JSON.parse(Buffer.from(artifact.content).toString('utf8'));}catch(error){throw new Error(`refas-semantic-json artifact is not valid JSON: ${error.message}`);}if(document?.schema!=='refas.semantic-json-backend/v1')throw new Error('refas-semantic-json artifact has invalid schema');if(document.canonicalViewDigest!==manifest.canonicalBinding.canonicalViewDigest)throw new Error('refas-semantic-json canonicalViewDigest does not match P12 export binding');const dispositionById=new Map(manifest.dispositions.map((x)=>[x.obligationId,x])),readings=[];for(const obligation of obligations){const disposition=dispositionById.get(obligation.obligationId);if(!disposition)throw new Error(`P12 export is missing disposition ${obligation.obligationId}`);if(disposition.status==='OMITTED_UNSUPPORTED')continue;readings.push({obligationId:obligation.obligationId,sources:disposition.targets.map((target)=>({artifactId:target.artifactId,locator:target.locator})),value:semanticJsonValueForObligation(document,obligation)});}return{readings};}});}
