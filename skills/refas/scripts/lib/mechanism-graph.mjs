import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {canonicalizePhysicalQuaternion, validatePhysicalIdentityGraph} from './physical-identity-graph.mjs';
import {physicalArticulationIdentityProjection} from './articulation-graph.mjs';
import {validateSemanticAuthoritySet} from './semantic-authority.mjs';

export const MECHANISM_GRAPH_SCHEMA = 'refas.mechanism-graph/v1';
export const PHYSICAL_MECHANISM_IDENTITY_BINDING_SCHEMA = 'refas.physical-mechanism-identity-binding/v1';
export const PHYSICAL_MECHANISM_IDENTITY_PROJECTION_SCHEMA = 'refas.physical-mechanism-identity-projection/v1';
export const MECHANISM_ARTICULATION_BINDING_SCHEMA = 'refas.mechanism-articulation-binding/v1';
export const MECHANISM_ARTICULATION_PROJECTION_SCHEMA = 'refas.mechanism-articulation-projection/v1';

export const MECHANISM_KINDS = Object.freeze(['DIRECT','GEAR','BELT','LINKAGE','PARALLEL_LINKAGE','TENDON','DIFFERENTIAL','COUPLED','CUSTOM']);
export const MECHANISM_MEMBER_ROLES = Object.freeze(['CONTACT_ELEMENT','LINK_ELEMENT','CARRIER','GUIDE','TENSION_ELEMENT','SUPPORT','CUSTOM']);
export const MECHANISM_EDGE_KINDS = Object.freeze(['FIXED_TO','MESHES_WITH','BELT_CONTACT','PIN_CONNECTED','SLIDING_CONTACT','ROUTES_OVER','COUPLED_WITH','CUSTOM']);

const KIND_SET = new Set(MECHANISM_KINDS);
const ROLE_SET = new Set(MECHANISM_MEMBER_ROLES);
const EDGE_SET = new Set(MECHANISM_EDGE_KINDS);
const MEMBER_IDENTITY_KINDS = new Set(['physical-part','rigid-link']);
const DIRECT_INCIDENCE_ROLES = new Set(['CONTACT_ELEMENT','LINK_ELEMENT']);
const CONSTRUCTION_AUTHORITIES = new Set(['observed','inferred','engineered']);
const TOP_LEVEL_KEYS = new Set(['schema','scopeId','sourceSha256','identityGraph','articulationGraph','identityBinding','articulationBinding','mechanisms','policy','mechanismDigest']);
const IDENTITY_BINDING_KEYS = new Set(['schema','sourceSchema','projectionDigest']);
const ARTICULATION_BINDING_KEYS = new Set(['schema','sourceSchema','projectionDigest']);
const MECHANISM_KEYS = new Set(['mechanismId','kind','realizesRelationIds','realizedJointIds','members','edges','authoritySubjectId']);
const MEMBER_KEYS = new Set(['id','physicalIdentityId','role']);
const EDGE_KEYS = new Set(['id','kind','memberIds','authoritySubjectId']);
const IDENTITY_TRANSFORM = Object.freeze({translation_m:[0,0,0],rotation_quat_xyzw:[0,0,0,1]});

function assertRecord(value,label){if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`${label} must be an object`);return value;}
function assertKnownKeys(value,allowed,label){assertRecord(value,label);const extras=Object.keys(value).filter((key)=>!allowed.has(key));if(extras.length)throw new Error(`${label} contains unsupported field(s): ${extras.sort().join(', ')}`);}
function finite(value,label){if(typeof value!=='number'||!Number.isFinite(value))throw new Error(`${label} must be a finite number`);return Object.is(value,-0)?0:value;}
function vector3(value,label){if(!Array.isArray(value)||value.length!==3)throw new Error(`${label} must contain exactly 3 numbers`);return value.map((item,index)=>finite(item,`${label}[${index}]`));}
function normalizedIds(value,label,{nonEmpty=false}={}){if(!Array.isArray(value))throw new Error(`${label} must be an array`);if(nonEmpty&&!value.length)throw new Error(`${label} must not be empty`);const ids=value.map((item,index)=>assertId(item,`${label}[${index}]`)).sort();if(new Set(ids).size!==ids.length)throw new Error(`${label} must contain unique IDs`);return ids;}

