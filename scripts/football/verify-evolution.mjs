import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {ENGINE_VERSION} from '../../src/football/config.js';
const baselineRef=process.env.BASELINE_REF,readSource=file=>baselineRef?execFileSync('git',['show',`${baselineRef}:${file}`]):fs.readFileSync(file);
const version=baselineRef?Number(readSource('src/football/config.js').toString().match(/ENGINE_VERSION=(\d+)/)[1]):ENGINE_VERSION;
const root='artifacts/engine-evolution/',load=name=>JSON.parse(fs.readFileSync(root+name)),hash=file=>crypto.createHash('sha256').update(readSource(file)).digest('hex');
const career=load('v16-career-keepers.json'),generation=load('v16-generation-keepers.json'),late=load('v16-generation-matches.json'),abilities=load('v16-generation-abilities.json');
assert.equal(version,16);
for(const report of [career,generation,late]){assert.equal(report.complete,true);assert.equal(report.failures.length,0);for(const [file,value] of Object.entries(report.hashes||report.sourceHashes))assert.equal(hash(file),value,`stale evidence: ${file}`);}
assert.equal(career.seasons.length,3);assert.equal(career.matches,14277);assert.ok(career.seasons.every(s=>s.minEligible>=11&&s.minKeepers>=1));
assert.equal(generation.rows.length,60);assert.equal(generation.rows.at(-1).originalActive,0);assert.ok(generation.rows.every(r=>r.minRoster>=18&&r.maxRoster<=30&&!r.noGoalkeeper&&!r.negativeClubs));
assert.ok(late.matches>=500&&late.clubs===268&&late.minEligible>=11&&late.minKeepers>=1);assert.equal(abilities.current.year,347);assert.equal(abilities.overPotential,0);
const abilityChanges=Object.fromEntries(Object.keys(abilities.current.divisions).map(id=>{const delta=abilities.current.divisions[id].bestEleven.mean-abilities.initial.divisions[id].bestEleven.mean;assert.ok(Math.abs(delta)<=10,`${id}: generation ability shift ${delta}`);return [id,delta];}));
for(const [id,division] of Object.entries(abilities.current.divisions))if(id.endsWith('-3'))assert.ok(abilities.current.divisions[id.slice(0,-2)].bestEleven.mean-division.bestEleven.mean>=5,`${id}: division gradient collapsed`);
const tests=fs.readFileSync(root+'v16-keeper-regression.txt','utf8'),count=Number(tests.match(/# tests (\d+)/)?.[1]);assert.ok(count>=115);assert.equal(Number(tests.match(/# pass (\d+)/)?.[1]),count);assert.match(tests,/# fail 0/);
const report={engine:version,complete:true,tests:count,sourceHashes:career.hashes,career:{seasons:career.seasons.map(({year,matches,goalsPerGame,minEligible,minKeepers})=>({year,matches,goalsPerGame,minEligible,minKeepers})),matches:career.matches},generation:{scope:generation.scope,years:generation.years,minRoster:Math.min(...generation.rows.map(r=>r.minRoster)),maxRoster:Math.max(...generation.rows.map(r=>r.maxRoster)),final:generation.rows.at(-1),age:abilities.current.age,bestElevenAbilityChanges:abilityChanges},lateGeneration:{scope:late.scope,through:late.through,matches:late.matches,clubs:late.clubs,goalsPerGame:late.goalsPerGame,minEligible:late.minEligible,minKeepers:late.minKeepers}};
const out=root+'v16-acceptance.json';if(fs.existsSync(out))assert.deepEqual(JSON.parse(fs.readFileSync(out)),report);else fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
