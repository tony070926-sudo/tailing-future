import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {EXPECTED_RUNTIME_FREEZE_GH_CLI, RUNTIME_FREEZE_GH_PATH_ENV} from './runtime-freeze-evidence-policy.mjs';

const digest=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
function canonical(p){assert.ok(typeof p==='string'&&path.isAbsolute(p)&&path.normalize(p)===p&&!/[\r\n\0]/.test(p));assert.equal(fs.realpathSync(p),p);return p;}
export function verifyExecutable(p,expected){
 canonical(p);const before=fs.lstatSync(p,{bigint:true});
 assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1n);
 assert.equal(before.size,BigInt(expected.executableSizeBytes));assert.equal(before.mode&0o7777n,0o755n);
 const fd=fs.openSync(p,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 const identity=s=>['dev','ino','nlink','size','mode','mtimeNs','ctimeNs'].map(k=>String(s[k]));
 try{assert.deepEqual(identity(fs.fstatSync(fd,{bigint:true})),identity(before));const bytes=fs.readFileSync(fd);assert.equal(digest(bytes),expected.executableSha256);assert.deepEqual(identity(fs.fstatSync(fd,{bigint:true})),identity(before));assert.deepEqual(identity(fs.lstatSync(p,{bigint:true})),identity(before));return{path:p,bytes:bytes.length,sha256:digest(bytes),mode:0o755};}finally{fs.closeSync(fd);}
}
export function publishEnvironment(file,executable){
 canonical(file);assert.ok(!/[\r\n\0]/.test(executable)&&path.isAbsolute(executable));const s=fs.lstatSync(file);assert.ok(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.size<=1024*1024);
 const fd=fs.openSync(file,fs.constants.O_RDWR|fs.constants.O_APPEND|fs.constants.O_NOFOLLOW);
 try{const opened=fs.fstatSync(fd);assert.equal(opened.dev,s.dev);assert.equal(opened.ino,s.ino);const existing=fs.readFileSync(fd,'utf8');assert.ok(!existing.includes(RUNTIME_FREEZE_GH_PATH_ENV),'override already published');assert.ok(existing===''||existing.endsWith('\n'));const line=Buffer.from(`${RUNTIME_FREEZE_GH_PATH_ENV}=${executable}\n`);assert.equal(fs.writeSync(fd,line),line.length);}finally{fs.closeSync(fd);}
}
export function extractVerified(archive,target,parent,expected,run,env){
 run('/usr/bin/dpkg-deb',['--extract',archive,target],{env,timeout:30000,killSignal:'SIGKILL',maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']});
 canonical(parent);assert.equal(fs.statSync(parent).mode&0o7777,0o700);
 return verifyExecutable(path.join(target,'usr/bin/gh'),expected);
}
// Network/extractor injection is for filesystem-backed tests only; CLI has no override.
export function provision({platform=process.platform,arch=process.arch,temp=process.env.RUNNER_TEMP,environmentFile=process.env.GITHUB_ENV,run=execFileSync}={}){
 assert.equal(platform,'linux');assert.equal(arch,'x64');canonical(temp);assert.ok(fs.statSync(temp).isDirectory());canonical(environmentFile);
 const expected=EXPECTED_RUNTIME_FREEZE_GH_CLI.platforms['linux-x64'];
 const parent=fs.mkdtempSync(path.join(temp,'tf-pinned-gh-'));fs.chmodSync(parent,0o700);const archive=path.join(parent,'gh.deb'),target=path.join(parent,'extract');fs.mkdirSync(target,{mode:0o700});
 const fd=fs.openSync(archive,'wx',0o600);fs.closeSync(fd);
 const env={PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C'};
 const url=`https://github.com/cli/cli/releases/download/v${EXPECTED_RUNTIME_FREEZE_GH_CLI.version}/${expected.archiveName}`;
 run('/usr/bin/curl',['-q','--fail','--silent','--show-error','--location','--proto','=https','--proto-redir','=https','--max-redirs','3','--connect-timeout','15','--max-time','60','--max-filesize','67108864','--output',archive,url],{env,timeout:65000,killSignal:'SIGKILL',maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']});
 const a=fs.lstatSync(archive);assert.ok(a.isFile()&&!a.isSymbolicLink()&&a.nlink===1&&a.size>0&&a.size<=64*1024*1024);canonical(archive);assert.equal(digest(fs.readFileSync(archive)),expected.archiveSha256);
 // dpkg may change target mode; the untouched private outer directory is the boundary.
 const result=extractVerified(archive,target,parent,expected,run,env);
 publishEnvironment(environmentFile,result.path);
 return{...result,archiveSha256:expected.archiveSha256,scope:'verified provisioning only; no gh execution, installation or shared-library closure'};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){assert.equal(process.argv.length,2);console.log(JSON.stringify(provision()));}
