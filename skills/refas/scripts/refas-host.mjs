#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  REFAS_VERSION,
  assertArtifactHandoffCurrent,
  getArtifactHandoff,
  getHostEvents,
  getHostReviewBundle,
  loadHostSession,
  openHostSession,
  publishHostReviewBundle,
  validateWorkerRequest,
  validateWorkerResponse,
} from './lib/index.mjs';

function parseArgs(argv) {
  const [command = 'help', ...rest] = argv;
  const options = {_positional: []};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) { options._positional.push(token); continue; }
    const key = token.slice(2);
    const next = rest[index + 1];
    if (next == null || next.startsWith('--')) options[key] = true;
    else { options[key] = next; index += 1; }
  }
  return {command, options};
}

function required(options, key) {
  if (options[key] == null || options[key] === true) throw new Error(`--${key} is required`);
  return options[key];
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printLine(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function jsonFile(filePath) {
  return JSON.parse(await fs.readFile(path.resolve(filePath), 'utf8'));
}

function nonNegativeInteger(value, label, fallback = 0) {
  const number = Number(value ?? fallback);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${label} must be a non-negative integer`);
  return number;
}

function positiveInteger(value, label, fallback) {
  const number = Number(value ?? fallback);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`${label} must be a positive integer`);
  return number;
}

function help() {
  return {
    name:'refas-host',
    version:REFAS_VERSION,
    commands:{
      open:'open --root DIR --session ID --project ID',
      status:'status --root DIR [--session ID] [--project ID]',
      events:'events --root DIR [--after N] [--jsonl] [--follow] [--poll-ms 250]',
      'review-bundle':'review-bundle --root DIR [--publish]',
      handoff:'handoff --root DIR [--assert handoff.json]',
      'validate-worker':'validate-worker --request request.json [--response response.json]',
    },
  };
}

async function eventStream(root, options) {
  let afterSequence = nonNegativeInteger(options.after, '--after', 0);
  const follow = options.follow === true;
  const jsonl = options.jsonl === true || follow;
  const pollMs = positiveInteger(options['poll-ms'], '--poll-ms', 250);
  let running = true;
  const stop = () => { running = false; };
  if (follow) process.once('SIGINT', stop);
  try {
    do {
      const events = await getHostEvents(root, {afterSequence});
      if (!jsonl && !follow) {
        print(events);
        return;
      }
      for (const event of events) {
        printLine(event);
        afterSequence = event.sequence;
      }
      if (!follow || !running) return;
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    } while (running);
  } finally {
    if (follow) process.removeListener('SIGINT', stop);
  }
}

async function main() {
  const {command, options} = parseArgs(process.argv.slice(2));
  if (command === 'help' || command === '--help' || command === '-h' || options.help) { print(help()); return; }
  if (command === '--version' || command === '-v') { process.stdout.write(`${REFAS_VERSION}\n`); return; }

  if (command === 'open') {
    print(await openHostSession(required(options, 'root'), {
      sessionId:required(options, 'session'),
      projectId:required(options, 'project'),
    }));
    return;
  }

  if (command === 'status') {
    print(await loadHostSession(required(options, 'root'), {
      sessionId:options.session === true ? null : options.session ?? null,
      projectId:options.project === true ? null : options.project ?? null,
    }));
    return;
  }

  if (command === 'events') {
    await eventStream(required(options, 'root'), options);
    return;
  }

  if (command === 'review-bundle') {
    const root = required(options, 'root');
    print(options.publish === true ? await publishHostReviewBundle(root) : await getHostReviewBundle(root));
    return;
  }

  if (command === 'handoff') {
    const root = required(options, 'root');
    if (options.assert && options.assert !== true) {
      print(await assertArtifactHandoffCurrent(root, await jsonFile(options.assert)));
    } else {
      print(await getArtifactHandoff(root));
    }
    return;
  }

  if (command === 'validate-worker') {
    const request = await jsonFile(required(options, 'request'));
    const requestValidation = validateWorkerRequest(request);
    let responseValidation = null;
    if (options.response && options.response !== true) {
      responseValidation = validateWorkerResponse(await jsonFile(options.response), {request});
    }
    const valid = requestValidation.valid && (responseValidation == null || responseValidation.valid);
    print({valid, request:requestValidation, response:responseValidation});
    if (!valid) process.exitCode = 1;
    return;
  }

  throw new Error(`unknown command: ${command}`);
}

main().catch((error) => {
  process.stderr.write(`RefAs host error: ${error.message}\n`);
  process.exit(1);
});
