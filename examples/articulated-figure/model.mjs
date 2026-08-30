import {finalizeMesh} from '../../skills/refas/scripts/lib/mesh.mjs';
import {partsToGlb} from '../../skills/refas/scripts/lib/glb.mjs';

const EPS = 1e-8;
const sub = (a, b) => a.map((value, index) => value - b[index]);
const mul = (a, value) => a.map((entry) => entry * value);
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (value) => Math.hypot(...value);
const normalize = (value) => length(value) > EPS ? mul(value, 1 / length(value)) : [0, 1, 0];

function multiplyMatrix(a, b) {
  const output = Array(16).fill(0);
  for (let column = 0; column < 4; column += 1) for (let row = 0; row < 4; row += 1) {
    for (let k = 0; k < 4; k += 1) output[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
  }
  return output;
}

function inverseRigid(matrix) {
  const x = matrix.slice(0, 3), y = matrix.slice(4, 7), z = matrix.slice(8, 11), t = matrix.slice(12, 15);
  return [
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, t), -dot(y, t), -dot(z, t), 1,
  ];
}

function frameMatrix(origin, yDirection = [0, 1, 0], zHint = [0, 0, 1]) {
  const y = normalize(yDirection);
  let z = sub(zHint, mul(y, dot(zHint, y)));
  if (length(z) < EPS) z = sub([1, 0, 0], mul(y, y[0]));
  z = normalize(z);
  const x = normalize(cross(y, z));
  z = normalize(cross(x, y));
  return [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, origin[0], origin[1], origin[2], 1];
}

function transformPoint(matrix, point) {
  return [
    matrix[0] * point[0] + matrix[4] * point[1] + matrix[8] * point[2] + matrix[12],
    matrix[1] * point[0] + matrix[5] * point[1] + matrix[9] * point[2] + matrix[13],
    matrix[2] * point[0] + matrix[6] * point[1] + matrix[10] * point[2] + matrix[14],
  ];
}

function transformMesh(mesh, matrix, meta = mesh.meta) {
  return finalizeMesh(mesh.positions.map((point) => transformPoint(matrix, point)), [...mesh.indices], meta);
}

function mergeMeshes(meshes, meta = {}) {
  const positions = [], indices = [];
  for (const mesh of meshes) {
    const offset = positions.length;
    positions.push(...mesh.positions);
    indices.push(...mesh.indices.map((index) => index + offset));
  }
  return finalizeMesh(positions, indices, meta);
}

function sectionLoft(sections, {segments = 28, role = 'section-profile-loft'} = {}) {
  const positions = [], indices = [];
  for (const section of sections) {
    const exponent = section.exponent ?? 2;
    const power = 2 / exponent;
    for (let index = 0; index < segments; index += 1) {
      const angle = index / segments * Math.PI * 2 + (section.twist ?? 0);
      const cosine = Math.cos(angle), sine = Math.sin(angle);
      let x = Math.sign(cosine) * Math.abs(cosine) ** power * section.radiusX;
      let z = Math.sign(sine) * Math.abs(sine) ** power * section.radiusZ;
      if (z > 0 && section.frontFlatten) z *= 1 - section.frontFlatten * (z / section.radiusZ) ** 3;
      positions.push([x + (section.centerX ?? 0), section.y, z + (section.centerZ ?? 0)]);
    }
  }
  for (let row = 0; row < sections.length - 1; row += 1) for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    const a = row * segments + index, b = row * segments + next, c = (row + 1) * segments + next, d = (row + 1) * segments + index;
    indices.push(a, c, b, a, d, c);
  }
  const bottom = positions.length;
  positions.push([sections[0].centerX ?? 0, sections[0].y, sections[0].centerZ ?? 0]);
  const top = positions.length;
  positions.push([sections.at(-1).centerX ?? 0, sections.at(-1).y, sections.at(-1).centerZ ?? 0]);
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    indices.push(bottom, index, next);
    const last = (sections.length - 1) * segments;
    indices.push(top, last + next, last + index);
  }
  return finalizeMesh(positions, indices, {role, sections: sections.length});
}

function jointMesh(radius, depth = radius * .94) {
  return sectionLoft([
    {y: -radius * .92, radiusX: radius * .34, radiusZ: depth * .34},
    {y: -radius * .66, radiusX: radius * .78, radiusZ: depth * .78},
    {y: 0, radiusX: radius, radiusZ: depth, exponent: 2.25},
    {y: radius * .66, radiusX: radius * .78, radiusZ: depth * .78},
    {y: radius * .92, radiusX: radius * .34, radiusZ: depth * .34},
  ], {segments: 24, role: 'visible-joint-body'});
}

