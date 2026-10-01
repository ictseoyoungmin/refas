import {deepFreeze,digestJson} from './canonical.mjs';
import {analyzeMesh} from './mesh.mjs';

export const UV_MAPPING_SCHEMA='refas.uv-mapping/v1';
export const UV_MAPPING_METHODS=Object.freeze(['planar','cylindrical','per-section']);
const AXIS_INDEX={x:0,y:1,z:2};

function normalizedAxis(axis,label){
  const value=String(axis??'').toLowerCase();
  if(!(value in AXIS_INDEX)) throw new Error(label+' must be x, y, or z');
  return value;
}
function normalize(values){
  const min=Math.min(...values),max=Math.max(...values),span=max-min;
  return values.map(v=>span>1e-12?(v-min)/span:.5);
}
function cyclicUvs(positions,axis){
  const ai=AXIS_INDEX[axis], radial=[0,1,2].filter(i=>i!==ai);
  const axial=normalize(positions.map(p=>p[ai]));
  return positions.map((p,i)=>{
    const angle=Math.atan2(p[radial[1]],p[radial[0]]);
    const u=((angle/(Math.PI*2)+.5)%1+1)%1;
    return [u,axial[i]];
  });
}

export function generateUvCoordinates(mesh,{method='planar',uAxis='x',vAxis='y',axis='y'}={}){
  const analysis=analyzeMesh(mesh);
  if(!analysis.valid) throw new Error('UV generation requires a valid triangle mesh');
  const mode=String(method??'').toLowerCase();
  if(!UV_MAPPING_METHODS.includes(mode)) throw new Error('unknown UV mapping method: '+method);
  let uvs;
  const parameters={};
  if(mode==='planar'){
    const ua=normalizedAxis(uAxis,'uAxis'),va=normalizedAxis(vAxis,'vAxis');
    if(ua===va) throw new Error('planar UV axes must differ');
    const us=normalize(mesh.positions.map(p=>p[AXIS_INDEX[ua]]));
    const vs=normalize(mesh.positions.map(p=>p[AXIS_INDEX[va]]));
    uvs=mesh.positions.map((_,i)=>[us[i],vs[i]]);
    Object.assign(parameters,{uAxis:ua,vAxis:va});
  }else if(mode==='cylindrical'){
    const a=normalizedAxis(axis,'axis');uvs=cyclicUvs(mesh.positions,a);Object.assign(parameters,{axis:a,seamWrap:true});
  }else{
    if(mesh.loft?.schema!=='refas.geometry-backend/v1'||!Array.isArray(mesh.loft.sections)) throw new Error('per-section UV mapping requires section-profile loft metadata');
    const sections=mesh.loft.sections, ringSize=sections[0]?.profile?.length;
    if(!Number.isInteger(ringSize)||ringSize<3) throw new Error('per-section UV mapping requires a stable section ring size');
    const bodyCount=sections.length*ringSize;
    if(mesh.positions.length<bodyCount) throw new Error('per-section loft vertex layout is inconsistent');
    uvs=mesh.positions.map((_,index)=>{
      if(index<bodyCount){
        const section=Math.floor(index/ringSize),sample=index%ringSize;
        return [sample/ringSize,sections.length===1?0:section/(sections.length-1)];
      }
      return [.5,index===bodyCount?0:1];
    });
    Object.assign(parameters,{ringSize,sectionCount:sections.length,seamWrap:true});
  }
  if(uvs.length!==mesh.positions.length||uvs.some(uv=>uv.length!==2||uv.some(v=>!Number.isFinite(v)))) throw new Error('UV generation produced invalid coordinates');
  const payload={schema:UV_MAPPING_SCHEMA,method:mode,parameters,vertexCount:uvs.length,uvs};
  const uvMapping={...payload,uvDigest:digestJson(payload)};
  return deepFreeze({...mesh,uvs,uvMapping});
}
export function validateUvMapping(mesh){
  const errors=[];
  try{
    if(!mesh?.uvMapping||mesh.uvMapping.schema!==UV_MAPPING_SCHEMA) throw new Error('missing UV mapping metadata');
    const expected=generateUvCoordinates({...mesh,uvs:undefined,uvMapping:undefined},{
      method:mesh.uvMapping.method,
      ...(mesh.uvMapping.parameters??{}),
    });
    if(digestJson(expected.uvMapping)!==digestJson(mesh.uvMapping)) throw new Error('UV mapping metadata is stale or non-canonical');
  }catch(error){errors.push(error.message);}
  return {valid:errors.length===0,errors};
}
