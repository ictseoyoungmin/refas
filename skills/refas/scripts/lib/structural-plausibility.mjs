import {assertDigest, assertId, deepFreeze, digestBytes, digestJson} from './canonical.mjs';
import {validateAttachmentSemantics} from './attachment-semantics.mjs';
import {parseGlb} from './glb.mjs';

export const STRUCTURAL_PLAUSIBILITY_SCHEMA = 'refas.structural-plausibility/v1';

const EPS=1e-9;
const AXIS_INDEX=Object.freeze({x:0,y:1,z:2});
const COMPONENT_BYTES=new Map([[5121,1],[5123,2],[5125,4],[5126,4]]);
const TYPE_COMPONENTS=new Map([['SCALAR',1],['VEC3',3]]);

const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const scale=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=(a)=>Math.hypot(...a);
const uniqueStrings=(values=[])=>[...new Set(values.map(String).filter(Boolean))].sort();

function finiteArray(value,length,label,fallback=null){
  const raw=value==null?fallback:value;
  if(!Array.isArray(raw)||raw.length!==length||!raw.every(Number.isFinite)) throw new Error(`${label} must contain ${length} finite numbers`);
  return raw.map((value)=>Object.is(value,-0)?0:Number(value));
}

function quaternionMatrix([x,y,z,w],[sx,sy,sz],[tx,ty,tz]){
  return [
    (1-2*y*y-2*z*z)*sx,(2*x*y+2*z*w)*sx,(2*x*z-2*y*w)*sx,0,
    (2*x*y-2*z*w)*sy,(1-2*x*x-2*z*z)*sy,(2*y*z+2*x*w)*sy,0,
    (2*x*z+2*y*w)*sz,(2*y*z-2*x*w)*sz,(1-2*x*x-2*y*y)*sz,0,
    tx,ty,tz,1,
  ];
}
const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function multiply(a,b){
  const out=Array(16).fill(0);
  for(let col=0;col<4;col+=1)for(let row=0;row<4;row+=1)for(let k=0;k<4;k+=1)out[col*4+row]+=a[k*4+row]*b[col*4+k];
  return out;
}
function nodeMatrix(node,label){
  if(node.matrix!=null) return finiteArray(node.matrix,16,`${label}.matrix`);
  const t=finiteArray(node.translation,3,`${label}.translation`,[0,0,0]);
  const r=finiteArray(node.rotation,4,`${label}.rotation`,[0,0,0,1]);
  const s=finiteArray(node.scale,3,`${label}.scale`,[1,1,1]);
  if(Math.abs(s[0]*s[1]*s[2])<EPS) throw new Error(`${label}.scale is singular`);
  return quaternionMatrix(r,s,t);
}
const transformPoint=(m,p)=>[
  m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],
  m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],
  m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14],
];

function worldMatrices(json){
  const roots=json.scenes?.[json.scene??0]?.nodes??[];
  if(!Array.isArray(roots)||!roots.length) throw new Error('candidate active scene has no nodes');
  const world=new Map(),visiting=new Set(),parent=new Map();
  const visit=(index,parentMatrix=identity())=>{
    if(!Number.isInteger(index)||index<0||index>=(json.nodes?.length??0)) throw new Error('candidate scene references invalid node');
    if(visiting.has(index)) throw new Error('candidate node hierarchy contains a cycle');
    if(world.has(index)) throw new Error(`candidate node ${index} is reachable more than once`);
    visiting.add(index);
    const node=json.nodes[index];
    const matrix=multiply(parentMatrix,nodeMatrix(node,`node ${index}`));
    world.set(index,matrix);
    for(const child of node.children??[]){
      if(parent.has(child)) throw new Error(`candidate node ${child} has multiple parents`);
      parent.set(child,index);
      visit(child,matrix);
    }
    visiting.delete(index);
  };
  for(const root of roots) visit(root);
  return {world,parent};
}

