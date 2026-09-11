#!/usr/bin/env node
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  analyzeInstallationBoundary,
  extractInstructionRoutes,
  resolveSkillRoute,
  verifyInstallationBoundary,
} from '../skills/refas/scripts/verify_installation_boundary.mjs';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export {extractInstructionRoutes};

export function resolveInstructionRoute(route, {root = DEFAULT_ROOT} = {}) {
  const relative = resolveSkillRoute(route, {skillRoot: path.join(root, 'skills/refas')});
  return `skills/refas/${relative}`;
}

function adapt(result) {
  return {
    ...result,
    packageDanglingRoutes: [],
    routedPackagePaths: result.routedSkillPaths.map((entry) => `skills/refas/${entry}`),
  };
}

export async function analyzeInstructionGraph({root = DEFAULT_ROOT} = {}) {
  return adapt(await analyzeInstallationBoundary({skillRoot: path.join(root, 'skills/refas')}));
}

export async function verifyInstructionGraph({root = DEFAULT_ROOT} = {}) {
  return adapt(await verifyInstallationBoundary({skillRoot: path.join(root, 'skills/refas')}));
}

async function main() {
  const result = await verifyInstructionGraph();
  process.stdout.write(`${JSON.stringify({
    status: result.status,
    referenceLeaves: result.referenceLeaves,
    reachableLeaves: result.reachableLeaves,
    orphanReferences: result.orphanReferences.length,
    danglingRoutes: result.danglingRoutes.length,
    outsideSkillRoutes: result.outsideSkillRoutes.length,
    runtimeDependencyEscapes: result.codeEscapes.length,
    compatibilityDrift: result.compatibilityDrift.length,
  }, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Instruction graph verification failed: ${error.message}\n`);
    process.exit(1);
  });
}
