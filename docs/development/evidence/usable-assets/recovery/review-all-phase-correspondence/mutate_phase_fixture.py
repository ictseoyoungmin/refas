"""Change one actual exported morph-animation value at frame25 only.

This does not edit morph geometry, native bytes, rest/apex/end key values, or
any other sampler. Interpolation affects the intermediate interval and must
be observed by full-phase checking rather than three-pose sampling.
"""
import hashlib
import json
from pathlib import Path
import struct

ROOT = Path('/workspace/scratch/61afcdd4e3c6/work/garment/export-review/phase-fixture')
source = ROOT/'asset.glb'
raw = source.read_bytes()
blob = bytearray(raw)
cursor, document, binary_offset = 12, None, None
while cursor < len(blob):
    size, kind = struct.unpack_from('<II',blob,cursor)
    if kind == 0x4e4f534a:
        document = json.loads(blob[cursor+8:cursor+8+size])
    elif kind == 0x004e4942:
        binary_offset = cursor+8
    cursor += 8+size
assert document is not None and binary_offset is not None
animation = document['animations'][0]
channels = [c for c in animation['channels'] if c['target']['path']=='weights'
            and document['nodes'][c['target']['node']]['name']=='Phase fixture 000']
assert len(channels) == 1
sampler = animation['samplers'][channels[0]['sampler']]
assert sampler.get('interpolation','LINEAR') == 'LINEAR'


def values(index):
    accessor=document['accessors'][index]
    assert accessor['componentType']==5126 and accessor['type']=='SCALAR' and 'sparse' not in accessor
    view=document['bufferViews'][accessor['bufferView']]
    offset=binary_offset+view.get('byteOffset',0)+accessor.get('byteOffset',0)
    stride=view.get('byteStride',4)
    return [struct.unpack_from('<f',blob,offset+i*stride)[0] for i in range(accessor['count'])],offset,stride


times,_,_=values(sampler['input'])
weights,offset,stride=values(sampler['output'])
assert len(weights)==len(times), 'One morph target is expected'
selected=[i for i,t in enumerate(times) if abs(t-25/30)<1e-6]
assert len(selected)==1,(times,selected)
index=selected[0]
before=weights[index]
after=before-.25
struct.pack_into('<f',blob,offset+index*stride,after)
target=ROOT/'intermediate-morph-within-range.glb'
assert not target.exists()
target.write_bytes(blob)
changed=[i for i,(a,b) in enumerate(zip(raw,blob)) if a!=b]
assert changed and all(offset+index*stride<=i<offset+index*stride+4 for i in changed)
assert source.read_bytes()==raw
checkpoints={str(frame):[i for i,t in enumerate(times) if abs(t-frame/30)<1e-6] for frame in [1,49,97]}
assert all(len(v)==1 and v[0]!=index for v in checkpoints.values())
report={'source':str(source),'sourceSha256':hashlib.sha256(raw).hexdigest(),
    'mutated':str(target),'mutatedSha256':hashlib.sha256(blob).hexdigest(),
    'channelNode':'Phase fixture 000','channelPath':'weights','sampleIndex':index,
    'sampleSeconds':times[index],'frame':25,'before':before,'after':after,
    'changedByteOffsets':changed,'restApexEndKeyIndicesUnchanged':checkpoints,
    'scope':'Real exported GLB animation-buffer mutation; only one intermediate morph key value changes. This is a checker negative control, not a garment asset.'}
(ROOT/'mutation-within-range.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
