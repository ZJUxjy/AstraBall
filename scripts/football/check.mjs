import fs from 'node:fs';import {execFileSync} from 'node:child_process';
for(const dir of ['src/football','src/competitions','scripts/football'])for(const file of fs.readdirSync(dir).filter(f=>/\.m?js$/.test(f)))execFileSync(process.execPath,['--check',`${dir}/${file}`]);
