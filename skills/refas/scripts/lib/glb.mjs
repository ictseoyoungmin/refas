import {createHash} from 'node:crypto';
import {analyzeMesh, computeVertexNormals} from './mesh.mjs';

const align4 = (value) => (value + 3) & ~3;
const sha = (value) => createHash('sha256').update(value).digest('hex');
const clone = (value) => structuredClone(value);

function buildGlb(json, binary) {
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const jsonLength = align4(jsonBytes.length), binaryLength = align4(binary.length);
  const total = 12 + 8 + jsonLength + 8 + binaryLength;
  const output = Buffer.alloc(total);
  output.writeUInt32LE(0x46546c67, 0); output.writeUInt32LE(2, 4); output.writeUInt32LE(total, 8);
  output.writeUInt32LE(jsonLength, 12); output.writeUInt32LE(0x4e4f534a, 16);
  jsonBytes.copy(output, 20); output.fill(0x20, 20 + jsonBytes.length, 20 + jsonLength);
  const binaryOffset = 20 + jsonLength;
  output.writeUInt32LE(binaryLength, binaryOffset); output.writeUInt32LE(0x004e4942, binaryOffset + 4);
  binary.copy(output, binaryOffset + 8);
  return output;
}

export function parseGlb(input) {
  const bytes = Buffer.from(input);
  if (bytes.length < 20) throw new Error('GLB is truncated');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) throw new Error('embedded GLB 2.0 required');
  if (view.getUint32(8, true) !== bytes.length) throw new Error('GLB header length does not match its bytes');
  let offset = 12, json = null, binary = null;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw new Error('GLB chunk header is truncated');
    const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true);
    offset += 8;
    if (offset + length > bytes.length) throw new Error('GLB chunk exceeds the container length');
    const chunk = bytes.subarray(offset, offset + length);
    if (type === 0x4e4f534a) {
      if (json) throw new Error('GLB contains multiple JSON chunks');
      json = JSON.parse(chunk.toString('utf8').replace(/\u0000+$/u, '').trim());
    }
    if (type === 0x004e4942) {
      if (binary) throw new Error('GLB contains multiple BIN chunks');
      binary = Buffer.from(chunk);
    }
    offset += length;
  }
  if (!json || !binary || (json.buffers?.length ?? 0) !== 1) throw new Error('one embedded JSON/BIN buffer is required');
  if (json.buffers[0].uri) throw new Error('external GLB buffers are not supported');
  if (!Number.isInteger(json.buffers[0].byteLength) || json.buffers[0].byteLength < 0 || json.buffers[0].byteLength > binary.length) throw new Error('GLB buffer length is invalid');
  return {json, binary};
}

function materialJson(id, material) {
  const output = {name: id, pbrMetallicRoughness: {baseColorFactor: material.baseColor ?? [0.7, 0.7, 0.7, 1], metallicFactor: material.metallic ?? 0, roughnessFactor: material.roughness ?? 0.5}};
  if (Number.isFinite(material.clearcoat) && material.clearcoat > 0) output.extensions = {KHR_materials_clearcoat: {clearcoatFactor: material.clearcoat}};
  return output;
}

function bounds(points) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const point of points) for (let index = 0; index < 3; index += 1) { min[index] = Math.min(min[index], point[index]); max[index] = Math.max(max[index], point[index]); }
  return {min, max};
}

