#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

import {buildAllVolumeClosureRegressionFixtures} from '../../tests/fixtures/volume-closure-regression-fixtures.mjs';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-dir');
const outDir = outIndex >= 0 ? path.resolve(args[outIndex + 1] ?? '') : null;
if (outIndex >= 0 && !args[outIndex + 1]) throw new Error('--out-dir requires a path');

const fixtures = buildAllVolumeClosureRegressionFixtures();
const report = {
  schema: 'refas.vc00-regression-fixture-run/v1',
  status: 'PASS',
  cases: fixtures.map(({fixture, bounds, glbSha256, inspection}) => ({
    id: fixture.id,
    sourceKind: fixture.sourceKind,
    exactHistoricalArtifactAvailable: fixture.exactHistoricalArtifactAvailable,
    geometrySource: fixture.geometrySource,
    futureSpatialExpectation: fixture.futureSpatialExpectation,
    oracle: fixture.oracle,
    extent: bounds.extent,
    glbSha256,
    meshCount: inspection.meshCount,
    triangleCount: inspection.triangleCount,
  })),
};

if (outDir) {
  await fs.rm(outDir, {recursive: true, force: true});
  await fs.mkdir(outDir, {recursive: true});
  for (const entry of fixtures) {
    await fs.writeFile(path.join(outDir, `${entry.fixture.id}.glb`), entry.glb);
  }
  await fs.writeFile(path.join(outDir, 'vc00-fixture-report.json'), `${JSON.stringify(report, null, 2)}\n`);
}

process.stdout.write(`${JSON.stringify({...report, materializedTo: outDir}, null, 2)}\n`);
