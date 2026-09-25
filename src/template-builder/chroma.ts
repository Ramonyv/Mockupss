import type {Corners,Point,Screen} from '../types';
import {validateScreen} from '../renderer/render';

type Region={pixels:Int32Array;corners:Corners;area:number;bounds:[number,number,number,number]};
type RawRegion={pixels:Int32Array;area:number;minX:number;minY:number;maxX:number;maxY:number};

const neighbors=(p:number,w:number,h:number,visit:(q:number)=>void)=>{const x=p%w,y=Math.floor(p/w);if(x>0)visit(p-1);if(x<w-1)visit(p+1);if(y>0)visit(p-w);if(y<h-1)visit(p+w);};

type Line={slope:number;intercept:number};
const median=(values:number[])=>{const sorted=values.slice().sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)]??0;};
function fitBoundary(samples:Point[]):Line|null{
  if(samples.length<8)return null;
  const step=Math.max(1,Math.floor(samples.length/44)),picked=samples.filter((_,i)=>i%step===0),slopes:number[]=[];
  for(let i=0;i<picked.length;i++)for(let j=i+1;j<picked.length;j++){const dx=picked[j][0]-picked[i][0];if(Math.abs(dx)>2)slopes.push((picked[j][1]-picked[i][1])/dx);}
  if(!slopes.length)return null;
  let slope=median(slopes),intercept=median(samples.map(([x,y])=>y-slope*x));
  for(let pass=0;pass<3;pass++){
    const residuals=samples.map(([x,y])=>Math.abs(y-slope*x-intercept)),limit=Math.max(2.5,median(residuals)*2.8),good=samples.filter((_,i)=>residuals[i]<=limit);
    if(good.length<8)break;
    const n=good.length,meanX=good.reduce((sum,p)=>sum+p[0],0)/n,meanY=good.reduce((sum,p)=>sum+p[1],0)/n;
    const numerator=good.reduce((sum,[x,y])=>sum+(x-meanX)*(y-meanY),0),denominator=good.reduce((sum,[x])=>sum+(x-meanX)**2,0);
    if(denominator<1)break;slope=numerator/denominator;intercept=meanY-slope*meanX;
  }
  return {slope,intercept};
}
function contourFallback(points:Int32Array,w:number,h:number,bounds:[number,number,number,number]):Corners{
  const [minX,minY,maxX,maxY]=bounds;
  const rectangle=():Corners=>({topLeft:[Math.max(0,minX-3)/w,Math.max(0,minY-3)/h],topRight:[Math.min(w,maxX+4)/w,Math.max(0,minY-3)/h],bottomRight:[Math.min(w,maxX+4)/w,Math.min(h,maxY+4)/h],bottomLeft:[Math.max(0,minX-3)/w,Math.min(h,maxY+4)/h]});
  let tl:Point=[minX,minY],tr:Point=[maxX,minY],br:Point=[maxX,maxY],bl:Point=[minX,maxY];let tlScore=Infinity,trScore=-Infinity,brScore=-Infinity,blScore=Infinity;
  for(const p of points){const x=p%w,y=Math.floor(p/w),sum=x+y,diff=x-y;if(sum<tlScore){tlScore=sum;tl=[x,y];}if(diff>trScore){trScore=diff;tr=[x,y];}if(sum>brScore){brScore=sum;br=[x,y];}if(diff<blScore){blScore=diff;bl=[x,y];}}
  const rough=[tl,tr,br,bl],lines:{a:Point;b:Point}[]=[];
  for(let i=0;i<4;i++){const a=rough[i],b=rough[(i+1)%4],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);if(len<2)return rectangle();const nx=-dy/len,ny=dx/len;let minDistance=Infinity;for(const p of points){const x=p%w,y=Math.floor(p/w);minDistance=Math.min(minDistance,(x-a[0])*nx+(y-a[1])*ny);}const shift=Math.max(0,2-minDistance);lines.push({a:[a[0]-nx*shift,a[1]-ny*shift],b:[b[0]-nx*shift,b[1]-ny*shift]});}
  const intersection=(a:Point,b:Point,c:Point,d:Point):Point|null=>{const rx=b[0]-a[0],ry=b[1]-a[1],sx=d[0]-c[0],sy=d[1]-c[1],den=rx*sy-ry*sx;if(Math.abs(den)<1e-5)return null;const t=((c[0]-a[0])*sy-(c[1]-a[1])*sx)/den;return [a[0]+t*rx,a[1]+t*ry];};
  const quad:Point[]=[];for(let i=0;i<4;i++){const prev=lines[(i+3)%4],next=lines[i],p=intersection(prev.a,prev.b,next.a,next.b);if(!p)return rectangle();quad.push(p);}
  const padX=Math.max(6,(maxX-minX)*.15),padY=Math.max(6,(maxY-minY)*.15);if(quad.some(([x,y])=>x<minX-padX||x>maxX+padX||y<minY-padY||y>maxY+padY))return rectangle();
  const c=quad.map(([x,y])=>[Math.max(0,Math.min(1,x/w)),Math.max(0,Math.min(1,y/h))] as Point),corners={topLeft:c[0],topRight:c[1],bottomRight:c[2],bottomLeft:c[3]};return validateScreen({id:'fallback',label:'fallback',type:'quad',fit:'cover',corners})?rectangle():corners;
}
function enclosingQuad(points:Int32Array,w:number,h:number,bounds:[number,number,number,number]):Corners{
  const [minX,minY,maxX,maxY]=bounds,bw=maxX-minX+1,bh=maxY-minY+1;
  const fallback=()=>contourFallback(points,w,h,bounds);
  const rowMin=new Int32Array(h).fill(w),rowMax=new Int32Array(h).fill(-1),colMin=new Int32Array(w).fill(h),colMax=new Int32Array(w).fill(-1);
  for(const p of points){const x=p%w,y=Math.floor(p/w);rowMin[y]=Math.min(rowMin[y],x);rowMax[y]=Math.max(rowMax[y],x);colMin[x]=Math.min(colMin[x],y);colMax[x]=Math.max(colMax[x],y);}
  const left:Point[]=[],right:Point[]=[],top:Point[]=[],bottom:Point[]=[];
  for(let y=minY;y<=maxY;y++)if(y>minY+bh*.11&&y<maxY-bh*.11&&rowMax[y]-rowMin[y]>bw*.38){left.push([y,rowMin[y]]);right.push([y,rowMax[y]]);}
  for(let x=minX;x<=maxX;x++)if(x>minX+bw*.11&&x<maxX-bw*.11&&colMax[x]-colMin[x]>bh*.38){top.push([x,colMin[x]]);bottom.push([x,colMax[x]]);}
  const l=fitBoundary(left),r=fitBoundary(right),t=fitBoundary(top),b=fitBoundary(bottom);if(!l||!r||!t||!b)return fallback();
  let lShift=0,rShift=0,tShift=0,bShift=0;
  for(const p of points){const x=p%w,y=Math.floor(p/w);lShift=Math.max(lShift,l.slope*y+l.intercept-x);rShift=Math.max(rShift,x-r.slope*y-r.intercept);tShift=Math.max(tShift,t.slope*x+t.intercept-y);bShift=Math.max(bShift,y-b.slope*x-b.intercept);}
  if(lShift>bw*.12||rShift>bw*.12||tShift>bh*.12||bShift>bh*.12)return fallback();
  l.intercept-=lShift+2;r.intercept+=rShift+2;t.intercept-=tShift+2;b.intercept+=bShift+2;
  const intersect=(vertical:Line,horizontal:Line):Point|null=>{const den=1-vertical.slope*horizontal.slope;if(Math.abs(den)<.01)return null;const x=(vertical.slope*horizontal.intercept+vertical.intercept)/den;return [x,horizontal.slope*x+horizontal.intercept];};
  const quad=[intersect(l,t),intersect(r,t),intersect(r,b),intersect(l,b)];if(quad.some(p=>!p))return fallback();
  const padX=Math.max(8,bw*.13),padY=Math.max(8,bh*.13);
  if(quad.some(p=>{const [x,y]=p!;return x<Math.max(0,minX-padX)||x>Math.min(w,maxX+padX)||y<Math.max(0,minY-padY)||y>Math.min(h,maxY+padY);}))return fallback();
  const normalized=quad.map(p=>[Math.max(0,Math.min(1,p![0]/w)),Math.max(0,Math.min(1,p![1]/h))] as Point);
  const corners={topLeft:normalized[0],topRight:normalized[1],bottomRight:normalized[2],bottomLeft:normalized[3]};
  const test:Screen={id:'test',label:'test',type:'quad',fit:'cover',corners};return validateScreen(test)?fallback():corners;
}

