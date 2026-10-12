/**
 * Deterministic read-only GLB geometry accessor decoder for trusted QA.
 * Supports glTF 2.0 FLOAT32 VEC3 POSITION and unsigned SCALAR indices, dense
 * arrays and strictly ordered sparse overrides. All views are checked against
 * the declared embedded BIN length, not only the allocated/padded chunk.
 *
 * No values from accessor.min/max or worker-submitted geometry digests are
 * treated as spatial authority.
 */
export class UnsupportedQaGeometryAccessor extends Error {}
const COMPONENTS={
  5121:{bytes:1,read:(dv,offset)=>dv.getUint8(offset)},
  5123:{bytes:2,read:(dv,offset)=>dv.getUint16(offset,true)},
  5125:{bytes:4,read:(dv,offset)=>dv.getUint32(offset,true)},
  5126:{bytes:4,read:(dv,offset)=>dv.getFloat32(offset,true)},
};
const validInt=n=>Number.isSafeInteger(n)&&n>=0;

function geometryView(json,binary,viewId,localOffset,count,width,componentBytes,{sparse=false,label}={}){
 const view=json.bufferViews?.[viewId];
 if(!view || view.buffer!==0)throw Error(label+': missing embedded GLB bufferView');
 const viewOffset=view.byteOffset??0,length=view.byteLength;
 const declared=json.buffers?.[0]?.byteLength;
 const stride=sparse?width:(view.byteStride??width);
 if(![viewOffset,length,localOffset,count,width,componentBytes,stride,declared].every(validInt) ||
    count===0||stride<width||stride%componentBytes!==0||
    viewOffset%componentBytes!==0||localOffset%componentBytes!==0||
    (sparse&&view.byteStride!=null) ||
    viewOffset+length>declared||declared>binary.byteLength||
    localOffset+(count-1)*stride+width>length){
  throw Error(label+': invalid or out-of-range GLB bufferView layout');
 }
 return {viewOffset,localOffset,stride};
}
function readValues(data,layout,count,width,component){
 const lanes=width/component.bytes;
 const out=[];
 for(let i=0;i<count;i++){
  const base=layout.viewOffset+layout.localOffset+i*layout.stride;
  const values=Array.from({length:lanes},(_,j)=>component.read(data,base+j*component.bytes));
  if(!values.every(Number.isFinite))throw Error('non-finite GLB geometry coordinate');
  out.push(lanes===1?values[0]:values);
 }
 return out;
}
/** Return fully materialized typed geometry with sparse patches applied. */
export function readQaGeometryAccessor(json,binary,index,{position=false,label='GLB geometry'}={}){
 const acc=json.accessors?.[index];
 if(!acc||!validInt(acc.count)||acc.count===0){
  throw Error(label+': missing or invalid GLB accessor');
 }
 if(acc.count>10_000_000){
  throw new UnsupportedQaGeometryAccessor(label+': oversized geometry needs streamed independent replay');
 }
 const allowed=position?acc.type==='VEC3'&&acc.componentType===5126:
   acc.type==='SCALAR'&&[5121,5123,5125].includes(acc.componentType);
 if(!allowed||acc.normalized===true){
  throw new UnsupportedQaGeometryAccessor(label+': unsupported GLB geometry accessor type');
 }
 const component=COMPONENTS[acc.componentType];
 const width=(position?3:1)*component.bytes;
 const data=new DataView(binary.buffer,binary.byteOffset,binary.byteLength);
 const output=acc.bufferView==null
  ?Array.from({length:acc.count},()=>position?[0,0,0]:0)
  :readValues(data,geometryView(json,binary,acc.bufferView,acc.byteOffset??0,
    acc.count,width,component.bytes,{label:label+': base'}),acc.count,width,component);
 if(acc.bufferView==null&&(!acc.sparse||acc.byteOffset!=null&&acc.byteOffset!==0)){
  throw Error(label+': missing dense bufferView without valid sparse initialization');
 }
 if(acc.sparse!=null){
  const spec=acc.sparse;
  if(!validInt(spec.count)||spec.count<1||spec.count>acc.count){
   throw Error(label+': invalid sparse accessor count');
  }
  const indexComponent=COMPONENTS[spec.indices?.componentType];
  if(!indexComponent||![5121,5123,5125].includes(spec.indices.componentType)){
   throw Error(label+': sparse indices require unsigned integer component type');
  }
  const indexLayout=geometryView(json,binary,spec.indices?.bufferView,
    spec.indices.byteOffset??0,spec.count,indexComponent.bytes,indexComponent.bytes,
    {sparse:true,label:label+': sparse indices'});
  const valueLayout=geometryView(json,binary,spec.values?.bufferView,
    spec.values.byteOffset??0,spec.count,width,component.bytes,
    {sparse:true,label:label+': sparse values'});
  const sparseIndices=readValues(data,indexLayout,spec.count,indexComponent.bytes,indexComponent);
  const sparseValues=readValues(data,valueLayout,spec.count,width,component);
  let prior=-1;
  for(let i=0;i<spec.count;i++){
   const at=sparseIndices[i];
   if(!validInt(at)||at>=acc.count||at<=prior){
    throw Error(label+': sparse indices must be strictly increasing and inside accessor range');
   }
   output[at]=sparseValues[i];
   prior=at;
  }
 }
 if(position&&!output.every(p=>p.every(Number.isFinite))){
  throw Error(label+': nonfinite geometry position');
 }
 return output;
}
