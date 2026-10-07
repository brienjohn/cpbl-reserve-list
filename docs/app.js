"use strict";
const API="https://cpbl-reserve-api.brienjohn.workers.dev";
const LIMIT=60, GN={P:"投手",C:"捕手",I:"內野手",O:"外野手"}, GEN={P:"Pitchers",C:"Catchers",I:"Infielders",O:"Outfielders"}, GORD="PCIO";
const TEAMS=[
  {code:"ACN",slug:"brothers",name:"中信兄弟",short:"兄弟",en:"CTBC Brothers",band:"#16161A",acc:"#FFC72C",on:"#16161A",ink:"#8C6500",hi:"#FFC72C"},
  {code:"ADD",slug:"lions",name:"統一7-ELEVEn獅",short:"統一獅",en:"Uni-President Lions",band:"#2B1A0E",acc:"#F28C28",on:"#1E1206",ink:"#B5530B",hi:"#F9A54C"},
  {code:"AJL",slug:"monkeys",name:"樂天桃猿",short:"桃猿",en:"Rakuten Monkeys",band:"#3D0A14",acc:"#BF0D3E",on:"#FFFFFF",ink:"#B00C39",hi:"#FF6B8B"},
  {code:"AEO",slug:"guardians",name:"富邦悍將",short:"悍將",en:"Fubon Guardians",band:"#002255",acc:"#004B90",on:"#FFFFFF",ink:"#004B90",hi:"#4FA3FF"},
  {code:"AAA",slug:"dragons",name:"味全龍",short:"味全龍",en:"Wei Chuan Dragons",band:"#5E0A12",acc:"#D7192D",on:"#FFFFFF",ink:"#C3172A",hi:"#FF7D88"},
  {code:"AKP",slug:"hawks",name:"台鋼雄鷹",short:"雄鷹",en:"TSG Hawks",band:"#0B3326",acc:"#127A55",on:"#FFFFFF",ink:"#0F6E4C",hi:"#5FD3A2"},
];
const $=id=>document.getElementById(id);
function el(tag,attrs={},...kids){const e=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k==="class")e.className=v;else if(k==="text")e.textContent=v;else e.setAttribute(k,v)}for(const k of kids)if(k!=null)e.append(k);return e}
function store(k,v){try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch(e){return null}}

let DATA=null, AVAIL=[], T=null, ROSTER=[], BY={};
let sel=new Set(), saved=null, savedAt=null, stats=null, online=false, saving=false, statsT=0;
let pos="all", st="all", q="", tab="pick";

function voterId(){
  let v=store("rl-voter");
  if(!v||!/^[0-9a-f-]{36}$/.test(v)){v=(crypto.randomUUID?crypto.randomUUID():"10000000-1000-4000-8000-100000000000".replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16)));store("rl-voter",v)}
  return v;
}
const VOTER=voterId();

function sortP(a,b){return GORD.indexOf(a.g)-GORD.indexOf(b.g)||(+a.no)-(+b.no)||a.no.length-b.no.length}
function posLabel(p){return p.p||GN[p.g]}
function keptIn(g){let n=0;for(const p of ROSTER)if(p.g===g&&sel.has(p.id))n++;return n}
function photo(p,cls){
  const b=el("span",{class:cls});
  const fail=()=>{b.classList.add("nopic");b.prepend(el("span",{class:"ph-no",text:p.no}))};
  if(p.ph){const i=el("img",{src:"photos/"+p.id+".jpg",alt:"",loading:"lazy"});i.onerror=()=>{i.remove();fail()};b.append(i)}else fail();
  return b;
}
function applyTheme(t){
  const css=`:root{--band:${t.band};--acc:${t.acc};--on-acc:${t.on};--acc-ink:${t.ink};--acc-ink-l:${t.ink};--hi:${t.hi}}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--acc-ink:${t.hi}}}
:root[data-theme="dark"]{--acc-ink:${t.hi}}`;
  $("teamTheme").textContent=css;
  document.querySelector('meta[name="theme-color"]').setAttribute("content",t.band);
}

