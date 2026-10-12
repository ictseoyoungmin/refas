// Installed-skill, construction-only example. Geometry provenance is illustrative,
// not source-grounded and never grants an identity-bearing closure permit.
import {
  createLandmarkCage,
  createSubdivisionCageOrganic,
  validateSubdivisionCageOrganic,
} from './lib/index.mjs';

const controls=[
  ['000',[-1,-1,-1]],['100',[1,-1,-1]],['110',[1,1,-1]],['010',[-1,1,-1]],
  ['001',[-1,-1,1]],['101',[1,-1,1]],['111',[1,1,1]],['011',[-1,1,1]],
];
const landmarks=controls.map(([id,point],i)=>({
  id:'lm'+id,point,authority:i<4?'observed':'inferred',
  role:'semantic-anchor',evidenceRefs:['demo-only/illustrative-source.png'],
}));
const landmarkCage=createLandmarkCage({
  id:'demo-landmarks',landmarks,evidenceRefs:['demo-only/illustrative-source.png'],
});
const mesh=createSubdivisionCageOrganic({
  id:'demo-closed-cage',
  landmarkCage,
  vertices:controls.map(([id])=>({id:'v'+id,landmarkId:'lm'+id})),
  faces:[
    ['v000','v100','v101','v001'],
    ['v010','v011','v111','v110'],
    ['v000','v010','v110','v100'],
    ['v001','v101','v111','v011'],
    ['v000','v001','v011','v010'],
    ['v100','v110','v111','v101'],
  ],
  creases:[],levels:1,role:'demo-cage',
  evidenceRefs:['demo-only/illustrative-source.png'],
});
const validation=validateSubdivisionCageOrganic(mesh.subdivisionCage);
if(!validation.valid || !mesh.analysis.watertight)
  throw new Error('demonstration cage is not watertight');
process.stdout.write(JSON.stringify({
  demo:'non-authoritative-geometry',schema:mesh.subdivisionCage.schema,
  watertight:mesh.analysis.watertight,vertices:mesh.positions.length,
  triangles:mesh.indices.length/3,
  claim:'No source fidelity or construction permit granted',
})+'\n');
