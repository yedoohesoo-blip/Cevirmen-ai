(() => {
"use strict";
const C = window.CAI;
if(!C) return;
const {$, $$, esc, uid, toast, openModal, closeModal, debugLog, DEBUG_LOGS, getS, saveState, callAI, splitChunks, dbAll, dbGet, dbPut, dbDel, openRealBrowser, renderLibrary, openBookReader, renderPromptUI, switchView, importBookFile, R} = C;

/* ===================== 1. FMHY OKUMA MERKEZİ (fmhy.net/reading) ===================== */
const FMHY_SITES = {
  novels: [
    {name:"NovelBin", url:"https://novelbin.com"},
    {name:"LightNovelWorld", url:"https://www.lightnovelworld.co"},
    {name:"RoyalRoad", url:"https://www.royalroad.com"},
    {name:"WebNovel", url:"https://www.webnovel.com"},
    {name:"WuxiaWorld", url:"https://www.wuxiaworld.com"},
    {name:"NovelUpdates", url:"https://www.novelupdates.com"},
    {name:"ScribbleHub", url:"https://www.scribblehub.com"},
    {name:"AO3", url:"https://archiveofourown.org"}
  ],
  manga: [
    {name:"MangaDex", url:"https://mangadex.org"},
    {name:"ComicK", url:"https://comick.io"},
    {name:"AsuraScans", url:"https://asuracomic.net"},
    {name:"Webtoons", url:"https://www.webtoons.com/en/"},
    {name:"MANGA Plus", url:"https://mangaplus.shueisha.co.jp"},
    {name:"MangaFire", url:"https://mangafire.to"},
    {name:"Bato.to", url:"https://bato.to"},
    {name:"WeebCentral", url:"https://weebcentral.com"}
  ],
  ebooks: [
    {name:"Anna's Archive", url:"https://annas-archive.org"},
    {name:"Standard Ebooks", url:"https://standardebooks.org"},
    {name:"Project Gutenberg", url:"https://www.gutenberg.org"},
    {name:"Open Library", url:"https://openlibrary.org"},
    {name:"OceanofPDF", url:"https://oceanofpdf.com"},
    {name:"FMHY Reading", url:"https://fmhy.net/reading"}
  ]
};

let fmhyCat = "novels";
function renderFmhy(){
  const g = $("#fmhyGrid"); if(!g) return;
  g.innerHTML = (FMHY_SITES[fmhyCat]||[]).map(s=>`
    <div class="bm-tile" data-furl="${esc(s.url)}">
      <div class="bm-ico" style="background:linear-gradient(135deg,var(--primary),#c026d3)">${esc(s.name[0])}</div>
      <div class="bm-name">${esc(s.name)}</div>
    </div>`).join("");
  g.querySelectorAll("[data-furl]").forEach(el=>el.onclick=()=>openRealBrowser(el.dataset.furl));

  const mg = $("#mangaSitesGrid");
  if(mg){
    mg.innerHTML = FMHY_SITES.manga.map(s=>`
      <div class="bm-tile" data-ms="${esc(s.url)}">
        <div class="bm-ico" style="background:linear-gradient(135deg,#c026d3,#8b5cf6)">${esc(s.name[0])}</div>
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
$("#mSiteGoBtn").onclick=()=>{const q=$("#mSiteInput").value.trim(); openRealBrowser(q||"https://mangadex.org");};
$("#mSiteInput").addEventListener("keydown",e=>{if(e.key==="Enter")$("#mSiteGoBtn").click();});

/* ===================== 2. PROMPT PAZAR YERİ ===================== */
const PROMPT_MARKET = [
  {name:"⚔️ Xianxia / Wuxia / Cultivation", desc:"Yetişim seviyeleri, mezhepler ve kadim üslup.", text:"Sen uzman bir Xianxia/Wuxia çevirmenisin. Yetişim (cultivation) alemlerini, mezhep (sect) isimlerini, Qi/Dao terimlerini ve saygı ifadelerini (Kıdemli, Usta, Genç Efendi) atmosferi bozmadan doğal Türkçe ile çevir. Sadece çeviriyi yaz."},
  {name:"💬 Manhwa / Webtoon (Doğal Sokak Dili)", desc:"Günlük konuşma, espri ve gençlik tonu.", text:"Sen deneyimli bir Kore webtoon/manhwa çevirmenisin. Diyalogları robotik değil, gerçek günlük Türkçe konuşma diliyle, kısa ve vurucu çevir. Sadece çeviriyi yaz."},
  {name:"🎓 Akademik & Teknik Makale", desc:"Bilimsel terimleri koruyan resmi dil.", text:"Sen akademik bir çevirmensin. Teknik terimleri doğruluğunu bozmadan, nesnel, açık ve profesyonel bir Türkçe ile çevir. Sadece çeviriyi yaz."},
  {name:"🎮 Oyun Arayüzü & RPG Diyalog", desc:"Kısa menü, eşya açıklaması ve görev metinleri.", text:"Sen bir video oyunu yerelleştirme uzmanısın. Eşya, yetenek, görev ve diyalogları oyuncuların aşina olduğu doğal Türkçe oyun diliyle çevir. Sadece çeviriyi yaz."},
  {name:"🕵️ Korku / Gerilim / Gizem", desc:"Gerilimli, kısa cümleli atmosferik üslup.", text:"Sen gerilim ve korku edebiyatı çevirmenisin. Metnin tekinsiz atmosferini, tempo ve gerilimini koruyarak etkileyici bir Türkçe ile çevir. Sadece çeviriyi yaz."}
];
function renderPromptMarket(){
  const box = $("#promptMarketList"); if(!box) return;
  box.innerHTML = PROMPT_MARKET.map((p,i)=>`
    <div class="list-item">
      <div class="list-item-body">
        <div class="list-item-title">${esc(p.name)}</div>
        <div class="list-item-sub">${esc(p.desc)}</div>
      </div>
      <button class="btn primary small" data-pmadd="${i}">+ Ekle</button>
    </div>`).join("");
  box.querySelectorAll("[data-pmadd]").forEach(b=>b.onclick=()=>{
    const S = getS(), item = PROMPT_MARKET[Number(b.dataset.pmadd)];
    const np = {id:uid(), name:item.name, builtIn:false, text:item.text};
    S.prompts.push(np); S.activePromptId = np.id; saveState(); renderPromptUI();
    toast(`"${item.name}" eklendi ve aktif edildi ✨`);
  });
}

/* ===================== 3. SERİ WIKI & GÖRSEL KARAKTER İLİŞKİ HARİTASI ===================== */
let wikiTab = "chars";
$$("#wikiSeg button").forEach(b=>b.onclick=()=>{
  wikiTab=b.dataset.wt;
  $$("#wikiSeg button").forEach(x=>x.classList.toggle("active",x===b));
  renderWikiContent();
});
$("#rWikiBtn").onclick=()=>{ if(!R.book)return; R.book.wiki=R.book.wiki||{chars:[],relations:[],lore:[]}; renderWikiContent(); openModal("wikiModal"); };

$("#wikiScanChapBtn").onclick = async () => {
  if(!R.book) return;
  const ch = R.book.chapters[R.visChaps[R.chapIdx].origIdx];
  const tmp = document.createElement("div"); tmp.innerHTML = ch.trHtml || ch.html;
  const text = (tmp.innerText || "").slice(0, 9000);
  const btn = $("#wikiScanChapBtn"), st = $("#wikiStatus");
  btn.classList.add("busy"); btn.disabled=true; st.className="status"; st.textContent="🧠 Bölüm taranıyor ve eski Wiki bilgileri güncelleniyor…";
  const curWiki = R.book.wiki || {chars:[], relations:[], lore:[]};
  try{
    const raw = await callAI(`MEVCUT WIKI:\n${JSON.stringify(curWiki).slice(0,3000)}\n\nYENİ BÖLÜM (${ch.title}):\n${text}`, {
      system:`Sen bir roman bilgi kitabı (Wiki) editörüsün. Mevcut Wiki'yi yeni bölümdeki bilgilerle GÜNCELLE.
Eğer bir karakterin durumu, seviyesi, unvanı veya ilişkisi yeni bölümde değiştiyse ESKİSİNİ GÜNCELLE; yeni karakter, güç sistemi veya özel terim çıktıysa EKLE.
SADECE GEÇERLİ JSON DÖNDÜR:
{"chars":[{"name":"Ad","role":"Rol/Seviye","desc":"Güncel kısa bilgi"}],"relations":[{"a":"Karakter1","b":"Karakter2","type":"İlişki (örn: Rakip, Usta-Çırak, Dost)"}],"lore":[{"name":"Orijinal Terim","tr":"Türkçe Karşılık","desc":"Güç sistemi/mekan açıklaması"}]}`,
      streamOverride:false, temperature:0.2
    });
    const m = raw.match(/\{[\s\S]*\}/);
    if(!m) throw new Error("Wiki JSON alınamadı");
    const nw = JSON.parse(m[0]);
    R.book.wiki = {
      chars: Array.isArray(nw.chars) ? nw.chars : curWiki.chars,
      relations: Array.isArray(nw.relations) ? nw.relations : curWiki.relations,
      lore: Array.isArray(nw.lore) ? nw.lore : curWiki.lore
    };
    await dbPut(R.book);
    renderWikiContent();
    st.className="status ok"; st.textContent=`✅ Wiki güncellendi (${R.book.wiki.chars.length} karakter, ${R.book.wiki.lore.length} terim)`;
  }catch(e){ st.className="status error"; st.textContent="Hata: "+e.message; }
  finally{ btn.classList.remove("busy"); btn.disabled=false; }
};

function renderWikiContent(){
  const box = $("#wikiContent"), w = R.book?.wiki || {chars:[], relations:[], lore:[]};
  if(wikiTab === "chars"){
    if(!w.chars?.length){ box.innerHTML=`<div class="hint" style="text-align:center;padding:20px">Henüz karakter taranmadı. Yukarıdaki <b>Bu Bölümü Tara</b> butonuna bas!</div>`; return; }
    box.innerHTML = w.chars.map(c=>`<div class="list-item"><div class="list-item-body"><div class="list-item-title">👤 ${esc(c.name)} <span class="meta">(${esc(c.role||"")})</span></div><div class="list-item-sub">${esc(c.desc||"")}</div></div></div>`).join("");
  } else if(wikiTab === "lore"){
    if(!w.lore?.length){ box.innerHTML=`<div class="hint" style="text-align:center;padding:20px">Henüz güç sistemi veya özel terim yok.</div>`; return; }
    box.innerHTML = w.lore.map(l=>`<div class="list-item"><div class="list-item-body"><div class="list-item-title">⚡ ${esc(l.name)} → <span style="color:var(--accent)">${esc(l.tr||l.name)}</span></div><div class="list-item-sub">${esc(l.desc||"")}</div></div></div>`).join("");
  } else {
    // GÖRSEL SVG KARAKTER İLİŞKİ HARİTASI
    const names = [...new Set([...(w.chars||[]).map(c=>c.name), ...(w.relations||[]).flatMap(r=>[r.a,r.b])])].filter(Boolean).slice(0,12);
    if(names.length < 2){ box.innerHTML=`<div class="hint" style="text-align:center;padding:20px">İlişki haritası için en az 2 karakter taranmalı.</div>`; return; }
    const cx=175, cy=155, rad=110;
    const pos = {};
    names.forEach((n,i)=>{ const ang=(2*Math.PI*i)/names.length - Math.PI/2; pos[n]={x:Math.round(cx+rad*Math.cos(ang)), y:Math.round(cy+rad*Math.sin(ang))}; });
    const lines = (w.relations||[]).filter(r=>pos[r.a]&&pos[r.b]).map(r=>{
      const p1=pos[r.a], p2=pos[r.b], mx=(p1.x+p2.x)/2, my=(p1.y+p2.y)/2;
      return `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="#a855f7" stroke-width="1.6" stroke-opacity="0.7"/>
              <text x="${mx}" y="${my-3}" fill="#fde68a" font-size="9" text-anchor="middle">${esc((r.type||"").slice(0,16))}</text>`;
    }).join("");
    const nodes = names.map(n=>{
      const p=pos[n];
      return `<circle cx="${p.x}" cy="${p.y}" r="22" fill="#1a1229" stroke="#d946ef" stroke-width="2"/>
              <text x="${p.x}" y="${p.y+3}" fill="#fff" font-size="9.5" font-weight="700" text-anchor="middle">${esc(n.slice(0,10))}</text>`;
    }).join("");
    box.innerHTML = `<svg viewBox="0 0 350 310" style="width:100%;height:auto;background:#0a0612;border:1px solid var(--border);border-radius:14px">${lines}${nodes}</svg>`;
  }
}

/* ===================== 4. ÇOKLU KARAKTER TTS + ÜCRETSİZ ÇEVRİMDIŞI AMBİYANS ===================== */
let ttsOn=false, ttsBtn=null, aiAudio=null;
function populateVoices(){
  const sel=$("#rVoiceSel"); if(!sel) return;
  if(!("speechSynthesis" in window)){ sel.innerHTML="<option>Desteklenmiyor</option>"; return; }
  const voices=speechSynthesis.getVoices().filter(v=>/tr|en/i.test(v.lang));
  sel.innerHTML=`<option value="">Otomatik En Doğal Türkçe Ses</option>`+voices.map(v=>`<option value="${esc(v.name)}">${esc(v.name)} (${v.lang})</option>`).join("");
  sel.value=getS().reader.voiceName||"";
}
function stopTTS(){
  if("speechSynthesis" in window) speechSynthesis.cancel();
  if(aiAudio){ aiAudio.pause(); aiAudio=null; }
  ttsOn=false; if(ttsBtn){ ttsBtn.textContent="🎧"; ttsBtn=null; }
}
async function toggleTTS(text, btn){
  if(ttsOn){ stopTTS(); return; }
  const S = getS(), clean=(text||"").trim(); if(!clean) return toast("Okunacak metin yok");
  ttsOn=true; ttsBtn=btn; btn.textContent="⏹";

  if(S.reader.ttsMode==="ai" && S.apiKey){
    const parts = splitChunks(clean, 1500);
    for(let i=0; i<parts.length && ttsOn; i++){
      try{
        const res = await fetch(S.baseUrl.replace(/\/+$/,"")+"/audio/speech", {
          method:"POST", headers:{"Content-Type":"application/json","Authorization":"Bearer "+S.apiKey},
          body:JSON.stringify({model:"tts-1", voice:"alloy", input:parts[i], speed:S.reader.ttsRate||1})
        });
        if(!res.ok) throw new Error("AI TTS bu API'de yok; Çoklu Karakter Cihaz TTS'e geç!");
        const url = URL.createObjectURL(await res.blob());
        await new Promise((res2, rej2) => {
          if(!ttsOn){ URL.revokeObjectURL(url); return res2(); }
          aiAudio = new Audio(url);
          aiAudio.onended=()=>{ URL.revokeObjectURL(url); res2(); };
          aiAudio.onerror=()=>{ URL.revokeObjectURL(url); rej2(new Error("Ses çalınamadı")); };
          aiAudio.play().catch(rej2);
        });
      }catch(e){ toast(e.message); stopTTS(); break; }
    }
    stopTTS(); return;
  }

  if(!("speechSynthesis" in window)){ stopTTS(); return toast("TTS desteklenmiyor"); }
  const voices = speechSynthesis.getVoices();
  const trVoices = voices.filter(v=>v.lang.startsWith("tr"));
  const mainVoice = voices.find(v=>v.name===S.reader.voiceName) || trVoices.find(v=>/google|neural|network|natural/i.test(v.name)) || trVoices[0];

  // ÇOKLU KARAKTER PARÇALAMA: Tırnak içindeki diyaloglara farklı ton & hız ver!
  const segments = [];
  if(S.reader.ttsMode === "multi"){
    const parts = clean.split(/([“"][^”"]+[”"])/g);
    let charIdx = 0;
    const pitches = [1.14, 0.88, 1.24, 0.82];
    for(const seg of parts){
      const t = seg.trim(); if(!t) continue;
      const isQuote = /^[“"]/.test(t);
      const pitch = isQuote ? pitches[(charIdx++) % pitches.length] : 0.98;
      const sub = t.match(/[^.!?\n]+[.!?\n]*/g) || [t];
      sub.forEach(s => { if(s.trim()) segments.push({txt:s.trim().replace(/^[“"]|[”"]$/g,""), pitch, rate:(S.reader.ttsRate||1)*(isQuote?1.04:1.0)}); });
    }
  } else {
    (clean.match(/[^.!?\n]+[.!?\n]*/g)||[clean]).forEach(s=>{ if(s.trim()) segments.push({txt:s.trim(), pitch:1.0, rate:S.reader.ttsRate||1.0}); });
  }

  let idx = 0;
  const speakNext = () => {
    if(!ttsOn || idx >= segments.length){ stopTTS(); return; }
    const seg = segments[idx++];
    const u = new SpeechSynthesisUtterance(seg.txt);
    u.lang = S.tgtLang==="tr"?"tr-TR":S.tgtLang;
    if(mainVoice) u.voice = mainVoice;
    u.pitch = seg.pitch; u.rate = seg.rate;
    u.onend = speakNext; u.onerror = stopTTS;
    speechSynthesis.speak(u);
  };
  speakNext();
}
$("#rTtsBtn").onclick=()=>toggleTTS($("#rBody").innerText, $("#rTtsBtn"));

// 100% ÇEVRİMDIŞI WEB AUDIO AMBİYANS SES MOTORU (Yağmur, Şömine, Rüzgar, Kafe)
let ambCtx=null, ambGain=null, ambSrc=null, ambMode="";
function stopAmbient(){
  try{ ambSrc?.stop(); ambCtx?.close(); }catch{}
  ambCtx=null; ambGain=null; ambSrc=null; ambMode="";
  $$("#ambBtns button").forEach(b=>b.classList.remove("primary"));
}
function startAmbient(mode){
  if(ambMode === mode){ stopAmbient(); return; }
  stopAmbient(); ambMode = mode;
  const AC = window.AudioContext || window.webkitAudioContext;
  if(!AC) return toast("Web Audio desteklenmiyor");
  ambCtx = new AC();
  const sr = ambCtx.sampleRate, len = sr * 4, buf = ambCtx.createBuffer(1, len, sr), data = buf.getChannelData(0);
  let last = 0;
  for(let i=0; i<len; i++){
    const white = Math.random()*2 - 1;
    last = (last + 0.02 * white) / 1.02; // Brown noise tabanı
    if(mode==="rain") data[i] = white * 0.22 + last * 1.4;
    else if(mode==="fire") data[i] = last * 2.2 + (Math.random() > 0.9985 ? (Math.random()*2-1)*0.7 : 0);
    else if(mode==="wind") data[i] = last * 2.8 * (0.65 + 0.35 * Math.sin(i / (sr * 0.9)));
    else data[i] = last * 2.4 + white * 0.06;
  }
  ambSrc = ambCtx.createBufferSource(); ambSrc.buffer = buf; ambSrc.loop = true;
  const filt = ambCtx.createBiquadFilter();
  filt.type = mode==="rain" ? "bandpass" : "lowpass";
  filt.frequency.value = mode==="rain" ? 1100 : mode==="fire" ? 420 : mode==="wind" ? 500 : 650;
  ambGain = ambCtx.createGain();
  ambGain.gain.value = (Number($("#ambVolRange").value)||35) / 100 * 0.35;
  ambSrc.connect(filt); filt.connect(ambGain); ambGain.connect(ambCtx.destination);
  ambSrc.start();
  $$("#ambBtns button").forEach(b=>b.classList.toggle("primary", b.dataset.amb===mode));
  toast("Ambiyans sesi başladı 🎧");
}
$$("#ambBtns button").forEach(b=>b.onclick=()=>startAmbient(b.dataset.amb));
$("#stopAmbBtn").onclick=()=>{ stopAmbient(); toast("Ambiyans durduruldu"); };
$("#ambVolRange").oninput=e=>{ $("#ambVolVal").textContent=e.target.value; if(ambGain) ambGain.gain.value=(Number(e.target.value)/100)*0.35; };

/* ===================== 5. 7 GÜNLÜK ÇÖP KUTUSU ===================== */
async function renderTrash(){
  const list=$("#trashList"), trashed=(await dbAll()).filter(b=>b.deletedAt);
  if(!trashed.length){ list.innerHTML=`<div class="hint" style="text-align:center;padding:20px">Çöp kutusu boş.</div>`; return; }
  list.innerHTML = trashed.map(b=>{
    const leftDays = Math.max(0, 7 - Math.floor((Date.now()-b.deletedAt)/86400000));
    return `<div class="list-item"><div class="list-item-body"><div class="list-item-title">${esc(b.title)}</div><div class="list-item-sub">${leftDays} gün sonra kalıcı silinir</div></div>
      <button class="btn small ok" data-trest="${b.id}">Geri Al</button>
      <button class="btn small danger" data-tdel="${b.id}">Sil</button></div>`;
  }).join("");
  list.querySelectorAll("[data-trest]").forEach(el=>el.onclick=async()=>{const b=await dbGet(el.dataset.trest);if(b){b.deletedAt=0;await dbPut(b);renderTrash();renderLibrary();toast("Geri yüklendi");}});
  list.querySelectorAll("[data-tdel]").forEach(el=>el.onclick=async()=>{await dbDel(el.dataset.tdel);renderTrash();});
}
$("#openTrashBtn").onclick=()=>{renderTrash();openModal("trashModal");};
$("#emptyTrashBtn").onclick=async()=>{if(!confirm("Çöp kutusu kalıcı boşaltılsın mı?"))return; for(const b of (await dbAll()).filter(x=>x.deletedAt)) await dbDel(b.id); renderTrash(); toast("Boşaltıldı");};

/* ===================== 6. AKTİVİTE TAKVİMİ & WRAPPED KARTI ===================== */
$("#openWrappedBtn").onclick = async () => {
  const S = getS(), books = (await dbAll()).filter(b=>!b.deletedAt);
  const mins = Math.floor((S.stats.totalSecs||0)/60);
  const words = S.stats.totalWords||0;
  const favBook = [...books].sort((a,b)=>(b.progress||0)-(a.progress||0))[0];
  $("#wrappedCard").innerHTML = `
    <div style="font-size:12px;letter-spacing:1px;opacity:.85">✨ ÇEVİRMEN AI WRAPPED ✨</div>
    <div style="font-size:26px;font-weight:800;margin:8px 0">${words.toLocaleString("tr")} Kelime</div>
    <div style="font-size:14px;opacity:.92">⏱ ${mins} Dakika · 🔥 ${S.stats.streak||0} Gün Seri · 📚 ${books.length} Kitap</div>
    ${favBook?`<div style="margin-top:10px;font-size:13px;background:#0005;padding:7px 10px;border-radius:10px">🏆 En Çok Okunan: <b>${esc(favBook.title)}</b> (%${favBook.progress||0})</div>`:""}`;

  const hm = $("#activityHeatmap"); hm.innerHTML = "";
  const now = new Date();
  for(let d=69; d>=0; d--){
    const dt = new Date(now.getTime() - d*86400000).toISOString().slice(0,10);
    const sec = S.dailyActivity?.[dt] || 0;
    const lvl = sec > 1800 ? "hm-4" : sec > 600 ? "hm-3" : sec > 180 ? "hm-2" : sec > 0 ? "hm-1" : "";
    hm.innerHTML += `<div class="hm-cell ${lvl}" title="${dt}: ${Math.round(sec/60)} dk"></div>`;
  }
  openModal("wrappedModal");
};

/* ===================== 7. OPDS KATALOG TARAYICISI ===================== */
$("#openOpdsBtn").onclick = () => openModal("opdsModal");
$("#opdsLoadBtn").onclick = async () => {
  const url = $("#opdsUrlInput").value.trim(), st=$("#opdsStatus"), list=$("#opdsList");
  if(!url) return;
  st.className="status"; st.textContent="OPDS kataloğu yükleniyor…"; list.innerHTML="";
  try{
    let xmlText = "";
    try{ const r = await fetch(url); if(r.ok) xmlText = await r.text(); }catch{}
    if(!xmlText){ const r2 = await fetch("https://api.allorigins.win/raw?url="+encodeURIComponent(url)); if(r2.ok) xmlText = await r2.text(); }
    if(!xmlText) throw new Error("Katalog alınamadı");
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    const entries = [...doc.querySelectorAll("entry")];
    if(!entries.length) throw new Error("Katalogda kitap bulunamadı");
    list.innerHTML = entries.slice(0,30).map((e,i)=>{
      const title = e.querySelector("title")?.textContent?.trim() || "Kitap";
      const author = e.querySelector("author name")?.textContent?.trim() || "";
      const epubLink = [...e.querySelectorAll("link")].find(l=>(l.getAttribute("type")||"").includes("epub"))?.getAttribute("href") || "";
      const absEpub = epubLink ? new URL(epubLink, url).href : "";
      return `<div class="list-item"><div class="list-item-body"><div class="list-item-title">${esc(title)}</div><div class="list-item-sub">${esc(author)}</div></div>
        ${absEpub?`<button class="btn primary small" data-opdl="${esc(absEpub)}" data-opnm="${esc(title)}">⬇ Ekle</button>`:""}</div>`;
    }).join("");
    list.querySelectorAll("[data-opdl]").forEach(b=>b.onclick=async()=>{
      toast("EPUB indiriliyor…");
      try{
        const resp = await fetch(b.dataset.opdl);
        if(!resp.ok) throw new Error("Doğrudan indirilemedi, tarayıcıda açılıyor");
        await importBookFile(new File([await resp.blob()], b.dataset.opnm.slice(0,40)+".epub"));
        renderLibrary();
      }catch{ openRealBrowser(b.dataset.opdl); closeModal("opdsModal"); }
    });
    st.className="status ok"; st.textContent=`${entries.length} öğe listelendi.`;
  }catch(e){ st.className="status error"; st.textContent=e.message; }
};

/* ===================== 8. HIZLI ARAMA, DEPOLAMA, ALT MENÜ & KONSOL ===================== */
$("#openQuickSearch").onclick=()=>{ $("#qsInput").value=""; $("#qsResults").innerHTML=""; openModal("quickSearchModal"); setTimeout(()=>$("#qsInput").focus(),120); };
$("#qsInput").oninput = async e => {
  const q = e.target.value.trim().toLowerCase(), box=$("#qsResults");
  if(!q){ box.innerHTML=""; return; }
  const S = getS(), books = (await dbAll()).filter(b=>!b.deletedAt && (b.title+" "+(b.author||"")+" "+(b.series||"")).toLowerCase().includes(q));
  const quotes = S.highlights.filter(h=>(h.text+" "+h.note).toLowerCase().includes(q));
  const gloss = S.glossary.filter(g=>(g.src+" "+g.tgt).toLowerCase().includes(q));
  let html = "";
  books.slice(0,6).forEach(b=>html+=`<div class="list-item" data-qb="${b.id}" style="cursor:pointer"><div class="list-item-body"><div class="list-item-title">📚 ${esc(b.title)}</div><div class="list-item-sub">${esc(b.format)} · %${b.progress||0}</div></div></div>`);
  quotes.slice(0,5).forEach(h=>html+=`<div class="list-item"><div class="list-item-body"><div class="list-item-title">🖍️ "${esc(h.text.slice(0,70))}"</div><div class="list-item-sub">${esc(h.bookTitle)}</div></div></div>`);
  gloss.slice(0,5).forEach(g=>html+=`<div class="list-item"><div class="list-item-body"><div class="list-item-title">📖 ${esc(g.src)} → ${esc(g.tgt)}</div></div></div>`);
  box.innerHTML = html || `<div class="hint" style="text-align:center;padding:16px">Sonuç bulunamadı.</div>`;
  box.querySelectorAll("[data-qb]").forEach(el=>el.onclick=()=>{ closeModal("quickSearchModal"); openBookReader(el.dataset.qb); });
};

$("#openStorageBtn").onclick = async () => {
  const books = await dbAll();
  const lsKB = Math.round((localStorage.getItem("cevirmen_ai_native_v5")||"").length / 1024);
  const estMB = (books.reduce((a,b)=>a+JSON.stringify(b).length, 0) / (1024*1024)).toFixed(2);
  $("#storageInfo").innerHTML = `
    <div class="list-item"><div class="list-item-body"><div class="list-item-title">📚 Kütüphane (IndexedDB)</div><div class="list-item-sub">${books.length} kitap · ~${estMB} MB</div></div></div>
    <div class="list-item"><div class="list-item-body"><div class="list-item-title">⚙ Ayarlar & Geçmiş</div><div class="list-item-sub">${lsKB} KB</div></div>
      <button class="btn small danger" id="stClearHist">Geçmişi Sil</button></div>`;
  $("#stClearHist").onclick=()=>{ getS().history=[]; saveState(); toast("Geçmiş temizlendi"); $("#openStorageBtn").click(); };
  openModal("storageModal");
};

const ALL_NAV_ITEMS = [
  {id:"text", label:"Metin", svg:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6"/></svg>`},
  {id:"browser", label:"Tarayıcı", svg:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`},
  {id:"manga", label:"Manga", svg:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 10h8M8 14h5"/></svg>`},
  {id:"library", label:"Kütüphane", svg:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`},
  {id:"studio", label:"Stüdyo", svg:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3 7h7l-5.5 4.5L18.5 21 12 16.5 5.5 21l2-7.5L2 9h7z"/></svg>`},
  {id:"settings", label:"Ayarlar", svg:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`}
];

function renderBottomNav(){
  const S = getS(), nav = $("#bottomNav");
  const enabled = new Set(S.navTabs || ALL_NAV_ITEMS.map(x=>x.id));
  enabled.add("settings");
  const activeView = document.querySelector(".view.active")?.id?.replace("view-","") || "text";
  nav.innerHTML = ALL_NAV_ITEMS.filter(it=>enabled.has(it.id)).map(it=>
    `<button class="${it.id===activeView?'active':''}" data-view="${it.id}">${it.svg}<span>${it.label}</span></button>`
  ).join("");
  nav.querySelectorAll("button").forEach(b=>b.onclick=()=>switchView(b.dataset.view));
}

$("#openNavCustBtn").onclick = () => {
  const S = getS(), enabled = new Set(S.navTabs || ALL_NAV_ITEMS.map(x=>x.id));
  $("#navCustList").innerHTML = ALL_NAV_ITEMS.filter(x=>x.id!=="settings").map(it=>`
    <label class="switch" style="margin:8px 0"><span>${it.label}</span><input type="checkbox" class="nc-chk" value="${it.id}" ${enabled.has(it.id)?"checked":""}></label>`).join("");
  $$(".nc-chk").forEach(c=>c.onchange=()=>{
    S.navTabs = [...$$(".nc-chk:checked").map(x=>x.value), "settings"];
    saveState(); renderBottomNav();
  });
  openModal("navCustModal");
};

$("#openDebugBtn").onclick = () => {
  $("#debugLogs").textContent = DEBUG_LOGS.length ? DEBUG_LOGS.join("\n") : "Henüz hata veya log yok ✅";
  openModal("debugModal");
};
$("#clearDebugBtn").onclick = () => { DEBUG_LOGS.length = 0; $("#debugLogs").textContent = "Temizlendi."; };

C.toggleTTS = toggleTTS;
C.stopTTS = stopTTS;
C.populateVoices = populateVoices;
C.initExtras = () => { renderFmhy(); renderPromptMarket(); renderBottomNav(); debugLog("SYS", "Çevirmen AI v5.0 (S20 FE Optimize) hazır"); };
C.initExtras();
})();
