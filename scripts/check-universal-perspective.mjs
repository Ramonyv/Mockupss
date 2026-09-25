import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {PNG} from 'pngjs';

async function load(entry){const built=await build({entryPoints:[entry],bundle:true,write:false,platform:'browser',format:'esm'});return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`);}
const {homography}=await load('src/renderer/render.ts');
const {estimatePerspectiveFromAlpha}=await load('src/renderer/perspective.ts');
const width=1000,height=1000;
function rotated(cx,cy,planeWidth,planeHeight,degrees){const angle=degrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>[cx+c*x*planeWidth/2-s*y*planeHeight/2,cy+s*x*planeWidth/2+c*y*planeHeight/2]);}
function sample(quad,{finger=false,notch=false,spike=false}={}){
  const alpha=new Uint8Array(width*height),h=homography(quad);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const d=h.d[0]*x+h.d[1]*y+h.d[2],u=(h.u[0]*x+h.u[1]*y+h.u[2])/d,v=(h.v[0]*x+h.v[1]*y+h.v[2])/d;
    if(u<0||u>1||v<0||v>1)continue;
    const rx=Math.max(.06-u,0,u-.94),ry=Math.max(.06-v,0,v-.94);
    if(Math.hypot(rx,ry)>.06)continue;
    if(finger&&u<.18&&v>.32&&v<.68)continue;
    if(notch&&(u-.5)**2/.01+(v-.07)**2/.0008<1)continue;
    alpha[y*width+x]=255;
  }
  if(spike){const midpoint=[(quad[0][0]+quad[1][0])/2,(quad[0][1]+quad[1][1])/2],center=quad.reduce((p,v)=>[p[0]+v[0]/4,p[1]+v[1]/4],[0,0]),dx=midpoint[0]-center[0],dy=midpoint[1]-center[1],length=Math.hypot(dx,dy);
    for(let t=-3;t<=24;t++)for(let thickness=-1;thickness<=1;thickness++){const x=Math.round(midpoint[0]+dx/length*t+dy/length*thickness),y=Math.round(midpoint[1]+dy/length*t-dx/length*thickness);if(x>=0&&x<width&&y>=0&&y<height)alpha[y*width+x]=255;}}
  return alpha;
}
const cases=[
  ['straight portrait',rotated(500,500,340,740,5),{}],
  ['rotated portrait',rotated(500,500,340,740,45),{finger:true,notch:true}],
  ['noisy rotated portrait',rotated(500,500,340,740,45),{finger:true,spike:true}],
  ['120 degree portrait',rotated(500,500,340,740,120),{finger:true}],
  ['upside down portrait',rotated(500,500,340,740,175),{}],
  ['landscape monitor',rotated(500,500,730,390,18),{}],
  ['rotated landscape',rotated(500,500,720,360,125),{}],
  ['projective trapezoid',[[225,195],[715,115],[825,780],[170,845]],{finger:true}],
  ['extreme perspective',[[320,265],[650,130],[885,780],[160,850]],{}],
  ['strongly foreshortened',[[435,280],[565,285],[900,820],[110,835]],{}],
  ['slim rotated billboard',rotated(500,500,780,100,45),{}],
  ['slim portrait poster',rotated(500,500,100,780,25),{}],
];
let seed=0x745bd31;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
for(let i=0;i<30;i++){const planeWidth=260+random()*330,planeHeight=300+random()*430,angle=random()*360,quad=rotated(500,500,planeWidth,planeHeight,angle).map(([x,y])=>[x+(random()-.5)*25,y+(random()-.5)*25]);cases.push([`varied surface ${i+1}`,quad,{finger:i%4===0,notch:i%5===0}]);}
for(const [name,quad,options] of cases){
  const fit=estimatePerspectiveFromAlpha(sample(quad,options),width,height);
  assert.ok(fit?.confident,`${name}: ${fit?.reason??'no plane detected'}`);
  const found=[fit.perspective.tl,fit.perspective.tr,fit.perspective.br,fit.perspective.bl].map(([x,y])=>[x*width,y*height]);
  for(const expected of quad)assert.ok(Math.min(...found.map(p=>Math.hypot(p[0]-expected[0],p[1]-expected[1])))<30,`${name}: missed a theoretical corner`);
}
console.log(`${cases.length} universal perspective scenarios passed.`);
const {analyzeChroma}=await load('src/template-builder/chroma.ts');
const multiple=PNG.sync.read(readFileSync('tests/fixtures/three-phone-master.png'));
const components=analyzeChroma(new Uint8ClampedArray(multiple.data),multiple.width,multiple.height,24);
assert.equal(components.length,3);
const fits=components.map(component=>{const alpha=new Uint8Array(multiple.width*multiple.height);for(const pixel of component.pixels)alpha[pixel]=255;return estimatePerspectiveFromAlpha(alpha,multiple.width,multiple.height);});
assert.ok(fits.every(Boolean),'Each disconnected surface should be analyzed independently');
assert.ok(fits[2].confident,'The unobstructed front surface should fit automatically');
assert.ok(fits.slice(0,2).every(fit=>!fit.confident),'Surfaces with a fully hidden edge must request manual review');
console.log('Three independent surfaces passed, with hidden edges flagged for review.');
