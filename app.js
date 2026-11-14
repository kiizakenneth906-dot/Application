const AREAS=CFG.areas,SCHED=CFG.schedule,TYPES=CFG.types;
const TABS={Citizen:["Home","Report","My reports","Schedule","Learn","AI Board","Contact"],Collector:["Home","Jobs","Schedule","AI Board","Contact"],Administrator:["Home","Dashboard","All tickets","Schedule","AI Board","Contact"]};
let role="Citizen",tab="Home",area="",tickets=[];
async function api(url,method="GET",body){
 const r=await fetch(url,{method,headers:{"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});
 const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||"Request failed");return j}
async function load(){try{tickets=await api("/api/tickets")}catch(e){toast("Could not load tickets")}}
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const cnt=(k,v)=>tickets.filter(t=>t[k]==v).length;
function toast(m){const d=document.createElement("div");d.className="toast";d.textContent=m;document.body.appendChild(d);setTimeout(()=>d.remove(),2500)}
function nav(){$("#nav").innerHTML=TABS[role].map(t=>`<button class="${t==tab?'on':''}" onclick="go('${t}')">${t}</button>`).join("")}
async function go(t){tab=t;nav();await load();render();scrollTo(0,0)}
$("#role").onchange=e=>{role=e.target.value;go("Home")};
function table(list,act){
 if(!list.length)return'<p class="mu">No reports yet.</p>';
 return`<div class="scroll"><table><tr><th>ID</th><th>Type</th><th>Area</th><th>Details</th><th>Status</th>${act?'<th>Action</th>':''}</tr>`+list.map(t=>`<tr><td>#${t.id}</td><td>${esc(t.type)}</td><td>${esc(t.area)}<br><small class="mu">${esc(t.loc||"")}</small></td><td>${esc(t.details||"–")}</td><td><span class="tag ${t.status}">${t.status}</span></td>${act?`<td>${act(t)}</td>`:''}</tr>`).join("")+`</table></div>`}
async function setS(id,s){try{await api("/api/tickets/"+id,"PATCH",{status:s});toast("Ticket #"+id+" updated");await load();render()}catch(e){toast(e.message)}}
const act=t=>t.status=="Open"?`<button class="btn s" onclick="setS(${t.id},'Progress')">Start</button>`:t.status=="Progress"?`<button class="btn s" onclick="setS(${t.id},'Resolved')">Resolve</button>`:"✓";
async function demo(){try{await api("/api/demo","POST");toast("Sample data loaded");await load();render()}catch(e){toast(e.message)}}
function stats(){return`<div class="grid"><div class="card"><div class="stat">${tickets.length}</div><span class="mu">Total reports</span></div><div class="card"><div class="stat" style="color:var(--r)">${cnt("status","Open")}</div><span class="mu">Open</span></div><div class="card"><div class="stat" style="color:var(--a)">${cnt("status","Progress")}</div><span class="mu">In progress</span></div><div class="card"><div class="stat">${cnt("status","Resolved")}</div><span class="mu">Resolved</span></div></div>`}
function bars(list,key){const mx=Math.max(1,...list.map(x=>cnt(key,x)));return list.map(x=>{const c=cnt(key,x);return`<div class="hbar"><span>${x}</span><div><i style="width:${c/mx*100}%"></i></div><b>${c}</b></div>`}).join("")}
function contact(){return`<div class="grid"><div class="card"><div class="ico">📞</div><h3>Phone</h3><a href="tel:${CFG.contact.phone}" class="mu">${CFG.contact.phone}</a></div><div class="card"><div class="ico">✉️</div><h3>E-mail</h3><a href="mailto:solidwaste@gmail.com" class="mu">${CFG.contact.email}</a></div><div class="card"><div class="ico">📍</div><h3>Service area</h3><span class="mu">Kampala, Uganda</span></div></div>`}
const V={
Home:()=>`<section class="hero"><h2>A cleaner Kampala, reported and resolved together</h2><p>Report missed pickups and illegal dumping, track each report until it is fixed, and get guidance from our AI assistant.</p>
<button class="btn light" onclick="go('${role=='Citizen'?'Report':role=='Collector'?'Jobs':'Dashboard'}')">${role=='Citizen'?'Report a problem':'Open my workspace'}</button> <button class="btn ghost" style="color:var(--at);border-color:var(--at)" onclick="go('AI Board')">Ask the AI</button></section>
${stats()}<h2 style="margin-top:1.5rem">How it works</h2>
<div class="grid steps"><div class="card"><h3>Report</h3><span class="mu">Pick your division and describe the problem.</span></div><div class="card"><h3>Assign</h3><span class="mu">Administrators dispatch collectors to open tickets.</span></div><div class="card"><h3>Resolve</h3><span class="mu">Collectors update the status and you can track it.</span></div></div>
<h2 style="margin-top:1.5rem">Get in touch</h2>${contact()}
<p class="mu">Viewing as <b>${role}</b>. Use the selector at the top to switch role.</p>`,
Report:()=>`<div class="card"><h2>Report a problem</h2><p class="mu">1. Tap your division on the map.</p>
<svg viewBox="0 0 400 220" width="100%" role="img" aria-label="Map of Kampala divisions" id="map">${[["Kawempe",10,10,180,90],["Nakawa",200,10,190,100],["Rubaga",10,110,130,100],["Central",150,110,100,100],["Makindye",260,120,130,90]].map(([n,x,y,w,h])=>`<g onclick="pick('${n}')"><rect class="z ${area==n?'on':''}" x="${x}" y="${y}" width="${w}" height="${h}" rx="12"/><text x="${x+w/2}" y="${y+h/2}" text-anchor="middle">${n}</text></g>`).join("")}</svg>
<p>Division: <b id="sel">${area||"none selected"}</b></p>
<p class="mu" style="margin-bottom:0">2. Describe it.</p>
<label for="ty">Problem type</label><select id="ty">${TYPES.map(t=>`<option>${t}</option>`).join("")}</select>
<label for="lc">Street or landmark</label><input id="lc" placeholder="e.g. near Bwaise market">
<label for="ds">Details (optional)</label><textarea id="ds" rows="3"></textarea>
<p><button class="btn" onclick="submitT()">Submit report</button></p><div class="err" id="er"></div></div>`,
"My reports":()=>`<div class="card"><h2>My reports</h2>${table(tickets)}<p><button class="btn ghost" onclick="go('Report')">New report</button></p></div>`,
Jobs:()=>`<div class="card"><h2>Collector jobs</h2><p class="mu">Open and in-progress tickets.</p>${table(tickets.filter(t=>t.status!="Resolved"),act)}</div>`,
"All tickets":()=>`<div class="card"><h2>All tickets</h2>${table(tickets,act)}</div>`,
Dashboard:()=>{const p=tickets.length||1,o=cnt("status","Open")/p*360,g=(cnt("status","Open")+cnt("status","Progress"))/p*360;
 return(tickets.length?"":`<div class="card"><b>No data yet.</b> <button class="btn s" onclick="demo()">Load sample data</button></div>`)+stats()+`<div class="grid" style="margin-top:1rem"><div class="card"><h3>By division</h3>${bars(AREAS,"area")}</div><div class="card"><h3>By type</h3>${bars(TYPES,"type")}</div><div class="card"><h3>Status</h3><div class="leg"><div class="donut" style="background:conic-gradient(var(--r) 0 ${o}deg,var(--a) ${o}deg ${g}deg,var(--ac) ${g}deg 360deg)"></div><div><span style="--c:var(--r)">Open</span><br><span style="--c:var(--a)">In progress</span><br><span style="--c:var(--ac)">Resolved</span></div></div></div></div><div class="card" style="margin-top:1rem"><h3>Latest tickets</h3>${table(tickets.slice(-5).reverse(),act)}</div>`},
Schedule:()=>`<div class="card"><h2>Collection schedule</h2><p class="mu">Sample schedule for demonstration. Final days are set by the municipal authorities and contractors.</p><div class="scroll"><table><tr><th>Division</th><th>Collection days</th></tr>${AREAS.map(a=>`<tr><td>${a}</td><td>${SCHED[a].join(" and ")}</td></tr>`).join("")}</table></div></div>`,
Learn:()=>`<div class="grid">${[["🥬","Organic","Food scraps and garden waste. Compost them or use a separate bin."],["🧴","Plastics","Rinse bottles and containers, keep them dry and separate for recyclers."],["📄","Paper","Flatten cartons and keep paper dry for recyclers."],["🔋","Hazardous","Batteries, medical and chemical waste never go in the general bin."],["🥫","Metal and glass","Keep separate and give to scrap collectors."],["🚫","Illegal dumping","Use the nearest collection point and report dump sites here."]].map(([i,a,b])=>`<div class="card"><div class="ico">${i}</div><h3>${a}</h3><span class="mu">${b}</span></div>`).join("")}</div>`,
"AI Board":()=>`<div class="card"><h2>AI coordination board</h2><p class="mu">The AI reads current tickets and recommends priorities, dispatch and next steps.</p>
${tickets.length?"":`<p class="mu">No tickets yet. <button class="btn s" onclick="demo()">Load sample data</button></p>`}
<div class="grid"><div><h3>By division</h3>${bars(AREAS,"area")}</div><div><h3>By type</h3>${bars(TYPES,"type")}</div></div>
<p><button class="btn" id="gb" onclick="brief()">Generate AI briefing</button></p><div id="br"></div></div>
<div class="card"><h2>Chat with the AI assistant</h2><div id="log"></div><div class="chips">${["How do I report illegal dumping?","My garbage was not collected","How do I sort waste at home?"].map(q=>`<button onclick="ask(this.textContent)">${q}</button>`).join("")}</div><div class="row"><input id="q" placeholder="Type your question…" aria-label="Message"><button class="btn" onclick="ask($('#q').value)">Send</button></div></div>`,
Contact:()=>`<div class="card"><h2>Contact us</h2><p class="mu">Reach the Solid Waste Collection team for urgent issues or questions.</p></div>${contact()}`
};
function pick(a){area=a;document.querySelectorAll("#map .z").forEach(z=>z.classList.toggle("on",z.nextElementSibling.textContent==a));$("#sel").textContent=a}
async function submitT(){if(!area){$("#er").textContent="Please tap your division on the map first.";return}
 try{const r=await api("/api/tickets","POST",{type:$("#ty").value,area,loc:$("#lc").value,details:$("#ds").value});area="";toast("Report #"+r.id+" submitted");go("My reports")}catch(e){$("#er").textContent=e.message}}
let log,hist=[];
function addM(t,c){const d=document.createElement("div");d.className="m "+c;d.textContent=t;log.appendChild(d);log.scrollTop=log.scrollHeight;return d}
async function ask(t){t=(t||"").trim();if(!t)return;addM(t,"me");$("#q").value="";const b=addM("…","bt2");
 try{const r=await api("/api/chat","POST",{message:t,history:hist});b.textContent=r.reply;hist.push("Resident: "+t,"Assistant: "+r.reply)}
 catch(e){b.textContent="Sorry, the assistant is unavailable. Please e-mail "+CFG.contact.email+" or call "+CFG.contact.phone+"."}}
async function brief(){if(!tickets.length){toast("Add some tickets first");return}
 const b=$("#gb"),o=$("#br");b.disabled=true;o.innerHTML='<div class="ai">Analysing tickets…</div>';
 try{const r=await api("/api/briefing","POST");o.innerHTML='<div class="ai"></div>';o.firstChild.textContent=r.text}
 catch(e){o.innerHTML='<div class="ai">The briefing is unavailable right now.</div>'}
 b.disabled=false}
function render(){$("#main").innerHTML=V[tab]();if(tab=="AI Board"){log=$("#log");addM("Hello! Ask me about waste collection, reporting illegal dumping or recycling in Kampala.","bt2");const q=$("#q");q.addEventListener("keydown",e=>{if(e.key=="Enter")ask(q.value)})}}
nav();load().then(render);
