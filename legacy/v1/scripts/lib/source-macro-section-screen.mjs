// S03a: contradiction-only comparison of source-observed macro segment
// envelopes with geometry projected from the exact current GLB.
 // IMPORTANT: source polygons are upstream source-cited observations, not
 // independently classified photo pixels. This gate cannot grant likeness.
export const MACRO_SECTION_SCREEN_SCHEMA = 'refas.source-macro-section-screen/v1';

function bounds(points) {
  if (!Array.isArray(points) || points.length < 3 ||
      points.some((point) => !Array.isArray(point) || point.length!==2 || !point.every(Number.isFinite))) {
    throw new Error('macro section polygon must contain finite image-space vertices');
  }
  const min=[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1]))];
  const max=[Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
  const span=[max[0]-min[0],max[1]-min[1]];
  if(span.some(v=>v<=1e-6)) throw new Error('macro section projected extent is degenerate');
  return {min,max,span,center:[(min[0]+max[0])/2,(min[1]+max[1])/2]};
}

export function screenSourceMacroSectionEnvelopes({referenceGeometry,realizedProjection,sourcePath}={}) {
  if(typeof sourcePath!=='string' || !sourcePath.trim()) throw new Error('primary-source path required');
  if(referenceGeometry?.sourceSha256!==realizedProjection?.sourceSha256 ||
     referenceGeometry?.scopeId!==realizedProjection?.scopeId) {
    throw new Error('macro sections must bind the same original-source SHA and scope as current GLB projection');
  }
  const declared=referenceGeometry?.segments??[];
  const visible=declared.filter(x=>x.importance==='macro' && x.visibility==='visible');
  const uncertain=declared.filter(x=>x.importance==='macro' && x.visibility!=='visible');
  const findings=[];
  const checked=[];
  const realized=new Map((realizedProjection?.derivedSegments??[]).map(x=>[x.referenceId,x]));
  for(const source of visible) {
    if(!source.evidenceRefs?.includes(sourcePath)) {
      findings.push({id:source.id,status:'REVIEW_REQUIRED',reason:'visible source section lacks original-photo citation'});
      continue;
    }
    const segment=realized.get(source.id);
    if(!segment) {
      findings.push({id:source.id,status:'REVIEW_REQUIRED',reason:'source-visible macro section has no realized current-GLB segment binding'});
      continue;
    }
    let a,b;
    try {a=bounds(source.polygon);b=bounds(segment.projectedHull);}
    catch (error) {
      findings.push({id:source.id,status:'REVIEW_REQUIRED',reason:error.message});
      continue;
    }
    const widthRatio=b.span[0]/a.span[0], heightRatio=b.span[1]/a.span[1];
    const centerShift=Math.hypot(b.center[0]-a.center[0],b.center[1]-a.center[1]);
    const screened={id:source.id,widthRatio,heightRatio,centerShift,insideFrameFraction:segment.insideFrameFraction};
    checked.push(screened);
    // Conservative gross-error thresholds: these NEVER establish positive
    // identity, even if every source-annotated segment appears consistent.
    if(widthRatio<0.6 || widthRatio>1.65 || heightRatio<0.6 || heightRatio>1.65 ||
       centerShift>0.085 || !(segment.insideFrameFraction>=0.95)) {
      findings.push({id:source.id,status:'REWORK',reason:'source-observed macro section envelope differs from actual projected GLB mesh'});
    }
  }
  for(const section of uncertain) {
    findings.push({id:section.id,status:'REVIEW_REQUIRED',reason:'partially occluded, inferred, or hidden source section is not directly observable'});
  }
  if(!visible.length) findings.push({id:'whole',status:'REVIEW_REQUIRED',reason:'no directly visible macro section was established from original source'});
  const status=findings.some(x=>x.status==='REWORK')?'REWORK':findings.length?'INSUFFICIENT':'NO_DETECTED_CONTRADICTION';
  return Object.freeze({
    schema:MACRO_SECTION_SCREEN_SCHEMA,status,
    sourceSha256:referenceGeometry.sourceSha256,assetSha256:realizedProjection.assetSha256,
    checked:Object.freeze(checked.map(x=>Object.freeze(x))),
    findings:Object.freeze(findings.map(x=>Object.freeze(x))),
    cannotAuthorizeReferenceFidelity:true,
    singleViewSimilarityNeverPasses:true,
  });
}
