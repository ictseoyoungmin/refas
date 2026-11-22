"""Read-only source/detailed semantic attribute presence for U5 review."""
import hashlib
import json
import sys
from pathlib import Path

import bpy

source = Path('/workspace/scratch/61afcdd4e3c6/recovered/source-models/refas-source-identity-models/automail/native.blend')
detailed = Path('/workspace/scratch/61afcdd4e3c6/work/automail/candidate-08/detailed-functional.blend')
rows = {}
for label, path in [('source', source), ('detailed', detailed)]:
    bpy.ops.wm.open_mainfile(filepath=str(path))
    rows[label] = {}
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue
        rows[label][obj.name] = {
            'parent': obj.parent.name if obj.parent else None,
            'materials': [m.name if m else None for m in obj.data.materials],
            'uvLayers': [layer.name for layer in obj.data.uv_layers],
            'vertexGroups': [group.name for group in obj.vertex_groups],
            'imageTextureNodes': sum(sum(node.type == 'TEX_IMAGE' for node in m.node_tree.nodes)
                                     for m in obj.data.materials if m and m.use_nodes and m.node_tree),
        }
differences = [{'object': name, 'source': values, 'detailed': rows['detailed'].get(name)}
               for name, values in rows['source'].items() if values != rows['detailed'].get(name)]
result = {'scope': 'Attribute presence, material names and rigid-parent semantics; no claim of UV coordinate equivalence for changed tessellation.',
          'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
          'detailedSha256': hashlib.sha256(detailed.read_bytes()).hexdigest(),
          'comparedParts': len(rows['source']), 'differences': differences,
          'sourcePartsWithUvLayers': [n for n, v in rows['source'].items() if v['uvLayers']],
          'sourcePartsWithVertexGroups': [n for n, v in rows['source'].items() if v['vertexGroups']],
          'sourcePartsWithImageTextures': [n for n, v in rows['source'].items() if v['imageTextureNodes']]}
Path(sys.argv[sys.argv.index('--')+1]).write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps(result))
