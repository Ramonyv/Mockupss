import type {Assignment,Point,Screen,ScreenAsset,Template} from '../types';
import {validatePerspective} from './perspective';

export type RenderOptions={template:Template;assets:Record<string,ScreenAsset>;assignments:Record<string,Assignment>;outputWidth:number;outputHeight:number;background?:string;original?:boolean;allowUncertainPerspective?:boolean;onProgress?:(n:number)=>void};

const vertex=`attribute vec2 position;void main(){gl_Position=vec4(position,0.,1.);}`;
const fragment=`precision highp float;
uniform sampler2D photo;uniform vec3 hu,hv,hd;uniform vec2 tileOrigin,tileSize;
uniform vec2 cropSize,offset;uniform float rotation,rounded;
void main(){
  vec2 p=vec2(tileOrigin.x+gl_FragCoord.x,tileOrigin.y+tileSize.y-gl_FragCoord.y);
  float w=dot(hd,vec3(p,1.));
  vec2 q=vec2(dot(hu,vec3(p,1.)),dot(hv,vec3(p,1.)))/w;
  if(q.x<0.||q.y<0.||q.x>1.||q.y>1.) discard;
  if(rounded>0.){vec2 d=max(abs(q-.5)-vec2(.5-rounded),0.);if(length(d)>rounded)discard;}
  vec2 uv=(q-.5)*cropSize;
  float c=cos(rotation),s=sin(rotation);
  uv=vec2(c*uv.x-s*uv.y,s*uv.x+c*uv.y)+.5+offset;
  if(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.){gl_FragColor=vec4(.96,.96,.96,1.);return;}
  gl_FragColor=texture2D(photo,uv);
}`;

function solve(a:number[][],b:number[]){const n=b.length;for(let i=0;i<n;i++){let k=i;for(let j=i+1;j<n;j++)if(Math.abs(a[j][i])>Math.abs(a[k][i]))k=j;[a[i],a[k]]=[a[k],a[i]];[b[i],b[k]]=[b[k],b[i]];if(Math.abs(a[i][i])<1e-9)throw Error('Screen corners are invalid.');const v=a[i][i];for(let c=i;c<n;c++)a[i][c]/=v;b[i]/=v;for(let r=0;r<n;r++)if(r!==i){const f=a[r][i];for(let c=i;c<n;c++)a[r][c]-=f*a[i][c];b[r]-=f*b[i];}}return b;}
export function homography(points:Point[]){const a:number[][]=[],b:number[]=[];const dest:[[number,number],[number,number],[number,number],[number,number]]=[[0,0],[1,0],[1,1],[0,1]];points.forEach(([x,y],i)=>{const [u,v]=dest[i];a.push([x,y,1,0,0,0,-u*x,-u*y]);b.push(u);a.push([0,0,0,x,y,1,-v*x,-v*y]);b.push(v);});const h=solve(a,b);return {u:[h[0],h[1],h[2]],v:[h[3],h[4],h[5]],d:[h[6],h[7],1]};}
export function screenPoints(screen:Screen,width:number,height:number,referenceWidth=width):Point[]{const c=screen.corners;const pts=[c.topLeft,c.topRight,c.bottomRight,c.bottomLeft].map(([x,y])=>[x*width,y*height] as Point);const bleed=(screen.screenBleed??2)*width/referenceWidth;if(!bleed)return pts;const cx=pts.reduce((a,p)=>a+p[0],0)/4,cy=pts.reduce((a,p)=>a+p[1],0)/4;return pts.map(([x,y])=>{const dx=x-cx,dy=y-cy,l=Math.hypot(dx,dy)||1;return [x+dx/l*bleed,y+dy/l*bleed] as Point;});}
export function perspectivePoints(screen:Screen,width:number,height:number,referenceWidth=width):Point[]{
  if(screen.perspective){const p=screen.perspective;return [p.tl,p.tr,p.br,p.bl].map(([x,y])=>[x*width,y*height] as Point);}
  return screenPoints(screen,width,height,referenceWidth);
}
function compile(gl:WebGLRenderingContext,type:number,source:string){const s=gl.createShader(type)!;gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s)||'Shader failed');return s;}
async function bitmap(src:string|Blob){const blob=typeof src==='string'?await (await fetch(src)).blob():src;return createImageBitmap(blob,{imageOrientation:'from-image'});}
function context(w:number,h:number){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)throw Error('Canvas is unavailable.');return {canvas,ctx};}
function texture(gl:WebGLRenderingContext,img:ImageBitmap){const t=gl.createTexture()!;gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);return t;}