function multiplyQuaternion(left,right){const[lx,ly,lz,lw]=left,[rx,ry,rz,rw]=right;return canonicalizePhysicalQuaternion([lw*rx+lx*rw+ly*rz-lz*ry,lw*ry-lx*rz+ly*rw+lz*rx,lw*rz+lx*ry-ly*rx+lz*rw,lw*rw-lx*rx-ly*ry-lz*rz],'composed rotation_quat_xyzw');}
function rotateVector(q,v){const[x,y,z,w]=q,[vx,vy,vz]=v,tx=2*(y*vz-z*vy),ty=2*(z*vx-x*vz),tz=2*(x*vy-y*vx);return[vx+w*tx+(y*tz-z*ty),vy+w*ty+(z*tx-x*tz),vz+w*tz+(x*ty-y*tx)].map((item)=>Object.is(item,-0)?0:item);}
function composeTransform(parent,child){const rotated=rotateVector(parent.rotation_quat_xyzw,child.translation_m);return{translation_m:parent.translation_m.map((item,index)=>{const result=item+rotated[index];return Object.is(result,-0)?0:result;}),rotation_quat_xyzw:multiplyQuaternion(parent.rotation_quat_xyzw,child.rotation_quat_xyzw)};}
function inverseTransform(transform){const q=canonicalizePhysicalQuaternion(transform.rotation_quat_xyzw,'inverse.rotation'),inverseRotation=canonicalizePhysicalQuaternion([-q[0],-q[1],-q[2],q[3]],'inverse.rotation'),inverseTranslation=rotateVector(inverseRotation,transform.translation_m.map((value)=>-value));return{translation_m:inverseTranslation,rotation_quat_xyzw:inverseRotation};}
function relativeTransform(parentWorld,childWorld){return composeTransform(inverseTransform(parentWorld),childWorld);}
function transformEquivalent(left,right,tolerance=1e-10){if(!left||!right)return false;for(let i=0;i<3;i+=1)if(Math.abs(left.translation_m[i]-right.translation_m[i])>tolerance)return false;const lq=canonicalizePhysicalQuaternion(left.rotation_quat_xyzw,'left.rotation'),rq=canonicalizePhysicalQuaternion(right.rotation_quat_xyzw,'right.rotation');for(let i=0;i<4;i+=1)if(Math.abs(lq[i]-rq[i])>tolerance)return false;return true;}

function resolveEntityWorld(entityId,entityById,memo=new Map(),visiting=new Set()){
  if(memo.has(entityId))return memo.get(entityId);
  if(visiting.has(entityId))throw new Error(`physical frame graph contains a cycle at ${entityId}`);
  const entity=entityById.get(entityId);if(!entity)throw new Error(`cannot resolve unknown physical identity frame: ${entityId}`);
  visiting.add(entityId);
  let resolved;
  if(!entity.frame){resolved={rootId:entity.id,transform:{translation_m:[...IDENTITY_TRANSFORM.translation_m],rotation_quat_xyzw:[...IDENTITY_TRANSFORM.rotation_quat_xyzw]}};}
  else{const parent=resolveEntityWorld(entity.frame.parentId,entityById,memo,visiting);resolved={rootId:parent.rootId,transform:composeTransform(parent.transform,{translation_m:vector3(entity.frame.translation_m,`${entity.id}.frame.translation_m`),rotation_quat_xyzw:canonicalizePhysicalQuaternion(entity.frame.rotation_quat_xyzw,`${entity.id}.frame.rotation_quat_xyzw`)})};}
  visiting.delete(entityId);memo.set(entityId,resolved);return resolved;
}

function resolvedMemberFrameInMechanism(entityById,mechanismId,memberIdentityId){const memo=new Map(),mechanism=resolveEntityWorld(mechanismId,entityById,memo),member=resolveEntityWorld(memberIdentityId,entityById,memo);if(mechanism.rootId!==member.rootId)throw new Error(`mechanism ${mechanismId} and member ${memberIdentityId} do not share one physical frame root`);return relativeTransform(mechanism.transform,member.transform);}
function validateIdentityGraph(identityGraph){const validation=validatePhysicalIdentityGraph(identityGraph);if(!validation.valid)throw new Error(`identityGraph is invalid: ${validation.errors.join('; ')}`);return identityGraph;}
function aggregationForMember(identityGraph,entity,member){if(entity.kind==='rigid-link')return null;const matches=identityGraph.relations.filter((relation)=>relation.kind==='AGGREGATES_INTO'&&relation.sourceId===entity.id);if(matches.length>1)throw new Error(`mechanism physical-part member ${member.id} may have at most one AGGREGATES_INTO relation`);if(matches.length===0){if(member.role==='TENSION_ELEMENT')return null;throw new Error(`mechanism physical-part member ${member.id} requires exactly one AGGREGATES_INTO relation`);}const relation=matches[0];return{id:relation.id,kind:relation.kind,sourceId:relation.sourceId,targetIds:[...relation.targetIds]};}
function effectiveMemberRigidLinkId(identityGraph,entity,member){if(entity.kind==='rigid-link')return entity.id;const aggregation=aggregationForMember(identityGraph,entity,member);return aggregation?.targetIds?.[0]??null;}

