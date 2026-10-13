import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const CLI=path.resolve('skills/refas/scripts/refas.mjs');
const PY=process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python3';

async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'refas-adaptive-evidence-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const py=[
    'from PIL import Image, ImageDraw',
    'from zipfile import ZipFile, ZIP_DEFLATED',
    'from io import BytesIO',
    'from pathlib import Path',
    'import sys',
    'root=Path(sys.argv[1])',
    "sheet=Image.new('RGB',(160,80),(240,240,240))",
    'd=ImageDraw.Draw(sheet)',
    'd.rectangle((4,5,70,70),fill=(40,100,130))',
    'd.ellipse((90,8,150,67),fill=(190,75,60))',
    "sheet.save(root/'sheet.png')",
    "solo=Image.new('RGBA',(60,60),(0,0,0,0))",
    "ImageDraw.Draw(solo).ellipse((10,10,50,50),fill=(100,140,180,255))",
    "solo.save(root/'solo.png')",
    "flat=Image.new('RGB',(64,64),(240,240,240))",
    "ImageDraw.Draw(flat).rectangle((12,12,52,52),fill=(30,40,50))",
    "flat.save(root/'flat.png')",
    "b=BytesIO();solo.save(b,format='PNG')",
    "with ZipFile(root/'pieces.zip','w',ZIP_DEFLATED) as archive:",
    "    archive.writestr('joint/joint-1.png',b.getvalue())",
    "    archive.writestr('robotic-arm/arm-1.png',b.getvalue())",
  ].join('\n');
  const p=spawnSync(PY,['-c',py,root],{encoding:'utf8'});
  assert.equal(p.status,0,p.stderr);
  const sha=async file=>createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex');
  const zipMember=async()=>{const z=spawnSync(PY,['-c',
    'from zipfile import ZipFile;import sys;sys.stdout.buffer.write(ZipFile(sys.argv[1]).read("joint/joint-1.png"))',path.join(root,'pieces.zip')],{encoding:null});assert.equal(z.status,0);return createHash('sha256').update(z.stdout).digest('hex');};
  return {root,sha,memberSha:await zipMember()};
}
async function writeRequest(root,req){await fs.writeFile(path.join(root,'request.json'),JSON.stringify(req,null,2));}
function run(root, extra=[]){
  return spawnSync(process.execPath,[CLI,'evidence','--spec',path.join(root,'request.json'),
    '--out',path.join(root,'evidence'),...extra],{encoding:'utf8',timeout:30000});
}

test('adaptive source sheet has explicit views, on-demand analyses and no redundant full-frame copy or board',async t=>{
  const {root,sha}=await fixture(t);
  await writeRequest(root,{
    schema:'refas.evidence-request/v1',subjectId:'mechanical-subject',
    sources:[{id:'character-sheet',path:'sheet.png',sha256:await sha('sheet.png'),
      views:[
        {id:'whole',role:'sheet',roi:[0,0,1,1]},
        {id:'front',role:'front',roi:[0,0,0.5,1],padding:0.5,question:'Where is the limb boundary?',decisionTarget:'outline of front mechanical limb',analyses:['edges','context']},
        {id:'side',role:'left',roi:[0.5,0,0.5,1],question:'Does the side contain a separate shell?',decisionTarget:'shell segmentation',analyses:['gradient','contrast']},
      ]}],
    defaultAnalyses:[],board:false,
  });
  const result=run(root);assert.equal(result.status,0,result.stderr);
  const info=JSON.parse(result.stdout);
  assert.equal(info.views,3);
  assert.equal(info.derivedFiles,5,'two ROI crops plus edges/context plus gradient/contrast = six unless context aliases full raw');
  assert.equal(info.board,null);
  const report=JSON.parse(await fs.readFile(path.join(root,'evidence/manifest.json'),'utf8'));
  assert.equal(report.schema,'refas.observation-aid-set/v1');
  assert.equal(report.claimScope,'derived-observation-aid-only');
  assert.equal(report.eligibleForCertification,false);
  assert.equal(report.policy.crossViewRegistrationEstablished,false);
  assert.equal(report.views[0].analysisOutputs.length,0);
  assert.equal(report.views[0].wholeSource,true);
  assert.equal(report.views[1].analysisOutputs.find(x=>x.analysis==='context').alias,'raw-source');
  assert.equal(report.sources[0].sha256,await sha('sheet.png'));
  await fs.access(path.join(root,'sheet.png'));
  for(const view of report.views)for(const item of view.analysisOutputs)if(item.path){
    const buf=await fs.readFile(path.join(root,'evidence',item.path));
    assert.equal(createHash('sha256').update(buf).digest('hex'),item.sha256);
  }
  const dirs=await fs.readdir(path.join(root,'evidence'));
  assert.deepEqual(dirs.sort(),['manifest.json','snapshots']);
});

