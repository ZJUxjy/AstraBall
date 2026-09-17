import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {parseArgs} from 'node:util';
import {registeredPlayers,playerAgeOnDate} from '../../src/competitions/registry.js';
import {recruitmentContext} from '../../src/competitions/recruitment.js';
import {daysBetween} from '../../src/competitions/calendar.js';
const {values}=parseArgs({options:{input:{type:'string',default:'artifacts/academy-world/world-opportunity-v2'},preview:{type:'boolean',default:false}}});
const read=dir=>JSON.parse(fs.readFileSync(`${dir}/report.json`)),current=read(values.input),baseline=read('artifacts/academy-world/world-final');
if(!values.preview&&(current.status!=='completed'||current.seasons.length!==20))throw Error('Wait for the completed new twenty-season run');
const year=current.seasons.at(-1)?.year;if(!year)throw Error('No completed year to diagnose');
function diagnose(dir,report){
 const {season}=JSON.parse(gunzipSync(fs.readFileSync(`${dir}/season-${year}.json.gz`))),date=`${String(year).padStart(4,'0')}-12-30`,players=new Map(registeredPlayers(season,{includeRetired:true}).map(p=>[p.id,p]));
 const context=recruitmentContext(season,date,()=>{throw Error('Loan outcome audit does not recompute roster selections');}),rows=[],excluded=[];
 let recentYearEndLoans=0;
 for(const [id,reg] of Object.entries(season.playerRegistry.registrations)){
  recentYearEndLoans+=reg.history.filter(h=>h.date===`${String(year).padStart(4,'0')}-12-31`&&h.status==='loan').length;
  const at=reg.history.filter(h=>h.date<=date).at(-1);if(at?.status!=='loan')continue;
  const p=players.get(id),reconstructed={...at,statusSince:at.date},evidence=context.evidence(p,reconstructed),days=daysBetween(at.date,date);
  if(days<90||evidence.games<6){excluded.push({id,clubId:at.clubId,since:at.date,days,games:evidence.games,reason:days<90?'less-than-90-days':'fewer-than-six-club-games'});continue;}
  let allSeasonLoanGames=0,allSeasonLoanMinutes=0;
  for(const fixture of season.fixtures){
   if(!fixture.report||fixture.date<at.date||fixture.date>date)continue;
   const side=fixture.home===at.clubId?0:fixture.away===at.clubId?1:-1;if(side<0)continue;
   allSeasonLoanGames++;allSeasonLoanMinutes+=fixture.report.players[side].find(line=>line.id===id)?.minutes||0;
  }
  rows.push({id,name:p.name,position:p.position,age:playerAgeOnDate(p,date),ownerClubId:at.ownerClubId,clubId:at.clubId,since:at.date,days,recent180:{...evidence,share:evidence.minutes/(evidence.games*90),below22Percent:evidence.minutes<evidence.games*90*.22},currentSeasonLoan:{games:allSeasonLoanGames,minutes:allSeasonLoanMinutes,share:allSeasonLoanMinutes/(allSeasonLoanGames*90)}});
 }
 const shares=rows.map(p=>p.recent180.share).sort((a,b)=>a-b),sum=(key)=>rows.reduce((n,p)=>n+p.recent180[key],0);
 return {sourceHash:report.sourceHash,date,scope:'Loan registration reconstructed at Dec 30 before return/reloan review. Eligibility uses >=90 days at current destination and >=6 actual destination fixtures since joining within the last 180 days. Year-end new loans excluded. Shares use club games*90, without capping stoppage/extra time. No injury adjustment.',cohort:rows.length,excludedCount:excluded.length,yearEndNewLoansExcluded:recentYearEndLoans,recent180:{games:sum('games'),minutes:sum('minutes'),weightedShare:sum('minutes')/(sum('games')*90),medianShare:shares.length?(shares[Math.floor((shares.length-1)/2)]+shares[Math.floor(shares.length/2)])/2:null,below22Percent:rows.filter(p=>p.recent180.below22Percent).length,zeroMinutes:rows.filter(p=>p.recent180.minutes===0).length},rows,excluded};
}
const result={year,complete:!values.preview,baseline:diagnose('artifacts/academy-world/world-final',baseline),current:diagnose(values.input,current)};
fs.writeFileSync(`${values.input}/loan-outcomes${values.preview?'-preview':''}.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({year,old:{cohort:result.baseline.cohort,...result.baseline.recent180},current:{cohort:result.current.cohort,...result.current.recent180}},null,2));
