(() => {
"use strict";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const todayKey = (d=new Date()) => d.toISOString().slice(0,10);
const isNative = () => !!(window.AndroidBridge && window.AndroidBridge.isNative && window.AndroidBridge.isNative());
const haptic = (type="light") => { if(isNative() && window.AndroidBridge.vibrate) try{window.AndroidBridge.vibrate(type);}catch{} };
const b64DecodeUtf8 = b64 => { const bin=atob(b64), bytes=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i); return new TextDecoder().decode(bytes); };

function u8ToBase64(u8){
  let bin = "";
  const chunk = 8192;
  for(let i=0; i<u8.length; i+=chunk) bin += String.fromCharCode.apply(null, u8.subarray(i, i+chunk));
  return btoa(bin);
}

function fastHash(str){
  let h = 2166136261;
  for(let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + "_" + str.length;
}

const DEBUG_LOGS = [];
function debugLog(level, msg){
  const line = `[${new Date().toLocaleTimeString("tr")}] [${level}] ${msg}`;
  DEBUG_LOGS.unshift(line);
  if(DEBUG_LOGS.length > 150) DEBUG_LOGS.length = 150;
  const el = $("#debugLogs");
  if(el && $("#debugModal")?.classList.contains("open")) el.textContent = DEBUG_LOGS.join("\n");
}
window.addEventListener("error", e => debugLog("ERR", `${e.message} (${e.filename}:${e.lineno})`));
window.addEventListener("unhandledrejection", e => debugLog("PROMISE", String(e.reason)));

let toastTimer;
function toast(msg){ const el=$("#toast"); if(!el) return; el.textContent=msg; el.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove("show"),2700); }
async function copyText(txt){ if(!txt)return toast("Metin yok"); try{await navigator.clipboard.writeText(txt);haptic("light");toast("Kopyalandı");}catch{const t=document.createElement("textarea");t.value=txt;document.body.appendChild(t);t.select();document.execCommand("copy");t.remove();toast("Kopyalandı");} }
async function shareText(title, text){ if(!text)return toast("Metin yok"); if(navigator.share){try{await navigator.share({title,text});return;}catch{}} copyText(text); }
async function downloadBlob(blob, filename){
  if(isNative() && window.AndroidBridge.saveFile){
    const fr=new FileReader(); fr.onload=()=>window.AndroidBridge.saveFile(filename,String(fr.result).split(",")[1]||"",blob.type||"application/octet-stream"); fr.readAsDataURL(blob); return;
  }
  const u=URL.createObjectURL(blob), a=document.createElement("a"); a.href=u; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(u),4000);
}
function openModal(id){ $("#"+id)?.classList.add("open"); }
function closeModal(id){ $("#"+id)?.classList.remove("open"); }
$$("[data-close]").forEach(b=>b.onclick=()=>closeModal(b.dataset.close));
$$(".modal").forEach(m=>m.addEventListener("click",e=>{if(e.target===m)m.classList.remove("open");}));
$("#lightbox")?.addEventListener("click", ()=>$("#lightbox").classList.remove("open"));

function showInfoSheet(title, content, copyVal=null, isHtml=false, extraBtn=null){
  $("#infoSheetTitle").textContent = title;
  const body = $("#infoSheetBody");
  if(isHtml) body.innerHTML = content;
  else body.textContent = content;
  const cbtn = $("#infoSheetCopyBtn");
  if(copyVal !== null){ cbtn.style.display = "inline-flex"; cbtn.onclick = () => copyText(copyVal); }
  else cbtn.style.display = "none";
  const ebtn = $("#infoSheetExtraBtn");
  if(extraBtn && extraBtn.label){
    ebtn.style.display = "inline-flex"; ebtn.textContent = extraBtn.label;
    ebtn.onclick = extraBtn.onClick;
  } else ebtn.style.display = "none";
  openModal("infoSheetModal");
}

function showPromptSheet(title, label, defaultVal="", placeholder=""){
  return new Promise(resolve => {
    $("#promptSheetTitle").textContent = title;
    $("#promptSheetLabel").textContent = label || "";
    const inp = $("#promptSheetInput");
    inp.value = defaultVal ?? ""; inp.placeholder = placeholder || "";
    const done = val => {
      closeModal("promptSheetModal");
      $("#promptSheetOk").onclick = null; $("#promptSheetCancel").onclick = null; inp.onkeydown = null;
      resolve(val);
    };
    $("#promptSheetOk").onclick = () => done(inp.value);
    $("#promptSheetCancel").onclick = () => done(null);
    inp.onkeydown = e => { if(e.key==="Enter"){ e.preventDefault(); done(inp.value); } };
    openModal("promptSheetModal");
    setTimeout(()=>{ inp.focus(); inp.select(); }, 60);
  });
}

window.__onHardwareBack = () => {
  if($("#lightbox")?.classList.contains("open")){ $("#lightbox").classList.remove("open"); return "handled"; }
  const openModals = $$(".modal.open");
  if(openModals.length){ openModals[openModals.length-1].classList.remove("open"); return "handled"; }
  if($("#reader")?.classList.contains("open")){ closeReader(); return "handled"; }
  const activeView = $(".view.active")?.id;
  if(activeView && activeView !== "view-text"){ switchView("text"); return "handled"; }
  return "exit";
};

window.__onPipChanged = inPip => { document.body.classList.toggle("pip-mode", !!inPip); };

const LANGS = [
  ["auto","Otomatik Algıla"],["tr","Türkçe"],["en","İngilizce"],["ja","Japonca"],["ko","Korece"],
  ["zh-CN","Çince (Basitleştirilmiş)"],["zh-TW","Çince (Geleneksel)"],["de","Almanca"],
  ["fr","Fransızca"],["es","İspanyolca"],["it","İtalyanca"],["pt","Portekizce"],
  ["ru","Rusça"],["uk","Ukraynaca"],["pl","Lehçe"],["nl","Hollandaca"],
  ["el","Yunanca"],["ar","Arapça"],["fa","Farsça"],["hi","Hintçe"],["az","Azerbaycan Türkçesi"]
];
const langName = c => (LANGS.find(l=>l[0]===c)||[c,c])[1];
const langShort = c => String(c||"tr").split("-")[0].toUpperCase();

const DEFAULT_PROMPTS = [
  {id:"def", name:"Varsayılan (Profesyonel)", builtIn:true, text:"Sen uzman bir çevirmensin. Metni anlamı, tonu ve paragraf düzenini koruyarak doğal, akıcı ve hatasız şekilde hedef dile çevir. Sadece çeviriyi yaz."},
  {id:"novel", name:"Web Novel / LitRPG (Stat Korumalı)", builtIn:true, text:"Sen deneyimli bir web novel ve LitRPG çevirmenisin. Hikayeyi akıcı ve doğal çevir. Sistem mesajlarını, stat/seviye kutularını ve özel isimleri koru. Sadece çeviriyi yaz."},
  {id:"lit", name:"Edebi Roman (Akıcı & Doğal)", builtIn:true, text:"Sen edebi bir çevirmensin. Metnin duygusunu, üslubunu ve deyimlerini hedef dilde en doğal biçimde yeniden kur. Sadece çeviriyi yaz."},
  {id:"lit2", name:"Birebir / Sadık Çeviri", builtIn:true, text:"Metni ekleme veya çıkarma yapmadan, cümle yapısına ve terimlere sadık kalarak çevir. Sadece çeviriyi yaz."}
];
const DEFAULT_BOOKMARKS = [
  {id:"bm0",name:"Google",url:"https://www.google.com"},{id:"bm1",name:"WebNovel",url:"https://www.webnovel.com"},
  {id:"bm2",name:"NovelBin",url:"https://novelbin.com"},{id:"bm3",name:"RoyalRoad",url:"https://www.royalroad.com"},
  {id:"bm4",name:"MangaDex",url:"https://mangadex.org"},{id:"bm5",name:"FMHY",url:"https://fmhy.net/reading"}
];

const STORE_KEY = "cevirmen_ai_native_v5";
const defaultState = () => ({
  apiKey:"", baseUrl:"https://api.literouter.com/v1", model:"", fallbackModel:"",
  apiProfiles:[{id:"def", name:"LiteRouter (Varsayılan)", baseUrl:"https://api.literouter.com/v1", apiKey:""}],
  activeProfileId:"def",
  singleModel:true, taskModels:{text:"", vision:"", chat:""},
  favModels:[], cachedModels:[], lrCosts:[], lrLastScan:0,
  srcLang:"auto", tgtLang:"tr",
  honorificMode:"keep",
  slidingContext:true,
  tmEnabled:true,
  browserTweaks:{infiniteScroll:false, unlockCopy:true, antiPopup:true},
  budget:{dailyUsd:0.50, dailyTok:250000, autoCheap:true, cheapModel:"", todayDate:todayKey(), todayUsd:0, todayTok:0},
  gist:{token:"", id:""},
  flashcards:[],
  stream:true, keepScreen:true, immersiveReader:true, tnEnabled:false, clipWatch:true, autoWatch:true, lastAutoWatch:0,
  temp:0.3, chunkSize:6000, priceIn:0.15, priceOut:0.60,
  appTheme:"default", animStyle:"fade", lastBackup:0, dailyGoalMins:30,
  navTabs:["text","browser","library","chat","studio","settings"],
  prompts: structuredClone(DEFAULT_PROMPTS), activePromptId:"def",
  glossary:[], glossEnabled:true, bookmarks: structuredClone(DEFAULT_BOOKMARKS),
  tabs:[{id:"tab1",title:"Google",url:"https://www.google.com"}], activeTabId:"tab1",
  browserHistory:[],
  bAutoSave:true, history:[], highlights:[], dailyActivity:{},
  mangaStyle:{dir:"webtoon", dualPage:true, font:"system-ui, -apple-system, sans-serif", scale:1.0, alpha:1.0, border:"#8b5cf6"},
  stats:{totalSecs:0, totalWords:0, streak:0, lastDay:""},
  usage:{reqs:0, inTok:0, outTok:0, totalMs:0},
  reader:{theme:"night", font:"Georgia,serif", size:18, lh:1.8, width:"760px", align:"left", viewMode:"tr",
    dimmer:0, amber:0, litrpgHud:true,
    dlgColor:false, bionic:false, ruler:false, prefetch:true, ttsCont:true, ttsRate:1.0, ttsMode:"multi", voiceName:"", scrollSpeed:3}
});

let S = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (!raw) return defaultState();
    const d = defaultState();
    const m = {...d, ...raw,
      reader:{...d.reader,...(raw.reader||{})}, stats:{...d.stats,...(raw.stats||{})},
      usage:{...d.usage,...(raw.usage||{})}, mangaStyle:{...d.mangaStyle,...(raw.mangaStyle||{})},
      taskModels:{...d.taskModels,...(raw.taskModels||{})}, dailyActivity:{...(raw.dailyActivity||{})},
      browserTweaks:{...d.browserTweaks,...(raw.browserTweaks||{})},
      budget:{...d.budget,...(raw.budget||{})},
      gist:{...d.gist,...(raw.gist||{})},
      apiProfiles:raw.apiProfiles?.length?raw.apiProfiles:d.apiProfiles,
      prompts:raw.prompts?.length?raw.prompts:d.prompts, bookmarks:raw.bookmarks||d.bookmarks,
      tabs:raw.tabs?.length?raw.tabs:d.tabs, navTabs:raw.navTabs?.length?raw.navTabs:d.navTabs,
      browserHistory:Array.isArray(raw.browserHistory)?raw.browserHistory:[],
      flashcards:Array.isArray(raw.flashcards)?raw.flashcards:[],
      glossary:raw.glossary||[], history:raw.history||[], highlights:raw.highlights||[], lrCosts:raw.lrCosts||[]};
    if(m.mangaStyle.font) m.mangaStyle.font = m.mangaStyle.font.replace(/['"]/g, "");
    if(m.budget.todayDate !== todayKey()){ m.budget.todayDate = todayKey(); m.budget.todayUsd = 0; m.budget.todayTok = 0; }
    return m;
  } catch { return defaultState(); }
})();

function getModelForTask(task="text"){
  if(S.budget.autoCheap){
    const overUsd = S.budget.dailyUsd > 0 && S.budget.todayUsd >= S.budget.dailyUsd;
    const overTok = S.budget.dailyTok > 0 && S.budget.todayTok >= S.budget.dailyTok;
    if(overUsd || overTok){
      if(S.budget.cheapModel && S.budget.cheapModel.trim()) return S.budget.cheapModel.trim();
      const cheapest = [...(S.lrCosts||[])].sort((a,b)=>(a.numCost??999)-(b.numCost??999))[0];
      if(cheapest?.id) return cheapest.id;
    }
  }
  if(!S.singleModel && S.taskModels && S.taskModels[task] && S.taskModels[task].trim()) return S.taskModels[task].trim();
  return S.model;
}

