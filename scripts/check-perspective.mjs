import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {PNG} from 'pngjs';

const bundled=await build({entryPoints:['src/renderer/render.ts'],bundle:true,write:false,platform:'browser',format:'esm'});
const moduleUrl=`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString('base64')}`;
const {homography,validateScreen,screenPoints,perspectivePoints}=await import(moduleUrl);
const corners=[[42,16],[190,28],[166,312],[20,288]];
const h=homography(corners);
const map=([x,y])=>{const d=h.d[0]*x+h.d[1]*y+h.d[2];return [(h.u[0]*x+h.u[1]*y+h.u[2])/d,(h.v[0]*x+h.v[1]*y+h.v[2])/d];};
[[0,0],[1,0],[1,1],[0,1]].forEach((want,i)=>{const got=map(corners[i]);assert.ok(Math.abs(got[0]-want[0])<1e-9&&Math.abs(got[1]-want[1])<1e-9,`corner ${i+1} did not map correctly`);});
const screen={id:'one',label:'One',type:'quad',fit:'cover',screenBleed:2,corners:{topLeft:[.1,.1],topRight:[.8,.13],bottomRight:[.75,.9],bottomLeft:[.12,.85]}};
assert.equal(validateScreen(screen),null);
assert.equal(screenPoints(screen,1000,1000,2000).length,4);
assert.match(validateScreen({...screen,corners:{...screen.corners,bottomRight:[.05,.05]}}),/cross|small/i);
const perspectiveBundle=await build({entryPoints:['src/renderer/perspective.ts'],bundle:true,write:false,platform:'browser',format:'esm'});
const perspectiveUrl=`data:text/javascript;base64,${Buffer.from(perspectiveBundle.outputFiles[0].contents).toString('base64')}`;
const {estimatePerspectiveFromAlpha,validatePerspective}=await import(perspectiveUrl);
const photo=PNG.sync.read(readFileSync('tests/fixtures/one-phone-master.png'));
const alpha=new Uint8Array(photo.width*photo.height);
for(let p=0;p<alpha.length;p++){const j=p*4,r=photo.data[j],g=photo.data[j+1],b=photo.data[j+2];if(g>100&&g-Math.max(r,b)>40)alpha[p]=255;}
const estimated=estimatePerspectiveFromAlpha(alpha,photo.width,photo.height);
assert.ok(estimated,'A visible green screen should yield a perspective plane');
assert.ok(estimated.confident,estimated.reason??'The clean one-phone display should be a confident fit');
assert.equal(validatePerspective(estimated.perspective),null);
const projected=perspectivePoints({...screen,perspective:estimated.perspective},photo.width,photo.height);
const expected=[[512,128],[981,179],[791,1184],[307,1107]];
projected.forEach((point,i)=>assert.ok(Math.hypot(point[0]-expected[i][0],point[1]-expected[i][1])<35,`Fitted plane corner ${i+1} misses the physical display`));
const rotated=[[465,95],[755,310],[410,810],[125,600]],rw=900,rh=900,rotatedAlpha=new Uint8Array(rw*rh),inverse=homography(rotated);
for(let y=0;y<rh;y++)for(let x=0;x<rw;x++){
  const d=inverse.d[0]*x+inverse.d[1]*y+inverse.d[2],u=(inverse.u[0]*x+inverse.u[1]*y+inverse.u[2])/d,v=(inverse.v[0]*x+inverse.v[1]*y+inverse.v[2])/d;
  if(u<0||u>1||v<0||v>1)continue;
  const rx=Math.max(.06-u,0,u-.94),ry=Math.max(.035-v,0,v-.965);
  if(Math.hypot(rx/.06,ry/.035)>1)continue;
  if(u<.17&&v>.35&&v<.65)continue; // a foreground finger hides part of one long edge
  if((u-.52)**2/.012+(v-.055)**2/.0006<1)continue; // camera cutout
  rotatedAlpha[y*rw+x]=255;
}
const rotatedFit=estimatePerspectiveFromAlpha(rotatedAlpha,rw,rh);
assert.ok(rotatedFit?.confident,rotatedFit?.reason??'A rotated rounded display should yield a confident plane');
const rotatedPoints=[rotatedFit.perspective.tl,rotatedFit.perspective.tr,rotatedFit.perspective.br,rotatedFit.perspective.bl];
rotatedPoints.forEach((point,i)=>assert.ok(Math.hypot(point[0]*rw-rotated[i][0],point[1]*rh-rotated[i][1])<30,`Rotated plane corner ${i+1} misses the display`));
console.log('Perspective geometry checks passed.');
