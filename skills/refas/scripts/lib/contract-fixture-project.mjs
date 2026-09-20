import fs from 'node:fs/promises';
import path from 'node:path';

import {deepFreeze} from './canonical.mjs';
import {createContractFixtureAuthority, isTrustedContractFixtureProject} from './contract-fixture-authority.mjs';
import {initProject, loadProject} from './checkpoint-store.mjs';

const statePath = (root) => path.join(path.resolve(root), '.refas', 'project.json');

export async function initTrustedContractFixtureProject(root, {projectId, source, fixtureId = 'contract-fixture'} = {}) {
  const safeSource = {
    ...structuredClone(source),
    acquisition: {
      kind: 'generated-contract-reference',
      origin: 'RefAs trusted contract harness',
    },
  };
  await initProject(root, {projectId, source: safeSource});
  const file = statePath(root);
  const state = JSON.parse(await fs.readFile(file, 'utf8'));
  state.contractFixtureAuthority = createContractFixtureAuthority({
    sourceSha256: state.source.sha256,
    fixtureId,
  });
  state.journal.push({
    event: 'CONTRACT_FIXTURE_AUTHORITY_GRANTED',
    fixtureId: state.contractFixtureAuthority.fixtureId,
    sourceSha256: state.source.sha256,
    authorityDigest: state.contractFixtureAuthority.authorityDigest,
    at: new Date().toISOString(),
  });
  await fs.writeFile(file, `${JSON.stringify(state, null, 2)}\n`);
  const reloaded = await loadProject(root);
  if (!isTrustedContractFixtureProject(reloaded)) throw new Error('trusted contract fixture authority bootstrap failed');
  return deepFreeze(structuredClone(reloaded));
}
