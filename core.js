(() => {
"use strict";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const todayKey = () => new Date().toISOString().slice(0,10);
const isNative = () => !!(window.AndroidBridge && window.AndroidBridge.isNative && window.AndroidBridge.isNative());
const haptic = (type="light") => { if(isNative() && window.AndroidBridge.vibrate) try{window.AndroidBridge.vibrate(type);}catch{} };
const b64DecodeUtf8 = b64 => { const bin=atob(b64), bytes=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i); return new TextDecoder().decode(bytes); };

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
function toast(msg){ const el=$("#toast"); if(!el) return; el.textContent=msg; el.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove("show"),2600); }
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

// FİZİKSEL / JEST GERİ TUŞU KÖPRÜSÜ (Hata #1 Çözümü)
window.__onHardwareBack = () => {
  if($("#lightbox")?.classList.contains("open")){ $("#lightbox").classList.remove("open"); return "handled"; }
  const openModals = $$(".modal.open");
  if(openModals.length){ openModals[openModals.length-1].classList.remove("open"); return "handled"; }
  if($("#reader")?.classList.contains("open")){ closeReader(); return "handled"; }
  const activeView = $(".view.active")?.id;
  if(activeView && activeView !== "view-text"){ switchView("text"); return "handled"; }
  return "exit";
};

const LANGS = [
  ["auto","Otomatik Algıla"],["tr","Türkçe"],["en","İngilizce"],["ja","Japonca"],["ko","Korece"],
  ["zh-CN","Çince (Basitleştirilmiş)"],["zh-TW","Çince (Geleneksel)"],["de","Almanca"],
  ["fr","Fransızca"],["es","İspanyolca"],["it","İtalyanca"],["pt","Portekizce"],
  ["ru","Rusça"],["uk","Ukraynaca"],["pl","Lehçe"],["nl","Hollandaca"],
  ["el","Yunanca"],["ar","Arapça"],["fa","Farsça"],["hi","Hintçe"],["az","Azerbaycan Türkçesi"]
];
const langName = c => (LANGS.find(l=>l[0]===c)||[c,c])[1];

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
  apiKey:"", baseUrl:"https://api.literouter.com/v1", model:"",
  apiProfiles:[{id:"def", name:"LiteRouter (Varsayılan)", baseUrl:"https://api.literouter.com/v1", apiKey:""}],
  activeProfileId:"def",
  singleModel:true, taskModels:{text:"", vision:"", chat:""},
  favModels:[], cachedModels:[], lrCosts:[], lrLastScan:0,
  srcLang:"auto", tgtLang:"tr",
  stream:true, keepScreen:true, tnEnabled:false, clipWatch:true,
  temp:0.3, chunkSize:6000, priceIn:0.15, priceOut:0.60,
  appTheme:"default", animStyle:"fade", lastBackup:0, dailyGoalMins:30,
  navTabs:["text","browser","library","chat","costs","settings"],
  prompts: structuredClone(DEFAULT_PROMPTS), activePromptId:"def",
  glossary:[], glossEnabled:true, bookmarks: structuredClone(DEFAULT_BOOKMARKS),
  tabs:[{id:"tab1",title:"Google",url:"https://www.google.com"}], activeTabId:"tab1",
  bAutoSave:true, history:[], highlights:[], dailyActivity:{},
  mangaStyle:{dir:"webtoon", font:"system-ui, -apple-system, sans-serif", scale:1.0, alpha:0.98, border:"#8b5cf6"},
  stats:{totalSecs:0, totalWords:0, streak:0, lastDay:""},
  usage:{reqs:0, inTok:0, outTok:0, totalMs:0},
  reader:{theme:"night", font:"Georgia,serif", size:18, lh:1.8, width:"760px", align:"left",
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
      apiProfiles:raw.apiProfiles?.length?raw.apiProfiles:d.apiProfiles,
      prompts:raw.prompts?.length?raw.prompts:d.prompts, bookmarks:raw.bookmarks||d.bookmarks,
      tabs:raw.tabs?.length?raw.tabs:d.tabs, navTabs:raw.navTabs?.length?raw.navTabs:d.navTabs,
      glossary:raw.glossary||[], history:raw.history||[], highlights:raw.highlights||[], lrCosts:raw.lrCosts||[]};
    if(m.mangaStyle.font) m.mangaStyle.font = m.mangaStyle.font.replace(/['"]/g, "");
    return m;
  } catch { return defaultState(); }
})();

// Görev bazlı model çözücü
function getModelForTask(task="text"){
  if(!S.singleModel && S.taskModels && S.taskModels[task] && S.taskModels[task].trim()) return S.taskModels[task].trim();
  return S.model;
}

