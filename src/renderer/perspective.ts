import type {Perspective,Point,Screen,Template} from '../types';

type Estimate={perspective:Perspective;visibleBounds:[number,number,number,number];visibleArea:number;confident:boolean;reason?:string};
type Edge={a:Point;b:Point;length:number;index:number};
type Line={nx:number;ny:number;d:number;score:number;support:number;span:number};
const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);

function hull(points:Point[]):Point[]{
  const sorted=points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(sorted.length<4)return [];
  const lower:Point[]=[],upper:Point[]=[];
  for(const p of sorted){while(lower.length>=2&&cross(lower[lower.length-2],lower[lower.length-1],p)<=0)lower.pop();lower.push(p);}
  for(let i=sorted.length-1;i>=0;i--){const p=sorted[i];while(upper.length>=2&&cross(upper[upper.length-2],upper[upper.length-1],p)<=0)upper.pop();upper.push(p);}
  lower.pop();upper.pop();return lower.concat(upper);
}

function mergeStraightEdges(edges:Edge[],tolerance:number):Edge[]{
  if(!edges.length)return [];
  const pivot=edges.reduce((best,e,i)=>e.length<edges[best].length?i:best,0);
  const rotated=edges.slice(pivot).concat(edges.slice(0,pivot)),groups:Edge[]=[];
  for(const edge of rotated){
    const last=groups[groups.length-1];
    if(last){const ax=last.b[0]-last.a[0],ay=last.b[1]-last.a[1],bx=edge.b[0]-edge.a[0],by=edge.b[1]-edge.a[1];
      const cosine=(ax*bx+ay*by)/(Math.hypot(ax,ay)*Math.hypot(bx,by));
      const deviation=Math.abs(cross(last.a,last.b,edge.b))/Math.hypot(ax,ay);
      if(cosine>.985&&deviation<tolerance){last.b=edge.b;last.length=Math.hypot(last.b[0]-last.a[0],last.b[1]-last.a[1]);continue;}
    }
    groups.push({a:edge.a,b:edge.b,length:edge.length,index:groups.length});
  }
  return groups;
}

function lineFromPair(a:Point,b:Point,cx:number,cy:number):Line|null{
  const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(length<1)return null;
  let nx=-dy/length,ny=dx/length,d=nx*a[0]+ny*a[1];
  if(nx*cx+ny*cy>d){nx=-nx;ny=-ny;d=-d;}
  return {nx,ny,d,score:0,support:0,span:0};
}

function scoreLine(line:Line,boundary:Point[],interior:Point[],tolerance:number,minSpan:number):Line|null{
  const inliers:Point[]=[];let min=Infinity,max=-Infinity;
  for(const p of boundary)if(Math.abs(line.nx*p[0]+line.ny*p[1]-line.d)<=tolerance){inliers.push(p);const along=-line.ny*p[0]+line.nx*p[1];min=Math.min(min,along);max=Math.max(max,along);}
  if(inliers.length<18||max-min<minSpan)return null;
  // A true outer edge leaves virtually all chroma on its inner side. This rejects finger contours.
  let outside=0;for(const p of interior)if(line.nx*p[0]+line.ny*p[1]-line.d>tolerance*1.5)outside++;
  if(outside/interior.length>.025)return null;
  const mx=inliers.reduce((s,p)=>s+p[0],0)/inliers.length,my=inliers.reduce((s,p)=>s+p[1],0)/inliers.length;
  let xx=0,xy=0,yy=0;for(const [x,y] of inliers){const dx=x-mx,dy=y-my;xx+=dx*dx;xy+=dx*dy;yy+=dy*dy;}
  const theta=.5*Math.atan2(2*xy,xx-yy),dx=Math.cos(theta),dy=Math.sin(theta);
  let nx=-dy,ny=dx,d=nx*mx+ny*my;if(nx*line.nx+ny*line.ny<0){nx=-nx;ny=-ny;d=-d;}
  const support=inliers.length/boundary.length,span=max-min;
  return {nx,ny,d,score:inliers.length*Math.sqrt(span),support,span};
}

function intersectLines(a:Line,b:Line):Point|null{
  const den=a.nx*b.ny-a.ny*b.nx;if(Math.abs(den)<.08)return null;
  return [(a.d*b.ny-a.ny*b.d)/den,(a.nx*b.d-a.d*b.nx)/den];
}

export function validatePerspective(p:Perspective,maskBounds?:[number,number,number,number],visibleArea?:number):string|null{
  const corners=[p.tl,p.tr,p.br,p.bl];
  if(corners.some(([x,y])=>!Number.isFinite(x)||!Number.isFinite(y)||x<-.02||x>1.02||y<-.02||y>1.02))return 'Perspective corners are outside the image.';
  const turns=corners.map((_,i)=>cross(corners[i],corners[(i+1)%4],corners[(i+2)%4]));
  if(turns.some(v=>v<=.000001))return 'Perspective corners cross or collapse.';
  const area=Math.abs(corners.reduce((s,a,i)=>{const b=corners[(i+1)%4];return s+a[0]*b[1]-b[0]*a[1];},0))/2;
  if(area<.001)return 'Perspective plane is too small.';
  if(visibleArea&&(area<visibleArea*.7||area>visibleArea*8))return 'Perspective plane does not match the screen mask.';
  if(maskBounds){const [left,top,right,bottom]=maskBounds,margin=Math.max(right-left,bottom-top)*.16;
    if(corners.some(([x,y])=>x<left-margin||x>right+margin||y<top-margin||y>bottom+margin))return 'Perspective corners are too far from the screen mask.';
  }
  return null;
}

