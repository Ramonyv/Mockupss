import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {build} from 'esbuild';
import {PNG} from 'pngjs';

const compiled=await build({stdin:{contents:"export {analyzeChroma} from './src/template-builder/chroma.ts';export {calibrateMarkers,CALIBRATION_COLORS,markerCoverPixels} from './src/template-builder/markers.ts';export {homography} from './src/renderer/render.ts';export {makeScreenshotOpaque} from './src/renderer/opaqueScreenshot.ts';export {repairGreenFringe} from './src/renderer/greenFringe.ts';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {analyzeChroma,calibrateMarkers,CALIBRATION_COLORS,markerCoverPixels,homography,makeScreenshotOpaque,repairGreenFringe}=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);
const master=PNG.sync.read(readFileSync('tests/fixtures/calibrated-handheld-master.png'));
const regions=analyzeChroma(master.data,master.width,master.height),sets=calibrateMarkers(master.data,master.width,master.height,regions);
assert.equal(regions.length,1);assert.ok(sets[0].perspective,sets[0].issue);
const plane=sets[0].perspective,points=[plane.tl,plane.tr,plane.br,plane.bl].map(([x,y])=>[x*master.width,y*master.height]);
const expected=[[900,112],[1045,308],[645,930],[415,800]];
points.forEach(([x,y],i)=>{assert.ok(Math.abs(x-expected[i][0])<1);assert.ok(Math.abs(y-expected[i][1])<1);});
const mask=new Uint8Array(master.width*master.height);for(const p of regions[0].pixels)mask[p]=1;
for(const p of markerCoverPixels(sets[0].markerPixels,master.width,master.height))mask[p]=1;
const h=homography(points);
const len=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const targetAspect=((len(points[0],points[1])+len(points[3],points[2]))/2)/((len(points[0],points[3])+len(points[1],points[2]))/2);
function sample(source,u,v){const x=Math.max(0,Math.min(source.width-1,u*(source.width-1))),y=Math.max(0,Math.min(source.height-1,v*(source.height-1)));const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(source.width-1,x0+1),y1=Math.min(source.height-1,y0+1),fx=x-x0,fy=y-y0;
  const p=(px,py,c)=>source.data[(py*source.width+px)*4+c];return [0,1,2].map(c=>Math.round((p(x0,y0,c)*(1-fx)+p(x1,y0,c)*fx)*(1-fy)+(p(x0,y1,c)*(1-fx)+p(x1,y1,c)*fx)*fy));}
function project(source,name){
  makeScreenshotOpaque(source.data,source.width,source.height);
  const result=PNG.sync.read(PNG.sync.write(master)),projection=new Uint8ClampedArray(result.data.length),matte=new Uint8ClampedArray(result.data.length);
  const sourceAspect=source.width/source.height,cropWidth=sourceAspect>targetAspect?targetAspect/sourceAspect:1,cropHeight=sourceAspect>targetAspect?1:sourceAspect/targetAspect;
  for(let y=0;y<master.height;y++)for(let x=0;x<master.width;x++){
    const i=(y*master.width+x)*4;if(mask[y*master.width+x])matte[i+3]=255;
    const denominator=h.d[0]*x+h.d[1]*y+1;
    const u=Math.max(0,Math.min(1,(h.u[0]*x+h.u[1]*y+h.u[2])/denominator));
    const v=Math.max(0,Math.min(1,(h.v[0]*x+h.v[1]*y+h.v[2])/denominator));
    const color=sample(source,.5+(u-.5)*cropWidth,.5+(v-.5)*cropHeight);
    projection.set([...color,255],i);if(mask[y*master.width+x])result.data.set([...color,255],i);
  }
  repairGreenFringe(result.data,projection,matte,master.width,master.height,4);
  for(let i=0;i<result.data.length;i+=4){
    assert.ok(!Object.values(CALIBRATION_COLORS).some(color=>color.every((channel,c)=>result.data[i+c]===channel)),'Calibration marker leaked into the final composite.');
    assert.ok(!(result.data[i]<25&&result.data[i+1]>235&&result.data[i+2]<30),'Source chroma green leaked into the final composite.');
  }
  mkdirSync('tests/artifacts',{recursive:true});writeFileSync(`tests/artifacts/${name}`,PNG.sync.write(result));
}
const grid=new PNG({width:860,height:1864});for(let y=0;y<grid.height;y++)for(let x=0;x<grid.width;x++){
  const i=(y*grid.width+x)*4,line=x%86<3||y%116<3,light=(Math.floor(x/86)+Math.floor(y/116))%2===0;grid.data.set(line?[250,250,250,255]:light?[210,210,210,255]:[45,45,45,255],i);
}
project(grid,'calibrated-handheld-grid.png');
const papersPath=process.argv[2]??'tests/fixtures/Papers.png';assert.ok(existsSync(papersPath),'Papers test screenshot is missing.');
project(PNG.sync.read(readFileSync(papersPath)),'calibrated-handheld-papers.png');
console.log('Hand-held marker geometry, grid, and Papers projection passed.');