function torus(majorRadius, tubeRadius, y = 0, {majorSegments = 28, tubeSegments = 10, role = 'socket-cutaway-rim'} = {}) {
  const positions = [], indices = [];
  for (let major = 0; major < majorSegments; major += 1) {
    const u = major / majorSegments * Math.PI * 2;
    for (let minor = 0; minor < tubeSegments; minor += 1) {
      const v = minor / tubeSegments * Math.PI * 2;
      const radius = majorRadius + tubeRadius * Math.cos(v);
      positions.push([radius * Math.cos(u), y + tubeRadius * Math.sin(v), radius * Math.sin(u)]);
    }
  }
  for (let major = 0; major < majorSegments; major += 1) for (let minor = 0; minor < tubeSegments; minor += 1) {
    const a = major * tubeSegments + minor;
    const b = ((major + 1) % majorSegments) * tubeSegments + minor;
    const c = ((major + 1) % majorSegments) * tubeSegments + (minor + 1) % tubeSegments;
    const d = major * tubeSegments + (minor + 1) % tubeSegments;
    indices.push(a, b, c, a, c, d);
  }
  return finalizeMesh(positions, indices, {role});
}

function polygonPrism(points, back, front, role) {
  const area = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0);
  if (area < 0) points = [...points].reverse();
  const positions = points.map(([x, y]) => [x, y, back]).concat(points.map(([x, y]) => [x, y, front]));
  const indices = [];
  for (let index = 1; index < points.length - 1; index += 1) {
    indices.push(0, index + 1, index);
    indices.push(points.length, points.length + index, points.length + index + 1);
  }
  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length;
    indices.push(index, next, points.length + next, index, points.length + next, points.length + index);
  }
  return finalizeMesh(positions, indices, {role});
}

function noseMesh() {
  const positions = [[-.11, -.13, .34], [.13, -.12, .34], [.11, .14, .33], [-.09, .15, .33], [.025, -.025, .68]];
  return finalizeMesh(positions, [0, 2, 1, 0, 3, 2, 0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4], {role: 'facial-silhouette-wedge'});
}

function limbMesh(lengthValue, profile) {
  const gap = profile.gap ?? .13;
  return sectionLoft([
    {y: gap, radiusX: profile.proximalX * .78, radiusZ: profile.proximalZ * .78},
    {y: lengthValue * .18, radiusX: profile.proximalX, radiusZ: profile.proximalZ, exponent: 2.18},
    {y: lengthValue * .48, radiusX: profile.middleX, radiusZ: profile.middleZ, centerX: profile.bow ?? 0},
    {y: lengthValue * .78, radiusX: profile.distalX, radiusZ: profile.distalZ, centerX: (profile.bow ?? 0) * .5},
    {y: lengthValue - gap, radiusX: profile.distalX * .74, radiusZ: profile.distalZ * .74},
  ], {segments: 24, role: profile.role});
}

function handMesh(side = 1) {
  const meshes = [sectionLoft([
    {y: .08, radiusX: .20, radiusZ: .13},
    {y: .19, radiusX: .29, radiusZ: .16, exponent: 2.5},
    {y: .48, radiusX: .27, radiusZ: .13, exponent: 2.7},
    {y: .57, radiusX: .22, radiusZ: .10},
  ], {segments: 20, role: 'palm-shell'})];
  const offsets = [-.20, -.07, .07, .20], lengths = [.34, .40, .38, .30];
  for (let index = 0; index < 4; index += 1) {
    const finger = sectionLoft([
      {y: 0, radiusX: .055, radiusZ: .050},
      {y: lengths[index] * .72, radiusX: .048, radiusZ: .043},
      {y: lengths[index], radiusX: .025, radiusZ: .025},
    ], {segments: 12, role: 'finger'});
    const angle = offsets[index] * .22 * side;
    meshes.push(transformMesh(finger, frameMatrix([offsets[index], .52, .005], [Math.sin(angle), Math.cos(angle), 0], [0, 0, 1])));
  }
  const thumb = sectionLoft([
    {y: 0, radiusX: .075, radiusZ: .065},
    {y: .28, radiusX: .055, radiusZ: .050},
    {y: .38, radiusX: .03, radiusZ: .03},
  ], {segments: 12, role: 'thumb'});
  meshes.push(transformMesh(thumb, frameMatrix([side * .25, .22, .02], [side * .72, .68, -.12], [0, 0, 1])));
  return mergeMeshes(meshes, {role: 'articulated-hand-with-separated-fingers'});
}

