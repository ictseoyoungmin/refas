import assert from 'node:assert/strict';
import {test} from 'node:test';

import {readLabelCatalog, syncLabels, validateLabelCatalog} from '../.github/scripts/sync-labels.mjs';

test('managed labels exactly cover the semantic governance contract', async () => {
  const labels = await readLabelCatalog();
  assert.deepEqual(validateLabelCatalog(labels), {
    status: 'PASS',
    labels: 54,
    capabilities: 11,
    findings: 22,
  });
});

test('label sync creates or updates managed labels without deleting unrelated labels', async () => {
  const labels = await readLabelCatalog();
  const existing = [
    {...labels[0]},
    {...labels[1], color: '000000'},
    {name: 'community-label', color: 'FFFFFF', description: 'Not managed by RefAs'},
  ];
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({url, options});
    const method = options.method ?? 'GET';
    assert.notEqual(method, 'DELETE');
    const payload = method === 'GET' ? existing : JSON.parse(options.body);
    return {ok: true, status: 200, text: async () => JSON.stringify(payload)};
  };

  try {
    const result = await syncLabels({labels, token: 'test-token', repository: 'owner/refas'});
    assert.deepEqual(result, {
      status: 'PASS',
      repository: 'owner/refas',
      created: 52,
      updated: 1,
      unchanged: 1,
      unmanagedPreserved: 1,
    });
    assert.equal(calls.filter((call) => (call.options.method ?? 'GET') === 'POST').length, 52);
    assert.equal(calls.filter((call) => call.options.method === 'PATCH').length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
