/** Fill transparent screenshot pixels with a background sampled from its opaque edges. */
export function makeScreenshotOpaque(data:Uint8ClampedArray,width:number,height:number):boolean{
  let transparent=false;for(let i=3;i<data.length;i+=4)if(data[i]<255){transparent=true;break;}
  if(!transparent)return false;
  const samples:[number[],number[],number[]]=[[],[],[]],step=Math.max(1,Math.floor(Math.min(width,height)/150)),band=Math.max(4,Math.round(Math.min(width,height)*.06));
  for(let y=0;y<height;y+=step)for(let x=0;x<width;x+=step){
    if(x>=band&&y>=band&&x<width-band&&y<height-band)continue;
    const i=(y*width+x)*4;if(data[i+3]<245)continue;
    for(let c=0;c<3;c++)samples[c].push(data[i+c]);
  }
  const background=samples.map(channel=>channel.length?channel.sort((a,b)=>a-b)[Math.floor(channel.length/2)]:24);
  for(let i=0;i<data.length;i+=4){const alpha=data[i+3];if(alpha===255)continue;
    for(let c=0;c<3;c++)data[i+c]=Math.round((data[i+c]*alpha+background[c]*(255-alpha))/255);
    data[i+3]=255;
  }
  return true;
}
