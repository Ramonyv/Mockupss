import assert from 'node:assert/strict';
import {repairGreenFringe} from '../src/renderer/greenFringe.ts';

const width=9,height=9,size=width*height*4;
const output=new Uint8ClampedArray(size);
const projection=new Uint8ClampedArray(size);
const mask=new Uint8ClampedArray(size);
const pixel=(data,x,y,r,g,b,a=255)=>{const i=(y*width+x)*4;data.set([r,g,b,a],i);};
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  pixel(output,x,y,35,34,35);
  pixel(projection,x,y,18,22,30);
  if(x>=2&&x<=6&&y>=2&&y<=6)pixel(mask,x,y,255,255,255);
}
pixel(output,1,4,0,210,0); // residual green beside the mask
pixel(output,0,4,0,210,0); // green farther away must remain untouched
pixel(output,7,4,115,70,55); // warm hand color beside the mask
pixel(output,2,4,15,130,20); // intentional green within the screen
assert.equal(repairGreenFringe(output,projection,mask,width,height,1),1);
const rgb=(x,y)=>Array.from(output.slice((y*width+x)*4,(y*width+x)*4+3));
assert.deepEqual(rgb(1,4),[18,22,30]);
assert.deepEqual(rgb(0,4),[0,210,0]);
assert.deepEqual(rgb(7,4),[115,70,55]);
assert.deepEqual(rgb(2,4),[15,130,20]);
console.log('Green fringe repair preserves the screen interior and non-chroma foreground.');
