import {createHash} from 'node:crypto';

import {parseGlb} from './glb.mjs';

export const QA_REALIZED_SURFACE_SCHEMA = 'refas.qa-realized-surface-descriptors/v1';
const sha256 = (bytes) => createHash('sha256').update(Buffer.from(bytes)).digest('hex');
const verdict = (status, reason, details = [], assetSha256 = null) => Object.freeze({
  schema: QA_REALIZED_SURFACE_SCHEMA, status, reason,
  assetSha256, details: [...details].sort(),
});

class UnsupportedGeometry extends Error {}
const finiteInt = (n) => Number.isSafeInteger(n) && n >= 0;
const encodedPoint = (point) => {
  if (!Array.isArray(point) || point.length !== 3 || !point.every(Number.isFinite)) {
    throw new Error('invalid descriptor triangle coordinate');
  }
  return point.map((v) => {
    const f = Math.fround(v);
    if (!Number.isFinite(f)) throw new Error('descriptor vertex cannot be represented as Float32');
    return Object.is(f, -0) ? '0' : String(f);
  }).join(',');
};
// Preserve winding: ABC/BCA/CAB describe one oriented triangle. The reverse
// winding is not equivalent because it reverses the surface-anchor normal.
const orientedTriangleKey = (vertices) => {
  const k = vertices.map(encodedPoint);
  return [k.join('|'), [k[1], k[2], k[0]].join('|'), [k[2], k[0], k[1]].join('|')].sort()[0];
};

function accessorData(json, binary, index, {position, nodeId}) {
  const a = json.accessors?.[index];
  if (!a || !finiteInt(a.count) || !a.count || a.sparse) {
    throw new UnsupportedGeometry(nodeId + ': missing, sparse, or malformed geometry accessor');
  }
  if (position ? a.type !== 'VEC3' || a.componentType !== 5126 : a.type !== 'SCALAR' || ![5121,5123,5125].includes(a.componentType)) {
    throw new UnsupportedGeometry(nodeId + ': unsupported geometry accessor format');
  }
  if (a.normalized === true) throw new UnsupportedGeometry(nodeId + ': normalized geometry accessor is unsupported');
  const bytesPerComponent = position ? 4 : a.componentType === 5125 ? 4 : a.componentType === 5123 ? 2 : 1;
  const width = position ? 3 * bytesPerComponent : bytesPerComponent;
  const view = json.bufferViews?.[a.bufferView];
  if (!view || view.buffer !== 0) throw new UnsupportedGeometry(nodeId + ': geometry bufferView is unavailable');
  const viewOffset = view.byteOffset ?? 0, localOffset = a.byteOffset ?? 0;
  const stride = view.byteStride ?? width;
  if (![viewOffset,view.byteLength,localOffset,stride].every(finiteInt) ||
      stride < width || stride % bytesPerComponent || localOffset % bytesPerComponent ||
      viewOffset % bytesPerComponent ||
      localOffset + (a.count - 1) * stride + width > view.byteLength ||
      viewOffset + view.byteLength > binary.length) {
    throw new Error(nodeId + ': invalid geometry buffer bounds or alignment');
  }
  const data = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  const out = [];
  for (let i = 0; i < a.count; i += 1) {
    const off = viewOffset + localOffset + i * stride;
    if (position) {
      const p = [0, 4, 8].map((j) => data.getFloat32(off + j, true));
      if (!p.every(Number.isFinite)) throw new Error(nodeId + ': non-finite GLB position');
      out.push(p);
    } else {
      out.push(a.componentType === 5125 ? data.getUint32(off, true) :
        a.componentType === 5123 ? data.getUint16(off, true) : data.getUint8(off));
    }
  }
  return out;
}

function meshTriangles(json, binary, node, nodeId) {
  const mesh = json.meshes?.[node.mesh];
  if (!mesh || !Array.isArray(mesh.primitives) || !mesh.primitives.length) {
    throw new UnsupportedGeometry(nodeId + ': physical owner mesh is unavailable');
  }
  if (node.skin != null || node.weights != null || mesh.weights != null) {
    throw new UnsupportedGeometry(nodeId + ': skinned or morphed owner requires evaluated geometry evidence');
  }
  const found = new Set();
  for (const primitive of mesh.primitives) {
    if ((primitive.mode ?? 4) !== 4 || (primitive.targets?.length ?? 0) > 0) {
      throw new UnsupportedGeometry(nodeId + ': non-triangle or morphed geometry requires separate evaluation');
    }
    const positions = accessorData(json, binary, primitive.attributes?.POSITION, {position:true,nodeId});
    const indices = primitive.indices == null
      ? positions.map((_, index) => index)
      : accessorData(json, binary, primitive.indices, {position:false,nodeId});
    if (indices.length % 3) throw new Error(nodeId + ': triangle index count is not divisible by three');
    for (let i = 0; i < indices.length; i += 3) {
      const triplet = indices.slice(i, i + 3);
      if (triplet.some((v) => v >= positions.length) || new Set(triplet).size !== 3) {
        throw new Error(nodeId + ': invalid or degenerate triangle index');
      }
      found.add(orientedTriangleKey(triplet.map((v) => positions[v])));
    }
  }
  return found;
}

