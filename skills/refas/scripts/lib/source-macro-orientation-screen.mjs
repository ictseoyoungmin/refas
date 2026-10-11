// S03b1: compare source-observed elongated macro-part axis with the
// actual current GLB projected mesh. No front/back or face-gaze inference.
// This is a strict contradiction screen, never a resemblance certificate.
export const MACRO_ORIENTATION_SCREEN_SCHEMA='refas.source-macro-orientation-screen/v1';
const EPS=1e-10;
const MIN_SOURCE_ANISOTROPY=4; // longitudinal visual evidence only
const MIN_RENDER_ANISOTROPY=2;
const MAX_AXIS_ERROR_DEGREES=25;

function polygonPrincipalAxis(vertices){
  if(!Array.isArray(vertices) || vertices.length<3 ||
     vertices.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))
    throw new Error('observed/projected orientation polygon requires finite 2D vertices');
  let area2=0, sx=0,sy=0,mxx=0,myy=0,mxy=0;
  for(let i=0;i<vertices.length;i++){
    const a=vertices[i],b=vertices[(i+1)%vertices.length];
    const k=a[0]*b[1]-b[0]*a[1];
    area2+=k;
    sx+=(a[0]+b[0])*k;
    sy+=(a[1]+b[1])*k;
    mxx+=(a[0]*a[0]+a[0]*b[0]+b[0]*b[0])*k;
    myy+=(a[1]*a[1]+a[1]*b[1]+b[1]*b[1])*k;
    mxy+=(2*a[0]*a[1]+a[0]*b[1]+b[0]*a[1]+2*b[0]*b[1])*k;
  }
  if(Math.abs(area2)<EPS) throw new Error('observed/projected orientation polygon has degenerate area');
  const cx=sx/(3*area2),cy=sy/(3*area2),area=area2/2;
  const vx=mxx/(12*area)-cx*cx,vy=myy/(12*area)-cy*cy;
  const xy=mxy/(24*area)-cx*cy;
  const root=Math.hypot(vx-vy,2*xy),trace=vx+vy;
  const high=(trace+root)/2,low=(trace-root)/2;
  if(!(high>EPS)||!(low>EPS)) throw new Error('observed/projected orientation polygon covariance is degenerate');
  return {angleRadians:0.5*Math.atan2(2*xy,vx-vy),anisotropy:high/low};
}

function unsignedAxisDifference(a,b){
  const delta=Math.abs(a-b)%Math.PI;
  return Math.min(delta,Math.PI-delta)*180/Math.PI;
}

export function screenSourceMacroPartOrientation({referenceGeometry,realizedProjection,sourcePath}={}){
  if(typeof sourcePath!=='string'||!sourcePath.trim())throw new Error('original source path is required');
  if(referenceGeometry?.sourceSha256!==realizedProjection?.sourceSha256||
     referenceGeometry?.scopeId!==realizedProjection?.scopeId)
    throw new Error('orientation screen requires same original source SHA and current GLB scope');
  const visible=(referenceGeometry?.segments??[]).filter(s=>s.importance==='macro'&&s.visibility==='visible');
  const byId=new Map((realizedProjection?.derivedSegments??[]).map(s=>[s.referenceId,s]));
  const checks=[],findings=[];
  for(const source of visible){
    // S03a already guards missing citations/segments, but this helper is
    // independently fail-closed if invoked directly.
    if(!source.evidenceRefs?.includes(sourcePath)){
      findings.push({id:source.id,status:'REVIEW_REQUIRED',reason:'visible macro orientation has no primary-source citation'});
      continue;
    }
    const segment=byId.get(source.id);
    if(!segment){
      findings.push({id:source.id,status:'REVIEW_REQUIRED',reason:'no matching current GLB projected segment for source macro orientation'});
      continue;
    }
    let observed,projected;
    try{observed=polygonPrincipalAxis(source.polygon);projected=polygonPrincipalAxis(segment.projectedHull);}
    catch(error){
      findings.push({id:source.id,status:'REVIEW_REQUIRED',reason:error.message});
      continue;
    }
    // A circular, square, or symmetric source region does not evidence a
    // unique long axis: do not pretend it contains reliable orientation.
    if(observed.anisotropy<MIN_SOURCE_ANISOTROPY){
      checks.push({id:source.id,measurable:false,reason:'source macro silhouette does not expose a unique projected long axis'});
      continue;
    }
    const angleErrorDegrees=unsignedAxisDifference(observed.angleRadians,projected.angleRadians);
    checks.push({id:source.id,measurable:true,sourceAnisotropy:observed.anisotropy,
      realizedAnisotropy:projected.anisotropy,angleErrorDegrees});
    if(projected.anisotropy<MIN_RENDER_ANISOTROPY||angleErrorDegrees>MAX_AXIS_ERROR_DEGREES)
      findings.push({id:source.id,status:'REWORK',reason:'source-observed macro long axis contradicts current GLB projected mesh orientation'});
  }
  const status=findings.some(f=>f.status==='REWORK')?'REWORK':
    findings.length?'INSUFFICIENT':'NO_DETECTED_CONTRADICTION';
  return Object.freeze({schema:MACRO_ORIENTATION_SCREEN_SCHEMA,status,
    sourceSha256:referenceGeometry.sourceSha256,assetSha256:realizedProjection.assetSha256,
    checks:Object.freeze(checks.map(x=>Object.freeze(x))),
    findings:Object.freeze(findings.map(x=>Object.freeze(x))),
    authority:'contradiction-only',cannotAuthorizeReferenceFidelity:true,
    cannotInferFaceGazeOrFrontBack:true});
}
