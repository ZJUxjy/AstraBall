#!/usr/bin/env python3
"""Aggregate checkpoint counts; never infer ungenerated players by scaling."""
import hashlib
import json
import math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
FOLDER=ROOT/'artifacts/youth-current-billion'
EXPECTED=1_000_000_000

def merge(stats):
    total={'count':sum(s['count'] for s in stats),'sum':math.fsum(s['sum'] for s in stats),'sum2':math.fsum(s['sum2'] for s in stats),'min':min(s['min'] for s in stats),'max':max(s['max'] for s in stats),'histogram':[sum(s['histogram'][i] for s in stats) for i in range(1000)]}
    assert sum(total['histogram'])==total['count']
    return total

def describe(s):
    n=s['count'];assert n>0
    quantiles={}
    for q in [1,10,50,90,99]:
        target=math.ceil(n*q/100);cumulative=0
        for i,value in enumerate(s['histogram']):
            cumulative+=value
            if cumulative>=target:
                quantiles[str(q)]=max(s['min'],min(s['max'],i/10+.05));break
    return {'count':n,'mean':s['sum']/n,'stddev':math.sqrt(max(0,s['sum2']/n-(s['sum']/n)**2)),'min':s['min'],'max':s['max'],'quantiles':quantiles,'histogram':s['histogram'],'binWidth':.1}

def summarize_cells(cells):
    ca=merge([c['ca'] for c in cells]);pa=merge([c['pa'] for c in cells]);n=ca['count'];assert pa['count']==n
    cross=math.fsum(c['cross'] for c in cells)
    x,y=describe(ca),describe(pa)
    return {'ca':x,'pa':y,'correlation':(cross/n-x['mean']*y['mean'])/(x['stddev']*y['stddev'])}

def main():
    # A completed experiment's manifest is authoritative. Never assign today's
    # JavaScript hashes to checkpoints produced by a historical native model.
    model=json.loads((FOLDER/'model.json').read_text())
    previous=json.loads((FOLDER/'summary.json').read_text()) if (FOLDER/'summary.json').exists() else None
    validation=json.loads((FOLDER/'validation.json').read_text())
    recorded=(previous or validation).get('sourceHashes',{})
    source_hashes={}
    for name in ['src/football/players.js','src/football/random.js','src/football/body.js','scripts/football/current-youth-native.cpp','scripts/football/current-youth-model.hpp']:
        expected=model.get('sources',{}).get(name,{}).get('sha256') or recorded.get(name)
        if not expected:
            raise ValueError(f'Missing experiment source hash: {name}; record provenance before aggregation')
        if recorded.get(name)!=expected:
            raise ValueError(f'Model and recorded experiment source hashes disagree: {name}')
        if hashlib.sha256((ROOT/name).read_bytes()).hexdigest()!=expected:
            raise ValueError(f'Historical experiment source mismatch: {name}. Refusing to relabel old checkpoints or overwrite summary.json; use a separate experiment with an updated native implementation.')
        source_hashes[name]=expected
    if previous:
        for checkpoint in previous['checkpoints']['files']:
            path=FOLDER/'shards'/checkpoint['name']
            if hashlib.sha256(path.read_bytes()).hexdigest()!=checkpoint['sha256']:
                raise ValueError(f'Historical checkpoint hash mismatch: {path.name}')
    files=list((FOLDER/'shards').glob('shard-*.json'));raw=[json.loads(p.read_text()) for p in files];raw.sort(key=lambda x:x['start'])
    assert len(raw)==100,f'Incomplete checkpoints: {len(raw)}/100'
    endpoint=0
    for shard in raw:
        assert shard['start']==endpoint
        assert shard['count']==shard['end']-shard['start']==10_000_000
        assert sum(c['ca']['count'] for c in shard['cells'])==shard['count']
        for c in shard['cells']:
            assert sum(c['ca']['histogram'])==sum(c['pa']['histogram'])==c['ca']['count']==c['pa']['count']
        for group in ['GK','outfield']:
            assert len(shard['attributes'][group])==42
            for s in shard['attributes'][group]:assert sum(s['histogram'])==s['count']
        assert all(shard['attributes']['GK'][i]['count']+shard['attributes']['outfield'][i]['count']==shard['count'] for i in range(42))
        endpoint=shard['end']
    assert endpoint==EXPECTED,endpoint
    cells=[c for shard in raw for c in shard['cells']]
    assert validation['passed']
    attrs={group:[describe(merge([s['attributes'][group][i] for s in raw])) for i in range(42)] for group in ['GK','outfield']}
    attrs['all']=[describe(merge([s['attributes'][g][i] for s in raw for g in ['GK','outfield']])) for i in range(42)]
    report={'count':EXPECTED,'config':{'seed':'billion-current-v1','idPattern':'billion-{index}','ages':[15,16,17],'ageRule':'15 + index % 3','positionRule':'positions[floor(index / 3) % 10]','positions':[p['id'] for p in model['positions']],'selection':'none; all generated youth','professionalExperience':0,'generator':'Native C++ port of current generateYouthPlayer numeric branch, Apple Accelerate double-precision normal transform','workers':8,'shardSize':10_000_000,'histogramBinWidth':.1,'quantileMethod':'nearest rank bin midpoint; absolute bin error at most 0.1','randomness':'Actual game 32-bit FNV-1a seed hash and Mulberry32 sequence; seed collisions possible; not 1 billion independent RNG states','omitted':'Names, identities, personality and body: independent RNG branches that do not affect these output metrics'},'validation':validation,'overall':summarize_cells(cells),'byAge':{str(age):summarize_cells([c for c in cells if c['age']==age]) for age in [15,16,17]},'byPosition':{p['id']:summarize_cells([c for c in cells if c['position']==p['id']]) for p in model['positions']},'attributes':attrs,'checkpoints':{'count':len(raw),'total':endpoint,'contiguous':True,'allHistogramsConserveCounts':True,'files':[{'name':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(files)]},'sourceHashes':source_hashes}
    (FOLDER/'summary.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'count':EXPECTED,'ca':{k:v for k,v in report['overall']['ca'].items() if k!='histogram'},'pa':{k:v for k,v in report['overall']['pa'].items() if k!='histogram'},'correlation':report['overall']['correlation']},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
