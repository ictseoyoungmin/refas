import {assertDigest, assertId, deepFreeze, digestJson} from './canonical.mjs';
import {resolveSpatialRoleAuthority} from './checkpoint-store.mjs';
import {validateSpatialClosureEvidence} from './spatial-closure-evidence.mjs';
import {SPATIAL_ROLE_VALUES} from './spatial-role-expectation.mjs';

export const SPATIAL_COLLAPSE_CLASSIFICATION_SCHEMA = 'refas.spatial-collapse-classification/v1';
export const SPATIAL_COLLAPSE_STATES = Object.freeze([
  'PLANAR_COLLAPSE',
  'NO_PLANAR_COLLAPSE',
  'INDETERMINATE',
  'NOT_APPLICABLE',
]);

const ROLE_SET=new Set(SPATIAL_ROLE_VALUES);
const round=(value)=>{
  if(!Number.isFinite(value)) throw new Error('spatial collapse signal must be finite');
  const result=Number(value.toFixed(12));
  return Object.is(result,-0)?0:result;
};
const ratio=(numerator,denominator)=>round(denominator>1e-12?numerator/denominator:0);
const median=(values)=>{
  const sorted=[...values].filter(Number.isFinite).sort((a,b)=>a-b);
  if(!sorted.length) return 0;
  const middle=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
};
const band=(value,collapsedAtOrBelow,clearAtOrAbove)=>(
  value<=collapsedAtOrBelow?'collapsed':
  value>=clearAtOrAbove?'clear':
  'ambiguous'
);
const makeSignal=({id,family,value,collapsedAtOrBelow,clearAtOrAbove,usedForDecision=true,reason})=>deepFreeze({
  id,
  family,
  value:round(value),
  band:band(value,collapsedAtOrBelow,clearAtOrAbove),
  collapsedAtOrBelow,
  clearAtOrAbove,
  usedForDecision,
  reason,
});

function validateAuthority(authority,scopeId){
  if(authority?.schema!=='refas.spatial-role-authority/v1') throw new Error('VC03 requires refas.spatial-role-authority/v1 from the VC02 runtime resolver');
  assertDigest(authority.sourceSha256,'roleAuthority.sourceSha256');
  assertDigest(authority.hierarchyDigest,'roleAuthority.hierarchyDigest');
  assertDigest(authority.expectationSetDigest,'roleAuthority.expectationSetDigest');
  assertDigest(authority.authorityDigest,'roleAuthority.authorityDigest');
  const {authorityDigest,...payload}=authority;
  if(digestJson(payload)!==authorityDigest) throw new Error('VC02 spatial role authority digest mismatch');
  const expectation=authority.selectedExpectation;
  if(!expectation) throw new Error('VC03 requires an exact selected VC02 scope expectation');
  if(expectation.scopeId!==scopeId) throw new Error(`VC01/VC02 scope mismatch: evidence=${scopeId} role=${expectation.scopeId}`);
  if(!ROLE_SET.has(expectation.role)) throw new Error(`unsupported frozen VC02 role: ${expectation.role}`);
  if(authority.policy?.candidateIndependent!==true||authority.policy?.classifierIndependent!==true){
    throw new Error('VC02 authority policy does not preserve candidate/classifier independence');
  }
  return expectation;
}

