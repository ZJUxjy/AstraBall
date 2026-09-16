import test from 'node:test';
import assert from 'node:assert/strict';
import { zoomCamera, wheelCamera } from '../src/map-input.js';

const view={width:800,height:600},limits={min:25,max:1500};
const camera={x:700,y:400,width:800},anchor=[150,-80];
const event={deltaMode:0,deltaX:0,deltaY:0,ctrlKey:false,metaKey:false};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const worldAt=c=>[c.x+anchor[0]*c.width/view.width,c.y+anchor[1]*c.width/view.width];

test('two-finger pixel scrolling pans both axes without changing zoom',()=>{
  const next=wheelCamera(camera,{...event,deltaX:18,deltaY:-32},anchor,view,limits);
  assert.deepEqual(next,{x:718,y:368,width:800});
  assert.deepEqual(wheelCamera(next,{...event,deltaX:-18,deltaY:32},anchor,view,limits),camera);
});

test('pinch preserves the world point under an off-centre cursor, including at zoom limits',()=>{
  for(const dy of [-6,6,-100000,100000]){
    const next=wheelCamera(camera,{...event,ctrlKey:true,deltaY:dy},anchor,view,limits);
    worldAt(next).forEach((n,i)=>near(n,worldAt(camera)[i]));
  }
  for(const factor of [1e6,1e-6]){
    const next=zoomCamera(camera,factor,anchor,view,limits);
    assert.ok(next.width>=limits.min&&next.width<=limits.max);
    worldAt(next).forEach((n,i)=>near(n,worldAt(camera)[i]));
  }
});

test('fine pinch events accumulate consistently without depending on render frequency',()=>{
  const one=wheelCamera(camera,{...event,ctrlKey:true,deltaY:-12},anchor,view,limits);
  let many=camera;
  for(let i=0;i<24;i++)many=wheelCamera(many,{...event,ctrlKey:true,deltaY:-.5},anchor,view,limits);
  for(const key of ['x','y','width'])near(one[key],many[key]);
});

test('line/page wheels zoom; extreme deltas are bounded; reversing at a limit responds immediately',()=>{
  for(const mode of [1,2]){
    const next=wheelCamera(camera,{...event,deltaMode:mode,deltaY:3},anchor,view,limits);
    assert.ok(next.width>camera.width&&next.width<=camera.width*Math.exp(.4));
  }
  const edge={...camera,width:limits.min};
  const stopped=wheelCamera(edge,{...event,ctrlKey:true,deltaY:-100},anchor,view,limits);
  assert.deepEqual(stopped,edge);
  const reverse=wheelCamera(stopped,{...event,ctrlKey:true,deltaY:1},anchor,view,limits);
  assert.ok(reverse.width>limits.min);
});
