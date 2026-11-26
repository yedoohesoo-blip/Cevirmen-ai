(() => {
"use strict";
const C = window.CAI;
if(!C) return;
const {$, $$, esc, uid, toast, haptic, copyText, downloadBlob, openModal, closeModal, showInfoSheet, showPromptSheet, debugLog, getS, saveState, callAI, splitChunks, dbAll, dbGet, dbPut, dbDel, mediaPut, mediaGet, extractPdfText, extractEpubText, openRealBrowser, renderLibrary, openBookReader, renderCurrentChapter, renderGlossary, switchView, importBookFile, applyThemeAndAnim, R} = C;
const isNative = () => !!(window.AndroidBridge && window.AndroidBridge.isNative && window.AndroidBridge.isNative());
const b64Dec = b64 => { const bin=atob(b64), bytes=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i); return new TextDecoder().decode(bytes); };

/* ===================== NATIVE FETCH KÖPRÜSÜ (HTTP DURUM + CLOUDFLARE TESPİTİ) ===================== */
const fetchInfoCbs = new Map();
window.__onNativeFetchInfoDone = (reqId, b64) => {
  const cb = fetchInfoCbs.get(reqId);
  if(cb){ fetchInfoCbs.delete(reqId); try{ cb(JSON.parse(b64Dec(b64))); }catch{ cb({status:0,html:"",protected:false}); } }
};
const fetchTextCbs = new Map();
window.__onNativeFetchDone = (reqId, b64) => {
  const cb = fetchTextCbs.get(reqId);
  if(cb){ fetchTextCbs.delete(reqId); cb(b64Dec(b64)); }
};

function fetchUrlInfo(url){
  return new Promise(async resolve => {
    if(isNative() && window.AndroidBridge.fetchUrlInfo){
      const id = "fi_" + uid();
      const t = setTimeout(() => { if(fetchInfoCbs.has(id)){ fetchInfoCbs.delete(id); resolve({status:0,html:"",protected:false,error:"Zaman aşımı"}); } }, 18000);
      fetchInfoCbs.set(id, info => { clearTimeout(t); resolve(info || {status:0,html:""}); });
      window.AndroidBridge.fetchUrlInfo(id, url);
      return;
    }
    try{
      const r = await fetch("https://api.allorigins.win/raw?url="+encodeURIComponent(url));
      const html = r.ok ? await r.text() : "";
      resolve({status:r.status, finalUrl:url, html, protected: r.status===403||r.status===503||/Just a moment|cf-browser/i.test(html)});
    }catch(e){ resolve({status:0, html:"", protected:false, error:e.message}); }
  });
}

/* ===================== 1. ADGUARD VPN KALKANI (B4 ANLIK SENKRON) + APP SHORTCUTS ===================== */
function updateVpnBtn(forceState=null){
  const btn = $("#vpnToggleBtn"); if(!btn) return;
  const on = forceState !== null ? !!forceState : (isNative() && window.AndroidBridge.isVpnRunning && window.AndroidBridge.isVpnRunning());
  btn.textContent = on ? "🛡️ VPN Açık" : "🛡️ AdGuard VPN";
  btn.classList.toggle("primary", on);
  btn.classList.toggle("ok", !on);
}
window.CAI_updateVpnBtn = updateVpnBtn;
window.__onVpnStateChanged = on => updateVpnBtn(!!on);

$("#vpnToggleBtn")?.addEventListener("click", () => {
  if(!isNative() || !window.AndroidBridge.toggleAdVpn) return toast("AdGuard VPN sadece Android APK içinde çalışır!");
  window.AndroidBridge.toggleAdVpn();
  setTimeout(() => updateVpnBtn(), 500);
});

window.__onAppShortcut = async sc => {
  if(sc === "overlay"){
    if(isNative() && window.AndroidBridge.startFloatingOverlay) window.AndroidBridge.startFloatingOverlay();
  } else if(sc === "chat"){
    switchView("chat");
  } else if(sc === "browser"){
    switchView("browser");
  } else if(sc === "notifs"){
    openNotifModal();
  } else if(sc === "resume_book"){
    const books = (await dbAll()).filter(b=>!b.deletedAt).sort((a,b)=>(b.lastRead||0)-(a.lastRead||0));
    if(books.length){ switchView("library"); openBookReader(books[0].id); }
    else { switchView("library"); toast("Henüz okunmuş kitap yok"); }
  }
};

/* ===================== 2. ANLIK DİYALOG RENKLENDİRME ===================== */
function colorizeDialoguesInBody(){
  const S = getS(), body = $("#rBody"); if(!body) return;
  if(!S.reader.dlgColor){
    body.querySelectorAll(".dlg-span").forEach(sp => sp.replaceWith(document.createTextNode(sp.textContent)));
    body.normalize();
    return;
  }
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  let n; while((n = walker.nextNode())) {
    if(n.parentElement && (n.parentElement.classList.contains("dlg-span") || /SCRIPT|STYLE|BUTTON/.test(n.parentElement.tagName))) continue;
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
    if(dlgLock || !getS().reader.dlgColor) return;
    dlgLock = true;
    try{ colorizeDialoguesInBody(); }finally{ setTimeout(() => dlgLock = false, 25); }
  }).observe(rBodyEl, {childList:true});
}
$("#rDlgColorToggle")?.addEventListener("change", e => {
  const S = getS(); S.reader.dlgColor = e.target.checked; saveState();
  colorizeDialoguesInBody();
});

/* ===================== 3. LITEROUTER.COM CANLI MALİYET & ÇARPAN TARAYICISI ===================== */
function updateLrBadge(){
  const S = getS(), badge = $("#lrCostBadge"); if(!badge) return;
  const active = (S.model || "").toLowerCase();
  const match = (S.lrCosts || []).find(x => x.id.toLowerCase() === active || active.includes(x.id.toLowerCase()) || x.id.toLowerCase().includes(active.split("/").pop()||"___"));
  if(match){
    badge.textContent = `💰 ${match.mult || match.price || "?"}`;
    badge.title = `${match.id}: ${match.mult || ""} ${match.price || ""}`;
  } else {
    badge.textContent = S.lrCosts?.length ? `💰 ${S.lrCosts.length} model` : "💰 Tara";
  }
}
window.CAI_updateLrBadge = updateLrBadge;
$("#lrCostBadge")?.addEventListener("click", () => { haptic("light"); switchView("costs"); renderLrCosts(); });

function renderLrCosts(){
  const S = getS(), listEl = $("#lrCostList"), st = $("#lrStatus"); if(!listEl) return;
  const q = ($("#lrSearch")?.value || "").toLowerCase().trim();
  const sort = $("#lrSort")?.value || "cheap";
  let arr = [...(S.lrCosts || [])];
  if(q) arr = arr.filter(x => (x.id+" "+(x.mult||"")+" "+(x.price||"")).toLowerCase().includes(q));
  if(sort === "cheap") arr.sort((a,b) => (a.numCost ?? 999) - (b.numCost ?? 999));
  else if(sort === "exp") arr.sort((a,b) => (b.numCost ?? -1) - (a.numCost ?? -1));
  else arr.sort((a,b) => a.id.localeCompare(b.id));

  if(S.lrLastScan && st && !st.textContent.includes("Taranıyor")) st.textContent = `Son tarama: ${new Date(S.lrLastScan).toLocaleTimeString("tr")} (${S.lrCosts.length} model)`;
  if(!arr.length){
    listEl.innerHTML = `<div class="card"><div class="meta">Henüz LiteRouter maliyet verisi yok. Yukarıdaki <b>🔄 Canlı Tara</b> butonuna bas!</div></div>`;
    return;
  }
  listEl.innerHTML = arr.map(m => {
    const isCur = S.model === m.id;
    const tagCls = (m.numCost !== null && m.numCost <= 0.3) ? "ok" : (m.numCost >= 1.5 ? "danger" : "warn");
    return `<div class="item" style="${isCur?"border-color:var(--primary)":""}">
      <div class="item-body">
        <div class="item-title">${isCur?"✅ ":""}${esc(m.id)}</div>
        <div class="item-sub">${m.note ? esc(m.note) : "LiteRouter güncel optimizasyon maliyeti"}</div>
      </div>
      <span class="pill-tag ${tagCls}">${esc(m.mult || m.price || "?")}</span>
      <button class="btn small primary" data-lrpick="${esc(m.id)}">Seç</button>
    </div>`;
  }).join("");
  listEl.querySelectorAll("[data-lrpick]").forEach(b => b.onclick = () => {
    const S = getS(); S.model = b.dataset.lrpick; saveState(true); applyThemeAndAnim(); renderLrCosts(); haptic("light"); toast("Aktif model: " + S.model);
  });
}
window.CAI_renderLrCosts = renderLrCosts;
$("#lrSearch")?.addEventListener("input", renderLrCosts);
$("#lrSort")?.addEventListener("change", renderLrCosts);

