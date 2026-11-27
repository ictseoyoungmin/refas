from pathlib import Path
import shutil,json,hashlib,random,datetime
from PIL import Image,ImageDraw,ImageFont
BASE=Path('/workspace/scratch/5765cde18054');REPO=BASE/'refas';PACK=BASE/'work/review_packet';EVID=REPO/'docs/development/evidence/source-identity/review'
EVID.mkdir(parents=True,exist_ok=True)
mapping_path=EVID/'anonymous-mapping.json'
mapping=json.loads(mapping_path.read_text()) if mapping_path.exists() else {}
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',21)
small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',18)
def board(folder,views,name):
 ims=[]
 for view in views:
  ims.append([Image.open(folder/x/(view+'.png')).convert('RGB') for x in ['A','B']])
 w,h=ims[0][0].size;out=Image.new('RGB',(w*2,48+len(ims)*(h+32)),(24,28,34));d=ImageDraw.Draw(out)
 d.text((14,11),'Candidate A',font=font,fill='white');d.text((w+14,11),'Candidate B',font=font,fill='white')
 for i,(view,pair) in enumerate(zip(views,ims)):
  y=48+i*(h+32);d.text((14,y+6),view,font=small,fill='white');d.text((w+14,y+6),view,font=small,fill='white')
  out.paste(pair[0],(0,y+32));out.paste(pair[1],(w,y+32))
 out.save(folder/name)
def prepare(asset,baseline,selected,source,groups,extra=None):
 folder=PACK/asset
 if asset not in mapping:
  labels=['A','B'];random.SystemRandom().shuffle(labels)
  mapping[asset]={'baseline_label':labels[0],'selected_label':labels[1],'baseline_path':str(baseline),'selected_path':str(selected),'captured_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 for kind,p in [('baseline',baseline),('selected',selected)]:
  target=folder/mapping[asset][kind+'_label'];target.mkdir(parents=True,exist_ok=True)
  for file in sorted(p.glob('*.png')):shutil.copyfile(file,target/file.name.removeprefix('view-'))
  if extra:shutil.copyfile(extra[kind],target/'service-open.png')
 shutil.copyfile(source,folder/'source.png')
 for name,views in groups.items():board(folder,views,name+'.png')
 mapping_path.write_text(json.dumps(mapping,indent=2)+'\n')
 manifest={str(p.relative_to(folder)):{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(folder.rglob('*.png'))}
 (folder/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 print(asset,mapping[asset]['baseline_label'],mapping[asset]['selected_label'],len(manifest))
if __name__=='__main__':
 import sys
 if sys.argv[1]=='automail':
  prepare('automail',BASE/'work/automail/candidates/before/renders',BASE/'work/automail/candidates/candidate-05/renders',REPO/'examples/automail-arm/source/reference.png',{'whole-pairs':['hero','front','back'],'structure-pairs':['socket-depth','mechanism-detail','hand-front'],'service-pairs':['service-open']},{'baseline':BASE/'work/automail/candidates/before-open-for-candidate-05/renders/service-open.png','selected':BASE/'work/automail/candidates/candidate-05-open/renders/service-open.png'})
 elif sys.argv[1]=='garment':
  prepare('garment',BASE/'work/garment/renders/before',BASE/'work/garment/renders/after',REPO/'examples/uniform-jacket/source/reference.png',{'whole-pairs':['front-three-quarter','back','left'],'construction-pairs':['fold-side','ornament']})
