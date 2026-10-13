import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createSegmentPrism,partsToGlb} from '../skills/refas/scripts/lib/index.mjs';

const CLI=path.resolve('skills/refas/scripts/refas.mjs');
const PY=process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python3';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const call=(args)=>spawnSync(process.execPath,[CLI,...args],{encoding:'utf8',timeout:45000});

async function setup(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'refas-observation-utility-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const made=spawnSync(PY,['-c',[
    'from PIL import Image,ImageDraw',
    'import sys',
    "im=Image.new('RGB',(96,64),(242,242,242))",
    'd=ImageDraw.Draw(im)',
    'd.rectangle((12,12,82,53),fill=(70,100,110))',
    'd.rectangle((20,15,42,48),fill=(230,230,230))',
    'im.save(sys.argv[1])',
  ].join('\n'),path.join(root,'source.png')],{encoding:'utf8'});
  assert.equal(made.status,0,made.stderr);
  const src=await fs.readFile(path.join(root,'source.png'));
  const mesh=createSegmentPrism({start:[-.4,0,0],end:[.4,0,0],width:.25,height:.25,upHint:[0,1,0]});
  const asset=x=>partsToGlb({parts:[{id:'part',scopeId:'whole.part',materialId:'metal',mesh,translation:[x,0,0]}],
    materials:{metal:{baseColor:[.4,.5,.6,1],metallic:0,roughness:.8}}});
  await fs.writeFile(path.join(root,'before.glb'),asset(0));
  await fs.writeFile(path.join(root,'after.glb'),asset(.2));
  const srcDigest=sha(src);
  const req={schema:'refas.evidence-request/v1',subjectId:'robot',
    defaultAnalyses:[],board:false,
    sources:[{id:'source',path:'source.png',sha256:srcDigest,
      views:[{id:'joint',role:'detail',scopeId:'whole',roi:[0,0,1,1],
        question:'Is the dark joint boundary distinct from a shadow?',
        decisionTarget:'joint interface segmentation',
        analyses:['contrast','edges']}]}]};
  const write=async (name,value)=>fs.writeFile(path.join(root,name),JSON.stringify(value,null,2)+'\n');
  await write('request.json',req);
  const render=()=>call(['evidence','--spec',path.join(root,'request.json'),'--out',path.join(root,'observations')]);
  const first=render();assert.equal(first.status,0,first.stderr);
  const read=async()=>JSON.parse(await fs.readFile(path.join(root,'observations/manifest.json'),'utf8'));
  const manifest=await read();
  const decisions=(override={})=>({
    schema:'refas.evidence-utility-decisions/v1',manifestDigest:manifest.manifestDigest,
    assessments:[{
      sourceId:'source',viewId:'joint',analysis:'contrast',outcome:'clarified',
      observation:'The contrast view separates the joint housing edge from the cast shadow.',
      modelImpact:{status:'applied',findingId:'joint-edge',scopeId:'whole',change:'Narrow joint housing position',
        before:{path:'before.glb',sha256:sha(awaitableBefore)},
        after:{path:'after.glb',sha256:sha(awaitableAfter)}},
      retention:'retain',retentionReason:'Used to inspect the revised joint boundary',
    },{
      sourceId:'source',viewId:'joint',analysis:'edges',outcome:'no-benefit',
      observation:'Background noise overwhelms useful joint edges.',
      modelImpact:{status:'none'},retention:'discard',
      retentionReason:'No supported observation or edit, retain the input SHA and assessment only',
    }],
    ...override
  });
  const beforeBytes=await fs.readFile(path.join(root,'before.glb'));
  const afterBytes=await fs.readFile(path.join(root,'after.glb'));
  const makeDec=(mods={})=>({
    schema:'refas.evidence-utility-decisions/v1',manifestDigest:manifest.manifestDigest,
    assessments:[
      {sourceId:'source',viewId:'joint',analysis:'contrast',outcome:'clarified',
       observation:'Contrast makes the joint housing outer plane more legible.',
       modelImpact:{status:'applied',findingId:'joint-edge',scopeId:'whole',change:'Moved current housing',
        before:{path:'before.glb',sha256:sha(beforeBytes)},after:{path:'after.glb',sha256:sha(afterBytes)}},
       retention:'retain',retentionReason:'Used to inspect the changed joint'},
      {sourceId:'source',viewId:'joint',analysis:'edges',outcome:'no-benefit',
       observation:'Edge filter overemphasizes noisy background.',
       modelImpact:{status:'none'},retention:'discard',retentionReason:'No useful geometric judgment'},
    ],
    ...mods
  });
  const assess=async(d,extra=[])=>{
    await write('decisions.json',d);
    return call(['evidence','--assess',path.join(root,'decisions.json'),
      '--out',path.join(root,'observations'),...extra]);
  };
  return {root,write,render,read,manifest,makeDec,assess,srcDigest};
}