test('adaptive separated RGBA image and ZIP member preserve exact member SHA and alpha without asserting registration',async t=>{
  const {root,sha,memberSha}=await fixture(t);
  await writeRequest(root,{
    schema:'refas.evidence-request/v1',subjectId:'mechanical-components',board:true,
    sources:[
      {id:'separate',path:'solo.png',sha256:await sha('solo.png'),
       views:[{id:'whole',role:'part',materialize:true,question:'Where does the part alpha support end?',decisionTarget:'part transparency boundary',analyses:['alpha-mask','edges']}]},
      {id:'archive',archive:'pieces.zip',archiveSha256:await sha('pieces.zip'),
       member:'joint/joint-1.png',sha256:memberSha,
       views:[{id:'joint',role:'detail',materialize:true,analyses:[]}]},
    ],
  });
  const result=run(root);assert.equal(result.status,0,result.stderr);
  const manifest=JSON.parse(await fs.readFile(path.join(root,'evidence/manifest.json'),'utf8'));
  assert.equal(manifest.sources.length,2);
  assert.equal(manifest.sources[1].kind,'archive-member');
  assert.equal(manifest.sources[1].sha256,memberSha);
  assert.equal(manifest.views.length,2);
  assert.equal(manifest.views[0].analysisOutputs.find(x=>x.analysis==='alpha-mask')?.evidenceClass,'derived-observation-aid');
  assert.ok(manifest.board?.path);
  await fs.access(path.join(root,'evidence',manifest.board.path));
});

test('previous complete adaptive observation survives bad SHA, unsafe archive member and failed analysis',async t=>{
  const {root,sha,memberSha}=await fixture(t);
  const original={schema:'refas.evidence-request/v1',subjectId:'tested-source',
    sources:[{id:'flat',path:'flat.png',sha256:await sha('flat.png'),
      views:[{id:'whole',role:'front',question:'Where is the actual source outline?',decisionTarget:'base footprint',analyses:['edges']}]}]};
  await writeRequest(root,original);
  assert.equal(run(root).status,0);
  const previous=await fs.readFile(path.join(root,'evidence/manifest.json'),'utf8');
  const previousManifest=JSON.parse(previous);
  const oldFile=path.join(root,'evidence',previousManifest.views[0].analysisOutputs[0].path);
  await fs.access(oldFile);
  await writeRequest(root,{...original,sources:[{...original.sources[0],sha256:'a'.repeat(64)}]});
  let rejected=run(root);assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/SHA-256 mismatch/);
  await writeRequest(root,{...original,sources:[{...original.sources[0],views:[{id:'whole',question:'Is there an alpha boundary?',decisionTarget:'part visibility',analyses:['alpha-mask']}]}]});
  rejected=run(root);assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/alpha-mask requires/);
  await writeRequest(root,{...original,sources:[{id:'zip',archive:'pieces.zip',archiveSha256:await sha('pieces.zip'),
    member:'../joint/joint-1.png',sha256:memberSha,views:[{id:'whole'}]}]});
  rejected=run(root);assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/safe relative POSIX path/);
  assert.equal(await fs.readFile(path.join(root,'evidence/manifest.json'),'utf8'),previous);
  await fs.access(oldFile);
  const dirs=await fs.readdir(path.join(root,'evidence/snapshots'));assert.equal(dirs.length,1);
});

test('adaptive successful rerender prunes old snapshot; clobber and invalid empty ROI refuse before publication',async t=>{
  const {root,sha}=await fixture(t);
  const original={schema:'refas.evidence-request/v1',subjectId:'remodel',
    sources:[{id:'single',path:'flat.png',sha256:await sha('flat.png'),
      views:[{id:'whole',role:'front',roi:[0,0,1,1],analyses:[]}]}]};
  await writeRequest(root,original);
  let result=run(root);assert.equal(result.status,0,result.stderr);
  const before=JSON.parse(await fs.readFile(path.join(root,'evidence/manifest.json'),'utf8'));
  await writeRequest(root,{...original,sources:[{...original.sources[0],
    views:[{id:'closeup',role:'detail',roi:[.1,.1,.6,.6],question:'Where is the joint interface?',decisionTarget:'joint perimeter',analyses:['edges']}]}]});
  result=run(root);assert.equal(result.status,0,result.stderr);
  const after=JSON.parse(await fs.readFile(path.join(root,'evidence/manifest.json'),'utf8'));
  assert.notEqual(after.manifestDigest,before.manifestDigest);
  assert.equal((await fs.readdir(path.join(root,'evidence/snapshots'))).length,1);
  await writeRequest(root,{...original,sources:[{...original.sources[0],
    views:[{id:'invalid',roi:[0,0,.00001,.00001]}]}]});
  result=run(root);assert.notEqual(result.status,0);assert.match(result.stderr,/subpixel or empty/);
  assert.equal((await fs.readFile(path.join(root,'evidence/manifest.json'),'utf8')).includes(after.manifestDigest),true);
  const legacyImage=path.join(root,'crop.png');
  await fs.copyFile(path.join(root,'flat.png'),legacyImage);
  const bytes=await fs.readFile(legacyImage);
  const legacy=spawnSync(process.execPath,[CLI,'evidence','--image',legacyImage,'--scope','whole','--out',root],
    {encoding:'utf8',timeout:15000});
  assert.notEqual(legacy.status,0);
  assert.match(legacy.stderr,/old --image fixed-filter extraction was removed/);
  assert.deepEqual(await fs.readFile(legacyImage),bytes);
});
