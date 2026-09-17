import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {registeredPlayers,playerAgeOnDate} from '../../src/competitions/registry.js';
import {validateSave} from '../../src/competitions/runtime.js';
const directory='artifacts/academy-world/world-opportunity-v2',report=JSON.parse(fs.readFileSync(`${directory}/report.json`));
if(report.status!=='completed'||report.seasons.length!==20)throw Error('Wait for twenty completed seasons');
const read=file=>JSON.parse(gunzipSync(fs.readFileSync(file))),seasons=[];
for(const row of report.seasons){
 const {season}=read(`${directory}/season-${row.year}.json.gz`),clubs=new Map(),duplicates=[],invalid=[];
 for(const p of registeredPlayers(season)){
  if(!p.club||p.registrationStatus&&!['senior','loan'].includes(p.registrationStatus))continue;
  const numbers=clubs.get(p.club)||new Map();
  if(!Number.isInteger(p.number)||p.number<1||p.number>99)invalid.push({clubId:p.club,id:p.id,number:p.number});
  if(numbers.has(p.number))duplicates.push({clubId:p.club,number:p.number,ids:[numbers.get(p.number),p.id]});
  numbers.set(p.number,p.id);clubs.set(p.club,numbers);
 }
 seasons.push({year:row.year,clubs:clubs.size,duplicates,invalid});
}
const final=read(`${directory}/checkpoint.json.gz`);validateSave(final.season);
const career=read('artifacts/academy-world/career-opportunity-v2/checkpoint.json.gz');validateSave(career.season);
const tracked=career.report.tracked.map(({id,role})=>({id,role,...career.season.playerRegistry.registrations[id]}));
const sourceMatches=Object.entries(report.sourceHashes).every(([file,hash])=>createHash('sha256').update(fs.readFileSync(file)).digest('hex')===hash);
function capacity(s,summary){
 const clubs=new Map(Object.values(s.members).flat().map(id=>[id,{id,total:0,adults:0}])),depth=new Set(summary.teams.filter(t=>t.depthShortage).map(t=>t.id));
 for(const p of registeredPlayers(s)){if(!p.club||p.registrationStatus&&!['senior','loan'].includes(p.registrationStatus))continue;const row=clubs.get(p.club);row.total++;row.adults+=Number(playerAgeOnDate(p,s.date)>=21);}
 const rows=[...clubs.values()],over40=rows.filter(r=>r.total>40),adultsOver25=rows.filter(r=>r.adults>25);
 return {date:s.date,over40:over40.length,adultsOver25:adultsOver25.length,depthShortage:depth.size,depthAndOver40:over40.filter(r=>depth.has(r.id)).length,depthAndAdultsOver25:adultsOver25.filter(r=>depth.has(r.id)).length,clubs:rows};
}
const old=read('artifacts/academy-world/world-final/checkpoint.json.gz');
const finalCapacity={scope:'Year-end actual senior/loan roster counts. 25 adults and 40 total are admission constraints, not automatic annual release rules; overlap is descriptive and not proof of why each individual position was unfilled.',baseline:capacity(old.season,old.report.seasons.at(-1)),current:capacity(final.season,report.seasons.at(-1))};
const result={sourceHash:report.sourceHash,sourceStillMatches:sourceMatches,finalCapacity,worldFinalSaveValid:true,careerFinalSaveValid:true,careerSameSource:career.report.sourceHash===report.sourceHash,careerComplete:career.report.status==='completed',shirtNumbers:{allTwentyYearsUnique:seasons.every(s=>!s.duplicates.length&&!s.invalid.length),seasons},trackedManagerPlayers:tracked.map(p=>({id:p.id,role:p.role,status:p.status,clubId:p.clubId,ownerClubId:p.ownerClubId})),note:'Shirt checks include actual senior/loan registration only; academy duplicate numbers across cohorts are outside adult-team numbering. Manager actions include the explicitly scripted promotion and loans.'};
fs.writeFileSync(`${directory}/integrity.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({sourceMatches,unique:result.shirtNumbers.allTwentyYearsUnique,worldSave:true,careerSave:true}));if(!result.shirtNumbers.allTwentyYearsUnique||!result.careerSameSource)process.exitCode=1;
