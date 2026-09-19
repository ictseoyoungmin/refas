import real from 'node:child_process';
import {guardChildProcess} from './fresh_worker_access_policy.mjs';

export const spawnSync = (command, args = [], ...rest) => { guardChildProcess('spawnSync', command, args); return real.spawnSync(command, args, ...rest); };
export const spawn = (command, args = [], ...rest) => { guardChildProcess('spawn', command, args); return real.spawn(command, args, ...rest); };
export const execFileSync = (command, args = [], ...rest) => { guardChildProcess('execFileSync', command, args); return real.execFileSync(command, args, ...rest); };
export const execFile = (command, args = [], ...rest) => { guardChildProcess('execFile', command, args); return real.execFile(command, args, ...rest); };
export const execSync = (command, ...rest) => { guardChildProcess('execSync', command, []); return real.execSync(command, ...rest); };
export const exec = (command, ...rest) => { guardChildProcess('exec', command, []); return real.exec(command, ...rest); };
export const fork = (modulePath, args = [], ...rest) => { guardChildProcess('fork', process.execPath, [modulePath, ...args]); return real.fork(modulePath, args, ...rest); };

export default {...real, spawnSync, spawn, execFileSync, execFile, execSync, exec, fork};
