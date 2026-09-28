import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {build} from 'esbuild';
import {PNG} from 'pngjs';

const compiled=await build({stdin:{contents:"export {analyzeChroma} from './src/template-builder/chroma.ts'; export {calibrateMarkers,CALIBRATION_COLORS,markerCoverPixels} from './src/template-builder/markers.ts'; export {homography} from './src/renderer/render.ts'; export {makeScreenshotOpaque} from './src/renderer/opaqueScreenshot.ts';",resolveDir:process.cwd(),sourcefile:'calibration-test-entry.ts'},bundle:true,platform:'node',format:'esm',write:false});
const {analyzeChroma,calibrateMarkers,CALIBRATION_COLORS,markerCoverPixels,homography,makeScreenshotOpaque}=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);
const png=(w,h)=>{const image=new PNG({width:w,height:h});for(let i=0;i<image.data.length;i+=4)image.data.set([42,43,46,255],i);return image;};
const paint=(image,x,y,color)=>{if(x<0||y<0||x>=image.width||y>=image.height)return;const i=(y*image.width+x)*4;image.data.set([...color,255],i);};
const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
const inside=(p,quad)=>quad.every((a,i)=>cross(a,quad[(i+1)%4],p)>=0);
const circle=(image,c,r,color)=>{for(let y=Math.floor(c[1]-r);y<=c[1]+r;y++)for(let x=Math.floor(c[0]-r);x<=c[0]+r;x++)if((x-c[0])**2+(y-c[1])**2<=r*r)paint(image,x,y,color);};
function drawScreen(image,quad,missing){
  const left=Math.floor(Math.min(...quad.map(p=>p[0]))),right=Math.ceil(Math.max(...quad.map(p=>p[0]))),top=Math.floor(Math.min(...quad.map(p=>p[1]))),bottom=Math.ceil(Math.max(...quad.map(p=>p[1])));
  for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)if(inside([x+.5,y+.5],quad))paint(image,x,y,[0,255,0]);
  // A notch and partial hand occlusion change the visible mask, not the plane.
  const center=[(quad[0][0]+quad[1][0])/2,(quad[0][1]+quad[1][1])/2+23];circle(image,center,16,[22,22,22]);
  circle(image,[(quad[0][0]+quad[3][0])/2,(quad[0][1]+quad[3][1])/2],29,[132,77,61]);
  for(const [index,name] of ['tl','tr','br','bl'].entries())if(name!==missing)circle(image,quad[index],8,CALIBRATION_COLORS[name]);
}
const approx=(actual,expected,epsilon=.003)=>assert.ok(Math.abs(actual-expected)<epsilon,`${actual} differs from ${expected}`);
const alphaSource=new Uint8ClampedArray(10*10*4);for(let i=0;i<alphaSource.length;i+=4)alphaSource.set([20,25,30,255],i);alphaSource.set([0,0,0,0],0);
assert.equal(makeScreenshotOpaque(alphaSource,10,10),true);assert.deepEqual(Array.from(alphaSource.slice(0,4)),[20,25,30,255]);
const one=png(900,900),quad=[[360,165],[490,135],[730,700],[125,755]];
drawScreen(one,quad);
const regions=analyzeChroma(one.data,one.width,one.height),calibrations=calibrateMarkers(one.data,one.width,one.height,regions);
assert.equal(regions.length,1);assert.ok(calibrations[0].perspective,calibrations[0].issue);
const p=calibrations[0].perspective;
for(const [i,name] of ['tl','tr','br','bl'].entries()){approx(p[name][0],quad[i][0]/one.width);approx(p[name][1],quad[i][1]/one.height);}
assert.ok(Math.hypot(quad[1][0]-quad[0][0],quad[1][1]-quad[0][1])<Math.hypot(quad[2][0]-quad[3][0],quad[2][1]-quad[3][1])*.25);

// Inspectable grid: inverse sampling uses the same 3×3 map as the WebGL renderer.
const h=homography([p.tl,p.tr,p.br,p.bl]);const grid=PNG.sync.read(PNG.sync.write(one)),markerMask=new Uint8Array(one.width*one.height);
for(const pixel of markerCoverPixels(calibrations[0].markerPixels,one.width,one.height))markerMask[pixel]=1;
for(let y=0;y<grid.height;y++)for(let x=0;x<grid.width;x++){
  const d=h.d[0]*x/grid.width+h.d[1]*y/grid.height+1,u=(h.u[0]*x/grid.width+h.u[1]*y/grid.height+h.u[2])/d,v=(h.v[0]*x/grid.width+h.v[1]*y/grid.height+h.v[2])/d;
  const i=(y*grid.width+x)*4;if(one.data[i+1]-Math.max(one.data[i],one.data[i+2])<60&&!markerMask[y*grid.width+x])continue;
  const cu=Math.max(0,Math.min(1,u)),cv=Math.max(0,Math.min(1,v));
  const line=Math.min(cu%0.125,0.125-cu%0.125,cv%0.125,0.125-cv%0.125)<.005;
  const shade=(Math.floor(cu*8)+Math.floor(cv*8))%2?52:215;paint(grid,x,y,line?[245,245,245]:[shade,shade,shade]);
}
for(let i=0;i<grid.data.length;i+=4)assert.ok(!Object.values(CALIBRATION_COLORS).some(c=>c.every((v,k)=>grid.data[i+k]===v)),'Calibration color leaked into the rendered grid.');
mkdirSync('tests/artifacts',{recursive:true});writeFileSync('tests/artifacts/calibration-extreme-grid.png',PNG.sync.write(grid));
assert.deepEqual(PNG.sync.read(readFileSync('tests/fixtures/calibrated-extreme-master.png')).data,one.data);

const multiple=png(1300,920),quads=[[[65,150],[215,125],[250,705],[40,750]],[[515,170],[690,150],[745,700],[470,730]],[[980,630],[820,620],[825,160],[1100,180]]];
quads.forEach(q=>drawScreen(multiple,q));const found=analyzeChroma(multiple.data,multiple.width,multiple.height),sets=calibrateMarkers(multiple.data,multiple.width,multiple.height,found);
assert.equal(found.length,3);assert.equal(sets.filter(set=>set.perspective).length,3);
const incomplete=png(900,900);drawScreen(incomplete,quad,'tr');const missing=calibrateMarkers(incomplete.data,900,900,analyzeChroma(incomplete.data,900,900));assert.equal(missing[0].perspective,undefined);
const duplicate=PNG.sync.read(PNG.sync.write(one));circle(duplicate,[405,205],8,CALIBRATION_COLORS.tl);
assert.equal(calibrateMarkers(duplicate.data,900,900,analyzeChroma(duplicate.data,900,900))[0].perspective,undefined);
const crossed=png(900,900);drawScreen(crossed,quad);circle(crossed,quad[1],8,CALIBRATION_COLORS.br);circle(crossed,quad[2],8,CALIBRATION_COLORS.tr);
assert.equal(calibrateMarkers(crossed.data,900,900,analyzeChroma(crossed.data,900,900))[0].perspective,undefined);
console.log('Marker calibration passed: extreme grid, notch/occlusion, upside-down screen, three independent screens, and invalid-marker fallback.');