export function mechanismTopologyAuthoritySubjectId(mechanismId){const id=assertId(mechanismId,'mechanismId'),readable=`${id}:mechanism-topology`;if(readable.length<=128)return assertId(readable,'authoritySubjectId');return assertId(`mechanism:${digestJson({mechanismId:id,kind:'topology'}).slice(0,48)}`,'authoritySubjectId');}
export function mechanismEdgeAuthoritySubjectId(mechanismId,edgeId){const mid=assertId(mechanismId,'mechanismId'),eid=assertId(edgeId,'edgeId'),readable=`${mid}:mechanism-edge:${eid}`;if(readable.length<=128)return assertId(readable,'authoritySubjectId');return assertId(`mechanism-edge:${digestJson({mechanismId:mid,edgeId:eid}).slice(0,48)}`,'authoritySubjectId');}

function validateConnectedTopology(mechanism){if(mechanism.members.length<=1)return;const adjacency=new Map(mechanism.members.map((member)=>[member.id,new Set()]));for(const edge of mechanism.edges){for(const from of edge.memberIds)for(const to of edge.memberIds)if(from!==to)adjacency.get(from)?.add(to);}const visited=new Set(),stack=[mechanism.members[0].id];while(stack.length){const id=stack.pop();if(visited.has(id))continue;visited.add(id);for(const next of adjacency.get(id)??[])if(!visited.has(next))stack.push(next);}if(visited.size!==mechanism.members.length)throw new Error(`mechanism ${mechanism.mechanismId} structural topology must be connected`);}

function validateKindTopology(mechanism){
  const memberById=new Map(mechanism.members.map((member)=>[member.id,member]));
  const byEdge=(kind)=>mechanism.edges.filter((edge)=>edge.kind===kind);
  const byRole=(role)=>mechanism.members.filter((member)=>member.role===role);
  const requireEdge=(kind)=>{if(!byEdge(kind).length)throw new Error(`${mechanism.kind} mechanism ${mechanism.mechanismId} requires at least one ${kind} structural edge`);};
  const requireRole=(role)=>{if(!byRole(role).length)throw new Error(`${mechanism.kind} mechanism ${mechanism.mechanismId} requires at least one ${role} member`);};
  if(mechanism.kind==='GEAR')requireEdge('MESHES_WITH');
  if(mechanism.kind==='BELT'){requireEdge('BELT_CONTACT');requireRole('TENSION_ELEMENT');}
  if(['LINKAGE','PARALLEL_LINKAGE'].includes(mechanism.kind)){requireEdge('PIN_CONNECTED');requireRole('LINK_ELEMENT');}
  if(mechanism.kind==='TENDON'){requireEdge('ROUTES_OVER');requireRole('TENSION_ELEMENT');}
  if(['DIFFERENTIAL','COUPLED'].includes(mechanism.kind))requireEdge('COUPLED_WITH');
  for(const edge of mechanism.edges){
    if(['FIXED_TO','MESHES_WITH','BELT_CONTACT','PIN_CONNECTED','SLIDING_CONTACT'].includes(edge.kind)&&edge.memberIds.length!==2)throw new Error(`${edge.kind} edge ${edge.id} must connect exactly two mechanism members`);
    const roles=edge.memberIds.map((memberId)=>memberById.get(memberId)?.role);
    if(edge.kind==='MESHES_WITH'&&roles.some((role)=>role!=='CONTACT_ELEMENT'))throw new Error(`MESHES_WITH edge ${edge.id} requires CONTACT_ELEMENT members`);
    if(edge.kind==='BELT_CONTACT'&&!(roles.includes('TENSION_ELEMENT')&&roles.includes('CONTACT_ELEMENT')))throw new Error(`BELT_CONTACT edge ${edge.id} requires one TENSION_ELEMENT and one CONTACT_ELEMENT member`);
    if(edge.kind==='PIN_CONNECTED'&&(!(roles.every((role)=>['LINK_ELEMENT','CARRIER'].includes(role)))||!roles.includes('LINK_ELEMENT')))throw new Error(`PIN_CONNECTED edge ${edge.id} requires LINK_ELEMENT/CARRIER members and at least one LINK_ELEMENT`);
    if(edge.kind==='SLIDING_CONTACT'&&!(roles.includes('GUIDE')&&roles.some((role)=>['LINK_ELEMENT','CONTACT_ELEMENT'].includes(role))))throw new Error(`SLIDING_CONTACT edge ${edge.id} requires a GUIDE and a LINK_ELEMENT or CONTACT_ELEMENT member`);
    if(edge.kind==='ROUTES_OVER'&&!(roles.includes('TENSION_ELEMENT')&&roles.some((role)=>['GUIDE','CONTACT_ELEMENT'].includes(role))))throw new Error(`ROUTES_OVER edge ${edge.id} requires a TENSION_ELEMENT and a GUIDE or CONTACT_ELEMENT member`);
  }
}