async function scanLiteRouterCosts(){
  const S = getS(), btn = $("#lrScanBtn"), st = $("#lrStatus");
  btn.classList.add("busy"); st.className = "status"; st.textContent = "🔄 literouter.com ve API taranıyor…";
  try{
    const found = new Map();
    if(S.apiKey){
      try{
        const r = await fetch(S.baseUrl.replace(/\/+$/,"")+"/models", {headers:{"Authorization":"Bearer "+S.apiKey}});
        if(r.ok){
          const j = await r.json();
          (j.data || []).forEach(m => {
            const mult = m.multiplier || m.cost_multiplier || m.pricing?.multiplier;
            const pr = m.pricing?.prompt ? `$${(Number(m.pricing.prompt)*1e6).toFixed(2)}/1M` : "";
            if(mult || pr){
              const num = mult ? parseFloat(String(mult)) : parseFloat(String(m.pricing?.prompt||0))*1e6;
              found.set(m.id, {id:m.id, mult: mult ? `${mult}x` : pr, price:pr, numCost: isNaN(num)?999:num, note:"API canlı veri"});
            }
          });
        }
      }catch{}
    }

    let rawSiteText = "";
    for(const u of ["https://literouter.com/models", "https://literouter.com/pricing", "https://literouter.com"]){
      const info = await fetchUrlInfo(u);
      if(info.html && info.html.length > 400){
        const doc = new DOMParser().parseFromString(info.html, "text/html");
        doc.querySelectorAll("script,style,svg").forEach(e=>e.remove());
        const txt = (doc.body?.innerText || doc.body?.textContent || "").replace(/\s+/g," ").trim();
        if(/multiplier|cost|price|x\b|gemini|claude|gpt|deepseek/i.test(txt)){ rawSiteText += `\n[${u}]\n` + txt.slice(0,12000); break; }
      }
    }

    if(rawSiteText.length > 100 && S.apiKey && S.model){
      st.textContent = "🤖 AI sitedeki güncel maliyet çarpanlarını ayrıştırıyor…";
      const aiRaw = await callAI({
        task:"chat", stream:false, temperature:0.1,
        messages:[
          {role:"system", content:`Verilen literouter.com sayfa içeriğinden TÜM AI modellerinin adlarını ve güncel maliyet çarpanlarını (ör. 0.2x, 0.5x, 1x, 2x veya $ fiyat) çıkar. SADECE JSON dizisi dön: [{"id":"model-adi","mult":"0.5x","numCost":0.5,"note":"kısa not"}]. Bulamazsan [].`},
          {role:"user", content:rawSiteText.slice(0,14000)}
        ]
      });
      try{
        const s = aiRaw.indexOf("["), e = aiRaw.lastIndexOf("]");
        if(s>=0 && e>s){
          JSON.parse(aiRaw.slice(s,e+1)).forEach(x => {
            if(x.id) found.set(x.id, {id:x.id, mult:x.mult||"?", numCost:Number(x.numCost)||parseFloat(String(x.mult||"99"))||99, note:x.note||"literouter.com"});
          });
        }
      }catch{}
    }

    if(found.size){
      S.lrCosts = [...found.values()];
      S.lrLastScan = Date.now();
      saveState(); updateLrBadge(); renderLrCosts();
      st.className = "status ok"; st.textContent = `✅ ${S.lrCosts.length} modelin güncel maliyeti tarandı!`;
      haptic("success");
    } else {
      st.className = "status warn"; st.textContent = "⚠️ Site dinamik (JS) korumalı veya veri dönmedi. Pro Tarayıcıda literouter.com'u açıp çerez aldıktan sonra tekrar dene.";
    }
  }catch(e){ st.className = "status error"; st.textContent = "❌ " + e.message; }
  finally{ btn.classList.remove("busy"); }
}
$("#lrScanBtn")?.addEventListener("click", scanLiteRouterCosts);

/* ===================== 4. AKILLI WEB NOVEL SERİ BÖLÜM İNDİRİCİ ===================== */
let scraperStopFlag = false;
async function openScraperModal(title="", url="", bookId=""){
  const books = (await dbAll()).filter(b=>!b.deletedAt);
  $("#scrBookSel").innerHTML = `<option value="">Yeni kitap oluştur</option>` + books.map(b=>`<option value="${b.id}">${esc(b.title)}</option>`).join("");
  if(title) $("#scrTitle").value = title;
  if(url) $("#scrUrl").value = url;
  if(bookId) $("#scrBookSel").value = bookId;
  $("#scrStatus").textContent = "";
  openModal("scraperModal");
}
$("#openScraperBtn")?.addEventListener("click", () => openScraperModal("", $("#bUrlInput")?.value || ""));
window.__onOpenScraperFromBrowser = (t64, u64) => openScraperModal(b64Dec(t64), b64Dec(u64));
$("#rFetchMoreBtn")?.addEventListener("click", () => {
  if(!R.book) return;
  const lastUrl = [...R.book.chapters].reverse().find(c=>c.url)?.url || R.book.sourceUrl || "";
  if(!lastUrl) return toast("Bu kitap web kaynaklı değil (URL yok)");
  closeModal("rSetModal");
  openScraperModal(R.book.title, lastUrl, R.book.id);
});

function findNextChapterUrl(doc, baseUrl){
  const candidates = [];
  const anchors = [...doc.querySelectorAll("a[href]")];
  for(const a of anchors){
    const rawHref = a.getAttribute("href") || "";
    if(!rawHref || rawHref.startsWith("#") || rawHref.startsWith("javascript:")) continue;
    let abs = "";
    try{ abs = new URL(rawHref, baseUrl).href; }catch{ continue; }
    if(abs === baseUrl) continue;
    const txt = (a.textContent || "").replace(/\s+/g," ").trim().toLowerCase();
    const cls = ((a.className||"") + " " + (a.id||"") + " " + (a.getAttribute("rel")||"") + " " + (a.getAttribute("title")||"")).toLowerCase();
    let score = 0;
    if(a.getAttribute("rel")==="next") score += 100;
    if(/next\s*chap|sonraki\s*bölüm|ileri\s*bölüm|bölüm\s*ileri/i.test(txt)) score += 90;
    else if(/^(next|sonraki|ileri|›|»|→|next\s*»|next\s*>)$/i.test(txt)) score += 75;
    if(/next[-_]?chap|btn[-_]?next|chap[-_]?next|nav[-_]?next/i.test(cls)) score += 70;
    if(/prev|önceki|geri|back|comment|login|home|index/i.test(txt+" "+cls)) score -= 120;
    if(score >= 60) candidates.push({abs, score});
  }
  candidates.sort((a,b)=>b.score - a.score);
  return candidates[0]?.abs || "";
}

function extractChapterFromHtml(html, url){
  const doc = new DOMParser().parseFromString(html, "text/html");
  const nextUrl = findNextChapterUrl(doc, url);
  const title = (doc.querySelector("h1,.chapter-title,.chr-title,.entry-title,h2")?.textContent || doc.title || "Bölüm").replace(/\s+/g," ").trim();
  const root = doc.querySelector("article,main,[role=main],.chapter-content,.cha-words,#chapter-content,.entry-content,.reading-content,#chr-content,.txt") || doc.body;
  root.querySelectorAll("script,style,iframe,nav,aside,footer,form,.ads,[class*='ad-'],button").forEach(e=>e.remove());
  const ps = [...root.querySelectorAll("p")].map(p=>p.textContent.replace(/\s+/g," ").trim()).filter(t=>t.length>8);
  const text = ps.length >= 3 ? ps.join("\n\n") : (root.innerText || root.textContent || "").replace(/\n{3,}/g,"\n\n").trim();
  return {title, text, nextUrl};
}

