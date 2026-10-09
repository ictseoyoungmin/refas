/** Single shared active-scene GLB rigid pose evaluator.
 * This is used by propagation QA and native fusion replay, so neither has
 * a separate transform interpretation or worker-authorized shortcut.
 */
const identity=()=>[1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
const multiply=(a,b)=>{
 const out=Array(16).fill(0);
 for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++){
   out[4*c+r]+=a[4*k+r]*b[4*c+k];
 }
 return out;
};
function matrixFor(node){
 if(node.matrix!=null){
  if(node.translation!=null||node.rotation!=null||node.scale!=null)throw Error('GLB matrix and TRS are both defined');
  if(!Array.isArray(node.matrix)||node.matrix.length!==16||!node.matrix.every(Number.isFinite))throw Error('invalid GLB mat4');
  return node.matrix;
 }
 const t=node.translation??[0,0,0],q=node.rotation??[0,0,0,1],s=node.scale??[1,1,1];
 if(!Array.isArray(t)||t.length!==3||!t.every(Number.isFinite)||
    !Array.isArray(q)||q.length!==4||!q.every(Number.isFinite)||
    !Array.isArray(s)||s.length!==3||!s.every(Number.isFinite))throw Error('invalid GLB TRS');
 if(Math.abs(q.reduce((v,c)=>v+c*c,0)-1)>1e-5)throw Error('GLB quaternion is not unit length');
 const [x,y,z,w]=q;
 return [
   (1-2*y*y-2*z*z)*s[0],(2*x*y+2*z*w)*s[0],(2*x*z-2*y*w)*s[0],0,
   (2*x*y-2*z*w)*s[1],(1-2*x*x-2*z*z)*s[1],(2*y*z+2*x*w)*s[1],0,
   (2*x*z+2*y*w)*s[2],(2*y*z-2*x*w)*s[2],(1-2*x*x-2*y*y)*s[2],0,
   ...t,1
 ];
}
export function sceneMatrices(json){
 const nodes=json.nodes??[],scene=json.scenes?.[json.scene??0];
 if(!scene||!Array.isArray(scene.nodes))throw Error('no active scene root list');
 const parent=new Map(),result=new Map(),visiting=new Set();
 function visit(index,up){
  if(!Number.isSafeInteger(index)||index<0||index>=nodes.length)throw Error('invalid GLB scene node index');
  if(visiting.has(index)||result.has(index))throw Error('cyclic or multiply reachable GLB node');
  visiting.add(index);
  const node=nodes[index],world=multiply(up,matrixFor(node));
  result.set(index,world);
  if(node.children!=null&&!Array.isArray(node.children))throw Error('GLB node children is not an array');
  for(const child of node.children??[]){
   if(parent.has(child))throw Error('GLB node has multiple parents');
   parent.set(child,index);visit(child,world);
  }
  visiting.delete(index);
 }
 for(const root of scene.nodes){if(parent.has(root)||result.has(root))throw Error('duplicate GLB scene root');visit(root,identity());}
 for(let i=0;i<nodes.length;i++)if(nodes[i]?.mesh!=null&&!result.has(i))throw Error('physical mesh node outside active GLB scene');
 return result;
}
export function rigidMatrix(m){
 if(Math.abs(m[3])>1e-7||Math.abs(m[7])>1e-7||
    Math.abs(m[11])>1e-7||Math.abs(m[15]-1)>1e-7) return false;
 const axes=[[m[0],m[1],m[2]],[m[4],m[5],m[6]],[m[8],m[9],m[10]]];
 const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
 for(let i=0;i<3;i++)for(let j=i;j<3;j++){
  const expected=i===j?1:0;if(Math.abs(dot(axes[i],axes[j])-expected)>1e-6)return false;
 }
 const a=axes[0],b=axes[1],c=axes[2];
 const determinant=(a[1]*b[2]-a[2]*b[1])*c[0]+
   (a[2]*b[0]-a[0]*b[2])*c[1]+(a[0]*b[1]-a[1]*b[0])*c[2];
 return Math.abs(determinant-1)<=1e-6;
}
export function sameFrame(matrix,frame){
 if(!frame)return false;
 const expected=[frame.xAxis,frame.yAxis,frame.zAxis,frame.origin];
 if(expected.some(v=>!Array.isArray(v)||v.length!==3||!v.every(Number.isFinite)))return false;
 for(let i=0;i<4;i++)for(let c=0;c<3;c++){
  const left=matrix[i*4+c],right=expected[i][c];
  if(Math.abs(left-right)>Math.max(1e-6,1e-6*Math.max(Math.abs(left),Math.abs(right))))return false;
 }
 return true;
}


/** An active physical GLB mesh's exact composition as a right-handed rigid
 * world frame. Reject matrices with scale, shear, reflection or perspective. */
export function realizedGlbRigidFrame(matrix){
 if(!rigidMatrix(matrix))throw new Error('UNSUPPORTED_LAYOUT: non-rigid GLB world transform');
 return {origin:matrix.slice(12,15),xAxis:matrix.slice(0,3),
   yAxis:matrix.slice(4,7),zAxis:matrix.slice(8,11)};
}
