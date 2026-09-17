export function tacticalEffects(attack,defense,x){
 const a=attack.tactics,d=defense.tactics;
 const press=d.pressing==='high'?.035:d.pressing==='low'?-.012:0;
 const direct=a.passing==='direct',short=a.passing==='short';
 return {
  advance:direct?.16:short?-.065:0,
  completion:(short?.02:direct?-.015:0)-press*(x<65?1:.4)+(a.tempo==='slow'?.012:a.tempo==='fast'?-.018:0),
  seconds:a.tempo==='fast'?.83:a.tempo==='slow'?1.2:1,
  shooting:a.mentality==='attacking'?1.24:a.mentality==='defensive'?.76:1,
  exposure:d.mentality==='attacking'?.18:d.mentality==='defensive'?-.12:0,
  width:a.width==='wide'?1.35:a.width==='narrow'?.65:1,
  behind:d.line==='high'?.055:d.line==='deep'?-.025:0,
  defensivePressure:d.line==='deep'&&x>80?.12:0,
 };
}