$("#scrStartBtn")?.addEventListener("click", async () => {
  let curUrl = $("#scrUrl").value.trim();
  const maxCount = Math.max(1, Math.min(100, Number($("#scrCount").value)||10));
  const titleIn = $("#scrTitle").value.trim() || "Web Romanı";
  const targetBookId = $("#scrBookSel").value;
  if(!curUrl) return toast("Başlangıç URL'si gir");

  scraperStopFlag = false;
  $("#scrStartBtn").disabled = true; $("#scrStopBtn").disabled = false;
  const prog = $("#scrProg"), st = $("#scrStatus");
  prog.classList.add("on"); st.className = "status";

  let book = targetBookId ? await dbGet(targetBookId) : null;
  if(!book){
    const host = curUrl.replace(/^https?:\/\//,"").split("/")[0];
    book = {id:uid(), title:titleIn, author:host, format:"WEB", sourceHost:host, sourceUrl:curUrl, tags:["Web Novel"], curChap:0, lastRead:Date.now(), scrollMap:{}, chapters:[]};
  }
  const visited = new Set(book.chapters.map(c=>c.url).filter(Boolean));
  let added = 0;

  for(let i=0; i<maxCount; i++){
    if(scraperStopFlag || !curUrl) break;
    prog.firstElementChild.style.width = Math.round(((i)/maxCount)*100) + "%";
    st.textContent = `⚡ Bölüm ${i+1}/${maxCount} çekiliyor…`;
    const info = await fetchUrlInfo(curUrl);
    if(info.protected){
      st.className = "status error";
      st.textContent = `⚠️ Cloudflare/Bot koruması tespit edildi (${i} bölüm kaydedildi). Önce Pro Tarayıcıda bu siteyi açıp doğrulamayı geç, sonra tekrar dene!`;
      break;
    }
    if(!info.html || info.html.length < 200){ st.textContent = `⚠️ Sayfa boş döndü, durduruldu (${added} eklendi).`; break; }
    const {title, text, nextUrl} = extractChapterFromHtml(info.html, info.finalUrl || curUrl);
    if(!visited.has(curUrl) && text.length > 80){
      book.chapters.push({title, text, url:curUrl});
      visited.add(curUrl);
      added++;
      await dbPut(book);
    }
    if(!nextUrl || visited.has(nextUrl)){
      st.className = "status ok";
      st.textContent = `✅ Bitti! Sonraki bölüm linki kalmadı (${added} yeni bölüm eklendi).`;
      break;
    }
    curUrl = nextUrl;
    await new Promise(r=>setTimeout(r, 700));
  }
  prog.firstElementChild.style.width = "100%";
  $("#scrStartBtn").disabled = false; $("#scrStopBtn").disabled = true;
  if(added > 0){
    book.lastRead = Date.now(); await dbPut(book); renderLibrary(); haptic("success");
    if(!st.textContent.includes("⚠️")) { st.className="status ok"; st.textContent=`✅ ${added} bölüm "${book.title}" kitabına kaydedildi!`; }
  }
});
$("#scrStopBtn")?.addEventListener("click", () => { scraperStopFlag = true; toast("İndirme durduruluyor…"); });

/* ===================== 5. YENİ BÖLÜM TAKİPÇİSİ & OTOMATİK ARKA PLAN KONTROLÜ (C7) ===================== */
function ensureWatchData(){ const S=getS(); if(!Array.isArray(S.watchlist)) S.watchlist=[]; if(!Array.isArray(S.notifInbox)) S.notifInbox=[]; return S; }
function updateNotifBadge(){
  const S=ensureWatchData(), unread=S.notifInbox.filter(x=>!x.read).length, b=$("#notifBadge");
  if(!b) return; b.textContent=unread>99?"99+":unread; b.classList.toggle("show", unread>0);
}
function renderWatchAndNotifs(){
  const S=ensureWatchData();
  $("#watchList").innerHTML = S.watchlist.length ? S.watchlist.map(w=>`
    <div class="item">
      <div class="item-body">
        <div class="item-title">${esc(w.title)} ${w.statusTag?`<span class="pill-tag ${w.protected?"warn":"ok"}">${esc(w.statusTag)}</span>`:""}</div>
        <div class="item-sub">${esc(w.url.slice(0,55))}</div>
      </div>
      <button class="btn small" data-wopen="${esc(w.url)}">🌐</button>
      <button class="btn small ok" data-wscr="${w.id}" title="Yeni bölümleri çek">⚡</button>
      <button class="btn small danger" data-wdel="${w.id}">✕</button>
    </div>`).join("") : `<div class="meta">Takip edilen seri yok.</div>`;
  $$("[data-wopen]").forEach(b=>b.onclick=()=>openRealBrowser(b.dataset.wopen));
  $$("[data-wscr]").forEach(b=>b.onclick=()=>{ const w=S.watchlist.find(x=>x.id===b.dataset.wscr); if(w){closeModal("notifModal"); openScraperModal(w.title, w.lastUrl||w.url);} });
  $$("[data-wdel]").forEach(b=>b.onclick=()=>{ S.watchlist=S.watchlist.filter(x=>x.id!==b.dataset.wdel); saveState(); renderWatchAndNotifs(); });

  $("#notifList").innerHTML = S.notifInbox.length ? S.notifInbox.slice(0,30).map(n=>`
    <div class="item" style="${!n.read?"border-color:var(--primary)":""}">
      <div class="item-body">
        <div class="item-title">${esc(n.title)}</div>
        <div class="item-sub">${esc(n.body)} • ${new Date(n.ts).toLocaleTimeString("tr")}</div>
      </div>
      <button class="btn small primary" data-nopen="${esc(n.url)}">Aç</button>
    </div>`).join("") : `<div class="meta">Henüz bildirim yok.</div>`;
  $$("[data-nopen]").forEach(b=>b.onclick=()=>openRealBrowser(b.dataset.nopen));
  updateNotifBadge();
}
function openNotifModal(){
  const S=ensureWatchData(); S.notifInbox.forEach(x=>x.read=true); saveState();
  renderWatchAndNotifs(); openModal("notifModal");
}
$("#hdrNotifBtn")?.addEventListener("click", openNotifModal);
$("#addWatchBtn")?.addEventListener("click", () => {
  const S=ensureWatchData(), t=$("#watchTitle").value.trim(), u=$("#watchUrl").value.trim();
  if(!t||!u) return toast("Ad ve URL gir");
  S.watchlist.unshift({id:uid(), title:t, url:u, lastSig:"", lastUrl:u, protected:false});
  $("#watchTitle").value=""; $("#watchUrl").value=""; saveState(); renderWatchAndNotifs();
});
window.__onAddWatchFromBrowser = (t64, u64) => {
  const S=ensureWatchData(), t=b64Dec(t64), u=b64Dec(u64);
  if(!S.watchlist.some(x=>x.url===u)){ S.watchlist.unshift({id:uid(), title:t, url:u, lastSig:"", lastUrl:u}); saveState(); }
};

async function runWatchlistCheck(silent=false){
  const S=ensureWatchData(); if(!S.watchlist.length){ if(!silent) toast("Takip listesi boş"); return; }
  if(!silent) toast("🔄 Seriler kontrol ediliyor…");
  let foundNew = 0;
  for(const w of S.watchlist){
    const info = await fetchUrlInfo(w.url);
    if(info.protected){ w.protected=true; w.statusTag="⚠️ Korumalı"; continue; }
    w.protected = false;
    const links = [...new DOMParser().parseFromString(info.html,"text/html").querySelectorAll("a[href]")].filter(a=>/chap|bölüm|episode|ch[-_ ]?\d/i.test(a.textContent+a.getAttribute("href")));
    const sig = links.length + "|" + (links[0]?.textContent?.trim().slice(0,40) || info.html.length);
    if(w.lastSig && w.lastSig !== sig){
      foundNew++;
      w.statusTag = "🆕 Yeni Bölüm!";
      const msg = `${w.title} için yeni bölüm tespit edildi!`;
      S.notifInbox.unshift({id:uid(), title:"🆕 " + w.title, body:msg, url:w.url, ts:Date.now(), read:false});
      if(isNative() && window.AndroidBridge.showNotification) window.AndroidBridge.showNotification("Çevirmen AI — Yeni Bölüm!", msg, "notifs");
    } else {
      w.statusTag = "Güncel";
    }
    w.lastSig = sig;
  }
  S.lastAutoWatch = Date.now();
  saveState(); renderWatchAndNotifs();
  if(!silent) toast(foundNew ? `🔔 ${foundNew} seride yeni bölüm bulundu!` : "Kontrol tamamlandı, yeni bölüm yok.");
  else if(foundNew) toast(`🔔 ${foundNew} takip edilen seride yeni bölüm var!`);
}
$("#checkWatchBtn")?.addEventListener("click", () => runWatchlistCheck(false));

/* ===================== 6. FMHY OKUMA MERKEZİ ===================== */
const DEFAULT_FMHY = [
  {cat:"Web Novel", name:"NovelBin", url:"https://novelbin.com"},
  {cat:"Web Novel", name:"RoyalRoad", url:"https://www.royalroad.com"},
  {cat:"Web Novel", name:"NovelUpdates", url:"https://www.novelupdates.com"},
  {cat:"Web Novel", name:"WuxiaWorld", url:"https://www.wuxiaworld.com"},
  {cat:"Manga / Manhwa", name:"MangaDex", url:"https://mangadex.org"},
  {cat:"Manga / Manhwa", name:"Comick", url:"https://comick.io"},
  {cat:"Manga / Manhwa", name:"AsuraScans", url:"https://asuracomic.net"},
  {cat:"E-Kitap / EPUB", name:"Anna's Archive", url:"https://annas-archive.org"},
  {cat:"E-Kitap / EPUB", name:"Standard Ebooks", url:"https://standardebooks.org"},
  {cat:"Rehber", name:"FMHY Reading", url:"https://fmhy.net/reading"}
];
function getFmhyList(){ const S=getS(); if(!Array.isArray(S.fmhySites)||!S.fmhySites.length) S.fmhySites=structuredClone(DEFAULT_FMHY); return S.fmhySites; }
function renderFmhyQuick(){
  const el = $("#fmhyQuickChips"); if(!el) return;
  el.innerHTML = getFmhyList().slice(0,10).map(s=>`<span class="chip" data-fq="${esc(s.url)}">${esc(s.name)}</span>`).join("");
  el.querySelectorAll("[data-fq]").forEach(c=>c.onclick=()=>openRealBrowser(c.dataset.fq));
}
function renderFmhyModal(){
  const list = getFmhyList(), q = ($("#fmhySearch")?.value||"").toLowerCase().trim();
  const filtered = list.filter(s=>!q || (s.name+" "+s.cat+" "+s.url).toLowerCase().includes(q));
  const cats = [...new Set(filtered.map(s=>s.cat))];
  $("#fmhyBody").innerHTML = cats.map(c=>`
    <h4 style="font-size:12px;color:var(--accent);margin:8px 0 5px">${esc(c)}</h4>
    <div class="list">${filtered.filter(x=>x.cat===c).map(s=>`
      <div class="item">
        <div class="item-body">
          <div class="item-title">${s.ping==="ok"?"🟢 ":s.ping==="cf"?"🟡 ":s.ping==="err"?"🔴 ":""}${esc(s.name)}</div>
          <div class="item-sub">${esc(s.url)}</div>
        </div>
        <button class="btn small primary" data-fgo="${esc(s.url)}">Aç</button>
        <button class="btn small danger" data-fdel="${esc(s.url)}">✕</button>
      </div>`).join("")}</div>`).join("") || `<div class="meta">Sonuç yok.</div>`;
  $$("[data-fgo]").forEach(b=>b.onclick=()=>{ closeModal("fmhyModal"); openRealBrowser(b.dataset.fgo); });
  $$("[data-fdel]").forEach(b=>b.onclick=()=>{ const S=getS(); S.fmhySites=getFmhyList().filter(x=>x.url!==b.dataset.fdel); saveState(); renderFmhyModal(); renderFmhyQuick(); });
}
$("#openFmhyBtn")?.addEventListener("click", () => { renderFmhyModal(); openModal("fmhyModal"); });
$("#fmhySearch")?.addEventListener("input", renderFmhyModal);
$("#fmhyAddCatBtn")?.addEventListener("click", () => { const b=$("#fmhyAddBox"); b.style.display=b.style.display==="none"?"block":"none"; });
$("#fmhySaveNewBtn")?.addEventListener("click", () => {
  const cat=$("#fmhyNewCat").value.trim()||"Özel", name=$("#fmhyNewName").value.trim(), url=$("#fmhyNewUrl").value.trim();
  if(!name||!url) return toast("Ad ve URL gir");
  getFmhyList().push({cat, name, url}); saveState(); renderFmhyModal(); renderFmhyQuick();
  $("#fmhyNewName").value=""; $("#fmhyNewUrl").value=""; $("#fmhyAddBox").style.display="none"; toast("Site eklendi!");
});
$("#fmhyTestAllBtn")?.addEventListener("click", async () => {
  const list = getFmhyList(); toast("📡 Siteler test ediliyor…");
  for(const s of list){
    const info = await fetchUrlInfo(s.url);
    s.ping = info.protected ? "cf" : (info.status>=200 && info.status<400 ? "ok" : "err");
    renderFmhyModal();
  }
  toast("📡 Site erişim testi tamamlandı!");
});

/* ===================== 7. AI SOHBET (A4 IDB MEDYA + A5 PDF/EPUB + A7 MARKDOWN TABLO + D4 STOP/EXPORT) ===================== */
function ensureChatState(){
  const S = getS();
  if(!Array.isArray(S.chatSessions) || !S.chatSessions.length){
    S.chatSessions = [{id:uid(), title:"Genel Sohbet", persona:"Sen yardımcı, akıllı ve Türkçe konuşan bir kitap/çeviri asistanısın.", msgs:[]}];
    S.activeChatId = S.chatSessions[0].id;
  }
  if(!S.chatSessions.some(x=>x.id===S.activeChatId)) S.activeChatId = S.chatSessions[0].id;
  return S;
}
function getActiveChat(){ const S=ensureChatState(); return S.chatSessions.find(x=>x.id===S.activeChatId) || S.chatSessions[0]; }

// A7: Hatasız Markdown Renderer (Kod blokları, tablolar, listeler, başlıklar)
function renderMarkdown(md){
  const codeBlocks = [];
  let s = String(md || "").replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<div class="md-pre"><div class="md-pre-hd"><span>${esc(lang||"kod")}</span><button class="btn small" onclick="window.CAI.copyText(this.parentElement.nextElementSibling.textContent)">📋 Kopyala</button></div><code>${esc(code.replace(/\n$/,""))}</code></div>`);
    return `@@CODEBLOCK_${idx}@@`;
  });

  // Satır bazlı tablo & liste ayrıştırma
  const lines = esc(s).split("\n");
  const out = [];
  let inUl = false, inTable = false, tableRows = [];

  const flushUl = () => { if(inUl){ out.push("</ul>"); inUl = false; } };
  const flushTable = () => {
    if(!inTable) return;
    if(tableRows.length >= 2){
      const hdr = tableRows[0].map(c=>`<th>${c}</th>`).join("");
      const body = tableRows.slice(2).map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("");
      out.push(`<table><thead><tr>${hdr}</tr></thead><tbody>${body}</tbody></table>`);
    }
    inTable = false; tableRows = [];
  };

  const inlineFmt = t => t
    .replace(/`([^`\n]+)`/g, '<span class="md-ic">$1</span>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*\n]+)\*/g, '<i>$1</i>');

  for(let i=0; i<lines.length; i++){
    const ln = lines[i];
    if(/^@@CODEBLOCK_\d+@@$/.test(ln.trim())){
      flushUl(); flushTable();
      out.push(ln.trim());
      continue;
    }
    if(/^\s*\|.+\|\s*$/.test(ln)){
      flushUl();
      inTable = true;
      const cells = ln.trim().replace(/^\||\|$/g,"").split("|").map(c=>inlineFmt(c.trim()));
      tableRows.push(cells);
      continue;
    } else flushTable();

    const liM = ln.match(/^\s*[-*•]\s+(.+)$/);
    if(liM){
      if(!inUl){ out.push("<ul>"); inUl = true; }
      out.push(`<li>${inlineFmt(liM[1])}</li>`);
      continue;
    } else flushUl();

    if(/^###\s+(.+)$/.test(ln)) out.push(`<h4>${inlineFmt(ln.replace(/^###\s+/,""))}</h4>`);
    else if(/^##\s+(.+)$/.test(ln)) out.push(`<h3>${inlineFmt(ln.replace(/^##\s+/,""))}</h3>`);
    else if(/^#\s+(.+)$/.test(ln)) out.push(`<h3>${inlineFmt(ln.replace(/^#\s+/,""))}</h3>`);
    else if(ln.trim() === "") out.push("<br>");
    else out.push(inlineFmt(ln) + "<br>");
  }
  flushUl(); flushTable();

  let html = out.join("");
  codeBlocks.forEach((blk, idx) => { html = html.replace(`@@CODEBLOCK_${idx}@@`, blk); });
  return html;
}

// A4: Görsel sıkıştırıcı (localStorage yerine IndexedDB'ye hafif JPEG kaydeder)
function compressImageFile(file, maxW=1024, quality=0.8){
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = img.width > maxW ? (maxW / img.width) : 1;
        const cv = document.createElement("canvas");
        cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => resolve(fr.result);
      img.src = fr.result;
    };
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

async function resolveChatImgSrc(ref){
  if(!ref) return "";
  if(ref.startsWith("data:")) return ref;
  if(ref.startsWith("idb:")) return await mediaGet(ref.slice(4));
  return ref;
}

async function populateChatBooks(){
  const sel = $("#chatBookSel"); if(!sel) return;
  const books = (await dbAll()).filter(b=>!b.deletedAt);
  const cur = sel.value;
  sel.innerHTML = `<option value="">📚 Kitap bağlama (Genel Sohbet)</option>` + books.map(b=>`<option value="${b.id}">📖 ${esc(b.title)} (Bölüm ${(b.curChap||0)+1}/${b.chapters.length})</option>`).join("");
  if(cur) sel.value = cur;
}

function renderChatSessions(){
  const S = ensureChatState(), sel = $("#chatSessionSel"); if(!sel) return;
  sel.innerHTML = S.chatSessions.map(c=>`<option value="${c.id}">💬 ${esc(c.title)} (${c.msgs.length})</option>`).join("");
  sel.value = S.activeChatId;
}

async function renderChatFull(){
  renderChatSessions();
  const chat = getActiveChat(), box = $("#chatMsgs"); if(!box) return;
  if(!chat.msgs.length){
    box.innerHTML = `<div class="meta" style="text-align:center;margin:auto">👋 Yeni sohbet hazır. Görsel, PDF, EPUB veya kitap bağlayarak soru sorabilirsin!</div>`;
    return;
  }
  box.innerHTML = chat.msgs.map((m, idx) => `
    <div class="cmsg ${m.role==="user"?"user":"ai"}" data-cidx="${idx}">
      ${(m.images||[]).map((ref,ii)=>`<img data-imgref="${esc(ref)}" src="${ref.startsWith("data:")?ref:""}" alt="Görsel ${ii+1}" onclick="if(this.src){document.getElementById('lbImg').src=this.src;document.getElementById('lightbox').classList.add('open')}">`).join("")}
      <div class="cmsg-body">${m.role==="user" ? esc(m.text) : renderMarkdown(m.text)}</div>
      <div class="cmsg-acts">
        <button data-ccopy="${idx}">📋</button>
        ${m.role==="assistant" ? `<button data-cregen="${idx}">🔄</button><button data-ctts="${idx}">🔊</button><button data-ctotext="${idx}">🌐 Metne</button>` : `<button data-cedit="${idx}">✏️</button>`}
        <button data-cdel="${idx}" title="Mesajı Sil">🗑️</button>
      </div>
    </div>`).join("");
  // IndexedDB'deki görselleri asenkron yükle
  box.querySelectorAll("img[data-imgref^='idb:']").forEach(async img => {
    const dataUrl = await resolveChatImgSrc(img.dataset.imgref);
    if(dataUrl) img.src = dataUrl;
  });
  box.scrollTop = box.scrollHeight;
  bindChatMsgActions();
}

function bindChatMsgActions(){
  const chat = getActiveChat();
  $$("[data-ccopy]").forEach(b=>b.onclick=()=>copyText(chat.msgs[b.dataset.ccopy]?.text));
  $$("[data-ctts]").forEach(b=>b.onclick=()=>{ const t=chat.msgs[b.dataset.ctts]?.text; if(t && window.speechSynthesis){ speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(t); u.lang="tr-TR"; speechSynthesis.speak(u); } });
  $$("[data-ctotext]").forEach(b=>b.onclick=()=>{ const t=chat.msgs[b.dataset.ctotext]?.text; if(t){ $("#srcText").value=t; switchView("text"); toast("Metin sekmesine aktarıldı"); } });
  $$("[data-cedit]").forEach(b=>b.onclick=()=>{ const i=Number(b.dataset.cedit); $("#chatInput").value=chat.msgs[i].text; chat.msgs=chat.msgs.slice(0,i); saveState(); renderChatFull(); });
  $$("[data-cregen]").forEach(b=>b.onclick=()=>{ const i=Number(b.dataset.cregen); if(i>0){ chat.msgs=chat.msgs.slice(0,i); saveState(); renderChatFull(); sendChatMessage(true); } });
  $$("[data-cdel]").forEach(b=>b.onclick=()=>{ const i=Number(b.dataset.cdel); chat.msgs.splice(i,1); saveState(); renderChatFull(); });
}

// A9: Sohbet sekmesi açıldığında kitap listesini otomatik güncelle
window.CAI_onChatViewOpen = () => { populateChatBooks(); renderChatFull(); };

let chatAttachments = []; // {type:'img'|'text', name, data, idbRef?}
$("#chatFileBtn")?.addEventListener("click", () => $("#chatFileInput").click());
$("#chatFileInput")?.addEventListener("change", async e => {
  for(const f of [...(e.target.files||[])]){
    const ext = (f.name.split(".").pop()||"").toLowerCase();
    if(f.type.startsWith("image/")){
      const url = await compressImageFile(f);
      const mid = "img_" + uid();
      await mediaPut(mid, url);
      chatAttachments.push({type:"img", name:f.name, data:url, idbRef:"idb:"+mid});
    } else if(ext === "pdf"){
      toast("📄 PDF metni çıkarılıyor…");
      try{
        const txt = await extractPdfText(await f.arrayBuffer(), 16000);
        chatAttachments.push({type:"text", name:f.name, data:txt || "(PDF metin katmanı bulunamadı)"});
      }catch(err){ toast("PDF okunamadı: "+err.message); }
    } else if(ext === "epub"){
      toast("📖 EPUB metni çıkarılıyor…");
      try{
        const txt = await extractEpubText(await f.arrayBuffer(), 16000);
        chatAttachments.push({type:"text", name:f.name, data:txt || "(EPUB metni bulunamadı)"});
      }catch(err){ toast("EPUB okunamadı: "+err.message); }
    } else {
      const txt = (await f.text()).slice(0, 14000);
      chatAttachments.push({type:"text", name:f.name, data:txt});
    }
  }
  e.target.value = "";
  renderChatAtts();
});
function renderChatAtts(){
  $("#chatAttPreview").innerHTML = chatAttachments.map((a,i)=>`<span class="chat-att-chip">${a.type==="img"?"🖼️":"📄"} ${esc(a.name.slice(0,18))} <b data-rmatt="${i}" style="cursor:pointer">×</b></span>`).join("");
  $$("[data-rmatt]").forEach(b=>b.onclick=()=>{ chatAttachments.splice(Number(b.dataset.rmatt),1); renderChatAtts(); });
}

let chatAbort = null;
$("#chatStopBtn")?.addEventListener("click", () => { if(chatAbort){ chatAbort.abort(); chatAbort = null; toast("Yanıt durduruldu"); } });

async function sendChatMessage(isRegen=false){
  const chat = getActiveChat(), inp = $("#chatInput");
  if(!isRegen){
    const txt = inp.value.trim();
    if(!txt && !chatAttachments.length) return;
    const imgRefs = chatAttachments.filter(a=>a.type==="img").map(a=>a.idbRef || a.data);
    const filesTxt = chatAttachments.filter(a=>a.type==="text").map(a=>`\n[Dosya: ${a.name}]\n${a.data}`).join("\n");
    if(!chat.msgs.length && txt) chat.title = txt.slice(0,28);
    chat.msgs.push({role:"user", text:(txt + filesTxt).trim(), images:imgRefs});
    inp.value = ""; chatAttachments = []; renderChatAtts(); saveState(); await renderChatFull();
  }

  let sys = chat.persona || "Sen akıllı bir Türkçe asistansın.";
  const bookId = $("#chatBookSel")?.value;
  if(bookId){
    const bk = await dbGet(bookId);
    if(bk){
      const guard = $("#chatSpoilerGuard")?.checked;
      const curIdx = bk.curChap || 0;
      const maxIdx = guard ? curIdx : Math.min(bk.chapters.length-1, curIdx + 1);
      const ctx = bk.chapters.slice(Math.max(0, curIdx-2), maxIdx+1).map(c=>`[${c.title}]\n${(c.trText||c.text||"").slice(0,2200)}`).join("\n\n");
      sys += `\nBAĞLI KİTAP: "${bk.title}" (Okuyucu şu an ${curIdx+1}. bölümde).` +
             (guard ? "\nKESİN KURAL: SPOİLER KORUMASI AÇIK! Okuyucunun henüz okumadığı ileriki bölümlerden ASLA bahsetme." : "") +
             `\nBÖLÜM İÇERİĞİ:\n${ctx}`;
    }
  }

  const apiMsgs = [{role:"system", content:sys}];
  let hasImg = false;
  for(const m of chat.msgs.slice(-10)){
    if(m.role==="user" && m.images?.length){
      hasImg = true;
      const arr = [{type:"text", text:m.text||"Görseli incele"}];
      for(const ref of m.images){
        const u = await resolveChatImgSrc(ref);
        if(u) arr.push({type:"image_url", image_url:{url:u}});
      }
      apiMsgs.push({role:"user", content:arr});
    } else apiMsgs.push({role:m.role==="user"?"user":"assistant", content:m.text});
  }

  const aiMsg = {role:"assistant", text:""};
  chat.msgs.push(aiMsg);
  const box = $("#chatMsgs");
  const div = document.createElement("div");
  div.className = "cmsg ai";
  div.innerHTML = `<div class="cmsg-body">⏳ Düşünüyor…</div>`;
  box.appendChild(div);
  const bodyEl = div.querySelector(".cmsg-body");
  box.scrollTop = box.scrollHeight;

  chatAbort = new AbortController();
  $("#chatStopBtn").style.display = "inline-flex";
  $("#chatSendBtn").disabled = true;

  try{
    await callAI({
      task: hasImg ? "vision" : "chat",
      messages: apiMsgs,
      signal: chatAbort.signal,
      onDelta: (_, full) => {
        aiMsg.text = full;
        bodyEl.textContent = full;
        if(box.scrollHeight - box.scrollTop - box.clientHeight < 120) box.scrollTop = box.scrollHeight;
      }
    });
    saveState();
    await renderChatFull();
    haptic("light");
  }catch(e){
    if(e.name === "AbortError"){
      if(!aiMsg.text) aiMsg.text = "(Durduruldu)";
      saveState(); await renderChatFull();
    } else {
      aiMsg.text = "❌ Hata: " + e.message;
      bodyEl.textContent = aiMsg.text;
    }
  }finally{
    chatAbort = null;
    $("#chatStopBtn").style.display = "none";
    $("#chatSendBtn").disabled = false;
  }
}
$("#chatSendBtn")?.addEventListener("click", () => sendChatMessage(false));
$("#chatInput")?.addEventListener("keydown", e => { if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); sendChatMessage(false); } });
$("#chatSessionSel")?.addEventListener("change", e => { const S=ensureChatState(); S.activeChatId=e.target.value; saveState(); renderChatFull(); });
$("#newChatBtn")?.addEventListener("click", () => { const S=ensureChatState(); const id=uid(); S.chatSessions.unshift({id,title:"Yeni Sohbet",persona:"Sen akıllı bir Türkçe asistansın.",msgs:[]}); S.activeChatId=id; saveState(); renderChatFull(); });
$("#delChatBtn")?.addEventListener("click", () => { const S=ensureChatState(); if(S.chatSessions.length<=1){ S.chatSessions[0].msgs=[]; saveState(); renderChatFull(); return; } S.chatSessions=S.chatSessions.filter(x=>x.id!==S.activeChatId); S.activeChatId=S.chatSessions[0].id; saveState(); renderChatFull(); });
$("#renameChatBtn")?.addEventListener("click", async () => {
  const c = getActiveChat();
  const n = await showPromptSheet("✏️ Sohbeti Adlandır", "Yeni sohbet başlığı:", c.title);
  if(n && n.trim()){ c.title = n.trim(); saveState(); renderChatSessions(); toast("Başlık güncellendi"); }
});
$("#exportChatBtn")?.addEventListener("click", () => {
  const c = getActiveChat();
  if(!c.msgs.length) return toast("Dışa aktarılacak mesaj yok");
  const md = `# ${c.title}\n\n` + c.msgs.map(m => `### ${m.role==="user"?"Kullanıcı":"Çevirmen AI"}\n${m.text}\n`).join("\n---\n\n");
  downloadBlob(new Blob([md],{type:"text/markdown"}), `sohbet-${c.title.replace(/[^\w]+/g,"_").slice(0,30)}.md`);
  toast("⬇ Sohbet Markdown olarak indirildi!");
});
$("#chatPersonaBtn")?.addEventListener("click", async () => {
  const c = getActiveChat();
  const p = await showPromptSheet("🎭 AI Sohbet Kişiliği", "Sistem promptu:", c.persona);
  if(p !== null){ c.persona = p; saveState(); toast("Kişilik güncellendi"); }
});

/* ===================== 8. SERİ WİKİ & ETKİLEŞİMLİ ZOOM / PAN / PINCH İLİŞKİ HARİTASI (A1) ===================== */
let wikiZoom = 1, wikiPanX = 0, wikiPanY = 0;
function updateWikiViewBox(){
  const svg = $("#wikiSvg"); if(!svg) return;
  const w = 500 / wikiZoom, h = 260 / wikiZoom;
  svg.setAttribute("viewBox", `${wikiPanX} ${wikiPanY} ${w} ${h}`);
}
$("#wikiZoomIn")?.addEventListener("click", () => { wikiZoom = Math.min(3.5, wikiZoom + 0.3); updateWikiViewBox(); });
$("#wikiZoomOut")?.addEventListener("click", () => { wikiZoom = Math.max(0.5, wikiZoom - 0.3); updateWikiViewBox(); });
$("#wikiZoomReset")?.addEventListener("click", () => { wikiZoom = 1; wikiPanX = 0; wikiPanY = 0; updateWikiViewBox(); });

// A1: Parmağınla sürükle (Pan) + Çift parmak yakınlaştır (Pinch-Zoom)
const wikiWrap = $("#wikiGraphWrap");
if(wikiWrap){
  let pDrag = false, pLastX = 0, pLastY = 0, pinchDist = 0;
  const dist = (a,b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  wikiWrap.addEventListener("touchstart", e => {
    if(e.target.closest("button")) return;
    if(e.touches.length === 1){ pDrag = true; pLastX = e.touches[0].clientX; pLastY = e.touches[0].clientY; }
    else if(e.touches.length === 2){ pDrag = false; pinchDist = dist(e.touches[0], e.touches[1]); }
  }, {passive:true});
  wikiWrap.addEventListener("touchmove", e => {
    if(e.touches.length === 1 && pDrag){
      const dx = e.touches[0].clientX - pLastX, dy = e.touches[0].clientY - pLastY;
      pLastX = e.touches[0].clientX; pLastY = e.touches[0].clientY;
      const scaleX = (500 / wikiZoom) / Math.max(1, wikiWrap.clientWidth);
      const scaleY = (260 / wikiZoom) / Math.max(1, wikiWrap.clientHeight);
      wikiPanX -= dx * scaleX; wikiPanY -= dy * scaleY;
      updateWikiViewBox();
    } else if(e.touches.length === 2 && pinchDist > 0){
      const nd = dist(e.touches[0], e.touches[1]);
      wikiZoom = Math.max(0.5, Math.min(3.5, wikiZoom * (nd / pinchDist)));
      pinchDist = nd;
      updateWikiViewBox();
    }
  }, {passive:true});
  wikiWrap.addEventListener("touchend", () => { pDrag = false; pinchDist = 0; }, {passive:true});
}

function renderWikiModal(){
  const bk = R.book; if(!bk) return;
  const wiki = bk.wiki || {chars:[], rels:[]};
  const svg = $("#wikiSvg"), list = $("#wikiList"), det = $("#wikiNodeDetail");
  det.style.display = "none";
  if(!wiki.chars.length){
    svg.innerHTML = `<text x="250" y="130" text-anchor="middle" fill="#9287aa" font-size="13">Henüz karakter taranmadı. Yukarıdan tara!</text>`;
    list.innerHTML = "";
    return;
  }
  const n = wiki.chars.length, cx = 250, cy = 130;
  const pos = wiki.chars.map((c, i) => {
    const ring = i < 10 ? 0 : 1;
    const countInRing = ring === 0 ? Math.min(10, n) : (n - 10);
    const idxInRing = ring === 0 ? i : (i - 10);
    const rx = ring === 0 ? 155 : 215, ry = ring === 0 ? 85 : 112;
    const ang = (idxInRing / Math.max(1, countInRing)) * Math.PI * 2 - Math.PI/2; // A1: Math.PI düzeltildi!
    return {x: cx + Math.cos(ang)*rx, y: cy + Math.sin(ang)*ry, c};
  });
  let html = "";
  (wiki.rels || []).forEach(r => {
    const a = pos.find(p=>p.c.name===r.from), b = pos.find(p=>p.c.name===r.to);
    if(a && b) html += `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="#a855f788" stroke-width="1.8"/><text x="${((a.x+b.x)/2).toFixed(1)}" y="${((a.y+b.y)/2).toFixed(1)}" fill="#c4b5fd" font-size="8.5" text-anchor="middle">${esc(r.label||"")}</text>`;
  });
  pos.forEach((p, idx) => {
    html += `<g class="wnode" data-wi="${idx}" style="cursor:pointer"><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="19" fill="#1b1130" stroke="#e879f9" stroke-width="2"/><text x="${p.x.toFixed(1)}" y="${(p.y+3).toFixed(1)}" fill="#fff" font-size="9.5" font-weight="700" text-anchor="middle">${esc(p.c.name.slice(0,11))}</text></g>`;
  });
  svg.innerHTML = html;
  updateWikiViewBox();
  svg.querySelectorAll(".wnode").forEach(g => g.onclick = () => {
    const c = wiki.chars[Number(g.dataset.wi)];
    const rels = (wiki.rels||[]).filter(r=>r.from===c.name||r.to===c.name).map(r=>`${r.from} ↔ ${r.to} (${r.label})`).join(" • ");
    det.innerHTML = `<div class="item-title" style="color:var(--accent)">👤 ${esc(c.name)} ${c.orig?`(${esc(c.orig)})`:""}</div><div class="item-sub" style="color:var(--text)">${esc(c.desc||"")}</div>${rels?`<div class="meta" style="margin-top:4px">🔗 ${esc(rels)}</div>`:""}`;
    det.style.display = "block";
  });
  list.innerHTML = wiki.chars.map(c=>`<div class="item"><div class="item-body"><div class="item-title">👤 ${esc(c.name)} ${c.orig?`<span class="meta">(${esc(c.orig)})</span>`:""}</div><div class="item-sub">${esc(c.desc||"")}</div></div></div>`).join("");
}

async function scanWikiRange(startIdx, endIdx){
  if(!R.book) return;
  toast("🧬 Wiki taranıyor…");
  const sample = R.book.chapters.slice(startIdx, endIdx+1).map(c=>(c.trText||c.text||"").slice(0,2200)).join("\n---\n").slice(0,14000);
  try{
    const raw = await callAI({task:"chat", stream:false, messages:[
      {role:"system", content:`Bu hikaye bölümlerindeki karakterleri, orijinal isimlerini, kısa rollerini ve aralarındaki ilişkileri çıkar. SADECE JSON dön: {"chars":[{"name":"Türkçe Ad","orig":"Orijinal Ad","desc":"kısa rol"}],"rels":[{"from":"Ad1","to":"Ad2","label":"dost/düşman/usta"}]}`},
      {role:"user", content:sample}
    ]});
    const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}")+1));
    const cur = R.book.wiki || {chars:[], rels:[]};
    (j.chars||[]).forEach(nc => { if(!cur.chars.some(x=>x.name.toLowerCase()===nc.name.toLowerCase())) cur.chars.push(nc); });
    (j.rels||[]).forEach(nr => { if(!cur.rels.some(x=>x.from===nr.from && x.to===nr.to)) cur.rels.push(nr); });
    R.book.wiki = cur; await dbPut(R.book); renderWikiModal(); haptic("success"); toast(`🧬 Wiki güncellendi (${cur.chars.length} karakter)!`);
  }catch(e){ toast("Wiki hatası: "+e.message); }
}

$("#rWikiBtn")?.addEventListener("click", () => { closeModal("rSetModal"); renderWikiModal(); openModal("wikiModal"); });
$("#wikiScanCurBtn")?.addEventListener("click", () => scanWikiRange(R.chapIdx, R.chapIdx));
$("#wikiScanMultiBtn")?.addEventListener("click", async () => {
  const maxC = R.book?.chapters?.length || 1;
  const rng = await showPromptSheet("📚 Çoklu Bölüm Wiki Tara", `Bölüm aralığı (1-${maxC}):`, `${Math.max(1,R.chapIdx+1)}-${Math.min(maxC, R.chapIdx+5)}`);
  if(!rng) return;
  const [a,b] = rng.split("-").map(x=>Math.max(1, Number(x)||1));
  scanWikiRange(a-1, Math.min(maxC-1, (b||a)-1));
});
$("#wikiSyncGlossBtn")?.addEventListener("click", () => {
  const S = getS(), chars = R.book?.wiki?.chars || [];
  let added = 0;
  chars.forEach(c => {
    if(c.orig && c.name && c.orig !== c.name && !S.glossary.some(g=>g.src===c.orig && g.bookId===R.book.id)){
      S.glossary.unshift({id:uid(), src:c.orig, tgt:c.name, bookId:R.book.id}); added++;
    }
  });
  saveState(); renderGlossary(); toast(added ? `📖 ${added} karakter kitap sözlüğüne aktarıldı!` : "Aktarılacak yeni karakter bulunamadı");
});

/* ===================== 9. GERÇEK ÇOKLU KARAKTER TTS & SES SEÇİCİ (A8 & C6) ===================== */
let ttsQueue = [], ttsPos = 0, ttsRunToken = 0;

function populateTtsVoices(){
  const sel = $("#rVoiceSel"); if(!sel || !window.speechSynthesis) return;
  const voices = speechSynthesis.getVoices() || [];
  const cur = getS().reader.voiceName || "";
  const sorted = [...voices].sort((a,b) => (b.lang.startsWith("tr")?1:0) - (a.lang.startsWith("tr")?1:0));
  sel.innerHTML = `<option value="">Varsayılan (tr-TR)</option>` + sorted.slice(0,40).map(v=>`<option value="${esc(v.name)}">${esc(v.name)} (${esc(v.lang)})</option>`).join("");
  if(cur) sel.value = cur;
}
if(window.speechSynthesis){
  populateTtsVoices();
  speechSynthesis.onvoiceschanged = populateTtsVoices;
}
$("#rVoiceSel")?.addEventListener("change", e => { const S=getS(); S.reader.voiceName = e.target.value; saveState(); });

function stopTts(){
  ttsRunToken++;
  if(window.speechSynthesis) speechSynthesis.cancel();
  R.ttsSpeaking = false;
  $$("#rBody p.tts-active").forEach(p=>p.classList.remove("tts-active"));
  const b = $("#rTtsBtn"); if(b) b.textContent = "🔊 Oku";
}
window.CAI_stopTts = stopTts;

function pickSelectedVoice(){
  const name = getS().reader.voiceName;
  if(!name || !window.speechSynthesis) return null;
  return (speechSynthesis.getVoices()||[]).find(v => v.name === name) || null;
}

// Çoklu karakter modu: paragrafı anlatıcı ve tırnak içi diyalog segmentlerine ayırır
function splitTtsSegments(text){
  if((getS().reader.ttsMode || "multi") !== "multi") return [{text, isDlg:false}];
  const segs = [];
  const re = /([“"][^”"]+[”"])/g;
  let last = 0, m;
  while((m = re.exec(text)) !== null){
    if(m.index > last){ const a = text.slice(last, m.index).trim(); if(a) segs.push({text:a, isDlg:false}); }
    segs.push({text:m[1], isDlg:true});
    last = re.lastIndex;
  }
  const tail = text.slice(last).trim();
  if(tail) segs.push({text:tail, isDlg:false});
  return segs.length ? segs : [{text, isDlg:false}];
}

function speakNextPara(token){
  if(!R.ttsSpeaking || token !== ttsRunToken) return;
  $$("#rBody p.tts-active").forEach(p=>p.classList.remove("tts-active"));
  if(ttsPos >= ttsQueue.length){
    if(getS().reader.ttsCont && R.book && R.chapIdx < R.book.chapters.length - 1){
      R.chapIdx++; renderCurrentChapter();
      setTimeout(startTtsFromChapter, 500);
    } else stopTts();
    return;
  }
  const el = ttsQueue[ttsPos];
  el.classList.add("tts-active");
  el.scrollIntoView({behavior:"smooth", block:"center"});
  const segs = splitTtsSegments(el.textContent || "");
  const voice = pickSelectedVoice();
  const baseRate = getS().reader.ttsRate || 1.0;

  let si = 0;
  const speakSeg = () => {
    if(!R.ttsSpeaking || token !== ttsRunToken) return;
    if(si >= segs.length){ ttsPos++; speakNextPara(token); return; }
    const seg = segs[si++];
    const u = new SpeechSynthesisUtterance(seg.text);
    u.lang = voice?.lang || "tr-TR";
    if(voice) u.voice = voice;
    u.rate = seg.isDlg ? Math.min(2.0, baseRate * 1.04) : baseRate;
    u.pitch = seg.isDlg ? 1.14 : 0.96; // Diyaloglarda daha canlı karakter tonu!
    u.onend = () => speakSeg();
    u.onerror = () => stopTts();
    speechSynthesis.speak(u);
  };
  speakSeg();
}

function startTtsFromChapter(){
  if(!window.speechSynthesis) return toast("TTS desteklenmiyor");
  ttsQueue = $$("#rBody p").filter(p=>p.textContent.trim().length > 1);
  if(!ttsQueue.length) return toast("Okunacak metin yok");
  ttsRunToken++;
  ttsPos = 0; R.ttsSpeaking = true;
  $("#rTtsBtn").textContent = "⏹ Durdur";
  speakNextPara(ttsRunToken);
}
$("#rTtsBtn")?.addEventListener("click", () => { if(R.ttsSpeaking) stopTts(); else startTtsFromChapter(); });

/* ===================== 10. AMBİYANS SES MİKSERİ (ÇEVRİMDIŞI) ===================== */
let ambCtx = null;
const ambNodes = {};
function setAmbienceLevel(kind, vol){
  if(vol <= 0.01){
    if(ambNodes[kind]){ try{ ambNodes[kind].src.stop(); }catch{} delete ambNodes[kind]; }
    return;
  }
  if(!ambCtx) ambCtx = new (window.AudioContext || window.webkitAudioContext)();
  if(ambCtx.state === "suspended") ambCtx.resume();
  if(!ambNodes[kind]){
    const len = ambCtx.sampleRate * 3, buf = ambCtx.createBuffer(1, len, ambCtx.sampleRate), data = buf.getChannelData(0);
    let last = 0;
    for(let i=0;i<len;i++){
      const w = Math.random()*2 - 1;
      if(kind==="rain") data[i] = (last + 0.08*w)/1.08;
      else if(kind==="fire") data[i] = (last + 0.02*w)/1.02 + (Math.random()>0.997 ? (Math.random()-0.5)*0.6 : 0);
      else if(kind==="wind") data[i] = Math.sin(i/3200)*0.2 + (last + 0.03*w)/1.03;
      else if(kind==="cafe") data[i] = (last + 0.05*w)/1.05 * 0.7;
      else data[i] = Math.sin(i/120)*0.03 + (last + 0.015*w)/1.015;
      last = data[i];
    }
    const src = ambCtx.createBufferSource(); src.buffer = buf; src.loop = true;
    const filter = ambCtx.createBiquadFilter(); filter.type = "lowpass";
    filter.frequency.value = kind==="rain"?1400 : kind==="fire"?600 : kind==="wind"?450 : kind==="cafe"?950 : 320;
    const gain = ambCtx.createGain();
    src.connect(filter); filter.connect(gain); gain.connect(ambCtx.destination);
    src.start();
    ambNodes[kind] = {src, gain};
  }
  ambNodes[kind].gain.gain.setTargetAtTime(vol * 0.45, ambCtx.currentTime, 0.05);
}
$$("#ambMixer [data-amb]").forEach(r => r.oninput = e => setAmbienceLevel(e.target.dataset.amb, Number(e.target.value)));
$("#stopAmbBtn")?.addEventListener("click", () => {
  $$("#ambMixer [data-amb]").forEach(r => { r.value = 0; setAmbienceLevel(r.dataset.amb, 0); });
  toast("Ambiyans sesleri durduruldu");
});
$("#rAmbBtn")?.addEventListener("click", () => {
  const rainEl = $('#ambMixer [data-amb="rain"]');
  const cur = Number(rainEl?.value || 0);
  const nxt = cur > 0 ? 0 : 0.45;
  if(rainEl) rainEl.value = nxt;
  setAmbienceLevel("rain", nxt);
  toast(nxt > 0 ? "🌧️ Yağmur ambiyansı açıldı (Mikser için Stüdyo)" : "🔇 Ambiyans kapatıldı");
});

/* ===================== 11. OPDS KATALOG & VURGULAR LİSTESİ (D1) ===================== */
$("#opdsBtn")?.addEventListener("click", () => openModal("opdsModal"));
$("#opdsLoadBtn")?.addEventListener("click", async () => {
  const u = $("#opdsUrl").value.trim(); if(!u) return;
  $("#opdsList").innerHTML = `<div class="meta">⏳ Katalog yükleniyor…</div>`;
  const info = await fetchUrlInfo(u);
  if(!info.html) return $("#opdsList").innerHTML = `<div class="status error">Katalog alınamadı</div>`;
  const doc = new DOMParser().parseFromString(info.html, "text/xml");
  const entries = [...doc.querySelectorAll("entry")].slice(0,30);
  $("#opdsList").innerHTML = entries.map(e => {
    const title = e.querySelector("title")?.textContent || "Kitap";
    const epub = [...e.querySelectorAll("link")].find(l=>(l.getAttribute("type")||"").includes("epub"))?.getAttribute("href");
    const abs = epub ? new URL(epub, u).href : "";
    return `<div class="item"><div class="item-body"><div class="item-title">${esc(title)}</div></div>${abs?`<button class="btn small primary" data-opdsdl="${esc(abs)}">İndir</button>`:""}</div>`;
  }).join("") || `<div class="meta">Kitap bulunamadı</div>`;
  $$("[data-opdsdl]").forEach(b=>b.onclick=()=>openRealBrowser(b.dataset.opdsdl));
});

$("#rHlListBtn")?.addEventListener("click", () => {
  const hls = getS().highlights.filter(h=>h.bookId===R.book?.id);
  const text = hls.length ? hls.map((h,i)=>`${i+1}. [Bölüm ${h.chapIdx+1}] "${h.text}"`).join("\n\n") : "Bu kitapta henüz vurgu yok.";
  showInfoSheet("🖍️ Kitap Vurguları", text, hls.length ? text : null);
});

// İlk başlatma + C7 Otomatik Seri Takip Kontrolü (3 saatte bir)
updateVpnBtn(); updateNotifBadge(); updateLrBadge(); renderFmhyQuick(); renderChatFull(); populateChatBooks();
setTimeout(() => {
  const S = ensureWatchData();
  if(S.autoWatch && S.watchlist.length && (!S.lastAutoWatch || Date.now() - S.lastAutoWatch > 3 * 3600000)){
    runWatchlistCheck(true);
  }
}, 4000);
})();