function normalizeMechanism(raw,index){
  const label=`mechanisms[${index}]`;assertKnownKeys(raw,MECHANISM_KEYS,label);
  const mechanismId=assertId(raw.mechanismId,`${label}.mechanismId`),kind=String(raw.kind??'').trim().toUpperCase();if(!KIND_SET.has(kind))throw new Error(`${label}.kind must be one of: ${MECHANISM_KINDS.join(', ')}`);
  const realizesRelationIds=normalizedIds(raw.realizesRelationIds,`${label}.realizesRelationIds`,{nonEmpty:true}),realizedJointIds=normalizedIds(raw.realizedJointIds,`${label}.realizedJointIds`,{nonEmpty:true});
  if(!Array.isArray(raw.members)||!raw.members.length)throw new Error(`${label}.members must contain at least one structural member`);
  const members=raw.members.map((member,memberIndex)=>{const memberLabel=`${label}.members[${memberIndex}]`;assertKnownKeys(member,MEMBER_KEYS,memberLabel);const role=String(member.role??'').trim().toUpperCase();if(!ROLE_SET.has(role))throw new Error(`${memberLabel}.role must be one of: ${MECHANISM_MEMBER_ROLES.join(', ')}`);return{id:assertId(member.id,`${memberLabel}.id`),physicalIdentityId:assertId(member.physicalIdentityId,`${memberLabel}.physicalIdentityId`),role};}).sort((a,b)=>a.id.localeCompare(b.id));
  if(new Set(members.map((member)=>member.id)).size!==members.length)throw new Error(`${label}.member IDs must be unique`);if(new Set(members.map((member)=>member.physicalIdentityId)).size!==members.length)throw new Error(`${label}.physical member identities must be unique within a mechanism`);
  if(!Array.isArray(raw.edges))throw new Error(`${label}.edges must be an array`);
  const memberIds=new Set(members.map((member)=>member.id));
  const edges=raw.edges.map((edge,edgeIndex)=>{const edgeLabel=`${label}.edges[${edgeIndex}]`;assertKnownKeys(edge,EDGE_KEYS,edgeLabel);const id=assertId(edge.id,`${edgeLabel}.id`),edgeKind=String(edge.kind??'').trim().toUpperCase();if(!EDGE_SET.has(edgeKind))throw new Error(`${edgeLabel}.kind must be one of: ${MECHANISM_EDGE_KINDS.join(', ')}`);const edgeMemberIds=normalizedIds(edge.memberIds,`${edgeLabel}.memberIds`,{nonEmpty:true});if(edgeMemberIds.length<2)throw new Error(`${edgeLabel}.memberIds must contain at least two members`);for(const memberId of edgeMemberIds)if(!memberIds.has(memberId))throw new Error(`${edgeLabel} references unknown mechanism member: ${memberId}`);const expected=mechanismEdgeAuthoritySubjectId(mechanismId,id),authoritySubjectId=edge.authoritySubjectId==null?expected:assertId(edge.authoritySubjectId,`${edgeLabel}.authoritySubjectId`);if(authoritySubjectId!==expected)throw new Error(`${edgeLabel}.authoritySubjectId must be canonical subject ${expected}`);return{id,kind:edgeKind,memberIds:edgeMemberIds,authoritySubjectId};}).sort((a,b)=>a.id.localeCompare(b.id));
  if(new Set(edges.map((edge)=>edge.id)).size!==edges.length)throw new Error(`${label}.edge IDs must be unique`);
  const expectedAuthority=mechanismTopologyAuthoritySubjectId(mechanismId),authoritySubjectId=raw.authoritySubjectId==null?expectedAuthority:assertId(raw.authoritySubjectId,`${label}.authoritySubjectId`);if(authoritySubjectId!==expectedAuthority)throw new Error(`${label}.authoritySubjectId must be canonical subject ${expectedAuthority}`);
  const mechanism={mechanismId,kind,realizesRelationIds,realizedJointIds,members,edges,authoritySubjectId};validateConnectedTopology(mechanism);validateKindTopology(mechanism);return mechanism;
}

