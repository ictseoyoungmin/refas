// QA-01b / QA-03: independently replay current GLB physical geometry against
// the immutable original-source observations. This is deliberately a negative
// evidence gate: photo semantic labels are still source-attested, not certified
// by an independent reviewer or vision classifier.
import {createRealizedProjection} from './realized-projection.mjs';
import {verifyRealizedProjection} from './realized-projection-verification.mjs';
import {screenSourcePartRoleRelations} from './source-role-relations-screen.mjs';
import {screenSourcePhysicalInterfaceGaps} from './source-interface-gap-screen.mjs';
import {screenSourceNegativeSpaces} from './source-negative-space-screen.mjs';

export const SOURCE_SEMANTIC_REPLAY_SCHEMA='refas.qa-source-semantic-replay/v1';
export function replaySourceSemanticPhysicalEvidence({
  referenceGeometry,shapeProjection,shapeGlb,currentGlb,
  sourceSha256,sourcePath,
}={}){
  if(!referenceGeometry||!shapeProjection||!shapeGlb||!currentGlb||
    typeof sourcePath!=='string'||!sourcePath.trim()||
    !/^[a-f0-9]{64}$/.test(String(sourceSha256??''))){
    throw new Error('original source/shape proof and exact GLB bytes are required');
  }
  if(referenceGeometry.sourceSha256!==sourceSha256||
    shapeProjection.sourceSha256!==sourceSha256||
    referenceGeometry.scopeId!==shapeProjection.scopeId){
    throw new Error('source semantics proof is not bound to original source SHA and scope');
  }
  const initial=verifyRealizedProjection({
    proof:shapeProjection,referenceGeometry,glb:shapeGlb,
  });
  if(!initial.valid)throw new Error('shape-stage realized projection did not independently replay: '+
    initial.errors.join('; '));
  let current;
  try{
    current=createRealizedProjection({
      referenceGeometry,glb:currentGlb,
      camera:shapeProjection.camera,
      cameraHypothesisId:shapeProjection.cameraHypothesisId,
      anchorBindings:(shapeProjection.derivedAnchors??[]).map(a=>({
        referenceId:a.referenceId,nodeId:a.nodeId,localPoint:a.localPoint,
      })),
      segmentBindings:(shapeProjection.derivedSegments??[]).map(s=>({
        referenceId:s.referenceId,nodeIds:s.nodeIds,
      })),
      evidenceRefs:[sourcePath],
    });
  }catch(error){
    return Object.freeze({
      schema:SOURCE_SEMANTIC_REPLAY_SCHEMA,status:'INSUFFICIENT',
      sourceSha256,assetSha256:null,results:[],
      reason:'current GLB cannot be projected against immutable source-bound mesh bindings: '+error.message,
      cannotAuthorizeReferenceFidelity:true,
      sourceSemanticsIndependentlyVerified:false,
    });
  }
  const results=[];
  if((referenceGeometry.segments??[]).some(s=>s.importance==='identity')){
    results.push({id:'part-roles',...screenSourcePartRoleRelations({
      referenceGeometry,realizedProjection:current,sourcePath,
    })});
  }
  if((referenceGeometry.interfaces??[]).some(i=>i.importance!=='detail'&&
    i.separation==='explicit'&&['joint-boundary','contact-boundary','necked-transition'].includes(i.kind))){
    results.push({id:'structural-interfaces',...screenSourcePhysicalInterfaceGaps({
      referenceGeometry,realizedProjection:current,sourcePath,
    })});
  }
  if((referenceGeometry.negativeSpaces??[]).some(n=>n.importance!=='detail')){
    results.push({id:'whole-negative-spaces',...screenSourceNegativeSpaces({
      referenceGeometry,realizedProjection:current,glb:currentGlb,sourcePath,
    })});
  }
  const contradiction=results.filter(r=>r.status==='REWORK');
  const unresolved=results.filter(r=>r.status!=='NO_DETECTED_CONTRADICTION');
  return Object.freeze({
    schema:SOURCE_SEMANTIC_REPLAY_SCHEMA,
    // No positive source semantic role authority can be inferred from
    // matched authored ROI, even if every actual GLB check finds no issue.
    status:contradiction.length?'FAIL':'INSUFFICIENT',
    sourceSha256,assetSha256:current.assetSha256,
    results:Object.freeze(results),
    reason:contradiction.length
      ? 'independently replayed current GLB physical relation contradicts original-source visible annotations: '+
          contradiction.map(x=>x.id).join(', ')
      : unresolved.length
        ? 'original-source relation observations or current physical mesh projection remain insufficient'
        : results.length
          ? 'current physical GLB shows no measured contradiction, but independently verified raw-photo part semantics are not established'
          : 'required source-observed identity regions or structural relations have not been independently captured',
    cannotAuthorizeReferenceFidelity:true,
    sourceSemanticsIndependentlyVerified:false,
    doesNotInferHiddenStructuralParts:true,
  });
}