// Hata #3 Çözümü: Hafif kaydetme ve gereksiz native senkronizasyonu önleme
let lastNativeSig = "";
function saveState(forceNative=false){
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch(e){ debugLog("ERR","localStorage: "+e.message); }
  const cfg = {
    apiKey:S.apiKey, baseUrl:S.baseUrl, model:getModelForTask("text"),
    visionModel:getModelForTask("vision"), tgtLang:langName(S.tgtLang),
    mangaFont:(S.mangaStyle.font||"system-ui, sans-serif").replace(/['"]/g,""),
    mangaFontScale:S.mangaStyle.scale, mangaBgAlpha:S.mangaStyle.alpha,
    mangaBorder:(S.mangaStyle.border||"#8b5cf6").replace(/['"]/g,"")
  };
  const sig = JSON.stringify(cfg);
  if((forceNative || sig !== lastNativeSig) && isNative() && window.AndroidBridge.syncConfig){
    lastNativeSig = sig;
    window.AndroidBridge.syncConfig(sig);
  }
}

/* ===================== INDEXEDDB KÜTÜPHANE ===================== */
const DB_NAME = "CevirmenAI_Library_v2";
let dbPromise = null;
function openDB(){
  if(dbPromise) return dbPromise;
  dbPromise = new Promise((res,rej)=>{
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => { const db=e.target.result; if(!db.objectStoreNames.contains("books")) db.createObjectStore("books",{keyPath:"id"}); };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  return dbPromise;
}
async function dbAll(){ const db=await openDB(); return new Promise((res,rej)=>{ const r=db.transaction("books","readonly").objectStore("books").getAll(); r.onsuccess=()=>res(r.result||[]); r.onerror=()=>rej(r.error); }); }
async function dbGet(id){ const db=await openDB(); return new Promise((res,rej)=>{ const r=db.transaction("books","readonly").objectStore("books").get(id); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
async function dbPut(obj){ const db=await openDB(); return new Promise((res,rej)=>{ const r=db.transaction("books","readwrite").objectStore("books").put(obj); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); }); }
async function dbDel(id){ const db=await openDB(); return new Promise((res,rej)=>{ const r=db.transaction("books","readwrite").objectStore("books").delete(id); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); }); }

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

function applyThemeAndAnim(){
  document.body.className = `anim-${S.animStyle||"fade"}` + (S.appTheme && S.appTheme!=="default" ? ` th-${S.appTheme}` : "");
  const hdrM = $("#hdrModelBtn");
  if(hdrM) hdrM.textContent = "🤖 " + (S.model ? S.model.split("/").pop() : "Model seç");
  if(isNative() && window.AndroidBridge.setKeepScreenOn) window.AndroidBridge.setKeepScreenOn(!!S.keepScreen);
  if(window.CAI_updateLrBadge) window.CAI_updateLrBadge();
}

function renderBottomNav(){
  const nav = $("#bottomNav"); if(!nav) return;
  const activeId = $(".view.active")?.id?.replace("view-","") || "text";
  const tabs = S.navTabs.map(id => ALL_TABS.find(t=>t.id===id)).filter(Boolean);
  // Gizli sekmeler de erişilebilsin diye her zaman ayarlar veya tümü kaydırılabilir olsun
  nav.innerHTML = tabs.map(t=>`<button data-view="${t.id}" class="${t.id===activeId?"active":""}"><span class="ic">${t.ic}</span><span>${t.label}</span></button>`).join("");
  nav.querySelectorAll("button").forEach(b=>b.onclick=()=>{ haptic("light"); switchView(b.dataset.view); });
}

function switchView(id){
  $$(".view").forEach(v=>v.classList.toggle("active", v.id==="view-"+id));
  $$("#bottomNav button").forEach(b=>b.classList.toggle("active", b.dataset.view===id));
  if(id==="library") renderLibrary();
  if(id==="studio"){ renderGlossary(); renderPromptUI(); renderWrapped(); }
  if(id==="costs" && window.CAI_renderLrCosts) window.CAI_renderLrCosts();
  if(id==="settings") renderSettingsUI();
  if(id==="browser" && isNative() && window.AndroidBridge.getBlockedAdCount){
    const c = window.AndroidBridge.getBlockedAdCount();
    const p = $("#adCountPill"); if(p) p.textContent = `${c} reklam`;
  }
}

/* ===================== AI MOTORU (STREAMING + RETRY + GÖREV MODELİ) ===================== */
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

function buildSystemPrompt(bookId=null){
  const p = S.prompts.find(x=>x.id===S.activePromptId) || S.prompts[0];
  let sys = p.text + `\nKaynak Dil: ${langName(S.srcLang)} | Hedef Dil: ${langName(S.tgtLang)}.`;
  if(S.tnEnabled) sys += "\nGerekli kültürel deyimlerde kısa [ÇN: ...] notu ekle.";
  if(S.glossEnabled && S.glossary.length){
    const activeGloss = S.glossary.filter(g => !g.bookId || g.bookId === "global" || (bookId && g.bookId === bookId));
    if(activeGloss.length){
      sys += "\nZORUNLU TERİM SÖZLÜĞÜ (Bu karşılıkları birebir kullan):\n" + activeGloss.slice(0,120).map(g=>`- ${g.src} => ${g.tgt}`).join("\n");
    }
  }
  return sys;
}

async function callAI({messages, model, task="text", temperature, stream, onDelta, signal}){
  const apiKey = S.apiKey.trim(), baseUrl = S.baseUrl.replace(/\/+$/,"");
  const mdl = model || getModelForTask(task);
  if(!apiKey || !mdl) throw new Error("API Anahtarı veya Model seçilmemiş! Ayarlar'dan ekle.");
  const useStream = stream !== undefined ? stream : !!S.stream;
  const t0 = performance.now();
  let lastErr = null;
  for(let attempt=0; attempt<2; attempt++){
    try{
      const r = await fetch(baseUrl + "/chat/completions", {
        method:"POST", signal,
        headers:{"Content-Type":"application/json","Authorization":"Bearer "+apiKey},
        body:JSON.stringify({model:mdl, messages, temperature: temperature ?? S.temp, stream:useStream})
      });
      if(!r.ok){
        const errTxt = await r.text().catch(()=>"");
        if((r.status===429 || r.status>=500) && attempt===0){ await sleep(1200); continue; }
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
      S.usage.reqs++; S.usage.inTok += Math.round(JSON.stringify(messages).length/4);
      S.usage.outTok += Math.round(out.length/4); S.usage.totalMs += Math.round(performance.now()-t0);
      return out;
    }catch(e){
      lastErr = e;
      if(e.name==="AbortError" || attempt===1) throw e;
      await sleep(1000);
    }
  }
  throw lastErr;
}

// Hata #9 Çözümü: CJK (Çince/Japonca/Korece) için dinamik kalite oranları
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

/* ===================== 1. METİN ÇEVİRİSİ (OCR + DİKTE + TON + 3 ALTERNATİF + SABİTLE) ===================== */
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

let transAbort = null;
async function doTranslate(customSysExtra=null){
  const text = $("#srcText").value.trim();
  if(!text) return toast("Çevrilecek metin yaz");
  if(transAbort){ transAbort.abort(); transAbort=null; return; }
  transAbort = new AbortController();
  const btn = $("#transBtn"), st = $("#transStatus"), prog = $("#transProg"), outEl = $("#outText");
  btn.classList.add("busy"); st.className="status"; st.textContent="Çevriliyor…"; prog.classList.add("on");
  if(!customSysExtra) outEl.textContent = "";
  $("#qualityBox").innerHTML = "";
  try{
    const chunks = splitChunks(text, S.chunkSize);
    let full = "";
    for(let i=0;i<chunks.length;i++){
      prog.firstElementChild.style.width = Math.round(((i)/chunks.length)*100) + "%";
      const sys = buildSystemPrompt() + (customSysExtra ? "\nEK TALİMAT: " + customSysExtra : "");
      let part = "";
      await callAI({
        task:"text", signal:transAbort.signal,
        messages:[{role:"system",content:sys},{role:"user",content:chunks[i]}],
        onDelta:(_, cur) => { part = cur; outEl.textContent = (full ? full + "\n\n" : "") + part; }
      });
      full = full ? full + "\n\n" + part : part;
    }
    prog.firstElementChild.style.width = "100%";
    st.className="status ok"; st.textContent=`Tamamlandı (${full.length} karakter)`;
    haptic("success");
    const issues = detectQualityIssues(text, full);
    if(issues.length) $("#qualityBox").innerHTML = `<div class="pill-tag warn" style="display:block;padding:7px 10px;border-radius:10px">${issues.join("<br>")}</div>`;
    if(!customSysExtra){
      S.history.unshift({id:uid(), src:text.slice(0,500), out:full.slice(0,800), ts:Date.now(), pinned:false});
      if(S.history.length > 60) S.history = S.history.filter((x,i)=>x.pinned || i<50);
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
  try{ const t = isNative() && window.AndroidBridge.getClipboardText ? window.AndroidBridge.getClipboardText() : await navigator.clipboard.readText(); if(t){ $("#srcText").value=t; toast("Yapıştırıldı"); } }catch{ toast("Pano okunamadı"); }
};
$("#clearTextBtn").onclick = () => { $("#srcText").value=""; $("#outText").textContent=""; $("#qualityBox").innerHTML=""; };
$("#copyOutBtn").onclick = () => copyText($("#outText").textContent);
$("#shareOutBtn").onclick = () => shareText("Çeviri", $("#outText").textContent);

// Fotoğraftan OCR Çeviri
$("#ocrImgBtn").onclick = () => $("#ocrImgInput").click();
$("#ocrImgInput").onchange = async e => {
  const f = e.target.files?.[0]; e.target.value=""; if(!f) return;
  const st = $("#transStatus"); st.textContent = "📷 Görselden metin okunuyor ve çevriliyor…";
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
    st.className="status ok"; st.textContent="📷 Görsel OCR tamamlandı!"; haptic("success");
  }catch(err){ st.className="status error"; st.textContent=err.message; }
};

// Sesle Dikte
$("#micBtn").onclick = () => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR) return toast("Bu cihazda tarayıcı ses diktesi desteklenmiyor");
  const rec = new SR(); rec.lang = S.srcLang==="auto" ? "tr-TR" : S.srcLang;
  toast("🎤 Dinleniyor…");
  rec.onresult = ev => { const t = ev.results?.[0]?.[0]?.transcript || ""; if(t){ $("#srcText").value = ($("#srcText").value + " " + t).trim(); toast("Dikte eklendi"); } };
  rec.onerror = () => toast("Ses algılanamadı");
  rec.start();
};

// Ton / Stil Değiştirici Çipler
const TONE_MAP = {
  resmi:"Aynı anlamı çok daha resmi, kurumsal ve kibar bir Türkçe ile yeniden yaz.",
  samimi:"Aynı anlamı daha sıcak, günlük ve samimi bir Türkçe ile yeniden yaz.",
  kisalt:"Anlamı kaybetmeden çok daha kısa ve öz şekilde yeniden yaz.",
  edebi:"Roman kalitesinde, edebi ve akıcı bir üslupla yeniden yaz.",
  sade:"Karmaşık ifadeleri sadeleştir, herkesin tek seferde anlayacağı akıcı dil kullan."
};
$$("#toneChips .chip").forEach(ch => ch.onclick = async () => {
  const cur = $("#outText").textContent.trim(); if(!cur) return toast("Önce bir çeviri yap");
  const st = $("#transStatus"); st.textContent = "✨ Üslup uyarlanıyor…";
  try{
    let out = "";
    await callAI({task:"text", messages:[{role:"system",content:TONE_MAP[ch.dataset.tone]+" Sadece sonucu yaz."},{role:"user",content:cur}], onDelta:(_,c)=>{out=c; $("#outText").textContent=c;}});
    st.className="status ok"; st.textContent="Üslup güncellendi"; haptic("light");
  }catch(e){ st.className="status error"; st.textContent=e.message; }
});

// 3 Alternatif Çeviri
$("#altTransBtn").onclick = async () => {
  const sel = (window.getSelection()+"").trim();
  const target = sel || $("#srcText").value.trim() || $("#outText").textContent.trim();
  if(!target) return toast("Önce metin gir veya cümle seç");
  openModal("altModal");
  $("#altResults").innerHTML = `<div class="meta">⏳ 3 farklı Türkçe alternatif üretiliyor…</div>`;
  try{
    const raw = await callAI({task:"text", stream:false, messages:[
      {role:"system", content:`Verilen metin için ${langName(S.tgtLang)} dilinde 3 farklı doğal çeviri alternatifi üret (1: Doğal/Akıcı, 2: Edebi/Zengin, 3: Kısa/Net). Sadece numaralı liste yaz.`},
      {role:"user", content:target.slice(0,1200)}
    ]});
    const parts = raw.split(/\n(?=\d[\.\)])/).filter(Boolean);
    $("#altResults").innerHTML = parts.map(p=>`<div class="item"><div class="item-body"><div class="item-title">${esc(p.trim())}</div></div><button class="btn small primary">Seç</button></div>`).join("");
    $$("#altResults .btn").forEach((b,i)=>b.onclick=()=>{ $("#outText").textContent = parts[i].replace(/^\d[\.\)]\s*/,"").trim(); closeModal("altModal"); toast("Alternatif uygulandı"); });
  }catch(e){ $("#altResults").innerHTML = `<div class="status error">${esc(e.message)}</div>`; }
};

// Sabit / Favori Çeviri
$("#pinTransBtn").onclick = () => {
  const out = $("#outText").textContent.trim(), src = $("#srcText").value.trim();
  if(!out) return toast("Sabitlenecek çeviri yok");
  S.history.unshift({id:uid(), src:src.slice(0,500), out:out.slice(0,800), ts:Date.now(), pinned:true});
  saveState(); renderHistory(); haptic("light"); toast("⭐ Çeviri sabitlendi!");
};

function renderHistory(){
  const el = $("#histList"); if(!el) return;
  const sorted = [...S.history].sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0) || (b.ts||0)-(a.ts||0));
  if(!sorted.length){ el.innerHTML=`<div class="meta">Henüz çeviri geçmişi yok.</div>`; return; }
  el.innerHTML = sorted.slice(0,25).map(h=>`
    <div class="item">
      <div class="item-body">
        <div class="item-title">${h.pinned?"⭐ ":""}${esc(h.out.slice(0,110))}${h.out.length>110?"…":""}</div>
        <div class="item-sub">${esc(h.src.slice(0,80))}</div>
      </div>
      <button class="btn small" data-pin="${h.id}">${h.pinned?"★":"☆"}</button>
      <button class="btn small" data-load="${h.id}">Aç</button>
    </div>`).join("");
  el.querySelectorAll("[data-pin]").forEach(b=>b.onclick=()=>{ const x=S.history.find(i=>i.id===b.dataset.pin); if(x){x.pinned=!x.pinned; saveState(); renderHistory();} });
  el.querySelectorAll("[data-load]").forEach(b=>b.onclick=()=>{ const x=S.history.find(i=>i.id===b.dataset.load); if(x){$("#srcText").value=x.src; $("#outText").textContent=x.out;} });
}
$("#clearHistBtn").onclick = () => { S.history = S.history.filter(x=>x.pinned); saveState(); renderHistory(); toast("Sabitlenmeyen geçmiş temizlendi"); };

// Model Yarışı
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

/* ===================== 2. TARAYICI & CANLI MANGA KÖPRÜSÜ ===================== */
function openRealBrowser(url){
  const u = (url||"").trim() || "https://www.google.com";
  if(isNative() && window.AndroidBridge.openBrowser) window.AndroidBridge.openBrowser(u);
  else window.open(u, "_blank");
}
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
}
$("#bGoBtn").onclick = () => { const u=$("#bUrlInput").value.trim()||"https://www.google.com"; const t=S.tabs.find(x=>x.id===S.activeTabId); if(t){t.url=u;t.title=u.replace(/^https?:\/\//,"").slice(0,20);} saveState(); renderBrowserUI(); openRealBrowser(u); };
$("#addTabBtn").onclick = () => { const id=uid(); S.tabs.push({id,title:"Yeni Sekme",url:"https://www.google.com"}); S.activeTabId=id; saveState(); renderBrowserUI(); openRealBrowser("https://www.google.com"); };
$("#addBmBtn").onclick = () => { const u=$("#bUrlInput").value.trim(); if(!u) return toast("URL yaz"); const n=prompt("Yer imi adı:", u.replace(/^https?:\/\//,"").split("/")[0]); if(n){S.bookmarks.push({id:uid(),name:n,url:u}); saveState(); renderBrowserUI();} };
$("#bAutoSave").onchange = e => { S.bAutoSave = e.target.checked; saveState(); };

let lastExtractedChapter = null;
window.__onNativePageExtract = async (t64, u64, c64, b64) => {
  try{
    const title = b64DecodeUtf8(t64), url = b64DecodeUtf8(u64), cover = b64DecodeUtf8(c64);
    const blocks = JSON.parse(b64DecodeUtf8(b64));
    if(!blocks.length) return window.AndroidBridge.setBrowserStatus("Sayfada çevrilecek metin bulunamadı.");
    window.AndroidBridge.setBrowserStatus(`🌐 ${blocks.length} paragraf çevriliyor…`);
    const map = {}, batchSize = 18;
    for(let i=0;i<blocks.length;i+=batchSize){
      const sl = blocks.slice(i, i+batchSize);
      const payload = sl.map(b=>`[${b.i}] ${b.t}`).join("\n");
      const out = await callAI({task:"text", stream:false, messages:[
        {role:"system", content:buildSystemPrompt()+"\nHer satırın başındaki [sayı] etiketini AYNEN koru ve satırları hedef dile çevir."},
        {role:"user", content:payload}
      ]});
      out.split("\n").forEach(ln=>{ const m=ln.match(/^\[(\d+)\]\s*(.+)$/); if(m) map[m[1]]=m[2].trim(); });
      window.AndroidBridge.applyPageTranslations(JSON.stringify(map));
      window.AndroidBridge.setBrowserStatus(`🌐 Çevriliyor: ${Math.min(blocks.length, i+batchSize)}/${blocks.length}`);
    }
    window.AndroidBridge.setBrowserStatus("✅ Sayfa çevirisi tamamlandı!");
    const origText = blocks.map(b=>b.t).join("\n\n");
    const trText = blocks.map(b=>map[b.i]||b.t).join("\n\n");
    lastExtractedChapter = {title, url, cover, origText, trText};
    if(S.bAutoSave) await saveWebChapterToLibrary(lastExtractedChapter);
  }catch(e){ window.AndroidBridge?.setBrowserStatus("❌ " + e.message); }
};

async function saveWebChapterToLibrary(ch){
  const host = ch.url.replace(/^https?:\/\//,"").split("/")[0];
  const all = await dbAll();
  let book = all.find(b => !b.deletedAt && b.sourceHost === host && b.title.toLowerCase() === (ch.bookTitle||host).toLowerCase());
  if(!book){
    book = {id:uid(), title:ch.bookTitle||ch.title.slice(0,42), author:host, format:"WEB", sourceHost:host, sourceUrl:ch.url, cover:ch.cover||"", tags:["Web Novel"], curChap:0, lastRead:Date.now(),
      chapters:[{title:ch.title, text:ch.origText, trText:ch.trText, url:ch.url}]};
  } else {
    const ex = book.chapters.findIndex(c=>c.url===ch.url);
    if(ex>=0){ book.chapters[ex].trText = ch.trText; book.curChap = ex; }
    else { book.chapters.push({title:ch.title, text:ch.origText, trText:ch.trText, url:ch.url}); book.curChap = book.chapters.length-1; }
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

// Manga URL+Scroll Önbelleği
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
    window.AndroidBridge.setBrowserStatus(`✅ ${bubbles.length} baloncuk çevrildi (Sürükle / Basılı tut: Orijinal / Çift tık: Düzenle)`);
  }catch(e){ window.AndroidBridge?.setBrowserStatus("❌ Manga hatası: " + e.message); }
};

async function analyzeMangaImageB64(imgB64){
  const raw = await callAI({
    task:"vision", stream:false, temperature:0.2,
    messages:[
      {role:"system", content:`Sen profesyonel bir manga/manhwa çevirmenisin. Görseldeki tüm konuşma balonlarını, anlatıcı kutularını ve ses efektlerini bul, ${langName(S.tgtLang)} diline doğal ve kısa çevir. SADECE geçerli JSON dizisi dön: [{"x":10,"y":15,"w":28,"h":12,"type":"speech","orig":"orijinal","tr":"çeviri"}]. Koordinatlar 0-100 yüzdelik olsun. type: speech | thought | narration | sfx.`},
      {role:"user", content:[{type:"text",text:"Baloncukları tespit et ve çevir."},{type:"image_url",image_url:{url:"data:image/jpeg;base64,"+imgB64}}]}
    ]
  });
  const clean = raw.replace(/```json|```/g,"").trim();
  const s = clean.indexOf("["), e = clean.lastIndexOf("]");
  if(s>=0 && e>s) return JSON.parse(clean.slice(s,e+1));
  return [];
}

window.__onNativeRetranslateBubble = async (id, orig64, prev64) => {
  try{
    const orig = b64DecodeUtf8(orig64), prev = b64DecodeUtf8(prev64);
    const out = await callAI({task:"text", stream:false, messages:[{role:"system",content:`Bu manga baloncuğunu ${langName(S.tgtLang)} diline daha doğal ve akıcı yeniden çevir. Sadece yeni çeviriyi yaz.`},{role:"user",content:`Orijinal: ${orig}\nÖnceki: ${prev}`}]});
    window.AndroidBridge?.updateSingleMangaBubble(id, out.trim());
  }catch{}
};

/* ===================== 3. AKILLI KÜTÜPHANE & FORMAT İMPORT (ÇEVRİMDIŞI PDF.JS!) ===================== */
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

// Hafif ZIP okuyucu (EPUB, DOCX, CBZ için sıfır bağımlılık)
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

async function importBookFile(file){
  const name = file.name || "Kitap", ext = name.split(".").pop().toLowerCase(), title = name.replace(/\.[^.]+$/,"");
  const buf = await file.arrayBuffer();
  let chapters = [], cover = "", isManga = false;
  if(ext==="txt"){
    const txt = new TextDecoder().decode(buf);
    const parts = splitChunks(txt, 14000);
    chapters = parts.map((t,i)=>({title:`Bölüm ${i+1}`, text:t}));
  } else if(ext==="html"||ext==="htm"){
    const doc = new DOMParser().parseFromString(new TextDecoder().decode(buf),"text/html");
    chapters = [{title:doc.title||title, text:(doc.body?.innerText||"").trim()}];
  } else if(ext==="fb2"){
    const doc = new DOMParser().parseFromString(new TextDecoder().decode(buf),"text/xml");
    const secs = [...doc.querySelectorAll("body section")];
    chapters = (secs.length?secs:[doc.body||doc.documentElement]).map((s,i)=>({title:s.querySelector("title")?.textContent?.trim()||`Bölüm ${i+1}`, text:s.textContent.trim()}));
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
    const covE = ents.find(e=>/cover.*\.(jpe?g|png|webp)$/i.test(e.name));
    if(covE){ const u8=await readZipEntry(covE); cover="data:image/jpeg;base64,"+btoa(String.fromCharCode(...u8)); }
  } else if(ext==="cbz"){
    isManga = true;
    const ents = (await unzipEntries(buf)).filter(e=>/\.(jpe?g|png|webp)$/i.test(e.name)).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
    const pages = [];
    for(const e of ents){
      const u8 = await readZipEntry(e);
      let bin=""; for(let i=0;i<u8.length;i++) bin+=String.fromCharCode(u8[i]);
      const mime = e.name.endsWith(".png")?"image/png":"image/jpeg";
      pages.push(`data:${mime};base64,${btoa(bin)}`);
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
        // Resimli / Manga PDF sayfası -> Canvas'a çizip canlı manga çevirisine hazırla
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
  const book = {id:uid(), title, author:"", format:ext.toUpperCase(), isManga, cover, tags:[isManga?"Manga":ext.toUpperCase()], curChap:0, lastRead:Date.now(), chapters};
  await dbPut(book);
  renderLibrary(); haptic("success"); toast(`📚 "${title}" kütüphaneye eklendi!`);
}

window.__onNativeFileImport = async (fn64, b64) => {
  const fname = b64DecodeUtf8(fn64), bin = atob(b64), u8 = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i);
  await importBookFile(new File([u8], fname));
};

$("#importBookBtn").onclick = () => $("#bookFileInput").click();
$("#bookFileInput").onchange = async e => { for(const f of [...(e.target.files||[])]) await importBookFile(f); e.target.value=""; };

let activeLibTag = "Tümü";
async function renderLibrary(){
  updateDailyGoalUI();
  const grid = $("#bookGrid"), tagBar = $("#libTagBar"); if(!grid) return;
  const all = (await dbAll()).filter(b=>!b.deletedAt).sort((a,b)=>(b.lastRead||0)-(a.lastRead||0));
  const tags = ["Tümü", ...new Set(all.flatMap(b=>b.tags||[]))];
  if(tagBar){
    tagBar.innerHTML = tags.map(t=>`<span class="chip ${t===activeLibTag?"active":""}" data-tag="${esc(t)}">${esc(t)}</span>`).join("");
    tagBar.querySelectorAll("[data-tag]").forEach(c=>c.onclick=()=>{ activeLibTag=c.dataset.tag; renderLibrary(); });
  }
  const q = ($("#libSearch")?.value||"").toLowerCase().trim();
  const list = all.filter(b => (activeLibTag==="Tümü" || (b.tags||[]).includes(activeLibTag)) && (!q || b.title.toLowerCase().includes(q) || (b.tags||[]).join(" ").toLowerCase().includes(q)));
  if(!list.length){ grid.innerHTML = `<div class="card" style="grid-column:1/-1"><div class="meta">Kütüphanede kitap yok. Yukarıdan EPUB/PDF/CBZ ekle veya Web Novel Seri İndirici'yi kullan!</div></div>`; return; }
  grid.innerHTML = list.map(b=>{
    const pct = Math.round((((b.curChap||0)+1)/Math.max(1,b.chapters.length))*100);
    return `<div class="book-card" data-open="${b.id}">
      <div class="book-cov">${b.cover?`<img src="${b.cover}" loading="lazy">`:`<span class="ph">${b.isManga?"🖼️":"📖"}</span>`}<span class="book-badge">${esc(b.format||"KİTAP")}</span></div>
      <div class="book-info">
        <div class="book-title">${esc(b.title)}</div>
        <div class="book-meta">Bölüm ${(b.curChap||0)+1}/${b.chapters.length}</div>
        <div class="book-prog"><div style="width:${pct}%"></div></div>
      </div>
      <div class="book-acts">
        <button class="btn small" data-tagb="${b.id}" title="Etiket">🏷️</button>
        <button class="btn small danger" data-delb="${b.id}" title="Çöpe At">🗑️</button>
      </div>
    </div>`;
  }).join("");
  grid.querySelectorAll("[data-open]").forEach(c=>c.onclick=e=>{
    if(e.target.closest("[data-delb]") || e.target.closest("[data-tagb]")) return;
    openBookReader(c.dataset.open);
  });
  grid.querySelectorAll("[data-tagb]").forEach(b=>b.onclick=async e=>{
    e.stopPropagation(); const bk=await dbGet(b.dataset.tagb); if(!bk) return;
    const t = prompt("Etiketleri virgülle ayırarak yaz (ör. LitRPG, Xianxia):", (bk.tags||[]).join(", "));
    if(t!==null){ bk.tags = t.split(",").map(x=>x.trim()).filter(Boolean); await dbPut(bk); renderLibrary(); }
  });
  grid.querySelectorAll("[data-delb]").forEach(b=>b.onclick=async e=>{
    e.stopPropagation(); const bk=await dbGet(b.dataset.delb); if(!bk) return;
    bk.deletedAt = Date.now(); await dbPut(bk); renderLibrary(); toast("7 günlük çöp kutusuna taşındı");
  });
}
$("#libSearch")?.addEventListener("input", renderLibrary);

function updateDailyGoalUI(){
  const mins = Math.floor((S.dailyActivity[todayKey()] || 0) / 60);
  const goal = S.dailyGoalMins || 30;
  const pct = Math.min(100, Math.round((mins/goal)*100));
  if($("#dailyGoalTxt")) $("#dailyGoalTxt").textContent = `${mins} / ${goal} dk (%${pct})`;
  if($("#dailyGoalBar")) $("#dailyGoalBar").style.width = pct + "%";
}
$("#editGoalBtn").onclick = () => {
  const g = prompt("Günlük okuma hedefin (dakika):", S.dailyGoalMins || 30);
  if(g && Number(g)>0){ S.dailyGoalMins = Number(g); saveState(); updateDailyGoalUI(); }
};

/* ===================== 4. TAM EKRAN OKUYUCU (TAP ZONES + PREFETCH + BIONIC + CANLI CBZ/PDF MANGA + TTS) ===================== */
const R = { book:null, chapIdx:0, readTimer:null, pendingSecs:0, autoScrollId:null, prefetchingIdx:-1, ttsSpeaking:false };

function applyReaderPrefs(){
  const r = $("#reader"), body = $("#rBody"), p = S.reader;
  r.className = "open" + (p.theme && p.theme!=="night" ? " rt-"+p.theme : "");
  body.style.fontFamily = p.font || "Georgia,serif";
  body.style.fontSize = (p.size || 18) + "px";
  body.style.lineHeight = p.lh || 1.8;
  $("#rRuler").classList.toggle("on", !!p.ruler);
  $("#rThemeSel").value = p.theme; $("#rFontSel").value = p.font;
  $("#rSizeRange").value = p.size; $("#rSizeVal").textContent = p.size;
  $("#rLhRange").value = p.lh; $("#rLhVal").textContent = p.lh;
  $("#rDlgColorToggle").checked = !!p.dlgColor;
  $("#rBionicToggle").checked = !!p.bionic;
  $("#rRulerToggle").checked = !!p.ruler;
  $("#rPrefetchToggle").checked = !!p.prefetch;
  $("#rTtsContToggle").checked = !!p.ttsCont;
  $("#rTtsRate").value = p.ttsRate || 1.0; $("#rTtsRateVal").textContent = p.ttsRate || 1.0;
  $("#rScrollSpd").value = p.scrollSpeed || 3; $("#rScrollSpdVal").textContent = p.scrollSpeed || 3;
}

function toBionicHtml(html){
  if(!S.reader.bionic) return html;
  return html.replace(/(>[^<]+<)/g, seg => seg.replace(/\b([A-Za-zÇĞİÖŞÜçğıöşü]{3,})\b/g, w => {
    const k = Math.ceil(w.length * 0.45);
    return `<b class="bionic-b">${w.slice(0,k)}</b>${w.slice(k)}`;
  }));
}

async function openBookReader(bookId, chapIdx=null){
  const book = await dbGet(bookId); if(!book) return toast("Kitap bulunamadı");
  R.book = book; R.chapIdx = chapIdx !== null ? chapIdx : (book.curChap || 0);
  if(R.chapIdx >= book.chapters.length) R.chapIdx = 0;
  applyReaderPrefs();
  if(isNative() && window.AndroidBridge.setReaderOpen) window.AndroidBridge.setReaderOpen(true);
  renderCurrentChapter();
  // Hata #3 Çözümü: Bellekte biriktir, her 30 saniyede bir veya çıkışta kaydet!
  clearInterval(R.readTimer); R.pendingSecs = 0;
  R.readTimer = setInterval(()=>{
    R.pendingSecs += 5;
    S.stats.totalSecs += 5;
    S.dailyActivity[todayKey()] = (S.dailyActivity[todayKey()] || 0) + 5;
    if(R.pendingSecs >= 30){ R.pendingSecs = 0; saveState(); }
  }, 5000);
}

function closeReader(){
  clearInterval(R.readTimer); stopAutoScroll();
  if(window.speechSynthesis) speechSynthesis.cancel(); R.ttsSpeaking=false;
  if(R.pendingSecs > 0){ R.pendingSecs = 0; saveState(); }
  $("#reader").classList.remove("open","bars-hidden");
  if(isNative() && window.AndroidBridge.setReaderOpen) window.AndroidBridge.setReaderOpen(false);
  if(isNative() && window.AndroidBridge.setBrightness) window.AndroidBridge.setBrightness(-1);
  renderLibrary();
}

function renderCurrentChapter(){
  const book = R.book, ch = book.chapters[R.chapIdx]; if(!ch) return;
  book.curChap = R.chapIdx; book.lastRead = Date.now(); dbPut(book);
  $("#rBookTitle").textContent = book.title;
  $("#rChapMeta").textContent = `${ch.title || ("Bölüm "+(R.chapIdx+1))} (${R.chapIdx+1}/${book.chapters.length})`;
  const body = $("#rBody");
  $("#rPrefetchBadge").style.display = (book.chapters[R.chapIdx+1]?.trText) ? "inline-flex" : "none";

  // Yerel CBZ / Resimli PDF Manga Görünümü (Kalıcı Baloncuk Çevirisi!)
  if(ch.images && ch.images.length){
    $("#rTransBtn").textContent = "💬 Sayfaları Çevir";
    body.innerHTML = `<div class="r-title">${esc(ch.title)}</div>` + ch.images.map((src,idx)=>`
      <div class="cbz-page-wrap" data-pidx="${idx}">
        <img src="${src}" loading="lazy">
        <button class="cbz-tr-btn" data-trpage="${idx}">${ch.mangaBubbles?.[idx]?.length ? "✅ Yeniden Çevir" : "💬 Çevir"}</button>
        <div class="lib-mb-layer" id="libMb_${idx}"></div>
      </div>`).join("");
    ch.images.forEach((_,idx)=>{ if(ch.mangaBubbles?.[idx]?.length) renderLocalMangaBubbles(idx, ch.mangaBubbles[idx]); });
    body.querySelectorAll("[data-trpage]").forEach(b=>b.onclick=ev=>{ ev.stopPropagation(); translateLocalMangaPage(Number(b.dataset.trpage)); });
  } else {
    $("#rTransBtn").textContent = ch.trText ? "✅ Çevrildi" : "🌐 Çevir";
    const rawText = ch.trText || ch.text || "";
    const paras = rawText.split(/\n+/).map(x=>x.trim()).filter(Boolean);
    let html = `<div class="r-title">${esc(ch.title || ("Bölüm "+(R.chapIdx+1)))}</div>` + paras.map((p,i)=>`<p data-pi="${i}">${esc(p)}</p>`).join("");
    // Kitaba ait vurguları uygula
    const hls = S.highlights.filter(h=>h.bookId===book.id && h.chapIdx===R.chapIdx);
    hls.forEach(h=>{ if(h.text.length>2) html = html.replace(esc(h.text), `<span class="hl-mark">${esc(h.text)}</span>`); });
    html = toBionicHtml(html);
    body.innerHTML = html;
  }
  $("#rScroll").scrollTop = 0;
  $("#rProgFill").style.width = "0%"; $("#rJumpSlider").value = 0; $("#rPctTxt").textContent = "0%";
}

function renderLocalMangaBubbles(pageIdx, bubbles){
  const layer = $(`#libMb_${pageIdx}`); if(!layer) return;
  layer.innerHTML = bubbles.map(b=>`
    <div class="lib-mb" style="left:${b.x}%;top:${b.y}%;width:${Math.max(16,b.w)}%;min-height:${Math.max(5,b.h)}%;font-size:${Math.round(11.5*(S.mangaStyle.scale||1))}px;border-color:${S.mangaStyle.border||"#8b5cf6"}">${esc(b.tr)}</div>
  `).join("");
  layer.querySelectorAll(".lib-mb").forEach(el=>{
    el.addEventListener("touchstart", ()=>{ el.style.opacity="0.12"; }, {passive:true});
    el.addEventListener("touchend", ()=>{ el.style.opacity="1"; });
  });
}

async function translateLocalMangaPage(pageIdx){
  const ch = R.book.chapters[R.chapIdx]; if(!ch?.images?.[pageIdx]) return;
  const btn = $(`[data-trpage="${pageIdx}"]`);
  if(btn) btn.textContent = "⏳ Çevriliyor…";
  try{
    const b64 = ch.images[pageIdx].split(",")[1];
    const bubbles = await analyzeMangaImageB64(b64);
    if(!ch.mangaBubbles) ch.mangaBubbles = {};
    ch.mangaBubbles[pageIdx] = bubbles;
    await dbPut(R.book);
    renderLocalMangaBubbles(pageIdx, bubbles);
    if(btn) btn.textContent = `✅ ${bubbles.length} baloncuk`;
    haptic("success");
  }catch(e){ if(btn) btn.textContent = "❌ Hata"; toast(e.message); }
}

async function translateChapterAt(idx, silent=false){
  const book = R.book, ch = book?.chapters?.[idx];
  if(!ch || ch.images?.length) return;
  if(ch.trText && silent) return;
  const btn = $("#rTransBtn");
  if(!silent && btn) btn.textContent = "⏳ Çevriliyor…";
  try{
    const chunks = splitChunks(ch.text || "", S.chunkSize);
    let out = "";
    for(const ck of chunks){
      const part = await callAI({task:"text", stream:false, messages:[{role:"system",content:buildSystemPrompt(book.id)},{role:"user",content:ck}]});
      out = out ? out + "\n\n" + part : part;
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

// Okuyucu Scroll + %60 Ön-Çeviri (Zero-Wait Prefetch)
$("#rScroll").addEventListener("scroll", () => {
  const el = $("#rScroll"), max = Math.max(1, el.scrollHeight - el.clientHeight);
  const pct = Math.min(100, Math.round((el.scrollTop / max) * 100));
  $("#rProgFill").style.width = pct + "%";
  $("#rJumpSlider").value = pct;
  $("#rPctTxt").textContent = pct + "%";
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

// Dokunmatik Bölgeler (Tap Zones) + Sol Kenar Parlaklık Jesti
let brStartY=0, brActive=false, curBright=0.5, brightTimer=null;
$("#rScroll").addEventListener("touchstart", e => {
  if(e.touches.length===1 && e.touches[0].clientX < 38){ brActive=true; brStartY=e.touches[0].clientY; }
  else brActive=false;
}, {passive:true});
$("#rScroll").addEventListener("touchmove", e => {
  if(!brActive) return;
  const dy = brStartY - e.touches[0].clientY; brStartY = e.touches[0].clientY;
  curBright = Math.max(0.05, Math.min(1.0, curBright + dy / 320));
  if(isNative() && window.AndroidBridge.setBrightness) window.AndroidBridge.setBrightness(curBright);
  const hud = $("#rBrightHud"); hud.textContent = `☀️ %${Math.round(curBright*100)}`; hud.style.display="block";
  clearTimeout(brightTimer); brightTimer = setTimeout(()=>hud.style.display="none", 900);
}, {passive:true});
$("#rScroll").addEventListener("click", e => {
  if(window.getSelection()?.toString().trim() || e.target.closest("button,.lib-mb")) return;
  const w = window.innerWidth, x = e.clientX, el = $("#rScroll");
  if(x > w*0.28 && x < w*0.72) $("#reader").classList.toggle("bars-hidden");
  else if(x >= w*0.72) el.scrollBy({top: el.clientHeight*0.82, behavior:"smooth"});
  else el.scrollBy({top: -el.clientHeight*0.82, behavior:"smooth"});
});

window.__onVolumeKey = dir => {
  const el = $("#rScroll"); if(!el) return;
  el.scrollBy({top: dir==="down" ? el.clientHeight*0.82 : -el.clientHeight*0.82, behavior:"smooth"});
};

// Bölüm İçi Arama
$("#rSearchBtn").onclick = () => { $("#rSearchBar").classList.toggle("open"); $("#rSearchInput").focus(); };
$("#rSearchClose").onclick = () => $("#rSearchBar").classList.remove("open");
$("#rSearchGo").onclick = () => {
  const q = $("#rSearchInput").value.trim().toLowerCase(); if(!q) return;
  const p = $$("#rBody p").find(el => el.textContent.toLowerCase().includes(q));
  if(p){ p.scrollIntoView({behavior:"smooth",block:"center"}); p.classList.add("tts-active"); setTimeout(()=>p.classList.remove("tts-active"), 1800); }
  else toast("Bu bölümde bulunamadı");
};

// Oto-Kaydırma & Bölüm Navigasyonu
function stopAutoScroll(){ clearInterval(R.autoScrollId); R.autoScrollId=null; $("#rAutoScrollBtn").classList.remove("primary"); }
$("#rAutoScrollBtn").onclick = () => {
  if(R.autoScrollId){ stopAutoScroll(); return; }
  $("#rAutoScrollBtn").classList.add("primary");
  R.autoScrollId = setInterval(()=>$("#rScroll").scrollTop += (S.reader.scrollSpeed || 3), 35);
};
$("#rCloseBtn").onclick = closeReader;
$("#rPrevBtn").onclick = () => { if(R.chapIdx>0){ R.chapIdx--; renderCurrentChapter(); } };
$("#rNextBtn").onclick = () => { if(R.book && R.chapIdx<R.book.chapters.length-1){ R.chapIdx++; renderCurrentChapter(); } };
$("#rSetBtn").onclick = () => openModal("rSetModal");
$("#rChapsBtn").onclick = () => {
  if(!R.book) return;
  $("#chapList").innerHTML = R.book.chapters.map((c,i)=>`<div class="item" data-ci="${i}" style="${i===R.chapIdx?"border-color:var(--primary)":""}"><div class="item-body"><div class="item-title">${i+1}. ${esc(c.title||"Bölüm "+(i+1))}</div><div class="item-sub">${c.trText?"✅ Çevrildi":""}</div></div></div>`).join("");
  $$("#chapList [data-ci]").forEach(el=>el.onclick=()=>{ R.chapIdx=Number(el.dataset.ci); renderCurrentChapter(); closeModal("chapModal"); });
  openModal("chapModal");
};

// Seçim Çubuğu + Alıntı Kartı (PNG)
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
    const out = await callAI({task:"text", stream:false, messages:[{role:"system",content:`Metni ${langName(S.tgtLang)} diline çevir. Sadece çeviriyi yaz.`},{role:"user",content:curReaderSel}]});
    alert("🌐 Çeviri:\n\n" + out);
  }catch(e){ toast(e.message); }
};
$("#selHlBtn").onclick = () => {
  if(!R.book || !curReaderSel) return;
  S.highlights.unshift({id:uid(), bookId:R.book.id, bookTitle:R.book.title, chapIdx:R.chapIdx, text:curReaderSel, ts:Date.now()});
  saveState(); renderCurrentChapter(); haptic("light"); toast("🖍️ Vurgulandı!");
};
$("#selGlossBtn").onclick = () => {
  const tr = prompt(`"${curReaderSel}" için Türkçe sözlük karşılığı:`);
  if(tr){ S.glossary.unshift({id:uid(), src:curReaderSel, tgt:tr.trim(), bookId:R.book?.id||"global"}); saveState(); toast("📖 Kitap sözlüğüne eklendi!"); }
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

// Okuyucu Ayar Eventleri
$("#rThemeSel").onchange = e => { S.reader.theme=e.target.value; saveState(); applyReaderPrefs(); };
$("#rFontSel").onchange = e => { S.reader.font=e.target.value; saveState(); applyReaderPrefs(); };
$("#rSizeRange").oninput = e => { S.reader.size=Number(e.target.value); saveState(); applyReaderPrefs(); };
$("#rLhRange").oninput = e => { S.reader.lh=Number(e.target.value); saveState(); applyReaderPrefs(); };
$("#rBionicToggle").onchange = e => { S.reader.bionic=e.target.checked; saveState(); renderCurrentChapter(); };
$("#rRulerToggle").onchange = e => { S.reader.ruler=e.target.checked; saveState(); applyReaderPrefs(); };
$("#rPrefetchToggle").onchange = e => { S.reader.prefetch=e.target.checked; saveState(); };
$("#rTtsContToggle").onchange = e => { S.reader.ttsCont=e.target.checked; saveState(); };
$("#rTtsRate").oninput = e => { S.reader.ttsRate=Number(e.target.value); $("#rTtsRateVal").textContent=e.target.value; saveState(); };
$("#rScrollSpd").oninput = e => { S.reader.scrollSpeed=Number(e.target.value); $("#rScrollSpdVal").textContent=e.target.value; saveState(); };

// Nerde Kalmıştım & EPUB Dışa Aktarım & Uyku Zamanlayıcısı
$("#rRecapBtn").onclick = async () => {
  if(!R.book) return;
  toast("🧠 Özet hazırlanıyor…");
  const prev = R.book.chapters.slice(Math.max(0,R.chapIdx-2), R.chapIdx+1).map(c=>(c.trText||c.text||"").slice(0,1800)).join("\n---\n");
  try{
    const sum = await callAI({task:"chat", stream:false, messages:[{role:"system",content:"Okuyucuya 'Nerde Kalmıştım?' özeti ver. Spoiler vermeden son olayları 5 maddede Türkçe özetle."},{role:"user",content:prev}]});
    alert("🧠 Nerde Kalmıştım:\n\n" + sum);
  }catch(e){ toast(e.message); }
};
$("#rSleepBtn").onclick = () => {
  const m = prompt("Kaç dakika sonra okuyucu/TTS kapansın?", "20");
  if(m && Number(m)>0){ toast(`🌙 Uyku zamanlayıcısı: ${m} dk`); setTimeout(()=>{ closeReader(); toast("🌙 Uyku zamanlayıcısı doldu"); }, Number(m)*60000); }
};
$("#rExportEpubBtn").onclick = () => {
  if(!R.book) return;
  const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>${esc(R.book.title)}</title></head><body><h1>${esc(R.book.title)}</h1>` +
    R.book.chapters.map(c=>`<h2>${esc(c.title)}</h2><p>${esc(c.trText||c.text||"").replace(/\n/g,"<br>")}</p>`).join("") + `</body></html>`;
  downloadBlob(new Blob([html],{type:"text/html"}), `${R.book.title.replace(/[^\w]+/g,"_")}.html`);
};

/* ===================== 5. STÜDYO (KİTAP BAZLI SÖZLÜK + PROMPT + WRAPPED) ===================== */
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
}
$("#promptSel").onchange = e => { S.activePromptId=e.target.value; saveState(); renderPromptUI(); };
$("#savePromptBtn").onclick = () => { const cur=S.prompts.find(p=>p.id===S.activePromptId); if(cur){cur.text=$("#promptEdit").value; saveState(); toast("Şablon kaydedildi");} };
$("#addPromptBtn").onclick = () => { const n=prompt("Yeni şablon adı:"); if(!n) return; const id=uid(); S.prompts.push({id,name:n,text:"Metni hedef dile çevir."}); S.activePromptId=id; saveState(); renderPromptUI(); };
$("#delPromptBtn").onclick = () => { const cur=S.prompts.find(p=>p.id===S.activePromptId); if(!cur||cur.builtIn) return toast("Varsayılan şablon silinemez"); S.prompts=S.prompts.filter(p=>p.id!==cur.id); S.activePromptId=S.prompts[0].id; saveState(); renderPromptUI(); };

function renderWrapped(){
  const mins = Math.round((S.stats.totalSecs||0)/60);
  $("#wrappedStats").innerHTML = `<span class="pill-tag">⏱ ${mins} dk okuma</span><span class="pill-tag ok">⚡ ${S.usage.reqs} istek</span><span class="pill-tag warn">🔤 ${Math.round((S.usage.inTok+S.usage.outTok)/1000)}K token</span>`;
  const hm = $("#heatmapGrid"); if(!hm) return;
  let cells = "";
  for(let i=27;i>=0;i--){
    const d = new Date(Date.now()-i*86400000).toISOString().slice(0,10);
    const sec = S.dailyActivity[d] || 0;
    const lv = sec>1800?"hm-4":sec>900?"hm-3":sec>300?"hm-2":sec>0?"hm-1":"";
    cells += `<div class="hm-cell ${lv}" title="${d}: ${Math.round(sec/60)} dk"></div>`;
  }
  hm.innerHTML = cells;
}

/* ===================== 6. AYARLAR, ÇOKLU PROFİL, GÖREV MODELİ & SEÇİCİ YEDEKLEME ===================== */
function renderSettingsUI(){
  const ps = $("#apiProfileSel");
  ps.innerHTML = S.apiProfiles.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("");
  ps.value = S.activeProfileId;
  $("#setBaseUrl").value = S.baseUrl; $("#setApiKey").value = S.apiKey;
  $("#setSingleModel").checked = !!S.singleModel;
  $("#taskModelBox").style.display = S.singleModel ? "none" : "block";
  $("#setModelText").value = S.taskModels.text || "";
  $("#setModelVision").value = S.taskModels.vision || "";
  $("#setModelChat").value = S.taskModels.chat || "";
  $("#cachedModelDatalist").innerHTML = S.cachedModels.map(m=>`<option value="${esc(m.id||m)}">`).join("");
  $("#setTemp").value = S.temp; $("#tempVal").textContent = S.temp;
  $("#setChunk").value = S.chunkSize;
  $("#setPriceIn").value = S.priceIn; $("#setPriceOut").value = S.priceOut;
  $("#setStream").checked = !!S.stream; $("#setTn").checked = !!S.tnEnabled;
  $("#setKeepScreen").checked = !!S.keepScreen; $("#setClipWatch").checked = !!S.clipWatch;
  $("#setTheme").value = S.appTheme; $("#setAnim").value = S.animStyle;
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
$("#saveProfileBtn").onclick = () => {
  const n = prompt("Profil adı (ör. LiteRouter, OpenRouter, Gemini):"); if(!n) return;
  const id = uid(); S.apiProfiles.push({id, name:n, baseUrl:$("#setBaseUrl").value.trim(), apiKey:$("#setApiKey").value.trim()});
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
$("#setSingleModel").onchange = e => { S.singleModel=e.target.checked; saveState(true); renderSettingsUI(); };
$("#setModelText").onchange = e => { S.taskModels.text=e.target.value.trim(); saveState(true); };
$("#setModelVision").onchange = e => { S.taskModels.vision=e.target.value.trim(); saveState(true); };
$("#setModelChat").onchange = e => { S.taskModels.chat=e.target.value.trim(); saveState(true); };
$("#setTemp").oninput = e => { S.temp=Number(e.target.value); $("#tempVal").textContent=S.temp; saveState(); };
$("#setChunk").onchange = e => { S.chunkSize=Number(e.target.value)||6000; saveState(); };
$("#setPriceIn").onchange = e => { S.priceIn=Number(e.target.value)||0; saveState(); renderSettingsUI(); };
$("#setPriceOut").onchange = e => { S.priceOut=Number(e.target.value)||0; saveState(); renderSettingsUI(); };
$("#setStream").onchange = e => { S.stream=e.target.checked; saveState(); };
$("#setTn").onchange = e => { S.tnEnabled=e.target.checked; saveState(); };
$("#setKeepScreen").onchange = e => { S.keepScreen=e.target.checked; saveState(); applyThemeAndAnim(); };
$("#setClipWatch").onchange = e => { S.clipWatch=e.target.checked; saveState(); };
$("#setTheme").onchange = e => { S.appTheme=e.target.value; saveState(); applyThemeAndAnim(); };
$("#setAnim").onchange = e => { S.animStyle=e.target.value; saveState(); applyThemeAndAnim(); };

// Model Çekme & Modal
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

// Seçici Yedekleme & Geri Yükleme
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

// Manga & Yüzen Çeviri Kontrolleri
$("#startOverlayBtn").onclick = () => isNative() ? window.AndroidBridge.startFloatingOverlay() : toast("Sadece Android APK'da çalışır");
$("#stopOverlayBtn").onclick = () => isNative() && window.AndroidBridge.stopFloatingOverlay();
$("#hdrOverlayBtn").onclick = () => isNative() ? window.AndroidBridge.startFloatingOverlay() : toast("Sadece Android APK'da çalışır");
$("#openMangaBrowserBtn").onclick = () => openRealBrowser("https://mangadex.org");
$("#mDir").value = S.mangaStyle.dir; $("#mFont").value = S.mangaStyle.font; $("#mScale").value = S.mangaStyle.scale; $("#mScaleVal").textContent = S.mangaStyle.scale; $("#mBorder").value = S.mangaStyle.border;
$("#mDir").onchange = e => { S.mangaStyle.dir=e.target.value; saveState(true); };
$("#mFont").onchange = e => { S.mangaStyle.font=e.target.value; saveState(true); };
$("#mScale").oninput = e => { S.mangaStyle.scale=Number(e.target.value); $("#mScaleVal").textContent=e.target.value; saveState(true); };
$("#mBorder").onchange = e => { S.mangaStyle.border=e.target.value; saveState(true); };

// Pano İzleyici & Hata Konsolu
let lastClipSeen = "";
window.__onAppResume = () => {
  if(!S.clipWatch || !isNative() || !window.AndroidBridge.getClipboardText) return;
  const c = (window.AndroidBridge.getClipboardText()||"").trim();
  if(c.length>3 && c.length<2500 && c!==lastClipSeen){
    lastClipSeen = c;
    $("#clipBannerTxt").textContent = "📋 Pano: " + c.slice(0,70);
    $("#clipBanner").classList.add("show");
  }
};
$("#clipBannerGo").onclick = () => { $("#clipBanner").classList.remove("show"); switchView("text"); $("#srcText").value=lastClipSeen; doTranslate(); };
$("#clipBannerClose").onclick = () => $("#clipBanner").classList.remove("show");
$("#hdrDebugBtn").onclick = () => { $("#debugLogs").textContent = DEBUG_LOGS.join("\n") || "Henüz hata kaydı yok."; openModal("debugModal"); };
$("#copyDebugBtn").onclick = () => copyText(DEBUG_LOGS.join("\n"));

// Çöp Kutusu (7 günlük otomatik temizlik)
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

// AI Seri Birleştirme
$("#mergeSeriesBtn").onclick = async () => {
  const books = (await dbAll()).filter(b=>!b.deletedAt);
  if(books.length<2) return toast("Birleştirmek için en az 2 kitap olmalı");
  const groups = new Map();
  books.forEach(b=>{
    const key = b.title.toLowerCase().replace(/(bölüm|chapter|ch\.?|cilt|vol\.?)\s*\d+.*/i,"").trim();
    if(!groups.has(key)) groups.set(key, []);
    groups.get(key).push(b);
  });
  let merged = 0;
  for(const [,arr] of groups){
    if(arr.length<2) continue;
    arr.sort((a,b)=>a.title.localeCompare(b.title,undefined,{numeric:true}));
    const main = arr[0];
    for(let i=1;i<arr.length;i++){ main.chapters.push(...arr[i].chapters); await dbDel(arr[i].id); merged++; }
    await dbPut(main);
  }
  renderLibrary(); toast(merged ? `🧩 ${merged} kitap aynı seride birleştirildi!` : "Benzer isimli seri bulunamadı");
};

// Başlatma
initLangSelects(); applyThemeAndAnim(); renderBottomNav(); renderHistory(); renderBrowserUI(); renderLibrary();
saveState(true);
// 14 gün yedek hatırlatıcısı
if(S.lastBackup && Date.now() - S.lastBackup > 14*86400000) setTimeout(()=>toast("💾 Son yedeğinin üzerinden 14 gün geçti! Ayarlar'dan yedek alabilirsin."), 2500);

window.CAI = {
  $, $$, esc, uid, todayKey, toast, haptic, copyText, openModal, closeModal, debugLog, DEBUG_LOGS,
  getS:()=>S, saveState, callAI, splitChunks, getModelForTask, dbAll, dbGet, dbPut, dbDel,
  openRealBrowser, renderLibrary, openBookReader, renderCurrentChapter, renderPromptUI, renderGlossary, switchView, importBookFile, applyThemeAndAnim, R
};
})();