function normalizeIdentityBinding(raw,label='identityBinding'){assertKnownKeys(raw,IDENTITY_BINDING_KEYS,label);if(raw.schema!==PHYSICAL_MECHANISM_IDENTITY_BINDING_SCHEMA)throw new Error(`${label}.schema must be ${PHYSICAL_MECHANISM_IDENTITY_BINDING_SCHEMA}`);if(raw.sourceSchema!=='refas.physical-identity-graph/v1')throw new Error(`${label}.sourceSchema must be refas.physical-identity-graph/v1`);return{schema:raw.schema,sourceSchema:raw.sourceSchema,projectionDigest:assertDigest(raw.projectionDigest,`${label}.projectionDigest`)};}
function normalizeArticulationBinding(raw,label='articulationBinding'){assertKnownKeys(raw,ARTICULATION_BINDING_KEYS,label);if(raw.schema!==MECHANISM_ARTICULATION_BINDING_SCHEMA)throw new Error(`${label}.schema must be ${MECHANISM_ARTICULATION_BINDING_SCHEMA}`);if(raw.sourceSchema!=='refas.articulation-graph/v1')throw new Error(`${label}.sourceSchema must be refas.articulation-graph/v1`);return{schema:raw.schema,sourceSchema:raw.sourceSchema,projectionDigest:assertDigest(raw.projectionDigest,`${label}.projectionDigest`)};}

export function physicalMechanismIdentityProjection(identityGraph,mechanisms){
  validateIdentityGraph(identityGraph);if(!Array.isArray(mechanisms)||!mechanisms.length)throw new Error('physical mechanism identity projection requires mechanism records');
  const entityById=new Map(identityGraph.entities.map((entity)=>[entity.id,entity])),relationById=new Map(identityGraph.relations.map((relation)=>[relation.id,relation]));
  const projected=mechanisms.map((mechanism)=>{
    const mechanismEntity=entityById.get(mechanism.mechanismId);if(!mechanismEntity)throw new Error(`mechanism references unknown physical identity: ${mechanism.mechanismId}`);if(mechanismEntity.kind!=='mechanism')throw new Error(`mechanism ${mechanism.mechanismId} must bind a P01 mechanism identity, found ${mechanismEntity.kind}`);if(!mechanismEntity.frame)throw new Error(`mechanism identity ${mechanism.mechanismId} requires a canonical physical frame`);
    const realizesRelations=mechanism.realizesRelationIds.map((relationId)=>{const relation=relationById.get(relationId);if(!relation)throw new Error(`mechanism ${mechanism.mechanismId} references unknown REALIZES relation: ${relationId}`);if(relation.kind!=='REALIZES'||relation.sourceId!==mechanism.mechanismId)throw new Error(`relation ${relationId} must be REALIZES from mechanism ${mechanism.mechanismId}`);return{id:relation.id,kind:relation.kind,sourceId:relation.sourceId,targetIds:[...relation.targetIds]};}).sort((a,b)=>a.id.localeCompare(b.id));
    const realizedTargets=[...new Set(realizesRelations.flatMap((relation)=>relation.targetIds))].sort();if(digestJson(realizedTargets)!==digestJson(mechanism.realizedJointIds))throw new Error(`mechanism ${mechanism.mechanismId} realizedJointIds must equal the union of its P01 REALIZES targets`);
    const realizedJoints=mechanism.realizedJointIds.map((jointId)=>{const entity=entityById.get(jointId);if(!entity)throw new Error(`mechanism ${mechanism.mechanismId} realizes unknown physical identity: ${jointId}`);if(entity.kind!=='virtual-joint')throw new Error(`mechanism ${mechanism.mechanismId} realized subject ${jointId} must be virtual-joint, found ${entity.kind}`);return{id:entity.id,kind:entity.kind,frame:entity.frame??null};});
    const members=mechanism.members.map((member)=>{const entity=entityById.get(member.physicalIdentityId);if(!entity)throw new Error(`mechanism member ${member.id} references unknown physical identity: ${member.physicalIdentityId}`);if(!MEMBER_IDENTITY_KINDS.has(entity.kind))throw new Error(`mechanism member ${member.id} must reference physical-part or rigid-link, found ${entity.kind}`);if(!entity.frame)throw new Error(`mechanism member ${member.id} physical identity requires a canonical frame`);const aggregation=aggregationForMember(identityGraph,entity,member),effectiveRigidLinkId=effectiveMemberRigidLinkId(identityGraph,entity,member);return{memberId:member.id,physicalIdentity:{id:entity.id,kind:entity.kind,frame:entity.frame},aggregation,effectiveRigidLinkId,resolvedFrameInMechanism:resolvedMemberFrameInMechanism(entityById,mechanism.mechanismId,entity.id)};}).sort((a,b)=>a.memberId.localeCompare(b.memberId));
    return{mechanism:{id:mechanismEntity.id,kind:mechanismEntity.kind,frame:mechanismEntity.frame},realizesRelations,realizedJoints,members};
  }).sort((a,b)=>a.mechanism.id.localeCompare(b.mechanism.id));
  return deepFreeze({schema:PHYSICAL_MECHANISM_IDENTITY_PROJECTION_SCHEMA,scopeId:identityGraph.scopeId,sourceSha256:identityGraph.sourceSha256,mechanisms:projected});
}

