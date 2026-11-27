// QA-03a: source-observed semantic part relations versus actual GLB mesh
// projected geometry. This is a CONTRADICTION gate, not photo recognition.
export const SOURCE_ROLE_RELATIONS_SCHEMA='refas.source-role-relations-screen/v1';
const MIN_ORDER_SEPARATION=0.09;
const MIN_RENDER_ORDER_SEPARATION=0.035;
const MIN_OBSERVED_AREA_RATIO=1.6;
const MAX_AREA_RATIO_FACTOR=1.9;
const EPS=1e-10;

function metrics(poly){
  if(!Array.isArray(poly)||poly.length<3||
    poly.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))) {
    throw new Error('source/actual GLB part polygon must have finite 2D points');
  }
  let sum=0,cx=0,cy=0;
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length];
    const k=a[0]*b[1]-b[0]*a[1];
    sum+=k;cx+=(a[0]+b[0])*k;cy+=(a[1]+b[1])*k;
  }
  if(Math.abs(sum)<EPS)throw new Error('source/actual GLB part polygon is degenerate');
  return {area:Math.abs(sum)/2,center:[cx/(3*sum),cy/(3*sum)]};
}
const known=x=>x==='visible';
const result=(geometry,projection,status,findings,checks)=>Object.freeze({
  schema:SOURCE_ROLE_RELATIONS_SCHEMA,status,
  sourceSha256:geometry.sourceSha256,assetSha256:projection.assetSha256,
  findings:Object.freeze(findings.map(x=>Object.freeze(x))),
  checks:Object.freeze(checks.map(x=>Object.freeze(x))),
  physicalEvidenceFromCurrentGlb:true,
  cannotIndependentlyRecognizeSourceSemantics:true,
  cannotAuthorizeReferenceFidelity:true,
  oneViewIoUNeverCertifiesIdentity:true,
});
export function screenSourcePartRoleRelations({referenceGeometry,realizedProjection,sourcePath}={}){
  if(typeof sourcePath!=='string'||!sourcePath.trim())throw Error('primary source path required');
  if(referenceGeometry?.sourceSha256!==realizedProjection?.sourceSha256||
    referenceGeometry?.scopeId!==realizedProjection?.scopeId)
    throw Error('source role relationships require exact original-source SHA and current GLB scope');
  const declared=(referenceGeometry.segments??[]).filter(s=>s.importance==='identity');
  const findings=[],checks=[];
  if(!declared.length)return result(referenceGeometry,realizedProjection,'NOT_APPLICABLE',findings,checks);
  const anchors=new Map((referenceGeometry.anchors??[]).map(a=>[a.id,a]));
  const byId=new Map((realizedProjection.derivedSegments??[]).map(s=>[s.referenceId,s]));
  const resolved=[];
  const roles=new Set();
  for(const s of declared){
    // A hidden/partially-visible original cannot give a definitive pair
    // metric; it is NEVER silently counted as an absent feature.
    if(!known(s.visibility) || !s.evidenceRefs?.includes(sourcePath)) {
      findings.push({id:s.id,status:'REVIEW_REQUIRED',
        reason:'source part is hidden, uncertain or not raw-source cited'});
      continue;
    }
    const featureAnchors=(s.anchorIds??[]).map(id=>anchors.get(id)).filter(a=>
      a?.semanticRole?.trim() && known(a.visibility) &&
      a.evidenceRefs?.includes(sourcePath));
    if(featureAnchors.length!==1){
      findings.push({id:s.id,status:'REVIEW_REQUIRED',
        reason:'source part requires exactly one distinct visible source-cited semantic role anchor'});
      continue;
    }
    const role=featureAnchors[0].semanticRole.trim();
    if(roles.has(role)){
      findings.push({id:s.id,status:'REVIEW_REQUIRED',reason:'source part semantic role is duplicated'});
      continue;
    }
    roles.add(role);
    const actual=byId.get(s.id);
    if(!actual || !(actual.meshNodeIndices??[]).length ||
       !(actual.insideFrameFraction>=0.95)){
      findings.push({id:s.id,status:'REVIEW_REQUIRED',
        reason:'current GLB role segment or in-frame physical mesh projection missing'});
      continue;
    }
    try{
      const source=metrics(s.polygon),candidate=metrics(actual.projectedHull);
      resolved.push({id:s.id,role,source,candidate,
        meshNodes:new Set(actual.meshNodeIndices)});
    }catch(error){
      findings.push({id:s.id,status:'REVIEW_REQUIRED',reason:error.message});
    }
  }
  if(resolved.length<2){
    findings.push({id:'role-relations',status:'REVIEW_REQUIRED',
      reason:'at least two independently source-visible, resolved semantic parts required'});
  }
  for(let i=0;i<resolved.length;i++)for(let j=i+1;j<resolved.length;j++){
    const a=resolved[i],b=resolved[j];
    const pair=a.id+'__'+b.id;
    if([...a.meshNodes].some(x=>b.meshNodes.has(x))){
      findings.push({id:pair,status:'REVIEW_REQUIRED',
        reason:'two observed semantic roles share one actual GLB mesh node'});
      continue;
    }
    const sourceDx=b.source.center[0]-a.source.center[0];
    const candidateDx=b.candidate.center[0]-a.candidate.center[0];
    const sourceAreaRatio=a.source.area/b.source.area;
    const candidateAreaRatio=a.candidate.area/b.candidate.area;
    const clearOrder=Math.abs(sourceDx)>=MIN_ORDER_SEPARATION;
    const clearArea=sourceAreaRatio>=MIN_OBSERVED_AREA_RATIO||
       sourceAreaRatio<=1/MIN_OBSERVED_AREA_RATIO;
    if(!clearOrder&&!clearArea){
      findings.push({id:pair,status:'REVIEW_REQUIRED',
        reason:'source does not resolve a dependable part order or relative area relation'});
      continue;
    }
    checks.push({id:pair,roles:[a.role,b.role],sourceDx,candidateDx,
      sourceAreaRatio,candidateAreaRatio,clearOrder,clearArea});
    if(clearOrder && (
      Math.sign(sourceDx)!==Math.sign(candidateDx) ||
      Math.abs(candidateDx)<MIN_RENDER_ORDER_SEPARATION)) {
      findings.push({id:pair,status:'REWORK',
        reason:'current GLB physical semantic part order contradicts visible original source'});
    }
    if(clearArea && (
      sourceAreaRatio>=MIN_OBSERVED_AREA_RATIO&&candidateAreaRatio<=1 ||
      sourceAreaRatio<=1/MIN_OBSERVED_AREA_RATIO&&candidateAreaRatio>=1 ||
      Math.max(candidateAreaRatio/sourceAreaRatio,sourceAreaRatio/candidateAreaRatio)>MAX_AREA_RATIO_FACTOR)) {
      findings.push({id:pair,status:'REWORK',
        reason:'current GLB physical semantic part area ratio contradicts visible original source'});
    }
  }
  if(!checks.length&&!findings.length)findings.push({id:'role-relations',status:'REVIEW_REQUIRED',
    reason:'no source-visible comparable semantic relations'});
  const status=findings.some(x=>x.status==='REWORK')?'REWORK':
    findings.length?'INSUFFICIENT':'NO_DETECTED_CONTRADICTION';
  return result(referenceGeometry,realizedProjection,status,findings,checks);
}
