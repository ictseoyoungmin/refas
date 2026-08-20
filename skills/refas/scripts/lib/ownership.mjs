import {deepFreeze} from './canonical.mjs';

export const CAPABILITY_ORDER = Object.freeze([
  'source-intake',
  'visual-hierarchy',
  'visual-observation',
  'spatial-hypotheses',
  'shape-reconstruction',
  'surface-topology',
  'assembly',
  'appearance',
  'rendering',
  'visual-critique',
  'whole-object-certification',
]);

export const CAPABILITY_DEPENDENCIES = deepFreeze({
  'source-intake': [],
  'visual-hierarchy': ['source-intake'],
  'visual-observation': ['visual-hierarchy'],
  'spatial-hypotheses': ['visual-observation'],
  'shape-reconstruction': ['spatial-hypotheses'],
  'surface-topology': ['shape-reconstruction'],
  assembly: ['shape-reconstruction', 'surface-topology'],
  appearance: ['shape-reconstruction', 'surface-topology', 'assembly'],
  rendering: ['shape-reconstruction', 'surface-topology', 'assembly', 'appearance'],
  'visual-critique': ['visual-observation', 'rendering'],
  'whole-object-certification': ['visual-critique'],
});

export const FINDING_OWNERS = deepFreeze({
  'source-drift': 'source-intake',
  'context-loss': 'visual-hierarchy',
  'missing-part': 'visual-hierarchy',
  'observation-unsupported': 'visual-observation',
  'evidence-insufficient': 'visual-observation',
  'perspective-mismatch': 'spatial-hypotheses',
  'depth-mismatch': 'spatial-hypotheses',
  'orientation-mismatch': 'spatial-hypotheses',
  'silhouette-mismatch': 'shape-reconstruction',
  'mass-proportion-mismatch': 'shape-reconstruction',
  'curvature-mismatch': 'shape-reconstruction',
  'pattern-topology-mismatch': 'surface-topology',
  'relief-mismatch': 'surface-topology',
  'attachment-mismatch': 'assembly',
  'occlusion-mismatch': 'assembly',
  'penetration': 'assembly',
  'material-mismatch': 'appearance',
  'finish-mismatch': 'appearance',
  'camera-mismatch': 'rendering',
  'render-integrity': 'rendering',
  'unroutable-visual-finding': 'visual-critique',
  'closure-evidence-missing': 'whole-object-certification',
});

export function assertCapability(value) {
  const capability = String(value ?? '');
  if (!CAPABILITY_ORDER.includes(capability)) throw new Error(`unknown capability: ${capability}`);
  return capability;
}

export function capabilityIndex(value) {
  return CAPABILITY_ORDER.indexOf(assertCapability(value));
}

export function transitiveDependents(owner) {
  owner = assertCapability(owner);
  const out = new Set([owner]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [capability, dependencies] of Object.entries(CAPABILITY_DEPENDENCIES)) {
      if (!out.has(capability) && dependencies.some((dependency) => out.has(dependency))) {
        out.add(capability);
        changed = true;
      }
    }
  }
  return CAPABILITY_ORDER.filter((capability) => out.has(capability));
}