function accessorValues(json,binary,accessorIndex,label,{type=null,componentTypes=null}={}){
  if(!Number.isInteger(accessorIndex)||accessorIndex<0) throw new Error(`${label} accessor index is invalid`);
  const accessor=json.accessors?.[accessorIndex],view=json.bufferViews?.[accessor?.bufferView];
  if(!accessor||!view||view.buffer!==0||accessor.sparse||accessor.normalized===true) throw new Error(`${label} accessor is unsupported`);
  if(type!=null&&accessor.type!==type) throw new Error(`${label} must use ${type}`);
  if(componentTypes!=null&&!componentTypes.has(accessor.componentType)) throw new Error(`${label} component type is invalid`);
  const bytes=COMPONENT_BYTES.get(accessor.componentType),components=TYPE_COMPONENTS.get(accessor.type);
  if(!bytes||!components) throw new Error(`${label} accessor format is unsupported`);
  const elementBytes=bytes*components,viewOffset=Number(view.byteOffset??0),viewLength=Number(view.byteLength),accessorOffset=Number(accessor.byteOffset??0);
  const stride=Number(view.byteStride??elementBytes),count=Number(accessor.count);
  if(![viewOffset,viewLength,accessorOffset,stride,count].every(Number.isInteger)||viewOffset<0||viewLength<0||accessorOffset<0||stride<elementBytes||count<1) throw new Error(`${label} accessor layout is invalid`);
  if(viewOffset+viewLength>binary.length) throw new Error(`${label} bufferView exceeds BIN bounds`);
  const dv=new DataView(binary.buffer,binary.byteOffset,binary.byteLength),out=[];
  const read=(offset)=>{
    if(accessor.componentType===5121)return dv.getUint8(offset);
    if(accessor.componentType===5123)return dv.getUint16(offset,true);
    if(accessor.componentType===5125)return dv.getUint32(offset,true);
    if(accessor.componentType===5126){
      const value=dv.getFloat32(offset,true);
      if(!Number.isFinite(value)) throw new Error(`${label} contains non-finite value`);
      return Object.is(value,-0)?0:value;
    }
    throw new Error(`${label} component type is unsupported`);
  };
  for(let item=0;item<count;item+=1){
    const base=viewOffset+accessorOffset+item*stride;
    if(base+elementBytes>viewOffset+viewLength||base+elementBytes>binary.length) throw new Error(`${label} exceeds bufferView/BIN bounds`);
    if(components===1)out.push(read(base));
    else{
      const row=[];for(let lane=0;lane<components;lane+=1)row.push(read(base+lane*bytes));out.push(row);
    }
  }
  return out;
}

function realizedParts(json,binary){
  const {world}=worldMatrices(json),byId=new Map();
  for(const [nodeIndex,matrix] of world.entries()){
    const node=json.nodes[nodeIndex];
    if(node.mesh==null) continue;
    const id=String(node.extras?.refasPartId??node.name??'').trim();
    if(!id) throw new Error(`active mesh node ${nodeIndex} lacks semantic part ID`);
    if(byId.has(id)) throw new Error(`candidate active scene contains duplicate part ID ${id}`);
    if(node.skin!=null||node.weights!=null) throw new Error(`${id}: skin/morph node deformation is unsupported for structural plausibility`);
    const mesh=json.meshes?.[node.mesh];
    if(!mesh||(mesh.primitives?.length??0)!==1) throw new Error(`${id}: structural plausibility requires one triangle primitive`);
    const primitive=mesh.primitives[0];
    if((primitive.targets?.length??0)>0||primitive.attributes?.JOINTS_0!=null||primitive.attributes?.WEIGHTS_0!=null) throw new Error(`${id}: skin/morph geometry is unsupported for structural plausibility`);
    if(primitive.mode!=null&&primitive.mode!==4) throw new Error(`${id}: triangle mode required`);
    const local=accessorValues(json,binary,primitive.attributes?.POSITION,`${id}.POSITION`,{type:'VEC3',componentTypes:new Set([5126])});
    const indices=accessorValues(json,binary,primitive.indices,`${id}.indices`,{type:'SCALAR',componentTypes:new Set([5121,5123,5125])});
    if(indices.length%3!==0||!indices.every((index)=>Number.isInteger(index)&&index>=0&&index<local.length)) throw new Error(`${id}: triangle indices are invalid`);
    const positions=local.map((point)=>transformPoint(matrix,point)),triangles=[];
    for(let offset=0;offset<indices.length;offset+=3)triangles.push([positions[indices[offset]],positions[indices[offset+1]],positions[indices[offset+2]]]);
    byId.set(id,{id,nodeIndex,matrix,localPositions:local,positions,indices,triangles});
  }
  if(!byId.size) throw new Error('candidate active scene contains no realized meshes');
  return byId;
}

