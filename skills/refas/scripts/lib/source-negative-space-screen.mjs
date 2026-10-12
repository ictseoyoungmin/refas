// P0 S03d: physical contradiction screen for source-observed negative spaces.
// The original source's annotated void is upstream evidence, not independent
// pixel semantics. No positive likeness, hidden geometry, or IoU claim.
import {digestBytes} from './canonical.mjs';
import {parseGlb} from './glb.mjs';
import {sceneMatrices} from './qa-glb-rigid-frames.mjs';
import {readQaGeometryAccessor} from './qa-glb-geometry-accessors.mjs';
import {projectWorldPoint} from './realized-projection.mjs';

export const SOURCE_NEGATIVE_SPACE_SCREEN_SCHEMA='refas.source-negative-space-screen/v1';
const GRID=17, MAX_TRIANGLES=100_000, EPS=1e-10;
const bounds=poly=>[
  Math.min(...poly.map(p=>p[0])),Math.min(...poly.map(p=>p[1])),
  Math.max(...poly.map(p=>p[0])),Math.max(...poly.map(p=>p[1])),
];
function insidePolygon([x,y],polygon){
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if(((a[1]>y)!==(b[1]>y)) &&
      x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  }
  return inside;
}
function insideTriangle([x,y],triangle){
  const [[ax,ay],[bx,by],[cx,cy]]=triangle;
  const ab=(bx-ax)*(y-ay)-(by-ay)*(x-ax);
  const bc=(cx-bx)*(y-by)-(cy-by)*(x-bx);
  const ca=(ax-cx)*(y-cy)-(ay-cy)*(x-cx);
  return (ab>=-EPS&&bc>=-EPS&&ca>=-EPS)||
    (ab<=EPS&&bc<=EPS&&ca<=EPS);
}
function actualTriangles(glb,camera){
  const {json,binary}=parseGlb(glb);
  const matrices=sceneMatrices(json);
  const triangles=[];
  for(const [index,matrix] of matrices){
    const node=json.nodes[index];
    if(!Number.isInteger(node.mesh))continue;
    if([3,7,11].some(k=>Math.abs(matrix[k])>EPS)||Math.abs(matrix[15]-1)>EPS)
      throw Error('non-affine current GLB mesh transform cannot be projected');
    const mesh=json.meshes?.[node.mesh];
    if(!mesh?.primitives?.length)throw Error('current GLB mesh primitives missing');
    for(const [pIndex,primitive] of mesh.primitives.entries()){
      if((primitive.mode??4)!==4)throw Error('non-triangle current GLB primitive is unsupported');
      const mat=primitive.material==null?null:json.materials?.[primitive.material];
      if(primitive.material!=null&&!mat)throw Error('current GLB references missing material');
      if(mat?.alphaMode==='MASK'||mat?.alphaMode==='BLEND')
        throw Error('transparent or masked current GLB material has uncertain void occupancy');
      const accessor=primitive.attributes?.POSITION;
      if(!Number.isInteger(accessor))throw Error('current GLB primitive lacks physical POSITION');
      const positions=readQaGeometryAccessor(json,binary,accessor,{
        position:true,label:'source negative-space actual GLB POSITION',
      });
      const ids=primitive.indices==null?
        Array.from({length:positions.length},(_,i)=>i):
        readQaGeometryAccessor(json,binary,primitive.indices,{
          label:'source negative-space actual GLB indices',
        });
      if(ids.length%3!==0||triangles.length+ids.length/3>MAX_TRIANGLES)
        throw Error('current GLB triangle budget or index grouping invalid');
      const projected=positions.map(point=>{
        const [x,y,z]=point;
        const world=[
          matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12],
          matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13],
          matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14],
        ];
        return projectWorldPoint(camera,world).xy;
      });
      for(let i=0;i<ids.length;i+=3){
        if(ids.slice(i,i+3).some(id=>!Number.isSafeInteger(id)||id<0||id>=positions.length))
          throw Error('current GLB triangle index is out of range');
        const tri=[projected[ids[i]],projected[ids[i+1]],projected[ids[i+2]]];
        const area=(tri[1][0]-tri[0][0])*(tri[2][1]-tri[0][1])-
          (tri[1][1]-tri[0][1])*(tri[2][0]-tri[0][0]);
        if(Math.abs(area)<=EPS)continue;
        triangles.push({points:tri,box:bounds(tri)});
      }
    }
  }
  if(!triangles.length)throw Error('current GLB has no projectable opaque triangles');
  return triangles;
}
/** Physical per-region screen coverage, recomputed only from actual GLB bytes.
 * Shared by negative-space detection and QA-03 missing-source-part defense.
 * This is a coarse contradiction measurement, never positive photo semantics.
 */
