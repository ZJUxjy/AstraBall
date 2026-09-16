export const ENGINE_VERSION=15;
// Game-design coefficients, measured against held-out multi-roster fixtures.
export const TUNE={
 passBase:.86,advance:.32,shoot:.085,actionSeconds:4.8,homeEdge:.012,
 xgIntercept:-.55,foulRate:.021,injuryRate:.00012,
 passSkillScale:.0016,passSkillCap:24,duelSkillScale:.003,
 finishingScale:.012,keepingScale:.012,
};
export const skillDifference=(difference,scale=TUNE.passSkillScale)=>TUNE.passSkillCap*Math.tanh(difference/TUNE.passSkillCap)*scale;
