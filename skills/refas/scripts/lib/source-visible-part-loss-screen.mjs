// QA-03c: trusted physical *loss* detection, not source semantic recognition.
// Only the original cited, visible, separately observed identity regions count.
// A genuinely empty original-photo region on the current GLB is a REWORK
// only when the exact accepted shape-stage GLB physically occupied it.
// Renaming/remapping nodes, unknown source roles, occlusions and other source
// ambiguity cannot be upgraded into a source-identity PASS.
import {digestBytes} from './canonical.mjs';
import {measureSourcePolygonGlbOccupancy} from './source-negative-space-screen.mjs';

export const SOURCE_VISIBLE_PART_LOSS_SCHEMA='refas.source-visible-part-loss/v1';

export function screenLostSourceVisibleParts({
  referenceGeometry,shapeProjection,shapeGlb,currentGlb,sourcePath,
}={}){
  if(typeof sourcePath!=='string'||!sourcePath.trim()||
    referenceGeometry?.sourceSha256!==shapeProjection?.sourceSha256||
    referenceGeometry?.scopeId!==shapeProjection?.scopeId)
    throw Error('part-loss replay requires exact original source SHA and scope');
  const prior=Buffer.from(shapeGlb??[]),current=Buffer.from(currentGlb??[]);
  if(!prior.length||digestBytes(prior)!==shapeProjection.assetSha256)
    throw Error('part-loss replay requires exact accepted shape-stage GLB bytes');
  const sourceAnchors=new Map((referenceGeometry.anchors??[]).map(a=>[a.id,a]));
  const candidates=(referenceGeometry.segments??[]).filter(s=>
    s.importance==='identity'&&s.visibility==='visible'&&
    s.evidenceRefs?.includes(sourcePath));
  const eligible=[],findings=[],checks=[],roles=new Set();
  for(const segment of candidates){
    const anchors=(segment.anchorIds??[]).map(id=>sourceAnchors.get(id)).filter(a=>
      a?.semanticRole?.trim()&&a.visibility==='visible'&&
      a.evidenceRefs?.includes(sourcePath));
    if(anchors.length!==1||roles.has(anchors[0].semanticRole)){
      findings.push({id:segment.id,status:'REVIEW_REQUIRED',
        reason:'observed part requires a unique source-cited visible semantic role'});
      continue;
    }
    const anchor=anchors[0],p=segment.polygon;
    if(!Array.isArray(p)||p.length<3||!p.every(q=>
      Array.isArray(q)&&q.length===2&&q.every(Number.isFinite))){
      findings.push({id:segment.id,status:'REVIEW_REQUIRED',
        reason:'source-visible identity part has no finite observed region'});
      continue;
    }
    roles.add(anchor.semanticRole);
    eligible.push({id:segment.id,role:anchor.semanticRole,polygon:p});
  }
  const result=status=>Object.freeze({
    schema:SOURCE_VISIBLE_PART_LOSS_SCHEMA,status,
    sourceSha256:referenceGeometry.sourceSha256,
    shapeAssetSha256:shapeProjection.assetSha256,
    currentAssetSha256:digestBytes(current),checks:Object.freeze(checks),
    findings:Object.freeze(findings),
    sourceSemanticsIndependentlyVerified:false,
    cannotAuthorizeReferenceFidelity:true,
    physicalEvidenceFromCurrentGlb:true,
    doesNotInferOccludedOrHiddenParts:true,
  });
  if(!candidates.length)return result('NOT_APPLICABLE');
  if(!eligible.length)return result('INSUFFICIENT');
  let original,currentMeasurement;
  try {
    original=measureSourcePolygonGlbOccupancy({
      glb:prior,camera:shapeProjection.camera,regions:eligible,
    });
    currentMeasurement=measureSourcePolygonGlbOccupancy({
      glb:current,camera:shapeProjection.camera,regions:eligible,
    });
  }catch(error){
    findings.push({id:'physical-candidate',status:'REVIEW_REQUIRED',
      reason:'shape/current GLB cannot be physically sampled: '+error.message});
    return result('INSUFFICIENT');
  }
  for(let i=0;i<eligible.length;i++){
    const baseline=original[i],actual=currentMeasurement[i],segment=eligible[i];
    if(baseline.status!=='MEASURED'||actual.status!=='MEASURED'){
      findings.push({id:segment.id,status:'REVIEW_REQUIRED',
        reason:'insufficient original/current GLB interior sampling'});
      continue;
    }
    checks.push({id:segment.id,role:segment.role,
      originalPhysicalCoverage:baseline.coveredFraction,
      currentPhysicalCoverage:actual.coveredFraction,
      sampledInterior:actual.sampledInterior});
    // Conservative *negative-only* barrier: the original photo-labelled
    // source ROI was occupied by the exact frozen shape, but essentially NO
    // realized triangles remain in that same image region. Inexactly aligned
    // authored ROIs or visible but thin/ambiguous parts cannot yield FAIL.
    if(baseline.coveredFraction>=0.3&&actual.coveredFraction<=0.01){
      findings.push({id:segment.id,status:'REWORK',
        reason:'source-visible required part region lost all actual current GLB surface occupancy'});
    }else if(baseline.coveredFraction<0.3){
      findings.push({id:segment.id,status:'REVIEW_REQUIRED',
        reason:'accepted shape-stage mesh did not clearly occupy original source part ROI'});
    }else if(actual.coveredFraction<0.15){
      findings.push({id:segment.id,status:'REVIEW_REQUIRED',
        reason:'current GLB physical part coverage is reduced but remains ambiguous'});
    }
  }
  return result(findings.some(x=>x.status==='REWORK')?'REWORK':
    findings.length?'INSUFFICIENT':'NO_DETECTED_CONTRADICTION');
}
