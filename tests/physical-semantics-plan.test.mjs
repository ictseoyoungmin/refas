import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const planPath = path.join(root, 'docs', 'physical-semantics-plan.md');
const boundaryPath = path.join(root, 'docs', 'physical-semantics-boundary.md');
const architecturePath = path.join(root, 'docs', 'architecture.md');
const instructionGraphPath = path.join(root, 'skills', 'refas', 'references', 'GRAPH.json');
const semanticAuthorityPath = path.join(root, 'schemas', 'semantic-authority.schema.json');
const representationCapacityPath = path.join(root, 'schemas', 'representation-capacity.schema.json');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('P00 physical semantics plan stays native to existing RefAs ownership', () => {
  const plan = readText(planPath);

  assert.match(plan, /Physical semantics are assembly-owned construction contracts/);
  assert.match(plan, /Cross-representation validation is not a truth owner/);
  assert.match(plan, /refas\.semantic-authority-set\/v1/);
  assert.match(plan, /refas\.representation-capacity\/v1/);
  assert.match(plan, /P01 — Semantic Identity Graph/);
  assert.match(plan, /P17 — Integrated Physical Fixture/);
});

test('P00 preserves RefAs architecture authority boundaries', () => {
  const architecture = readText(architecturePath);
  const plan = readText(planPath);

  assert.match(architecture, /source truth/);
  assert.match(architecture, /construction state/);
  assert.match(architecture, /realized artifacts/);
  assert.match(architecture, /certification authority/);
  assert.match(architecture, /Assembly is explicit construction state/);

  assert.match(plan, /source truth remains owned by evidence and semantic authority/);
  assert.match(plan, /editable physical semantics remain construction state/);
  assert.match(plan, /backend files remain realized representations rather than canonical truth/);
  assert.match(plan, /certification remains claim-specific and evidence-bound/);
});

test('P00 actual instruction graph keeps physical semantics inside existing assembly ownership', () => {
  const graph = JSON.parse(readText(instructionGraphPath));
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const owners = new Set(graph.nodes.flatMap((node) => node.owners ?? []));
  const assemblyNode = graph.nodes.find((node) => node.id === 'assembly');

  assert.ok(assemblyNode, 'instruction graph must retain the existing assembly node');
  assert.deepEqual(assemblyNode.owners, ['assembly']);
  assert.ok(owners.has('assembly'), 'assembly must remain an actual graph owner');
  assert.ok(!nodeIds.has('physical-runtime'), 'P00 must not add a physical-runtime graph node');
  assert.ok(!owners.has('physical-runtime'), 'P00 must not add a physical-runtime owner');
  assert.ok(
    [...owners].every((owner) => !/^physical(?:-|$)/u.test(owner)),
    'P00 must not introduce a new physical-* top-level owner',
  );
});

test('P00 declares semantic identities that later slices must not collapse', () => {
  const plan = readText(planPath);
  const identities = [
    'assembly module',
    'attachment interface',
    'physical part',
    'rigid link',
    'virtual joint',
    'mechanism',
    'transmission',
    'actuator',
    'controller',
    'runtime endpoint',
  ];

  for (const identity of identities) {
    assert.ok(plan.includes(identity), `missing semantic identity: ${identity}`);
  }

  assert.match(plan, /must not collapse them by array position, shared display name, backend index/);
  assert.match(plan, /A fixed socket is therefore not silently promoted into a joint/);
  assert.match(plan, /bridge attachment interfaces to existing RefAs attachment semantics/);
});

test('P00 reserves canonical quaternion transform semantics for physical frames', () => {
  const plan = readText(planPath);
  const boundary = readText(boundaryPath);

  assert.match(plan, /rotation_quat_xyzw: \[x, y, z, w\]/);
  assert.match(plan, /normalized quaternion in `\[x,y,z,w\]` order/);
  assert.match(plan, /prefer `w > 0`/);
  assert.match(plan, /when `w == 0`, the first non-zero component in `x,y,z` is positive/);
  assert.match(plan, /semantic attachment-interface frames do not carry scale/);
  assert.match(plan, /negative runtime scale is not used to express handedness/);

  assert.match(boundary, /meters plus normalized quaternion `\[x,y,z,w\]`/);
  assert.match(boundary, /q` and `-q/);
  assert.match(boundary, /negative runtime scale is not a handedness mechanism/);
});

test('P00 keeps assembly top-level ownership while requiring scoped physical invalidation', () => {
  const plan = readText(planPath);
  const boundary = readText(boundaryPath);

  assert.match(plan, /`assembly` remains the single top-level RefAs capability owner/);
  assert.match(plan, /a controller-gain edit does not invalidate unrelated geometric assembly closure/);
  assert.match(plan, /a runtime endpoint\/index edit does not mutate actuator, joint, module, or source authority/);
  assert.match(plan, /invalidation dependencies must become explicit and deterministic/);

  assert.match(boundary, /physical subdomains retain separate semantic identities and invalidation scopes/);
  assert.match(boundary, /controller-only or runtime-binding edit must not silently invalidate geometric assembly closure/);
});

test('P00 reuses existing semantic authority and representation capacity contracts', () => {
  const semanticAuthority = JSON.parse(readText(semanticAuthorityPath));
  const representationCapacity = JSON.parse(readText(representationCapacityPath));

  assert.equal(
    semanticAuthority.properties.schema.const,
    'refas.semantic-authority-set/v1',
  );
  assert.deepEqual(
    semanticAuthority.properties.entries.items.properties.authority.enum,
    ['observed', 'inferred', 'engineered', 'unknown', 'forbidden'],
  );
  assert.equal(
    representationCapacity.properties.schema.const,
    'refas.representation-capacity/v1',
  );
});

test('P00 naming stays domain-neutral by contract', () => {
  const plan = readText(planPath);
  const boundary = readText(boundaryPath);

  assert.match(plan, /Repository-facing terminology is domain-neutral/);
  assert.match(plan, /reusable structural patterns rather than external products or source projects/);
  assert.match(boundary, /required domain-neutral physical asset/);
});