function createGeometry() {
  const chestCore = sectionLoft([
    {y: .05, radiusX: .58, radiusZ: .34, centerX: .02, exponent: 2.6, frontFlatten: .22},
    {y: .28, radiusX: .68, radiusZ: .42, centerX: .01, exponent: 2.7, frontFlatten: .30},
    {y: .72, radiusX: .86, radiusZ: .49, centerX: -.04, exponent: 2.65, frontFlatten: .34},
    {y: 1.18, radiusX: .93, radiusZ: .47, centerX: -.07, exponent: 2.5, frontFlatten: .28},
    {y: 1.52, radiusX: .67, radiusZ: .35, centerX: -.04, exponent: 2.35, frontFlatten: .18},
  ], {segments: 36, role: 'ribcage-landmark-section-loft'});
  const leftChest = polygonPrism([[-.05,.22],[-.39,.19],[-.62,.54],[-.64,.96],[-.47,1.27],[-.04,1.30]], .37, .435, 'left-pectoral-plane-break');
  const rightChest = polygonPrism([[.04,.22],[.36,.20],[.59,.54],[.60,.98],[.43,1.29],[.04,1.30]], .37, .435, 'right-pectoral-plane-break');
  const pelvisBand = sectionLoft([
    {y: -.08, radiusX: .70, radiusZ: .43, exponent: 2.9, centerX: .01, frontFlatten: .12},
    {y: .10, radiusX: .82, radiusZ: .48, exponent: 2.9, centerX: -.01, frontFlatten: .15},
    {y: .39, radiusX: .65, radiusZ: .38, exponent: 2.55, centerX: -.05},
  ], {segments: 34, role: 'upper-pelvis-band'});
  const hipCup = sectionLoft([
    {y: -.38, radiusX: .19, radiusZ: .28, exponent: 2.5},
    {y: -.21, radiusX: .30, radiusZ: .38, exponent: 2.75, centerZ: .015},
    {y: .05, radiusX: .36, radiusZ: .42, exponent: 2.85, centerZ: .02},
    {y: .23, radiusX: .28, radiusZ: .36, exponent: 2.6},
  ], {segments: 28, role: 'hip-socket-cup'});
  return {
    pelvis: mergeMeshes([pelvisBand, transformMesh(hipCup, frameMatrix([-.47, -.10, 0])), transformMesh(hipCup, frameMatrix([.47, -.10, 0]))], {role: 'pelvis-band-with-bilateral-leg-openings'}),
    waist: sectionLoft([{y:.03,radiusX:.48,radiusZ:.32,exponent:2.4},{y:.24,radiusX:.50,radiusZ:.34,centerX:-.02,exponent:2.5},{y:.54,radiusX:.55,radiusZ:.36,centerX:-.05,exponent:2.45}], {segments:28,role:'narrow-intermediate-waist-connector'}),
    chest: mergeMeshes([chestCore, leftChest, rightChest], {role: 'ribcage-shell-and-bilateral-front-planes'}),
    neck: sectionLoft([{y:.02,radiusX:.26,radiusZ:.24},{y:.20,radiusX:.24,radiusZ:.23},{y:.43,radiusX:.22,radiusZ:.22}], {segments:24,role:'neck-connector'}),
    head: sectionLoft([
      {y:-.58,radiusX:.29,radiusZ:.32,centerZ:-.02},{y:-.38,radiusX:.45,radiusZ:.45,centerZ:.01,exponent:2.2},
      {y:.02,radiusX:.53,radiusZ:.54,centerX:.03,centerZ:.015,exponent:2.16,frontFlatten:.12},{y:.40,radiusX:.48,radiusZ:.49,centerX:.01,centerZ:-.01,exponent:2.08},
      {y:.58,radiusX:.38,radiusZ:.40,centerX:-.02,centerZ:-.028},{y:.70,radiusX:.16,radiusZ:.18,centerX:-.04,centerZ:-.04},
    ], {segments:40,role:'cranial-and-jaw-section-loft'}),
    nose: noseMesh(), ear: jointMesh(.13,.075), shoulderJoint: jointMesh(.34,.31), elbowJoint: jointMesh(.25,.23), wristJoint: jointMesh(.16,.145),
    hipJoint: jointMesh(.27,.25), kneeJoint: jointMesh(.24,.22), ankleJoint: jointMesh(.20,.18), raisedAnkleJoint: jointMesh(.34,.30),
    upperArm: limbMesh(1.05,{proximalX:.31,proximalZ:.29,middleX:.27,middleZ:.25,distalX:.22,distalZ:.21,bow:.025,role:'upper-arm-asymmetric-shell'}),
    forearm: limbMesh(1.12,{proximalX:.25,proximalZ:.23,middleX:.23,middleZ:.21,distalX:.15,distalZ:.14,bow:-.035,role:'forearm-tapered-shell'}),
    hangingUpperArm: limbMesh(1.36,{proximalX:.31,proximalZ:.29,middleX:.27,middleZ:.25,distalX:.22,distalZ:.21,bow:.025,role:'hanging-upper-arm-long-section-shell'}),
    hangingForearm: limbMesh(1.42,{proximalX:.25,proximalZ:.23,middleX:.23,middleZ:.21,distalX:.15,distalZ:.14,bow:-.035,role:'hanging-forearm-long-section-shell'}),
    thigh: limbMesh(1.95,{proximalX:.43,proximalZ:.39,middleX:.48,middleZ:.42,distalX:.31,distalZ:.29,bow:.07,role:'thigh-mass-transition-shell'}),
    shin: limbMesh(1.48,{proximalX:.33,proximalZ:.30,middleX:.29,middleZ:.27,distalX:.21,distalZ:.19,bow:-.035,role:'shin-calf-transition-shell'}),
    handLeft: handMesh(-1), handRight: handMesh(1),
    kneelingFoot: sectionLoft([{y:-.14,radiusX:.22,radiusZ:.20},{y:.08,radiusX:.25,radiusZ:.24,centerZ:.03,exponent:2.6},{y:.40,radiusX:.30,radiusZ:.20,centerZ:.06,exponent:3.2},{y:.82,radiusX:.32,radiusZ:.13,centerZ:.02,exponent:3.5},{y:1,radiusX:.27,radiusZ:.075,centerZ:-.03,exponent:3.7}], {segments:28,role:'heel-instep-toe-foot-shell'}),
    raisedFoot: sectionLoft([
      {y:-.16,radiusX:.25,radiusZ:.21,exponent:2.8},
      {y:.06,radiusX:.31,radiusZ:.25,centerZ:.025,exponent:3.0},
      {y:.40,radiusX:.36,radiusZ:.23,centerZ:.04,exponent:3.25},
      {y:.82,radiusX:.39,radiusZ:.17,centerZ:.015,exponent:3.5},
      {y:1.18,radiusX:.35,radiusZ:.10,centerZ:-.025,exponent:3.8},
    ], {segments:30,role:'planted-heel-instep-toe-foot-shell'}),
    footBridge: sectionLoft([{y:-.08,radiusX:.18,radiusZ:.15},{y:.20,radiusX:.21,radiusZ:.17,exponent:2.45},{y:.52,radiusX:.18,radiusZ:.14,exponent:2.6}], {segments:20,role:'ankle-to-foot-necked-connector'}),
    shoulderRim: torus(.31,.045,.05), elbowRim: torus(.23,.035,.05), kneeRim: torus(.31,.065,.015), ankleRim: torus(.19,.032,.04), raisedAnkleRim: torus(.26,.045,.04),
  };
}

