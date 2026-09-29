import {createCylinder} from '../../skills/refas/scripts/lib/index.mjs';

export const CORVID_LEG_OVERFIT = Object.freeze({
  sourceNote:'post-1.1.0 single-side mechanical corvid regression reported in issue #251',
  imagePlaneHipHalfSpan:0.1106,
  near:{
    ankleX:-0.050,
    lowestClawX:-0.119,
    toeSpan:1.35,
    halluxSpan:0.62,
  },
  far:{
    ankleX:-0.030,
    lowestClawX:-0.024,
    toeSpan:1.81,
    halluxSpan:0.86,
  },
});

export function legacyIndependentCorvidLegMeshes(){
  const nearRadius=CORVID_LEG_OVERFIT.near.toeSpan*0.04;
  const farRadius=CORVID_LEG_OVERFIT.far.toeSpan*0.04;
  const nearHeight=Math.abs(CORVID_LEG_OVERFIT.near.lowestClawX-CORVID_LEG_OVERFIT.near.ankleX)+0.5;
  const farHeight=Math.abs(CORVID_LEG_OVERFIT.far.lowestClawX-CORVID_LEG_OVERFIT.far.ankleX)+0.5;
  return {
    left:createCylinder({radius:nearRadius,height:nearHeight,segments:12,role:'corvid-leg-rest'}),
    right:createCylinder({radius:farRadius,height:farHeight,segments:12,role:'corvid-leg-rest'}),
  };
}

export function sharedCorvidLegMesh(){
  const radius=((CORVID_LEG_OVERFIT.near.toeSpan+CORVID_LEG_OVERFIT.far.toeSpan)/2)*0.04;
  const height=0.57;
  return createCylinder({radius,height,segments:12,role:'corvid-leg-shared-rest'});
}