// ---------- routing ----------
function teamFromHash(){const h=location.hash.replace("#","");return AVAIL.find(t=>t.slug===h||t.code===h)||null}
function route(){
  const t=teamFromHash();
  if(!t){if(AVAIL.length===1){location.replace("#"+AVAIL[0].slug);return}T=null;showPicker();return}
  T=t;ROSTER=DATA.teams[t.code].players;BY=Object.fromEntries(ROSTER.map(p=>[p.id,p]));
  sel=new Set();try{const d=JSON.parse(store("rl-draft-"+t.code)||"null");if(Array.isArray(d))sel=new Set(d.filter(id=>BY[id]))}catch(e){}
  saved=null;savedAt=null;stats=null;pos="all";st="all";q="";$("q").value="";
  applyTheme(t);
  document.title=t.short+"契約保留名簿｜中職 60 人名單模擬";
  $("kicker").textContent=t.en+" · 2027 Reserve List";
  $("h1").textContent="排出你的"+t.name+" 60 人契約保留名單";
  $("teamSw").value=t.code;$("teamSwBox").hidden=AVAIL.length<2;
  renderExempt();
  $("picker").hidden=true;$("app").hidden=false;
  try{if(store("rl-tab")==="stats")tab="stats"}catch(e){}
  setTab(tab);
  loadMine();
}
function showPicker(){
  applyTheme(TEAMS[3]);
  document.title="中職契約保留名簿｜各隊 60 人名單模擬";
  $("kicker").textContent="CPBL · 2027 Reserve List";
  $("h1").textContent="排出你支持球隊的 60 人契約保留名單";
  $("exempt").replaceChildren();$("teamSwBox").hidden=true;
  $("app").hidden=true;$("picker").hidden=false;
  const g=$("tgrid");g.replaceChildren();
  for(const t of AVAIL){
    const n=DATA.teams[t.code].players.length;
    const a=el("a",{class:"tcard",href:"#"+t.slug,style:`background:${t.band}`},el("span",{text:t.en}),el("b",{text:t.name}),el("em",{text:`${n} 名可選球員 · 選出 60 人`}));
    g.append(a);
  }
  g.querySelectorAll(".tcard").forEach((a,i)=>{a.style.boxShadow=`inset 0 -4px 0 ${AVAIL[i].acc}`});
}
function renderExempt(){
  const ex=$("exempt");ex.replaceChildren();
  const e=DATA.teams[T.code].exempt;
  const add=(label,names)=>{if(names.length)ex.append(el("span",{},el("b",{text:label}),names.join("、")))};
  add("洋將（不需列入）",e.foreign);add("自主／自行培訓（不需列入）",e.training);add("已非球員",e.removed);
}

// ---------- top bar ----------
function renderRail(){
  const pt=$("posTabs");pt.replaceChildren();
  for(const k of["all",...GORD]){
    const tot=k==="all"?ROSTER.length:ROSTER.filter(p=>p.g===k).length,kept=k==="all"?sel.size:keptIn(k);
    const b=el("button",{class:"pc-tab","aria-pressed":String(pos===k),"aria-label":`${k==="all"?"全部":GN[k]}：已保留 ${kept}，共 ${tot} 人`},
      el("span",{},el("span",{class:"l",text:k==="all"?"全部":GN[k]}),el("span",{class:"n"},el("b",{class:"k",text:kept}),el("span",{class:"t",text:"/"+tot}))));
    b.onclick=()=>setPos(k);pt.append(b);
  }
  $("stSel").value=st;
  $("showBox").hidden=$("searchBox").hidden=tab!=="pick";
}
$("stSel").onchange=e=>{st=e.target.value;renderGroups()};
function setPos(k){
  pos=k;renderRail();if(tab==="pick")renderGroups();else renderStats();
  const top=document.querySelector("#app main").getBoundingClientRect().top+window.scrollY-$("top").offsetHeight-4;
  if(window.scrollY>top)window.scrollTo({top,behavior:"smooth"});
}
try{new ResizeObserver(()=>document.documentElement.style.setProperty("--hh",$("top").offsetHeight+"px")).observe($("top"))}catch(e){}

