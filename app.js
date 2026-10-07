const API="https://api.binance.com";
let interval="4h";

const $=id=>document.getElementById(id);
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  b.classList.add("active"); interval=b.dataset.i; scan();
});
$("scan").onclick=scan;

function num(v){const n=Number(v);return Number.isFinite(n)?n:null}
function ema(a,p){if(a.length<p)return null;const k=2/(p+1);let e=a.slice(0,p).reduce((x,y)=>x+y,0)/p;for(let i=p;i<a.length;i++)e=a[i]*k+e*(1-k);return e}
function sma(a,p){return a.length<p?null:a.slice(-p).reduce((x,y)=>x+y,0)/p}
function pstdev(a){const m=a.reduce((x,y)=>x+y,0)/a.length;return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/a.length)}
function bbWidth(a,p=20){if(a.length<p)return null;const w=a.slice(-p),m=w.reduce((x,y)=>x+y,0)/p;return m?4*pstdev(w)/m:0}

function adx(h,l,c,p=14){
 if(c.length<p*2+2)return null;
 const tr=[],pl=[],mi=[];
 for(let i=1;i<c.length;i++){
   tr.push(Math.max(h[i]-l[i],Math.abs(h[i]-c[i-1]),Math.abs(l[i]-c[i-1])));
   const up=h[i]-h[i-1],dn=l[i-1]-l[i];
   pl.push(up>dn&&up>0?up:0); mi.push(dn>up&&dn>0?dn:0);
 }
 const dx=[];
 for(let i=p;i<tr.length;i++){
   const atr=tr.slice(i-p,i).reduce((x,y)=>x+y,0)/p;if(!atr)continue;
   const pi=100*(pl.slice(i-p,i).reduce((x,y)=>x+y,0)/p)/atr;
   const ni=100*(mi.slice(i-p,i).reduce((x,y)=>x+y,0)/p)/atr;
   const den=pi+ni;dx.push(den?100*Math.abs(pi-ni)/den:0);
 }
 return dx.length>=p?dx.slice(-p).reduce((x,y)=>x+y,0)/p:null;
}

function sidewayScore(c,h,l){
 if(c.length<30)return 0;
 const hi=Math.max(...h.slice(-30)),lo=Math.min(...l.slice(-30)),mid=(hi+lo)/2;
 const width=mid?(hi-lo)/mid:1;
 const slope=c[29]?(Math.abs(c.at(-1)-c.at(-30))/c.at(-30)):1;
 const av=adx(h,l,c)||50,bw=bbWidth(c)||1;
 const a=Math.max(0,Math.min(45,45*(1-width/.18)));
 const b=Math.max(0,Math.min(25,25*(1-slope/.12)));
 const d=Math.max(0,Math.min(20,20*(1-Math.max(0,av-12)/28)));
 const e=Math.max(0,Math.min(10,10*(1-bw/.20)));
 return Math.max(0,Math.min(100,Math.round(a+b+d+e)));
}

async function analyze(symbol){
 const r=await fetch(`${API}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=160`);
 if(!r.ok)throw new Error(`Kline ${r.status}`);
 const raw=await r.json(); if(!Array.isArray(raw)||raw.length<60)throw new Error("Kline");
 const h=[],l=[],c=[],v=[];
 for(const x of raw){h.push(num(x[2]));l.push(num(x[3]));c.push(num(x[4]));v.push(num(x[5]))}
 if([h,l,c,v].some(a=>a.some(x=>x===null)))throw new Error("Parse");

 const e7=ema(c,7),e25=ema(c,25),e99=ema(c,99),av=adx(h,l,c),bw=bbWidth(c);
 const res=Math.max(...h.slice(-21,-1)),sup=Math.min(...l.slice(-21,-1)),cur=c.at(-1);
 const side=sidewayScore(c,h,l),vb=sma(v.slice(0,-1),20)||0,vr=vb?v.at(-1)/vb:0;
 let pre=0;
 if(e25&&cur>e25)pre+=25;if(e7&&e25&&e7>e25)pre+=20;
 const ratio=cur/res;
 if(ratio>=.985)pre+=20;else if(ratio>=.97)pre+=12;
 if(vr>=1.2)pre+=20;else if(vr>=.9)pre+=10;
 if(av!==null&&av<25)pre+=10;pre=Math.min(100,pre);
 let br=0;
 if(cur>res)br+=60;else if(cur>=res*.995)br+=35;
 if(vr>=1.5)br+=25;else if(vr>=1.2)br+=15;
 if(e7&&e25&&cur>e7&&e7>e25)br+=15;br=Math.min(100,br);
 const radar=Math.round(.40*side+.35*pre+.25*br);
 return {symbol,radar,sideway:side,pre,breakout:br,support:sup,resistance:res,ema7:e7,ema25:e25,ema99:e99,adx:av,bb_width:bw,volume_ratio:vr};
}

