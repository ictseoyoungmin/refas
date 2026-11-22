import real from 'node:fs';
import guardedPromises from './fresh_worker_guarded_fs_promises.mjs';
import {guardInstalledWrite, guardRawRead, guardTwoPathWrite} from './fresh_worker_access_policy.mjs';

export const readFileSync = (target, ...args) => { guardRawRead('readFileSync', target); return real.readFileSync(target, ...args); };
export const readFile = (target, ...args) => { guardRawRead('readFile', target); return real.readFile(target, ...args); };
export const createReadStream = (target, ...args) => { guardRawRead('createReadStream', target); return real.createReadStream(target, ...args); };
export const openSync = (target, ...args) => { guardRawRead('openSync', target); return real.openSync(target, ...args); };
export const open = (target, ...args) => { guardRawRead('open', target); return real.open(target, ...args); };
export const readdirSync = (target, ...args) => { guardRawRead('readdirSync', target); return real.readdirSync(target, ...args); };
export const readdir = (target, ...args) => { guardRawRead('readdir', target); return real.readdir(target, ...args); };
export const statSync = (target, ...args) => { guardRawRead('statSync', target); return real.statSync(target, ...args); };
export const lstatSync = (target, ...args) => { guardRawRead('lstatSync', target); return real.lstatSync(target, ...args); };
export const accessSync = (target, ...args) => { guardRawRead('accessSync', target); return real.accessSync(target, ...args); };
export const realpathSync = (target, ...args) => { guardRawRead('realpathSync', target); return real.realpathSync(target, ...args); };
export const readlinkSync = (target, ...args) => { guardRawRead('readlinkSync', target); return real.readlinkSync(target, ...args); };
export const promises = guardedPromises;

export const writeFileSync = (target, ...args) => { guardInstalledWrite('writeFileSync', target); return real.writeFileSync(target, ...args); };
export const writeFile = (target, ...args) => { guardInstalledWrite('writeFile', target); return real.writeFile(target, ...args); };
export const appendFileSync = (target, ...args) => { guardInstalledWrite('appendFileSync', target); return real.appendFileSync(target, ...args); };
export const appendFile = (target, ...args) => { guardInstalledWrite('appendFile', target); return real.appendFile(target, ...args); };
export const mkdirSync = (target, ...args) => { guardInstalledWrite('mkdirSync', target); return real.mkdirSync(target, ...args); };
export const mkdir = (target, ...args) => { guardInstalledWrite('mkdir', target); return real.mkdir(target, ...args); };
export const rmSync = (target, ...args) => { guardInstalledWrite('rmSync', target); return real.rmSync(target, ...args); };
export const rm = (target, ...args) => { guardInstalledWrite('rm', target); return real.rm(target, ...args); };
export const unlinkSync = (target, ...args) => { guardInstalledWrite('unlinkSync', target); return real.unlinkSync(target, ...args); };
export const unlink = (target, ...args) => { guardInstalledWrite('unlink', target); return real.unlink(target, ...args); };
export const renameSync = (source, target, ...args) => { guardTwoPathWrite('renameSync', source, target); return real.renameSync(source, target, ...args); };
export const rename = (source, target, ...args) => { guardTwoPathWrite('rename', source, target); return real.rename(source, target, ...args); };
export const copyFileSync = (source, target, ...args) => { guardTwoPathWrite('copyFileSync', source, target); return real.copyFileSync(source, target, ...args); };
export const copyFile = (source, target, ...args) => { guardTwoPathWrite('copyFile', source, target); return real.copyFile(source, target, ...args); };
export const cpSync = (source, target, ...args) => { guardTwoPathWrite('cpSync', source, target); return real.cpSync(source, target, ...args); };
export const cp = (source, target, ...args) => { guardTwoPathWrite('cp', source, target); return real.cp(source, target, ...args); };
export const linkSync = (source, target, ...args) => { guardTwoPathWrite('linkSync', source, target); return real.linkSync(source, target, ...args); };
export const link = (source, target, ...args) => { guardTwoPathWrite('link', source, target); return real.link(source, target, ...args); };
export const symlinkSync = (source, target, ...args) => { guardTwoPathWrite('symlinkSync', source, target); return real.symlinkSync(source, target, ...args); };
export const symlink = (source, target, ...args) => { guardTwoPathWrite('symlink', source, target); return real.symlink(source, target, ...args); };

export default {
  readFileSync, readFile, createReadStream, openSync, open, readdirSync, readdir,
  statSync, lstatSync, accessSync, realpathSync, readlinkSync, promises,
  writeFileSync, writeFile, appendFileSync, appendFile, mkdirSync, mkdir, rmSync, rm,
  unlinkSync, unlink, renameSync, rename, copyFileSync, copyFile, cpSync, cp,
  linkSync, link, symlinkSync, symlink,
};
