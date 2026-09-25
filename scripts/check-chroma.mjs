import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {PNG} from 'pngjs';

const bundled=await build({entryPoints:['src/template-builder/chroma.ts'],bundle:true,write:false,platform:'browser',format:'esm'});
const moduleUrl=`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString('base64')}`;
const {analyzeChroma}=await import(moduleUrl);
const w=900,h=620,data=new Uint8ClampedArray(w*h*4);
const quads=[[[85,110],[215,95],[235,510],[100,525]],[[345,55],[515,80],[490,545],[320,520]],[[640,125],[825,175],[760,550],[575,500]]];
const inside=(x,y,q)=>{let sign=0;for(let i=0;i<4;i++){const a=q[i],b=q[(i+1)%4],cross=(b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]);if(Math.abs(cross)<.01)continue;if(sign&&Math.sign(cross)!==sign)return false;sign=Math.sign(cross);}return true;};
for(let y=0;y<h;y++)for(let x=0;x<w;x++){const j=(y*w+x)*4;const green=quads.some(q=>inside(x,y,q));data[j]=green?8:245;data[j+1]=green?247:242;data[j+2]=green?5:238;data[j+3]=255;}
for(let y=450;y<520;y++)for(let x=650;x<740;x++){if((x-695)**2+(y-485)**2>45**2)continue;const j=(y*w+x)*4;data[j]=160;data[j+1]=105;data[j+2]=80;}
for(let i=0;i<30;i++){const x=(i*71)%w,y=(i*43)%h,j=(y*w+x)*4;data[j]=0;data[j+1]=255;data[j+2]=0;}
const regions=analyzeChroma(data,w,h,24);
assert.equal(regions.length,3,'Expected three large green screen regions');
const handPixel=485*w+695;assert.ok(regions.every(r=>!r.pixels.includes(handPixel)),'Non-green foreground must remain outside screen masks');
for(const r of regions){assert.ok(r.area>30000);const c=r.corners;const quad=[c.topLeft,c.topRight,c.bottomRight,c.bottomLeft];for(const p of quad)assert.ok(p[0]>=0&&p[0]<=1&&p[1]>=0&&p[1]<=1);const quadWidth=Math.max(...quad.map(p=>p[0]))-Math.min(...quad.map(p=>p[0]));assert.ok(quadWidth<.35,'A quad spans more than one screen');for(let i=0;i<r.pixels.length;i+=101){const index=r.pixels[i],x=index%w,y=Math.floor(index/w);assert.ok(inside(x,y,quad.map(([u,v])=>[u*w,v*h])),'A detected green pixel falls outside its perspective quad');}}
console.log('Chroma connected-component checks passed.');
const photo=PNG.sync.read(readFileSync('tests/fixtures/three-phone-master.png'));
const actual=analyzeChroma(new Uint8ClampedArray(photo.data),photo.width,photo.height,24);
assert.equal(actual.length,3,'The supplied three-phone master must detect exactly three screens');
for(const region of actual){assert.ok(region.area>photo.width*photo.height*.01,'Each screen must be a large component');const [left,top,right,bottom]=region.bounds;assert.ok(right-left<photo.width*.7&&bottom-top<photo.height*.9,'A screen component spans too much of the master image');}
const covered=new Uint8Array(photo.width*photo.height);for(const region of actual){for(const p of region.pixels)covered[p]=1;const c=region.corners,quad=[c.topLeft,c.topRight,c.bottomRight,c.bottomLeft].map(([u,v])=>[u*photo.width,v*photo.height]);for(const p of region.pixels)assert.ok(inside(p%photo.width,Math.floor(p/photo.width),quad),'The screen quad does not cover its green mask');}
let strongGreen=0,uncoveredGreen=0;for(let p=0;p<covered.length;p++){const j=p*4,r=photo.data[j],g=photo.data[j+1],b=photo.data[j+2];if(g>180&&g-Math.max(r,b)>85&&Math.hypot(r,255-g,b)<105){strongGreen++;if(!covered[p])uncoveredGreen++;}}
assert.ok(uncoveredGreen/strongGreen<.001,'Detected masks leave too much chroma green uncovered');
let greenFringe=0;for(const region of actual){const [left,top,right,bottom]=region.bounds;for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){const p=y*photo.width+x,j=p*4,r=photo.data[j],g=photo.data[j+1],b=photo.data[j+2];if(g>35&&g-Math.max(r,b)>8&&!covered[p])greenFringe++;}}
console.log('Uncovered green fringe pixels:',greenFringe);
assert.ok(greenFringe<150,'Detected masks leave visible green fringe around displays');
console.log('Supplied three-phone master: exactly three screens detected.');
const onePhone=PNG.sync.read(readFileSync('tests/fixtures/one-phone-master.png'));
const single=analyzeChroma(new Uint8ClampedArray(onePhone.data),onePhone.width,onePhone.height,24);
assert.equal(single.length,1,'The supplied one-phone master must detect one display');
const c=single[0].corners,actualCorners=[c.topLeft,c.topRight,c.bottomRight,c.bottomLeft].map(([u,v])=>[u*onePhone.width,v*onePhone.height]);
const expectedCorners=[[512,128],[981,179],[791,1184],[307,1107]];
for(let i=0;i<4;i++)assert.ok(Math.hypot(actualCorners[i][0]-expectedCorners[i][0],actualCorners[i][1]-expectedCorners[i][1])<25,`Physical screen corner ${i+1} is misplaced`);
for(const p of single[0].pixels)assert.ok(inside(p%onePhone.width,Math.floor(p/onePhone.width),actualCorners),'The one-phone perspective quad must cover its green mask');
console.log('Supplied one-phone master: four physical screen corners fit the display edges.');