function validateArticulationEnvelope(articulationGraph){assertRecord(articulationGraph,'articulationGraph');if(articulationGraph.schema!=='refas.articulation-graph/v1')throw new Error('articulationGraph must use refas.articulation-graph/v1');const digest=assertDigest(articulationGraph.articulationDigest,'articulationGraph.articulationDigest'),payload=structuredClone(articulationGraph);delete payload.articulationDigest;if(digestJson(payload)!==digest)throw new Error('articulationGraph digest mismatch');return articulationGraph;}

function mechanismIncidence(identityGraph,mechanisms,jointById){
  const entityById=new Map(identityGraph.entities.map((entity)=>[entity.id,entity]));
  return mechanisms.map((mechanism)=>{
    const realizedJoints=mechanism.realizedJointIds.map((jointId)=>{const joint=jointById.get(jointId);if(!joint)throw new Error(`mechanism realized joint ${jointId} is not present in the current articulation graph`);return{virtualJointId:jointId,incidentLinkIds:[joint.parentLinkId,joint.childLinkId].sort()};});
    const incidentLinkSet=new Set(realizedJoints.flatMap((joint)=>joint.incidentLinkIds));
    const members=mechanism.members.map((member)=>{const entity=entityById.get(member.physicalIdentityId);if(!entity)throw new Error(`mechanism member ${member.id} references unknown physical identity: ${member.physicalIdentityId}`);const effectiveRigidLinkId=effectiveMemberRigidLinkId(identityGraph,entity,member);if(DIRECT_INCIDENCE_ROLES.has(member.role)&&!effectiveRigidLinkId)throw new Error(`mechanism member ${member.id} role ${member.role} requires rigid-link incidence`);if(DIRECT_INCIDENCE_ROLES.has(member.role)&&!incidentLinkSet.has(effectiveRigidLinkId))throw new Error(`mechanism member ${member.id} effective rigid link ${effectiveRigidLinkId} is not incident to any realized articulation joint`);const incidentJointIds=effectiveRigidLinkId==null?[]:realizedJoints.filter((joint)=>joint.incidentLinkIds.includes(effectiveRigidLinkId)).map((joint)=>joint.virtualJointId).sort();return{memberId:member.id,effectiveRigidLinkId,incidentJointIds};}).sort((a,b)=>a.memberId.localeCompare(b.memberId));
    for(const joint of realizedJoints)if(!members.some((member)=>member.incidentJointIds.includes(joint.virtualJointId)))throw new Error(`mechanism ${mechanism.mechanismId} realized joint ${joint.virtualJointId} has no physically incident mechanism member`);
    return{mechanismId:mechanism.mechanismId,realizedJoints,members};
  }).sort((a,b)=>a.mechanismId.localeCompare(b.mechanismId));
}

export function mechanismArticulationProjection(articulationGraph,jointIds,{identityGraph=null,mechanisms=null}={}){
  validateArticulationEnvelope(articulationGraph);
  const ids=normalizedIds(jointIds,'jointIds',{nonEmpty:true}),jointById=new Map((articulationGraph.joints??[]).map((joint)=>[joint.virtualJointId,joint]));
  const joints=ids.map((jointId)=>{const joint=jointById.get(jointId);if(!joint)throw new Error(`mechanism realized joint ${jointId} is not present in the current articulation graph`);return structuredClone(joint);});
  const projection={schema:MECHANISM_ARTICULATION_PROJECTION_SCHEMA,scopeId:articulationGraph.scopeId,sourceSha256:articulationGraph.sourceSha256,joints};
  if(identityGraph){
    validateIdentityGraph(identityGraph);if(identityGraph.scopeId!==articulationGraph.scopeId||identityGraph.sourceSha256!==articulationGraph.sourceSha256)throw new Error('articulation graph and physical identity graph scope/source differ');
    const linkIds=[...new Set(joints.flatMap((joint)=>[joint.parentLinkId,joint.childLinkId]))].sort(),directedJoints=joints.map((joint)=>({virtualJointId:joint.virtualJointId,parentLinkId:joint.parentLinkId,childLinkId:joint.childLinkId}));
    const liveIdentityProjection=physicalArticulationIdentityProjection(identityGraph,linkIds,ids,directedJoints),edgeById=new Map(liveIdentityProjection.resolvedEdges.map((edge)=>[edge.virtualJointId,edge]));
    for(const joint of joints){const edge=edgeById.get(joint.virtualJointId);if(!edge||!transformEquivalent(joint.referenceChildFrameInParent,edge.resolvedChildFrameInParent))throw new Error(`mechanism realized joint ${joint.virtualJointId} articulation reference pose is stale against the current physical identity graph`);}
    projection.liveIdentityProjection=liveIdentityProjection;
    if(mechanisms){if(!Array.isArray(mechanisms)||!mechanisms.length)throw new Error('mechanisms must contain at least one record for incidence validation');projection.incidence=mechanismIncidence(identityGraph,mechanisms,jointById);}
  }else if(mechanisms){throw new Error('mechanism incidence validation requires the current physical identity graph');}
  return deepFreeze(projection);
}

