(() => {
"use strict";
const C = window.CAI;
if(!C) return;
const {$, $$, esc, uid, toast, openModal, closeModal, debugLog, DEBUG_LOGS, getS, saveState, callAI, splitChunks, dbAll, dbGet, dbPut, dbDel, openRealBrowser, renderLibrary, openBookReader, renderPromptUI, switchView, importBookFile, R} = C;
const isNative = () => !!(window.AndroidBridge && window.AndroidBridge.isNative && window.AndroidBridge.isNative());
const b64Dec = b64 => { const bin=atob(b64), bytes=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i); return new TextDecoder().decode(bytes); };

/* ===================== 1. ADGUARD VPN KALKANI + APP SHORTCUTS ===================== */
function updateVpnBtn(){
  const btn = $("#vpnToggleBtn"); if(!btn) return;
  const on = isNative() && window.AndroidBridge.isVpnRunning && window.AndroidBridge.isVpnRunning();
  btn.textContent = on ? "🛡️ VPN Açık" : "🛡️ AdGuard VPN";
  btn.classList.toggle("primary", !!on);
  btn.classList.toggle("ok", !on);
}
$("#vpnToggleBtn")?.addEventListener("click", () => {
  if(!isNative() || !window.AndroidBridge.toggleAdVpn) return toast("AdGuard VPN sadece Android APK içinde çalışır!");
  window.AndroidBridge.toggleAdVpn();
  setTimeout(updateVpnBtn, 600);
});

// UYGULAMA İKONUNA UZUN BASINCA ÇIKAN HIZLI KISAYOLLAR
window.__onAppShortcut = async sc => {
  if(sc === "overlay"){
    if(isNative() && window.AndroidBridge.startFloatingOverlay) window.AndroidBridge.startFloatingOverlay();
  } else if(sc === "chat"){
    switchView("chat"); renderChat(); populateChatBooks();
  } else if(sc === "browser"){
    switchView("browser");
  } else if(sc === "resume_book"){
    const books = (await dbAll()).filter(b=>!b.deletedAt).sort((a,b)=>(b.lastRead||0)-(a.lastRead||0));
    if(books.length){ switchView("library"); openBookReader(books[0].id); }
    else { switchView("library"); toast("Henüz okunmuş kitap yok"); }
  }
};

/* ===================== 2. DİYALOG RENKLENDİRME (OKUYUCU) ===================== */
function colorizeDialoguesInBody(){
  const S = getS();
  if(!S.reader.dlgColor) return;
  const body = $("#rBody"); if(!body) return;
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  let n; while((n = walker.nextNode())) {
    if(n.parentElement && (n.parentElement.classList.contains("dlg-span") || n.parentElement.tagName === "SCRIPT" || n.parentElement.tagName === "STYLE")) continue;
    if(/[“"][^”"]{2,}[”"]/.test(n.nodeValue)) nodes.push(n);
  }
  for(const tn of nodes){
    const span = document.createElement("span");
    span.innerHTML = esc(tn.nodeValue).replace(/([“"][^”"]{2,}[”"])/g, '<span class="dlg-span">$1</span>');
    tn.replaceWith(...span.childNodes);
  }
}
const rBodyEl = $("#rBody");
if(rBodyEl){
  let dlgLock = false;
  new MutationObserver(() => {
    if(dlgLock) return;
    dlgLock = true;
    try{ colorizeDialoguesInBody(); }finally{ setTimeout(() => dlgLock = false, 20); }
  }).observe(rBodyEl, {childList:true});
}
$("#rDlgColorToggle")?.addEventListener("change", e => {
  const S = getS(); S.reader.dlgColor = e.target.checked; saveState();
  if(S.reader.dlgColor) colorizeDialoguesInBody();
  else toast("Bir sonraki bölüm geçişinde normale döner");
});

/* ===================== 3. YENİ BÖLÜM TAKİPÇİSİ & BİLDİRİM GELEN KUTUSU ===================== */
const nativeFetchCallbacks = new Map();
window.__onNativeFetchDone = (reqId, b64) => {
  const cb = nativeFetchCallbacks.get(reqId);
  if(cb){ nativeFetchCallbacks.delete(reqId); cb(b64Dec(b64)); }
};
function fetchHtmlForWatch(url){
  return new Promise(async resolve => {
    if(isNative() && window.AndroidBridge.fetchUrlText){
      const id = "w_" + uid();
      const t = setTimeout(() => { if(nativeFetchCallbacks.has(id)){ nativeFetchCallbacks.delete(id); resolve(""); } }, 16000);
      nativeFetchCallbacks.set(id, html => { clearTimeout(t); resolve(html || ""); });
      window.AndroidBridge.fetchUrlText(id, url);
      return;
    }
    try{ const r = await fetch("https://api.allorigins.win/raw?url="+encodeURIComponent(url)); resolve(r.ok ? await r.text() : ""); }
    catch{ resolve(""); }
  });
}

function ensureWatchData(){
  const S = getS();
  if(!Array.isArray(S.watchlist)) S.watchlist = [];
  if(!Array.isArray(S.notifInbox)) S.notifInbox = [];
  return S;
}
function updateNotifBadge(){
  const S = ensureWatchData();
  const unread = S.notifInbox.filter(x=>!x.read).length;
  const b = $("#notifBadge"); if(!b) return;
  b.textContent = unread > 99 ? "99+" : unread;
  b.classList.toggle("show", unread > 0);
}
function extractLatestChapterFromHtml(html, baseUrl){
  if(!html) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const title = (doc.querySelector("h1")?.textContent || doc.title || "").replace(/\s+/g," ").trim();
  const links = [...doc.querySelectorAll("a[href]")].map(a => {
    let abs = ""; try{ abs = new URL(a.getAttribute("href"), baseUrl).href; }catch{}
    const txt = (a.textContent || "").replace(/\s+/g," ").trim();
    return {txt, url:abs};
  }).filter(l => l.url && l.txt && l.txt.length < 95);

  // Bölüm numarası içeren linklerden en yüksek numaralıyı bul
  let best = null, bestNum = -1;
  for(const l of links){
    const m = (l.txt + " " + l.url).match(/(?:chapter|ch\.?|bölüm|bolum|episode|ep\.?)[-\s_/:]*(\d+(?:\.\d+)?)/i);
    if(m){
      const num = parseFloat(m[1]);
      if(num > bestNum){ bestNum = num; best = {label: l.txt || `Bölüm ${m[1]}`, url: l.url, sig: `ch_${m[1]}`}; }
    }
  }
  if(best) return {seriesTitle: title, ...best};
  return {seriesTitle: title, label: title || baseUrl, url: baseUrl, sig: "t_" + title.slice(0,60)};
}

window.__onAddWatchFromBrowser = (t64, u64) => {
  const title = b64Dec(t64).replace(/\s*[-|–:]\s*(Chapter|Bölüm|Ch\.?).*$/i,"").trim() || "Takip Edilen Seri";
  const url = b64Dec(u64).trim();
  if(!url) return;
  const S = ensureWatchData();
  if(!S.watchlist.some(w=>w.url === url)){
    S.watchlist.unshift({id:uid(), name:title.slice(0,55), url, lastSig:"", lastLabel:"Henüz taranmadı", lastCheck:0});
    saveState();
  }
};

async function checkAllWatchedSeries(silent=false){
  const S = ensureWatchData();
  if(!S.watchlist.length){ if(!silent) toast("Takip listesi boş"); return; }
  const btn = $("#watchCheckNowBtn"), st = $("#notifStatus");
  if(btn){ btn.classList.add("busy"); btn.disabled = true; }
  if(st && !silent){ st.className="status"; st.textContent="🔍 Takip edilen seriler kontrol ediliyor…"; }

  let newCount = 0;
  for(const item of S.watchlist){
    const html = await fetchHtmlForWatch(item.url);
    const info = extractLatestChapterFromHtml(html, item.url);
    item.lastCheck = Date.now();
    if(!info) continue;
    if(item.lastSig && info.sig !== item.lastSig){
      S.notifInbox.unshift({
        id:uid(), date:Date.now(), read:false,
        series: item.name, label: info.label, url: info.url
      });
      if(S.notifInbox.length > 60) S.notifInbox.length = 60;
      newCount++;
    }
    item.lastSig = info.sig;
    item.lastLabel = info.label;
  }
  S.lastAutoWatchCheck = Date.now();
  saveState(); updateNotifBadge(); renderNotifModal();
  if(btn){ btn.classList.remove("busy"); btn.disabled = false; }
  if(st && !silent){
    st.className = newCount ? "status ok" : "status";
    st.textContent = newCount ? `🎉 ${newCount} yeni bölüm bildirim kutuna düştü!` : "Tüm seriler kontrol edildi, yeni bölüm yok.";
  } else if(newCount > 0){
    toast(`🔔 ${newCount} yeni bölüm yayınlandı!`);
  }
}

let notifTab = "inbox";
function renderNotifModal(){
  const S = ensureWatchData();
  $("#notifInboxArea").style.display = notifTab === "inbox" ? "block" : "none";
  $("#notifWatchArea").style.display = notifTab === "watch" ? "block" : "none";

  const ib = $("#notifInboxList");
  if(ib){
    ib.innerHTML = S.notifInbox.length ? S.notifInbox.map(n=>`
      <div class="list-item" style="${n.read?'opacity:.65':'border-color:var(--primary);background:#8b5cf618'}">
        <div class="list-item-body" data-nopen="${n.id}" style="cursor:pointer">
          <div class="list-item-title">${n.read?'':'🔴 '}${esc(n.series)}</div>
          <div class="list-item-sub" style="color:var(--accent)">${esc(n.label)} · ${new Date(n.date).toLocaleString("tr")}</div>
        </div>
        <button class="btn small danger" data-ndel="${n.id}">✕</button>
      </div>`).join("") : `<div class="hint" style="text-align:center;padding:22px">Gelen kutusu boş. Takip ettiğin serilerde yeni bölüm çıkınca burada birikir!</div>`;
    ib.querySelectorAll("[data-nopen]").forEach(el=>el.onclick=()=>{
      const it = S.notifInbox.find(x=>x.id===el.dataset.nopen); if(!it) return;
      it.read = true; saveState(); updateNotifBadge(); closeModal("notifModal");
      openRealBrowser(it.url);
    });
    ib.querySelectorAll("[data-ndel]").forEach(b=>b.onclick=()=>{ S.notifInbox=S.notifInbox.filter(x=>x.id!==b.dataset.ndel); saveState(); updateNotifBadge(); renderNotifModal(); });
  }

  const wl = $("#watchList");
  if(wl){
    wl.innerHTML = S.watchlist.length ? S.watchlist.map(w=>`
      <div class="list-item">
        <div class="list-item-body" data-wgo="${esc(w.url)}" style="cursor:pointer">
          <div class="list-item-title">👁️ ${esc(w.name)}</div>
          <div class="list-item-sub">Son: ${esc(w.lastLabel||"-")}</div>
        </div>
        <button class="btn small danger" data-wdel="${w.id}">✕</button>
      </div>`).join("") : `<div class="hint" style="text-align:center;padding:18px">Henüz takip edilen seri yok. Yukarıdan link ekle veya tarayıcıda ⚙ → 🔔 Takibe Ekle de!</div>`;
    wl.querySelectorAll("[data-wgo]").forEach(el=>el.onclick=()=>{ closeModal("notifModal"); openRealBrowser(el.dataset.wgo); });
    wl.querySelectorAll("[data-wdel]").forEach(b=>b.onclick=()=>{ S.watchlist=S.watchlist.filter(x=>x.id!==b.dataset.wdel); saveState(); renderNotifModal(); });
  }
}

$$("#notifSeg button").forEach(b=>b.onclick=()=>{ notifTab=b.dataset.nt; $$("#notifSeg button").forEach(x=>x.classList.toggle("active",x===b)); renderNotifModal(); });
$("#openNotifBtn")?.addEventListener("click", () => { renderNotifModal(); openModal("notifModal"); });
$("#watchCheckNowBtn")?.addEventListener("click", () => checkAllWatchedSeries(false));
$("#watchAddBtn")?.addEventListener("click", () => {
  const raw = ($("#watchUrlInput").value||"").trim(); if(!raw) return toast("Seri linki yapıştır");
  const url = /^https?:\/\//i.test(raw) ? raw : "https://"+raw;
  const name = prompt("Seri adı:", url.replace(/^https?:\/\/(www\.)?/,"").split("/").slice(0,2).join(" / "));
  if(!name) return;
  const S = ensureWatchData();
  S.watchlist.unshift({id:uid(), name:name.trim(), url, lastSig:"", lastLabel:"Kontrol bekleniyor", lastCheck:0});
  $("#watchUrlInput").value = ""; saveState(); renderNotifModal(); toast("Takip listesine eklendi 🔔");
});
$("#notifMarkAllBtn")?.addEventListener("click", () => { ensureWatchData().notifInbox.forEach(n=>n.read=true); saveState(); updateNotifBadge(); renderNotifModal(); });
$("#notifClearBtn")?.addEventListener("click", () => { ensureWatchData().notifInbox=[]; saveState(); updateNotifBadge(); renderNotifModal(); });

/* ===================== 4. FMHY OKUMA MERKEZİ ===================== */
const FMHY_DEFAULTS = {
  novels: [
    {id:"fn1", name:"NovelBin", url:"https://novelbin.com"},{id:"fn2", name:"NovelFire", url:"https://novelfire.net"},
    {id:"fn3", name:"RoyalRoad", url:"https://www.royalroad.com"},{id:"fn4", name:"WebNovel", url:"https://www.webnovel.com"},
    {id:"fn5", name:"WuxiaWorld", url:"https://www.wuxiaworld.com"},{id:"fn6", name:"NovelUpdates", url:"https://www.novelupdates.com"},
    {id:"fn7", name:"ScribbleHub", url:"https://www.scribblehub.com"},{id:"fn8", name:"AO3", url:"https://archiveofourown.org"}
  ],
  manga: [
    {id:"fm1", name:"MangaDex", url:"https://mangadex.org"},{id:"fm2", name:"ComicK", url:"https://comick.io"},
    {id:"fm3", name:"AsuraScans", url:"https://asuracomic.net"},{id:"fm4", name:"Webtoons", url:"https://www.webtoons.com/en/"},
    {id:"fm5", name:"MANGA Plus", url:"https://mangaplus.shueisha.co.jp"},{id:"fm6", name:"MangaFire", url:"https://mangafire.to"},
    {id:"fm7", name:"Bato.to", url:"https://bato.to"},{id:"fm8", name:"WeebCentral", url:"https://weebcentral.com"}
  ],
  ebooks: [
    {id:"fe1", name:"Anna's Archive", url:"https://annas-archive.org"},{id:"fe2", name:"Standard Ebooks", url:"https://standardebooks.org"},
    {id:"fe3", name:"Gutenberg", url:"https://www.gutenberg.org"},{id:"fe4", name:"Open Library", url:"https://openlibrary.org"},
    {id:"fe5", name:"OceanofPDF", url:"https://oceanofpdf.com"},{id:"fe6", name:"FMHY Reading", url:"https://fmhy.net/reading"}
  ]
};
function ensureFmhyData(){ const S=getS(); if(!S.fmhySites||!S.fmhySites.novels){S.fmhySites=structuredClone(FMHY_DEFAULTS);saveState();} return S.fmhySites; }
let fmhyCat = "novels";
function renderFmhy(){
  const data=ensureFmhyData(), list=data[fmhyCat]||[], g=$("#fmhyGrid");
  if(g){
    g.innerHTML = list.length ? list.map(s=>`<div class="bm-tile" data-furl="${esc(s.url)}"><button class="bm-del" data-fdel="${esc(s.id)}">✕</button><div class="bm-ico" style="background:linear-gradient(135deg,var(--primary),#c026d3)">${esc((s.name||"S")[0].toUpperCase())}</div><div class="bm-name">${esc(s.name)}</div></div>`).join("") : `<div class="hint" style="grid-column:1/-1;text-align:center;padding:12px">Liste boş.</div>`;
    g.querySelectorAll(".bm-tile").forEach(el=>el.onclick=e=>{if(!e.target.dataset.fdel)openRealBrowser(el.dataset.furl);});
    g.querySelectorAll("[data-fdel]").forEach(btn=>btn.onclick=e=>{e.stopPropagation();data[fmhyCat]=data[fmhyCat].filter(x=>x.id!==btn.dataset.fdel);saveState();renderFmhy();toast("Kaldırıldı");});
  }
  const mg=$("#mangaSitesGrid");
  if(mg){
    mg.innerHTML=(data.manga||[]).map(s=>`<div class="bm-tile" data-ms="${esc(s.url)}"><div class="bm-ico" style="background:linear-gradient(135deg,#c026d3,#8b5cf6)">${esc((s.name||"M")[0].toUpperCase())}</div><div class="bm-name">${esc(s.name)}</div></div>`).join("");
    mg.querySelectorAll("[data-ms]").forEach(el=>el.onclick=()=>openRealBrowser(el.dataset.ms));
  }
}
$$("#fmhySeg button").forEach(b=>b.onclick=()=>{fmhyCat=b.dataset.fc;$$("#fmhySeg button").forEach(x=>x.classList.toggle("active",x===b));renderFmhy();});
$("#openFmhyDirect").onclick=()=>openRealBrowser("https://fmhy.net/reading");
$("#fmhyAddBtn")?.addEventListener("click",()=>{ const u=prompt("Site URL:","https://");if(!u)return;const cu=/^https?:\/\//i.test(u.trim())?u.trim():"https://"+u.trim();const n=prompt("Site adı:",cu.replace(/^https?:\/\/(www\.)?/,"").split("/")[0]);if(!n)return;ensureFmhyData()[fmhyCat].unshift({id:uid(),name:n.trim(),url:cu});saveState();renderFmhy();toast("Eklendi ✅"); });
$("#fmhyRefreshBtn")?.addEventListener("click",()=>{ if(!confirm("Varsayılan siteler geri yüklensin mi?"))return;const d=ensureFmhyData(),ex=new Set(d[fmhyCat].map(x=>x.url));for(const x of (FMHY_DEFAULTS[fmhyCat]||[]))if(!ex.has(x.url))d[fmhyCat].push({...x});saveState();renderFmhy();toast("Yenilendi ↻"); });
$("#mSiteGoBtn").onclick=()=>{const q=$("#mSiteInput").value.trim();openRealBrowser(q||"https://mangadex.org");};
$("#mSiteInput").addEventListener("keydown",e=>{if(e.key==="Enter")$("#mSiteGoBtn").click();});

/* ===================== 5. AI SOHBET (GÖRSEL/DOSYA + ÖZEL PROMPT + KİTAPLA SOHBET) ===================== */
const CHAT_PERSONAS = {
  default:"Sen Çevirmen AI uygulamasının akıllı Türkçe asistanısın. Samimi, net ve yardımcı ol. Site önerirken tıklanabilir gerçek URL'ler (https://...) ver.",
  recommender:"Sen web novel, hafif roman, manga ve manhwa uzmanısın. Kullanıcının zevkine göre nokta atışı seri ve çalışan okuma siteleri (https://...) öner.",
  teacher:"Sen sabırlı bir İngilizce/Japonca dil öğretmenisin. Kelimeleri, grameri ve deyimleri örnek cümlelerle kolayca öğret.",
  editor:"Sen profesyonel bir edebiyat editörüsün. Metinleri edebi açıdan incele, akıcılık ve üslup önerileri ver.",
  rp:"Sen yaratıcı bir hikaye ve rol yapma (RP) partnerisin. Kullanıcının kurduğu evrene tamamen uyum sağlayarak sürükleyici yanıtlar ver."
};

let chatCtrl = null, chatAttachment = null; // {kind:'img'|'file', name, data}
function ensureChat(){ const S=getS(); if(!Array.isArray(S.chatHistory))S.chatHistory=[]; if(!S.chatSysPrompt)S.chatSysPrompt=CHAT_PERSONAS.default; return S.chatHistory; }
function formatChatHtml(txt){ return esc(txt).replace(/(https?:\/\/[^\s<>"')]+)/g, u => `<a href="#" data-chaturl="${u}">${u}</a>`); }

async function populateChatBooks(){
  const sel = $("#chatBookSel"); if(!sel) return;
  const cur = sel.value;
  const books = (await dbAll()).filter(b=>!b.deletedAt).sort((a,b)=>(b.lastRead||0)-(a.lastRead||0));
  sel.innerHTML = `<option value="">📚 Kitap Bağlama: Yok (Genel Sohbet)</option>` +
    books.map(b=>`<option value="${b.id}">📖 ${esc(b.title)} (${b.chapters.length} Bölüm)</option>`).join("");
  if(books.some(b=>b.id===cur)) sel.value = cur;
}

function renderChat(){
  const msgs=ensureChat(), box=$("#chatMsgs"); if(!box)return;
  if(!msgs.length){ box.innerHTML=`<div class="chat-msg ai">Merhaba! Fotoğraf/dosya gönderebilir, üstten kütüphanendeki bir kitabı bağlayıp <b>Kitapla Sohbet</b> edebilir veya <b>⚙ Prompt</b> tuşundan kendi özel sohbet kişiliğini yazabilirsin. ✨</div>`; return; }
  box.innerHTML = msgs.map(m => {
    const imgHtml = m.img ? `<img src="${m.img}" alt="">` : "";
    const fileTag = m.fileName ? `<div class="meta" style="margin-bottom:4px">📎 ${esc(m.fileName)}</div>` : "";
    return `<div class="chat-msg ${m.role==='user'?'user':'ai'}">${imgHtml}${fileTag}${m.role==='user'?esc(m.content):formatChatHtml(m.content)}</div>`;
  }).join("");
  box.querySelectorAll("[data-chaturl]").forEach(a=>a.onclick=e=>{e.preventDefault();openRealBrowser(a.dataset.chaturl);});
  box.scrollTop = box.scrollHeight;
}

// Görsel / Dosya Ekleme
$("#chatAttachBtn")?.addEventListener("click", () => $("#chatFileInput").click());
$("#chatFileInput")?.addEventListener("change", async e => {
  const f = e.target.files[0]; if(!f) return;
  if(f.type.startsWith("image/")){
    const img = new Image(); img.src = URL.createObjectURL(f); await new Promise(r=>img.onload=r);
    const c = document.createElement("canvas"), sc = Math.min(1, 1024/img.width);
    c.width = Math.round(img.width*sc); c.height = Math.round(img.height*sc);
    c.getContext("2d").drawImage(img,0,0,c.width,c.height);
    chatAttachment = {kind:"img", name:f.name, data:c.toDataURL("image/jpeg", 0.84)};
    $("#chatAttachImg").src = chatAttachment.data; $("#chatAttachImg").style.display = "block";
  } else {
    const txt = (await f.text()).slice(0, 14000);
    chatAttachment = {kind:"file", name:f.name, data:txt};
    $("#chatAttachImg").style.display = "none";
  }
  $("#chatAttachName").textContent = f.name;
  $("#chatAttachBox").classList.add("show");
  e.target.value = "";
});
$("#chatAttachClear")?.addEventListener("click", () => { chatAttachment = null; $("#chatAttachBox").classList.remove("show"); });

// Özel Sohbet Promptu Modalı
$("#chatPromptBtn")?.addEventListener("click", () => {
  ensureChat(); $("#chatSysPromptInput").value = getS().chatSysPrompt || CHAT_PERSONAS.default;
  openModal("chatPromptModal");
});
$$("#chatPersonaBtns button").forEach(b=>b.onclick=()=>{ $("#chatSysPromptInput").value = CHAT_PERSONAS[b.dataset.cp] || CHAT_PERSONAS.default; });
$("#saveChatPromptBtn")?.addEventListener("click", () => {
  getS().chatSysPrompt = $("#chatSysPromptInput").value.trim() || CHAT_PERSONAS.default;
  saveState(); closeModal("chatPromptModal"); toast("Özel sohbet promptu kaydedildi ✨");
});

async function sendChatMessage(overrideText=null){
  const S=getS(), inp=$("#chatInput");
  const text=(overrideText!==null?overrideText:inp.value).trim();
  if(!text && !chatAttachment) return;
  if(!S.apiKey||!S.model) return toast("Ayarlar'dan API Key ve Model seç!");
  if(overrideText===null) inp.value="";

  const att = chatAttachment; chatAttachment = null; $("#chatAttachBox").classList.remove("show");
  const msgs = ensureChat();
  msgs.push({role:"user", content:text || (att?.kind==="img"?"Bu görseli incele ve açıkla.":"Bu dosyayı incele."), img:att?.kind==="img"?att.data:null, fileName:att?.kind==="file"?att.name:null});
  msgs.push({role:"assistant", content:"…"});
  if(msgs.length > 40) msgs.splice(0, msgs.length - 40);
  saveState(); renderChat();

  // Kitap bağlıysa kitabın Wiki + aktif/yakın bölümlerini bağlam olarak ekle
  let sysText = S.chatSysPrompt || CHAT_PERSONAS.default;
  const bookId = $("#chatBookSel")?.value;
  if(bookId){
    const bk = await dbGet(bookId);
    if(bk){
      const curIdx = bk.curChap || 0;
      let excerpt = "";
      for(let i=Math.max(0,curIdx-1); i<=Math.min(bk.chapters.length-1,curIdx+1); i++){
        const d = document.createElement("div"); d.innerHTML = bk.chapters[i].trHtml || bk.chapters[i].html;
        excerpt += `\n[${bk.chapters[i].title}]: ${(d.innerText||"").slice(0,3200)}`;
      }
      sysText += `\n\nBAĞLI KİTAP: "${bk.title}" (${bk.chapters.length} bölüm, kullanıcı şu an ${curIdx+1}. bölümde).\nWIKI: ${JSON.stringify(bk.wiki||{}).slice(0,2200)}\nBÖLÜM İÇERİĞİ:${excerpt.slice(0,8500)}`;
    }
  }

  const apiMsgs = [{role:"system", content:sysText}];
  const histSlice = msgs.slice(0, -1).slice(-12);
  histSlice.forEach((m, idx) => {
    const isLast = idx === histSlice.length - 1;
    if(isLast && att?.kind === "img"){
      apiMsgs.push({role:"user", content:[{type:"text",text:m.content},{type:"image_url",image_url:{url:att.data}}]});
    } else if(isLast && att?.kind === "file"){
      apiMsgs.push({role:"user", content:`${m.content}\n\n[EKLİ DOSYA: ${att.name}]\n${att.data}`});
    } else {
      apiMsgs.push({role:m.role, content:m.content});
    }
  });

  chatCtrl?.abort(); chatCtrl = new AbortController();
  const btn=$("#chatSendBtn"), stop=$("#chatStopBtn");
  btn.classList.add("busy"); btn.disabled=true; stop.style.display="";
  try{
    const res = await fetch(S.baseUrl.replace(/\/+$/,"")+"/chat/completions", {
      method:"POST", headers:{"Content-Type":"application/json","Authorization":"Bearer "+S.apiKey},
      body:JSON.stringify({model:S.model, temperature:0.6, stream:!!S.stream, messages:apiMsgs}), signal:chatCtrl.signal
    });
    if(!res.ok) throw new Error("API ("+res.status+")");
    const last = msgs[msgs.length-1]; last.content = "";
    if(!S.stream || !res.body){
      const j = await res.json(); last.content = j?.choices?.[0]?.message?.content || ""; renderChat();
    } else {
      const reader = res.body.getReader(), dec = new TextDecoder(); let buf = "";
      while(true){
        const {done, value} = await reader.read(); if(done) break;
        buf += dec.decode(value,{stream:true}); const lines = buf.split("\n"); buf = lines.pop()||"";
        for(const l of lines){ const t=l.trim(); if(!t.startsWith("data:"))continue; const p=t.slice(5).trim(); if(p==="[DONE]")continue; try{const j=JSON.parse(p);const d=j?.choices?.[0]?.delta?.content??j?.choices?.[0]?.message?.content??"";if(d){last.content+=d;renderChat();}}catch{} }
      }
    }
    saveState();
  }catch(e){
    const last=msgs[msgs.length-1]; last.content = e.name==="AbortError" ? (last.content||"Durduruldu.") : ("❌ Hata: "+e.message); renderChat();
  }finally{ btn.classList.remove("busy"); btn.disabled=false; stop.style.display="none"; }
}
$("#chatSendBtn")?.addEventListener("click",()=>sendChatMessage());
$("#chatStopBtn")?.addEventListener("click",()=>chatCtrl?.abort());
$("#chatClearBtn")?.addEventListener("click",()=>{if(confirm("Sohbet temizlensin mi?")){getS().chatHistory=[];saveState();renderChat();}});
$("#chatInput")?.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChatMessage();}});
$$("#chatChips .chat-chip").forEach(ch=>ch.onclick=()=>sendChatMessage(ch.dataset.cq));

/* ===================== 6. PROMPT PAZARI, WIKI, TTS, AMBİYANS & DİĞERLERİ ===================== */
const PROMPT_MARKET = [
  {name:"⚔️ Xianxia / Wuxia / Cultivation", desc:"Yetişim seviyeleri, mezhepler ve kadim üslup.", text:"Sen uzman bir Xianxia/Wuxia çevirmenisin. Yetişim (cultivation) alemlerini, mezhep (sect) isimlerini, Qi/Dao terimlerini ve saygı ifadelerini doğal Türkçe ile çevir. Sadece çeviriyi yaz."},
  {name:"💬 Manhwa / Webtoon (Sokak Dili)", desc:"Günlük konuşma, espri ve gençlik tonu.", text:"Sen deneyimli bir Kore webtoon/manhwa çevirmenisin. Diyalogları gerçek günlük Türkçe konuşma diliyle, kısa ve vurucu çevir. Sadece çeviriyi yaz."},
  {name:"🎓 Akademik & Teknik", desc:"Bilimsel terimleri koruyan resmi dil.", text:"Sen akademik bir çevirmensin. Teknik terimleri doğruluğunu bozmadan profesyonel Türkçe ile çevir. Sadece çeviriyi yaz."},
  {name:"🎮 Oyun & RPG Diyalog", desc:"Eşya açıklaması ve görev metinleri.", text:"Sen video oyunu yerelleştirme uzmanısın. Eşya, yetenek ve diyalogları doğal Türkçe oyun diliyle çevir. Sadece çeviriyi yaz."},
  {name:"🕵️ Korku / Gerilim", desc:"Gerilimli atmosferik üslup.", text:"Sen gerilim ve korku edebiyatı çevirmenisin. Metnin tekinsiz atmosferini koruyarak çevir. Sadece çeviriyi yaz."}
];
function renderPromptMarket(){
  const box=$("#promptMarketList"); if(!box)return;
  box.innerHTML=PROMPT_MARKET.map((p,i)=>`<div class="list-item"><div class="list-item-body"><div class="list-item-title">${esc(p.name)}</div><div class="list-item-sub">${esc(p.desc)}</div></div><button class="btn primary small" data-pmadd="${i}">+ Ekle</button></div>`).join("");
  box.querySelectorAll("[data-pmadd]").forEach(b=>b.onclick=()=>{const S=getS(),it=PROMPT_MARKET[Number(b.dataset.pmadd)],np={id:uid(),name:it.name,builtIn:false,text:it.text};S.prompts.push(np);S.activePromptId=np.id;saveState();renderPromptUI();toast("Eklendi ✨");});
}

let wikiTab = "chars";
$$("#wikiSeg button").forEach(b=>b.onclick=()=>{wikiTab=b.dataset.wt;$$("#wikiSeg button").forEach(x=>x.classList.toggle("active",x===b));renderWikiContent();});
$("#wikiSearch")?.addEventListener("input", renderWikiContent);
$("#rWikiBtn").onclick=()=>{if(!R.book)return;R.book.wiki=R.book.wiki||{chars:[],relations:[],lore:[]};if($("#wikiSearch"))$("#wikiSearch").value="";renderWikiContent();openModal("wikiModal");};
$("#wikiManualAddBtn")?.addEventListener("click",async()=>{if(!R.book)return;R.book.wiki=R.book.wiki||{chars:[],relations:[],lore:[]};if(wikiTab==="lore"){const n=prompt("Orijinal Terim:");if(!n)return;R.book.wiki.lore.unshift({name:n.trim(),tr:(prompt("Türkçe:",n)||n).trim(),desc:(prompt("Açıklama:")||"").trim()});}else{const n=prompt("Karakter Adı:");if(!n)return;R.book.wiki.chars.unshift({name:n.trim(),role:(prompt("Rol/Seviye:")||"").trim(),desc:(prompt("Bilgi:")||"").trim()});}await dbPut(R.book);renderWikiContent();toast("Eklendi ✅");});
$("#wikiScanChapBtn").onclick=async()=>{
  if(!R.book)return; const ch=R.book.chapters[R.visChaps[R.chapIdx].origIdx], tmp=document.createElement("div"); tmp.innerHTML=ch.trHtml||ch.html;
  const btn=$("#wikiScanChapBtn"), st=$("#wikiStatus"), cur=R.book.wiki||{chars:[],relations:[],lore:[]};
  btn.classList.add("busy"); btn.disabled=true; st.className="status"; st.textContent="🧠 Taranıyor…";
  try{
    const raw=await callAI(`MEVCUT WIKI:\n${JSON.stringify(cur).slice(0,3200)}\n\nYENİ BÖLÜM (${ch.title}):\n${(tmp.innerText||"").slice(0,9500)}`,{system:`Roman Wiki editörüsün. Mevcut Wiki'yi yeni bölümle GÜNCELLE. SADECE JSON: {"chars":[{"name":"Ad","role":"Rol","desc":"Bilgi"}],"relations":[{"a":"K1","b":"K2","type":"İlişki"}],"lore":[{"name":"Orijinal","tr":"Türkçe","desc":"Açıklama"}]}`,streamOverride:false,temperature:0.2});
    const m=raw.match(/\{[\s\S]*\}/); if(!m)throw new Error("JSON alınamadı"); const nw=JSON.parse(m[0]);
    R.book.wiki={chars:Array.isArray(nw.chars)?nw.chars:cur.chars,relations:Array.isArray(nw.relations)?nw.relations:cur.relations,lore:Array.isArray(nw.lore)?nw.lore:cur.lore};
    await dbPut(R.book); renderWikiContent(); st.className="status ok"; st.textContent="✅ Güncellendi!";
  }catch(e){st.className="status error";st.textContent=e.message;} finally{btn.classList.remove("busy");btn.disabled=false;}
};
function renderWikiContent(){
  const box=$("#wikiContent"),w=R.book?.wiki||{chars:[],relations:[],lore:[]},q=($("#wikiSearch")?.value||"").trim().toLowerCase();
  if($("#wikiStatsBar"))$("#wikiStatsBar").textContent=`👤 ${w.chars?.length||0} Karakter · ⚡ ${w.lore?.length||0} Terim · 🕸️ ${w.relations?.length||0} İlişki`;
  if(wikiTab==="chars"){
    const list=(w.chars||[]).map((c,i)=>({...c,_i:i})).filter(c=>!q||(c.name+" "+c.role+" "+c.desc).toLowerCase().includes(q));
    if(!list.length){box.innerHTML=`<div class="hint" style="text-align:center;padding:18px">Bulunamadı.</div>`;return;}
    box.innerHTML=list.map(c=>{const rels=(w.relations||[]).filter(r=>r.a===c.name||r.b===c.name).map(r=>`<span style="display:inline-block;font-size:10.5px;padding:2px 7px;border-radius:999px;background:#8b5cf624;border:1px solid var(--border);margin:3px 4px 0 0;color:var(--accent)">${esc(r.a===c.name?r.b:r.a)} (${esc(r.type)})</span>`).join("");return `<div class="card" style="padding:10px;margin-bottom:8px;background:var(--surface2)"><div class="row" style="margin-bottom:4px"><div style="width:28px;height:28px;border-radius:9px;background:linear-gradient(135deg,var(--primary),var(--pink));display:grid;place-items:center;font-weight:800;font-size:13px;color:#fff;flex:0 0 28px">${esc((c.name||"?")[0].toUpperCase())}</div><div class="grow"><div style="font-size:13.5px;font-weight:700;color:#fff">${esc(c.name)}</div>${c.role?`<div style="font-size:11px;color:var(--accent)">${esc(c.role)}</div>`:""}</div><button class="btn small danger" data-wcdel="${c._i}">✕</button></div><div style="font-size:12.5px">${esc(c.desc||"")}</div>${rels?`<div style="margin-top:5px">${rels}</div>`:""}</div>`;}).join("");
    box.querySelectorAll("[data-wcdel]").forEach(b=>b.onclick=async()=>{R.book.wiki.chars.splice(Number(b.dataset.wcdel),1);await dbPut(R.book);renderWikiContent();});
  } else if(wikiTab==="lore"){
    const list=(w.lore||[]).map((l,i)=>({...l,_i:i})).filter(l=>!q||(l.name+" "+l.tr+" "+l.desc).toLowerCase().includes(q));
    if(!list.length){box.innerHTML=`<div class="hint" style="text-align:center;padding:18px">Bulunamadı.</div>`;return;}
    box.innerHTML=list.map(l=>`<div class="card" style="padding:10px;margin-bottom:8px;background:var(--surface2)"><div class="row" style="margin-bottom:4px"><div class="grow" style="font-size:13.5px;font-weight:700">⚡ ${esc(l.name)} → <span style="color:var(--accent)">${esc(l.tr||l.name)}</span></div><button class="btn small danger" data-wldel="${l._i}">✕</button></div><div style="font-size:12.5px;color:var(--muted)">${esc(l.desc||"")}</div></div>`).join("");
    box.querySelectorAll("[data-wldel]").forEach(b=>b.onclick=async()=>{R.book.wiki.lore.splice(Number(b.dataset.wldel),1);await dbPut(R.book);renderWikiContent();});
  } else {
    const rels=(w.relations||[]).filter(r=>!q||(r.a+" "+r.b+" "+r.type).toLowerCase().includes(q));
    const names=[...new Set([...(w.chars||[]).map(c=>c.name),...rels.flatMap(r=>[r.a,r.b])])].filter(n=>!q||n.toLowerCase().includes(q)||rels.some(r=>r.a===n||r.b===n)).slice(0,12);
    if(names.length<2){box.innerHTML=`<div class="hint" style="text-align:center;padding:18px">En az 2 karakter gerekli.</div>`;return;}
    const cx=175,cy=155,rad=112,pos={}; names.forEach((n,i)=>{const a=(2*Math.PI*i)/names.length-Math.PI/2;pos[n]={x:Math.round(cx+rad*Math.cos(a)),y:Math.round(cy+rad*Math.sin(a))};});
    const lines=rels.filter(r=>pos[r.a]&&pos[r.b]).map(r=>{const p1=pos[r.a],p2=pos[r.b],mx=(p1.x+p2.x)/2,my=(p1.y+p2.y)/2;return `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="#a855f7" stroke-width="1.8" stroke-opacity="0.75"/><rect x="${mx-30}" y="${my-10}" width="60" height="14" rx="5" fill="#110b1cee"/><text x="${mx}" y="${my}" fill="#fde68a" font-size="8.5" font-weight="600" text-anchor="middle">${esc((r.type||"").slice(0,13))}</text>`;}).join("");
    const nodes=names.map(n=>{const p=pos[n];return `<circle cx="${p.x}" cy="${p.y}" r="23" fill="#1a1229" stroke="#d946ef" stroke-width="2"/><text x="${p.x}" y="${p.y+3}" fill="#fff" font-size="9.5" font-weight="700" text-anchor="middle">${esc(n.slice(0,10))}</text>`;}).join("");
    box.innerHTML=`<svg viewBox="0 0 350 310" style="width:100%;height:auto;background:#0a0612;border:1px solid var(--border);border-radius:14px">${lines}${nodes}</svg>`;
  }
}

let ttsOn=false, ttsBtn=null, aiAudio=null;
function populateVoices(){ const sel=$("#rVoiceSel"); if(!sel)return; if(!("speechSynthesis" in window)){sel.innerHTML="<option>Desteklenmiyor</option>";return;} const v=speechSynthesis.getVoices().filter(x=>/tr|en/i.test(x.lang)); sel.innerHTML=`<option value="">Otomatik En Doğal Türkçe</option>`+v.map(x=>`<option value="${esc(x.name)}">${esc(x.name)} (${x.lang})</option>`).join(""); sel.value=getS().reader.voiceName||""; if($("#rDlgColorToggle"))$("#rDlgColorToggle").checked=!!getS().reader.dlgColor; }
function stopTTS(){ if("speechSynthesis" in window)speechSynthesis.cancel(); if(aiAudio){aiAudio.pause();aiAudio=null;} ttsOn=false; if(ttsBtn){ttsBtn.textContent="🎧";ttsBtn=null;} }
async function toggleTTS(text, btn){
  if(ttsOn){stopTTS();return;} const S=getS(), clean=(text||"").trim(); if(!clean)return toast("Metin yok");
  ttsOn=true; ttsBtn=btn; btn.textContent="⏹";
  if(S.reader.ttsMode==="ai" && S.apiKey){
    const parts=splitChunks(clean,1500);
    for(let i=0;i<parts.length&&ttsOn;i++){
      try{
        const res=await fetch(S.baseUrl.replace(/\/+$/,"")+"/audio/speech",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+S.apiKey},body:JSON.stringify({model:"tts-1",voice:"alloy",input:parts[i],speed:S.reader.ttsRate||1})});
        if(!res.ok)throw new Error("AI TTS desteklenmiyor");
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
$("#rTtsBtn").onclick=()=>toggleTTS($("#rBody").innerText,$("#rTtsBtn"));

let ambCtx=null,ambGain=null,ambSrc=null,ambMode="";
function stopAmbient(){try{ambSrc?.stop();ambCtx?.close();}catch{}ambCtx=null;ambGain=null;ambSrc=null;ambMode="";$$("#ambBtns button").forEach(b=>b.classList.remove("primary"));}
function startAmbient(mode){if(ambMode===mode){stopAmbient();return;}stopAmbient();ambMode=mode;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;ambCtx=new AC();const sr=ambCtx.sampleRate,len=sr*4,buf=ambCtx.createBuffer(1,len,sr),data=buf.getChannelData(0);let last=0;for(let i=0;i<len;i++){const w=Math.random()*2-1;last=(last+0.02*w)/1.02;data[i]=mode==="rain"?w*0.22+last*1.4:mode==="fire"?last*2.2+(Math.random()>0.9985?(Math.random()*2-1)*0.7:0):mode==="wind"?last*2.8*(0.65+0.35*Math.sin(i/(sr*0.9))):last*2.4+w*0.06;}ambSrc=ambCtx.createBufferSource();ambSrc.buffer=buf;ambSrc.loop=true;const f=ambCtx.createBiquadFilter();f.type=mode==="rain"?"bandpass":"lowpass";f.frequency.value=mode==="rain"?1100:mode==="fire"?420:mode==="wind"?500:650;ambGain=ambCtx.createGain();ambGain.gain.value=(Number($("#ambVolRange").value)||35)/100*0.35;ambSrc.connect(f);f.connect(ambGain);ambGain.connect(ambCtx.destination);ambSrc.start();$$("#ambBtns button").forEach(b=>b.classList.toggle("primary",b.dataset.amb===mode));toast("Ambiyans başladı 🎧");}
$$("#ambBtns button").forEach(b=>b.onclick=()=>startAmbient(b.dataset.amb));
$("#stopAmbBtn").onclick=()=>{stopAmbient();toast("Durduruldu");};
$("#ambVolRange").oninput=e=>{$("#ambVolVal").textContent=e.target.value;if(ambGain)ambGain.gain.value=(Number(e.target.value)/100)*0.35;};

async function renderTrash(){const list=$("#trashList"),tr=(await dbAll()).filter(b=>b.deletedAt);if(!tr.length){list.innerHTML=`<div class="hint" style="text-align:center;padding:18px">Çöp kutusu boş.</div>`;return;}list.innerHTML=tr.map(b=>`<div class="list-item"><div class="list-item-body"><div class="list-item-title">${esc(b.title)}</div><div class="list-item-sub">${Math.max(0,7-Math.floor((Date.now()-b.deletedAt)/86400000))} gün kaldı</div></div><button class="btn small ok" data-trest="${b.id}">Geri Al</button><button class="btn small danger" data-tdel="${b.id}">Sil</button></div>`).join("");list.querySelectorAll("[data-trest]").forEach(el=>el.onclick=async()=>{const b=await dbGet(el.dataset.trest);if(b){b.deletedAt=0;await dbPut(b);renderTrash();renderLibrary();toast("Geri yüklendi");}});list.querySelectorAll("[data-tdel]").forEach(el=>el.onclick=async()=>{await dbDel(el.dataset.tdel);renderTrash();});}
$("#openTrashBtn").onclick=()=>{renderTrash();openModal("trashModal");};
$("#emptyTrashBtn").onclick=async()=>{if(!confirm("Boşaltılsın mı?"))return;for(const b of (await dbAll()).filter(x=>x.deletedAt))await dbDel(b.id);renderTrash();};

$("#openWrappedBtn").onclick=async()=>{const S=getS(),books=(await dbAll()).filter(b=>!b.deletedAt),mins=Math.floor((S.stats.totalSecs||0)/60),words=S.stats.totalWords||0,fav=[...books].sort((a,b)=>(b.progress||0)-(a.progress||0))[0];$("#wrappedCard").innerHTML=`<div style="font-size:11px;letter-spacing:1px;opacity:.85">✨ ÇEVİRMEN AI WRAPPED ✨</div><div style="font-size:24px;font-weight:800;margin:6px 0">${words.toLocaleString("tr")} Kelime</div><div style="font-size:13px">⏱ ${mins} Dk · 🔥 ${S.stats.streak||0} Gün · 📚 ${books.length} Kitap</div>${fav?`<div style="margin-top:8px;font-size:12px;background:#0005;padding:6px 9px;border-radius:9px">🏆 En Çok Okunan: <b>${esc(fav.title)}</b> (%${fav.progress||0})</div>`:""}`;const hm=$("#activityHeatmap");hm.innerHTML="";const now=new Date();for(let d=69;d>=0;d--){const dt=new Date(now.getTime()-d*86400000).toISOString().slice(0,10),sec=S.dailyActivity?.[dt]||0;hm.innerHTML+=`<div class="hm-cell ${sec>1800?"hm-4":sec>600?"hm-3":sec>180?"hm-2":sec>0?"hm-1":""}" title="${dt}"></div>`;}openModal("wrappedModal");};

$("#openOpdsBtn").onclick=()=>openModal("opdsModal");
$("#opdsLoadBtn").onclick=async()=>{const url=$("#opdsUrlInput").value.trim(),st=$("#opdsStatus"),list=$("#opdsList");if(!url)return;st.className="status";st.textContent="Yükleniyor…";list.innerHTML="";try{let xml="";try{const r=await fetch(url);if(r.ok)xml=await r.text();}catch{}if(!xml){const r2=await fetch("https://api.allorigins.win/raw?url="+encodeURIComponent(url));if(r2.ok)xml=await r2.text();}if(!xml)throw new Error("Alınamadı");const doc=new DOMParser().parseFromString(xml,"application/xml"),entries=[...doc.querySelectorAll("entry")];list.innerHTML=entries.slice(0,30).map(e=>{const t=e.querySelector("title")?.textContent?.trim()||"Kitap",a=e.querySelector("author name")?.textContent?.trim()||"",ep=[...e.querySelectorAll("link")].find(l=>(l.getAttribute("type")||"").includes("epub"))?.getAttribute("href")||"",abs=ep?new URL(ep,url).href:"";return `<div class="list-item"><div class="list-item-body"><div class="list-item-title">${esc(t)}</div><div class="list-item-sub">${esc(a)}</div></div>${abs?`<button class="btn primary small" data-opdl="${esc(abs)}" data-opnm="${esc(t)}">⬇</button>`:""}</div>`;}).join("");list.querySelectorAll("[data-opdl]").forEach(b=>b.onclick=async()=>{toast("İndiriliyor…");try{const r=await fetch(b.dataset.opdl);if(!r.ok)throw 0;await importBookFile(new File([await r.blob()],b.dataset.opnm.slice(0,40)+".epub"));renderLibrary();}catch{openRealBrowser(b.dataset.opdl);closeModal("opdsModal");}});st.className="status ok";st.textContent=`${entries.length} öğe.`;}catch(e){st.className="status error";st.textContent=e.message;}};

$("#openQuickSearch").onclick=()=>{$("#qsInput").value="";$("#qsResults").innerHTML="";openModal("quickSearchModal");setTimeout(()=>$("#qsInput").focus(),120);};
$("#qsInput").oninput=async e=>{const q=e.target.value.trim().toLowerCase(),box=$("#qsResults");if(!q){box.innerHTML="";return;}const S=getS(),books=(await dbAll()).filter(b=>!b.deletedAt&&(b.title+" "+(b.author||"")+" "+(b.series||"")).toLowerCase().includes(q)),quotes=S.highlights.filter(h=>(h.text+" "+h.note).toLowerCase().includes(q)),gloss=S.glossary.filter(g=>(g.src+" "+g.tgt).toLowerCase().includes(q));let html="";books.slice(0,6).forEach(b=>html+=`<div class="list-item" data-qb="${b.id}" style="cursor:pointer"><div class="list-item-body"><div class="list-item-title">📚 ${esc(b.title)}</div><div class="list-item-sub">${esc(b.format)} · %${b.progress||0}</div></div></div>`);quotes.slice(0,5).forEach(h=>html+=`<div class="list-item"><div class="list-item-body"><div class="list-item-title">🖍️ "${esc(h.text.slice(0,70))}"</div><div class="list-item-sub">${esc(h.bookTitle)}</div></div></div>`);gloss.slice(0,5).forEach(g=>html+=`<div class="list-item"><div class="list-item-body"><div class="list-item-title">📖 ${esc(g.src)} → ${esc(g.tgt)}</div></div></div>`);box.innerHTML=html||`<div class="hint" style="text-align:center;padding:14px">Sonuç yok.</div>`;box.querySelectorAll("[data-qb]").forEach(el=>el.onclick=()=>{closeModal("quickSearchModal");openBookReader(el.dataset.qb);});};

$("#openStorageBtn").onclick=async()=>{const books=await dbAll(),lsKB=Math.round((localStorage.getItem("cevirmen_ai_native_v5")||"").length/1024),estMB=(books.reduce((a,b)=>a+JSON.stringify(b).length,0)/(1024*1024)).toFixed(2);$("#storageInfo").innerHTML=`<div class="list-item"><div class="list-item-body"><div class="list-item-title">📚 Kütüphane</div><div class="list-item-sub">${books.length} kitap · ~${estMB} MB</div></div></div><div class="list-item"><div class="list-item-body"><div class="list-item-title">⚙ Ayarlar</div><div class="list-item-sub">${lsKB} KB</div></div><button class="btn small danger" id="stClearHist">Geçmişi Sil</button></div>`;$("#stClearHist").onclick=()=>{getS().history=[];saveState();toast("Temizlendi");$("#openStorageBtn").click();};openModal("storageModal");};

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
  const S=getS(), nav=$("#bottomNav");
  if(!S.v6ChatAdded){ S.navTabs=S.navTabs||ALL_NAV_ITEMS.map(x=>x.id); if(!S.navTabs.includes("chat"))S.navTabs.splice(2,0,"chat"); S.v6ChatAdded=true; saveState(); }
  const enabled=new Set(S.navTabs||ALL_NAV_ITEMS.map(x=>x.id)); enabled.add("settings");
  const activeView=document.querySelector(".view.active")?.id?.replace("view-","")||"text";
  nav.innerHTML=ALL_NAV_ITEMS.filter(it=>enabled.has(it.id)).map(it=>`<button class="${it.id===activeView?'active':''}" data-view="${it.id}">${it.svg}<span>${it.label}</span></button>`).join("");
  nav.querySelectorAll("button").forEach(b=>b.onclick=()=>{ switchView(b.dataset.view); if(b.dataset.view==="chat"){renderChat();populateChatBooks();} if(b.dataset.view==="browser")updateVpnBtn(); });
}

$("#openNavCustBtn").onclick=()=>{const S=getS(),en=new Set(S.navTabs||ALL_NAV_ITEMS.map(x=>x.id));$("#navCustList").innerHTML=ALL_NAV_ITEMS.filter(x=>x.id!=="settings").map(it=>`<label class="switch" style="margin:7px 0"><span>${it.label}</span><input type="checkbox" class="nc-chk" value="${it.id}" ${en.has(it.id)?"checked":""}></label>`).join("");$$(".nc-chk").forEach(c=>c.onchange=()=>{S.navTabs=[...$$(".nc-chk:checked").map(x=>x.value),"settings"];saveState();renderBottomNav();});openModal("navCustModal");};
$("#openDebugBtn").onclick=()=>{$("#debugLogs").textContent=DEBUG_LOGS.length?DEBUG_LOGS.join("\n"):"Henüz hata yok ✅";openModal("debugModal");};
$("#clearDebugBtn").onclick=()=>{DEBUG_LOGS.length=0;$("#debugLogs").textContent="Temizlendi.";};

C.toggleTTS=toggleTTS; C.stopTTS=stopTTS; C.populateVoices=populateVoices;
C.initExtras=()=>{
  renderFmhy(); renderPromptMarket(); renderBottomNav(); renderChat(); populateChatBooks(); updateNotifBadge(); updateVpnBtn();
  // Uygulama açılınca takip listesini (son kontrolden 30 dk geçtiyse) otomatik arka planda kontrol et
  const S = ensureWatchData();
  if(S.watchlist.length && (Date.now() - (S.lastAutoWatchCheck||0)) > 1800000){
    setTimeout(() => checkAllWatchedSeries(true), 2500);
  }
  debugLog("SYS","Çevirmen AI v7.0 hazır");
};
C.initExtras();
})();