function activeMeshNodes(json) {
  const nodes = json.nodes ?? [], scene = json.scenes?.[json.scene ?? 0];
  if (!scene || !Array.isArray(scene.nodes)) throw new Error('active GLB scene is missing');
  const reached = new Set();
  const visit = (index) => {
    if (!finiteInt(index) || index >= nodes.length || reached.has(index)) {
      throw new Error('invalid, cyclic or multiply referenced GLB scene node');
    }
    reached.add(index);
    for (const child of nodes[index].children ?? []) visit(child);
  };
  for (const root of scene.nodes) visit(root);
  const owners = new Map();
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.mesh == null) continue;
    if (!reached.has(index)) throw new UnsupportedGeometry('mesh outside active GLB scene');
    const ownerId = node.extras?.refasPartId ?? node.name;
    if (typeof ownerId !== 'string' || !ownerId.length || owners.has(ownerId)) {
      throw new UnsupportedGeometry('ambiguous or duplicate physical GLB part identity');
    }
    owners.set(ownerId, node);
  }
  return owners;
}

/**
 * Check that every typed owner-local descriptor triangle exists, with the same
 * winding, in the exact current active-scene GLB owner's actual FLOAT32 mesh.
 * Digest-consistent worker descriptors alone do NOT authorize this result.
 * This does not prove that the worker's semantic owner or patch was correctly
 * observed in the primary photograph (independent QA-03 responsibility).
 */
export function verifyRealizedSurfaceDescriptors(glb, surfaces, anchorSet) {
  if (!glb || !Array.isArray(surfaces) || !anchorSet) {
    return verdict('INSUFFICIENT', 'actual GLB, typed surface descriptors and anchor set are required');
  }
  const assetSha256 = sha256(glb);
  const owners = new Set((anchorSet.anchors ?? []).map((a) => a.ownerId));
  if (!owners.size || surfaces.length === 0) {
    return verdict('INSUFFICIENT', 'anchor owner surface coverage is absent', [], assetSha256);
  }
  try {
    const {json,binary} = parseGlb(glb);
    const meshes = activeMeshNodes(json), seen = new Set(), failures = [];
    for (const surface of surfaces) {
      const id = surface?.ownerId;
      if (typeof id !== 'string' || !id.length || seen.has(id)) {
        return verdict('INSUFFICIENT', 'surface descriptor owner identity is missing or duplicated', [], assetSha256);
      }
      seen.add(id);
      const node = meshes.get(id);
      if (!node) {
        return verdict('INSUFFICIENT', 'surface descriptor owner has no uniquely identified active physical mesh', [id], assetSha256);
      }
      if (!Array.isArray(surface.vertices) || !Array.isArray(surface.triangles) || !surface.triangles.length) {
        return verdict('INSUFFICIENT', 'surface descriptor has no testable geometric triangles', [id], assetSha256);
      }
      const actual = meshTriangles(json, binary, node, id);
      for (const triangle of surface.triangles) {
        if (!Array.isArray(triangle?.indices) || triangle.indices.length !== 3 ||
            triangle.indices.some((i) => !finiteInt(i) || i >= surface.vertices.length)) {
          throw new Error(id + ': malformed descriptor triangle indices');
        }
        const key = orientedTriangleKey(triangle.indices.map((i) => surface.vertices[i]));
        if (!actual.has(key)) failures.push(id + ':' + triangle.id);
      }
    }
    const missing = [...owners].filter((id) => !seen.has(id));
    if (missing.length) {
      return verdict('INSUFFICIENT', 'surface anchor owners lack current GLB-bound descriptors', missing, assetSha256);
    }
    if (failures.length) {
      return verdict('FAIL', 'descriptor triangles differ from the current realized GLB owner-local mesh', failures, assetSha256);
    }
    return verdict('PASS', 'all typed owner-local surface triangles occur in the exact candidate GLB', [...seen], assetSha256);
  } catch (error) {
    if (error instanceof UnsupportedGeometry) {
      return verdict('INSUFFICIENT', error.message, [], assetSha256);
    }
    return verdict('FAIL', 'realized GLB surface replay failed', [String(error.message ?? error)], assetSha256);
  }
}