function liveIdentityBinding(identityGraph,mechanisms){const projection=physicalMechanismIdentityProjection(identityGraph,mechanisms);return{schema:PHYSICAL_MECHANISM_IDENTITY_BINDING_SCHEMA,sourceSchema:identityGraph.schema,projectionDigest:digestJson(projection)};}
function liveArticulationBinding(identityGraph,articulationGraph,mechanisms){const jointIds=[...new Set(mechanisms.flatMap((mechanism)=>mechanism.realizedJointIds))].sort(),projection=mechanismArticulationProjection(articulationGraph,jointIds,{identityGraph,mechanisms});return{schema:MECHANISM_ARTICULATION_BINDING_SCHEMA,sourceSchema:articulationGraph.schema,projectionDigest:digestJson(projection)};}

function buildMechanismPayload(raw,{identityGraph=raw?.identityGraph??null,articulationGraph=raw?.articulationGraph??null,requireLiveBindings=false}={}){
  assertKnownKeys(raw,TOP_LEVEL_KEYS,'mechanism graph input');
  const scopeId=assertId(raw.scopeId,'scopeId'),sourceSha256=assertDigest(raw.sourceSha256,'sourceSha256');if(!Array.isArray(raw.mechanisms)||!raw.mechanisms.length)throw new Error('mechanism graph requires at least one mechanism record');
  const mechanisms=raw.mechanisms.map(normalizeMechanism).sort((a,b)=>a.mechanismId.localeCompare(b.mechanismId));if(new Set(mechanisms.map((mechanism)=>mechanism.mechanismId)).size!==mechanisms.length)throw new Error('mechanism identities must be unique');
  const edgeSubjects=mechanisms.flatMap((mechanism)=>mechanism.edges.map((edge)=>edge.authoritySubjectId)),topologySubjects=mechanisms.map((mechanism)=>mechanism.authoritySubjectId);if(new Set([...topologySubjects,...edgeSubjects]).size!==topologySubjects.length+edgeSubjects.length)throw new Error('mechanism semantic-authority subjects must be globally unique');
  let identityBinding,articulationBinding;
  if(identityGraph){validateIdentityGraph(identityGraph);if(identityGraph.scopeId!==scopeId||identityGraph.sourceSha256!==sourceSha256)throw new Error('identity graph and mechanism graph scope/source differ');const live=liveIdentityBinding(identityGraph,mechanisms);if(raw.identityBinding!=null&&digestJson(normalizeIdentityBinding(raw.identityBinding))!==digestJson(live))throw new Error('identityBinding does not bind the current mechanism-relevant identity projection');identityBinding=live;}else{if(requireLiveBindings)throw new Error('mechanism graph creation requires the physical identity graph');identityBinding=normalizeIdentityBinding(raw.identityBinding);}
  if(articulationGraph){validateArticulationEnvelope(articulationGraph);if(articulationGraph.scopeId!==scopeId||articulationGraph.sourceSha256!==sourceSha256)throw new Error('articulation graph and mechanism graph scope/source differ');if(!identityGraph)throw new Error('live articulation binding requires the current physical identity graph');const live=liveArticulationBinding(identityGraph,articulationGraph,mechanisms);if(raw.articulationBinding!=null&&digestJson(normalizeArticulationBinding(raw.articulationBinding))!==digestJson(live))throw new Error('articulationBinding does not bind the current mechanism-relevant articulation projection');articulationBinding=live;}else{if(requireLiveBindings)throw new Error('mechanism graph creation requires the articulation graph');articulationBinding=normalizeArticulationBinding(raw.articulationBinding);}
  return{schema:MECHANISM_GRAPH_SCHEMA,scopeId,sourceSha256,identityBinding,articulationBinding,mechanisms,policy:{mechanismIdentityRemainsDistinctFromVirtualJoint:true,physicalStructureDoesNotImplyTransmission:true,stableMemberAndEdgeIdsRequired:true,backendIndicesAreNotSemanticIdentity:true,scopedIdentityBinding:true,scopedArticulationBinding:true,resolvedMemberPoseBound:true,semanticAuthorityRemainsExternal:true,mechanismGraphDoesNotAuthorizeClosure:true}};
}

