import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const planPath = path.join(root, 'docs', 'physical-semantics-plan.md');
const architecturePath = path.join(root, 'docs', 'architecture.md');
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

test('P00 declares semantic identities that later slices must not collapse', () => {
  const plan = readText(planPath);
  const identities = [
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

  assert.match(plan, /must not collapse them by array position, shared display name, or backend index/);
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

test('P00 repository terminology remains domain-neutral', () => {
  const plan = readText(planPath).toLowerCase();

  const forbiddenProjectSpecificTerms = [
    'roboto_origin',
    'roboto origin',
    'roboparty',
  ];

  for (const term of forbiddenProjectSpecificTerms) {
    assert.equal(plan.includes(term), false, `project-specific term leaked into plan: ${term}`);
  }
});
