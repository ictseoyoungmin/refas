#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import * as PUBLIC_API from './lib/index.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.dirname(SCRIPT_DIR);
const PUBLIC_LIBRARY_ENTRYPOINT = 'scripts/lib/index.mjs';
const CLI_PATHS = Object.freeze({
  refas: path.join(SCRIPT_DIR, 'refas.mjs'),
  'refas-host': path.join(SCRIPT_DIR, 'refas-host.mjs'),
});
const portable = (value) => value.split(path.sep).join('/');

function skillPath(value, label, errors) {
  if (value == null) return null;
  if (typeof value !== 'string' || !value.trim()) {
    errors.push(`${label} must be null or a non-empty skill-local path`);
    return null;
  }
  const route = value.split('#', 1)[0].split('?', 1)[0];
  const normalized = portable(path.posix.normalize(route));
  if (
    path.posix.isAbsolute(normalized) ||
    normalized === '..' ||
    normalized.startsWith(['..', ''].join('/')) ||
    normalized.startsWith(['skills', 'refas', ''].join('/'))
  ) {
    errors.push(`${label} must remain inside the installed skill root: ${value}`);
    return null;
  }
  return normalized;
}

async function verifyFile(skillRoot, value, label, errors, {json = false} = {}) {
  const relative = skillPath(value, label, errors);
  if (!relative) return null;
  const absolute = path.join(skillRoot, relative);
  try {
    const stat = await fs.stat(absolute);
    if (!stat.isFile()) {
      errors.push(`${label} is not a file: ${value}`);
      return null;
    }
    const text = await fs.readFile(absolute, 'utf8');
    if (!json) return text;
    try {
      return JSON.parse(text);
    } catch (error) {
      errors.push(`${label} is not valid JSON: ${error.message}`);
      return null;
    }
  } catch {
    errors.push(`${label} is missing from the installed skill: ${value}`);
    return null;
  }
}

function cliCatalog(bin, errors) {
  const script = CLI_PATHS[bin];
  if (!script) {
    errors.push(`unknown CLI binary in interface metadata: ${bin}`);
    return {};
  }
  const result = spawnSync(process.execPath, [script, '--help'], {encoding: 'utf8', cwd: SKILL_ROOT});
  if (result.status !== 0) {
    errors.push(`${bin} --help failed: ${String(result.stderr || result.stdout).trim()}`);
    return {};
  }
  try {
    return JSON.parse(result.stdout).commands ?? {};
  } catch (error) {
    errors.push(`${bin} --help did not return JSON command metadata: ${error.message}`);
    return {};
  }
}

export async function analyzeCapabilityInterfaces({skillRoot = SKILL_ROOT} = {}) {
  skillRoot = path.resolve(skillRoot);
  const errors = [];
  const graph = JSON.parse(await fs.readFile(path.join(skillRoot, 'references', 'GRAPH.json'), 'utf8'));
  const interfaces = graph.nodes.flatMap((node) =>
    (node.interface?.interfaces ?? []).map((entry) => ({node, entry})),
  );
  const cliBins = [...new Set(interfaces.map(({entry}) => entry.cli?.bin).filter(Boolean))];
  const cliCommands = new Map(cliBins.map((bin) => [bin, cliCatalog(bin, errors)]));
  const audited = [];

  for (const {node, entry} of interfaces) {
    const key = `${node.id}/${entry.id}`;
    if (entry.library) {
      if (entry.library.entrypoint !== PUBLIC_LIBRARY_ENTRYPOINT) {
        errors.push(`${key} library entrypoint must be ${PUBLIC_LIBRARY_ENTRYPOINT}`);
      }
      if (!(entry.library.symbol in PUBLIC_API)) {
        errors.push(`${key} public symbol is not exported: ${entry.library.symbol}`);
      }
    }
    if (entry.validator?.library && !(entry.validator.library in PUBLIC_API)) {
      errors.push(`${key} public validator is not exported: ${entry.validator.library}`);
    }
    if (entry.cli) {
      const commands = cliCommands.get(entry.cli.bin) ?? {};
      if (!(entry.cli.command in commands)) {
        errors.push(`${key} CLI command is not advertised by ${entry.cli.bin} --help: ${entry.cli.command}`);
      }
    }

    const template = entry.template
      ? await verifyFile(skillRoot, entry.template, `${key}.template`, errors, {json: true})
      : null;
    await verifyFile(skillRoot, entry.minimumInvocation, `${key}.minimumInvocation`, errors);
    if (entry.example) await verifyFile(skillRoot, entry.example, `${key}.example`, errors);

    audited.push({
      key,
      nodeId: node.id,
      interfaceId: entry.id,
      operation: entry.operation,
      librarySymbol: entry.library?.symbol ?? null,
      cli: entry.cli ?? null,
      validator: entry.validator?.library ?? null,
      template: entry.template ?? null,
      templateParsed: entry.template ? template != null : null,
      outputSchema: entry.outputSchema ?? null,
    });
  }

  return {
    status: errors.length ? 'FAIL' : 'PASS',
    schema: 'refas.capability-interface-alignment-report/v1',
    graphSchema: graph.schema,
    interfaceSchema: graph.interfaceSchema,
    instructionNodes: graph.nodes.length,
    executableInterfaces: interfaces.length,
    declaredTemplates: audited.filter((item) => item.template).length,
    publicLibraryInterfaces: audited.filter((item) => item.librarySymbol).length,
    cliInterfaces: audited.filter((item) => item.cli).length,
    audited,
    errors,
  };
}

export async function verifyCapabilityInterfaces(options = {}) {
  const report = await analyzeCapabilityInterfaces(options);
  if (report.status !== 'PASS') throw new Error(report.errors.join('\n'));
  return report;
}

async function main() {
  const report = await verifyCapabilityInterfaces();
  process.stdout.write(`${JSON.stringify({
    status: report.status,
    schema: report.schema,
    instructionNodes: report.instructionNodes,
    executableInterfaces: report.executableInterfaces,
    declaredTemplates: report.declaredTemplates,
    publicLibraryInterfaces: report.publicLibraryInterfaces,
    cliInterfaces: report.cliInterfaces,
  }, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Capability interface verification failed: ${error.message}\n`);
    process.exit(1);
  });
}