export function measureSourcePolygonGlbOccupancy({glb,camera,regions=[]}={}){
  if(!Array.isArray(regions)||regions.length>64)throw Error('source region budget exceeded');
  const bytes=Buffer.from(glb??[]);
  const triangles=actualTriangles(bytes,camera);
  return Object.freeze(regions.map((region)=>{
    const poly=region?.polygon;
    if(!Array.isArray(poly)||poly.length<3||poly.length>256||
       poly.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))
      throw Error('source region must be a finite image polygon');
    const [x0,y0,x1,y1]=bounds(poly);
    if(!(x1-x0>0.015&&y1-y0>0.015))
      return Object.freeze({id:region.id,status:'INSUFFICIENT',reason:'source region is too small'});
    const candidates=triangles.filter(t=>t.box[0]<=x1&&t.box[2]>=x0&&
      t.box[1]<=y1&&t.box[3]>=y0);
    let total=0,covered=0;
    for(let y=0;y<GRID;y++)for(let x=0;x<GRID;x++){
      const point=[x0+(x+.5)/GRID*(x1-x0),y0+(y+.5)/GRID*(y1-y0)];
      if(!insidePolygon(point,poly))continue;
      total++;
      if(candidates.some(t=>point[0]>=t.box[0]-EPS&&point[0]<=t.box[2]+EPS&&
        point[1]>=t.box[1]-EPS&&point[1]<=t.box[3]+EPS&&
        insideTriangle(point,t.points)))covered++;
    }
    if(total<24)return Object.freeze({id:region.id,status:'INSUFFICIENT',
      reason:'source region lacks enough interior samples'});
    return Object.freeze({id:region.id,status:'MEASURED',
      sampledInterior:total,filledSamples:covered,coveredFraction:covered/total});
  }));
}

export function screenSourceNegativeSpaces({referenceGeometry,realizedProjection,
  glb,sourcePath}={}){
  if(typeof sourcePath!=='string'||!sourcePath.trim())throw Error('original source path required');
  if(referenceGeometry?.sourceSha256!==realizedProjection?.sourceSha256||
    referenceGeometry?.scopeId!==realizedProjection?.scopeId)
    throw Error('negative spaces require same original source SHA and scope as GLB projection');
  const bytes=Buffer.from(glb??[]);
  if(!bytes.length||digestBytes(bytes)!==realizedProjection.assetSha256)
    throw Error('negative spaces require exact current GLB SHA matching trusted projection');
  const declared=(referenceGeometry.negativeSpaces??[]).filter(x=>x.importance!=='detail');
  const checks=[],findings=[];
  const result=status=>Object.freeze({
    schema:SOURCE_NEGATIVE_SPACE_SCREEN_SCHEMA,status,
    sourceSha256:referenceGeometry.sourceSha256,
    assetSha256:realizedProjection.assetSha256,
    checks:Object.freeze(checks.map(x=>Object.freeze(x))),
    findings:Object.freeze(findings.map(x=>Object.freeze(x))),
    physicalEvidenceFromCurrentGlb:true,cannotAuthorizeReferenceFidelity:true,
    cannotInferHiddenVolume:true,
  });
  if(!declared.length)return result('NOT_APPLICABLE');
  let triangles;
  try{triangles=actualTriangles(bytes,realizedProjection.camera);}
  catch(error){
    findings.push({id:'negative-spaces',status:'REVIEW_REQUIRED',reason:
      'actual GLB triangle projection unavailable: '+error.message});
    return result('INSUFFICIENT');
  }
  for(const voidRegion of declared){
    if(!voidRegion.evidenceRefs?.includes(sourcePath)||
       !Array.isArray(voidRegion.polygon)||voidRegion.polygon.length<3||
       voidRegion.polygon.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))){
      findings.push({id:voidRegion.id,status:'REVIEW_REQUIRED',
        reason:'source void must have a finite polygon cited to original primary image'});
      continue;
    }
    const [x0,y0,x1,y1]=bounds(voidRegion.polygon);
    if(!(x1-x0>0.015&&y1-y0>0.015)){
      findings.push({id:voidRegion.id,status:'REVIEW_REQUIRED',
        reason:'source void is too small for conservative spatial sampling'});
      continue;
    }
    const candidates=triangles.filter(t=>t.box[0]<=x1&&t.box[2]>=x0&&
      t.box[1]<=y1&&t.box[3]>=y0);
    let total=0,covered=0;
    for(let y=0;y<GRID;y++)for(let x=0;x<GRID;x++){
      const point=[x0+(x+.5)/GRID*(x1-x0),y0+(y+.5)/GRID*(y1-y0)];
      if(!insidePolygon(point,voidRegion.polygon))continue;
      total++;
      if(candidates.some(t=>point[0]>=t.box[0]-EPS&&point[0]<=t.box[2]+EPS&&
        point[1]>=t.box[1]-EPS&&point[1]<=t.box[3]+EPS&&
        insideTriangle(point,t.points)))covered++;
    }
    if(total<24){
      findings.push({id:voidRegion.id,status:'REVIEW_REQUIRED',
        reason:'source void has too few independently sampleable interior points'});
      continue;
    }
    const coveredFraction=covered/total;
    checks.push({id:voidRegion.id,coveredFraction,sampledInterior:total,
      filledSamples:covered,actualTriangleCount:candidates.length});
    if(coveredFraction>=0.9)findings.push({id:voidRegion.id,status:'REWORK',
      reason:'source-observed open void is almost entirely filled by actual opaque GLB triangles'});
    else if(coveredFraction>0.1)findings.push({id:voidRegion.id,status:'REVIEW_REQUIRED',
      reason:'source void is partly occupied by GLB projection; foreground/background ambiguous'});
  }
  return result(findings.some(x=>x.status==='REWORK')?'REWORK':
    findings.length?'INSUFFICIENT':'NO_DETECTED_CONTRADICTION');
}
