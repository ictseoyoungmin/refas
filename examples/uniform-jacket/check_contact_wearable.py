"""Retained meaningful controls for the task-local metre-scale contact predicate."""
import argparse,datetime,hashlib,json,sys
from pathlib import Path
import numpy as np
from geometry_wearable import triangle_contact

parser=argparse.ArgumentParser();parser.add_argument('--fixtures',type=Path,required=True);parser.add_argument('--out',type=Path,required=True);args=parser.parse_args()
fixtures=json.loads(args.fixtures.read_text());records=[]
for fixture in fixtures:
 a=np.array(fixture['a'],dtype=np.float64);b=np.array(fixture['b'],dtype=np.float64);origin=a[0]
 for scale in [.001,1,1000]:
  aa=(a-origin)*scale;bb=(b-origin)*scale
  for translation in [np.zeros(3),np.array([13.,-7.,200.])]:
   observed=triangle_contact(aa+translation,bb+translation)
   records.append({'name':fixture['name'],'faces':fixture['faces'],'independentActualIntersectionSpanM':fixture['intersectionSpanM'],'scale':scale,'translation':translation.tolist(),'expected':True,'observed':observed})
a=[[0,0,0],[1,0,0],[0,1,0]]
for name,b,expected in [
 ('parallel separated',[[0,0,.0001],[1,0,.0001],[0,1,.0001]],False),
 ('coplanar interior overlap',[[.25,.25,0],[.75,.25,0],[.25,.75,0]],True),
 ('coplanar disjoint',[[2,0,0],[3,0,0],[2,1,0]],False),
 ('shared corner contact',[[1,0,0],[2,0,1],[2,1,0]],True),
 ('transverse interior crossing',[[.2,.2,-1],[.2,.2,1],[.8,.2,0]],True),
]:
 records.append({'name':name,'expected':expected,'observed':triangle_contact(a,b)})
report={'createdUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'tokens':None,'cost':None,'fixtures':str(args.fixtures),'fixturesSha256':hashlib.sha256(args.fixtures.read_bytes()).hexdigest(),'predicateSha256':hashlib.sha256(Path(__file__).with_name('geometry_wearable.py').read_bytes()).hexdigest(),'controls':records,'pass':all(r['observed']==r['expected'] for r in records),'scope':'Actual independently solved strict-interior counterexamples across scale and translation, plus coplanar/separated/boundary controls. This verifies the predicate controls, not any garment candidate.'}
args.out.parent.mkdir(parents=True,exist_ok=True);args.out.write_text(json.dumps(report,indent=2)+'\n');print('CONTACT_CONTROLS',report['pass'],len(records));sys.exit(0 if report['pass'] else 1)