const referencePose = {
  pelvis:[-.05,.88,-.04], waistBase:[-.04,1.24,-.015], chestBase:[.10,1.69,.02], neckBase:[-.08,3.18,.07], head:[.08,3.98,.10], noseDirection:[.68,-.03,.73],
  hangingShoulder:[-1.02,2.91,.07], hangingElbow:[-1.30,1.58,.18], hangingWrist:[-1.24,.18,.28], hangingHand:[-1.20,-.48,.25],
  restingShoulder:[.58,3.02,.16], restingElbow:[1.10,2.25,.08], restingWrist:[1.56,1.82,-.55], restingHand:[1.82,1.16,-.81],
  kneelingHip:[-.59,.78,.03], kneelingKnee:[-.72,-1.52,.22], kneelingAnkle:[-.84,-.41,-1.05], kneelingToe:[-.66,-.55,-1.84],
  raisedHip:[.50,.80,.16], raisedKnee:[1.88,.78,-.82], raisedAnkle:[1.35,-.55,-.48], raisedToe:[2.72,-.88,-.26],
};

const neutralPose = {
  pelvis:[0,.10,0], waistBase:[0,.48,0], chestBase:[0,.94,0], neckBase:[0,2.49,0], head:[0,3.30,0], noseDirection:[0,0,1],
  hangingShoulder:[-.78,2.22,0], hangingElbow:[-1.02,1.23,0], hangingWrist:[-.95,.17,0], hangingHand:[-.92,-.43,0],
  restingShoulder:[.78,2.22,0], restingElbow:[1.02,1.23,0], restingWrist:[.95,.17,0], restingHand:[.92,-.43,0],
  kneelingHip:[-.48,.08,0], kneelingKnee:[-.48,-1.87,0], kneelingAnkle:[-.48,-3.35,0], kneelingToe:[-.47,-4.25,.12],
  raisedHip:[.48,.08,0], raisedKnee:[.48,-1.87,0], raisedAnkle:[.48,-3.35,0], raisedToe:[.47,-4.25,.12],
};

