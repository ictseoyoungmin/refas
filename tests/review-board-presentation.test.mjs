import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';

test('review-board warns when flat clay/normal image lacks surface information without certifying it', () => {
  const program = `
from pathlib import Path
import sys
import tempfile
sys.path.insert(0, str(Path('skills/refas/scripts').resolve()))
from compose_review_board import _presentation_warning
from PIL import Image

with tempfile.TemporaryDirectory() as d:
    flat = Path(d) / 'flat.png'
    shaded = Path(d) / 'shaded.png'
    im = Image.new('RGB', (8, 8), (24, 24, 26))
    for y in range(2, 6):
        for x in range(2, 6):
            im.putpixel((x, y), (49, 49, 49))
    im.save(flat)
    rich = Image.new('RGB', (8, 8))
    for y in range(8):
        for x in range(8):
            rich.putpixel((x, y), (x * 16, y * 16, x * y))
    rich.save(shaded)

    def assess(label, path):
        return _presentation_warning({'label': label, 'absolutePath': str(path)})

    clay = assess('NEUTRAL-CLAY HERO', flat)
    normal = assess('PBR NORMAL', flat)
    assert clay['code'] == 'LOW_SURFACE_INFORMATION'
    assert clay['severity'] == 'REVIEW'
    assert len(clay['sourceFrameSha256']) == 64
    assert clay['certificationAuthority'] == 'NONE'
    assert normal['code'] == 'LOW_SURFACE_INFORMATION'
    assert assess('PBR ALBEDO', flat) is None
    assert assess('NEUTRAL-CLAY HERO', shaded) is None
    assert assess('PBR NORMAL', shaded) is None
`;
  const run = spawnSync('python3', ['-c', program], {encoding: 'utf8', timeout: 15000});
  assert.equal(run.status, 0, run.stderr || run.stdout);
});
