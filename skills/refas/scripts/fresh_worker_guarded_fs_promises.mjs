import real from 'node:fs/promises';
import {guardInstalledWrite, guardRawRead, guardTwoPathWrite} from './fresh_worker_access_policy.mjs';

export const readFile = (target, ...args) => { guardRawRead('readFile', target); return real.readFile(target, ...args); };
export const open = (target, ...args) => { guardRawRead('open', target); return real.open(target, ...args); };
export const readdir = (target, ...args) => { guardRawRead('readdir', target); return real.readdir(target, ...args); };
export const opendir = (target, ...args) => { guardRawRead('opendir', target); return real.opendir(target, ...args); };
export const access = (target, ...args) => { guardRawRead('access', target); return real.access(target, ...args); };
export const stat = (target, ...args) => { guardRawRead('stat', target); return real.stat(target, ...args); };
export const lstat = (target, ...args) => { guardRawRead('lstat', target); return real.lstat(target, ...args); };
export const realpath = (target, ...args) => { guardRawRead('realpath', target); return real.realpath(target, ...args); };
export const readlink = (target, ...args) => { guardRawRead('readlink', target); return real.readlink(target, ...args); };

export const writeFile = (target, ...args) => { guardInstalledWrite('writeFile', target); return real.writeFile(target, ...args); };
export const appendFile = (target, ...args) => { guardInstalledWrite('appendFile', target); return real.appendFile(target, ...args); };
export const mkdir = (target, ...args) => { guardInstalledWrite('mkdir', target); return real.mkdir(target, ...args); };
export const rm = (target, ...args) => { guardInstalledWrite('rm', target); return real.rm(target, ...args); };
export const unlink = (target, ...args) => { guardInstalledWrite('unlink', target); return real.unlink(target, ...args); };
export const truncate = (target, ...args) => { guardInstalledWrite('truncate', target); return real.truncate(target, ...args); };
export const chmod = (target, ...args) => { guardInstalledWrite('chmod', target); return real.chmod(target, ...args); };
export const chown = (target, ...args) => { guardInstalledWrite('chown', target); return real.chown(target, ...args); };
export const utimes = (target, ...args) => { guardInstalledWrite('utimes', target); return real.utimes(target, ...args); };
export const rename = (source, target, ...args) => { guardTwoPathWrite('rename', source, target); return real.rename(source, target, ...args); };
export const copyFile = (source, target, ...args) => { guardTwoPathWrite('copyFile', source, target); return real.copyFile(source, target, ...args); };
export const cp = (source, target, ...args) => { guardTwoPathWrite('cp', source, target); return real.cp(source, target, ...args); };
export const link = (source, target, ...args) => { guardTwoPathWrite('link', source, target); return real.link(source, target, ...args); };
export const symlink = (source, target, ...args) => { guardTwoPathWrite('symlink', source, target); return real.symlink(source, target, ...args); };

export default {
  ...real,
  readFile, open, readdir, opendir, access, stat, lstat, realpath, readlink,
  writeFile, appendFile, mkdir, rm, unlink, truncate, chmod, chown, utimes,
  rename, copyFile, cp, link, symlink,
};
