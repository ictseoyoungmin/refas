import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {test} from 'node:test';

test('published v1.4.1 one-time approval no longer authorizes later releases', async () => {
  const yaml = await fs.readFile(new URL('../.github/workflows/publish-release.yml', import.meta.url), 'utf8');
  assert.match(yaml, /github\.event_name == 'workflow_dispatch'/);
  assert.match(yaml, /github\.ref == 'refs\/heads\/main'/);
  assert.match(yaml, /inputs\.confirmation == 'PUBLISH'/);
  assert.doesNotMatch(yaml, /\[publish:v1\.4\.1\]|RELEASE_TRIGGER|contains\(github\.event\.workflow_run\.head_commit/);
  assert.match(yaml, /RELEASE_SHA: \$\{\{ inputs\.release_sha \}\}/);
  assert.match(yaml, /sha!==sha/);
  assert.doesNotMatch(yaml, /\benv:\s*\n\s*run:/);
  assert.match(yaml, /conclusion==='success'/);
  const namedSteps = yaml.match(/const fullQaSteps=\[([\s\S]*?)\];/);
  assert.ok(namedSteps, 'exact main CI full-gate step allowlist must remain');
  assert.equal([...namedSteps[1].matchAll(/^\s+'[^']+',?$/gm)].length, 17);
});