export function estimatePerspectiveFromAlpha(alpha:Uint8Array|Uint8ClampedArray,w:number,h:number,stride=1):Estimate|null{
  const boundary:Point[]=[];let minX=w,minY=h,maxX=-1,maxY=-1,area=0;
  const covered=(x:number,y:number)=>x>=0&&x<w&&y>=0&&y<h&&alpha[(y*w+x)*stride+(stride===4?3:0)]>127;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(covered(x,y)){
    area++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    if(!covered(x-1,y)||!covered(x+1,y)||!covered(x,y-1)||!covered(x,y+1))boundary.push([x,y]);
  }
  if(area<100||boundary.length<20)return null;
  const outline=hull(boundary),raw:Edge[]=outline.map((a,i)=>{const b=outline[(i+1)%outline.length];return {a,b,length:Math.hypot(b[0]-a[0],b[1]-a[1]),index:i};});
  const edges=mergeStraightEdges(raw,Math.max(4,Math.min(w,h)*.006));
  const cx=(minX+maxX)/2,cy=(minY+maxY)/2,tolerance=Math.max(2.5,Math.min(w,h)*.003),minSpan=Math.max(18,Math.min(w,h)*.025);
  const contour=boundary;
  const interior:Point[]=[];const step=Math.max(1,Math.round(Math.sqrt(area/500)));
  for(let y=minY;y<=maxY;y+=step)for(let x=minX;x<=maxX;x+=step)if(covered(x,y))interior.push([x,y]);
  if(!interior.length)return null;
  const proposals:Line[]=[];
  for(const edge of edges){const line=lineFromPair(edge.a,edge.b,cx,cy);if(line)proposals.push(line);}
  // Deterministic RANSAC pairs find true lines even when a connected green spike distorts the hull.
  let seed=0x9e3779b9;const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for(let i=0;i<900;i++){const a=contour[next()%contour.length],b=contour[next()%contour.length];if(Math.hypot(a[0]-b[0],a[1]-b[1])<minSpan)continue;const line=lineFromPair(a,b,cx,cy);if(line)proposals.push(line);}
  const candidates:Line[]=[];
  for(const proposal of proposals){const fitted=scoreLine(proposal,contour,interior,tolerance,minSpan);if(!fitted)continue;
    const existing=candidates.find(c=>c.nx*fitted.nx+c.ny*fitted.ny>.992&&Math.abs(c.d-fitted.d)<tolerance*3);
    if(existing){if(fitted.score>existing.score)Object.assign(existing,fitted);}else candidates.push(fitted);
  }
  const chosen:Line[]=[];
  for(const line of candidates.sort((a,b)=>b.score-a.score)){
    if(chosen.some(other=>line.nx*other.nx+line.ny*other.ny>.85))continue;
    chosen.push(line);if(chosen.length===4)break;
  }
  if(chosen.length<4)return null;
  chosen.sort((a,b)=>Math.atan2(a.ny,a.nx)-Math.atan2(b.ny,b.nx));
  const vertices=chosen.map((line,i)=>intersectLines(chosen[(i+3)%4],line));if(vertices.some(v=>!v))return null;
  const v=vertices as Point[];
  const mids=chosen.map((_,i)=>(v[i][1]+v[(i+1)%4][1])/2),t=mids.indexOf(Math.min(...mids));
  const start=v[t],end=v[(t+1)%4];
  const ordered=start[0]<=end[0]?[start,end,v[(t+2)%4],v[(t+3)%4]]:[end,start,v[(t+3)%4],v[(t+2)%4]];
  const perspective:Perspective={tl:[ordered[0][0]/w,ordered[0][1]/h],tr:[ordered[1][0]/w,ordered[1][1]/h],br:[ordered[2][0]/w,ordered[2][1]/h],bl:[ordered[3][0]/w,ordered[3][1]/h]};
  const visibleBounds:[number,number,number,number]=[minX/w,minY/h,maxX/w,maxY/h];
  const visibleArea=area/(w*h),reason=validatePerspective(perspective,visibleBounds,visibleArea);
  let outside=0,checked=0;for(let i=0;i<boundary.length;i+=Math.max(1,Math.floor(boundary.length/300))){const [x,y]=boundary[i],p:[number,number]=[x/w,y/h];checked++;if([perspective.tl,perspective.tr,perspective.br,perspective.bl].some((a,j,poly)=>cross(a,poly[(j+1)%4],p)<-.003))outside++;}
  const confident=!reason&&chosen.every(line=>line.support>.025&&line.span>minSpan)&&outside/checked<.05;
  return {perspective,visibleBounds,visibleArea,confident,reason:reason??(confident?undefined:'The visible screen does not define four reliable straight edges.')};
}

export async function estimateScreenPerspective(screen:Screen):Promise<Estimate|null>{
  if(!screen.mask)return null;
  const blob=typeof screen.mask==='string'?await(await fetch(screen.mask)).blob():screen.mask;
  const bitmap=await createImageBitmap(blob);const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx){bitmap.close();throw Error('Canvas is unavailable.');}
  ctx.drawImage(bitmap,0,0);bitmap.close();return estimatePerspectiveFromAlpha(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height,4);
}

export async function upgradeTemplatePerspective(template:Template):Promise<Template>{
  if(template.screens.every(screen=>screen.type!=='mask'||screen.perspective))return template;
  const screens=await Promise.all(template.screens.map(async screen=>{
    if(screen.type!=='mask'||screen.perspective)return screen;
    const result=await estimateScreenPerspective(screen);
    const fallback:Perspective={tl:screen.corners.topLeft,tr:screen.corners.topRight,br:screen.corners.bottomRight,bl:screen.corners.bottomLeft};
    return {...screen,perspective:result?.perspective??fallback,visibleBounds:result?.visibleBounds,visibleArea:result?.visibleArea,perspectiveStatus:result?.confident?'auto':'needs-adjustment'} as Screen;
  }));
  return {...template,screens};
}