function poseParts(pose, geometry) {
  const world = new Map(), parts = [];
  const addPart = (id, mesh, matrix, parentId = null, materialId = 'wood-body', role = null, scopeId = `articulated-figure.${id}`) => {
    world.set(id, matrix);
    parts.push({id, mesh, materialId, role, scopeId, parentId, _world: matrix});
  };
  const addOriented = (id, mesh, origin, endpoint, parentId, materialId, role, zHint = [0,0,1]) => addPart(id, mesh, frameMatrix(origin, sub(endpoint, origin), zHint), parentId, materialId, role);
  const bodyFacing = pose === referencePose ? [.34,0,.94] : [0,0,1];
  const pelvisFrame = frameMatrix(pose.pelvis, sub(pose.waistBase, pose.pelvis), bodyFacing);
  addPart('pelvis-shell', geometry.pelvis, pelvisFrame, null, 'wood-body', 'pelvis-shell');
  addOriented('waist-connector', geometry.waist, pose.waistBase, pose.chestBase, 'pelvis-shell', 'wood-light', 'waist-connector', bodyFacing);
  addOriented('ribcage-shell', geometry.chest, pose.chestBase, pose.neckBase, 'waist-connector', 'wood-body', 'ribcage-shell', bodyFacing);
  addOriented('neck-connector', geometry.neck, pose.neckBase, pose.head, 'ribcage-shell', 'wood-light', 'neck-connector', bodyFacing);
  const headFrame = frameMatrix(pose.head, sub(pose.head, pose.neckBase), pose.noseDirection);
  addPart('head-shell', geometry.head, headFrame, 'neck-connector', 'wood-body', 'head-shell');
  addPart('nose-wedge', geometry.nose, headFrame, 'head-shell', 'wood-body', 'facial-silhouette');
  addPart('ear-visible', geometry.ear, multiplyMatrix(headFrame, frameMatrix([-.40,.02,-.01],[1,0,0],[0,0,1])), 'head-shell', 'wood-light', 'visible-ear');
  function arm(prefix, shoulder, elbow, wrist, handEnd, side) {
    const hanging = prefix === 'hanging-arm';
    const shoulderFrame = frameMatrix(shoulder, sub(elbow, shoulder));
    addPart(`${prefix}-shoulder-joint`, geometry.shoulderJoint, shoulderFrame, 'ribcage-shell', 'wood-light', 'ball-and-socket-joint');
    addPart(`${prefix}-shoulder-rim`, geometry.shoulderRim, shoulderFrame, `${prefix}-shoulder-joint`, 'joint-dark', 'true-socket-rim');
    addOriented(`${prefix}-upper-arm`, hanging ? geometry.hangingUpperArm : geometry.upperArm, shoulder, elbow, `${prefix}-shoulder-joint`, 'wood-body', 'upper-arm-shell');
    const elbowFrame = frameMatrix(elbow, sub(wrist, elbow));
    addPart(`${prefix}-elbow-joint`, geometry.elbowJoint, elbowFrame, `${prefix}-upper-arm`, 'wood-light', 'hinge-ball-joint');
    addPart(`${prefix}-elbow-rim`, geometry.elbowRim, elbowFrame, `${prefix}-elbow-joint`, 'joint-dark', 'true-socket-rim');
    addOriented(`${prefix}-forearm`, hanging ? geometry.hangingForearm : geometry.forearm, elbow, wrist, `${prefix}-elbow-joint`, 'wood-body', 'forearm-shell');
    const wristFrame = frameMatrix(wrist, sub(handEnd, wrist));
    addPart(`${prefix}-wrist-joint`, geometry.wristJoint, wristFrame, `${prefix}-forearm`, 'wood-light', 'wrist-joint');
    addOriented(`${prefix}-hand`, side < 0 ? geometry.handLeft : geometry.handRight, wrist, handEnd, `${prefix}-wrist-joint`, 'wood-light', 'separated-finger-hand');
  }
  arm('hanging-arm', pose.hangingShoulder, pose.hangingElbow, pose.hangingWrist, pose.hangingHand, -1);
  arm('resting-arm', pose.restingShoulder, pose.restingElbow, pose.restingWrist, pose.restingHand, 1);
  function leg(prefix, hip, knee, ankle, toe) {
    const raised = prefix === 'raised-leg';
    const hipFrame = frameMatrix(hip, sub(knee, hip));
    addPart(`${prefix}-hip-joint`, geometry.hipJoint, hipFrame, 'pelvis-shell', 'wood-light', 'ball-and-socket-joint');
    addOriented(`${prefix}-thigh`, geometry.thigh, hip, knee, `${prefix}-hip-joint`, 'wood-body', 'thigh-shell');
    const kneeFrame = frameMatrix(knee, sub(ankle, knee));
    addPart(`${prefix}-knee-joint`, geometry.kneeJoint, kneeFrame, `${prefix}-thigh`, 'joint-dark', 'recessed-hinge-body');
    addPart(`${prefix}-knee-rim`, geometry.kneeRim, kneeFrame, `${prefix}-knee-joint`, 'wood-light', 'true-knee-cutaway-rim');
    addOriented(`${prefix}-shin`, geometry.shin, knee, ankle, `${prefix}-knee-joint`, 'wood-body', 'shin-shell');
    const ankleFrame = frameMatrix(ankle, sub(toe, ankle));
    addPart(`${prefix}-ankle-joint`, raised ? geometry.raisedAnkleJoint : geometry.ankleJoint, ankleFrame, `${prefix}-shin`, 'wood-light', 'ankle-joint');
    addPart(`${prefix}-ankle-rim`, raised ? geometry.raisedAnkleRim : geometry.ankleRim, ankleFrame, `${prefix}-ankle-joint`, 'joint-dark', 'true-ankle-cutaway-rim');
    addOriented(`${prefix}-foot-bridge`, geometry.footBridge, ankle, toe, `${prefix}-ankle-joint`, 'wood-light', 'ankle-to-foot-connector');
    addOriented(`${prefix}-foot`, raised ? geometry.raisedFoot : geometry.kneelingFoot, ankle, toe, `${prefix}-foot-bridge`, 'wood-body', 'heel-instep-toe-foot');
  }
  leg('kneeling-leg', pose.kneelingHip, pose.kneelingKnee, pose.kneelingAnkle, pose.kneelingToe);
  leg('raised-leg', pose.raisedHip, pose.raisedKnee, pose.raisedAnkle, pose.raisedToe);
  for (const part of parts) {
    const parentWorld = part.parentId ? world.get(part.parentId) : null;
    part.matrix = parentWorld ? multiplyMatrix(inverseRigid(parentWorld), part._world) : part._world;
    delete part._world;
  }
  return parts;
}

export const materials = {
  'wood-body': {baseColor:[.71,.49,.30,1], metallic:0, roughness:.52},
  'wood-light': {baseColor:[.82,.64,.43,1], metallic:0, roughness:.48},
  'joint-dark': {baseColor:[.24,.12,.055,1], metallic:0, roughness:.62},
};

export function buildArticulatedFigure(poseName = 'reference') {
  const geometry = createGeometry();
  const pose = poseName === 'reference' ? referencePose : neutralPose;
  const parts = poseParts(pose, geometry);
  const glb = partsToGlb({
    assetId: `articulated-drawing-mannequin-${poseName}`,
    name: `Articulated drawing mannequin — ${poseName} pose`,
    materials, parts,
    extras: {poseName, localMeshInvariant: true, construction: 'evidence-fitted-section-lofts'},
  });
  return {glb, parts, pose};
}
