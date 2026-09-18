import {footballTeams} from '../football/data.js';
import {clubs} from '../world.js';
import {localClubs,localClubById} from './local-catalog.js';
import {leagueSystems} from './catalog.js';
const core=new Map(footballTeams.map(t=>[t.id,t]));
export const clubIdentity=id=>clubs.find(c=>c.id===id)||localClubById.get(id);
export function knownTeam(id){const t=core.get(id);if(t)return t;const c=localClubById.get(id);return c?{...c,league:({metro:'closed',lima:'lima-league',liberlin:'liberlin-league',sichuan:'sichuan-league'})[c.region],roster:[]}:null;}
export const allKnownTeams=[...footballTeams,...localClubs.map(c=>knownTeam(c.id))];
export const seniorTeams=s=>s.members?Object.entries(s.members).flatMap(([division,ids])=>ids.map(id=>({...knownTeam(id),division,league:leagueSystems.find(l=>l.levels.some(d=>d.id===division)).id}))):footballTeams;
