/** One lightweight SVG path per visible scene, no canvas/player instances. */
export function waveformSvgPath(peaks){
 if(!Array.isArray(peaks)||peaks.length===0||peaks.length>512||peaks.some(x=>typeof x!=='number'||!Number.isFinite(x)||x<0||x>1))return '';
 const width=100/peaks.length;
 return peaks.map((value,index)=>{
  const x=Math.round((index+.5)*width*100)/100;
  const amplitude=Math.max(.4,value*15);
  return `M${x},${(17-amplitude).toFixed(2)}V${(17+amplitude).toFixed(2)}`;
 }).join(' ');
}