export function createMechanismGraph(input={}){const payload=buildMechanismPayload(input,{identityGraph:input.identityGraph??null,articulationGraph:input.articulationGraph??null,requireLiveBindings:true});return deepFreeze({...payload,mechanismDigest:digestJson(payload)});}
export function validateMechanismGraph(value){const errors=[];try{if(value?.schema!==MECHANISM_GRAPH_SCHEMA)errors.push('invalid schema');const payload=buildMechanismPayload(value,{identityGraph:null,articulationGraph:null,requireLiveBindings:false}),recreated={...payload,mechanismDigest:digestJson(payload)};if(recreated.mechanismDigest!==value?.mechanismDigest)errors.push('mechanism graph digest mismatch');if(digestJson(recreated)!==digestJson(value))errors.push('mechanism graph is not canonical');}catch(error){errors.push(error.message);}return{valid:errors.length===0,errors};}
export function validateMechanismGraphBindings(value,identityGraph,articulationGraph){const errors=[],validation=validateMechanismGraph(value);if(!validation.valid)errors.push(`mechanism graph invalid: ${validation.errors.join('; ')}`);try{if(!errors.length){validateIdentityGraph(identityGraph);validateArticulationEnvelope(articulationGraph);if(identityGraph.scopeId!==value.scopeId||identityGraph.sourceSha256!==value.sourceSha256)errors.push('mechanism graph and identity graph scope/source differ');if(articulationGraph.scopeId!==value.scopeId||articulationGraph.sourceSha256!==value.sourceSha256)errors.push('mechanism graph and articulation graph scope/source differ');if(!errors.length){const identityLive=liveIdentityBinding(identityGraph,value.mechanisms),articulationLive=liveArticulationBinding(identityGraph,articulationGraph,value.mechanisms);if(digestJson(identityLive)!==digestJson(value.identityBinding))errors.push('mechanism graph does not bind the current mechanism-relevant identity projection');if(digestJson(articulationLive)!==digestJson(value.articulationBinding))errors.push('mechanism graph does not bind the current mechanism-relevant articulation projection');}}}catch(error){errors.push(error.message);}return{valid:errors.length===0,errors};}
export function validateMechanismGraphAuthority(graph,authoritySet){const errors=[],graphValidation=validateMechanismGraph(graph),authorityValidation=validateSemanticAuthoritySet(authoritySet);if(!graphValidation.valid)errors.push(`mechanism graph invalid: ${graphValidation.errors.join('; ')}`);if(!authorityValidation.valid)errors.push(`semantic authority set invalid: ${authorityValidation.errors.join('; ')}`);if(errors.length)return{valid:false,errors,missingSubjectIds:[],unknownSubjectIds:[]};if(authoritySet.scopeId!==graph.scopeId||authoritySet.sourceSha256!==graph.sourceSha256)errors.push('authority set scope/source does not match mechanism graph');if(authoritySet.targetSchema!==graph.schema||authoritySet.targetDigest!==graph.mechanismDigest)errors.push('authority set does not bind the exact mechanism graph');const required=[...graph.mechanisms.flatMap((mechanism)=>[mechanism.authoritySubjectId,...mechanism.edges.map((edge)=>edge.authoritySubjectId)])].sort(),entryBySubject=new Map(authoritySet.entries.map((entry)=>[entry.subjectId,entry])),missingSubjectIds=required.filter((subjectId)=>!entryBySubject.has(subjectId)),unknownSubjectIds=authoritySet.entries.map((entry)=>entry.subjectId).filter((subjectId)=>!required.includes(subjectId)).sort();if(missingSubjectIds.length)errors.push(`missing semantic authority for mechanism subject(s): ${missingSubjectIds.join(', ')}`);if(unknownSubjectIds.length)errors.push(`authority set references subject(s) outside mechanism graph: ${unknownSubjectIds.join(', ')}`);for(const subjectId of required){const entry=entryBySubject.get(subjectId);if(entry&&!CONSTRUCTION_AUTHORITIES.has(entry.authority))errors.push(`mechanism subject ${subjectId} requires observed, inferred, or engineered authority`);}return{valid:errors.length===0,errors,missingSubjectIds,unknownSubjectIds};}
export function mechanismById(graph,mechanismId){const validation=validateMechanismGraph(graph);if(!validation.valid)throw new Error(`mechanism graph is invalid: ${validation.errors.join('; ')}`);const id=assertId(mechanismId,'mechanismId');return graph.mechanisms.find((mechanism)=>mechanism.mechanismId===id)??null;}
