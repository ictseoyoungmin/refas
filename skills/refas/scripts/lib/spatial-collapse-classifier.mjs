import {assertId, digestJson} from './canonical.mjs';
import {resolveSpatialRoleAuthority} from './checkpoint-store.mjs';
import {
  SPATIAL_COLLAPSE_CLASSIFICATION_SCHEMA,
  SPATIAL_COLLAPSE_STATES,
  _classifySpatialCollapseFromAuthority,
} from './spatial-collapse-core.mjs';

export {
  SPATIAL_COLLAPSE_CLASSIFICATION_SCHEMA,
  SPATIAL_COLLAPSE_STATES,
  _classifySpatialCollapseFromAuthority,
} from './spatial-collapse-core.mjs';

export async function classifySpatialCollapse(root,input={}){
  const allowed=new Set(['checkpointId','scopeId','glb','spatialEvidence']);
  if(!input||typeof input!=='object'||Array.isArray(input)) throw new Error('VC03 classifier input must be an object');
  for(const key of Object.keys(input)){
    if(!allowed.has(key)) throw new Error(`VC03 classifier input contains unsupported field ${key}; frozen VC02 role cannot be overridden`);
  }
  const {checkpointId=null,scopeId=null,glb,spatialEvidence}=input;
  const resolvedScope=assertId(scopeId??spatialEvidence?.scopeId,'scopeId');
  if(spatialEvidence?.scopeId!==resolvedScope) throw new Error('VC03 requested scope must exactly match VC01 evidence scope');
  const roleAuthority=await resolveSpatialRoleAuthority(root,{checkpointId,scopeId:resolvedScope});
  if(!roleAuthority) throw new Error('VC03 requires frozen VC02 spatial role authority');
  return _classifySpatialCollapseFromAuthority({glb,spatialEvidence,roleAuthority});
}

export async function validateSpatialCollapseClassification(root,value,{checkpointId=null,glb,spatialEvidence}={}){
  const errors=[];
  try{
    if(value?.schema!==SPATIAL_COLLAPSE_CLASSIFICATION_SCHEMA) errors.push('invalid schema');
    const expected=await classifySpatialCollapse(root,{checkpointId,scopeId:value?.scopeId,glb,spatialEvidence});
    if(digestJson(expected)!==digestJson(value)) errors.push('spatial collapse classification is stale or non-canonical');
  }catch(error){
    errors.push(error.message);
  }
  return {valid:errors.length===0,errors};
}
