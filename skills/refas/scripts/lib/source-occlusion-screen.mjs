// S03c: contradiction-only source-visible overlap/occlusion vs
// current GLB-derived camera depth intervals. Not a 3D likeness certificate.
export const SOURCE_OCCLUSION_SCREEN_SCHEMA='refas.source-occlusion-screen/v1';
const EPS=1e-8;
function finitePolygon(points) {
  return Array.isArray(points)&&points.length>=3&&points.every(p=>
    Array.isArray(p)&&p.length===2&&p.every(Number.isFinite));
}
function overlap(a,b) {
  if(!finitePolygon(a)||!finitePolygon(b))throw Error('source/GLB overlap requires finite 2D polygon');
  // Convex SAT. Source segments may be concave: use conservative axis-aligned
  // *bounds* for source observation; realized hulls are always convex.
  for(const poly of [a,b]) {
    for(let i=0;i<poly.length;i++){
      const p=poly[i],q=poly[(i+1)%poly.length],ax=p[1]-q[1],ay=q[0]-p[0];
      if(Math.hypot(ax,ay)<EPS)continue;
      const project=x=>x.map(v=>v[0]*ax+v[1]*ay);
      const u=project(a),v=project(b);
      if(Math.max(...u)<Math.min(...v)-EPS || Math.max(...v)<Math.min(...u)-EPS)return false;
    }
  }
  return true;
}
function boundsPolygon(poly){
  if(!finitePolygon(poly))throw Error('source occlusion region requires a finite 2D polygon');
  const x=poly.map(p=>p[0]),y=poly.map(p=>p[1]);
  const minX=Math.min(...x),maxX=Math.max(...x),minY=Math.min(...y),maxY=Math.max(...y);
  return [[minX,minY],[maxX,minY],[maxX,maxY],[minX,maxY]];
}
function depthRange(value){
  return Array.isArray(value)&&value.length===2&&value.every(Number.isFinite)&&
    value[0]>0&&value[1]>=value[0] ? value : null;
}
export function screenSourceRealizedOcclusion({referenceGeometry,realizedProjection,sourcePath}={}){
  if(typeof sourcePath!=='string'||!sourcePath.trim())throw Error('original source path is required');
  if(referenceGeometry?.sourceSha256!==realizedProjection?.sourceSha256 ||
      referenceGeometry?.scopeId!==realizedProjection?.scopeId) {
    throw Error('source occlusion must bind exact original source SHA and current GLB scope');
  }
  const observed=(referenceGeometry.occlusions??[]).filter(x=>x.importance!=='detail');
  const source=new Map((referenceGeometry.segments??[]).map(s=>[s.id,s]));
  const actual=new Map((realizedProjection.derivedSegments??[]).map(s=>[s.referenceId,s]));
  const checked=[],findings=[];
  if(!observed.length) return Object.freeze({schema:SOURCE_OCCLUSION_SCREEN_SCHEMA,
    status:'NOT_APPLICABLE',checked,findings,cannotAuthorizeReferenceFidelity:true});
  for(const item of observed){
    const a=source.get(item.frontId),b=source.get(item.backId);
    if(!item.evidenceRefs?.includes(sourcePath)||!a||!b||
      !a.evidenceRefs?.includes(sourcePath)||!b.evidenceRefs?.includes(sourcePath)||
      !['visible','partially-occluded'].includes(a.visibility)||
      !['visible','partially-occluded'].includes(b.visibility)){
      findings.push({id:item.id,status:'REVIEW_REQUIRED',reason:'source-cited observable front/back segmented overlap is missing'});
      continue;
    }
    let validSourceOverlap;
    try{validSourceOverlap=overlap(boundsPolygon(a.polygon),boundsPolygon(b.polygon));}
    catch(error){findings.push({id:item.id,status:'REVIEW_REQUIRED',reason:error.message});continue;}
    if(!validSourceOverlap){
      findings.push({id:item.id,status:'REVIEW_REQUIRED',reason:'source front/back part annotations do not overlap in image'});
      continue;
    }
    const front=actual.get(a.id),back=actual.get(b.id);
    if(!front||!back){
      findings.push({id:item.id,status:'REVIEW_REQUIRED',reason:'current GLB segment projections are missing'});
      continue;
    }
    const frontNodes=new Set(front.meshNodeIndices??[]);
    if(!frontNodes.size || !(back.meshNodeIndices??[]).length ||
      back.meshNodeIndices.some(n=>frontNodes.has(n))){
      findings.push({id:item.id,status:'REVIEW_REQUIRED',reason:'source occluding parts are mapped to overlapping GLB mesh ownership'});
      continue;
    }
    const fd=depthRange(front.cameraDepthRange),bd=depthRange(back.cameraDepthRange);
    if(!fd||!bd){
      findings.push({id:item.id,status:'REVIEW_REQUIRED',reason:'actual GLB camera-depth extrema are absent or invalid'});
      continue;
    }
    if(!overlap(front.projectedHull,back.projectedHull)){
      findings.push({id:item.id,status:'REWORK',reason:'actually projected GLB parts do not overlap despite source-visible occlusion'});
      continue;
    }
    // The camera-near surface must lie entirely before the camera-far part:
    // mixed/intersecting ranges cannot establish an occlusion ordering using
    // vertex-depth extrema alone and must remain insufficient, not PASS.
    const frontEntirelyNear=fd[1]<bd[0]-EPS;
    const backEntirelyNear=bd[1]<fd[0]-EPS;
    checked.push({id:item.id,frontCameraDepthRange:fd,backCameraDepthRange:bd,
      evaluable:frontEntirelyNear||backEntirelyNear});
    if(backEntirelyNear) findings.push({id:item.id,status:'REWORK',
      reason:'actual current GLB front/back depth order contradicts source-observed overlap'});
    else if(!frontEntirelyNear) findings.push({id:item.id,status:'REVIEW_REQUIRED',
      reason:'intersecting GLB depth intervals do not establish source-observed occlusion order'});
  }
  return Object.freeze({schema:SOURCE_OCCLUSION_SCREEN_SCHEMA,
    status:findings.some(x=>x.status==='REWORK')?'REWORK':findings.length?'INSUFFICIENT':'NO_DETECTED_CONTRADICTION',
    sourceSha256:referenceGeometry.sourceSha256,assetSha256:realizedProjection.assetSha256,
    checked:Object.freeze(checked.map(x=>Object.freeze(x))),
    findings:Object.freeze(findings.map(x=>Object.freeze(x))),
    cannotAuthorizeReferenceFidelity:true,cannotInferHiddenVolume:true,
    physicalEvidenceFromCurrentGlb:true});
}