function pointTriangleDistance(point,[a,b,c]){
  const ab=sub(b,a),ac=sub(c,a),ap=sub(point,a),d1=dot(ab,ap),d2=dot(ac,ap);
  if(d1<=0&&d2<=0)return norm(ap);
  const bp=sub(point,b),d3=dot(ab,bp),d4=dot(ac,bp);if(d3>=0&&d4<=d3)return norm(bp);
  const vc=d1*d4-d3*d2;if(vc<=0&&d1>=0&&d3<=0){const v=d1/(d1-d3);return norm(sub(point,add(a,scale(ab,v))));}
  const cp=sub(point,c),d5=dot(ab,cp),d6=dot(ac,cp);if(d6>=0&&d5<=d6)return norm(cp);
  const vb=d5*d2-d1*d6;if(vb<=0&&d2>=0&&d6<=0){const w=d2/(d2-d6);return norm(sub(point,add(a,scale(ac,w))));}
  const va=d3*d6-d5*d4;if(va<=0&&(d4-d3)>=0&&(d5-d6)>=0){const w=(d4-d3)/((d4-d3)+(d5-d6));return norm(sub(point,add(b,scale(sub(c,b),w))));}
  const denom=1/(va+vb+vc),v=vb*denom,w=vc*denom;
  return norm(sub(point,add(a,add(scale(ab,v),scale(ac,w)))));
}

function solidAngle(point,[a,b,c]){
  const A=sub(a,point),B=sub(b,point),C=sub(c,point),la=norm(A),lb=norm(B),lc=norm(C);
  if(Math.min(la,lb,lc)<EPS) return 0;
  const numerator=dot(A,cross(B,C));
  const denominator=la*lb*lc+dot(A,B)*lc+dot(B,C)*la+dot(C,A)*lb;
  return 2*Math.atan2(numerator,denominator);
}

function rootCheck(relation,parts){
  const subject=parts.get(relation.subjectId),owner=parts.get(relation.ownerIds[0]);
  if(!subject||!owner) throw new Error(`${relation.id}: root anchor requires active subject and owner meshes`);
  const point=transformPoint(subject.matrix,relation.rootAnchor.subjectLocalPoint);
  let minimumSurfaceDistance=Infinity,angle=0;
  for(const triangle of owner.triangles){
    minimumSurfaceDistance=Math.min(minimumSurfaceDistance,pointTriangleDistance(point,triangle));
    angle+=solidAngle(point,triangle);
  }
  const inside=Math.abs(angle)>2*Math.PI;
  const pass=inside||minimumSurfaceDistance<=relation.rootAnchor.tolerance+1e-10;
  return {
    relationId:relation.id,subjectId:relation.subjectId,ownerId:relation.ownerIds[0],
    rootWorldPoint:point,insideOwnerVolume:inside,minimumSurfaceDistance,
    tolerance:relation.rootAnchor.tolerance,status:pass?'PASS':'BLOCKED',
    evidenceRefs:relation.rootAnchor.evidenceRefs,
  };
}