function commonSignals(evidence){
  const [p1,p2,p3]=evidence.principal?.axes??[];
  if(!p1||!p2||!p3) throw new Error('VC01 evidence is missing principal axes');
  const principalMinorRatio=ratio(p3.extent,p2.extent);

  const side=Number(evidence.projectedSupport?.SIDE?.normalizedBoundsArea);
  const top=Number(evidence.projectedSupport?.TOP?.normalizedBoundsArea);
  if(!Number.isFinite(side)||!Number.isFinite(top)) throw new Error('VC01 evidence is missing orthogonal projected support');
  const orthogonalProjectionFloor=Math.min(side,top);

  const sectionRatios=[];
  for(const axis of ['x','y']){
    for(const section of evidence.crossSections?.[axis]??[]){
      const extent=section?.supportExtent2d;
      if(!Array.isArray(extent)||extent.length!==2||!extent.every(Number.isFinite)) continue;
      if(section.intersectedTriangles<=0||extent[0]<=1e-12) continue;
      sectionRatios.push(extent[1]/extent[0]);
    }
  }
  const crossSectionDepthContinuity=round(median(sectionRatios));

  const localDepth=Number(evidence.localThickness?.z?.thickness?.median);
  const lateralScale=Math.max(Number(evidence.bounds?.extent?.[0]),Number(evidence.bounds?.extent?.[1]));
  if(!Number.isFinite(localDepth)||!Number.isFinite(lateralScale)) throw new Error('VC01 evidence is missing local depth support');
  const localDepthRatio=ratio(localDepth,lateralScale);

  return [
    makeSignal({
      id:'principal-minor-support',
      family:'principal-extents',
      value:principalMinorRatio,
      collapsedAtOrBelow:0.10,
      clearAtOrAbove:0.20,
      reason:'Minor principal extent relative to the middle principal extent.',
    }),
    makeSignal({
      id:'orthogonal-projection-support',
      family:'canonical-projections',
      value:orthogonalProjectionFloor,
      collapsedAtOrBelow:0.10,
      clearAtOrAbove:0.20,
      reason:'Lower of SIDE/TOP canonical projected-support area normalized by the strongest projection.',
    }),
    makeSignal({
      id:'cross-section-depth-continuity',
      family:'cross-sections',
      value:crossSectionDepthContinuity,
      collapsedAtOrBelow:0.08,
      clearAtOrAbove:0.16,
      reason:'Median Z-bearing support ratio across deterministic X/Y cross sections.',
    }),
    makeSignal({
      id:'local-depth-support',
      family:'local-thickness',
      value:localDepthRatio,
      collapsedAtOrBelow:0.08,
      clearAtOrAbove:0.16,
      reason:'Median local Z thickness relative to the larger canonical lateral extent.',
    }),
  ];
}

function rodSignals(evidence){
  const [,p2,p3]=evidence.principal?.axes??[];
  if(!p2||!p3) throw new Error('VC01 evidence is missing transverse principal axes');
  const transversePrincipalBalance=ratio(p3.extent,p2.extent);

  const thickness=['x','y','z']
    .map((axis)=>Number(evidence.localThickness?.[axis]?.thickness?.median))
    .filter(Number.isFinite)
    .sort((a,b)=>a-b);
  if(thickness.length!==3) throw new Error('VC01 evidence is missing three-axis local thickness distributions');
  const transverseThicknessBalance=ratio(thickness[0],thickness[1]);

  const dominantVector=evidence.principal.axes[0]?.vector;
  if(!Array.isArray(dominantVector)||dominantVector.length!==3) throw new Error('VC01 evidence is missing dominant principal direction');
  let dominantAxis=0;
  for(let index=1;index<3;index+=1){
    if(Math.abs(dominantVector[index])>Math.abs(dominantVector[dominantAxis])) dominantAxis=index;
  }
  const axisName=['x','y','z'][dominantAxis];
  const crossBalances=[];
  for(const section of evidence.crossSections?.[axisName]??[]){
    const extent=section?.supportExtent2d;
    if(!Array.isArray(extent)||extent.length!==2||!extent.every(Number.isFinite)) continue;
    const high=Math.max(...extent),low=Math.min(...extent);
    if(section.intersectedTriangles<=0||high<=1e-12) continue;
    crossBalances.push(low/high);
  }
  const transverseCrossSectionBalance=round(median(crossBalances));

  return [
    makeSignal({
      id:'transverse-principal-balance',
      family:'principal-extents',
      value:transversePrincipalBalance,
      collapsedAtOrBelow:0.20,
      clearAtOrAbove:0.55,
      reason:'For rod/tubular roles, the two transverse principal extents should remain mutually supported.',
    }),
    makeSignal({
      id:'transverse-local-thickness-balance',
      family:'local-thickness',
      value:transverseThicknessBalance,
      collapsedAtOrBelow:0.20,
      clearAtOrAbove:0.55,
      reason:'Ratio of the two smaller median local-thickness axes; a tube may be long but should not become ribbon-flat.',
    }),
    makeSignal({
      id:'transverse-cross-section-balance',
      family:'cross-sections',
      value:transverseCrossSectionBalance,
      collapsedAtOrBelow:0.20,
      clearAtOrAbove:0.55,
      reason:'Median aspect balance of sections normal to the dominant principal direction.',
    }),
  ];
}