export function partsToGlb({parts, materials, assetId = 'refas-asset', name = 'RefAs Asset', extras = {}} = {}) {
  if (!Array.isArray(parts) || !parts.length) throw new Error('parts are required');
  if (new Set(parts.map((part) => part?.id)).size !== parts.length) throw new Error('part IDs must be unique');
  const materialEntries = Object.entries(materials ?? {});
  if (!materialEntries.length) throw new Error('materials are required');
  const materialIds = new Map(materialEntries.map(([id], index) => [id, index]));
  const json = {
    asset: {version: '2.0', generator: 'RefAs 1.0.0'},
    scene: 0, scenes: [{name, nodes: []}], nodes: [], meshes: [], accessors: [], bufferViews: [], buffers: [{byteLength: 0}],
    materials: materialEntries.map(([id, material]) => materialJson(id, material)),
    extras: {refas: {schema: 'refas.asset/v1', assetId, partIds: parts.map((part) => part.id), ...extras}},
  };
  if (json.materials.some((material) => material.extensions?.KHR_materials_clearcoat)) json.extensionsUsed = ['KHR_materials_clearcoat'];
  let offset = 0; const chunks = [];
  const push = (typed) => {
    const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength), aligned = align4(offset), index = json.bufferViews.length;
    json.bufferViews.push({buffer: 0, byteOffset: aligned, byteLength: bytes.length}); chunks.push({offset: aligned, bytes}); offset = aligned + bytes.length; return index;
  };
  for (const part of parts) {
    if (!part?.id || !part.mesh || !materialIds.has(part.materialId)) throw new Error('every part requires id, mesh, and known materialId');
    const analysis = analyzeMesh(part.mesh); if (!analysis.valid) throw new Error(`${part.id}: invalid mesh`);
    const normals = part.mesh.normals?.length === part.mesh.positions.length ? part.mesh.normals : computeVertexNormals(part.mesh.positions, part.mesh.indices);
    const positions = new Float32Array(part.mesh.positions.flat()), normalData = new Float32Array(normals.flat());
    const maximum = Math.max(...part.mesh.indices), IndexArray = maximum <= 65535 ? Uint16Array : Uint32Array, indexData = new IndexArray(part.mesh.indices);
    const positionView = push(positions), normalView = push(normalData), indexView = push(indexData), accessorStart = json.accessors.length, extent = bounds(part.mesh.positions);
    json.accessors.push(
      {bufferView: positionView, componentType: 5126, count: part.mesh.positions.length, type: 'VEC3', min: extent.min, max: extent.max},
      {bufferView: normalView, componentType: 5126, count: normals.length, type: 'VEC3'},
      {bufferView: indexView, componentType: IndexArray === Uint16Array ? 5123 : 5125, count: part.mesh.indices.length, type: 'SCALAR'},
    );
    const meshIndex = json.meshes.length;
    const topology = part.mesh.topology ?? part.mesh.meta?.topology ?? null;
    json.meshes.push({name: part.id, primitives: [{attributes: {POSITION: accessorStart, NORMAL: accessorStart + 1}, indices: accessorStart + 2, material: materialIds.get(part.materialId), mode: 4}], ...(topology ? {extras: {refasTopology: topology}} : {})});
    const nodeIndex = json.nodes.length;
    json.nodes.push({name: part.id, mesh: meshIndex, extras: {refasPartId: part.id, role: part.role ?? null, scopeId: part.scopeId ?? null, materialId: part.materialId}});
    json.scenes[0].nodes.push(nodeIndex);
  }
  const binary = Buffer.alloc(align4(offset)); for (const chunk of chunks) chunk.bytes.copy(binary, chunk.offset);
  json.buffers[0].byteLength = binary.length;
  return buildGlb(json, binary);
}

