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
