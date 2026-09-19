import {recordAccessBoundary} from './fresh_worker_access_policy.mjs';

const restrictedBuiltins = new Set([
  'fs',
  'node:fs',
  'fs/promises',
  'node:fs/promises',
  'child_process',
  'node:child_process',
  'module',
  'node:module',
]);

const originalGetBuiltinModule = typeof process.getBuiltinModule === 'function'
  ? process.getBuiltinModule.bind(process)
  : null;

if (originalGetBuiltinModule) {
  Object.defineProperty(process, 'getBuiltinModule', {
    configurable: false,
    enumerable: false,
    writable: false,
    value(specifier) {
      const normalized = String(specifier);
      if (restrictedBuiltins.has(normalized)) {
        recordAccessBoundary('builtin-escape', 'process.getBuiltinModule', normalized);
        const error = new Error('AD05 verifier access boundary blocked builtin escape: ' + normalized);
        error.code = 'EACCES';
        throw error;
      }
      return originalGetBuiltinModule(specifier);
    },
  });
}