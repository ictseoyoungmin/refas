#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {CAPABILITY_ORDER, FINDING_OWNERS} from '../../skills/refas/scripts/lib/ownership.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '../..');
const CATALOG_PATH = path.join(ROOT, '.github', 'labels.json');

const FIXED_LABELS = Object.freeze([
  'type: visual-finding',
  'type: defect',
  'type: capability-change',
  'type: documentation',
  'type: governance',
  'type: release',
  'type: security',
  'severity: blocker',
  'severity: major',
  'severity: minor',
  'severity: polish',
  'release: none',
  'release: patch',
  'release: minor',
  'release: major',
  'workflow: needs-evidence',
  'workflow: ready',
  'workflow: active',
  'workflow: blocked',
  'workflow: review',
  'workflow: reopened',
]);

export async function readLabelCatalog() {
  return JSON.parse(await fs.readFile(CATALOG_PATH, 'utf8'));
}

export function validateLabelCatalog(labels) {
  assert.ok(Array.isArray(labels), 'label catalog must be an array');
  const names = new Set();
  for (const [index, label] of labels.entries()) {
    assert.equal(typeof label, 'object', `label ${index} must be an object`);
    assert.match(label.name ?? '', /^(?:type|capability|finding|severity|release|workflow): [a-z0-9-]+$/u, `invalid label name at ${index}`);
    assert.match(label.color ?? '', /^[A-F0-9]{6}$/u, `invalid label color for ${label.name}`);
    assert.equal(typeof label.description, 'string', `description missing for ${label.name}`);
    assert.ok(label.description.length > 0 && label.description.length <= 100, `description length invalid for ${label.name}`);
    assert.ok(!names.has(label.name), `duplicate label: ${label.name}`);
    names.add(label.name);
  }

  const expected = new Set([
    ...FIXED_LABELS,
    ...CAPABILITY_ORDER.map((capability) => `capability: ${capability}`),
    ...Object.keys(FINDING_OWNERS).map((finding) => `finding: ${finding}`),
  ]);
  assert.deepEqual([...names].sort(), [...expected].sort(), 'managed label catalog must exactly match the governance contract');

  return {
    status: 'PASS',
    labels: labels.length,
    capabilities: CAPABILITY_ORDER.length,
    findings: Object.keys(FINDING_OWNERS).length,
  };
}

async function githubRequest({token, repository, method = 'GET', route, body}) {
  const response = await fetch(`https://api.github.com/repos/${repository}${route}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'refas-governance-label-sync',
      ...(body ? {'Content-Type': 'application/json'} : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${method} ${route} failed (${response.status}): ${text}`);
  return payload;
}

async function readExistingLabels({token, repository}) {
  const labels = [];
  for (let page = 1; ; page += 1) {
    const batch = await githubRequest({token, repository, route: `/labels?per_page=100&page=${page}`});
    labels.push(...batch);
    if (batch.length < 100) return labels;
  }
}

export async function syncLabels({labels, token, repository}) {
  validateLabelCatalog(labels);
  assert.ok(token, 'GITHUB_TOKEN is required for label sync');
  assert.match(repository ?? '', /^[^/]+\/[^/]+$/u, 'GITHUB_REPOSITORY must be owner/name');

  const existing = await readExistingLabels({token, repository});
  const byName = new Map(existing.map((label) => [label.name.toLowerCase(), label]));
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const label of labels) {
    const current = byName.get(label.name.toLowerCase());
    if (!current) {
      await githubRequest({token, repository, method: 'POST', route: '/labels', body: label});
      created += 1;
      continue;
    }
    const same = current.name === label.name
      && current.color.toUpperCase() === label.color
      && (current.description ?? '') === label.description;
    if (same) {
      unchanged += 1;
      continue;
    }
    await githubRequest({
      token,
      repository,
      method: 'PATCH',
      route: `/labels/${encodeURIComponent(current.name)}`,
      body: {new_name: label.name, color: label.color, description: label.description},
    });
    updated += 1;
  }

  return {status: 'PASS', repository, created, updated, unchanged, unmanagedPreserved: existing.length - labels.filter((label) => byName.has(label.name.toLowerCase())).length};
}

async function main() {
  const labels = await readLabelCatalog();
  if (process.argv.includes('--validate')) {
    process.stdout.write(`${JSON.stringify(validateLabelCatalog(labels), null, 2)}\n`);
    return;
  }
  const result = await syncLabels({
    labels,
    token: process.env.GITHUB_TOKEN,
    repository: process.env.GITHUB_REPOSITORY,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (path.resolve(process.argv[1] ?? '') === SCRIPT_PATH) {
  main().catch((error) => {
    process.stderr.write(`Label sync failed: ${error.message}\n`);
    process.exit(1);
  });
}