export function appendPartsToClosedGlb(sourceGlb, {parts, materials, name = 'RefAs Parent Assembly', extras = {}} = {}) {
  if (!parts?.length) throw new Error('parts are required');
  const sourceGlbBytes = Buffer.from(sourceGlb);
  const {json: source, binary: sourceBinary} = parseGlb(sourceGlb), json = clone(source);
  json.bufferViews ??= []; json.accessors ??= []; json.meshes ??= []; json.nodes ??= []; json.materials ??= []; json.scenes ??= [{nodes: []}]; json.scene = Number.isInteger(json.scene) ? json.scene : 0; json.scenes[json.scene].nodes ??= [];
  const sourceCounts = {nodes: json.nodes.length, meshes: json.meshes.length, materials: json.materials.length};
  const existingPartIds = new Set(json.nodes.map((node) => node.extras?.refasPartId ?? node.name).filter(Boolean));
  if (new Set(parts.map((part) => part?.id)).size !== parts.length || parts.some((part) => existingPartIds.has(part?.id))) throw new Error('appended part IDs must be unique and must not replace a closed child part');
  const materialIds = new Map(json.materials.map((material, index) => [material.name, index]));
  for (const [id, material] of Object.entries(materials ?? {})) if (!materialIds.has(id)) { materialIds.set(id, json.materials.length); json.materials.push(materialJson(id, material)); }
  let offset = align4(sourceBinary.length); const chunks = [{offset: 0, bytes: sourceBinary}], newNodeIds = [];
  const push = (typed) => { const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength), aligned = align4(offset), index = json.bufferViews.length; json.bufferViews.push({buffer: 0, byteOffset: aligned, byteLength: bytes.length}); chunks.push({offset: aligned, bytes}); offset = aligned + bytes.length; return index; };
  for (const part of parts) {
    if (!part?.id || !part.mesh || !materialIds.has(part.materialId)) throw new Error('every appended part requires id, mesh, and known material');
    const analysis = analyzeMesh(part.mesh); if (!analysis.valid) throw new Error(`${part.id}: invalid mesh`);
    const normals = part.mesh.normals?.length === part.mesh.positions.length ? part.mesh.normals : computeVertexNormals(part.mesh.positions, part.mesh.indices);
    const positionData = new Float32Array(part.mesh.positions.flat()), normalData = new Float32Array(normals.flat()), maximum = Math.max(...part.mesh.indices), IndexArray = maximum <= 65535 ? Uint16Array : Uint32Array, indexData = new IndexArray(part.mesh.indices);
    const pv = push(positionData), nv = push(normalData), iv = push(indexData), start = json.accessors.length, extent = bounds(part.mesh.positions);
    json.accessors.push({bufferView: pv, componentType: 5126, count: part.mesh.positions.length, type: 'VEC3', min: extent.min, max: extent.max}, {bufferView: nv, componentType: 5126, count: normals.length, type: 'VEC3'}, {bufferView: iv, componentType: IndexArray === Uint16Array ? 5123 : 5125, count: part.mesh.indices.length, type: 'SCALAR'});
    const topology = part.mesh.topology ?? part.mesh.meta?.topology ?? null;
    const meshIndex = json.meshes.length; json.meshes.push({name: part.id, primitives: [{attributes: {POSITION: start, NORMAL: start + 1}, indices: start + 2, material: materialIds.get(part.materialId), mode: 4}], ...(topology ? {extras: {refasTopology: topology}} : {})});
    const nodeIndex = json.nodes.length; json.nodes.push({name: part.id, mesh: meshIndex, extras: {refasPartId: part.id, role: part.role ?? null, scopeId: part.scopeId ?? null, materialId: part.materialId}}); json.scenes[json.scene].nodes.push(nodeIndex); newNodeIds.push(nodeIndex);
  }
  const binary = Buffer.alloc(align4(offset)); for (const chunk of chunks) chunk.bytes.copy(binary, chunk.offset); json.buffers = [{byteLength: binary.length}]; json.scenes[json.scene].name = name;
  if (json.materials.some((material) => material.extensions?.KHR_materials_clearcoat)) json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), 'KHR_materials_clearcoat'])];
  const sourceGlbSha256 = sha(sourceGlbBytes), sourceBinarySha256 = sha(sourceBinary), prefixPreserved = binary.subarray(0, sourceBinary.length).equals(sourceBinary);
  json.extras = {...(json.extras ?? {}), refasAssembly: {schema: 'refas.closed-child-assembly/v1', sourceGlbSha256, sourceBinarySha256, sourceCounts, newNodeIds, sourceBinaryPrefixPreserved: prefixPreserved, ...extras}};
  const glb = buildGlb(json, binary);
  return {glb, report: {schema: 'refas.closed-child-assembly-report/v1', sourceGlbSha256, sourceBinarySha256, sourceBinaryPrefixPreserved: prefixPreserved, sourceCounts, addedParts: parts.length, outputSha256: sha(glb)}};
}

export function inspectGlb(input) {
  const {json, binary} = parseGlb(input);
  let triangleCount = 0;
  for (const mesh of json.meshes ?? []) for (const primitive of mesh.primitives ?? []) triangleCount += ((json.accessors?.[primitive.indices]?.count ?? json.accessors?.[primitive.attributes?.POSITION]?.count ?? 0) / 3);
  return {
    schema: 'refas.glb-inspection/v1',
    valid: true,
    generator: json.asset?.generator ?? null,
    binarySha256: sha(binary),
    nodeCount: json.nodes?.length ?? 0,
    meshCount: json.meshes?.length ?? 0,
    materialCount: json.materials?.length ?? 0,
    triangleCount,
    partIds: (json.nodes ?? []).map((node) => node.extras?.refasPartId).filter(Boolean),
    extras: json.extras ?? null,
  };
}
