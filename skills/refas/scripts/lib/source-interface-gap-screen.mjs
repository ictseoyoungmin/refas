// QA-03b1: original-photo observed structural boundary must not disappear
// between distinct physical GLB mesh regions. 2D projection != 3D weld proof.
export const SOURCE_INTERFACE_GAP_SCREEN_SCHEMA='refas.source-interface-gap-screen/v1';
const SOURCE_BOUNDARY_TOLERANCE=0.04;
const MAX_PHYSICAL_PROJECTED_GAP=0.032;
const MIN_VERTEX_COUNT=3;
const KINDS=new Set(['joint-boundary','contact-boundary','necked-transition']);
const length=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function polygon(value){
  if(!Array.isArray(value)||value.length<MIN_VERTEX_COUNT||
    value.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))throw Error('interface source/current polygon is invalid');
  return value;
}
function segmentDistance(p,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1],s=dx*dx+dy*dy;
  const t=s<1e-12?0:Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/s));
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
function boundaryDistance(p,points){
  let result=Infinity;
  for(let i=0;i<points.length;i++){
    result=Math.min(result,segmentDistance(p,points[i],points[(i+1)%points.length]));
  }
  return result;
}
function inside(point,poly){
  let state=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i],b=poly[j];
    if((a[1]>point[1])!==(b[1]>point[1])&&
       point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])state=!state;
  }
  return state;
}
function meshGap(a,b){
  // Zero if projected interiors cross; otherwise minimum distance between
  // actual projected polygon boundaries (including edges, not just vertices).
  if(a.some(p=>inside(p,b))||b.some(p=>inside(p,a)))return 0;
  let smallest=Infinity;
  for(const [x,y] of [[a,b],[b,a]]){
    for(const p of x)smallest=Math.min(smallest,boundaryDistance(p,y));
  }
  return smallest;
}
export function screenSourcePhysicalInterfaceGaps({referenceGeometry,realizedProjection,sourcePath}={}){
  if(typeof sourcePath!=='string'||!sourcePath.trim())throw Error('primary original source path required');
  if(referenceGeometry?.sourceSha256!==realizedProjection?.sourceSha256||
    referenceGeometry?.scopeId!==realizedProjection?.scopeId)
    throw Error('source structural interfaces require exact source SHA and current GLB scope');
  const interfaces=(referenceGeometry.interfaces??[]).filter(i=>
    i.importance!=='detail'&&i.separation==='explicit'&&KINDS.has(i.kind));
  const segments=new Map((referenceGeometry.segments??[]).map(s=>[s.id,s]));
  const meshes=new Map((realizedProjection.derivedSegments??[]).map(s=>[s.referenceId,s]));
  const findings=[],checks=[];
  if(!interfaces.length)return Object.freeze({schema:SOURCE_INTERFACE_GAP_SCREEN_SCHEMA,
    status:'NOT_APPLICABLE',checks,findings,cannotAuthorizeReferenceFidelity:true,
    cannotProvePhysicalAttachment:true});
  for(const i of interfaces){
    const sourceA=segments.get(i.subjectSegmentId),sourceB=segments.get(i.objectSegmentId);
    const actualA=meshes.get(i.subjectSegmentId),actualB=meshes.get(i.objectSegmentId);
    if(i.visibility!=='visible'||!i.evidenceRefs?.includes(sourcePath)||
      !sourceA||!sourceB||sourceA.visibility!=='visible'||sourceB.visibility!=='visible'||
      !sourceA.evidenceRefs?.includes(sourcePath)||!sourceB.evidenceRefs?.includes(sourcePath)){
      findings.push({id:i.id,status:'REVIEW_REQUIRED',reason:'interface or its source parts are not visible, primary-source cited observations'});
      continue;
    }
    if(!actualA||!actualB||!(actualA.insideFrameFraction>=.95)||!(actualB.insideFrameFraction>=.95)){
      findings.push({id:i.id,status:'REVIEW_REQUIRED',reason:'source structural parts lack measurable in-frame GLB meshes'});
      continue;
    }
    const a=new Set(actualA.meshNodeIndices??[]),b=new Set(actualB.meshNodeIndices??[]);
    if(!a.size||!b.size||[...b].some(index=>a.has(index))){
      findings.push({id:i.id,status:'REVIEW_REQUIRED',reason:'structural source parts share GLB mesh ownership'});
      continue;
    }
    try{
      polygon(sourceA.polygon);polygon(sourceB.polygon);
      polygon(actualA.projectedHull);polygon(actualB.projectedHull);
      if(!Array.isArray(i.boundary)||i.boundary.length<2||
        i.boundary.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))){
        throw Error('observable source joint boundary polyline missing');
      }
      const mismatch=i.boundary.some(p=>boundaryDistance(p,sourceA.polygon)>SOURCE_BOUNDARY_TOLERANCE||
        boundaryDistance(p,sourceB.polygon)>SOURCE_BOUNDARY_TOLERANCE);
      if(mismatch){
        findings.push({id:i.id,status:'REVIEW_REQUIRED',reason:'source joint boundary is inconsistent with source-part outlines'});
        continue;
      }
      const gap=meshGap(actualA.projectedHull,actualB.projectedHull);
      checks.push({id:i.id,kind:i.kind,projectedMeshGap:gap,
        physicalGlbMeshNodeCounts:[a.size,b.size]});
      if(gap>MAX_PHYSICAL_PROJECTED_GAP){
        findings.push({id:i.id,status:'REWORK',reason:'actual current GLB structural parts have a projected gap contradicting source-observed attachment boundary'});
      }
    }catch(error){findings.push({id:i.id,status:'REVIEW_REQUIRED',reason:error.message});}
  }
  const status=findings.some(x=>x.status==='REWORK')?'REWORK':
    findings.length?'INSUFFICIENT':'NO_DETECTED_CONTRADICTION';
  return Object.freeze({schema:SOURCE_INTERFACE_GAP_SCREEN_SCHEMA,status,
    sourceSha256:referenceGeometry.sourceSha256,assetSha256:realizedProjection.assetSha256,
    checks:Object.freeze(checks.map(x=>Object.freeze(x))),
    findings:Object.freeze(findings.map(x=>Object.freeze(x))),
    physicalEvidenceFromCurrentGlb:true,cannotAuthorizeReferenceFidelity:true,
    cannotProvePhysicalAttachment:true,sourceAnnotationIsNotIndependentlyRecognized:true});
}
