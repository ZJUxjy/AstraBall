import fs from 'node:fs';import {execFileSync} from 'node:child_process';
function check(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const path=`${dir}/${entry.name}`;if(entry.isDirectory())check(path);else if(/\.m?js$/.test(entry.name))execFileSync(process.execPath,['--check',path]);}}
for(const dir of ['src/football','src/competitions','scripts/football'])check(dir);