test('utility analysis requires a meaningful question and geometry decision target before extraction',async t=>{
  const x=await setup(t);
  const spec=JSON.parse(await fs.readFile(path.join(x.root,'request.json'),'utf8'));
  spec.sources[0].views[0].question='';
  await x.write('request.json',spec);
  const old=await x.read();
  const run=x.render();
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/substantive question/);
  assert.equal((await x.read()).manifestDigest,old.manifestDigest);
});

test('utility assessment binds actual candidate edits, supports useful retention and prunes unused filters',async t=>{
  const x=await setup(t);
  const before=x.manifest;
  const edges=before.views[0].analysisOutputs.find(y=>y.analysis==='edges');
  const contrast=before.views[0].analysisOutputs.find(y=>y.analysis==='contrast');
  const oldEdge=path.join(x.root,'observations',edges.path);
  assert.equal((await fs.stat(oldEdge)).isFile(),true);
  let d=x.makeDec();
  const pass=await x.assess(d,['--prune']);
  assert.equal(pass.status,0,pass.stderr);
  const response=JSON.parse(pass.stdout);
  assert.equal(response.discardedAnalyses,1);
  assert.equal(response.candidateEditsAttributed,1);
  const updated=await x.read();
  assert.equal(updated.utility.claimScope,'worker-attributed-utility-only');
  assert.equal(updated.utility.eligibleForCertification,false);
  assert.equal(updated.utility.assessments[0].modelImpact.authority,'worker-attributed-change-only');
  const ce=updated.views[0].analysisOutputs.find(y=>y.analysis==='edges');
  const cc=updated.views[0].analysisOutputs.find(y=>y.analysis==='contrast');
  assert.equal(ce.retention,'discarded-derivative');
  assert.equal(ce.discardedSha256,edges.sha256);
  assert.equal(ce.path,undefined);
  assert.equal(cc.sha256,contrast.sha256);
  const retained=await fs.readFile(path.join(x.root,'observations',cc.path));
  assert.equal(sha(retained),contrast.sha256);
  assert.equal((await fs.readdir(path.join(x.root,'observations/snapshots'))).length,1);
  await assert.rejects(fs.access(oldEdge));
  const source=await fs.readFile(path.join(x.root,'source.png'));
  assert.equal(sha(source),x.srcDigest);
  // A pruned snapshot cannot be a full cache hit.
  const replay=call(['evidence','--spec',path.join(x.root,'request.json'),'--out',path.join(x.root,'observations'),'--reuse']);
  assert.equal(replay.status,0,replay.stderr);
  assert.match(replay.stdout,/"status": "PASS"/);
  const refreshed=await x.read();
  assert.notEqual(refreshed.manifestDigest,updated.manifestDigest);
  const cached=call(['evidence','--spec',path.join(x.root,'request.json'),'--out',path.join(x.root,'observations'),'--reuse']);
  assert.equal(cached.status,0,cached.stderr);
  assert.match(cached.stdout,/"status": "REUSED"/);
});

test('assessment rejects fabricated edit SHA, invented value, incomplete coverage and premature discard with no mutation',async t=>{
  const x=await setup(t);
  const original=JSON.stringify(await x.read());
  const base=x.makeDec();
  const broken=structuredClone(base);
  broken.assessments[0].modelImpact.after.sha256='f'.repeat(64);
  let r=await x.assess(broken,['--prune']);
  assert.notEqual(r.status,0);assert.match(r.stderr,/candidate SHA-256 mismatch/);
  const usefulDiscard=structuredClone(base);
  usefulDiscard.assessments[0].retention='discard';
  r=await x.assess(usefulDiscard,['--prune']);
  assert.notEqual(r.status,0);assert.match(r.stderr,/cannot discard useful or model-connected/);
  r=await x.assess({...base,assessments:base.assessments.slice(0,1)},['--prune']);
  assert.notEqual(r.status,0);assert.match(r.stderr,/every explicitly requested analysis/);
  r=await x.assess({...base,manifestDigest:'a'.repeat(64)},['--prune']);
  assert.notEqual(r.status,0);assert.match(r.stderr,/stale or invalid/);
  assert.equal(JSON.stringify(await x.read()),original);
});

test('no-benefit after inspection is a legitimate output even when no model is edited',async t=>{
  const x=await setup(t);
  const d=x.makeDec();
  for(const a of d.assessments){
    a.outcome='no-benefit';
    a.observation='Original source was clearer; this transform did not change the reconstruction interpretation.';
    a.modelImpact={status:'none'};
    a.retention='discard';
    a.retentionReason='Unhelpful after direct visual inspection';
  }
  const out=await x.assess(d,['--prune']);
  assert.equal(out.status,0,out.stderr);
  assert.equal(JSON.parse(out.stdout).candidateEditsAttributed,0);
  const result=await x.read();
  assert.equal(result.utility.assessments.every(a=>a.modelImpact.status==='none'),true);
  assert.equal(result.views[0].analysisOutputs.filter(a=>a.path).length,0);
});