export async function renderMockup({template,assets,assignments,outputWidth,outputHeight,background,original,allowUncertainPerspective,onProgress}:RenderOptions):Promise<HTMLCanvasElement>{
  const {canvas,ctx}=context(outputWidth,outputHeight);
  if(background&&background!=='original'){ctx.fillStyle=background;ctx.fillRect(0,0,outputWidth,outputHeight);}
  const master=await bitmap(template.masterImage);ctx.drawImage(master,0,0,outputWidth,outputHeight);master.close();onProgress?.(.12);
  if(original)return canvas;
  const glCanvas=document.createElement('canvas');const gl=glCanvas.getContext('webgl',{alpha:true,premultipliedAlpha:false,preserveDrawingBuffer:true});if(!gl)throw Error('WebGL is required for perspective mapping.');
  const program=gl.createProgram()!;const vs=compile(gl,gl.VERTEX_SHADER,vertex),fs=compile(gl,gl.FRAGMENT_SHADER,fragment);gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Perspective renderer could not start.');gl.useProgram(program);
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);const pos=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
  const vec3=(name:string,v:number[])=>gl.uniform3fv(gl.getUniformLocation(program,name),v);
  const vec2=(name:string,v:number[])=>gl.uniform2fv(gl.getUniformLocation(program,name),v);
  const number=(name:string,v:number)=>gl.uniform1f(gl.getUniformLocation(program,name),v);
  const tileLimit=Math.min(2048,gl.getParameter(gl.MAX_TEXTURE_SIZE));
  try{
    for(let si=0;si<template.screens.length;si++){
      const screen=template.screens[si],assignment=assignments[screen.id],asset=assignment&&assets[assignment.assetId];if(!asset)continue;
      if(screen.type==='mask'&&!allowUncertainPerspective&&(!screen.perspective||screen.perspectiveStatus==='needs-adjustment'))throw Error(`${screen.label}: perspective needs adjustment in Template Builder.`);
      if(screen.perspective){const issue=validatePerspective(screen.perspective,screen.visibleBounds,screen.visibleArea);if(issue)throw Error(`${screen.label}: ${issue}`);}
      const img=await bitmap(asset.blob),tex=texture(gl,img);const points=perspectivePoints(screen,outputWidth,outputHeight,template.width),h=homography(points);vec3('hu',h.u);vec3('hv',h.v);vec3('hd',h.d);
      const top=Math.hypot(points[1][0]-points[0][0],points[1][1]-points[0][1]);const bottom=Math.hypot(points[2][0]-points[3][0],points[2][1]-points[3][1]);const left=Math.hypot(points[3][0]-points[0][0],points[3][1]-points[0][1]);const right=Math.hypot(points[2][0]-points[1][0],points[2][1]-points[1][1]);const targetAspect=((top+bottom)/2)/((left+right)/2);const srcAspect=img.width/img.height;const fit=assignment.transform.fit;let cw=1,ch=1;if(fit==='cover'){if(srcAspect>targetAspect)cw=targetAspect/srcAspect;else ch=srcAspect/targetAspect;}else{if(srcAspect>targetAspect)ch=targetAspect/srcAspect;else cw=srcAspect/targetAspect;cw=1/cw;ch=1/ch;}
      const scale=assignment.transform.scale||1;vec2('cropSize',[cw/scale,ch/scale]);vec2('offset',[assignment.transform.x*(1-cw/scale)*.5,assignment.transform.y*(1-ch/scale)*.5]);number('rotation',assignment.transform.rotation*Math.PI/180);number('rounded',screen.type==='rounded'?(screen.cornerRadius??.04):0);
      const layer=screen.mask?context(outputWidth,outputHeight):null;const target=layer?.ctx??ctx;
      for(let y=0;y<outputHeight;y+=tileLimit)for(let x=0;x<outputWidth;x+=tileLimit){const tw=Math.min(tileLimit,outputWidth-x),th=Math.min(tileLimit,outputHeight-y);glCanvas.width=tw;glCanvas.height=th;gl.viewport(0,0,tw,th);gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);gl.bindTexture(gl.TEXTURE_2D,tex);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);vec2('tileOrigin',[x,y]);vec2('tileSize',[tw,th]);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);target.drawImage(glCanvas,x,y);}
      if(screen.mask&&layer){const mask=await bitmap(screen.mask);layer.ctx.globalCompositeOperation='destination-in';layer.ctx.drawImage(mask,0,0,outputWidth,outputHeight);layer.ctx.globalCompositeOperation='source-over';mask.close();ctx.drawImage(layer.canvas,0,0);}
      gl.deleteTexture(tex);img.close();onProgress?.(.12+.72*(si+1)/template.screens.length);await new Promise(r=>setTimeout(r,0));
    }
  }finally{gl.deleteBuffer(buffer);gl.deleteShader(vs);gl.deleteShader(fs);gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext();}
  if(template.foregroundLayer){const fg=await bitmap(template.foregroundLayer);ctx.drawImage(fg,0,0,outputWidth,outputHeight);fg.close();}
  onProgress?.(1);return canvas;
}
export function canvasBlob(canvas:HTMLCanvasElement,type:string,quality?:number){return new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('This format is not supported by your browser.')),type,quality));}
export function validateScreen(s:Screen){const p=[s.corners.topLeft,s.corners.topRight,s.corners.bottomRight,s.corners.bottomLeft];if(p.some(([x,y])=>x<0||y<0||x>1||y>1))return 'Corners must stay inside the image.';let area=0;for(let i=0;i<4;i++){const a=p[i],b=p[(i+1)%4];area+=a[0]*b[1]-b[0]*a[1];}if(Math.abs(area)<.0001)return 'Screen area is too small.';const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);const signs=p.map((_,i)=>cross(p[i],p[(i+1)%4],p[(i+2)%4]));if(signs.some(v=>v*signs[0]<0))return 'Screen corners cross each other.';return null;}