// ---------- picker ----------
function match(p){
  if(pos!=="all"&&p.g!==pos)return false;
  if(st==="on"&&!sel.has(p.id))return false;
  if(st==="off"&&sel.has(p.id))return false;
  if(q){const s=q.trim();if(s&&!p.n.includes(s)&&p.no!==s&&String(+p.no)!==s)return false}
  return true;
}
function renderGroups(){
  const box=$("groups");box.replaceChildren();
  const full=sel.size>=LIMIT;let any=false;
  for(const g of GORD){
    const all=ROSTER.filter(p=>p.g===g),list=all.filter(match).sort(sortP);
    if(!list.length)continue;any=true;
    const grid=el("div",{class:"grid"});
    for(const p of list){
      const on=sel.has(p.id);
      const pic=photo(p,"pic");pic.append(el("span",{class:"no",text:p.no}),el("span",{class:"ck","aria-hidden":"true",text:"✓"}));
      const b=el("button",{class:"tile","aria-pressed":String(on),title:`${p.no} ${p.n}`,"aria-label":`${p.no} ${p.n} ${posLabel(p)}${on?" 已保留":""}`},pic,
        el("span",{class:"tx"},el("span",{class:"nm",text:p.n}),el("span",{class:"sub",text:posLabel(p)+" · "+p.l})));
      if(full&&!on){b.disabled=true;b.title="已達 60 人上限，先移除一位才能再加入"}
      b.onclick=()=>toggle(p.id);
      grid.append(b);
    }
    box.append(el("section",{class:"grp",id:"g-"+g},
      el("div",{class:"gh"},el("h2",{},el("span",{class:"en",text:GEN[g]}),GN[g]),el("span",{class:"k"},"已保留 ",el("b",{text:keptIn(g)})," / "+all.length)),grid));
  }
  if(!any)box.append(el("div",{class:"empty"},el("b",{text:"沒有符合條件的球員"}),"換個守位或顯示條件，或清除搜尋字。"));
}
function keepDraft(){store("rl-draft-"+T.code,JSON.stringify([...sel]))}
function toggle(id){
  if(sel.has(id))sel.delete(id);else{if(sel.size>=LIMIT)return;sel.add(id)}
  keepDraft();renderAll();
}

