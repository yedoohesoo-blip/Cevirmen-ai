(() => {
"use strict";
const C = window.CAI;
if(!C) return;
const {$, $$, esc, uid, toast, openModal, closeModal, debugLog, DEBUG_LOGS, getS, saveState, callAI, splitChunks, dbAll, dbGet, dbPut, dbDel, openRealBrowser, renderLibrary, openBookReader, renderPromptUI, switchView, importBookFile, R} = C;

/* ===================== 1. FMHY OKUMA MERKEZİ (EKLE / KALDIR / YENİLE) ===================== */
const FMHY_DEFAULTS = {
  novels: [
    {id:"fn1", name:"NovelBin", url:"https://novelbin.com"},
    {id:"fn2", name:"NovelFire", url:"https://novelfire.net"},
    {id:"fn3", name:"RoyalRoad", url:"https://www.royalroad.com"},
    {id:"fn4", name:"WebNovel", url:"https://www.webnovel.com"},
    {id:"fn5", name:"WuxiaWorld", url:"https://www.wuxiaworld.com"},
    {id:"fn6", name:"NovelUpdates", url:"https://www.novelupdates.com"},
    {id:"fn7", name:"ScribbleHub", url:"https://www.scribblehub.com"},
    {id:"fn8", name:"AO3", url:"https://archiveofourown.org"}
  ],
  manga: [
    {id:"fm1", name:"MangaDex", url:"https://mangadex.org"},
    {id:"fm2", name:"ComicK", url:"https://comick.io"},
    {id:"fm3", name:"AsuraScans", url:"https://asuracomic.net"},
    {id:"fm4", name:"Webtoons", url:"https://www.webtoons.com/en/"},
    {id:"fm5", name:"MANGA Plus", url:"https://mangaplus.shueisha.co.jp"},
    {id:"fm6", name:"MangaFire", url:"https://mangafire.to"},
    {id:"fm7", name:"Bato.to", url:"https://bato.to"},
    {id:"fm8", name:"WeebCentral", url:"https://weebcentral.com"}
  ],
  ebooks: [
    {id:"fe1", name:"Anna's Archive", url:"https://annas-archive.org"},
    {id:"fe2", name:"Standard Ebooks", url:"https://standardebooks.org"},
    {id:"fe3", name:"Gutenberg", url:"https://www.gutenberg.org"},
    {id:"fe4", name:"Open Library", url:"https://openlibrary.org"},
    {id:"fe5", name:"OceanofPDF", url:"https://oceanofpdf.com"},
    {id:"fe6", name:"FMHY Reading", url:"https://fmhy.net/reading"}
  ]
};

function ensureFmhyData(){
  const S = getS();
  if(!S.fmhySites || !S.fmhySites.novels){
    S.fmhySites = structuredClone(FMHY_DEFAULTS);
    saveState();
  }
  return S.fmhySites;
}

let fmhyCat = "novels";
function renderFmhy(){
  const data = ensureFmhyData();
  const list = data[fmhyCat] || [];
  const g = $("#fmhyGrid");
  if(g){
    g.innerHTML = list.length ? list.map(s=>`
      <div class="bm-tile" data-furl="${esc(s.url)}">
        <button class="bm-del" data-fdel="${esc(s.id)}" title="Çalışmayan siteyi kaldır">✕</button>
        <div class="bm-ico" style="background:linear-gradient(135deg,var(--primary),#c026d3)">${esc((s.name||"S")[0].toUpperCase())}</div>
        <div class="bm-name">${esc(s.name)}</div>
      </div>`).join("") : `<div class="hint" style="grid-column:1/-1;text-align:center;padding:12px">Liste boş. <b>+ Ekle</b> veya <b>↻</b> ile yenileyebilirsin.</div>`;

    g.querySelectorAll(".bm-tile").forEach(el=>el.onclick=e=>{
      if(e.target.dataset.fdel) return;
      openRealBrowser(el.dataset.furl);
    });
    g.querySelectorAll("[data-fdel]").forEach(btn=>btn.onclick=e=>{
      e.stopPropagation();
      data[fmhyCat] = data[fmhyCat].filter(x=>x.id !== btn.dataset.fdel);
      saveState(); renderFmhy(); toast("Site kaldırıldı");
    });
  }

  const mg = $("#mangaSitesGrid");
  if(mg){
    mg.innerHTML = (data.manga||[]).map(s=>`
      <div class="bm-tile" data-ms="${esc(s.url)}">
        <div class="bm-ico" style="background:linear-gradient(135deg,#c026d3,#8b5cf6)">${esc((s.name||"M")[0].toUpperCase())}</div>
        <div class="bm-name">${esc(s.name)}</div>
      </div>`).join("");
    mg.querySelectorAll("[data-ms]").forEach(el=>el.onclick=()=>openRealBrowser(el.dataset.ms));
  }
}

$$("#fmhySeg button").forEach(b=>b.onclick=()=>{
  fmhyCat=b.dataset.fc;
  $$("#fmhySeg button").forEach(x=>x.classList.toggle("active",x===b));
  renderFmhy();
});
$("#openFmhyDirect").onclick=()=>openRealBrowser("https://fmhy.net/reading");
$("#fmhyAddBtn")?.addEventListener("click", () => {
  const url = prompt("Eklemek istediğin site adresi (URL):", "https://"); if(!url || !url.trim()) return;
  const cleanUrl = /^https?:\/\//i.test(url.trim()) ? url.trim() : "https://" + url.trim();
  const defName = cleanUrl.replace(/^https?:\/\/(www\.)?/,"").split("/")[0];
  const name = prompt("Site adı:", defName); if(!name) return;
  const data = ensureFmhyData();
  data[fmhyCat].unshift({id:uid(), name:name.trim(), url:cleanUrl});
  saveState(); renderFmhy(); toast(`"${name.trim()}" eklendi ✅`);
});
$("#fmhyRefreshBtn")?.addEventListener("click", () => {
  if(!confirm("Bu kategorideki varsayılan FMHY siteleri geri yüklensin mi? (Kendi eklediklerin korunur)")) return;
  const data = ensureFmhyData();
  const existingUrls = new Set(data[fmhyCat].map(x=>x.url));
  for(const def of (FMHY_DEFAULTS[fmhyCat]||[])){
    if(!existingUrls.has(def.url)) data[fmhyCat].push({...def});
  }
  saveState(); renderFmhy(); toast("FMHY listesi yenilendi ↻");
});
$("#mSiteGoBtn").onclick=()=>{const q=$("#mSiteInput").value.trim(); openRealBrowser(q||"https://mangadex.org");};
$("#mSiteInput").addEventListener("keydown",e=>{if(e.key==="Enter")$("#mSiteGoBtn").click();});

/* ===================== 2. AI SOHBET & SİTE ÖNERİ ASİSTANI ===================== */
let chatCtrl = null;
function ensureChat(){
  const S = getS();
  if(!Array.isArray(S.chatHistory)) S.chatHistory = [];
  return S.chatHistory;
}
function formatChatHtml(txt){
  return esc(txt).replace(/(https?:\/\/[^\s<>"')]+)/g, u => `<a href="#" data-chaturl="${u}">${u}</a>`);
}
function renderChat(){
  const msgs = ensureChat(), box = $("#chatMsgs"); if(!box) return;
  if(!msgs.length){
    box.innerHTML = `<div class="chat-msg ai">Merhaba! Ben Çevirmen AI asistanınım. Bana roman/manga/manhwa sitesi sorabilir, seri önerisi isteyebilir veya istediğin konuda sohbet edebilirsin. Verdiğim linklere dokununca doğrudan tarayıcında açılır! ✨</div>`;
    return;
  }
  box.innerHTML = msgs.map(m => `<div class="chat-msg ${m.role==='user'?'user':'ai'}">${m.role==='user'?esc(m.content):formatChatHtml(m.content)}</div>`).join("");
  box.querySelectorAll("[data-chaturl]").forEach(a => a.onclick = e => { e.preventDefault(); openRealBrowser(a.dataset.chaturl); });
  box.scrollTop = box.scrollHeight;
}

async function sendChatMessage(overrideText=null){
  const S = getS(), inp = $("#chatInput");
  const text = (overrideText !== null ? overrideText : inp.value).trim();
  if(!text) return;
  if(!S.apiKey || !S.model) return toast("Önce Ayarlar'dan API Key ve Model seç!");
  if(overrideText === null) inp.value = "";

  const msgs = ensureChat();
  msgs.push({role:"user", content:text});
  msgs.push({role:"assistant", content:"…"});
  if(msgs.length > 40) msgs.splice(0, msgs.length - 40);
  saveState(); renderChat();

  chatCtrl?.abort(); chatCtrl = new AbortController();
  const btn = $("#chatSendBtn"), stop = $("#chatStopBtn");
  btn.classList.add("busy"); btn.disabled = true; stop.style.display = "";

  const sysMsg = {
    role:"system",
    content:"Sen Çevirmen AI uygulamasının akıllı Türkçe asistanısın. Kullanıcıyla doğal ve samimi sohbet et; roman, web novel, manga, manhwa ve okuma siteleri önerirken çalışan gerçek tam URL'ler (https://...) paylaş ki kullanıcı dokunup tarayıcıda açabilsin."
  };
  const apiMsgs = [sysMsg, ...msgs.slice(0, -1).slice(-14).map(m=>({role:m.role, content:m.content}))];

  try{
    const url = S.baseUrl.replace(/\/+$/,"") + "/chat/completions";
    const res = await fetch(url, {
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+S.apiKey},
      body:JSON.stringify({model:S.model, temperature:0.6, stream:!!S.stream, messages:apiMsgs}),
      signal:chatCtrl.signal
    });
    if(!res.ok) throw new Error("API ("+res.status+")");

    const last = msgs[msgs.length - 1];
    last.content = "";

    if(!S.stream || !res.body){
      const j = await res.json();
      last.content = j?.choices?.[0]?.message?.content || "Yanıt alınamadı.";
      renderChat();
    } else {
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = "";
      while(true){
        const {done, value} = await reader.read(); if(done) break;
        buf += dec.decode(value, {stream:true});
        const lines = buf.split("\n"); buf = lines.pop() || "";
        for(const l of lines){
          const t = l.trim(); if(!t.startsWith("data:")) continue;
          const p = t.slice(5).trim(); if(p === "[DONE]") continue;
          try{
            const j = JSON.parse(p);
            const d = j?.choices?.[0]?.delta?.content ?? j?.choices?.[0]?.message?.content ?? "";
            if(d){ last.content += d; renderChat(); }
          }catch{}
        }
      }
    }
    saveState();
  }catch(e){
    const last = msgs[msgs.length - 1];
    last.content = e.name === "AbortError" ? (last.content || "Durduruldu.") : ("❌ Hata: " + e.message);
    renderChat();
  }finally{
    btn.classList.remove("busy"); btn.disabled = false; stop.style.display = "none";
  }
}

$("#chatSendBtn")?.addEventListener("click", () => sendChatMessage());
$("#chatStopBtn")?.addEventListener("click", () => chatCtrl?.abort());
$("#chatClearBtn")?.addEventListener("click", () => { if(confirm("Sohbet temizlensin mi?")){ getS().chatHistory = []; saveState(); renderChat(); } });
$("#chatInput")?.addEventListener("keydown", e => { if(e.key === "Enter" && !e.shiftKey){ e.preventDefault(); sendChatMessage(); } });
$$("#chatChips .chat-chip").forEach(ch => ch.onclick = () => sendChatMessage(ch.dataset.cq));

/* ===================== 3. PROMPT PAZAR YERİ ===================== */
const PROMPT_MARKET = [
  {name:"⚔️ Xianxia / Wuxia / Cultivation", desc:"Yetişim seviyeleri, mezhepler ve kadim üslup.", text:"Sen uzman bir Xianxia/Wuxia çevirmenisin. Yetişim (cultivation) alemlerini, mezhep (sect) isimlerini, Qi/Dao terimlerini ve saygı ifadelerini (Kıdemli, Usta, Genç Efendi) atmosferi bozmadan doğal Türkçe ile çevir. Sadece çeviriyi yaz."},
  {name:"💬 Manhwa / Webtoon (Doğal Sokak Dili)", desc:"Günlük konuşma, espri ve gençlik tonu.", text:"Sen deneyimli bir Kore webtoon/manhwa çevirmenisin. Diyalogları robotik değil, gerçek günlük Türkçe konuşma diliyle, kısa ve vurucu çevir. Sadece çeviriyi yaz."},
  {name:"🎓 Akademik & Teknik Makale", desc:"Bilimsel terimleri koruyan resmi dil.", text:"Sen akademik bir çevirmensin. Teknik terimleri doğruluğunu bozmadan, nesnel, açık ve profesyonel bir Türkçe ile çevir. Sadece çeviriyi yaz."},
  {name:"🎮 Oyun Arayüzü & RPG Diyalog", desc:"Kısa menü, eşya açıklaması ve görev metinleri.", text:"Sen bir video oyunu yerelleştirme uzmanısın. Eşya, yetenek, görev ve diyalogları oyuncuların aşina olduğu doğal Türkçe oyun diliyle çevir. Sadece çeviriyi yaz."},
  {name:"🕵️ Korku / Gerilim / Gizem", desc:"Gerilimli, kısa cümleli atmosferik üslup.", text:"Sen gerilim ve korku edebiyatı çevirmenisin. Metnin tekinsiz atmosferini, tempo ve gerilimini koruyarak etkileyici bir Türkçe ile çevir. Sadece çeviriyi yaz."}
];
function renderPromptMarket(){
  const box = $("#promptMarketList"); if(!box) return;
  box.innerHTML = PROMPT_MARKET.map((p,i)=>`<div class="list-item"><div class="list-item-body"><div class="list-item-title">${esc(p.name)}</div><div class="list-item-sub">${esc(p.desc)}</div></div><button class="btn primary small" data-pmadd="${i}">+ Ekle</button></div>`).join("");
  box.querySelectorAll("[data-pmadd]").forEach(b=>b.onclick=()=>{
    const S=getS(), item=PROMPT_MARKET[Number(b.dataset.pmadd)], np={id:uid(),name:item.name,builtIn:false,text:item.text};
    S.prompts.push(np); S.activePromptId=np.id; saveState(); renderPromptUI(); toast(`"${item.name}" eklendi ✨`);
  });
}

/* ===================== 4. GELİŞMİŞ SERİ WIKI ===================== */
let wikiTab = "chars";
$$("#wikiSeg button").forEach(b=>b.onclick=()=>{ wikiTab=b.dataset.wt; $$("#wikiSeg button").forEach(x=>x.classList.toggle("active",x===b)); renderWikiContent(); });
$("#wikiSearch")?.addEventListener("input", renderWikiContent);

$("#rWikiBtn").onclick=()=>{ if(!R.book)return; R.book.wiki=R.book.wiki||{chars:[],relations:[],lore:[]}; if($("#wikiSearch"))$("#wikiSearch").value=""; renderWikiContent(); openModal("wikiModal"); };
$("#wikiManualAddBtn")?.addEventListener("click", async () => {
  if(!R.book) return; R.book.wiki=R.book.wiki||{chars:[],relations:[],lore:[]};
  if(wikiTab==="lore"){
    const name=prompt("Orijinal Terim / Güç Sistemi:"); if(!name)return;
    const tr=prompt("Türkçe Karşılığı:",name)||name, desc=prompt("Açıklama:")||"";
    R.book.wiki.lore.unshift({name:name.trim(),tr:tr.trim(),desc:desc.trim()});
  } else {
    const name=prompt("Karakter Adı:"); if(!name)return;
    const role=prompt("Rolü / Seviyesi:")||"", desc=prompt("Bilgi:")||"";
    R.book.wiki.chars.unshift({name:name.trim(),role:role.trim(),desc:desc.trim()});
  }
  await dbPut(R.book); renderWikiContent(); toast("Wiki'ye eklendi ✅");
});

$("#wikiScanChapBtn").onclick = async () => {
  if(!R.book) return;
  const ch = R.book.chapters[R.visChaps[R.chapIdx].origIdx], tmp = document.createElement("div");
  tmp.innerHTML = ch.trHtml || ch.html;
  const btn = $("#wikiScanChapBtn"), st = $("#wikiStatus"), curWiki = R.book.wiki || {chars:[],relations:[],lore:[]};
  btn.classList.add("busy"); btn.disabled=true; st.className="status"; st.textContent="🧠 Bölüm taranıyor…";
  try{
    const raw = await callAI(`MEVCUT WIKI:\n${JSON.stringify(curWiki).slice(0,3200)}\n\nYENİ BÖLÜM (${ch.title}):\n${(tmp.innerText||"").slice(0,9500)}`, {
      system:`Roman bilgi kitabı (Wiki) editörüsün. Mevcut Wiki'yi yeni bölümle GÜNCELLE. Değişen bilgileri düzelt, yeni karakter/güç/terim ekle.
SADECE GEÇERLİ JSON DÖNDÜR: {"chars":[{"name":"Ad","role":"Rol/Seviye","desc":"Bilgi"}],"relations":[{"a":"K1","b":"K2","type":"İlişki"}],"lore":[{"name":"Orijinal","tr":"Türkçe","desc":"Açıklama"}]}`,
      streamOverride:false, temperature:0.2
    });
    const m = raw.match(/\{[\s\S]*\}/); if(!m) throw new Error("Wiki JSON alınamadı");
    const nw = JSON.parse(m[0]);
    R.book.wiki = {chars:Array.isArray(nw.chars)?nw.chars:curWiki.chars, relations:Array.isArray(nw.relations)?nw.relations:curWiki.relations, lore:Array.isArray(nw.lore)?nw.lore:curWiki.lore};
    await dbPut(R.book); renderWikiContent();
    st.className="status ok"; st.textContent=`✅ Güncellendi (${R.book.wiki.chars.length} karakter · ${R.book.wiki.lore.length} terim)`;
  }catch(e){ st.className="status error"; st.textContent="Hata: "+e.message; }
  finally{ btn.classList.remove("busy"); btn.disabled=false; }
};

function renderWikiContent(){
  const box=$("#wikiContent"), w=R.book?.wiki||{chars:[],relations:[],lore:[]}, q=($("#wikiSearch")?.value||"").trim().toLowerCase();
  if($("#wikiStatsBar")) $("#wikiStatsBar").textContent=`👤 ${w.chars?.length||0} Karakter · ⚡ ${w.lore?.length||0} Terim · 🕸️ ${w.relations?.length||0} İlişki`;
  if(wikiTab==="chars"){
    const list=(w.chars||[]).map((c,i)=>({...c,_i:i})).filter(c=>!q||(c.name+" "+c.role+" "+c.desc).toLowerCase().includes(q));
    if(!list.length){ box.innerHTML=`<div class="hint" style="text-align:center;padding:20px">${q?"Bulunamadı.":"Henüz karakter yok."}</div>`; return; }
    box.innerHTML=list.map(c=>{
      const rels=(w.relations||[]).filter(r=>r.a===c.name||r.b===c.name).map(r=>`<span style="display:inline-block;font-size:10.5px;padding:2px 7px;border-radius:999px;background:#8b5cf624;border:1px solid var(--border);margin:3px 4px 0 0;color:var(--accent)">${esc(r.a===c.name?r.b:r.a)} (${esc(r.type)})</span>`).join("");
      return `<div class="card" style="padding:10px;margin-bottom:8px;background:var(--surface2)"><div class="row" style="margin-bottom:4px"><div style="width:28px;height:28px;border-radius:9px;background:linear-gradient(135deg,var(--primary),var(--pink));display:grid;place-items:center;font-weight:800;font-size:13px;color:#fff;flex:0 0 28px">${esc((c.name||"?")[0].toUpperCase())}</div><div class="grow"><div style="font-size:13.5px;font-weight:700;color:#fff">${esc(c.name)}</div>${c.role?`<div style="font-size:11px;color:var(--accent)">${esc(c.role)}</div>`:""}</div><button class="btn small danger" data-wcdel="${c._i}">✕</button></div><div style="font-size:12.5px;line-height:1.45">${esc(c.desc||"")}</div>${rels?`<div style="margin-top:5px">${rels}</div>`:""}</div>`;
    }).join("");
    box.querySelectorAll("[data-wcdel]").forEach(b=>b.onclick=async()=>{R.book.wiki.chars.splice(Number(b.dataset.wcdel),1);await dbPut(R.book);renderWikiContent();});
  } else if(wikiTab==="lore"){
    const list=(w.lore||[]).map((l,i)=>({...l,_i:i})).filter(l=>!q||(l.name+" "+l.tr+" "+l.desc).toLowerCase().includes(q));
    if(!list.length){ box.innerHTML=`<div class="hint" style="text-align:center;padding:20px">${q?"Bulunamadı.":"Henüz terim yok."}</div>`; return; }
    box.innerHTML=list.map(l=>`<div class="card" style="padding:10px;margin-bottom:8px;background:var(--surface2)"><div class="row" style="margin-bottom:4px"><div class="grow" style="font-size:13.5px;font-weight:700">⚡ ${esc(l.name)} → <span style="color:var(--accent)">${esc(l.tr||l.name)}</span></div><button class="btn small danger" data-wldel="${l._i}">✕</button></div><div style="font-size:12.5px;color:var(--muted)">${esc(l.desc||"")}</div></div>`).join("");
    box.querySelectorAll("[data-wldel]").forEach(b=>b.onclick=async()=>{R.book.wiki.lore.splice(Number(b.dataset.wldel),1);await dbPut(R.book);renderWikiContent();});
  } else {
    const rels=(w.relations||[]).filter(r=>!q||(r.a+" "+r.b+" "+r.type).toLowerCase().includes(q));
    const names=[...new Set([...(w.chars||[]).map(c=>c.name),...rels.flatMap(r=>[r.a,r.b])])].filter(n=>!q||n.toLowerCase().includes(q)||rels.some(r=>r.a===n||r.b===n)).slice(0,12);
    if(names.length<2){ box.innerHTML=`<div class="hint" style="text-align:center;padding:20px">En az 2 karakter gerekli.</div>`; return; }
    const cx=175,cy=155,rad=112,pos={};
    names.forEach((n,i)=>{const a=(2*Math.PI*i)/names.length-Math.PI/2;pos[n]={x:Math.round(cx+rad*Math.cos(a)),y:Math.round(cy+rad*Math.sin(a))};});
    const lines=rels.filter(r=>pos[r.a]&&pos[r.b]).map(r=>{const p1=pos[r.a],p2=pos[r.b],mx=(p1.x+p2.x)/2,my=(p1.y+p2.y)/2;return `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="#a855f7" stroke-width="1.8" stroke-opacity="0.75"/><rect x="${mx-30}" y="${my-10}" width="60" height="14" rx="5" fill="#110b1cee"/><text x="${mx}" y="${my}" fill="#fde68a" font-size="8.5" font-weight="600" text-anchor="middle">${esc((r.type||"").slice(0,13))}</text>`;}).join("");
    const nodes=names.map(n=>{const p=pos[n];return `<circle cx="${p.x}" cy="${p.y}" r="23" fill="#1a1229" stroke="#d946ef" stroke-width="2"/><text x="${p.x}" y="${p.y+3}" fill="#fff" font-size="9.5" font-weight="700" text-anchor="middle">${esc(n.slice(0,10))}</text>`;}).join("");
    box.innerHTML=`<svg viewBox="0 0 350 310" style="width:100%;height:auto;background:#0a0612;border:1px solid var(--border);border-radius:14px">${lines}${nodes}</svg>`;
  }
}

/* ===================== 5. ÇOKLU KARAKTER TTS + AMBİYANS ===================== */
let ttsOn=false, ttsBtn=null, aiAudio=null;
function populateVoices(){ const sel=$("#rVoiceSel"); if(!sel)return; if(!("speechSynthesis" in window)){sel.innerHTML="<option>Desteklenmiyor</option>";return;} const v=speechSynthesis.getVoices().filter(x=>/tr|en/i.test(x.lang)); sel.innerHTML=`<option value="">Otomatik En Doğal Türkçe Ses</option>`+v.map(x=>`<option value="${esc(x.name)}">${esc(x.name)} (${x.lang})</option>`).join(""); sel.value=getS().reader.voiceName||""; }
function stopTTS(){ if("speechSynthesis" in window)speechSynthesis.cancel(); if(aiAudio){aiAudio.pause();aiAudio=null;} ttsOn=false; if(ttsBtn){ttsBtn.textContent="🎧";ttsBtn=null;} }
async function toggleTTS(text, btn){
  if(ttsOn){stopTTS();return;} const S=getS(), clean=(text||"").trim(); if(!clean)return toast("Metin yok");
  ttsOn=true; ttsBtn=btn; btn.textContent="⏹";
  if(S.reader.ttsMode==="ai" && S.apiKey){
    const parts=splitChunks(clean,1500);
    for(let i=0;i<parts.length&&ttsOn;i++){
      try{
        const res=await fetch(S.baseUrl.replace(/\/+$/,"")+"/audio/speech",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+S.apiKey},body:JSON.stringify({model:"tts-1",voice:"alloy",input:parts[i],speed:S.reader.ttsRate||1})});
        if(!res.ok)throw new Error("AI TTS bu API'de yok; Çoklu Karakter TTS'e geç!");
        const url=URL.createObjectURL(await res.blob());
        await new Promise((r2,j2)=>{if(!ttsOn){URL.revokeObjectURL(url);return r2();}aiAudio=new Audio(url);aiAudio.onended=()=>{URL.revokeObjectURL(url);r2();};aiAudio.onerror=()=>{URL.revokeObjectURL(url);j2(new Error("Ses hatası"));};aiAudio.play().catch(j2);});
      }catch(e){toast(e.message);stopTTS();break;}
    }
    stopTTS(); return;
  }
  if(!("speechSynthesis" in window)){stopTTS();return toast("Desteklenmiyor");}
  const voices=speechSynthesis.getVoices(), trV=voices.filter(v=>v.lang.startsWith("tr"));
  const mv=voices.find(v=>v.name===S.reader.voiceName)||trV.find(v=>/google|neural|network|natural/i.test(v.name))||trV[0];
  const segments=[];
  if(S.reader.ttsMode==="multi"){
    let ci=0; const pitches=[1.14,0.88,1.24,0.82];
    for(const seg of clean.split(/([“"][^”"]+[”"])/g)){ const t=seg.trim(); if(!t)continue; const isQ=/^[“"]/.test(t), pitch=isQ?pitches[(ci++)%pitches.length]:0.98; (t.match(/[^.!?\n]+[.!?\n]*/g)||[t]).forEach(s=>{if(s.trim())segments.push({txt:s.trim().replace(/^[“"]|[”"]$/g,""),pitch,rate:(S.reader.ttsRate||1)*(isQ?1.04:1)});}); }
  } else { (clean.match(/[^.!?\n]+[.!?\n]*/g)||[clean]).forEach(s=>{if(s.trim())segments.push({txt:s.trim(),pitch:1,rate:S.reader.ttsRate||1});}); }
  let idx=0; const speakNext=()=>{if(!ttsOn||idx>=segments.length){stopTTS();return;}const sg=segments[idx++],u=new SpeechSynthesisUtterance(sg.txt);u.lang=S.tgtLang==="tr"?"tr-TR":S.tgtLang;if(mv)u.voice=mv;u.pitch=sg.pitch;u.rate=sg.rate;u.onend=speakNext;u.onerror=stopTTS;speechSynthesis.speak(u);};
  speakNext();
}
$("#rTtsBtn").onclick=()=>toggleTTS($("#rBody").innerText, $("#rTtsBtn"));

let ambCtx=null, ambGain=null, ambSrc=null, ambMode="";
function stopAmbient(){ try{ambSrc?.stop();ambCtx?.close();}catch{} ambCtx=null;ambGain=null;ambSrc=null;ambMode=""; $$("#ambBtns button").forEach(b=>b.classList.remove("primary")); }
function startAmbient(mode){
  if(ambMode===mode){stopAmbient();return;} stopAmbient(); ambMode=mode;
  const AC=window.AudioContext||window.webkitAudioContext; if(!AC)return toast("Desteklenmiyor");
  ambCtx=new AC(); const sr=ambCtx.sampleRate, len=sr*4, buf=ambCtx.createBuffer(1,len,sr), data=buf.getChannelData(0); let last=0;
  for(let i=0;i<len;i++){const w=Math.random()*2-1; last=(last+0.02*w)/1.02; data[i]=mode==="rain"?w*0.22+last*1.4:mode==="fire"?last*2.2+(Math.random()>0.9985?(Math.random()*2-1)*0.7:0):mode==="wind"?last*2.8*(0.65+0.35*Math.sin(i/(sr*0.9))):last*2.4+w*0.06;}
  ambSrc=ambCtx.createBufferSource(); ambSrc.buffer=buf; ambSrc.loop=true;
  const filt=ambCtx.createBiquadFilter(); filt.type=mode==="rain"?"bandpass":"lowpass"; filt.frequency.value=mode==="rain"?1100:mode==="fire"?420:mode==="wind"?500:650;
  ambGain=ambCtx.createGain(); ambGain.gain.value=(Number($("#ambVolRange").value)||35)/100*0.35;
  ambSrc.connect(filt); filt.connect(ambGain); ambGain.connect(ambCtx.destination); ambSrc.start();
  $$("#ambBtns button").forEach(b=>b.classList.toggle("primary",b.dataset.amb===mode)); toast("Ambiyans başladı 🎧");
}
$$("#ambBtns button").forEach(b=>b.onclick=()=>startAmbient(b.dataset.amb));
$("#stopAmbBtn").onclick=()=>{stopAmbient();toast("Durduruldu");};
$("#ambVolRange").oninput=e=>{$("#ambVolVal").textContent=e.target.value;if(ambGain)ambGain.gain.value=(Number(e.target.value)/100)*0.35;};

/* ===================== 6. ÇÖP, TAKVİM, OPDS, ARAMA, DEPOLAMA, ALT MENÜ ===================== */
async function renderTrash(){
  const list=$("#trashList"), trashed=(await dbAll()).filter(b=>b.deletedAt);
  if(!trashed.length){list.innerHTML=`<div class="hint" style="text-align:center;padding:18px">Çöp kutusu boş.</div>`;return;}
  list.innerHTML=trashed.map(b=>`<div class="list-item"><div class="list-item-body"><div class="list-item-title">${esc(b.title)}</div><div class="list-item-sub">${Math.max(0,7-Math.floor((Date.now()-b.deletedAt)/86400000))} gün kaldı</div></div><button class="btn small ok" data-trest="${b.id}">Geri Al</button><button class="btn small danger" data-tdel="${b.id}">Sil</button></div>`).join("");
  list.querySelectorAll("[data-trest]").forEach(el=>el.onclick=async()=>{const b=await dbGet(el.dataset.trest);if(b){b.deletedAt=0;await dbPut(b);renderTrash();renderLibrary();toast("Geri yüklendi");}});
  list.querySelectorAll("[data-tdel]").forEach(el=>el.onclick=async()=>{await dbDel(el.dataset.tdel);renderTrash();});
}
$("#openTrashBtn").onclick=()=>{renderTrash();openModal("trashModal");};
$("#emptyTrashBtn").onclick=async()=>{if(!confirm("Boşaltılsın mı?"))return;for(const b of (await dbAll()).filter(x=>x.deletedAt))await dbDel(b.id);renderTrash();};

$("#openWrappedBtn").onclick=async()=>{
  const S=getS(), books=(await dbAll()).filter(b=>!b.deletedAt), mins=Math.floor((S.stats.totalSecs||0)/60), words=S.stats.totalWords||0;
  const fav=[...books].sort((a,b)=>(b.progress||0)-(a.progress||0))[0];
  $("#wrappedCard").innerHTML=`<div style="font-size:11px;letter-spacing:1px;opacity:.85">✨ ÇEVİRMEN AI WRAPPED ✨</div><div style="font-size:24px;font-weight:800;margin:6px 0">${words.toLocaleString("tr")} Kelime</div><div style="font-size:13px">⏱ ${mins} Dk · 🔥 ${S.stats.streak||0} Gün · 📚 ${books.length} Kitap</div>${fav?`<div style="margin-top:8px;font-size:12px;background:#0005;padding:6px 9px;border-radius:9px">🏆 En Çok Okunan: <b>${esc(fav.title)}</b> (%${fav.progress||0})</div>`:""}`;
  const hm=$("#activityHeatmap"); hm.innerHTML=""; const now=new Date();
  for(let d=69;d>=0;d--){const dt=new Date(now.getTime()-d*86400000).toISOString().slice(0,10), sec=S.dailyActivity?.[dt]||0; hm.innerHTML+=`<div class="hm-cell ${sec>1800?"hm-4":sec>600?"hm-3":sec>180?"hm-2":sec>0?"hm-1":""}" title="${dt}"></div>`;}
  openModal("wrappedModal");
};

$("#openOpdsBtn").onclick=()=>openModal("opdsModal");
$("#opdsLoadBtn").onclick=async()=>{
  const url=$("#opdsUrlInput").value.trim(), st=$("#opdsStatus"), list=$("#opdsList"); if(!url)return;
  st.className="status"; st.textContent="Yükleniyor…"; list.innerHTML="";
  try{
    let xml=""; try{const r=await fetch(url);if(r.ok)xml=await r.text();}catch{}
    if(!xml){const r2=await fetch("https://api.allorigins.win/raw?url="+encodeURIComponent(url));if(r2.ok)xml=await r2.text();}
    if(!xml)throw new Error("Katalog alınamadı");
    const doc=new DOMParser().parseFromString(xml,"application/xml"), entries=[...doc.querySelectorAll("entry")];
    list.innerHTML=entries.slice(0,30).map(e=>{const t=e.querySelector("title")?.textContent?.trim()||"Kitap",a=e.querySelector("author name")?.textContent?.trim()||"",ep=[...e.querySelectorAll("link")].find(l=>(l.getAttribute("type")||"").includes("epub"))?.getAttribute("href")||"",abs=ep?new URL(ep,url).href:"";return `<div class="list-item"><div class="list-item-body"><div class="list-item-title">${esc(t)}</div><div class="list-item-sub">${esc(a)}</div></div>${abs?`<button class="btn primary small" data-opdl="${esc(abs)}" data-opnm="${esc(t)}">⬇</button>`:""}</div>`;}).join("");
    list.querySelectorAll("[data-opdl]").forEach(b=>b.onclick=async()=>{toast("İndiriliyor…");try{const r=await fetch(b.dataset.opdl);if(!r.ok)throw 0;await importBookFile(new File([await r.blob()],b.dataset.opnm.slice(0,40)+".epub"));renderLibrary();}catch{openRealBrowser(b.dataset.opdl);closeModal("opdsModal");}});
    st.className="status ok"; st.textContent=`${entries.length} öğe listelendi.`;
  }catch(e){st.className="status error";st.textContent=e.message;}
};

$("#openQuickSearch").onclick=()=>{$("#qsInput").value="";$("#qsResults").innerHTML="";openModal("quickSearchModal");setTimeout(()=>$("#qsInput").focus(),120);};
$("#qsInput").oninput=async e=>{
  const q=e.target.value.trim().toLowerCase(), box=$("#qsResults"); if(!q){box.innerHTML="";return;}
  const S=getS(), books=(await dbAll()).filter(b=>!b.deletedAt&&(b.title+" "+(b.author||"")+" "+(b.series||"")).toLowerCase().includes(q));
  const quotes=S.highlights.filter(h=>(h.text+" "+h.note).toLowerCase().includes(q)), gloss=S.glossary.filter(g=>(g.src+" "+g.tgt).toLowerCase().includes(q));
  let html="";
  books.slice(0,6).forEach(b=>html+=`<div class="list-item" data-qb="${b.id}" style="cursor:pointer"><div class="list-item-body"><div class="list-item-title">📚 ${esc(b.title)}</div><div class="list-item-sub">${esc(b.format)} · %${b.progress||0}</div></div></div>`);
  quotes.slice(0,5).forEach(h=>html+=`<div class="list-item"><div class="list-item-body"><div class="list-item-title">🖍️ "${esc(h.text.slice(0,70))}"</div><div class="list-item-sub">${esc(h.bookTitle)}</div></div></div>`);
  gloss.slice(0,5).forEach(g=>html+=`<div class="list-item"><div class="list-item-body"><div class="list-item-title">📖 ${esc(g.src)} → ${esc(g.tgt)}</div></div></div>`);
  box.innerHTML=html||`<div class="hint" style="text-align:center;padding:14px">Sonuç yok.</div>`;
  box.querySelectorAll("[data-qb]").forEach(el=>el.onclick=()=>{closeModal("quickSearchModal");openBookReader(el.dataset.qb);});
};

$("#openStorageBtn").onclick=async()=>{
  const books=await dbAll(), lsKB=Math.round((localStorage.getItem("cevirmen_ai_native_v5")||"").length/1024);
  const estMB=(books.reduce((a,b)=>a+JSON.stringify(b).length,0)/(1024*1024)).toFixed(2);
  $("#storageInfo").innerHTML=`<div class="list-item"><div class="list-item-body"><div class="list-item-title">📚 Kütüphane</div><div class="list-item-sub">${books.length} kitap · ~${estMB} MB</div></div></div><div class="list-item"><div class="list-item-body"><div class="list-item-title">⚙ Ayarlar & Geçmiş</div><div class="list-item-sub">${lsKB} KB</div></div><button class="btn small danger" id="stClearHist">Geçmişi Sil</button></div>`;
  $("#stClearHist").onclick=()=>{getS().history=[];saveState();toast("Temizlendi");$("#openStorageBtn").click();};
  openModal("storageModal");
};

const ALL_NAV_ITEMS = [
  {id:"text", label:"Metin", svg:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6"/></svg>`},
  {id:"browser", label:"Tarayıcı", svg:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`},
  {id:"chat", label:"Sohbet", svg:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`},
  {id:"manga", label:"Manga", svg:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 10h8M8 14h5"/></svg>`},
  {id:"library", label:"Kütüphane", svg:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`},
  {id:"studio", label:"Stüdyo", svg:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3 7h7l-5.5 4.5L18.5 21 12 16.5 5.5 21l2-7.5L2 9h7z"/></svg>`},
  {id:"settings", label:"Ayarlar", svg:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l-.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`}
];

function renderBottomNav(){
  const S = getS(), nav = $("#bottomNav");
  // Eski sürümden geçen kullanıcılar için Sohbet sekmesini otomatik ekle
  if(!S.v6ChatAdded){
    S.navTabs = S.navTabs || ALL_NAV_ITEMS.map(x=>x.id);
    if(!S.navTabs.includes("chat")) S.navTabs.splice(2, 0, "chat");
    S.v6ChatAdded = true; saveState();
  }
  const enabled = new Set(S.navTabs || ALL_NAV_ITEMS.map(x=>x.id)); enabled.add("settings");
  const activeView = document.querySelector(".view.active")?.id?.replace("view-","") || "text";
  nav.innerHTML = ALL_NAV_ITEMS.filter(it=>enabled.has(it.id)).map(it=>`<button class="${it.id===activeView?'active':''}" data-view="${it.id}">${it.svg}<span>${it.label}</span></button>`).join("");
  nav.querySelectorAll("button").forEach(b=>b.onclick=()=>{ switchView(b.dataset.view); if(b.dataset.view==="chat") renderChat(); });
}

$("#openNavCustBtn").onclick=()=>{
  const S=getS(), enabled=new Set(S.navTabs||ALL_NAV_ITEMS.map(x=>x.id));
  $("#navCustList").innerHTML=ALL_NAV_ITEMS.filter(x=>x.id!=="settings").map(it=>`<label class="switch" style="margin:7px 0"><span>${it.label}</span><input type="checkbox" class="nc-chk" value="${it.id}" ${enabled.has(it.id)?"checked":""}></label>`).join("");
  $$(".nc-chk").forEach(c=>c.onchange=()=>{S.navTabs=[...$$(".nc-chk:checked").map(x=>x.value),"settings"];saveState();renderBottomNav();});
  openModal("navCustModal");
};

$("#openDebugBtn").onclick=()=>{$("#debugLogs").textContent=DEBUG_LOGS.length?DEBUG_LOGS.join("\n"):"Henüz hata yok ✅";openModal("debugModal");};
$("#clearDebugBtn").onclick=()=>{DEBUG_LOGS.length=0;$("#debugLogs").textContent="Temizlendi.";};

C.toggleTTS=toggleTTS; C.stopTTS=stopTTS; C.populateVoices=populateVoices;
C.initExtras=()=>{ renderFmhy(); renderPromptMarket(); renderChat(); renderBottomNav(); debugLog("SYS","Çevirmen AI v6.0 hazır"); };
C.initExtras();
})();
