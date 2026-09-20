import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import * as PublicApi from '../skills/refas/scripts/lib/index.mjs';
import {
  isTrustedContractFixtureProject,
  validateContractFixtureAuthority,
} from '../skills/refas/scripts/lib/contract-fixture-authority.mjs';
import {initTrustedContractFixtureProject} from '../skills/refas/scripts/lib/contract-fixture-project.mjs';

async function sourceAt(root, {kind = 'photo-reference'} = {}) {
  const bytes = Buffer.from('source bytes\n');
  const file = path.join(root, 'source', 'reference.bin');
  await fs.mkdir(path.dirname(file), {recursive: true});
  await fs.writeFile(file, bytes);
  return {
    schema: 'refas.source-manifest/v1',
    id: 'primary-reference',
    path: 'source/reference.bin',
    sha256: PublicApi.digestBytes(bytes),
    sizeBytes: bytes.length,
    width: 16,
    height: 16,
    authority: 'primary',
    acquisition: {kind},
  };
}

test('public project initialization rejects every reserved contract-fixture acquisition kind', async (t) => {
  for (const kind of ['test-fixture', 'deterministic-project-fixture', 'synthetic-test-fixture']) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-fixture-reject-'));
    t.after(() => fs.rm(root, {recursive: true, force: true}));
    const source = await sourceAt(root, {kind});
    await assert.rejects(
      () => PublicApi.initProject(root, {projectId: `reject-${kind}`, source}),
      /contract fixture acquisition kinds are runtime-internal/,
    );
  }
});

test('public source binding cannot mint fixture authority after project creation', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-fixture-bind-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  await PublicApi.initProject(root, {projectId: 'fixture-bind-reject'});
  const source = await sourceAt(root, {kind: 'test-fixture'});
  await assert.rejects(
    () => PublicApi.bindSource(root, source),
    /contract fixture acquisition kinds are runtime-internal/,
  );
});

test('source metadata relabeling does not create trusted fixture authority', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-fixture-tamper-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const source = await sourceAt(root);
  await PublicApi.initProject(root, {projectId: 'fixture-tamper', source});

  const projectFile = path.join(root, '.refas', 'project.json');
  const state = JSON.parse(await fs.readFile(projectFile, 'utf8'));
  state.source.acquisition.kind = 'test-fixture';
  await fs.writeFile(projectFile, `${JSON.stringify(state, null, 2)}\n`);

  const tampered = await PublicApi.loadProject(root);
  assert.equal(isTrustedContractFixtureProject(tampered), false);
  const audit = await PublicApi.auditProject(root);
  assert.equal(audit.valid, false);
  assert.match(audit.errors.join('\n'), /contract fixture acquisition kinds are runtime-internal/);
});

test('trusted contract harness binds authority to exact source digest and stays outside public index', async (t) => {
  assert.equal('initTrustedContractFixtureProject' in PublicApi, false);
  assert.equal('createContractFixtureAuthority' in PublicApi, false);
  assert.equal('isTrustedContractFixtureProject' in PublicApi, false);

  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'refas-fixture-trusted-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const source = await sourceAt(root);
  const state = await initTrustedContractFixtureProject(root, {
    projectId: 'trusted-fixture',
    source,
    fixtureId: 'trusted-regression',
  });

  assert.equal(state.source.acquisition.kind, 'generated-contract-reference');
  assert.equal(isTrustedContractFixtureProject(state), true);
  assert.equal(validateContractFixtureAuthority(state.contractFixtureAuthority, {
    sourceSha256: state.source.sha256,
  }).valid, true);

  const drifted = structuredClone(state);
  drifted.source.sha256 = 'f'.repeat(64);
  assert.equal(isTrustedContractFixtureProject(drifted), false);
});