// ---------- count + actions ----------
function renderDock(){
  const n=sel.size;$("selN").textContent=n;$("selBar").style.width=Math.min(100,n/LIMIT*100)+"%";
  $("top").classList.toggle("over",n>LIMIT);
  $("copyTxt").disabled=$("mkImg").disabled=$("clear").disabled=n===0;
}
function same(a,b){if(!a||a.size!==b.size)return false;for(const x of a)if(!b.has(x))return false;return true}
function fmt(t){try{const d=new Date(t);return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`}catch(e){return""}}
function renderStatus(){
  const s=$("status"),btn=$("save");s.replaceChildren();
  const dirty=!same(saved||new Set(),sel);btn.classList.remove("dirty");
  if(saving){s.append("送出中…");btn.disabled=true;return}
  if(!online&&saved===null){s.append("連線中…");btn.disabled=!sel.size;return}
  if(!sel.size&&!(saved&&saved.size)){s.append("點選球員加入名單");btn.disabled=true;return}
  if(dirty){s.append(el("span",{class:"warn",text:saved&&saved.size?"有未送出的變更":"尚未送出"}));btn.disabled=false;btn.classList.add("dirty")}
  else{s.append("已送出"+(savedAt?" "+fmt(savedAt):""));btn.disabled=true}
}
async function api(path,opts){
  const r=await fetch(API+path,opts);const j=await r.json().catch(()=>({}));
  if(!r.ok){const e=new Error(j.error||("http_"+r.status));e.code=j.error;e.status=r.status;throw e}
  return j;
}
async function loadMine(){
  const code=T.code;
  try{
    const j=await api(`/mine?team=${code}&voter=${VOTER}`);
    if(!T||T.code!==code)return;
    online=true;
    if(Array.isArray(j.ids)){saved=new Set(j.ids.filter(id=>BY[id]));savedAt=j.at;if(!store("rl-draft-"+code)){sel=new Set(saved);keepDraft()}}
    else saved=new Set();
  }catch(e){online=false;saved=new Set()}
  renderAll();
}
async function save(){
  if(saving)return;saving=true;renderStatus();
  const ids=[...sel].sort();
  try{
    const j=await api("/picks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({team:T.code,voter:VOTER,ids})});
    saved=new Set(ids);savedAt=j.at;online=true;stats=null;toast(ids.length?"已送出 "+ids.length+" 人名單":"已撤回你的名單");
  }catch(e){
    toast(e.status===429?"這個網路今天送出太多份名單，請明天再試":"送出失敗，請檢查網路後再試一次");
  }
  saving=false;renderAll();if(tab==="stats")loadStats();
}
let armT=0;
$("clear").onclick=()=>{
  const b=$("clear"),lb=b.querySelector(".lb");
  if(!b.classList.contains("arm")){b.classList.add("arm");lb.textContent="確定清空？";toast("再按一次清空名單");clearTimeout(armT);armT=setTimeout(()=>{b.classList.remove("arm");lb.textContent="清空"},3000);return}
  clearTimeout(armT);b.classList.remove("arm");lb.textContent="清空";
  sel.clear();keepDraft();renderAll();toast("已清空名單（尚未送出）");
};
$("save").onclick=save;

// ---------- stats ----------
async function loadStats(){
  const code=T.code;
  try{const j=await api("/stats?team="+code);if(!T||T.code!==code)return;stats=j;online=true}catch(e){if(!stats)stats={error:true}}
  if(tab==="stats")renderStats();subCount();
}
function renderStats(){
  const box=$("statsBody");box.replaceChildren();
  if(!stats){box.append(el("div",{class:"empty"},el("b",{text:"載入中…"})));return}
  if(stats.error){box.append(el("div",{class:"empty"},el("b",{text:"暫時讀不到統計"}),"請檢查網路，稍後再切換到這一頁。"));return}
  const N=stats.n||0;
  if(!N){box.append(el("div",{class:"empty"},el("b",{text:"還沒有人送出"+T.name+"的名單"}),"在「我的名單」選好球員後按「送出名單」，你的選擇就會出現在這裡。"));return}
  const cnt=stats.counts||{};let tot=0;for(const v of Object.values(cnt))tot+=v;
  const rows=ROSTER.map(p=>({p,c:cnt[p.id]||0})).map(x=>({...x,r:x.c/N})).sort((a,b)=>b.c-a.c||sortP(a.p,b.p));
  rows.forEach((x,i)=>x.rank=i+1);
  const split=rows.filter(x=>N>=3&&x.r>=.35&&x.r<=.65).length;
  const kp=el("div",{class:"kpis"});
  for(const[v,k]of[[N,"份名單已送出"],[(tot/N).toFixed(1),"平均保留人數"],[rows.filter(x=>x.r===1).length,"全員一致保留"],[N>=3?split:"—","意見分歧（35–65%）"]])kp.append(el("div",{class:"kpi"},el("div",{class:"v",text:v}),el("div",{class:"k",text:k})));
  box.append(kp);
  const list=el("div",{class:"rank"});
  for(const x of rows.filter(x=>pos==="all"||x.p.g===pos)){
    if(pos==="all"&&x.rank===LIMIT+1)list.append(el("div",{class:"cut"},"▲ 共識 60 人保留線",el("span",{text:"以下為多數人未列入"})));
    const cls=["rk"];if(sel.has(x.p.id))cls.push("mine");if(N>=3&&x.r>=.35&&x.r<=.65)cls.push("split");
    list.append(el("div",{class:cls.join(" ")},el("div",{class:"r",text:x.rank}),photo(x.p,"av"),
      el("div",{class:"nm"},el("span",{class:"n2",text:x.p.no}),x.p.n,el("small",{text:posLabel(x.p)})),
      el("div",{class:"track"},el("i",{style:`width:${(x.r*100).toFixed(1)}%`})),
      el("div",{class:"pc"},Math.round(x.r*100)+"%",el("small",{text:`${x.c}/${N}`}))));
  }
  box.append(list);
  box.append(el("p",{class:"note",text:"依保留率排序，名次為全隊排名。● 表示你目前的名單有保留這位球員；虛線為 50%；橘色百分比代表意見分歧（至少 3 份名單時才標示）。每台裝置每隊計一份，重新送出會覆蓋舊的名單。"}));
}
function subCount(){$("subN").textContent=stats&&stats.n?stats.n:""}

function renderAll(){if(!T)return;renderDock();renderStatus();renderRail();subCount();if(tab==="pick")renderGroups();else renderStats()}
function setTab(t){
  tab=t;for(const k of["pick","stats"]){$("tab-"+k).setAttribute("aria-selected",String(k===t));$("view-"+k).hidden=k!==t}
  renderAll();store("rl-tab",t);
  clearInterval(statsT);
  if(t==="stats"){loadStats();statsT=setInterval(()=>{if(!document.hidden)loadStats()},30000)}
  else if(!stats)loadStats();
}
$("tab-pick").onclick=()=>setTab("pick");$("tab-stats").onclick=()=>setTab("stats");
$("q").oninput=e=>{q=e.target.value;renderGroups()};

// ---------- export ----------
function groupsOf(){return GORD.split("").map(g=>({g,on:ROSTER.filter(p=>p.g===g&&sel.has(p.id)).sort(sortP)}))}
function offList(){return ROSTER.filter(p=>!sel.has(p.id)).sort(sortP)}
function listText(){
  const gs=groupsOf(),off=offList();
  const L=[T.name+" 2027 年度契約保留球員名單（我的版本）","保留 "+sel.size+" / 60 人｜"+gs.map(x=>GN[x.g]+" "+x.on.length).join("・"),""];
  for(const x of gs){if(!x.on.length)continue;L.push("【"+GN[x.g]+" "+x.on.length+"】",x.on.map(p=>p.no+" "+p.n).join("、"),"")}
  if(off.length)L.push("【不列入 "+off.length+"】",off.map(p=>p.no+" "+p.n).join("、"),"");
  L.push("— 排你的名單："+location.href.split("#")[0]+"#"+T.slug);
  return L.join("\n");
}
let toastT=0;
function toast(msg){const t=$("toast");t.textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{t.hidden=true},2400)}
let sheetUrl=null;
function openSheet(title,kids){$("sheetT").textContent=title;$("sheetBody").replaceChildren(...kids);$("sheet").hidden=false;$("sheetX").focus()}
function closeSheet(){$("sheet").hidden=true;$("sheetBody").replaceChildren();if(sheetUrl){URL.revokeObjectURL(sheetUrl);sheetUrl=null}}
$("sheetX").onclick=closeSheet;
$("sheet").addEventListener("click",e=>{if(e.target.id==="sheet")closeSheet()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("sheet").hidden)closeSheet()});
$("copyTxt").onclick=()=>{
  const t=listText();
  const fb=()=>{const ta=el("textarea",{class:"ta",readonly:"","aria-label":"名單文字"});ta.value=t;
    openSheet("複製名單文字",[el("p",{class:"hint",text:"無法自動複製。文字已全選，請按 Ctrl+C（Mac 按 ⌘C），手機請長按後選「複製」。"}),ta]);
    setTimeout(()=>{ta.focus();ta.select()},0)};
  try{navigator.clipboard.writeText(t).then(()=>toast("已複製 "+sel.size+" 人名單到剪貼簿"),fb)}catch(e){fb()}
};
async function drawCard(){
  const W=1080,P=64,IW=W-P*2,RH=52,ORH=38,COLS=4,OCOLS=5;
  const gs=groupsOf().filter(x=>x.on.length),off=offList();
  const C={bg:"#F2F4F7",band:T.band,ink:"#1A2233",muted:"#66738A",line:"#DDE2EA",white:"#FFFFFF",soft:"rgba(255,255,255,.72)",acc:T.ink};
  const SANS='"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif',NUM='"Rajdhani","Arial Narrow",sans-serif';
  const all=T.name+T.short+"年度契約保留球員我的人名單不列入依中職聯盟規章第章條簿投手捕手內野外・｜/"+ROSTER.map(p=>p.n).join("");
  try{await Promise.all([document.fonts.load("700 60px "+SANS,all),document.fonts.load("500 24px "+SANS,all),document.fonts.load("400 22px "+SANS,all),document.fonts.load("700 30px "+NUM,"0123456789/")])}catch(e){}
  const HEAD=250;let H=HEAD+40;
  for(const x of gs)H+=60+Math.ceil(x.on.length/COLS)*RH+28;
  if(off.length)H+=56+Math.ceil(off.length/OCOLS)*ORH+28;
  H+=70;
  const cv=document.createElement("canvas");cv.width=W;cv.height=H;const c=cv.getContext("2d");
  c.fillStyle=C.bg;c.fillRect(0,0,W,H);
  c.fillStyle=C.band;c.fillRect(0,0,W,HEAD);
  c.fillStyle=T.acc;c.fillRect(0,HEAD-8,W,8);
  c.fillStyle=C.soft;c.font="500 24px "+SANS;c.fillText(T.name+" · 2027 年度契約保留球員",P,84);
  c.fillStyle=C.white;c.font="700 64px "+SANS;c.fillText("我的 60 人名單",P,164);
  c.font="400 24px "+SANS;c.fillStyle=C.soft;
  c.fillText(GORD.split("").map(g=>GN[g]+" "+keptIn(g)).join("　")+"　不列入 "+off.length,P,214);
  c.textAlign="right";c.font="500 48px "+NUM;c.fillStyle=C.soft;c.fillText("/ 60",W-P,164);const sW=c.measureText("/ 60").width;
  c.font="700 132px "+NUM;c.fillStyle=C.white;c.fillText(String(sel.size),W-P-sW-10,164);
  c.textAlign="left";
  let y=HEAD+40;const cw=IW/COLS;
  for(const x of gs){
    c.fillStyle=C.ink;c.font="700 32px "+SANS;c.fillText(GN[x.g],P,y+34);
    const tw=c.measureText(GN[x.g]).width;c.fillStyle=C.muted;c.font="400 22px "+SANS;c.fillText(x.on.length+" 人",P+tw+14,y+34);
    c.fillStyle=C.line;c.fillRect(P,y+48,IW,2);y+=60;
    x.on.forEach((p,i)=>{const cx=P+(i%COLS)*cw,cy=y+Math.floor(i/COLS)*RH+34;
      c.textAlign="right";c.fillStyle=C.acc;c.font="700 30px "+NUM;c.fillText(p.no,cx+50,cy);
      c.textAlign="left";c.fillStyle=C.ink;c.font="700 27px "+SANS;c.fillText(p.n,cx+62,cy,cw-72)});
    y+=Math.ceil(x.on.length/COLS)*RH+28;
  }
  if(off.length){
    c.fillStyle=C.muted;c.font="700 26px "+SANS;c.fillText("不列入（"+off.length+" 人）",P,y+28);
    c.fillStyle=C.line;c.fillRect(P,y+42,IW,1);y+=56;const ow=IW/OCOLS;
    off.forEach((p,i)=>{const cx=P+(i%OCOLS)*ow,cy=y+Math.floor(i/OCOLS)*ORH+26;
      c.fillStyle=C.muted;c.font="400 21px "+SANS;c.fillText(p.no+" "+p.n,cx,cy,ow-12)});
  }
  c.fillStyle=C.line;c.fillRect(P,H-70,IW,1);
  c.fillStyle=C.muted;c.font="400 20px "+SANS;c.fillText("依中職聯盟規章第 8 章第 10 條 · "+location.host+location.pathname,P,H-34,IW);
  return new Promise(r=>cv.toBlob(r,"image/png"));
}
$("mkImg").onclick=async()=>{
  const b=$("mkImg"),lb=b.querySelector(".lb");b.disabled=true;lb.textContent="產生中…";
  try{
    const blob=await drawCard();if(!blob)throw 0;
    if(sheetUrl)URL.revokeObjectURL(sheetUrl);sheetUrl=URL.createObjectURL(blob);
    const fname=T.short+"契約保留名單.png";
    const row=el("div",{class:"sheet-a"});
    const dla=el("a",{class:"btn",href:sheetUrl,download:fname},el("span",{text:"下載 PNG"}));row.append(dla);
    const file=new File([blob],fname,{type:"image/png"});
    if(navigator.canShare&&navigator.canShare({files:[file]})){
      const sh=el("button",{class:"btn"},el("span",{text:"分享"}));
      sh.onclick=async()=>{try{await navigator.share({files:[file],title:T.name+" 契約保留名單"})}catch(e){}};row.append(sh);
    }
    row.append(el("span",{class:"hint",text:"也可以右鍵或長按圖片另存。"}));
    openSheet("名單圖片",[el("img",{class:"shot",src:sheetUrl,alt:"我的契約保留球員名單圖片"}),row]);
  }catch(e){toast("圖片產生失敗，請再試一次")}
  b.disabled=sel.size===0;lb.textContent="存成圖片";
};

// ---------- boot ----------
(async()=>{
  try{DATA=await (await fetch("data/teams.json",{cache:"no-cache"})).json()}catch(e){document.body.append(el("p",{class:"in",text:"名單載入失敗，請重新整理頁面。"}));return}
  AVAIL=TEAMS.filter(t=>DATA.teams[t.code]);
  for(const t of AVAIL)$("teamSw").append(el("option",{value:t.code,text:t.name}));
  $("teamSw").onchange=e=>{const t=AVAIL.find(x=>x.code===e.target.value);location.hash=t.slug};
  window.addEventListener("hashchange",()=>{route();window.scrollTo(0,0)});
  route();
})();