export function analyzeChroma(data:Uint8ClampedArray,w:number,h:number,tolerance=24):Region[]{
  const n=w*h,strong=new Uint8Array(n),weak=new Uint8Array(n),labels=new Int32Array(n),queue=new Int32Array(n);
  const coreDistance=45+tolerance*2.5,edgeDistance=115+tolerance*3.5;
  for(let p=0,j=0;p<n;p++,j+=4){const r=data[j],g=data[j+1],b=data[j+2],a=data[j+3];if(a<200)continue;const dominance=g-Math.max(r,b),dist=Math.hypot(r,255-g,b);if(g>140&&dominance>Math.max(45,85-tolerance)&&dist<coreDistance)strong[p]=1;if(g>30&&dominance>Math.max(6,14-tolerance*.25)&&(dist<edgeDistance||g>1.3*Math.max(r,b)))weak[p]=1;}
  const raw:RawRegion[]=[];let nextLabel=0;
  for(let p=0;p<n;p++){
    if(!strong[p]||labels[p])continue;nextLabel++;let head=0,tail=0,minX=w,minY=h,maxX=-1,maxY=-1;queue[tail++]=p;labels[p]=nextLabel;
    while(head<tail){const v=queue[head++],x=v%w,y=Math.floor(v/w);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);neighbors(v,w,h,q=>{if(strong[q]&&!labels[q]){labels[q]=nextLabel;queue[tail++]=q;}});}
    const area=tail,bw=maxX-minX+1,bh=maxY-minY+1,solidity=area/(bw*bh);
    if(area>=Math.max(120,n*.0025)&&bw>=Math.max(8,w*.018)&&bh>=Math.max(8,h*.018)&&solidity>=.16)raw.push({pixels:queue.slice(0,tail),area,minX,minY,maxX,maxY});
  }
  raw.sort((a,b)=>(a.minX+a.maxX)-(b.minX+b.maxX));
  const accepted=new Int32Array(n);raw.forEach((r,i)=>{for(const p of r.pixels)accepted[p]=i+1;});
  const result:Region[]=[];
  raw.forEach((r,i)=>{
    const id=i+1,expanded:number[]=[];let frontier=Array.from(r.pixels);
    for(const p of frontier)expanded.push(p);
    for(let step=0;step<12;step++){const next:number[]=[];for(const p of frontier)neighbors(p,w,h,q=>{if(weak[q]&&!accepted[q]){accepted[q]=id;next.push(q);expanded.push(q);}});frontier=next;if(!frontier.length)break;}
    for(let y=r.minY;y<=r.maxY;y++)for(let x=r.minX;x<=r.maxX;x++){const p=y*w+x;if(accepted[p])continue;const j=p*4,r0=data[j],g0=data[j+1],b0=data[j+2];if(g0>35&&g0-Math.max(r0,b0)>8){accepted[p]=id;expanded.push(p);}}
    let minX=w,minY=h,maxX=-1,maxY=-1;for(const p of expanded){const x=p%w,y=Math.floor(p/w);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
    for(let pass=0;pass<2;pass++)for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){const p=y*w+x;if(accepted[p])continue;const j=p*4,r0=data[j],g0=data[j+1],b0=data[j+2];if(g0>35&&g0-Math.max(r0,b0)>8){accepted[p]=id;expanded.push(p);}}
    const pixels=Int32Array.from(expanded),bounds:[number,number,number,number]=[minX,minY,maxX,maxY];
    result.push({pixels,corners:enclosingQuad(pixels,w,h,bounds),area:pixels.length,bounds});
  });
  return result;
}

