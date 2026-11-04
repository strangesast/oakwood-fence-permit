(function(root){
const defaults={east:81.5,north:41.5,em:'6',nm:'6',et:40,nt:20,rails6:3,rails4:2,spacing:8,width:5.5,gap:0,diameter:12,depth:48,gravel:6,post:3.5,yield:.6,waste:10};
const up=n=>Math.max(0,Math.ceil(n-1e-9));
function calculate(raw){const v={...defaults,...raw},errors=[];for(const k of Object.keys(defaults).filter(k=>!['em','nm'].includes(k)))if(!Number.isFinite(v[k]))errors.push('Enter a number for every setting.');
for(const k of ['east','north','gap','gravel','waste','et','nt'])if(v[k]<0)errors.push('Lengths, transition distances, gaps, gravel and waste cannot be negative.');
for(const k of ['spacing','width','diameter','depth','post','yield'])if(v[k]<=0)errors.push('Spacing, sizes, hole depth and bag yield must be greater than zero.');
if(v.spacing<0.5)errors.push('Maximum post spacing must be at least 0.5 ft.');
if(v.east>101.5||v.north>61.5)errors.push('The east boundary is 101.5 ft and the north boundary is 61.5 ft; keep the fence within these lengths.');
if(!['6','4','split'].includes(v.em)||!['6','4','split'].includes(v.nm))errors.push('Choose all 6 ft, all 4 ft, or a transition.');
for(const k of ['rails6','rails4'])if(!Number.isInteger(v[k])||v[k]<1||v[k]>20)errors.push('Rails per bay must be a whole number from 1 to 20.');
if(v.gravel>=v.depth)errors.push('Gravel must be shallower than the hole.');if(v.diameter<=Math.SQRT2*v.post)errors.push('Hole diameter must exceed the diagonal of the square post.');if(v.waste>100)errors.push('Waste allowance must not exceed 100%.');
if(errors.length)return {errors:[...new Set(errors)]};
const factor=1+v.waste/100,embed=(v.depth-v.gravel)/12,byPicket={},byPost={},byRail={};const add=(map,k,q)=>map[k]=(map[k]||0)+q;
const runs=[{key:'east',name:'East',length:v.east,mode:v.em,transition:v.et,maxLength:101.5},{key:'north',name:'North',length:v.north,mode:v.nm,transition:v.nt,maxLength:61.5}].filter(r=>r.length>0);
for(const r of runs){r.sixLength=r.mode==='6'?r.length:r.mode==='4'?0:Math.min(r.length,r.transition);r.segments=[];if(r.sixLength>0)r.segments.push({start:0,length:r.sixLength,height:6});if(r.sixLength<r.length)r.segments.push({start:r.sixLength,length:r.length-r.sixLength,height:4});r.posts=[];r.bays=0;r.pickets=0;r.railPieces=0;r.picketScrews=0;
for(let i=0;i<r.segments.length;i++){const s=r.segments[i];s.bays=Math.max(1,up(s.length/v.spacing));s.bayLength=s.length/s.bays;s.rails=s.height===6?v.rails6:v.rails4;s.pickets=Math.max(1,up((s.length*12+v.gap)/(v.width+v.gap)));s.railPieces=s.bays*s.rails;s.railStock=Math.max(2,up(s.bayLength/2)*2);add(byPicket,s.height,s.pickets);add(byRail,s.railStock,s.railPieces);r.bays+=s.bays;r.pickets+=s.pickets;r.railPieces+=s.railPieces;r.picketScrews+=s.pickets*2*s.rails;
for(let j=1;j<=s.bays;j++){const height=j===s.bays&&r.segments[i+1]?Math.max(s.height,r.segments[i+1].height):s.height,stock=up((height+embed)/2)*2;r.posts.push({distance:s.start+j*s.bayLength,height,stock,isTransition:j===s.bays&&!!r.segments[i+1]});add(byPost,stock,1);}}
}
const cornerHeight=runs.length?Math.max(...runs.map(r=>r.segments[0].height)):0;if(cornerHeight)add(byPost,up((cornerHeight+embed)/2)*2,1);
const bays=runs.reduce((a,r)=>a+r.bays,0),posts=bays+(runs.length?1:0),concretePer=(Math.PI*(v.diameter/24)**2-(v.post/12)**2)*embed,concrete=concretePer*posts,gravel=posts*Math.PI*(v.diameter/24)**2*v.gravel/12;
const buy=groups=>Object.entries(groups).sort((a,b)=>a[0]-b[0]).map(([length,qty])=>({length:+length,qty,buy:up(qty*factor)}));
return {errors:[],runs,posts,bays,cornerHeight,embed,concretePer,concrete,gravel,bags:up(concrete*factor/v.yield),bagsNoWaste:up(concrete/v.yield),gravelBuy:gravel*factor,pickets:buy(byPicket),postGroups:buy(byPost),railGroups:buy(byRail),picketScrews:up(runs.reduce((a,r)=>a+r.picketScrews,0)*factor),railScrews:up(runs.reduce((a,r)=>a+r.railPieces*4,0)*factor),total:runs.reduce((a,r)=>a+r.length,0)};
}
root.FenceCalc={defaults,calculate};if(typeof module!=='undefined')module.exports=root.FenceCalc;
})(typeof window!=='undefined'?window:globalThis);
