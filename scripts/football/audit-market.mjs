import fs from 'node:fs';
import crypto from 'node:crypto';
import {createSeason} from '../../src/competitions/runtime.js';
import {advanceCareer,accrueEconomy,rolloverEconomy,validateEconomy,wageBill,clubLevel} from '../../src/competitions/market.js';
import {annualPopulation,clubPlayers,populationPlayers,validatePopulation} from '../../src/competitions/population.js';
import {advanceDevelopment} from '../../src/competitions/development.js';
import {footballTeams} from '../../src/football/data.js';
import {seasonCalendar,dateOf} from '../../src/competitions/calendar.js';
const years=Number(process.env.YEARS||6),path=process.env.REPORT||'artifacts/engine-evolution/v15-market-audit.json';if(fs.existsSync(path))throw Error('Report exists');
const files=['src/competitions/market.js','src/competitions/population.js','src/competitions/development.js','src/football/players.js'],hashes=Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
const s=createSeason(),rows=[],failures=[],start=performance.now();
for(let i=0;i<years;i++){
 for(const date of [dateOf(s.year,2,28),dateOf(s.year,12,31)]){
  advanceCareer(s,date);validatePopulation(s.population);validateEconomy(s);
  const rosters=footballTeams.map(t=>clubPlayers(s,t.id)),active=populationPlayers(s),a=Object.values(s.economy.accounts),moves=s.economy.moves.filter(m=>m.date.startsWith(String(s.year).padStart(4,'0')));
  const row={date,minRoster:Math.min(...rosters.map(r=>r.length)),maxRoster:Math.max(...rosters.map(r=>r.length)),noGoalkeeper:rosters.filter(r=>!r.some(p=>p.position==='GK')).length,transfers:moves.filter(m=>m.type==='transfer').length,renewals:moves.filter(m=>m.type==='renewal').length,freePlayers:active.filter(p=>p.unit==='free').length,minCash:Math.min(...a.map(a=>a.cash)),negativeClubs:a.filter(a=>a.cash<0).length,totalCash:a.reduce((n,a)=>n+a.cash,0)};row.shortClubs=footballTeams.filter(t=>clubPlayers(s,t.id).length<18).map(t=>({id:t.id,roster:clubPlayers(s,t.id).length,wages:wageBill(s,t.id),limit:s.economy.accounts[t.id].wageLimit,level:clubLevel(s,t.id),cash:s.economy.accounts[t.id].cash}));rows.push(row);console.log(JSON.stringify(row));
  if(row.minRoster<18||row.noGoalkeeper||row.negativeClubs)failures.push(row);
 }
 if(process.env.CHECKPOINT)fs.writeFileSync(process.env.CHECKPOINT,JSON.stringify(s));
 if(i<years-1){const date=dateOf(s.year+1,1,1);advanceDevelopment(s,date);accrueEconomy(s,date);s.year++;s.date=date;s.calendar=seasonCalendar(s.year);annualPopulation(s);rolloverEconomy(s);}
}
fs.writeFileSync(path,JSON.stringify({scope:'Six-year personnel, growth and market audit without match results or match minutes; league membership held fixed. This verifies economic and registration invariants, not competitive ability balance.',years,hashes,seconds:(performance.now()-start)/1000,rows,failures},null,2)+'\n');if(failures.length)process.exitCode=1;