const canvasBlob=(canvas:HTMLCanvasElement)=>new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Could not create screen mask.')),'image/png'));

export async function detectGreenScreens(master:Blob,tolerance=24):Promise<Screen[]>{
  const image=await createImageBitmap(master,{imageOrientation:'from-image'});const scale=Math.min(1,2600/Math.max(image.width,image.height));const w=Math.max(1,Math.round(image.width*scale)),h=Math.max(1,Math.round(image.height*scale));
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx){image.close();throw Error('Canvas is unavailable for detection.');}ctx.drawImage(image,0,0,w,h);image.close();
  const pixels=ctx.getImageData(0,0,w,h);const regions=analyzeChroma(pixels.data,w,h,tolerance);const screens:Screen[]=[];
  for(let i=0;i<regions.length;i++){
    const region=regions[i],mask=document.createElement('canvas'),outline=document.createElement('canvas');mask.width=w;mask.height=h;outline.width=w;outline.height=h;const mctx=mask.getContext('2d')!,octx=outline.getContext('2d')!,alpha=mctx.createImageData(w,h),edge=octx.createImageData(w,h),flags=new Uint8Array(w*h);let cx=0,cy=0;
    for(const p of region.pixels){flags[p]=1;cx+=p%w;cy+=Math.floor(p/w);const j=p*4;alpha.data[j]=255;alpha.data[j+1]=255;alpha.data[j+2]=255;alpha.data[j+3]=255;}
    const outside=new Uint8Array(w*h),queue=new Int32Array(w*h);let head=0,tail=0;const seed=(p:number)=>{if(!flags[p]&&!outside[p]){outside[p]=1;queue[tail++]=p;}};
    for(let x=0;x<w;x++){seed(x);seed((h-1)*w+x);}for(let y=1;y<h-1;y++){seed(y*w);seed(y*w+w-1);}
    while(head<tail){const p=queue[head++];neighbors(p,w,h,q=>{if(!flags[q]&&!outside[q]){outside[q]=1;queue[tail++]=q;}});}
    for(const p of region.pixels){const x=p%w,y=Math.floor(p/w);if(x>0&&x<w-1&&y>0&&y<h-1&&!outside[p-1]&&!outside[p+1]&&!outside[p-w]&&!outside[p+w])continue;const j=p*4;edge.data[j]=239;edge.data[j+1]=255;edge.data[j+2]=234;edge.data[j+3]=210;}
    mctx.putImageData(alpha,0,0);octx.putImageData(edge,0,0);
    screens.push({id:crypto.randomUUID(),label:`Screen ${i+1}`,type:'mask',corners:region.corners,fit:'cover',screenBleed:0,mask:await canvasBlob(mask),outline:await canvasBlob(outline),labelPoint:[cx/region.pixels.length/w,cy/region.pixels.length/h],geometryVersion:2});
  }
  return screens;
}
