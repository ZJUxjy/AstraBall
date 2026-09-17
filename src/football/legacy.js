import * as mainV6 from './legacy/main-v6/engine.js';
import * as v6 from './legacy/v6/engine.js';
import * as v7 from './legacy/v7/engine.js';
import * as v8 from './legacy/v8/engine.js';
import * as v9 from './legacy/v9/engine.js';
import * as v10 from './legacy/v10/engine.js';
import * as v11 from './legacy/v11/engine.js';
import * as v12 from './legacy/v12/engine.js';
export const LEGACY_ENGINES={6:v6,7:v7,8:v8,9:v9,10:v10,11:v11,12:v12};

// V13 changes only persistence validation; its match mathematics is V12.
LEGACY_ENGINES[13]={...v12,restoreMatch(saved){return {...v12.restoreMatch({...saved,version:12}),version:13};}};

// V14 changes the career population only; preserve its in-progress matches.
LEGACY_ENGINES[14]={...v12,restoreMatch(saved){return {...v12.restoreMatch({...saved,version:12}),version:14};}};

// V15 changes contracts and career rosters; its match mathematics remains V12.
LEGACY_ENGINES[15]={...v12,restoreMatch(saved){return {...v12.restoreMatch({...saved,version:12}),version:15};}};

// V16 changes career recruitment and finances; preserve its in-progress matches.
LEGACY_ENGINES[16]={...v12,restoreMatch(saved){return {...v12.restoreMatch({...saved,version:12}),version:16};}};

LEGACY_ENGINES[17]={...v12,restoreMatch(saved){return {...v12.restoreMatch({...saved,version:12}),version:17};}};
export function legacyEngine(state){return state.version===6&&state.teams?.some(t=>'aiManaged' in t||'aiReviews' in t)?mainV6:LEGACY_ENGINES[state.version];}