async function scan(){
 $("status").textContent="Đang lấy Top 100 Binance…";
 $("opps").innerHTML=$("top").innerHTML=$("breaks").innerHTML="";
 try{
   const r=await fetch(`${API}/api/v3/ticker/24hr`);if(!r.ok)throw Error("Binance ticker "+r.status);
   const all=await r.json();
   const pairs=all.filter(x=>x.symbol.endsWith("USDT")&&!/(UP|DOWN|BULL|BEAR)USDT$/.test(x.symbol)&&num(x.quoteVolume)!==null)
     .sort((a,b)=>num(b.quoteVolume)-num(a.quoteVolume)).slice(0,100);
   const results=[], errors=[];
   let done=0;
   const queue=[...pairs];
   const worker=async()=>{while(queue.length){const t=queue.shift();try{results.push(await analyze(t.symbol))}catch(e){errors.push(t.symbol)}done++;$("status").textContent=`Đang quét ${done}/100…`}};
   await Promise.all(Array.from({length:8},worker));
   results.sort((a,b)=>b.radar-a.radar);
   const opp=results.filter(x=>x.sideway>=75&&x.pre>=75&&x.breakout<80);
   const br=results.filter(x=>x.breakout>=80);
   $("status").textContent=`${results.length}/100 mã • ${errors.length} lỗi • ${interval.toUpperCase()}`;
   $("opps").innerHTML=opp.length?opp.map(card).join(""):`<div class="empty">Chưa có mã đạt đủ 3 điều kiện.</div>`;
   $("top").innerHTML=results.slice(0,20).map(card).join("")||`<div class="empty">Không có dữ liệu.</div>`;
   $("breaks").innerHTML=br.slice(0,20).map(card).join("")||`<div class="empty">Chưa có breakout mạnh.</div>`;
 }catch(e){$("status").textContent="Lỗi: "+e.message;$("opps").innerHTML=`<div class="empty">Không kết nối được Binance. Kiểm tra Internet.</div>`}
}

function scoreClass(v){return v>=80?"hot":v>=65?"warn":"good"}
function fmt(v){if(v==null)return "-";if(v>=100)return v.toFixed(2);if(v>=1)return v.toFixed(4);return v.toPrecision(6)}
function card(x){return `<div class="card" onclick='show(${JSON.stringify(x)})'>
 <div class="top"><div class="sym">${x.symbol}</div><div class="radar ${scoreClass(x.radar)}">${x.radar}</div></div>
 <div class="scores">
  <div class="box"><div class="lab">SIDEWAY</div><div class="val">${x.sideway}</div></div>
  <div class="box"><div class="lab">PRE-BREAKOUT</div><div class="val">${x.pre}</div></div>
  <div class="box"><div class="lab">BREAKOUT</div><div class="val">${x.breakout}</div></div>
 </div>
 <div class="meta"><div>Hỗ trợ <b>${fmt(x.support)}</b></div><div>Kháng cự <b>${fmt(x.resistance)}</b></div></div>
 </div>`}

function m(a,b){return `<div class="metric"><span>${a}</span><b>${b??"-"}</b></div>`}
function show(x){$("detail").style.display="block";$("detailBody").innerHTML=`<h2>${x.symbol}</h2><div class="grid">
 ${m("RADAR",x.radar)}${m("SIDEWAY",x.sideway)}${m("PRE-BREAKOUT",x.pre)}${m("BREAKOUT",x.breakout)}
 ${m("SUPPORT",fmt(x.support))}${m("RESISTANCE",fmt(x.resistance))}
 ${m("EMA 7",fmt(x.ema7))}${m("EMA 25",fmt(x.ema25))}${m("EMA 99",fmt(x.ema99))}
 ${m("ADX",x.adx==null?"-":x.adx.toFixed(2))}${m("BB WIDTH",x.bb_width==null?"-":x.bb_width.toFixed(5))}${m("VOLUME RATIO",x.volume_ratio==null?"-":x.volume_ratio.toFixed(2)+"x")}
 </div>`}
function closeDetail(){$("detail").style.display="none"}

if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
scan();