let lastNativeSig = "";
function saveState(forceNative=false){
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch(e){ debugLog("ERR","localStorage: "+e.message); }
  const cfg = {
    apiKey:S.apiKey, baseUrl:S.baseUrl, model:getModelForTask("text"),
    visionModel:getModelForTask("vision"), tgtLang:langName(S.tgtLang), tgtCode:langShort(S.tgtLang),
    mangaFont:(S.mangaStyle.font||"system-ui, sans-serif").replace(/['"]/g,""),
    mangaFontScale:S.mangaStyle.scale, mangaBgAlpha:S.mangaStyle.alpha,
    mangaBorder:(S.mangaStyle.border||"#8b5cf6").replace(/['"]/g,""),
    twInfinite:!!S.browserTweaks.infiniteScroll,
    twUnlockCopy:!!S.browserTweaks.unlockCopy,
    twAntiPopup:!!S.browserTweaks.antiPopup
  };
  const sig = JSON.stringify(cfg);
  if((forceNative || sig !== lastNativeSig) && isNative() && window.AndroidBridge.syncConfig){
    lastNativeSig = sig;
    window.AndroidBridge.syncConfig(sig);
  }
}

/* ===================== INDEXEDDB: KÜTÜPHANE, MEDYA VE TM CACHE ===================== */
const DB_NAME = "CevirmenAI_Library_v2";
let dbPromise = null;
function openDB(){
  if(dbPromise) return dbPromise;
  dbPromise = new Promise((res,rej)=>{
    const req = indexedDB.open(DB_NAME, 3);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if(!db.objectStoreNames.contains("books")) db.createObjectStore("books",{keyPath:"id"});
      if(!db.objectStoreNames.contains("media")) db.createObjectStore("media",{keyPath:"id"});
      if(!db.objectStoreNames.contains("tm")) db.createObjectStore("tm",{keyPath:"k"});
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  return dbPromise;
}
async function dbAll(){ const db=await openDB(); return new Promise((res,rej)=>{ const r=db.transaction("books","readonly").objectStore("books").getAll(); r.onsuccess=()=>res(r.result||[]); r.onerror=()=>rej(r.error); }); }
async function dbGet(id){ const db=await openDB(); return new Promise((res,rej)=>{ const r=db.transaction("books","readonly").objectStore("books").get(id); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
async function dbPut(obj){ const db=await openDB(); return new Promise((res,rej)=>{ const r=db.transaction("books","readwrite").objectStore("books").put(obj); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); }); }
async function dbDel(id){ const db=await openDB(); return new Promise((res,rej)=>{ const r=db.transaction("books","readwrite").objectStore("books").delete(id); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); }); }
async function mediaPut(id, dataUrl){ const db=await openDB(); return new Promise((res,rej)=>{ const r=db.transaction("media","readwrite").objectStore("media").put({id, dataUrl, ts:Date.now()}); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); }); }
async function mediaGet(id){ const db=await openDB(); return new Promise((res,rej)=>{ const r=db.transaction("media","readonly").objectStore("media").get(id); r.onsuccess=()=>res(r.result?.dataUrl||""); r.onerror=()=>rej(r.error); }); }

async function tmLookup(src, tgtLang=S.tgtLang){
  if(!S.tmEnabled || !src || src.length > 4000) return null;
  try{
    const db = await openDB();
    const k = tgtLang + ":" + fastHash(src.trim());
    return await new Promise(res => {
      const r = db.transaction("tm","readonly").objectStore("tm").get(k);
      r.onsuccess = () => res(r.result?.out || null);
      r.onerror = () => res(null);
    });
  }catch{ return null; }
}
async function tmStore(src, out, tgtLang=S.tgtLang){
  if(!S.tmEnabled || !src || !out || src.length > 4000) return;
  try{
    const db = await openDB();
    const k = tgtLang + ":" + fastHash(src.trim());
    db.transaction("tm","readwrite").objectStore("tm").put({k, out, ts:Date.now()});
  }catch{}
}
async function tmCount(){
  try{
    const db = await openDB();
    return await new Promise(res => { const r = db.transaction("tm","readonly").objectStore("tm").count(); r.onsuccess=()=>res(r.result||0); r.onerror=()=>res(0); });
  }catch{ return 0; }
}
async function tmClear(){
  const db = await openDB();
  return new Promise(res => { const r = db.transaction("tm","readwrite").objectStore("tm").clear(); r.onsuccess=()=>res(); r.onerror=()=>res(); });
}

/* ===================== TEMA, NAVİGASYON & HEADER ===================== */
const ALL_TABS = [
  {id:"text", ic:"🌐", label:"Metin"},
  {id:"browser", ic:"🧭", label:"Tarayıcı"},
  {id:"library", ic:"📚", label:"Kütüphane"},
  {id:"chat", ic:"💬", label:"Sohbet"},
  {id:"manga", ic:"🫧", label:"Manga"},
  {id:"studio", ic:"🎛️", label:"Stüdyo"},
  {id:"costs", ic:"💰", label:"Maliyet"},
  {id:"settings", ic:"⚙️", label:"Ayarlar"}
];
const THEME_BAR_COLORS = { default:"#06040b", amoled:"#000000", pink:"#06040b", blue:"#040712", emerald:"#030a08" };

function applyThemeAndAnim(){
  document.body.className = `anim-${S.animStyle||"fade"}` + (S.appTheme && S.appTheme!=="default" ? ` th-${S.appTheme}` : "");
  const barCol = THEME_BAR_COLORS[S.appTheme] || "#06040b";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", barCol);
  if(isNative() && window.AndroidBridge.setSystemBarsColor) window.AndroidBridge.setSystemBarsColor(barCol);
  const hdrM = $("#hdrModelBtn");
  if(hdrM) hdrM.textContent = "🤖 " + (S.model ? S.model.split("/").pop() : "Model seç");
  if(isNative() && window.AndroidBridge.setKeepScreenOn) window.AndroidBridge.setKeepScreenOn(!!S.keepScreen);
  if(window.CAI_updateLrBadge) window.CAI_updateLrBadge();
  updateSrcCostHint();
}

function renderBottomNav(){
  const nav = $("#bottomNav"); if(!nav) return;
  const activeId = $(".view.active")?.id?.replace("view-","") || "text";
  const tabs = S.navTabs.map(id => ALL_TABS.find(t=>t.id===id)).filter(Boolean);
  nav.innerHTML = tabs.map(t=>`<button data-view="${t.id}" class="${t.id===activeId?"active":""}"><span class="ic">${t.ic}</span><span>${t.label}</span></button>`).join("");
  nav.querySelectorAll("button").forEach(b=>b.onclick=()=>{ haptic("light"); switchView(b.dataset.view); });
}

function switchView(id){
  $$(".view").forEach(v=>v.classList.toggle("active", v.id==="view-"+id));
  $$("#bottomNav button").forEach(b=>b.classList.toggle("active", b.dataset.view===id));
  if(id==="library") renderLibrary();
  if(id==="chat" && window.CAI_onChatViewOpen) window.CAI_onChatViewOpen();
  if(id==="studio"){ renderGlossary(); renderPromptUI(); renderWrapped(); if(window.CAI_updateFcBadge) window.CAI_updateFcBadge(); }
  if(id==="costs" && window.CAI_renderLrCosts) window.CAI_renderLrCosts();
  if(id==="settings") renderSettingsUI();
  if(id==="browser"){
    renderBrowserHistory();
    if(isNative() && window.AndroidBridge.getBlockedAdCount){
      const c = window.AndroidBridge.getBlockedAdCount();
      const p = $("#adCountPill"); if(p) p.textContent = `${c} reklam`;
    }
  }
}

/* ===================== AI MOTORU 2.0 (SLIDING CTX + HONORIFIC + FALLBACK + BÜTÇE) ===================== */
function splitChunks(text, maxLen){
  const limit = Math.max(1200, Number(maxLen) || S.chunkSize || 6000);
  if(text.length <= limit) return [text];
  const paras = text.split(/\n{2,}/), chunks = []; let cur = "";
  for(const p of paras){
    if((cur + "\n\n" + p).length > limit && cur){ chunks.push(cur.trim()); cur = p; }
    else cur = cur ? cur + "\n\n" + p : p;
  }
  if(cur.trim()) chunks.push(cur.trim());
  return chunks;
}

function getLastSentences(txt, count=3){
  if(!txt) return "";
  const sents = txt.replace(/\s+/g," ").trim().split(/(?<=[.!?…”"])\s+/).filter(Boolean);
  return sents.slice(-count).join(" ").slice(-450);
}

function buildSystemPrompt(bookId=null, prevContext=""){
  const p = S.prompts.find(x=>x.id===S.activePromptId) || S.prompts[0];
  let sys = p.text + `\nKaynak Dil: ${langName(S.srcLang)} | Hedef Dil: ${langName(S.tgtLang)}.`;
  if(S.honorificMode === "keep") sys += "\nONORİFİK KURALI: Japonca/Korece/Çince saygı eklerini (-san, -sama, -kun, Senpai, Hyung, Oppa, Shixiong vb.) orijinal şekliyle koru.";
  else if(S.honorificMode === "localize") sys += "\nONORİFİK KURALI: Yabancı saygı eklerini doğal Türkçe karşılıklarına (Üstat, Ağabey, Abla, Bey, Hanım vb.) uyarla.";
  else if(S.honorificMode === "footnote") sys += "\nONORİFİK KURALI: Saygı eklerini koru ve ilk geçişlerinde kısa [ÇN: ...] açıklaması ekle.";

  if(S.tnEnabled) sys += "\nGerekli kültürel deyimlerde kısa [ÇN: ...] notu ekle.";
  if(S.glossEnabled && S.glossary.length){
    const activeGloss = S.glossary.filter(g => !g.bookId || g.bookId === "global" || (bookId && g.bookId === bookId));
    if(activeGloss.length){
      sys += "\nZORUNLU TERİM SÖZLÜĞÜ (Bu karşılıkları birebir kullan):\n" + activeGloss.slice(0,120).map(g=>`- ${g.src} => ${g.tgt}`).join("\n");
    }
  }
  if(S.slidingContext && prevContext && prevContext.trim()){
    sys += `\n[ÖNCEKİ BAĞLAM — BUNU ÇEVİRME, SADECE ÜSLUP/ZAMİR/HİTAP TUTARLILIĞI İÇİN REFERANS AL]:\n"${prevContext.trim()}"`;
  }
  return sys;
}

async function callAI({messages, model, task="text", temperature, stream, onDelta, signal}){
  const apiKey = S.apiKey.trim(), baseUrl = S.baseUrl.replace(/\/+$/,"");
  if(S.budget.todayDate !== todayKey()){ S.budget.todayDate = todayKey(); S.budget.todayUsd = 0; S.budget.todayTok = 0; }
  const primaryMdl = model || getModelForTask(task);
  if(!apiKey || !primaryMdl) throw new Error("API Anahtarı veya Model seçilmemiş! Ayarlar'dan ekle.");
  const useStream = stream !== undefined ? stream : !!S.stream;
  const fallback = (S.fallbackModel || "").trim();
  const tryModels = [primaryMdl];
  if(fallback && fallback !== primaryMdl && !model) tryModels.push(fallback);

  const t0 = performance.now();
  let lastErr = null;
  for(let mi=0; mi<tryModels.length; mi++){
    const mdl = tryModels[mi];
    if(mi > 0){ debugLog("FALLBACK", `${primaryMdl} başarısız -> Yedek model: ${mdl}`); toast(`🛡️ Yedek modele geçildi: ${mdl.split("/").pop()}`); }
    for(let attempt=0; attempt<2; attempt++){
      try{
        const r = await fetch(baseUrl + "/chat/completions", {
          method:"POST", signal,
          headers:{"Content-Type":"application/json","Authorization":"Bearer "+apiKey},
          body:JSON.stringify({model:mdl, messages, temperature: temperature ?? S.temp, stream:useStream})
        });
        if(!r.ok){
          const errTxt = await r.text().catch(()=>"");
          if((r.status===429 || r.status>=500) && attempt===0){ await sleep(1100); continue; }
          if((r.status===429 || r.status>=500) && mi < tryModels.length-1){ lastErr = new Error(`API ${r.status}`); break; }
          throw new Error(`API ${r.status}: ${errTxt.slice(0,140)}`);
        }
        let out = "";
        if(useStream && r.body){
          const reader = r.body.getReader(), dec = new TextDecoder(); let buf = "";
          while(true){
            const {done, value} = await reader.read(); if(done) break;
            buf += dec.decode(value, {stream:true});
            const lines = buf.split("\n"); buf = lines.pop() || "";
            for(const ln of lines){
              const s = ln.trim(); if(!s.startsWith("data:")) continue;
              const payload = s.slice(5).trim(); if(payload === "[DONE]") continue;
              try{ const j = JSON.parse(payload); const d = j.choices?.[0]?.delta?.content || ""; if(d){ out += d; if(onDelta) onDelta(d, out); } }catch{}
            }
          }
        } else {
          const j = await r.json();
          out = j.choices?.[0]?.message?.content || "";
          if(onDelta) onDelta(out, out);
        }
        const inT = Math.round(JSON.stringify(messages).length/4);
        const outT = Math.round(out.length/4);
        const usd = (inT/1e6)*(S.priceIn||0.15) + (outT/1e6)*(S.priceOut||0.60);
        S.usage.reqs++; S.usage.inTok += inT; S.usage.outTok += outT; S.usage.totalMs += Math.round(performance.now()-t0);
        S.budget.todayTok += (inT + outT);
        S.budget.todayUsd += usd;
        if(S.budget.dailyUsd > 0 && S.budget.todayUsd >= S.budget.dailyUsd * 0.85 && S.budget.todayUsd - usd < S.budget.dailyUsd * 0.85){
          toast("⚠️ Günlük API bütçenin %85'ine ulaştın!");
        }
        return out;
      }catch(e){
        lastErr = e;
        if(e.name==="AbortError") throw e;
        if(attempt===1){
          if(mi < tryModels.length-1) break;
          throw e;
        }
        await sleep(900);
      }
    }
  }
  throw lastErr || new Error("API isteği başarısız");
}

function detectQualityIssues(src, out){
  const issues = [];
  if(!src || !out) return issues;
  const isCJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(src);
  const ratio = out.length / Math.max(1, src.length);
  const maxR = isCJK ? 4.8 : 2.5, minR = isCJK ? 0.6 : 0.42;
  if(ratio > maxR) issues.push("⚠️ Çeviri orijinalden beklenenden fazla uzun (ekleme/halüsilasyon olabilir).");
  if(ratio < minR && src.length > 60) issues.push("⚠️ Çeviri eksik veya kesilmiş olabilir.");
  if(/(.{25,})\1{2,}/.test(out)) issues.push("⚠️ Tekrarlayan döngü cümlesi tespit edildi.");
  if(/(as an ai|i cannot translate|yapay zeka olarak)/i.test(out)) issues.push("⚠️ Model reddetme/uyarı metni içeriyor.");
  return issues;
}

/* ===================== 1. METİN ÇEVİRİSİ ===================== */
function initLangSelects(){
  $("#srcLang").innerHTML = LANGS.map(([c,n])=>`<option value="${c}">${n}</option>`).join("");
  $("#tgtLang").innerHTML = LANGS.filter(l=>l[0]!=="auto").map(([c,n])=>`<option value="${c}">${n}</option>`).join("");
  $("#srcLang").value = S.srcLang; $("#tgtLang").value = S.tgtLang;
  $("#srcLang").onchange = e => { S.srcLang = e.target.value; saveState(); };
  $("#tgtLang").onchange = e => { S.tgtLang = e.target.value; saveState(true); };
  $("#swapLang").onclick = () => {
    if(S.srcLang==="auto") return toast("Otomatik dil yer değiştiremez");
    [S.srcLang, S.tgtLang] = [S.tgtLang, S.srcLang];
    $("#srcLang").value=S.srcLang; $("#tgtLang").value=S.tgtLang; saveState(true); haptic("light");
  };
}

function updateSrcCostHint(){
  const el = $("#srcCostHint"); if(!el) return;
  const txt = $("#srcText")?.value || "";
  const words = txt.trim() ? txt.trim().split(/\s+/).length : 0;
  const chars = txt.length;
  const estTok = Math.ceil(chars / 3.8);
  const active = (S.model || "").toLowerCase();
  const lr = (S.lrCosts || []).find(x => x.id.toLowerCase() === active || active.includes(x.id.toLowerCase()));
  const estUsd = ((estTok/1e6)*(S.priceIn||0.15) + (estTok*1.15/1e6)*(S.priceOut||0.60));
  const costStr = estTok ? (lr?.mult ? `~${estTok} tok • ${lr.mult}` : `~${estTok} tok • ~$${estUsd.toFixed(5)}`) : "~0 token";
  el.innerHTML = `<span>${words} kelime • ${chars} karakter</span><span>${esc(costStr)}</span>`;
}
$("#srcText")?.addEventListener("input", updateSrcCostHint);

let splitCompareOn = false;
function syncSplitCompare(){
  const box = $("#splitCompareBox"), out = $("#outText");
  if(!box || !out) return;
  if(splitCompareOn){
    out.style.display = "none"; box.style.display = "grid";
    $("#splitOrig").textContent = $("#srcText").value || "(Orijinal metin boş)";
    $("#splitTr").textContent = out.textContent || "(Çeviri bekleniyor)";
  } else {
    out.style.display = "block"; box.style.display = "none";
  }
}
$("#splitCompareBtn").onclick = () => {
  splitCompareOn = !splitCompareOn;
  $("#splitCompareBtn").classList.toggle("primary", splitCompareOn);
  syncSplitCompare();
};

let transAbort = null;
async function doTranslate(customSysExtra=null){
  const text = $("#srcText").value.trim();
  if(!text) return toast("Çevrilecek metin yaz");
  if(transAbort){ transAbort.abort(); transAbort=null; return; }

  const btn = $("#transBtn"), st = $("#transStatus"), prog = $("#transProg"), outEl = $("#outText");
  if(!customSysExtra){
    const cached = await tmLookup(text, S.tgtLang);
    if(cached){
      outEl.textContent = cached;
      if(splitCompareOn) syncSplitCompare();
      st.className = "status ok"; st.textContent = "⚡ TM Önbellekten anında yüklendi (0 token / 0ms)";
      haptic("light");
      return;
    }
  }

  transAbort = new AbortController();
  btn.classList.add("busy"); st.className="status"; st.textContent="Çevriliyor…"; prog.classList.add("on");
  if(!customSysExtra) outEl.textContent = "";
  $("#qualityBox").innerHTML = "";
  try{
    const chunks = splitChunks(text, S.chunkSize);
    let full = "", prevTail = "";
    for(let i=0;i<chunks.length;i++){
      prog.firstElementChild.style.width = Math.round(((i)/chunks.length)*100) + "%";
      const sys = buildSystemPrompt(null, prevTail) + (customSysExtra ? "\nEK TALİMAT: " + customSysExtra : "");
      let part = "";
      await callAI({
        task:"text", signal:transAbort.signal,
        messages:[{role:"system",content:sys},{role:"user",content:chunks[i]}],
        onDelta:(_, cur) => { part = cur; outEl.textContent = (full ? full + "\n\n" : "") + part; if(splitCompareOn) syncSplitCompare(); }
      });
      full = full ? full + "\n\n" + part : part;
      prevTail = getLastSentences(part, 3);
    }
    prog.firstElementChild.style.width = "100%";
    st.className="status ok"; st.textContent=`Tamamlandı (${full.length} karakter)`;
    haptic("success");
    if(splitCompareOn) syncSplitCompare();
    if(!customSysExtra) tmStore(text, full, S.tgtLang);
    const issues = detectQualityIssues(text, full);
    if(issues.length){
      $("#qualityBox").innerHTML = `<div class="pill-tag warn" style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 10px;border-radius:10px;flex-wrap:wrap"><span>${issues.join("<br>")}</span><button class="btn small ok" id="qAutoFixBtn">🪄 Editörle Düzelt</button></div>`;
      $("#qAutoFixBtn").onclick = () => $("#editFixBtn").click();
    }
    if(!customSysExtra){
      S.history.unshift({id:uid(), src:text.slice(0,8000), out:full.slice(0,8000), ts:Date.now(), pinned:false});
      if(S.history.length > 45) S.history = S.history.filter((x,i)=>x.pinned || i<35);
      saveState(); renderHistory();
    }
  }catch(e){
    if(e.name!=="AbortError"){ st.className="status error"; st.textContent=e.message; haptic("error"); }
  }finally{
    transAbort=null; btn.classList.remove("busy"); setTimeout(()=>prog.classList.remove("on"),600);
  }
}

$("#transBtn").onclick = () => doTranslate();
$("#pasteBtn").onclick = async () => {
  try{ const t = isNative() && window.AndroidBridge.getClipboardText ? window.AndroidBridge.getClipboardText() : await navigator.clipboard.readText(); if(t){ $("#srcText").value=t; updateSrcCostHint(); toast("Yapıştırıldı"); } }catch{ toast("Pano okunamadı"); }
};
$("#clearTextBtn").onclick = () => { $("#srcText").value=""; $("#outText").textContent=""; $("#qualityBox").innerHTML=""; updateSrcCostHint(); syncSplitCompare(); };
$("#copyOutBtn").onclick = () => copyText($("#outText").textContent);
$("#shareOutBtn").onclick = () => shareText("Çeviri", $("#outText").textContent);

$("#editFixBtn").onclick = async () => {
  const src = $("#srcText").value.trim(), out = $("#outText").textContent.trim();
  if(!out) return toast("Önce bir çeviri yap");
  const st = $("#transStatus"); st.className="status"; st.textContent = "🪄 AI Editör çeviriyi cilalıyor…";
  try{
    const sys = `Sen usta bir Türkçe editörsün. Verilen orijinal metin ile mevcut çeviriyi kıyasla: eksik/atlanan yerleri tamamla, halüsilasyon/tekrar varsa temizle, mekanik cümleleri akıcı ve doğal Türkçe'ye çevir. Sadece düzeltilmiş nihai çeviriyi yaz.` +
      (S.glossEnabled && S.glossary.length ? "\nSözlük:\n" + S.glossary.slice(0,80).map(g=>`- ${g.src} => ${g.tgt}`).join("\n") : "");
    await callAI({
      task:"text",
      messages:[{role:"system",content:sys},{role:"user",content:`[ORİJİNAL]\n${src.slice(0,5000)}\n\n[MEVCUT ÇEVİRİ]\n${out.slice(0,6000)}`}],
      onDelta:(_, full) => { $("#outText").textContent = full; if(splitCompareOn) syncSplitCompare(); }
    });
    $("#qualityBox").innerHTML = "";
    st.className="status ok"; st.textContent = "🪄 Editör düzeltmesi tamamlandı!";
    haptic("success");
  }catch(e){ st.className="status error"; st.textContent = e.message; }
};

$("#ocrImgBtn").onclick = () => $("#ocrImgInput").click();
$("#ocrImgInput").onchange = async e => {
  const f = e.target.files?.[0]; e.target.value=""; if(!f) return;
  const st = $("#transStatus"); st.className="status"; st.textContent = "📷 Görselden metin okunuyor ve çevriliyor…";
  try{
    const dataUrl = await new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsDataURL(f); });
    const raw = await callAI({
      task:"vision", stream:false,
      messages:[
        {role:"system", content:`Görseldeki metni eksiksiz çıkar ve ${langName(S.tgtLang)} diline çevir. Format:\n[ORİJİNAL]\n...\n[ÇEVİRİ]\n...`},
        {role:"user", content:[{type:"text",text:"Görseldeki metni oku ve çevir."},{type:"image_url",image_url:{url:dataUrl}}]}
      ]
    });
    const mO = raw.match(/\[ORİJİNAL\]([\s\S]*?)\[ÇEVİRİ\]/i);
    if(mO){ $("#srcText").value = mO[1].trim(); $("#outText").textContent = raw.split(/\[ÇEVİRİ\]/i)[1].trim(); }
    else $("#outText").textContent = raw.trim();
    updateSrcCostHint(); syncSplitCompare();
    st.className="status ok"; st.textContent="📷 Görsel OCR tamamlandı!"; haptic("success");
  }catch(err){ st.className="status error"; st.textContent=err.message; }
};

window.__onNativeImageOcr = async imgB64 => {
  try{
    const raw = await callAI({
      task:"vision", stream:false,
      messages:[
        {role:"system", content:`Görseldeki tüm metni çıkar ve ${langName(S.tgtLang)} diline çevir. Format:\n[ORİJİNAL]\n...\n[ÇEVİRİ]\n...`},
        {role:"user", content:[{type:"text",text:"Metni oku ve çevir."},{type:"image_url",image_url:{url:"data:image/jpeg;base64,"+imgB64}}]}
      ]
    });
    showInfoSheet("📷 Görsel OCR & Çeviri", raw.trim(), raw.trim());
  }catch(e){ toast("Görsel OCR hatası: " + e.message); }
};

window.__onVoiceResult = b64 => {
  const t = b64DecodeUtf8(b64).trim();
  if(t){ $("#srcText").value = ($("#srcText").value + " " + t).trim(); updateSrcCostHint(); haptic("light"); toast("🎤 Dikte eklendi"); }
};
$("#micBtn").onclick = () => {
  const lang = S.srcLang==="auto" ? "tr-TR" : S.srcLang;
  if(isNative() && window.AndroidBridge.startVoiceDictation){ window.AndroidBridge.startVoiceDictation(lang); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR) return toast("Bu cihazda tarayıcı ses diktesi desteklenmiyor");
  const rec = new SR(); rec.lang = lang; toast("🎤 Dinleniyor…");
  rec.onresult = ev => { const t = ev.results?.[0]?.[0]?.transcript || ""; if(t){ $("#srcText").value = ($("#srcText").value + " " + t).trim(); updateSrcCostHint(); toast("Dikte eklendi"); } };
  rec.onerror = () => toast("Ses algılanamadı");
  rec.start();
};

window.__onExternalShareText = b64 => {
  const txt = b64DecodeUtf8(b64).trim(); if(!txt) return;
  switchView("text"); $("#srcText").value = txt; updateSrcCostHint(); doTranslate();
};

const TONE_MAP = {
  resmi:"Aynı anlamı çok daha resmi, kurumsal ve kibar bir Türkçe ile yeniden yaz.",
  samimi:"Aynı anlamı daha sıcak, günlük ve samimi bir Türkçe ile yeniden yaz.",
  kisalt:"Anlamı kaybetmeden çok daha kısa ve öz şekilde yeniden yaz.",
  edebi:"Roman kalitesinde, edebi ve akıcı bir üslupla yeniden yaz.",
  sade:"Karmaşık ifadeleri sadeleştir, herkesin tek seferde anlayacağı akıcı dil kullan."
};
$$("#toneChips .chip").forEach(ch => ch.onclick = async () => {
  const cur = $("#outText").textContent.trim(); if(!cur) return toast("Önce bir çeviri yap");
  const st = $("#transStatus"); st.className="status"; st.textContent = "✨ Üslup uyarlanıyor…";
  try{
    await callAI({task:"text", messages:[{role:"system",content:TONE_MAP[ch.dataset.tone]+" Sadece sonucu yaz."},{role:"user",content:cur}], onDelta:(_,c)=>{ $("#outText").textContent=c; if(splitCompareOn) syncSplitCompare(); }});
    st.className="status ok"; st.textContent="Üslup güncellendi"; haptic("light");
  }catch(e){ st.className="status error"; st.textContent=e.message; }
});

$("#altTransBtn").onclick = async () => {
  const sel = (window.getSelection()+"").trim();
  const target = sel || $("#srcText").value.trim() || $("#outText").textContent.trim();
  if(!target) return toast("Önce metin gir veya cümle seç");
  openModal("altModal");
  $("#altResults").innerHTML = `<div class="meta">⏳ 3 farklı alternatif üretiliyor…</div>`;
  try{
    const raw = await callAI({task:"text", stream:false, messages:[
      {role:"system", content:`Verilen metin için ${langName(S.tgtLang)} dilinde 3 farklı doğal çeviri alternatifi üret (1: Doğal/Akıcı, 2: Edebi/Zengin, 3: Kısa/Net). Sadece numaralı liste yaz.`},
      {role:"user", content:target.slice(0,1200)}
    ]});
    const parts = raw.split(/\n(?=\d[\.\)])/).filter(Boolean);
    $("#altResults").innerHTML = parts.map(p=>`<div class="item"><div class="item-body"><div class="item-title">${esc(p.trim())}</div></div><button class="btn small primary">Seç</button></div>`).join("");
    $$("#altResults .btn").forEach((b,i)=>b.onclick=()=>{ $("#outText").textContent = parts[i].replace(/^\d[\.\)]\s*/,"").trim(); syncSplitCompare(); closeModal("altModal"); toast("Alternatif uygulandı"); });
  }catch(e){ $("#altResults").innerHTML = `<div class="status error">${esc(e.message)}</div>`; }
};

$("#pinTransBtn").onclick = () => {
  const out = $("#outText").textContent.trim(), src = $("#srcText").value.trim();
  if(!out) return toast("Sabitlenecek çeviri yok");
  S.history.unshift({id:uid(), src:src.slice(0,8000), out:out.slice(0,8000), ts:Date.now(), pinned:true});
  saveState(); renderHistory(); haptic("light"); toast("⭐ Çeviri sabitlendi!");
};

function renderHistory(){
  const el = $("#histList"); if(!el) return;
  const q = ($("#histSearch")?.value || "").toLowerCase().trim();
  const sorted = [...S.history]
    .filter(h => !q || (h.src+" "+h.out).toLowerCase().includes(q))
    .sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0) || (b.ts||0)-(a.ts||0));
  if(!sorted.length){ el.innerHTML=`<div class="meta">Eşleşen çeviri geçmişi yok.</div>`; return; }
  el.innerHTML = sorted.slice(0,30).map(h=>`
    <div class="item">
      <div class="item-body">
        <div class="item-title">${h.pinned?"⭐ ":""}${esc(h.out.slice(0,120))}${h.out.length>120?"…":""}</div>
        <div class="item-sub">${esc(h.src.slice(0,85))}${h.src.length>85?"…":""}</div>
      </div>
      <button class="btn small" data-pin="${h.id}">${h.pinned?"★":"☆"}</button>
      <button class="btn small" data-load="${h.id}">Aç</button>
    </div>`).join("");
  el.querySelectorAll("[data-pin]").forEach(b=>b.onclick=()=>{ const x=S.history.find(i=>i.id===b.dataset.pin); if(x){x.pinned=!x.pinned; saveState(); renderHistory();} });
  el.querySelectorAll("[data-load]").forEach(b=>b.onclick=()=>{ const x=S.history.find(i=>i.id===b.dataset.load); if(x){$("#srcText").value=x.src; $("#outText").textContent=x.out; updateSrcCostHint(); syncSplitCompare(); toast("Geçmişten yüklendi");} });
}
$("#histSearch")?.addEventListener("input", renderHistory);
$("#clearHistBtn").onclick = () => { S.history = S.history.filter(x=>x.pinned); saveState(); renderHistory(); toast("Sabitlenmeyen geçmiş temizlendi"); };

$("#raceBtn").onclick = async () => {
  const txt = $("#srcText").value.trim(); if(!txt) return toast("Yarış için metin yaz");
  const models = S.favModels.length>=2 ? S.favModels.slice(0,3) : (S.cachedModels.slice(0,3).map(m=>m.id||m));
  if(models.length < 2) return toast("Önce Ayarlar'dan modelleri çek veya en az 2 favori model seç");
  openModal("raceModal");
  $("#raceResults").innerHTML = models.map((m,i)=>`<div class="item"><div class="item-body"><div class="item-title">🤖 ${esc(m)}</div><div class="item-sub" id="race_${i}">⏳ Çevriliyor…</div></div></div>`).join("");
  models.forEach(async (m,i)=>{
    const t0 = performance.now();
    try{
      const out = await callAI({model:m, stream:false, messages:[{role:"system",content:buildSystemPrompt()},{role:"user",content:txt.slice(0,1500)}]});
      $(`#race_${i}`).innerHTML = `<div style="color:var(--text);white-space:pre-wrap;margin-top:4px">${esc(out)}</div><div class="meta" style="margin-top:4px">⏱ ${((performance.now()-t0)/1000).toFixed(1)} sn</div>`;
    }catch(e){ $(`#race_${i}`).textContent = "❌ " + e.message; }
  });
};

/* ===================== 2. TARAYICI, GEÇMİŞ, EPUB PAKET & MANGA KÖPRÜSÜ ===================== */
function openRealBrowser(url){
  const u = (url||"").trim() || "https://www.google.com";
  if(isNative() && window.AndroidBridge.openBrowser) window.AndroidBridge.openBrowser(u);
  else window.open(u, "_blank");
}

function addBrowserHistory(url, title=""){
  if(!url || !/^https?:\/\//i.test(url)) return;
  if(!Array.isArray(S.browserHistory)) S.browserHistory = [];
  const cleanTitle = (title || url.replace(/^https?:\/\//,"")).trim().slice(0, 110);
  S.browserHistory = S.browserHistory.filter(h => h.url !== url);
  S.browserHistory.unshift({id:uid(), url, title:cleanTitle, ts:Date.now()});
  if(S.browserHistory.length > 120) S.browserHistory.length = 120;
  saveState();
  renderBrowserHistory();
}
window.__onBrowserVisit = (u64, t64) => { try{ addBrowserHistory(b64DecodeUtf8(u64), b64DecodeUtf8(t64)); }catch{} };

function renderBrowserHistory(){
  const arr = S.browserHistory || [];
  const prev = $("#browserHistPreview");
  if(prev){
    prev.innerHTML = arr.length ? arr.slice(0, 5).map(h=>`
      <div class="item">
        <div class="item-body">
          <div class="item-title">${esc(h.title)}</div>
          <div class="item-sub">${esc(h.url.slice(0,60))} • ${new Date(h.ts).toLocaleTimeString("tr",{hour:"2-digit",minute:"2-digit"})}</div>
        </div>
        <button class="btn small primary" data-bhopen="${esc(h.url)}">Aç</button>
      </div>`).join("") : `<div class="meta">Henüz tarayıcı geçmişi yok.</div>`;
    prev.querySelectorAll("[data-bhopen]").forEach(b=>b.onclick=()=>openRealBrowser(b.dataset.bhopen));
  }
  const full = $("#browserHistList");
  if(full){
    const q = ($("#browserHistSearch")?.value || "").toLowerCase().trim();
    const flt = arr.filter(h => !q || (h.title+" "+h.url).toLowerCase().includes(q));
    full.innerHTML = flt.length ? flt.map(h=>`
      <div class="item">
        <div class="item-body">
          <div class="item-title">${esc(h.title)}</div>
          <div class="item-sub">${esc(h.url.slice(0,72))} • ${new Date(h.ts).toLocaleString("tr")}</div>
        </div>
        <button class="btn small primary" data-bhopen2="${esc(h.url)}">Aç</button>
        <button class="btn small danger" data-bhdel="${h.id}">✕</button>
      </div>`).join("") : `<div class="meta">Kayıt bulunamadı.</div>`;
    full.querySelectorAll("[data-bhopen2]").forEach(b=>b.onclick=()=>{ closeModal("browserHistModal"); openRealBrowser(b.dataset.bhopen2); });
    full.querySelectorAll("[data-bhdel]").forEach(b=>b.onclick=()=>{ S.browserHistory = S.browserHistory.filter(x=>x.id!==b.dataset.bhdel); saveState(); renderBrowserHistory(); });
  }
}
$("#openBrowserHistBtn")?.addEventListener("click", () => { renderBrowserHistory(); openModal("browserHistModal"); });
$("#openBrowserHistBtn2")?.addEventListener("click", () => { renderBrowserHistory(); openModal("browserHistModal"); });
$("#browserHistSearch")?.addEventListener("input", renderBrowserHistory);
const clearBHist = () => { S.browserHistory = []; saveState(); renderBrowserHistory(); toast("Tarayıcı geçmişi temizlendi"); };
$("#clearBrowserHistBtn")?.addEventListener("click", clearBHist);
$("#clearBrowserHistQuickBtn")?.addEventListener("click", clearBHist);

function renderBrowserUI(){
  const tb = $("#tabBar"); if(tb){
    tb.innerHTML = S.tabs.map(t=>`<span class="chip ${t.id===S.activeTabId?"active":""}" data-tid="${t.id}">${esc(t.title.slice(0,18))} ${S.tabs.length>1?`<b data-tdel="${t.id}">×</b>`:""}</span>`).join("");
    tb.querySelectorAll("[data-tid]").forEach(c=>c.onclick=e=>{
      if(e.target.dataset.tdel){ S.tabs=S.tabs.filter(x=>x.id!==e.target.dataset.tdel); S.activeTabId=S.tabs[0].id; saveState(); renderBrowserUI(); return; }
      S.activeTabId=c.dataset.tid; const t=S.tabs.find(x=>x.id===S.activeTabId); if(t){$("#bUrlInput").value=t.url; openRealBrowser(t.url);} saveState(); renderBrowserUI();
    });
  }
  const bm = $("#bmBar"); if(bm){
    bm.innerHTML = S.bookmarks.map(b=>`<span class="chip" data-burl="${esc(b.url)}">⭐ ${esc(b.name)}</span>`).join("");
    bm.querySelectorAll("[data-burl]").forEach(c=>c.onclick=()=>openRealBrowser(c.dataset.burl));
  }
  $("#bAutoSave").checked = !!S.bAutoSave;
  $("#twInfinite").checked = !!S.browserTweaks.infiniteScroll;
  $("#twUnlockCopy").checked = !!S.browserTweaks.unlockCopy;
  $("#twAntiPopup").checked = !!S.browserTweaks.antiPopup;
  renderBrowserHistory();
}
$("#bGoBtn").onclick = () => { const u=$("#bUrlInput").value.trim()||"https://www.google.com"; const t=S.tabs.find(x=>x.id===S.activeTabId); if(t){t.url=u;t.title=u.replace(/^https?:\/\//,"").slice(0,20);} saveState(); renderBrowserUI(); openRealBrowser(u); };
$("#addTabBtn").onclick = () => { const id=uid(); S.tabs.push({id,title:"Yeni Sekme",url:"https://www.google.com"}); S.activeTabId=id; saveState(); renderBrowserUI(); openRealBrowser("https://www.google.com"); };
$("#addBmBtn").onclick = async () => {
  const u=$("#bUrlInput").value.trim(); if(!u) return toast("URL yaz");
  const n = await showPromptSheet("⭐ Yer İmi Ekle", "Yer imi adı:", u.replace(/^https?:\/\//,"").split("/")[0]);
  if(n && n.trim()){ S.bookmarks.push({id:uid(),name:n.trim(),url:u}); saveState(); renderBrowserUI(); toast("Yer imi eklendi"); }
};
$("#bAutoSave").onchange = e => { S.bAutoSave = e.target.checked; saveState(); };
$("#twInfinite").onchange = e => { S.browserTweaks.infiniteScroll = e.target.checked; saveState(true); };
$("#twUnlockCopy").onchange = e => { S.browserTweaks.unlockCopy = e.target.checked; saveState(true); };
$("#twAntiPopup").onchange = e => { S.browserTweaks.antiPopup = e.target.checked; saveState(true); };

function deriveSeriesKeyAndTitle(url, rawTitle, rawSeriesTitle=""){
  let host = "", slugSeries = "";
  try{
    const u = new URL(url);
    host = u.hostname.replace(/^www\./,"").toLowerCase();
    const segs = u.pathname.split("/").filter(Boolean);
    const cand = segs.find(s => !/^(novel|novels|book|books|series|manga|read|tr|en|chapter|bolum|ch)$/i.test(s) && !/^(chapter|ch|bolum)[-_]?\d+/i.test(s));
    if(cand){
      slugSeries = decodeURIComponent(cand)
        .replace(/[-_]+(chapter|ch|bolum|ep|episode)[-_]?\d+.*$/i, "")
        .replace(/[-_]+/g, " ").trim();
    }
  }catch{}

  let bookTitle = (rawSeriesTitle || "").trim();
  if(!bookTitle){
    let t = (rawTitle || "").trim();
    t = t.replace(/\s*[\|\-–—•]\s*(novelphoenix|novelbin|webnovel|royalroad|wuxiaworld|lightnovel|readnovelfull|freewebnovel).*$/i, "").trim();
    t = t.replace(/[\s:\-–—]*(chapter|ch\.?|bölüm|bolum|episode|ep\.?)\s*\d+.*$/i, "").trim();
    bookTitle = t.length >= 3 ? t : (slugSeries ? slugSeries.replace(/\b\w/g, c=>c.toUpperCase()) : host);
  }
  const seriesKey = (host + "::" + (slugSeries || bookTitle).toLowerCase().replace(/[^a-z0-9çğıöşü]+/g,"")).slice(0, 120);
  return { host, bookTitle: bookTitle.slice(0, 80), seriesKey };
}

function deriveChapterTitle(url, rawTitle){
  const t = (rawTitle || "").trim();
  if(t && t.length > 2) return t.slice(0, 120);
  try{
    const m = url.match(/(chapter|ch|bolum|bölüm)[-_ ]?(\d+(?:[._-]\d+)?)/i);
    if(m) return `Bölüm ${m[2].replace(/[_-]/g,".")}`;
  }catch{}
  return "Bölüm";
}

let lastExtractedChapter = null;
window.__onNativePageExtract = async (t64, u64, c64, b64, st64="") => {
  try{
    const rawTitle = b64DecodeUtf8(t64), url = b64DecodeUtf8(u64), cover = b64DecodeUtf8(c64);
    const rawSeriesTitle = st64 ? b64DecodeUtf8(st64) : "";
    const blocks = JSON.parse(b64DecodeUtf8(b64));
    if(!blocks.length) return window.AndroidBridge.setBrowserStatus("Sayfada çevrilecek metin bulunamadı.");
    window.AndroidBridge.setBrowserStatus(`🌐 ${blocks.length} paragraf çevriliyor…`);
    const map = {}, uncached = [];
    for(const b of blocks){
      const hit = await tmLookup(b.t, S.tgtLang);
      if(hit) map[b.i] = hit;
      else uncached.push(b);
    }
    if(Object.keys(map).length) window.AndroidBridge.applyPageTranslations(JSON.stringify(map));

    const batchSize = 18;
    let prevTail = "";
    for(let i=0;i<uncached.length;i+=batchSize){
      const sl = uncached.slice(i, i+batchSize);
      const payload = sl.map(b=>`[${b.i}] ${b.t}`).join("\n");
      const out = await callAI({task:"text", stream:false, messages:[
        {role:"system", content:buildSystemPrompt(null, prevTail)+"\nHer satırın başındaki [sayı] etiketini AYNEN koru ve satırları hedef dile çevir."},
        {role:"user", content:payload}
      ]});
      out.split("\n").forEach(ln=>{
        const m=ln.match(/^\[(\d+)\]\s*(.+)$/);
        if(m){
          map[m[1]] = m[2].trim();
          const origObj = sl.find(x => String(x.i) === m[1]);
          if(origObj) tmStore(origObj.t, m[2].trim(), S.tgtLang);
        }
      });
      prevTail = getLastSentences(out, 2);
      window.AndroidBridge.applyPageTranslations(JSON.stringify(map));
      window.AndroidBridge.setBrowserStatus(`🌐 Çevriliyor: ${Math.min(blocks.length, Object.keys(map).length)}/${blocks.length}`);
    }
    window.AndroidBridge.setBrowserStatus("✅ Sayfa çevirisi tamamlandı!");
    const origText = blocks.map(b=>b.t).join("\n\n");
    const trText = blocks.map(b=>map[b.i]||b.t).join("\n\n");
    const { host, bookTitle, seriesKey } = deriveSeriesKeyAndTitle(url, rawTitle, rawSeriesTitle);
    const chapTitle = deriveChapterTitle(url, rawTitle);
    lastExtractedChapter = {title:chapTitle, bookTitle, seriesKey, host, url, cover, origText, trText};
    if(S.bAutoSave) await saveWebChapterToLibrary(lastExtractedChapter);
  }catch(e){ window.AndroidBridge?.setBrowserStatus("❌ " + e.message); }
};

window.__onNativeExportPageEpub = (t64, u64, body64) => {
  try{
    const title = b64DecodeUtf8(t64) || "Web Makalesi";
    const url = b64DecodeUtf8(u64) || "";
    const text = b64DecodeUtf8(body64) || "";
    if(text.length < 30) return toast("Sayfada EPUB yapılacak yeterli metin yok");
    exportBookAsEpub({id:uid(), title, author:url.replace(/^https?:\/\//,"").split("/")[0]||"Web", chapters:[{title, text}]});
  }catch(e){ toast("EPUB hatası: "+e.message); }
};

async function saveWebChapterToLibrary(ch){
  const { host, bookTitle, seriesKey } = ch.seriesKey ? ch : deriveSeriesKeyAndTitle(ch.url, ch.title, ch.bookTitle);
  const all = await dbAll();
  const cleanUrl = (ch.url || "").split("#")[0];
  let book = all.find(b => !b.deletedAt && (
    (b.seriesKey && b.seriesKey === seriesKey) ||
    (b.sourceHost === host && b.title.toLowerCase() === bookTitle.toLowerCase()) ||
    b.chapters.some(c => c.url && c.url.split("#")[0] === cleanUrl)
  ));
  if(!book){
    book = {id:uid(), title:bookTitle, author:host, format:"WEB", status:"reading", sourceHost:host, seriesKey, sourceUrl:cleanUrl, cover:ch.cover||"", tags:["Web Novel"], curChap:0, lastRead:Date.now(), scrollMap:{},
      chapters:[{title:ch.title, text:ch.origText, trText:ch.trText, url:cleanUrl}]};
  } else {
    if(!book.seriesKey) book.seriesKey = seriesKey;
    if(!book.cover && ch.cover) book.cover = ch.cover;
    const ex = book.chapters.findIndex(c => c.url && c.url.split("#")[0] === cleanUrl);
    if(ex>=0){
      book.chapters[ex].title = ch.title; book.chapters[ex].text = ch.origText; book.chapters[ex].trText = ch.trText; book.curChap = ex;
    } else {
      book.chapters.push({title:ch.title, text:ch.origText, trText:ch.trText, url:cleanUrl});
      book.curChap = book.chapters.length - 1;
    }
    book.lastRead = Date.now();
  }
  await dbPut(book);
  return book.id;
}

window.__onNativeOpenInLibrary = async () => {
  if(lastExtractedChapter){
    const id = await saveWebChapterToLibrary(lastExtractedChapter);
    switchView("library"); openBookReader(id);
  } else { switchView("library"); toast("Önce tarayıcıda bir bölüm çevir veya kütüphaneden aç"); }
};

window.__onNativeQuickSelect = async b64 => {
  try{
    const txt = b64DecodeUtf8(b64);
    const out = await callAI({task:"text", stream:false, messages:[{role:"system",content:`Metni ${langName(S.tgtLang)} diline doğal çevir. Sadece çeviriyi yaz.`},{role:"user",content:txt}]});
    window.AndroidBridge?.showQuickSelectResult(out.trim());
  }catch(e){ window.AndroidBridge?.showQuickSelectResult("Hata: "+e.message); }
};

function normalizeBubbles(arr){
  if(!Array.isArray(arr)) return [];
  const needDiv10 = arr.some(b => Number(b.x)>100 || Number(b.y)>100 || Number(b.w)>100 || Number(b.h)>100);
  const k = needDiv10 ? 0.1 : 1;
  return arr.filter(b => b && (b.tr || b.orig)).map(b => {
    const orig = String(b.orig || "").trim();
    const tr = String(b.tr || orig || "").trim();
    const translated = !!(tr && (!orig || tr.toLowerCase() !== orig.toLowerCase()));
    return {
      x: Math.max(0, Math.min(94, Number(b.x||0)*k)),
      y: Math.max(0, Math.min(94, Number(b.y||0)*k)),
      w: Math.max(12, Math.min(96, Number(b.w||24)*k)),
      h: Math.max(5, Math.min(86, Number(b.h||11)*k)),
      type: b.type || "speech",
      orig, tr, translated
    };
  });
}

const mangaBubbleCache = new Map();
window.__onNativeMangaCapture = async (imgB64, cacheKeyB64) => {
  try{
    const cKey = cacheKeyB64 ? b64DecodeUtf8(cacheKeyB64) : "";
    if(cKey && mangaBubbleCache.has(cKey)){
      window.AndroidBridge.applyMangaBubbles(JSON.stringify(mangaBubbleCache.get(cKey)));
      window.AndroidBridge.setBrowserStatus("⚡ Önbellekten yüklendi (0 API)");
      return;
    }
    const bubbles = await analyzeMangaImageB64(imgB64);
    if(!bubbles.length){ window.AndroidBridge.setBrowserStatus("💬 Bu ekranda baloncuk bulunamadı."); return; }
    if(cKey){ mangaBubbleCache.set(cKey, bubbles); if(mangaBubbleCache.size>40) mangaBubbleCache.delete(mangaBubbleCache.keys().next().value); }
    window.AndroidBridge.applyMangaBubbles(JSON.stringify(bubbles));
    window.AndroidBridge.setBrowserStatus(`✅ ${bubbles.length} baloncuk çevrildi (TR rozetli = Çevrildi • Basılı tut: Orijinal • Çift tık: Düzenle)`);
  }catch(e){ window.AndroidBridge?.setBrowserStatus("❌ Manga hatası: " + e.message); }
};

async function analyzeMangaImageB64(imgB64){
  const raw = await callAI({
    task:"vision", stream:false, temperature:0.2,
    messages:[
      {role:"system", content:`Sen profesyonel bir manga/manhwa çevirmenisin. Görseldeki TÜM konuşma balonlarını, anlatıcı kutularını ve ses efektlerini bul, ${langName(S.tgtLang)} diline doğal, akıcı ve balona sığacak uzunlukta çevir. SADECE geçerli JSON dizisi dön: [{"x":10,"y":15,"w":28,"h":12,"type":"speech","orig":"orijinal metin","tr":"çeviri metni"}]. Koordinatlar 0-100 yüzdelik olsun ve orijinal metnin tamamını kapsasın. type: speech | thought | narration | sfx.`},
      {role:"user", content:[{type:"text",text:"Baloncukları tam kapsayacak şekilde tespit et ve çevir."},{type:"image_url",image_url:{url:"data:image/jpeg;base64,"+imgB64}}]}
    ]
  });
  const clean = raw.replace(/```json|```/g,"").trim();
  const s = clean.indexOf("["), e = clean.lastIndexOf("]");
  if(s>=0 && e>s) return normalizeBubbles(JSON.parse(clean.slice(s,e+1)));
  return [];
}

window.__onNativeRetranslateBubble = async (id, orig64, prev64) => {
  try{
    const orig = b64DecodeUtf8(orig64), prev = b64DecodeUtf8(prev64);
    const out = await callAI({task:"text", stream:false, messages:[{role:"system",content:`Bu manga baloncuğunu ${langName(S.tgtLang)} diline daha doğal ve akıcı yeniden çevir. Sadece yeni çeviriyi yaz.`},{role:"user",content:`Orijinal: ${orig}\nÖnceki: ${prev}`}]});
    window.AndroidBridge?.updateSingleMangaBubble(id, out.trim());
  }catch{}
};

/* ===================== 3. AKILLI KÜTÜPHANE, FORMATLAR & CBZ YAPICI ===================== */
async function ensurePdfJs(){
  if(window.pdfjsLib) return window.pdfjsLib;
  const loadScript = src => new Promise((res,rej)=>{ const s=document.createElement("script"); s.src=src; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
  try{
    await loadScript("pdf.min.js");
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "pdf.worker.min.js";
  }catch{
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }
  return window.pdfjsLib;
}

async function unzipEntries(buf){
  const u8 = new Uint8Array(buf), dv = new DataView(buf), entries = [];
  let eocd = -1;
  for(let i=u8.length-22;i>=Math.max(0,u8.length-65558);i--){ if(dv.getUint32(i,true)===0x06054b50){ eocd=i; break; } }
  if(eocd<0) return entries;
  const cdSize=dv.getUint32(eocd+12,true), cdOff=dv.getUint32(eocd+16,true);
  let p = cdOff;
  while(p < cdOff + cdSize){
    if(dv.getUint32(p,true)!==0x02014b50) break;
    const comp=dv.getUint16(p+10,true), cSize=dv.getUint32(p+20,true), fnLen=dv.getUint16(p+28,true), exLen=dv.getUint16(p+30,true), cmLen=dv.getUint16(p+32,true), lhOff=dv.getUint32(p+42,true);
    const name = new TextDecoder().decode(u8.slice(p+46, p+46+fnLen));
    p += 46 + fnLen + exLen + cmLen;
    if(name.endsWith("/")) continue;
    const lFn=dv.getUint16(lhOff+26,true), lEx=dv.getUint16(lhOff+28,true), dStart=lhOff+30+lFn+lEx;
    const raw = u8.slice(dStart, dStart+cSize);
    entries.push({name, comp, raw});
  }
  return entries;
}
async function readZipEntry(ent){
  if(ent.comp===0) return ent.raw;
  const ds = new DecompressionStream("deflate-raw");
  const w = ds.writable.getWriter(); w.write(ent.raw); w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

async function extractPdfText(buf, maxChars=18000){
  const pdfjs = await ensurePdfJs();
  const pdf = await pdfjs.getDocument({data:buf}).promise;
  let acc = "";
  for(let p=1; p<=pdf.numPages && acc.length < maxChars; p++){
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    acc += tc.items.map(x=>x.str).join(" ").trim() + "\n\n";
  }
  return acc.trim().slice(0, maxChars);
}
async function extractEpubText(buf, maxChars=18000){
  const ents = await unzipEntries(buf);
  const htmls = ents.filter(e=>/\.(x?html?|htm)$/i.test(e.name) && !/toc|nav/i.test(e.name)).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
  let acc = "";
  for(const h of htmls){
    if(acc.length >= maxChars) break;
    const raw = new TextDecoder().decode(await readZipEntry(h));
    const doc = new DOMParser().parseFromString(raw,"text/html");
    acc += (doc.body?.innerText || doc.body?.textContent || "").trim() + "\n\n";
  }
  return acc.trim().slice(0, maxChars);
}

function parseMobiBuffer(buf){
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  if(buf.byteLength < 96) return new TextDecoder("utf-8",{fatal:false}).decode(u8);
  const numRecords = dv.getUint16(76, false);
  const recOffsets = [];
  for(let i=0;i<numRecords;i++) recOffsets.push(dv.getUint32(78 + i*8, false));
  recOffsets.push(buf.byteLength);
  const h0 = recOffsets[0];
  const comp = dv.getUint16(h0, false);
  const textRecCount = dv.getUint16(h0 + 8, false);
  const encCode = (recOffsets[1] - h0 > 32) ? dv.getUint32(h0 + 28, false) : 65001;
  const decName = encCode === 1252 ? "windows-1252" : "utf-8";

  function lz77Decompress(bytes){
    const out = []; let i = 0;
    while(i < bytes.length){
      const b = bytes[i++];
      if(b === 0 || (b >= 9 && b <= 0x7f)) out.push(b);
      else if(b >= 1 && b <= 8){ for(let j=0;j<b && i<bytes.length;j++) out.push(bytes[i++]); }
      else if(b >= 0x80 && b <= 0xbf){
        if(i >= bytes.length) break;
        const b2 = bytes[i++];
        const pair = ((b << 8) | b2) & 0x3fff;
        const dist = pair >> 3, len = (pair & 7) + 3;
        const start = out.length - dist;
        for(let j=0;j<len;j++) out.push(out[start + j] || 32);
      } else { out.push(32); out.push(b ^ 0x80); }
    }
    return new Uint8Array(out);
  }
  const chunks = [];
  const limit = Math.min(textRecCount, numRecords - 1);
  for(let r=1; r<=limit; r++){
    const slice = u8.subarray(recOffsets[r], recOffsets[r+1]);
    chunks.push(comp === 2 ? lz77Decompress(slice) : slice);
  }
  const totalLen = chunks.reduce((a,c)=>a+c.length, 0);
  const merged = new Uint8Array(totalLen);
  let off = 0; chunks.forEach(c => { merged.set(c, off); off += c.length; });
  const html = new TextDecoder(decName, {fatal:false}).decode(merged);
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body?.innerText || doc.body?.textContent || html.replace(/<[^>]+>/g," ")).replace(/\n{3,}/g,"\n\n").trim();
}

function buildZipBlob(files, mime="application/epub+zip"){
  const crcTable = new Uint32Array(256);
  for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1); crcTable[n]=c>>>0; }
  const crc32 = u8 => { let c=0xffffffff; for(let i=0;i<u8.length;i++) c=crcTable[(c^u8[i])&0xff]^(c>>>8); return (c^0xffffffff)>>>0; };
  const enc = new TextEncoder();
  const localParts = [], centralParts = [];
  let offset = 0;
  for(const f of files){
    const nameB = enc.encode(f.name);
    const dataB = typeof f.data === "string" ? enc.encode(f.data) : f.data;
    const crc = crc32(dataB);
    const lh = new ArrayBuffer(30 + nameB.length), lv = new DataView(lh);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(8, 0, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, dataB.length, true); lv.setUint32(22, dataB.length, true);
    lv.setUint16(26, nameB.length, true);
    new Uint8Array(lh, 30).set(nameB);
    localParts.push(new Uint8Array(lh), dataB);

    const ch = new ArrayBuffer(46 + nameB.length), cv = new DataView(ch);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, dataB.length, true); cv.setUint32(24, dataB.length, true);
    cv.setUint16(28, nameB.length, true); cv.setUint32(42, offset, true);
    new Uint8Array(ch, 46).set(nameB);
    centralParts.push(new Uint8Array(ch));
    offset += lh.byteLength + dataB.length;
  }
  const cdSize = centralParts.reduce((a,b)=>a+b.length, 0);
  const eocd = new ArrayBuffer(22), ev = new DataView(eocd);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  return new Blob([...localParts, ...centralParts, new Uint8Array(eocd)], {type:mime});
}

function exportBookAsEpub(book){
  const files = [];
  files.push({name:"mimetype", data:"application/epub+zip"});
  files.push({name:"META-INF/container.xml", data:`<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`});
  const manifest = [], spine = [], navPoints = [];
  book.chapters.forEach((c, idx) => {
    const fn = `chap_${idx+1}.xhtml`;
    const bodyText = (c.trText || c.text || "").split(/\n+/).map(p=>`<p>${esc(p.trim())}</p>`).join("");
    files.push({name:`OEBPS/${fn}`, data:`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" lang="tr"><head><title>${esc(c.title||"Bölüm "+(idx+1))}</title><style>body{font-family:Georgia,serif;line-height:1.7;padding:1em}p{margin:0 0 1em}</style></head><body><h2>${esc(c.title||"Bölüm "+(idx+1))}</h2>${bodyText}</body></html>`});
    manifest.push(`<item id="c${idx+1}" href="${fn}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="c${idx+1}"/>`);
    navPoints.push(`<navPoint id="n${idx+1}" playOrder="${idx+1}"><navLabel><text>${esc(c.title||"Bölüm "+(idx+1))}</text></navLabel><content src="${fn}"/></navPoint>`);
  });
  files.push({name:"OEBPS/toc.ncx", data:`<?xml version="1.0" encoding="UTF-8"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${esc(book.id)}"/></head><docTitle><text>${esc(book.title)}</text></docTitle><navMap>${navPoints.join("")}</navMap></ncx>`});
  files.push({name:"OEBPS/content.opf", data:`<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(book.title)}</dc:title><dc:creator>${esc(book.author||"Çevirmen AI")}</dc:creator><dc:language>tr</dc:language><dc:identifier id="uid">${esc(book.id)}</dc:identifier></metadata><manifest><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>${manifest.join("")}</manifest><spine toc="ncx">${spine.join("")}</spine></package>`});
  const blob = buildZipBlob(files, "application/epub+zip");
  downloadBlob(blob, `${book.title.replace(/[^\wÇĞİÖŞÜçğıöşü]+/g,"_").slice(0,48)}.epub`);
  toast("📦 Gerçek EPUB dosyası indirildi!");
}

async function importBookFile(file, autoOpen=false){
  const name = file.name || "Kitap", ext = name.split(".").pop().toLowerCase(), title = name.replace(/\.[^.]+$/,"");
  const buf = await file.arrayBuffer();
  let chapters = [], cover = "", isManga = false;
  if(ext==="txt"){
    const txt = new TextDecoder().decode(buf);
    chapters = splitChunks(txt, 14000).map((t,i)=>({title:`Bölüm ${i+1}`, text:t}));
  } else if(ext==="html"||ext==="htm"){
    const doc = new DOMParser().parseFromString(new TextDecoder().decode(buf),"text/html");
    chapters = [{title:doc.title||title, text:(doc.body?.innerText||"").trim()}];
  } else if(ext==="fb2"){
    const doc = new DOMParser().parseFromString(new TextDecoder().decode(buf),"text/xml");
    const secs = [...doc.querySelectorAll("body section")];
    chapters = (secs.length?secs:[doc.body||doc.documentElement]).map((s,i)=>({title:s.querySelector("title")?.textContent?.trim()||`Bölüm ${i+1}`, text:s.textContent.trim()}));
  } else if(ext==="mobi"){
    toast("MOBI çözülüyor…");
    const txt = parseMobiBuffer(buf);
    chapters = splitChunks(txt, 14000).map((t,i)=>({title:`Bölüm ${i+1}`, text:t}));
  } else if(ext==="docx"){
    const ents = await unzipEntries(buf), docE = ents.find(e=>e.name==="word/document.xml");
    if(docE){ const xml=new TextDecoder().decode(await readZipEntry(docE)); const txt=xml.replace(/<\/w:p>/g,"\n\n").replace(/<[^>]+>/g,"").trim(); chapters=splitChunks(txt,14000).map((t,i)=>({title:`Bölüm ${i+1}`,text:t})); }
  } else if(ext==="epub"){
    const ents = await unzipEntries(buf);
    const htmls = ents.filter(e=>/\.(x?html?|htm)$/i.test(e.name) && !/toc|nav/i.test(e.name)).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
    for(let i=0;i<htmls.length;i++){
      const raw = new TextDecoder().decode(await readZipEntry(htmls[i]));
      const doc = new DOMParser().parseFromString(raw,"text/html");
      const txt = (doc.body?.innerText||doc.body?.textContent||"").replace(/\n{3,}/g,"\n\n").trim();
      if(txt.length>30) chapters.push({title:doc.querySelector("h1,h2,title")?.textContent?.trim()||`Bölüm ${chapters.length+1}`, text:txt});
    }
    const covE = ents.find(e=>/cover.*\.(jpe?g|png|webp)$/i.test(e.name)) || ents.find(e=>/\.(jpe?g|png|webp)$/i.test(e.name));
    if(covE){
      const u8 = await readZipEntry(covE);
      const mime = covE.name.endsWith(".png")?"image/png":covE.name.endsWith(".webp")?"image/webp":"image/jpeg";
      cover = `data:${mime};base64,${u8ToBase64(u8)}`;
    }
  } else if(ext==="cbz"){
    isManga = true;
    const ents = (await unzipEntries(buf)).filter(e=>/\.(jpe?g|png|webp)$/i.test(e.name)).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
    const pages = [];
    for(const e of ents){
      const u8 = await readZipEntry(e);
      const mime = e.name.endsWith(".png")?"image/png":e.name.endsWith(".webp")?"image/webp":"image/jpeg";
      pages.push(`data:${mime};base64,${u8ToBase64(u8)}`);
    }
    if(pages.length) cover = pages[0];
    for(let i=0;i<pages.length;i+=20) chapters.push({title:`Sayfa ${i+1}-${Math.min(pages.length,i+20)}`, images:pages.slice(i,i+20), mangaBubbles:{}, text:""});
  } else if(ext==="pdf"){
    toast("PDF işleniyor (çevrimdışı motor)…");
    const pdfjs = await ensurePdfJs();
    const pdf = await pdfjs.getDocument({data:buf}).promise;
    let accText = "", curImgs = [];
    for(let p=1;p<=pdf.numPages;p++){
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const t = tc.items.map(x=>x.str).join(" ").trim();
      if(t.length > 25){ accText += t + "\n\n"; }
      else {
        isManga = true;
        const vp = page.getViewport({scale:1.5}), cv = document.createElement("canvas");
        cv.width=vp.width; cv.height=vp.height;
        await page.render({canvasContext:cv.getContext("2d"), viewport:vp}).promise;
        const url = cv.toDataURL("image/jpeg",0.84);
        if(!cover) cover = url;
        curImgs.push(url);
      }
    }
    if(curImgs.length) for(let i=0;i<curImgs.length;i+=15) chapters.push({title:`Sayfa ${i+1}-${Math.min(curImgs.length,i+15)}`, images:curImgs.slice(i,i+15), mangaBubbles:{}, text:""});
    else if(accText.trim()) chapters = splitChunks(accText, 12000).map((t,i)=>({title:`Bölüm ${i+1}`, text:t}));
  } else {
    chapters = [{title:"Bölüm 1", text:new TextDecoder().decode(buf)}];
  }
  if(!chapters.length) return toast("Dosyada okunabilir içerik bulunamadı");
  const book = {id:uid(), title, author:"", format:ext.toUpperCase(), status:"reading", isManga, cover, tags:[isManga?"Manga":ext.toUpperCase()], curChap:0, lastRead:Date.now(), scrollMap:{}, chapters};
  await dbPut(book);
  renderLibrary(); haptic("success"); toast(`📚 "${title}" kütüphaneye eklendi!`);
  if(autoOpen){ switchView("library"); openBookReader(book.id); }
}

window.__onNativeFileImport = async (fn64, b64, autoOpen=false) => {
  const fname = b64DecodeUtf8(fn64), bin = atob(b64), u8 = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i);
  await importBookFile(new File([u8], fname), !!autoOpen);
};

$("#importBookBtn").onclick = () => $("#bookFileInput").click();
$("#bookFileInput").onchange = async e => { for(const f of [...(e.target.files||[])]) await importBookFile(f); e.target.value=""; };

$("#createCbzBtn")?.addEventListener("click", () => $("#cbzImgsInput").click());
$("#cbzImgsInput")?.addEventListener("change", async e => {
  const files = [...(e.target.files||[])].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
  e.target.value = "";
  if(!files.length) return;
  const title = await showPromptSheet("📦 CBZ Manga Oluştur", `${files.length} görsel seçildi. Manga adı:`, "Yeni Manga");
  if(!title || !title.trim()) return;
  toast("📦 CBZ paketleniyor ve Kütüphane'ye ekleniyor…");
  const zipFiles = [], pages = [];
  for(let i=0;i<files.length;i++){
    const f = files[i], buf = await f.arrayBuffer(), u8 = new Uint8Array(buf);
    const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
    zipFiles.push({name: `${String(i+1).padStart(3,"0")}.${ext}`, data: u8});
    const mime = ext==="png"?"image/png":ext==="webp"?"image/webp":"image/jpeg";
    pages.push(`data:${mime};base64,${u8ToBase64(u8)}`);
  }
  const chapters = [];
  for(let i=0;i<pages.length;i+=20) chapters.push({title:`Sayfa ${i+1}-${Math.min(pages.length,i+20)}`, images:pages.slice(i,i+20), mangaBubbles:{}, text:""});
  const book = {id:uid(), title:title.trim(), author:"Özel CBZ", format:"CBZ", status:"reading", isManga:true, cover:pages[0]||"", tags:["Manga","CBZ"], curChap:0, lastRead:Date.now(), scrollMap:{}, chapters};
  await dbPut(book);
  downloadBlob(buildZipBlob(zipFiles, "application/vnd.comicbook+zip"), `${title.trim().replace(/[^\wÇĞİÖŞÜçğıöşü]+/g,"_")}.cbz`);
  renderLibrary(); haptic("success"); toast(`✅ "${title.trim()}" CBZ olarak indirildi ve eklendi!`);
});

let activeLibTag = "Tümü", activeLibStatus = "all";
const STATUS_ICONS = { reading:"📖", plan:"⏳", done:"✅", hold:"⏸️" };
$$("#libStatusBar [data-st]").forEach(c => c.onclick = () => {
  activeLibStatus = c.dataset.st;
  $$("#libStatusBar .chip").forEach(x => x.classList.toggle("active", x===c));
  renderLibrary();
});

async function renderLibrary(){
  updateDailyGoalUI();
  const grid = $("#bookGrid"), tagBar = $("#libTagBar"); if(!grid) return;
  const all = (await dbAll()).filter(b=>!b.deletedAt);
  const sortMode = $("#libSort")?.value || "recent";
  if(sortMode==="title") all.sort((a,b)=>a.title.localeCompare(b.title,"tr"));
  else if(sortMode==="format") all.sort((a,b)=>(a.format||"").localeCompare(b.format||""));
  else if(sortMode==="progress") all.sort((a,b)=>(((b.curChap||0)+1)/Math.max(1,b.chapters.length)) - (((a.curChap||0)+1)/Math.max(1,a.chapters.length)));
  else all.sort((a,b)=>(b.lastRead||0)-(a.lastRead||0));

  const tags = ["Tümü", ...new Set(all.flatMap(b=>b.tags||[]))];
  if(tagBar){
    tagBar.innerHTML = tags.map(t=>`<span class="chip ${t===activeLibTag?"active":""}" data-tag="${esc(t)}">${esc(t)}</span>`).join("");
    tagBar.querySelectorAll("[data-tag]").forEach(c=>c.onclick=()=>{ activeLibTag=c.dataset.tag; renderLibrary(); });
  }
  const q = ($("#libSearch")?.value||"").toLowerCase().trim();
  const list = all.filter(b => {
    const st = b.status || "reading";
    return (activeLibStatus==="all" || st===activeLibStatus) &&
           (activeLibTag==="Tümü" || (b.tags||[]).includes(activeLibTag)) &&
           (!q || b.title.toLowerCase().includes(q) || (b.author||"").toLowerCase().includes(q) || (b.tags||[]).join(" ").toLowerCase().includes(q));
  });
  if(!list.length){ grid.innerHTML = `<div class="card" style="grid-column:1/-1"><div class="meta">Bu rafta kitap yok. Yukarıdan EPUB/PDF/MOBI/CBZ ekle veya Web Novel Seri İndirici'yi kullan!</div></div>`; return; }
  grid.innerHTML = list.map(b=>{
    const pct = Math.round((((b.curChap||0)+1)/Math.max(1,b.chapters.length))*100);
    const stIcon = STATUS_ICONS[b.status || "reading"] || "📖";
    return `<div class="book-card" data-open="${b.id}">
      <div class="book-cov">${b.cover?`<img src="${b.cover}" loading="lazy">`:`<span class="ph">${b.isManga?"🖼️":"📖"}</span>`}<span class="book-badge">${esc(b.format||"KİTAP")}</span><span class="book-status-dot">${stIcon}</span></div>
      <div class="book-info">
        <div class="book-title">${esc(b.title)}</div>
        <div class="book-meta">Bölüm ${(b.curChap||0)+1}/${b.chapters.length} (%${pct})</div>
        <div class="book-prog"><div style="width:${pct}%"></div></div>
      </div>
      <div class="book-acts">
        <button class="btn small" data-editb="${b.id}" title="Düzenle">✏️</button>
        <button class="btn small danger" data-delb="${b.id}" title="Çöpe At">🗑️</button>
      </div>
    </div>`;
  }).join("");
  grid.querySelectorAll("[data-open]").forEach(c=>c.onclick=e=>{
    if(e.target.closest("[data-delb]") || e.target.closest("[data-editb]")) return;
    openBookReader(c.dataset.open);
  });
  grid.querySelectorAll("[data-editb]").forEach(b=>b.onclick=async e=>{
    e.stopPropagation(); const bk=await dbGet(b.dataset.editb); if(!bk) return;
    $("#beId").value = bk.id; $("#beTitle").value = bk.title || ""; $("#beAuthor").value = bk.author || "";
    $("#beStatus").value = bk.status || "reading";
    $("#beTags").value = (bk.tags||[]).join(", "); $("#beCoverUrl").value = bk.cover || "";
    openModal("bookEditModal");
  });
  grid.querySelectorAll("[data-delb]").forEach(b=>b.onclick=async e=>{
    e.stopPropagation(); const bk=await dbGet(b.dataset.delb); if(!bk) return;
    bk.deletedAt = Date.now(); await dbPut(bk); renderLibrary(); toast("7 günlük çöp kutusuna taşındı");
  });
}
$("#libSearch")?.addEventListener("input", renderLibrary);
$("#libSort")?.addEventListener("change", renderLibrary);
$("#beCoverFileBtn")?.addEventListener("click", () => $("#beCoverFileInput").click());
$("#beCoverFileInput")?.addEventListener("change", async e => {
  const f = e.target.files?.[0]; e.target.value=""; if(!f) return;
  const fr = new FileReader(); fr.onload = () => { $("#beCoverUrl").value = fr.result; toast("Kapak seçildi"); }; fr.readAsDataURL(f);
});
$("#beSaveBtn")?.addEventListener("click", async () => {
  const bk = await dbGet($("#beId").value); if(!bk) return;
  bk.title = $("#beTitle").value.trim() || bk.title;
  bk.author = $("#beAuthor").value.trim();
  bk.status = $("#beStatus").value || "reading";
  bk.tags = $("#beTags").value.split(",").map(x=>x.trim()).filter(Boolean);
  bk.cover = $("#beCoverUrl").value.trim();
  await dbPut(bk); closeModal("bookEditModal"); renderLibrary(); toast("Kitap güncellendi!");
});

function updateDailyGoalUI(){
  const mins = Math.floor((S.dailyActivity[todayKey()] || 0) / 60);
  const goal = S.dailyGoalMins || 30;
  const pct = Math.min(100, Math.round((mins/goal)*100));
  if($("#dailyGoalTxt")) $("#dailyGoalTxt").textContent = `${mins} / ${goal} dk (%${pct})`;
  if($("#dailyGoalBar")) $("#dailyGoalBar").style.width = pct + "%";
}
$("#editGoalBtn").onclick = async () => {
  const g = await showPromptSheet("🎯 Günlük Okuma Hedefi", "Hedef süre (dakika):", String(S.dailyGoalMins || 30));
  if(g && Number(g)>0){ S.dailyGoalMins = Number(g); saveState(); updateDailyGoalUI(); }
};

/* ===================== 4. TAM EKRAN OKUYUCU ===================== */
const R = { book:null, chapIdx:0, readTimer:null, pendingSecs:0, autoScrollRaf:null, autoScrollLast:0, prefetchingIdx:-1, ttsSpeaking:false, mangaPageIdx:0, mangaHideBubbles:false, sleepTimerId:null, sleepTickId:null, sleepEndsAt:0, batchStop:false };

function recordReadingStreak(){
  const today = todayKey();
  if(S.stats.lastDay === today) return;
  const yest = todayKey(new Date(Date.now() - 86400000));
  S.stats.streak = (S.stats.lastDay === yest) ? (S.stats.streak || 0) + 1 : 1;
  S.stats.lastDay = today;
}

function applyNightFilter(){
  const ov = $("#nightFilterOverlay"); if(!ov) return;
  const dim = Number(S.reader.dimmer || 0), amb = Number(S.reader.amber || 0);
  if(dim <= 0 && amb <= 0){ ov.style.display = "none"; return; }
  ov.style.display = "block";
  const aDim = (dim / 100) * 0.82;
  const aAmb = (amb / 100) * 0.48;
  ov.style.background = `linear-gradient(rgba(0,0,0,${aDim.toFixed(2)}), rgba(0,0,0,${aDim.toFixed(2)})), rgba(255,148,38,${aAmb.toFixed(2)})`;
}

function applyReaderPrefs(){
  const r = $("#reader"), body = $("#rBody"), p = S.reader;
  r.className = "open" + (p.theme && p.theme!=="night" ? " rt-"+p.theme : "");
  body.style.fontFamily = p.font || "Georgia,serif";
  body.style.fontSize = (p.size || 18) + "px";
  body.style.lineHeight = p.lh || 1.8;
  body.style.maxWidth = p.width || "760px";
  body.style.textAlign = p.align || "left";
  $("#rRuler").classList.toggle("on", !!p.ruler);
  $("#rThemeSel").value = p.theme; $("#rFontSel").value = p.font;
  $("#rAlignSel").value = p.align || "left"; $("#rWidthSel").value = p.width || "760px";
  $("#rSizeRange").value = p.size; $("#rSizeVal").textContent = p.size;
  $("#rLhRange").value = p.lh; $("#rLhVal").textContent = p.lh;
  $("#rDimRange").value = p.dimmer || 0; $("#rDimVal").textContent = p.dimmer || 0;
  $("#rAmberRange").value = p.amber || 0; $("#rAmberVal").textContent = p.amber || 0;
  $("#rLitrpgToggle").checked = p.litrpgHud !== false;
  $("#rDlgColorToggle").checked = !!p.dlgColor;
  $("#rBionicToggle").checked = !!p.bionic;
  $("#rRulerToggle").checked = !!p.ruler;
  $("#rPrefetchToggle").checked = !!p.prefetch;
  $("#rTtsContToggle").checked = !!p.ttsCont;
  $("#rTtsModeSel").value = p.ttsMode || "multi";
  $("#rTtsRate").value = p.ttsRate || 1.0; $("#rTtsRateVal").textContent = p.ttsRate || 1.0;
  $("#rScrollSpd").value = p.scrollSpeed || 3; $("#rScrollSpdVal").textContent = p.scrollSpeed || 3;
  const vm = p.viewMode || "tr";
  $("#rViewModeBtn").textContent = vm==="biling" ? "⚖️" : vm==="orig" ? "📄" : "🌐";
  applyNightFilter();
}

function toBionicHtml(html){
  if(!S.reader.bionic) return html;
  return html.replace(/(>[^<]+<)/g, seg => seg.replace(/\b([A-Za-zÇĞİÖŞÜçğıöşü]{3,})\b/g, w => {
    const k = Math.ceil(w.length * 0.45);
    return `<b class="bionic-b">${w.slice(0,k)}</b>${w.slice(k)}`;
  }));
}

function isLitRpgParagraph(txt){
  if(!S.reader.litrpgHud) return false;
  const t = txt.trim();
  if(/^(\[|【|「\s*(Sistem|System|Bildirim|Durum|Status|Görev|Quest|Yetenek|Skill|Seviye|Level)|<\s*(System|Sistem))/i.test(t)) return true;
  if(/^(Level|Seviye|HP|MP|STR|AGI|INT|Stat|Ünvan|Title)\s*[:：]/i.test(t)) return true;
  return false;
}

async function openBookReader(bookId, chapIdx=null){
  const book = await dbGet(bookId); if(!book) return toast("Kitap bulunamadı");
  R.book = book; R.chapIdx = chapIdx !== null ? chapIdx : (book.curChap || 0);
  if(R.chapIdx >= book.chapters.length) R.chapIdx = 0;
  R.mangaPageIdx = 0; R.mangaHideBubbles = false;
  applyReaderPrefs();
  if(isNative() && window.AndroidBridge.setReaderOpen) window.AndroidBridge.setReaderOpen(true);
  if(isNative() && S.immersiveReader && window.AndroidBridge.setImmersiveMode) window.AndroidBridge.setImmersiveMode(true);
  renderCurrentChapter();
  clearInterval(R.readTimer); R.pendingSecs = 0;
  R.readTimer = setInterval(()=>{
    R.pendingSecs += 5;
    S.stats.totalSecs += 5;
    recordReadingStreak();
    S.dailyActivity[todayKey()] = (S.dailyActivity[todayKey()] || 0) + 5;
    if(R.pendingSecs >= 30){ R.pendingSecs = 0; saveState(); }
  }, 5000);
}

function closeReader(){
  clearInterval(R.readTimer); stopAutoScroll();
  if(window.CAI_stopTts) window.CAI_stopTts();
  else if(window.speechSynthesis) speechSynthesis.cancel();
  R.ttsSpeaking = false;
  if(R.pendingSecs > 0){ R.pendingSecs = 0; saveState(); }
  $("#reader").classList.remove("open","bars-hidden");
  $("#nightFilterOverlay").style.display = "none";
  if(isNative() && window.AndroidBridge.setReaderOpen) window.AndroidBridge.setReaderOpen(false);
  if(isNative() && window.AndroidBridge.setImmersiveMode) window.AndroidBridge.setImmersiveMode(false);
  if(isNative() && window.AndroidBridge.setBrightness) window.AndroidBridge.setBrightness(-1);
  renderLibrary();
}

function renderMangaPageCard(ch, idx){
  const cnt = ch.mangaBubbles?.[idx]?.length || 0;
  return `<div class="cbz-page-wrap" data-pidx="${idx}">
    <img src="${ch.images[idx]}" loading="lazy">
    <button class="cbz-tr-btn" data-trpage="${idx}">${cnt ? `✅ ${cnt} Baloncuk` : "💬 Çevir"}</button>
    <div class="lib-mb-layer ${R.mangaHideBubbles?"hide-bubbles":""}" id="libMb_${idx}"></div>
  </div>`;
}

function renderCurrentChapter(jumpParaIdx=null){
  if(window.CAI_stopTts) window.CAI_stopTts();
  const book = R.book, ch = book.chapters[R.chapIdx]; if(!ch) return;
  book.curChap = R.chapIdx; book.lastRead = Date.now();
  if(!book.scrollMap) book.scrollMap = {};
  if(!ch._countedWords && (ch.trText || ch.text)){
    const wc = (ch.trText || ch.text).trim().split(/\s+/).length;
    S.stats.totalWords = (S.stats.totalWords || 0) + wc;
    ch._countedWords = true;
    saveState();
  }
  dbPut(book);
  $("#rBookTitle").textContent = book.title;
  $("#rChapMeta").textContent = `${ch.title || ("Bölüm "+(R.chapIdx+1))} (${R.chapIdx+1}/${book.chapters.length})`;
  const body = $("#rBody");
  $("#rPrefetchBadge").style.display = (book.chapters[R.chapIdx+1]?.trText) ? "inline-flex" : "none";

  if(ch.images && ch.images.length){
    $("#rTransBtn").textContent = "💬 Sayfaları Çevir";
    const pagedMode = S.mangaStyle.dir === "rtl" || S.mangaStyle.dir === "ltr";
    const isLandscapeDual = S.mangaStyle.dualPage && window.innerWidth > window.innerHeight && ch.images.length > 1;
    const toggleHtml = `<button class="btn small ${R.mangaHideBubbles?"warn":"ok"}" id="cbzToggleBubblesBtn">${R.mangaHideBubbles?"👁️ Çeviriyi Göster":"👁️ Orijinale Bak"}</button>`;

    if(pagedMode){
      R.mangaPageIdx = Math.max(0, Math.min(ch.images.length - 1, R.mangaPageIdx));
      const step = isLandscapeDual ? 2 : 1;
      const idxs = isLandscapeDual && R.mangaPageIdx + 1 < ch.images.length
        ? (S.mangaStyle.dir === "rtl" ? [R.mangaPageIdx+1, R.mangaPageIdx] : [R.mangaPageIdx, R.mangaPageIdx+1])
        : [R.mangaPageIdx];
      body.innerHTML = `
        <div class="cbz-nav-bar">
          <button class="btn small" id="cbzPrevPg">${S.mangaStyle.dir==="rtl"?"◀ İleri":"◀ Önceki"}</button>
          <span class="meta">Sayfa <b>${R.mangaPageIdx+1}/${ch.images.length}</b></span>
          ${toggleHtml}
          <button class="btn small" id="cbzNextPg">${S.mangaStyle.dir==="rtl"?"Geri ▶":"Sonraki ▶"}</button>
        </div>
        <div class="${isLandscapeDual?"cbz-dual-wrap":""}">${idxs.map(i => renderMangaPageCard(ch, i)).join("")}</div>`;
      idxs.forEach(i => { if(ch.mangaBubbles?.[i]?.length) renderLocalMangaBubbles(i, ch.mangaBubbles[i]); });
      $("#cbzPrevPg").onclick = () => { R.mangaPageIdx += (S.mangaStyle.dir==="rtl" ? step : -step); renderCurrentChapter(); };
      $("#cbzNextPg").onclick = () => { R.mangaPageIdx += (S.mangaStyle.dir==="rtl" ? -step : step); renderCurrentChapter(); };
      if(S.reader.prefetch) prefetchNextMangaPages(R.mangaPageIdx);
    } else {
      body.innerHTML = `<div class="cbz-nav-bar"><span class="item-title">${esc(ch.title)}</span>${toggleHtml}</div>` +
        ch.images.map((_,idx)=>renderMangaPageCard(ch, idx)).join("");
      ch.images.forEach((_,idx)=>{ if(ch.mangaBubbles?.[idx]?.length) renderLocalMangaBubbles(idx, ch.mangaBubbles[idx]); });
    }
    $("#cbzToggleBubblesBtn").onclick = () => {
      R.mangaHideBubbles = !R.mangaHideBubbles;
      $$(".lib-mb-layer").forEach(l => l.classList.toggle("hide-bubbles", R.mangaHideBubbles));
      $("#cbzToggleBubblesBtn").textContent = R.mangaHideBubbles ? "👁️ Çeviriyi Göster" : "👁️ Orijinale Bak";
      $("#cbzToggleBubblesBtn").className = "btn small " + (R.mangaHideBubbles ? "warn" : "ok");
    };
    body.querySelectorAll("[data-trpage]").forEach(b=>b.onclick=ev=>{ ev.stopPropagation(); translateLocalMangaPage(Number(b.dataset.trpage)); });
  } else {
    $("#rTransBtn").textContent = ch.trText ? "✅ Çevrildi" : "🌐 Çevir";
    const vm = S.reader.viewMode || "tr";
    const origParas = (ch.text || "").split(/\n+/).map(x=>x.trim()).filter(Boolean);
    const trParas = (ch.trText || "").split(/\n+/).map(x=>x.trim()).filter(Boolean);
    let html = `<div class="r-title">${esc(ch.title || ("Bölüm "+(R.chapIdx+1)))}</div>`;

    if(vm === "biling" && ch.trText && origParas.length){
      const maxLen = Math.max(origParas.length, trParas.length);
      for(let i=0;i<maxLen;i++){
        const trP = trParas[i] || "";
        const cls = isLitRpgParagraph(trP) ? ' class="litrpg-box"' : '';
        html += `<p data-pi="${i}"${cls}>${origParas[i]?`<span class="biling-orig">${esc(origParas[i])}</span>`:""}${esc(trP)}</p>`;
      }
    } else {
      const paras = (vm === "orig" || !ch.trText) ? origParas : trParas;
      html += paras.map((p,i)=>`<p data-pi="${i}"${isLitRpgParagraph(p)?' class="litrpg-box"':""}>${esc(p)}</p>`).join("");
    }
    const hls = S.highlights.filter(h=>h.bookId===book.id && h.chapIdx===R.chapIdx);
    hls.forEach(h=>{ if(h.text.length>2) html = html.replace(esc(h.text), `<span class="hl-mark">${esc(h.text)}</span>`); });
    html = toBionicHtml(html);

    html += `<div class="chap-theory-card">
      <div class="meta" style="margin-bottom:7px">Bölüm sonuna geldin! İpuçları ve spoiler'sız teoriler ister misin?</div>
      <button class="btn small pink" id="rChapTheoryBtn">🔮 Bölüm Analizi & 3 Teori Üret</button>
    </div>`;

    body.innerHTML = html;
    bindParaLongPress();
    $("#rChapTheoryBtn").onclick = generateChapterTheory;
  }

  const scEl = $("#rScroll");
  requestAnimationFrame(() => {
    if(jumpParaIdx !== null){
      const pEl = $(`#rBody p[data-pi="${jumpParaIdx}"]`);
      if(pEl){ pEl.scrollIntoView({behavior:"smooth", block:"center"}); pEl.classList.add("tts-active"); setTimeout(()=>pEl.classList.remove("tts-active"), 2200); return; }
    }
    const savedPct = book.scrollMap?.[R.chapIdx] || 0;
    const max = Math.max(1, scEl.scrollHeight - scEl.clientHeight);
    scEl.scrollTop = savedPct > 0 ? (savedPct / 100) * max : 0;
    $("#rProgFill").style.width = savedPct + "%";
    $("#rJumpSlider").value = savedPct;
    $("#rPctTxt").textContent = savedPct + "%";
  });
}

async function generateChapterTheory(){
  if(!R.book) return;
  const ch = R.book.chapters[R.chapIdx]; if(!ch) return;
  toast("🔮 AI bölümü analiz ediyor…");
  try{
    const txt = (ch.trText || ch.text || "").slice(0, 6500);
    const out = await callAI({task:"chat", stream:false, messages:[
      {role:"system", content:`Sen keskin gözlü bir edebiyat/web novel analistisin. Verilen bölümü oku ve SPOİLER VERMEDEN (sadece bu bölümden yola çıkarak): 1) Gözden kaçabilecek 2 gizli ipucu (foreshadowing), 2) Sonraki bölüm için 3 heyecanlı teori yaz. Kısa ve sürükleyici Türkçe kullan.`},
      {role:"user", content:`[${R.book.title} - ${ch.title}]\n${txt}`}
    ]});
    showInfoSheet("🔮 Bölüm Analizi & Teoriler", out.trim(), out.trim());
  }catch(e){ toast("Analiz hatası: "+e.message); }
}

function bindParaLongPress(){
  $$("#rBody p[data-pi]").forEach(p => {
    let lpTimer = null;
    p.addEventListener("touchstart", () => {
      lpTimer = setTimeout(async () => {
        if((window.getSelection()+"").trim()) return;
        const ch = R.book?.chapters?.[R.chapIdx]; if(!ch?.trText) return;
        const idx = Number(p.dataset.pi);
        const origParas = (ch.text||"").split(/\n+/).map(x=>x.trim()).filter(Boolean);
        const trParas = (ch.trText||"").split(/\n+/).map(x=>x.trim()).filter(Boolean);
        const src = origParas[idx] || trParas[idx]; if(!src) return;
        haptic("medium"); toast("🔄 Paragraf yeniden çevriliyor…"); p.style.opacity = "0.5";
        try{
          const out = await callAI({task:"text", stream:false, messages:[
            {role:"system", content:buildSystemPrompt(R.book.id)+"\nBu paragrafı daha doğal ve akıcı şekilde yeniden çevir. Sadece çeviriyi yaz."},
            {role:"user", content:src}
          ]});
          trParas[idx] = out.trim();
          ch.trText = trParas.join("\n\n");
          await dbPut(R.book);
          renderCurrentChapter(idx);
          toast("✅ Paragraf güncellendi!");
        }catch(e){ p.style.opacity="1"; toast("Hata: "+e.message); }
      }, 650);
    }, {passive:true});
    const clr = () => clearTimeout(lpTimer);
    p.addEventListener("touchmove", clr, {passive:true});
    p.addEventListener("touchend", clr, {passive:true});
  });
}

function renderLocalMangaBubbles(pageIdx, bubbles){
  const layer = $(`#libMb_${pageIdx}`); if(!layer) return;
  const alpha = S.mangaStyle.alpha ?? 1.0;
  const tagTxt = langShort(S.tgtLang);
  layer.innerHTML = bubbles.map((b,bi)=>{
    const padX = Math.max(0, b.x - 1.5), padY = Math.max(0, b.y - 1.2);
    const padW = Math.min(98 - padX, Math.max(18, b.w + 3.5));
    const padH = Math.max(6.5, b.h + 2.5);
    const cls = !b.translated ? "mb-untranslated" : (b.type==="narration" ? "mb-dark" : b.type==="sfx" ? "mb-sfx" : b.type==="thought" ? "mb-thought" : "");
    const len = Math.max(6, (b.tr||"").length);
    const baseFs = Math.max(11.5, Math.min(16.5, (len > 48 ? 11.5 : len > 28 ? 12.5 : 14) * (S.mangaStyle.scale||1)));
    const badge = b.translated ? tagTxt : "ORİJ";
    return `<div class="lib-mb ${cls}" data-bi="${bi}" style="left:${padX}%;top:${padY}%;width:${padW}%;min-height:${padH}%;font-size:${baseFs.toFixed(1)}px;font-family:${S.mangaStyle.font||"sans-serif"};border-color:${b.translated?(S.mangaStyle.border||"#8b5cf6"):"#f59e0b"};opacity:${alpha}">
      <span class="lmb-t">${esc(b.tr)}</span>
      <span class="lib-mb-tag">${esc(badge)}</span>
      <button class="lib-mb-x" title="Gizle">✕</button>
    </div>`;
  }).join("");

  layer.querySelectorAll(".lib-mb").forEach(el => {
    const bi = Number(el.dataset.bi);
    const xBtn = el.querySelector(".lib-mb-x");
    xBtn.onclick = ev => { ev.stopPropagation(); el.remove(); };
    let sx=0, sy=0, ox=0, oy=0, dragged=false, holdT=null, lastTap=0;
    el.addEventListener("touchstart", ev => {
      if(ev.target === xBtn) return;
      const t = ev.touches[0]; sx=t.clientX; sy=t.clientY;
      ox = el.offsetLeft; oy = el.offsetTop; dragged = false;
      holdT = setTimeout(() => { if(!dragged) el.style.opacity = "0.08"; }, 240);
    }, {passive:true});
    el.addEventListener("touchmove", ev => {
      if(ev.target === xBtn) return;
      const t = ev.touches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if(Math.abs(dx)>6 || Math.abs(dy)>6){
        dragged = true; clearTimeout(holdT); el.style.opacity = String(alpha);
        el.style.left = (ox + dx) + "px"; el.style.top = (oy + dy) + "px";
      }
    }, {passive:true});
    el.addEventListener("touchend", async ev => {
      clearTimeout(holdT); el.style.opacity = String(alpha);
      if(!dragged && ev.target !== xBtn){
        const now = Date.now();
        if(now - lastTap < 320){
          const sp = el.querySelector(".lmb-t");
          const ed = await showPromptSheet("✏️ Baloncuk Düzenle", "Yeni çeviri metni:", sp.textContent);
          if(ed !== null && ed.trim()){
            sp.textContent = ed.trim();
            el.classList.remove("mb-untranslated");
            const tag = el.querySelector(".lib-mb-tag"); if(tag) tag.textContent = tagTxt;
            const ch = R.book?.chapters?.[R.chapIdx];
            if(ch?.mangaBubbles?.[pageIdx]?.[bi]){ ch.mangaBubbles[pageIdx][bi].tr = ed.trim(); ch.mangaBubbles[pageIdx][bi].translated = true; dbPut(R.book); }
          }
        }
        lastTap = now;
      }
    });
  });
}

const mangaPrefetchSet = new Set();
async function prefetchNextMangaPages(curPageIdx){
  const ch = R.book?.chapters?.[R.chapIdx]; if(!ch?.images) return;
  for(const nextIdx of [curPageIdx+1, curPageIdx+2]){
    if(nextIdx >= ch.images.length) continue;
    const key = `${R.book.id}_${R.chapIdx}_${nextIdx}`;
    if(ch.mangaBubbles?.[nextIdx]?.length || mangaPrefetchSet.has(key)) continue;
    mangaPrefetchSet.add(key);
    translateLocalMangaPage(nextIdx, true).finally(()=>mangaPrefetchSet.delete(key));
  }
}

async function translateLocalMangaPage(pageIdx, silent=false){
  const ch = R.book?.chapters?.[R.chapIdx]; if(!ch?.images?.[pageIdx]) return;
  const btn = $(`[data-trpage="${pageIdx}"]`);
  if(btn && !silent) btn.textContent = "⏳ Çevriliyor…";
  try{
    const b64 = ch.images[pageIdx].split(",")[1];
    const bubbles = await analyzeMangaImageB64(b64);
    if(!ch.mangaBubbles) ch.mangaBubbles = {};
    ch.mangaBubbles[pageIdx] = bubbles;
    await dbPut(R.book);
    renderLocalMangaBubbles(pageIdx, bubbles);
    if(btn) btn.textContent = `✅ ${bubbles.length} Baloncuk`;
    if(!silent) haptic("success");
  }catch(e){ if(btn && !silent) btn.textContent = "❌ Hata"; if(!silent) toast(e.message); }
}

async function translateChapterAt(idx, silent=false){
  const book = R.book, ch = book?.chapters?.[idx];
  if(!ch || ch.images?.length) return;
  if(ch.trText && silent) return;
  const btn = $("#rTransBtn");
  if(!silent && btn) btn.textContent = "⏳ Çevriliyor…";
  try{
    const prevChap = idx > 0 ? book.chapters[idx - 1] : null;
    let prevTail = prevChap ? getLastSentences(prevChap.trText || prevChap.text || "", 3) : "";
    const chunks = splitChunks(ch.text || "", S.chunkSize);
    let out = "";
    for(const ck of chunks){
      const hit = await tmLookup(ck, S.tgtLang);
      let part = hit;
      if(!part){
        part = await callAI({task:"text", stream:false, messages:[
          {role:"system",content:buildSystemPrompt(book.id, prevTail)},
          {role:"user",content:ck}
        ]});
        tmStore(ck, part, S.tgtLang);
      }
      out = out ? out + "\n\n" + part : part;
      prevTail = getLastSentences(part, 3);
    }
    ch.trText = out; await dbPut(book);
    if(idx === R.chapIdx){ renderCurrentChapter(); haptic("success"); toast("Bölüm kalıcı olarak çevrildi!"); }
    else if(idx === R.chapIdx + 1){ $("#rPrefetchBadge").style.display="inline-flex"; }
  }catch(e){ if(!silent){ if(btn) btn.textContent="🌐 Çevir"; toast("Çeviri hatası: "+e.message); } }
}

$("#rTransBtn").onclick = async () => {
  const ch = R.book?.chapters?.[R.chapIdx]; if(!ch) return;
  if(ch.images?.length){
    toast("Bu bölümdeki tüm manga sayfaları sırayla çevriliyor…");
    for(let i=0;i<ch.images.length;i++) if(!ch.mangaBubbles?.[i]?.length) await translateLocalMangaPage(i);
    return;
  }
  if(ch.trText && !confirm("Bu bölüm zaten çevrilmiş. Yeniden çevrilsin mi?")) return;
  await translateChapterAt(R.chapIdx, false);
};

$("#rDriftBtn")?.addEventListener("click", async () => {
  if(!R.book) return;
  closeModal("rSetModal"); openModal("driftModal");
  $("#driftList").innerHTML = `<div class="meta">🔍 AI çevrilen bölümlerdeki isim/terim tutarlılığını tarıyor…</div>`;
  const trChaps = R.book.chapters.filter(c => c.trText).slice(-8);
  if(!trChaps.length){ $("#driftList").innerHTML = `<div class="meta">Henüz çevrilmiş bölüm yok.</div>`; return; }
  const sample = trChaps.map((c,i)=>`[Bölüm ${i+1}]\n${c.trText.slice(0,1600)}`).join("\n---\n").slice(0,12000);
  try{
    const raw = await callAI({task:"chat", stream:false, temperature:0.1, messages:[
      {role:"system", content:`Bu çevrilmiş roman bölümlerinde aynı özel ismin, yeteneğin veya yerin farklı şekillerde çevrilmiş tutarsızlıklarını bul. SADECE JSON dizisi dön: [{"orig":"Orijinal Terim","canonical":"Önerilen Standart Türkçe","variants":["Hatalı Çeviri 1","Hatalı Çeviri 2"]}]. Tutarsızlık yoksa [].`},
      {role:"user", content:sample}
    ]});
    const s = raw.indexOf("["), e = raw.lastIndexOf("]");
    const items = (s>=0 && e>s) ? JSON.parse(raw.slice(s, e+1)) : [];
    if(!items.length){ $("#driftList").innerHTML = `<div class="status ok">✅ Harika! Çevrilen bölümlerde belirgin terim tutarsızlığı bulunamadı.</div>`; return; }
    $("#driftList").innerHTML = items.map((it, idx) => `
      <div class="item">
        <div class="item-body">
          <div class="item-title">${esc(it.orig||"Terim")} → <span style="color:var(--ok)">${esc(it.canonical)}</span></div>
          <div class="item-sub">Farklı kullanımlar: ${esc((it.variants||[]).join(", "))}</div>
        </div>
        <button class="btn small primary" data-driftfix="${idx}">🔄 Standartlaştır</button>
      </div>`).join("");
    $$("[data-driftfix]").forEach(b => b.onclick = async () => {
      const it = items[Number(b.dataset.driftfix)];
      let reps = 0;
      R.book.chapters.forEach(c => {
        if(!c.trText) return;
        (it.variants||[]).forEach(v => {
          if(v && v !== it.canonical && c.trText.includes(v)){ c.trText = c.trText.split(v).join(it.canonical); reps++; }
        });
      });
      await dbPut(R.book);
      if(it.orig && !S.glossary.some(g=>g.src===it.orig && g.bookId===R.book.id)){
        S.glossary.unshift({id:uid(), src:it.orig, tgt:it.canonical, bookId:R.book.id});
        saveState();
      }
      renderCurrentChapter();
      b.disabled = true; b.textContent = "✅ Düzeltildi";
      toast(`🔄 ${reps} bölümde "${it.canonical}" olarak standartlaştırıldı ve sözlüğe kilitlendi!`);
    });
  }catch(e){ $("#driftList").innerHTML = `<div class="status error">Hata: ${esc(e.message)}</div>`; }
});

$("#rBatchTransBtn").onclick = async () => {
  if(!R.book) return;
  const cntStr = await showPromptSheet("📦 Toplu Bölüm Çevir", `Mevcut bölümden itibaren kaç bölüm arka planda çevrilsin? (Kalan: ${R.book.chapters.length - R.chapIdx})`, "5");
  if(!cntStr) return;
  const cnt = Math.max(1, Math.min(30, Number(cntStr)||5));
  closeModal("rSetModal"); R.batchStop = false;
  toast(`📦 ${cnt} bölüm sırayla çevriliyor…`);
  let done = 0;
  for(let i=R.chapIdx; i<Math.min(R.book.chapters.length, R.chapIdx+cnt); i++){
    if(R.batchStop) break;
    if(!R.book.chapters[i].trText && !R.book.chapters[i].images?.length){
      $("#rPrefetchBadge").style.display = "inline-flex";
      $("#rPrefetchBadge").textContent = `📦 ${done+1}/${cnt}`;
      await translateChapterAt(i, true);
      done++;
    }
  }
  $("#rPrefetchBadge").textContent = "⚡ Hazır";
  toast(`✅ Toplu çeviri tamamlandı (${done} yeni bölüm çevrildi)!`);
};

$("#rPipBtn")?.addEventListener("click", () => {
  if(isNative() && window.AndroidBridge.enterPipMode) window.AndroidBridge.enterPipMode();
  else toast("PiP modu sadece Android APK içinde çalışır");
});

$("#rViewModeBtn").onclick = () => {
  const modes = ["tr","biling","orig"], names = {tr:"🌐 Sadece Çeviri", biling:"⚖️ İki Dilli (Alt Alta)", orig:"📄 Orijinal Metin"};
  const nxt = modes[(modes.indexOf(S.reader.viewMode||"tr")+1)%modes.length];
  S.reader.viewMode = nxt; saveState(); applyReaderPrefs(); renderCurrentChapter(); toast(names[nxt]);
};

let scrollSaveTimer = null;
$("#rScroll").addEventListener("scroll", () => {
  const el = $("#rScroll"), max = Math.max(1, el.scrollHeight - el.clientHeight);
  const pct = Math.min(100, Math.round((el.scrollTop / max) * 100));
  $("#rProgFill").style.width = pct + "%";
  $("#rJumpSlider").value = pct;
  $("#rPctTxt").textContent = pct + "%";

  clearTimeout(scrollSaveTimer);
  scrollSaveTimer = setTimeout(() => {
    if(R.book){
      if(!R.book.scrollMap) R.book.scrollMap = {};
      R.book.scrollMap[R.chapIdx] = pct;
      dbPut(R.book);
    }
  }, 500);

  if(S.reader.prefetch && pct >= 60 && R.book && R.chapIdx + 1 < R.book.chapters.length){
    const nxt = R.book.chapters[R.chapIdx + 1];
    if(nxt && !nxt.trText && !nxt.images?.length && R.prefetchingIdx !== R.chapIdx + 1){
      R.prefetchingIdx = R.chapIdx + 1;
      translateChapterAt(R.chapIdx + 1, true).finally(()=>{ if(R.prefetchingIdx === R.chapIdx + 1) R.prefetchingIdx = -1; });
    }
  }
}, {passive:true});

$("#rJumpSlider").oninput = e => {
  const el = $("#rScroll"), max = Math.max(1, el.scrollHeight - el.clientHeight);
  el.scrollTop = (Number(e.target.value)/100) * max;
};

let brStartY=0, brActive=false, brMoved=false, curBright=0.5, brightTimer=null;
$("#rScroll").addEventListener("touchstart", e => {
  brMoved = false;
  if(e.touches.length===1 && e.touches[0].clientX < 38){ brActive=true; brStartY=e.touches[0].clientY; }
  else brActive=false;
}, {passive:true});
$("#rScroll").addEventListener("touchmove", e => {
  if(!brActive) return;
  const dy = brStartY - e.touches[0].clientY;
  if(Math.abs(dy) > 4) brMoved = true;
  brStartY = e.touches[0].clientY;
  curBright = Math.max(0.05, Math.min(1.0, curBright + dy / 320));
  if(isNative() && window.AndroidBridge.setBrightness) window.AndroidBridge.setBrightness(curBright);
  const hud = $("#rBrightHud"); hud.textContent = `☀️ %${Math.round(curBright*100)}`; hud.style.display="block";
  clearTimeout(brightTimer); brightTimer = setTimeout(()=>hud.style.display="none", 900);
}, {passive:true});
$("#rScroll").addEventListener("click", e => {
  if(brMoved){ brMoved = false; return; }
  if(window.getSelection()?.toString().trim() || e.target.closest("button,.lib-mb,.cbz-nav-bar,.chap-theory-card")) return;
  const w = window.innerWidth, x = e.clientX, el = $("#rScroll");
  if(x > w*0.28 && x < w*0.72) $("#reader").classList.toggle("bars-hidden");
  else if(x >= w*0.72) el.scrollBy({top: el.clientHeight*0.82, behavior:"smooth"});
  else el.scrollBy({top: -el.clientHeight*0.82, behavior:"smooth"});
});

window.__onVolumeKey = dir => {
  const el = $("#rScroll"); if(!el) return;
  el.scrollBy({top: dir==="down" ? el.clientHeight*0.82 : -el.clientHeight*0.82, behavior:"smooth"});
};

$("#rSearchBtn").onclick = () => { $("#rSearchBar").classList.toggle("open"); $("#rSearchInput").focus(); };
$("#rSearchClose").onclick = () => $("#rSearchBar").classList.remove("open");
$("#rSearchGo").onclick = () => {
  const q = $("#rSearchInput").value.trim().toLowerCase(); if(!q) return;
  const p = $$("#rBody p").find(el => el.textContent.toLowerCase().includes(q));
  if(p){ p.scrollIntoView({behavior:"smooth",block:"center"}); p.classList.add("tts-active"); setTimeout(()=>p.classList.remove("tts-active"), 1800); }
  else toast("Bu bölümde bulunamadı");
};
$("#rSearchBookBtn").onclick = () => {
  const q = $("#rSearchInput").value.trim().toLowerCase(); if(!q || !R.book) return toast("Aranacak kelimeyi yaz");
  const hits = [];
  R.book.chapters.forEach((c, ci) => {
    const src = c.trText || c.text || "";
    const paras = src.split(/\n+/).map(x=>x.trim()).filter(Boolean);
    paras.forEach((p, pi) => {
      if(p.toLowerCase().includes(q) && hits.length < 80) hits.push({ci, pi, title: c.title || `Bölüm ${ci+1}`, snippet: p.slice(0, 140)});
    });
  });
  $("#bookSearchList").innerHTML = hits.length ? hits.map(h => `
    <div class="item" data-bsj="${h.ci}:${h.pi}" style="cursor:pointer">
      <div class="item-body">
        <div class="item-title">📖 ${h.ci+1}. ${esc(h.title)}</div>
        <div class="item-sub">${esc(h.snippet)}…</div>
      </div>
    </div>`).join("") : `<div class="meta">Kitabın hiçbir bölümünde "${esc(q)}" bulunamadı.</div>`;
  $$("[data-bsj]").forEach(el => el.onclick = () => {
    const [ci, pi] = el.dataset.bsj.split(":").map(Number);
    closeModal("bookSearchModal"); R.chapIdx = ci; renderCurrentChapter(pi);
  });
  openModal("bookSearchModal");
};

function stopAutoScroll(){
  if(R.autoScrollRaf){ cancelAnimationFrame(R.autoScrollRaf); R.autoScrollRaf=null; }
  $("#rAutoScrollBtn").classList.remove("primary");
}
$("#rAutoScrollBtn").onclick = () => {
  if(R.autoScrollRaf){ stopAutoScroll(); return; }
  $("#rAutoScrollBtn").classList.add("primary");
  R.autoScrollLast = performance.now();
  const step = now => {
    if(!R.autoScrollRaf) return;
    const dt = Math.min(50, now - R.autoScrollLast); R.autoScrollLast = now;
    const pxPerSec = (S.reader.scrollSpeed || 3) * 26;
    const sc = $("#rScroll");
    sc.scrollTop += (pxPerSec * dt) / 1000;
    if(sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2){ stopAutoScroll(); return; }
    R.autoScrollRaf = requestAnimationFrame(step);
  };
  R.autoScrollRaf = requestAnimationFrame(step);
};

$("#rCloseBtn").onclick = closeReader;
$("#rPrevBtn").onclick = () => { if(R.chapIdx>0){ R.chapIdx--; R.mangaPageIdx=0; renderCurrentChapter(); } };
$("#rNextBtn").onclick = () => { if(R.book && R.chapIdx<R.book.chapters.length-1){ R.chapIdx++; R.mangaPageIdx=0; renderCurrentChapter(); } };
$("#rSetBtn").onclick = () => openModal("rSetModal");
$("#rChapsBtn").onclick = () => {
  if(!R.book) return;
  $("#chapList").innerHTML = R.book.chapters.map((c,i)=>`<div class="item" data-ci="${i}" style="cursor:pointer;${i===R.chapIdx?"border-color:var(--primary)":""}"><div class="item-body"><div class="item-title">${i+1}. ${esc(c.title||"Bölüm "+(i+1))}</div><div class="item-sub">${c.trText?"✅ Çevrildi":""}${R.book.scrollMap?.[i]?` • %${R.book.scrollMap[i]}`:""}</div></div></div>`).join("");
  $$("#chapList [data-ci]").forEach(el=>el.onclick=()=>{ R.chapIdx=Number(el.dataset.ci); R.mangaPageIdx=0; renderCurrentChapter(); closeModal("chapModal"); });
  openModal("chapModal");
};

let curReaderSel = "";
document.addEventListener("selectionchange", () => {
  if(!$("#reader").classList.contains("open")) return;
  const s = (window.getSelection()+"").trim();
  if(s.length > 1 && s.length < 1500){ curReaderSel = s; $("#selBar").classList.add("show"); }
  else $("#selBar").classList.remove("show");
});
$("#selCopyBtn").onclick = () => { copyText(curReaderSel); $("#selBar").classList.remove("show"); };
$("#selTransBtn").onclick = async () => {
  toast("Çevriliyor…");
  try{
    const out = await callAI({task:"text", stream:false, messages:[{role:"system",content:`Metni ${langName(S.tgtLang)} diline doğal çevir. Sadece çeviriyi yaz.`},{role:"user",content:curReaderSel}]});
    showInfoSheet("🌐 Seçili Metin Çevirisi", out.trim(), out.trim());
  }catch(e){ toast(e.message); }
};
$("#selDictBtn").onclick = async () => {
  if(!curReaderSel) return;
  const word = curReaderSel.slice(0, 120);
  toast("📘 Bağlamsal sözlük analiz ediyor…");
  try{
    const out = await callAI({task:"chat", stream:false, messages:[
      {role:"system", content:`Verilen kelime veya deyimi dil öğrenen bir okuyucu için Türkçe analiz et:\n1) Anlamı\n2) Kök / Gramer Yapısı\n3) Okunuş / Telaffuz\n4) Kısa Örnek Cümle\nKısa ve net maddelerle yaz.`},
      {role:"user", content:word}
    ]});
    showInfoSheet(`📘 "${word}" Analizi`, out.trim(), out.trim(), false, {
      label: "🃏 Flashcard Ekle",
      onClick: () => { if(window.CAI_addFlashcard) window.CAI_addFlashcard(word, out.trim().slice(0, 320), R.book?.title || ""); }
    });
  }catch(e){ toast(e.message); }
};
$("#selWhoBtn").onclick = async () => {
  if(!R.book || !curReaderSel) return;
  toast("🧬 Spoiler korumalı analiz yapılıyor…");
  const wikiMatch = (R.book.wiki?.chars||[]).find(c => c.name.toLowerCase().includes(curReaderSel.toLowerCase()) || (c.orig||"").toLowerCase().includes(curReaderSel.toLowerCase()));
  const ctx = R.book.chapters.slice(Math.max(0, R.chapIdx-3), R.chapIdx+1).map(c=>(c.trText||c.text||"").slice(0,1800)).join("\n---\n");
  try{
    const ans = await callAI({task:"chat", stream:false, messages:[
      {role:"system", content:`Okuyucu "${R.book.title}" kitabının ${R.chapIdx+1}. bölümünde "${curReaderSel}" ifadesini seçti. KESİN SPOİLER KORUMASI: İleriki bölümlerden ASLA bahsetme. Sadece okunan bölümlere ve wiki notuna dayanarak bu karakterin/terimin kim veya ne olduğunu 3-4 net cümleyle Türkçe açıkla.`},
      {role:"user", content:`WİKİ: ${wikiMatch ? JSON.stringify(wikiMatch) : "Yok"}\n\nOKUNAN BÖLÜMLER:\n${ctx}`}
    ]});
    showInfoSheet(`🧬 "${curReaderSel}" Kimdir / Nedir?`, ans.trim(), ans.trim());
  }catch(e){ toast(e.message); }
};
$("#selHlBtn").onclick = () => {
  if(!R.book || !curReaderSel) return;
  S.highlights.unshift({id:uid(), bookId:R.book.id, bookTitle:R.book.title, chapIdx:R.chapIdx, text:curReaderSel, ts:Date.now()});
  saveState(); renderCurrentChapter(); haptic("light"); toast("🖍️ Vurgulandı!");
};
$("#selGlossBtn").onclick = async () => {
  const tr = await showPromptSheet("📖 Kitap Sözlüğüne Ekle", `"${curReaderSel}" için Türkçe karşılık:`, "");
  if(tr && tr.trim()){ S.glossary.unshift({id:uid(), src:curReaderSel, tgt:tr.trim(), bookId:R.book?.id||"global"}); saveState(); toast("📖 Kitap sözlüğüne eklendi!"); }
};
$("#selQuoteBtn").onclick = () => {
  const cv = $("#quoteCanvas"), ctx = cv.getContext("2d");
  const g = ctx.createLinearGradient(0,0,900,520); g.addColorStop(0,"#0d061c"); g.addColorStop(1,"#240e44");
  ctx.fillStyle = g; ctx.fillRect(0,0,900,520);
  ctx.strokeStyle = "#a855f7"; ctx.lineWidth = 4; ctx.strokeRect(26,26,848,468);
  ctx.fillStyle = "#c4b5fd"; ctx.font = "bold 46px Georgia,serif"; ctx.fillText("“", 56, 100);
  ctx.fillStyle = "#f5f3ff"; ctx.font = "28px Georgia,serif";
  const words = curReaderSel.slice(0,320).split(/\s+/); let line="", y=135;
  for(const w of words){
    if(ctx.measureText(line+w).width > 760){ ctx.fillText(line, 66, y); line = w+" "; y += 40; if(y>400) break; }
    else line += w+" ";
  }
  ctx.fillText(line, 66, y);
  ctx.fillStyle = "#e879f9"; ctx.font = "bold 20px system-ui,sans-serif";
  ctx.fillText(`— ${R.book?.title || "Çevirmen AI"}`, 66, 462);
  openModal("quoteModal");
};
$("#quoteDlBtn").onclick = () => { $("#quoteCanvas").toBlob(b => downloadBlob(b, `alinti-${Date.now()}.png`), "image/png"); };

$("#rThemeSel").onchange = e => { S.reader.theme=e.target.value; saveState(); applyReaderPrefs(); };
$("#rFontSel").onchange = e => { S.reader.font=e.target.value; saveState(); applyReaderPrefs(); };
$("#rAlignSel").onchange = e => { S.reader.align=e.target.value; saveState(); applyReaderPrefs(); };
$("#rWidthSel").onchange = e => { S.reader.width=e.target.value; saveState(); applyReaderPrefs(); };
$("#rSizeRange").oninput = e => { S.reader.size=Number(e.target.value); saveState(); applyReaderPrefs(); };
$("#rLhRange").oninput = e => { S.reader.lh=Number(e.target.value); saveState(); applyReaderPrefs(); };
$("#rDimRange").oninput = e => { S.reader.dimmer=Number(e.target.value); $("#rDimVal").textContent=e.target.value; saveState(); applyNightFilter(); };
$("#rAmberRange").oninput = e => { S.reader.amber=Number(e.target.value); $("#rAmberVal").textContent=e.target.value; saveState(); applyNightFilter(); };
$("#rLitrpgToggle").onchange = e => { S.reader.litrpgHud=e.target.checked; saveState(); renderCurrentChapter(); };
$("#rBionicToggle").onchange = e => { S.reader.bionic=e.target.checked; saveState(); renderCurrentChapter(); };
$("#rRulerToggle").onchange = e => { S.reader.ruler=e.target.checked; saveState(); applyReaderPrefs(); };
$("#rPrefetchToggle").onchange = e => { S.reader.prefetch=e.target.checked; saveState(); };
$("#rTtsContToggle").onchange = e => { S.reader.ttsCont=e.target.checked; saveState(); };
$("#rTtsModeSel").onchange = e => { S.reader.ttsMode=e.target.value; saveState(); };
$("#rTtsRate").oninput = e => { S.reader.ttsRate=Number(e.target.value); $("#rTtsRateVal").textContent=e.target.value; saveState(); };
$("#rScrollSpd").oninput = e => { S.reader.scrollSpeed=Number(e.target.value); $("#rScrollSpdVal").textContent=e.target.value; saveState(); };

$("#rRecapBtn").onclick = async () => {
  if(!R.book) return;
  toast("🧠 Özet hazırlanıyor…");
  const prev = R.book.chapters.slice(Math.max(0,R.chapIdx-2), R.chapIdx+1).map(c=>(c.trText||c.text||"").slice(0,1800)).join("\n---\n");
  try{
    const sum = await callAI({task:"chat", stream:false, messages:[{role:"system",content:"Okuyucuya 'Nerde Kalmıştım?' özeti ver. Spoiler vermeden son olayları 5 maddede Türkçe özetle."},{role:"user",content:prev}]});
    showInfoSheet("🧠 Nerde Kalmıştım?", sum.trim(), sum.trim());
  }catch(e){ toast(e.message); }
};

function clearSleepTimer(){
  clearTimeout(R.sleepTimerId); clearInterval(R.sleepTickId);
  R.sleepTimerId = null; R.sleepTickId = null; R.sleepEndsAt = 0;
  const b = $("#rSleepBadge"); if(b) b.style.display = "none";
}
$("#rSleepBtn").onclick = async () => {
  if(R.sleepTimerId){ clearSleepTimer(); return toast("🌙 Uyku zamanlayıcısı iptal edildi"); }
  const m = await showPromptSheet("🌙 Uyku Zamanlayıcısı", "Kaç dakika sonra okuyucu ve sesli okuma kapansın?", "20");
  if(m && Number(m)>0){
    const mins = Number(m); R.sleepEndsAt = Date.now() + mins * 60000;
    const badge = $("#rSleepBadge");
    const upd = () => {
      const left = Math.max(0, Math.ceil((R.sleepEndsAt - Date.now())/60000));
      if(badge){ badge.style.display="inline-flex"; badge.textContent = `🌙 ${left}dk`; }
    };
    upd(); R.sleepTickId = setInterval(upd, 15000);
    R.sleepTimerId = setTimeout(()=>{ clearSleepTimer(); closeReader(); toast("🌙 Uyku zamanlayıcısı doldu"); }, mins*60000);
    toast(`🌙 Uyku zamanlayıcısı: ${mins} dk`);
  }
};
$("#rExportEpubBtn").onclick = () => { if(R.book) exportBookAsEpub(R.book); };

/* ===================== 5. STÜDYO (SÖZLÜK + PROMPT + ONORİFİK + WRAPPED) ===================== */
async function renderGlossary(){
  const sel = $("#glossBookSel"); if(!sel) return;
  const books = (await dbAll()).filter(b=>!b.deletedAt);
  const curVal = sel.value || "global";
  sel.innerHTML = `<option value="global">🌍 Genel Sözlük (Tüm Kitaplar)</option>` + books.map(b=>`<option value="${b.id}">📖 ${esc(b.title)}</option>`).join("");
  sel.value = curVal;
  $("#glossEnabled").checked = !!S.glossEnabled;
  const list = S.glossary.filter(g => (g.bookId||"global") === sel.value);
  $("#glossList").innerHTML = list.length ? list.map(g=>`<div class="item"><div class="item-body"><div class="item-title">${esc(g.src)} → <span style="color:var(--accent)">${esc(g.tgt)}</span></div></div><button class="btn small danger" data-gdel="${g.id}">✕</button></div>`).join("") : `<div class="meta">Bu kapsamda henüz terim yok.</div>`;
  $$("[data-gdel]").forEach(b=>b.onclick=()=>{ S.glossary=S.glossary.filter(x=>x.id!==b.dataset.gdel); saveState(); renderGlossary(); });
}
$("#glossBookSel")?.addEventListener("change", renderGlossary);
$("#glossEnabled").onchange = e => { S.glossEnabled=e.target.checked; saveState(); };
$("#gAddBtn").onclick = () => {
  const src=$("#gSrc").value.trim(), tgt=$("#gTgt").value.trim(); if(!src||!tgt) return toast("İki alanı da doldur");
  S.glossary.unshift({id:uid(), src, tgt, bookId:$("#glossBookSel").value||"global"});
  $("#gSrc").value=""; $("#gTgt").value=""; saveState(); renderGlossary();
};
$("#glossExportBtn").onclick = () => downloadBlob(new Blob([JSON.stringify(S.glossary,null,2)],{type:"application/json"}), "cevirmen-sozluk.json");
$("#glossImportBtn").onclick = () => $("#glossFileInput").click();
$("#glossFileInput").onchange = async e => {
  const f=e.target.files?.[0]; e.target.value=""; if(!f) return;
  const txt = await f.text(); const bId = $("#glossBookSel").value||"global";
  try{
    if(f.name.endsWith(".json")){ const arr=JSON.parse(txt); arr.forEach(x=>{ if(x.src&&x.tgt) S.glossary.push({id:uid(),src:x.src,tgt:x.tgt,bookId:x.bookId||bId}); }); }
    else txt.split("\n").forEach(ln=>{ const [s,t]=ln.split(/[,;\t]/); if(s&&t) S.glossary.push({id:uid(),src:s.trim(),tgt:t.trim(),bookId:bId}); });
    saveState(); renderGlossary(); toast("Sözlük içe aktarıldı!");
  }catch{ toast("Dosya okunamadı"); }
};
$("#glossAiBtn").onclick = async () => {
  const bId = $("#glossBookSel").value;
  let sample = $("#srcText").value.trim();
  if(bId && bId!=="global"){ const bk=await dbGet(bId); sample = (bk?.chapters?.[bk.curChap||0]?.text||"").slice(0,5000); }
  if(!sample) return toast("Önce bir kitap seç veya Metin sekmesine metin yapıştır");
  toast("✨ AI terim sözlüğü çıkarıyor…");
  try{
    const raw = await callAI({task:"chat", stream:false, messages:[
      {role:"system", content:`Metindeki özel isimleri, yerleri, yetenekleri ve tekrar eden terimleri çıkar ve ${langName(S.tgtLang)} karşılıklarını öner. SADECE JSON: [{"src":"...","tgt":"..."}]`},
      {role:"user", content:sample}
    ]});
    const arr = JSON.parse(raw.slice(raw.indexOf("["), raw.lastIndexOf("]")+1));
    arr.forEach(x=>{ if(x.src&&x.tgt) S.glossary.unshift({id:uid(),src:x.src,tgt:x.tgt,bookId:bId||"global"}); });
    saveState(); renderGlossary(); toast(`✨ ${arr.length} terim sözlüğe eklendi!`);
  }catch(e){ toast("Çıkarılamadı: "+e.message); }
};

function renderPromptUI(){
  const sel=$("#promptSel"); if(!sel) return;
  sel.innerHTML = S.prompts.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("");
  sel.value = S.activePromptId;
  const cur = S.prompts.find(p=>p.id===S.activePromptId) || S.prompts[0];
  $("#promptEdit").value = cur.text;
  if($("#setHonorificMode")) $("#setHonorificMode").value = S.honorificMode || "keep";
}
$("#setHonorificMode")?.addEventListener("change", e => { S.honorificMode = e.target.value; saveState(); toast("Onorifik modu güncellendi"); });
$("#promptSel").onchange = e => { S.activePromptId=e.target.value; saveState(); renderPromptUI(); };
$("#savePromptBtn").onclick = () => { const cur=S.prompts.find(p=>p.id===S.activePromptId); if(cur){cur.text=$("#promptEdit").value; saveState(); toast("Şablon kaydedildi");} };
$("#addPromptBtn").onclick = async () => {
  const n = await showPromptSheet("🎭 Yeni Prompt Şablonu", "Şablon adı:");
  if(!n || !n.trim()) return;
  const id=uid(); S.prompts.push({id,name:n.trim(),text:"Metni hedef dile çevir."}); S.activePromptId=id; saveState(); renderPromptUI();
};
$("#delPromptBtn").onclick = () => { const cur=S.prompts.find(p=>p.id===S.activePromptId); if(!cur||cur.builtIn) return toast("Varsayılan şablon silinemez"); S.prompts=S.prompts.filter(p=>p.id!==cur.id); S.activePromptId=S.prompts[0].id; saveState(); renderPromptUI(); };

function renderWrapped(){
  const mins = Math.round((S.stats.totalSecs||0)/60);
  const wpm = mins > 0 ? Math.round((S.stats.totalWords||0)/mins) : 0;
  $("#wrappedStats").innerHTML = `
    <span class="pill-tag">⏱ ${mins} dk</span>
    <span class="pill-tag ok">🔥 ${S.stats.streak||0} gün seri</span>
    <span class="pill-tag">📖 ${(S.stats.totalWords||0).toLocaleString("tr")} kelime</span>
    ${wpm?`<span class="pill-tag">⚡ ${wpm} klm/dk</span>`:""}
    <span class="pill-tag warn">🔤 ${Math.round((S.usage.inTok+S.usage.outTok)/1000)}K tok</span>`;
  const hm = $("#heatmapGrid"); if(!hm) return;
  let cells = "";
  for(let i=27;i>=0;i--){
    const d = todayKey(new Date(Date.now()-i*86400000));
    const sec = S.dailyActivity[d] || 0;
    const lv = sec>1800?"hm-4":sec>900?"hm-3":sec>300?"hm-2":sec>0?"hm-1":"";
    cells += `<div class="hm-cell ${lv}" title="${d}: ${Math.round(sec/60)} dk"></div>`;
  }
  hm.innerHTML = cells;
}

/* ===================== 6. AYARLAR, BÜTÇE, TM CACHE, GIST & YEDEKLEME ===================== */
async function renderSettingsUI(){
  const ps = $("#apiProfileSel");
  ps.innerHTML = S.apiProfiles.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("");
  ps.value = S.activeProfileId;
  $("#setBaseUrl").value = S.baseUrl; $("#setApiKey").value = S.apiKey;
  $("#setFallbackModel").value = S.fallbackModel || "";
  $("#setSingleModel").checked = !!S.singleModel;
  $("#taskModelBox").style.display = S.singleModel ? "none" : "block";
  $("#setModelText").value = S.taskModels.text || "";
  $("#setModelVision").value = S.taskModels.vision || "";
  $("#setModelChat").value = S.taskModels.chat || "";
  $("#cachedModelDatalist").innerHTML = S.cachedModels.map(m=>`<option value="${esc(m.id||m)}">`).join("");

  $("#setBudgetUsd").value = S.budget.dailyUsd ?? 0.5;
  $("#setBudgetTok").value = S.budget.dailyTok ?? 250000;
  $("#setCheapModel").value = S.budget.cheapModel || "";
  $("#setAutoCheap").checked = !!S.budget.autoCheap;
  $("#budgetStatusTxt").textContent = `Bugün: $${(S.budget.todayUsd||0).toFixed(4)} / $${S.budget.dailyUsd||0} | ${Math.round((S.budget.todayTok||0)/1000)}K / ${Math.round((S.budget.dailyTok||0)/1000)}K token`;

  $("#setTemp").value = S.temp; $("#tempVal").textContent = S.temp;
  $("#setChunk").value = S.chunkSize;
  $("#setPriceIn").value = S.priceIn; $("#setPriceOut").value = S.priceOut;
  $("#setSlidingCtx").checked = S.slidingContext !== false;
  $("#setTmCache").checked = S.tmEnabled !== false;
  $("#tmStatTxt").textContent = `TM Önbellek: ${await tmCount()} kayıt`;
  $("#setStream").checked = !!S.stream; $("#setTn").checked = !!S.tnEnabled;
  $("#setKeepScreen").checked = !!S.keepScreen; $("#setImmersive").checked = !!S.immersiveReader;
  $("#setClipWatch").checked = !!S.clipWatch; $("#setAutoWatch").checked = !!S.autoWatch;
  $("#setTheme").value = S.appTheme; $("#setAnim").value = S.animStyle;
  $("#setGistToken").value = S.gist.token || "";
  $("#setGistId").value = S.gist.id || "";

  const est = ((S.usage.inTok/1e6)*(S.priceIn||0) + (S.usage.outTok/1e6)*(S.priceOut||0)).toFixed(4);
  $("#usageSummary").textContent = `Toplam: ${S.usage.reqs} istek | ~${Math.round(S.usage.inTok/1000)}K giriş, ~${Math.round(S.usage.outTok/1000)}K çıkış | Tahmini: $${est}`;
  $("#lastBackupTxt").textContent = S.lastBackup ? `Son yedek: ${new Date(S.lastBackup).toLocaleString("tr")}` : "Henüz yedek alınmadı.";
  $("#navCustChips").innerHTML = ALL_TABS.map(t=>`<span class="chip ${S.navTabs.includes(t.id)?"active":""}" data-nt="${t.id}">${t.ic} ${t.label}</span>`).join("");
  $$("#navCustChips [data-nt]").forEach(c=>c.onclick=()=>{
    const id = c.dataset.nt;
    if(S.navTabs.includes(id)){ if(S.navTabs.length<=3) return toast("En az 3 sekme olmalı"); S.navTabs=S.navTabs.filter(x=>x!==id); }
    else S.navTabs.push(id);
    saveState(); renderBottomNav(); renderSettingsUI();
  });
}

$("#apiProfileSel").onchange = e => {
  S.activeProfileId = e.target.value;
  const p = S.apiProfiles.find(x=>x.id===S.activeProfileId);
  if(p){ S.baseUrl=p.baseUrl; S.apiKey=p.apiKey; saveState(true); renderSettingsUI(); toast("Profil: "+p.name); }
};
$("#saveProfileBtn").onclick = async () => {
  const n = await showPromptSheet("🔌 Yeni API Profili", "Profil adı (ör. LiteRouter, OpenRouter):");
  if(!n || !n.trim()) return;
  const id = uid(); S.apiProfiles.push({id, name:n.trim(), baseUrl:$("#setBaseUrl").value.trim(), apiKey:$("#setApiKey").value.trim()});
  S.activeProfileId = id; saveState(true); renderSettingsUI(); toast("Profil kaydedildi!");
};
$("#delProfileBtn").onclick = () => {
  if(S.apiProfiles.length<=1) return toast("Son profil silinemez");
  S.apiProfiles = S.apiProfiles.filter(x=>x.id!==S.activeProfileId);
  S.activeProfileId = S.apiProfiles[0].id;
  S.baseUrl = S.apiProfiles[0].baseUrl; S.apiKey = S.apiProfiles[0].apiKey;
  saveState(true); renderSettingsUI();
};

$("#setBaseUrl").onchange = e => { S.baseUrl=e.target.value.trim(); const p=S.apiProfiles.find(x=>x.id===S.activeProfileId); if(p)p.baseUrl=S.baseUrl; saveState(true); };
$("#setApiKey").onchange = e => { S.apiKey=e.target.value.trim(); const p=S.apiProfiles.find(x=>x.id===S.activeProfileId); if(p)p.apiKey=S.apiKey; saveState(true); };
$("#setFallbackModel").onchange = e => { S.fallbackModel=e.target.value.trim(); saveState(); };
$("#setSingleModel").onchange = e => { S.singleModel=e.target.checked; saveState(true); renderSettingsUI(); };
$("#setModelText").onchange = e => { S.taskModels.text=e.target.value.trim(); saveState(true); };
$("#setModelVision").onchange = e => { S.taskModels.vision=e.target.value.trim(); saveState(true); };
$("#setModelChat").onchange = e => { S.taskModels.chat=e.target.value.trim(); saveState(true); };
$("#setBudgetUsd").onchange = e => { S.budget.dailyUsd=Number(e.target.value)||0; saveState(); renderSettingsUI(); };
$("#setBudgetTok").onchange = e => { S.budget.dailyTok=Number(e.target.value)||0; saveState(); renderSettingsUI(); };
$("#setCheapModel").onchange = e => { S.budget.cheapModel=e.target.value.trim(); saveState(); };
$("#setAutoCheap").onchange = e => { S.budget.autoCheap=e.target.checked; saveState(); };
$("#setTemp").oninput = e => { S.temp=Number(e.target.value); $("#tempVal").textContent=S.temp; saveState(); };
$("#setChunk").onchange = e => { S.chunkSize=Number(e.target.value)||6000; saveState(); };
$("#setPriceIn").onchange = e => { S.priceIn=Number(e.target.value)||0; saveState(); renderSettingsUI(); updateSrcCostHint(); };
$("#setPriceOut").onchange = e => { S.priceOut=Number(e.target.value)||0; saveState(); renderSettingsUI(); updateSrcCostHint(); };
$("#setSlidingCtx").onchange = e => { S.slidingContext=e.target.checked; saveState(); };
$("#setTmCache").onchange = e => { S.tmEnabled=e.target.checked; saveState(); };
$("#clearTmBtn").onclick = async () => { await tmClear(); $("#tmStatTxt").textContent="TM Önbellek: 0 kayıt"; toast("TM önbelleği temizlendi"); };
$("#setStream").onchange = e => { S.stream=e.target.checked; saveState(); };
$("#setTn").onchange = e => { S.tnEnabled=e.target.checked; saveState(); };
$("#setKeepScreen").onchange = e => { S.keepScreen=e.target.checked; saveState(); applyThemeAndAnim(); };
$("#setImmersive").onchange = e => { S.immersiveReader=e.target.checked; saveState(); };
$("#setClipWatch").onchange = e => { S.clipWatch=e.target.checked; saveState(); };
$("#setAutoWatch").onchange = e => { S.autoWatch=e.target.checked; saveState(); };
$("#setTheme").onchange = e => { S.appTheme=e.target.value; saveState(); applyThemeAndAnim(); };
$("#setAnim").onchange = e => { S.animStyle=e.target.value; saveState(); applyThemeAndAnim(); };
$("#setGistToken").onchange = e => { S.gist.token=e.target.value.trim(); saveState(); };
$("#setGistId").onchange = e => { S.gist.id=e.target.value.trim(); saveState(); };

async function fetchModels(){
  if(!S.apiKey) return toast("Önce API Anahtarını gir");
  toast("Modeller çekiliyor…");
  try{
    const r = await fetch(S.baseUrl.replace(/\/+$/,"")+"/models", {headers:{"Authorization":"Bearer "+S.apiKey}});
    const j = await r.json();
    S.cachedModels = (j.data || []).map(m=>({id:m.id, pricing:m.pricing||null}));
    if(!S.model && S.cachedModels.length) S.model = S.cachedModels[0].id;
    saveState(true); applyThemeAndAnim(); renderSettingsUI();
    toast(`${S.cachedModels.length} model yüklendi!`);
  }catch(e){ toast("Model hatası: "+e.message); }
}
$("#fetchModelsBtn").onclick = fetchModels;
function openModelPicker(){
  const renderM = () => {
    const q = ($("#modelSearch").value||"").toLowerCase();
    const list = S.cachedModels.map(m=>m.id||m).filter(id=>id.toLowerCase().includes(q));
    list.sort((a,b)=>(S.favModels.includes(b)?1:0)-(S.favModels.includes(a)?1:0));
    $("#modelList").innerHTML = list.length ? list.slice(0,120).map(id=>`
      <div class="item" style="${id===S.model?"border-color:var(--primary)":""}">
        <div class="item-body" data-msel="${esc(id)}" style="cursor:pointer"><div class="item-title">${esc(id)}</div></div>
        <button class="btn small" data-mfav="${esc(id)}">${S.favModels.includes(id)?"⭐":"☆"}</button>
      </div>`).join("") : `<div class="meta">Model bulunamadı. Ayarlar'dan "Modelleri Çek"e bas.</div>`;
    $$("[data-msel]").forEach(el=>el.onclick=()=>{ S.model=el.dataset.msel; saveState(true); applyThemeAndAnim(); closeModal("modelModal"); haptic("light"); toast("Model: "+S.model); });
    $$("[data-mfav]").forEach(b=>b.onclick=()=>{ const id=b.dataset.mfav; S.favModels=S.favModels.includes(id)?S.favModels.filter(x=>x!==id):[...S.favModels,id]; saveState(); renderM(); });
  };
  $("#modelSearch").oninput = renderM;
  renderM(); openModal("modelModal");
}
$("#hdrModelBtn").onclick = openModelPicker;
$("#openModelModalBtn").onclick = openModelPicker;

$("#backupLiteBtn").onclick = () => {
  S.lastBackup = Date.now(); saveState(); renderSettingsUI();
  downloadBlob(new Blob([JSON.stringify({type:"lite", state:S},null,2)],{type:"application/json"}), `cevirmen-ayarlar-${todayKey()}.json`);
};
$("#backupFullBtn").onclick = async () => {
  S.lastBackup = Date.now(); saveState(); renderSettingsUI();
  const books = await dbAll();
  downloadBlob(new Blob([JSON.stringify({type:"full", state:S, books})],{type:"application/json"}), `cevirmen-tam-yedek-${todayKey()}.json`);
};
$("#restoreBtn").onclick = () => $("#restoreInput").click();
$("#restoreInput").onchange = async e => {
  const f=e.target.files?.[0]; e.target.value=""; if(!f) return;
  try{
    const d = JSON.parse(await f.text());
    if(d.state){ S = {...defaultState(), ...d.state}; saveState(true); }
    if(Array.isArray(d.books)) for(const b of d.books) await dbPut(b);
    applyThemeAndAnim(); renderBottomNav(); renderLibrary(); renderSettingsUI(); toast("✅ Yedek geri yüklendi!");
  }catch(err){ toast("Yedek hatası: "+err.message); }
};

$("#startOverlayBtn").onclick = () => isNative() ? window.AndroidBridge.startFloatingOverlay() : toast("Sadece Android APK'da çalışır");
$("#stopOverlayBtn").onclick = () => isNative() && window.AndroidBridge.stopFloatingOverlay();
$("#hdrOverlayBtn").onclick = () => isNative() ? window.AndroidBridge.startFloatingOverlay() : toast("Sadece Android APK'da çalışır");
$("#openMangaBrowserBtn").onclick = () => openRealBrowser("https://mangadex.org");
$("#mDir").value = S.mangaStyle.dir; $("#mDualPage").checked = S.mangaStyle.dualPage !== false;
$("#mFont").value = S.mangaStyle.font;
$("#mScale").value = S.mangaStyle.scale; $("#mScaleVal").textContent = S.mangaStyle.scale;
$("#mAlpha").value = S.mangaStyle.alpha ?? 1.0; $("#mAlphaVal").textContent = Math.round((S.mangaStyle.alpha ?? 1.0)*100);
$("#mBorder").value = S.mangaStyle.border;
$("#mDir").onchange = e => { S.mangaStyle.dir=e.target.value; saveState(true); };
$("#mDualPage").onchange = e => { S.mangaStyle.dualPage=e.target.checked; saveState(); };
$("#mFont").onchange = e => { S.mangaStyle.font=e.target.value; saveState(true); };
$("#mScale").oninput = e => { S.mangaStyle.scale=Number(e.target.value); $("#mScaleVal").textContent=e.target.value; saveState(true); };
$("#mAlpha").oninput = e => { S.mangaStyle.alpha=Number(e.target.value); $("#mAlphaVal").textContent=Math.round(S.mangaStyle.alpha*100); saveState(true); };
$("#mBorder").onchange = e => { S.mangaStyle.border=e.target.value; saveState(true); };

let lastClipSeen = "";
window.__onAppResume = () => {
  if(window.CAI_updateVpnBtn) window.CAI_updateVpnBtn();
  if(!S.clipWatch || !isNative() || !window.AndroidBridge.getClipboardText) return;
  const c = (window.AndroidBridge.getClipboardText()||"").trim();
  if(c.length>3 && c.length<2500 && c!==lastClipSeen){
    lastClipSeen = c;
    $("#clipBannerTxt").textContent = "📋 Pano: " + c.slice(0,70);
    $("#clipBanner").classList.add("show");
  }
};
$("#clipBannerGo").onclick = () => { $("#clipBanner").classList.remove("show"); switchView("text"); $("#srcText").value=lastClipSeen; updateSrcCostHint(); doTranslate(); };
$("#clipBannerClose").onclick = () => $("#clipBanner").classList.remove("show");
$("#hdrDebugBtn").onclick = () => { $("#debugLogs").textContent = DEBUG_LOGS.join("\n") || "Henüz hata kaydı yok."; openModal("debugModal"); };
$("#copyDebugBtn").onclick = () => copyText(DEBUG_LOGS.join("\n"));

$("#trashBtn").onclick = async () => {
  const now = Date.now(), all = await dbAll();
  const trashed = [];
  for(const b of all){
    if(!b.deletedAt) continue;
    if(now - b.deletedAt > 7*86400000) await dbDel(b.id);
    else trashed.push(b);
  }
  $("#trashList").innerHTML = trashed.length ? trashed.map(b=>`<div class="item"><div class="item-body"><div class="item-title">${esc(b.title)}</div></div><button class="btn small ok" data-resb="${b.id}">Geri Al</button><button class="btn small danger" data-purb="${b.id}">Sil</button></div>`).join("") : `<div class="meta">Çöp kutusu boş.</div>`;
  $$("[data-resb]").forEach(b=>b.onclick=async()=>{ const bk=await dbGet(b.dataset.resb); delete bk.deletedAt; await dbPut(bk); closeModal("trashModal"); renderLibrary(); });
  $$("[data-purb]").forEach(b=>b.onclick=async()=>{ await dbDel(b.dataset.purb); closeModal("trashModal"); toast("Kalıcı olarak silindi"); });
  openModal("trashModal");
};

$("#mergeSeriesBtn").onclick = async () => {
  const books = (await dbAll()).filter(b=>!b.deletedAt);
  if(books.length<2) return toast("Birleştirmek için en az 2 kitap olmalı");
  const groups = new Map();
  books.forEach(b=>{
    const key = b.seriesKey || b.title.toLowerCase().replace(/(bölüm|chapter|ch\.?|cilt|vol\.?)\s*\d+.*/i,"").trim();
    if(!groups.has(key)) groups.set(key, []);
    groups.get(key).push(b);
  });
  let merged = 0;
  for(const [,arr] of groups){
    if(arr.length<2) continue;
    arr.sort((a,b)=>a.title.localeCompare(b.title,undefined,{numeric:true}));
    const main = arr[0];
    const seenUrls = new Set(main.chapters.map(c=>c.url).filter(Boolean));
    for(let i=1;i<arr.length;i++){
      for(const c of arr[i].chapters){
        if(!c.url || !seenUrls.has(c.url)){ main.chapters.push(c); if(c.url) seenUrls.add(c.url); }
      }
      await dbDel(arr[i].id); merged++;
    }
    await dbPut(main);
  }
  renderLibrary(); toast(merged ? `🧩 ${merged} kitap aynı seride birleştirildi!` : "Benzer isimli seri bulunamadı");
};

initLangSelects(); applyThemeAndAnim(); renderBottomNav(); renderHistory(); renderBrowserUI(); renderLibrary(); updateSrcCostHint();
saveState(true);
if(S.lastBackup && Date.now() - S.lastBackup > 14*86400000) setTimeout(()=>toast("💾 Son yedeğinin üzerinden 14 gün geçti! Ayarlar'dan yedek alabilirsin."), 2500);

window.CAI = {
  $, $$, esc, uid, todayKey, toast, haptic, copyText, downloadBlob, openModal, closeModal, showInfoSheet, showPromptSheet,
  debugLog, DEBUG_LOGS, getS:()=>S, setS:ns=>{ S={...defaultState(),...ns}; }, saveState, callAI, splitChunks, getModelForTask,
  dbAll, dbGet, dbPut, dbDel, mediaPut, mediaGet, extractPdfText, extractEpubText,
  openRealBrowser, addBrowserHistory, renderBrowserHistory, renderLibrary, openBookReader, renderCurrentChapter,
  renderPromptUI, renderGlossary, renderSettingsUI, switchView, importBookFile, applyThemeAndAnim, R
};
})();