function meshMassProperties(part){
  let signedVolume=0,weighted=[0,0,0];
  for(const [a,b,c] of part.triangles){
    const v=dot(a,cross(b,c))/6;
    signedVolume+=v;
    weighted=add(weighted,scale(add(add(a,b),c),v/4));
  }
  if(Math.abs(signedVolume)<1e-10) throw new Error(`${part.id}: closed non-zero-volume mesh required for COM plausibility`);
  return {mass:Math.abs(signedVolume),center:scale(weighted,1/signedVolume)};
}

function cross2(o,a,b){return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);}
function convexHull(points){
  const unique=[...new Map(points.map((p)=>[`${p[0]}:${p[1]}`,p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  if(unique.length<3) throw new Error('ground support requires at least three distinct contact points');
  const lower=[];for(const p of unique){while(lower.length>=2&&cross2(lower.at(-2),lower.at(-1),p)<=EPS)lower.pop();lower.push(p);}
  const upper=[];for(const p of [...unique].reverse()){while(upper.length>=2&&cross2(upper.at(-2),upper.at(-1),p)<=EPS)upper.pop();upper.push(p);}
  const hull=[...lower.slice(0,-1),...upper.slice(0,-1)];
  if(hull.length<3||Math.abs(hull.reduce((sum,p,i)=>sum+p[0]*hull[(i+1)%hull.length][1]-p[1]*hull[(i+1)%hull.length][0],0))<EPS) throw new Error('ground support polygon is degenerate');
  return hull;
}
function pointSegmentDistance2(point,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy;
  if(length2<EPS)return Math.hypot(point[0]-a[0],point[1]-a[1]);
  const t=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/length2));
  return Math.hypot(point[0]-(a[0]+t*dx),point[1]-(a[1]+t*dy));
}
function supportCheck(groundSupport,parts){
  if(groundSupport.mode==='source-supported-exempt'){
    return {
      mode:groundSupport.mode,status:'NOT_APPLICABLE',groundAxis:groundSupport.groundAxis,
      sourceObservation:groundSupport.sourceObservation,evidenceRefs:groundSupport.evidenceRefs,
    };
  }
  const axis=AXIS_INDEX[groundSupport.groundAxis],planeAxes=[0,1,2].filter((item)=>item!==axis);
  const properties=[...parts.values()].map(meshMassProperties);
  const totalMass=properties.reduce((sum,item)=>sum+item.mass,0);
  const com=scale(properties.reduce((sum,item)=>add(sum,scale(item.center,item.mass)),[0,0,0]),1/totalMass);
  const contactPoints=[];
  for(const entityId of groundSupport.contactEntityIds){
    const part=parts.get(entityId);
    if(!part) throw new Error(`ground support contact entity ${entityId} is not an active mesh`);
    const touching=part.positions.filter((point)=>Math.abs(point[axis]-groundSupport.groundCoordinate)<=groundSupport.contactTolerance+1e-10);
    if(!touching.length) throw new Error(`ground support contact entity ${entityId} has no vertices within contact tolerance`);
    for(const point of touching) contactPoints.push([point[planeAxes[0]],point[planeAxes[1]]]);
  }
  const hull=convexHull(contactPoints),projection=[com[planeAxes[0]],com[planeAxes[1]]];
  let inside=true,minSignedMargin=Infinity;
  for(let i=0;i<hull.length;i+=1){
    const a=hull[i],b=hull[(i+1)%hull.length],edge=[b[0]-a[0],b[1]-a[1]],side=cross2(a,b,projection);
    if(side<-1e-10)inside=false;
    minSignedMargin=Math.min(minSignedMargin,pointSegmentDistance2(projection,a,b));
  }
  const pass=inside&&minSignedMargin+1e-10>=groundSupport.minimumMargin;
  return {
    mode:'grounded',status:pass?'PASS':'BLOCKED',groundAxis:groundSupport.groundAxis,
    groundCoordinate:groundSupport.groundCoordinate,centerOfMass:com,projectedCenterOfMass:projection,
    supportPolygon:hull,insideSupportPolygon:inside,margin:minSignedMargin,minimumMargin:groundSupport.minimumMargin,
    contactEntityIds:groundSupport.contactEntityIds,evidenceRefs:groundSupport.evidenceRefs,
  };
}

export function analyzeStructuralPlausibility({attachmentSemantics,glb,evidenceRefs=[]}={}){
  const semanticsValidation=validateAttachmentSemantics(attachmentSemantics);
  if(!semanticsValidation.valid) throw new Error(`attachment semantics is invalid: ${semanticsValidation.errors.join('; ')}`);
  const candidate=Buffer.from(glb??[]);
  if(!candidate.length) throw new Error('structural plausibility requires exact candidate GLB bytes');
  const {json,binary}=parseGlb(candidate),parts=realizedParts(json,binary);
  const rootRelations=attachmentSemantics.relations.filter((relation)=>relation.rootAnchor?.kind==='embedded-root');
  const roots=rootRelations.map((relation)=>rootCheck(relation,parts));
  const support=attachmentSemantics.groundSupport==null?null:supportCheck(attachmentSemantics.groundSupport,parts);
  const findings=[];
  for(const check of roots.filter((item)=>item.status==='BLOCKED')) findings.push({
    type:'attachment-mismatch',owner:'assembly',subjectId:check.subjectId,
    message:`embedded root ${check.relationId} lies outside owner volume beyond tolerance`,
    evidenceRefs:uniqueStrings([...check.evidenceRefs,...evidenceRefs]),
  });
  if(support?.status==='BLOCKED') findings.push({
    type:'whole-system-relation-mismatch',owner:'shape-reconstruction',subjectId:attachmentSemantics.scopeId,
    message:'realized center of mass falls outside the declared ground support polygon or margin',
    evidenceRefs:uniqueStrings([...support.evidenceRefs,...evidenceRefs]),
  });
  const anyBlocked=roots.some((item)=>item.status==='BLOCKED')||support?.status==='BLOCKED';
  const hasChecks=roots.length>0||support!=null;
  const status=anyBlocked?'BLOCKED':hasChecks?'PASS':'NOT_APPLICABLE';
  const payload={
    schema:STRUCTURAL_PLAUSIBILITY_SCHEMA,scopeId:attachmentSemantics.scopeId,
    sourceSha256:attachmentSemantics.sourceSha256,candidateSha256:digestBytes(candidate),
    attachmentSemanticsDigest:attachmentSemantics.semanticsDigest,
    status,rootChecks:roots,groundSupport:support,findings,
    evidenceRefs:uniqueStrings(evidenceRefs),
    policy:{
      exactCandidateBytesAreAuthority:true,
      contactAloneCannotAuthorizeEmbeddedRoot:true,
      rootUsesParentRealizedTriangleVolume:true,
      supportUsesRealizedVolumeWeightedCenterOfMass:true,
      supportPolygonUsesDeclaredGroundContacts:true,
      sourceSupportedExemptionRemainsExplicit:true,
      noAggregatePlausibilityScore:true,
    },
  };
  return deepFreeze({...payload,plausibilityDigest:digestJson(payload)});
}

export function validateStructuralPlausibility(value,{attachmentSemantics,glb}={}){
  const errors=[];
  try{
    const recreated=analyzeStructuralPlausibility({
      attachmentSemantics,glb,evidenceRefs:value?.evidenceRefs??[],
    });
    if(recreated.plausibilityDigest!==value?.plausibilityDigest) errors.push('structural plausibility digest mismatch');
    if(digestJson(recreated)!==digestJson(value)) errors.push('structural plausibility is not canonical');
  }catch(error){errors.push(error.message);}
  return {valid:errors.length===0,errors};
}
