import type {Perspective,Point} from '../types';
import {validatePerspective} from '../renderer/perspective';
import {homography} from '../renderer/render';

export const CALIBRATION_COLORS={tl:[255,0,51],tr:[0,102,255],br:[0,255,255],bl:[255,212,0]} as const;
type Corner=keyof typeof CALIBRATION_COLORS;
type Region={pixels:Int32Array;bounds:[number,number,number,number];area:number};
type Marker={corner:Corner;pixels:number[];center:Point;area:number};
export type MarkerCalibration={perspective?:Perspective;markerPixels:number[];issue?:string};
const names=Object.keys(CALIBRATION_COLORS) as Corner[];

export function markerCoverPixels(pixels:readonly number[],w:number,h:number,radius=3):number[]{
  const covered=new Set<number>();
  for(const p of pixels){const x=p%w,y=Math.floor(p/w);for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
    const px=x+dx,py=y+dy;if(dx*dx+dy*dy<=radius*radius&&px>=0&&py>=0&&px<w&&py<h)covered.add(py*w+px);
  }}
  return [...covered];
}

function colorAt(data:Uint8ClampedArray,p:number):Corner|null{
  const i=p*4;if(data[i+3]<180)return null;
  let best:Corner|null=null,distance=Infinity;
  for(const name of names){const c=CALIBRATION_COLORS[name],dr=Math.abs(data[i]-c[0]),dg=Math.abs(data[i+1]-c[1]),db=Math.abs(data[i+2]-c[2]);
    const d=dr*dr+dg*dg+db*db;if(Math.max(dr,dg,db)<=46&&d<distance){distance=d;best=name;}}
  return best;
}

function findMarkers(data:Uint8ClampedArray,w:number,h:number):Marker[]{
  const classified=new Uint8Array(w*h),visited=new Uint8Array(w*h),queue=new Int32Array(w*h),markers:Marker[]=[];
  for(let p=0;p<w*h;p++){const color=colorAt(data,p);if(color)classified[p]=names.indexOf(color)+1;}
  for(let p=0;p<w*h;p++){
    const label=classified[p];if(!label||visited[p])continue;
    let head=0,tail=0,sumX=0,sumY=0;queue[tail++]=p;visited[p]=1;
    while(head<tail){const v=queue[head++],x=v%w,y=Math.floor(v/w);sumX+=x;sumY+=y;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;
        const q=ny*w+nx;if(classified[q]===label&&!visited[q]){visited[q]=1;queue[tail++]=q;}
      }
    }
    if(tail>=Math.max(4,Math.floor(w*h*.000001)))markers.push({corner:names[label-1],pixels:Array.from(queue.subarray(0,tail)),center:[sumX/tail,sumY/tail],area:tail});
  }
  return markers;
}

function closestRegion(marker:Marker,labels:Int16Array,w:number,h:number,limit:number):number{
  const x=Math.round(marker.center[0]),y=Math.round(marker.center[1]);let closest=0,best=Infinity;
  for(let dy=-limit;dy<=limit;dy++)for(let dx=-limit;dx<=limit;dx++){
    const distance=dx*dx+dy*dy;if(distance>=best||distance>limit*limit)continue;
    const px=x+dx,py=y+dy;if(px<0||py<0||px>=w||py>=h)continue;
    const label=labels[py*w+px];if(label){best=distance;closest=label;}
  }
  return closest-1;
}

export function calibrateMarkers(data:Uint8ClampedArray,w:number,h:number,regions:Region[]):MarkerCalibration[]{
  const labels=new Int16Array(w*h),grouped:Marker[][]=regions.map(()=>[]);
  regions.forEach((region,i)=>{for(const p of region.pixels)labels[p]=i+1;});
  const limit=Math.max(18,Math.min(80,Math.round(Math.min(w,h)*.035)));
  for(const marker of findMarkers(data,w,h)){const index=closestRegion(marker,labels,w,h,limit);if(index>=0)grouped[index].push(marker);}
  return grouped.map((markers,i)=>{
    const markerPixels=markers.flatMap(marker=>marker.pixels),byCorner=Object.fromEntries(names.map(name=>[name,markers.filter(marker=>marker.corner===name)])) as Record<Corner,Marker[]>;
    if(names.some(name=>byCorner[name].length!==1))return {markerPixels,issue:'A complete set of four unique calibration markers was not found.'};
    const point=(name:Corner):Point=>[byCorner[name][0].center[0]/w,byCorner[name][0].center[1]/h];
    const perspective:Perspective={tl:point('tl'),tr:point('tr'),br:point('br'),bl:point('bl')};
    const region=regions[i],bounds:[number,number,number,number]=[region.bounds[0]/w,region.bounds[1]/h,region.bounds[2]/w,region.bounds[3]/h];
    const issue=validatePerspective(perspective,bounds,region.area/(w*h));
    if(issue)return {markerPixels,issue};
    try{const h=homography([perspective.tl,perspective.tr,perspective.br,perspective.bl]);
      const determinant=h.u[0]*(h.v[1]-h.v[2]*h.d[1])-h.u[1]*(h.v[0]-h.v[2]*h.d[0])+h.u[2]*(h.v[0]*h.d[1]-h.v[1]*h.d[0]);
      if(!Number.isFinite(determinant)||Math.abs(determinant)<1e-8)return {markerPixels,issue:'Calibration homography is singular.'};
    }catch{return {markerPixels,issue:'Calibration homography is singular.'};}
    return {perspective,markerPixels};
  });
}
