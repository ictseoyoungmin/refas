import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createCertificationPolicy,
  createDefaultWholeObjectCertificationPolicy,
  validateCertificationPolicy,
  validateWholeObjectPolicyAuthority,
} from '../skills/refas/scripts/lib/index.mjs';

test('source-bound whole-object authority refuses a re-signed policy that drops registered comparison', () => {
  const fixtureFloor = createDefaultWholeObjectCertificationPolicy({requiresRegisteredComparison:false});
  const attacked = createCertificationPolicy({
    id:'source-policy-without-comparison',
    claims: fixtureFloor.claims,
  });
  assert.equal(validateCertificationPolicy(attacked).valid, true);
  const authority = validateWholeObjectPolicyAuthority(attacked, {requiresRegisteredComparison:true});
  assert.equal(authority.valid, false);
  assert.match(authority.errors.join('\n'), /registered-comparison/);
});

test('whole-object authority accepts custom policy that is strictly stronger than the runtime floor', () => {
  const floor = createDefaultWholeObjectCertificationPolicy({requiresRegisteredComparison:false});
  const stronger = createCertificationPolicy({
    id:'strictly-stronger-whole-object-policy',
    claims:[
      {
        ...floor.claims[0],
        obligations:[
          ...floor.claims[0].obligations,
          {id:'extra-review-copy', role:'visual-review', schema:'refas.visual-review/v1', minCount:2},
        ],
      },
      {
        id:'optional-structural-disclosure',
        required:false,
        description:'Additional typed structural evidence may be disclosed without weakening visual authority.',
        obligations:[{id:'structural-proof', role:'fit-structural-eligibility', schema:'refas.fit-structural-eligibility/v1'}],
      },
    ],
  });
  assert.equal(validateCertificationPolicy(stronger).valid, true);
  const authority = validateWholeObjectPolicyAuthority(stronger, {requiresRegisteredComparison:false});
  assert.equal(authority.valid, true, authority.errors.join('\n'));
});
