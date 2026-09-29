export const CORVID_ROOT_SUPPORT_EVIDENCE=Object.freeze({
  hipHalfSpan:0.1106,
  torsoHalfWidthAtHip:0.083,
  rootOutsideBy:0.0276,
  torsoXSpan:[-0.139,0.301],
  torsoEstimatedComX:0.081,
});

export function boxMesh(x0,x1,y0,y1,z0,z1){
  return {
    positions:[
      [x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],
      [x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],
    ],
    indices:[
      0,2,1,0,3,2,
      4,5,6,4,6,7,
      0,1,5,0,5,4,
      3,7,6,3,6,2,
      0,7,3,0,4,7,
      1,2,6,1,6,5,
    ],
  };
}