function decision(role,common,roleSpecific){
  if(role==='unresolved'){
    return {classification:'INDETERMINATE',usedSignals:[],reason:'VC02 role is unresolved; VC03 preserves uncertainty rather than coercing a geometry verdict.'};
  }
  if(role==='intentionally-planar'){
    return {classification:'NOT_APPLICABLE',usedSignals:[],reason:'VC02 explicitly expects an intentionally planar scope; thinness is not planar-collapse failure.'};
  }
  if(role==='thin-shell'){
    return {classification:'NOT_APPLICABLE',usedSignals:[],reason:'VC02 expects a thin shell; thin support alone is not PLANAR_COLLAPSE authority in VC03.'};
  }

  const signals=role==='rod-tubular'?roleSpecific:common;
  const collapsed=signals.filter((signal)=>signal.band==='collapsed');
  const clear=signals.filter((signal)=>signal.band==='clear');
  const required=role==='rod-tubular'?2:3;
  if(collapsed.length>=required){
    return {
      classification:'PLANAR_COLLAPSE',
      usedSignals:collapsed.map((signal)=>signal.id),
      reason:role==='rod-tubular'
        ?'Multiple transverse-support families agree that the frozen rod/tubular scope has collapsed into ribbon-like support.'
        :`Multiple independent VC01 signal families contradict the frozen ${role} expectation.`,
    };
  }
  if(clear.length>=required){
    return {
      classification:'NO_PLANAR_COLLAPSE',
      usedSignals:clear.map((signal)=>signal.id),
      reason:role==='rod-tubular'
        ?'Multiple transverse-support families retain tube-like support despite one dominant longitudinal axis.'
        :`Multiple independent VC01 signal families retain spatial support compatible with the frozen ${role} expectation.`,
    };
  }
  return {
    classification:'INDETERMINATE',
    usedSignals:signals.filter((signal)=>signal.band!=='ambiguous').map((signal)=>signal.id),
    reason:'Independent spatial signal families do not agree strongly enough for a planar-collapse finding.',
  };
}

export function _classifySpatialCollapseFromAuthority({glb,spatialEvidence,roleAuthority}={}){
  const validation=validateSpatialClosureEvidence(spatialEvidence,{glb});
  if(!validation.valid) throw new Error(`VC01 spatial evidence is invalid for the supplied candidate GLB: ${validation.errors.join('; ')}`);
  const scopeId=assertId(spatialEvidence.scopeId,'spatialEvidence.scopeId');
  const expectation=validateAuthority(roleAuthority,scopeId);
  const common=commonSignals(spatialEvidence);
  const roleSpecific=expectation.role==='rod-tubular'?rodSignals(spatialEvidence):[];
  const outcome=decision(expectation.role,common,roleSpecific);
  const usedIds=new Set(outcome.usedSignals);
  const annotate=(signals)=>signals.map((signal)=>({...signal,usedForDecision:usedIds.has(signal.id)}));
  const payload={
    schema:SPATIAL_COLLAPSE_CLASSIFICATION_SCHEMA,
    candidateSha256:assertDigest(spatialEvidence.assetSha256,'spatialEvidence.assetSha256'),
    spatialEvidenceDigest:assertDigest(spatialEvidence.evidenceDigest,'spatialEvidence.evidenceDigest'),
    sourceSha256:assertDigest(roleAuthority.sourceSha256,'roleAuthority.sourceSha256'),
    hierarchyDigest:assertDigest(roleAuthority.hierarchyDigest,'roleAuthority.hierarchyDigest'),
    expectationSetDigest:assertDigest(roleAuthority.expectationSetDigest,'roleAuthority.expectationSetDigest'),
    roleAuthorityDigest:assertDigest(roleAuthority.authorityDigest,'roleAuthority.authorityDigest'),
    scopeId,
    frozenRole:expectation.role,
    classification:outcome.classification,
    signals:{
      volumetricFamilies:annotate(common),
      roleSpecific:annotate(roleSpecific),
    },
    decisionBasis:{
      usedSignalIds:[...outcome.usedSignals],
      noAggregateScore:true,
      reason:outcome.reason,
    },
    policy:{
      findingOnly:true,
      certificationAuthority:false,
      roleMutationAllowed:false,
      singleViewIouAuthority:false,
      multiViewIouAuthority:'diagnostic-only',
    },
  };
  return deepFreeze({...payload,classificationDigest:digestJson(payload)});
}

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
