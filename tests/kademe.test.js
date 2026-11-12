// Kademe (salondaki en küçük ağırlık artışı) — Playwright mock testleri.
// Çalıştır: node tests/kademe.test.js   (ekran görüntüsü için: SHOTS=klasor node ...)
// Gerçek Supabase'e bağlanmaz; rpc istekleri route mock ile yakalanır. Saat page.clock ile sabitlenir.
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert');
const ROOT=path.join(__dirname,'..'),SHOTS=process.env.SHOTS||'';
const TOKEN='00000000-0000-4000-8000-000000000000';
const PROFIL={ad:'Test',yas:'30',cinsiyet:'Erkek',boy:'180',kilo:'80',bel:'85',boyun:'38',hedef:'Kas',gun:'3',onay:true,
  test:{done:true,skip:false,seviye:{bacak:2,kalca:2,gogus:2,sirt:2,kol:2,omuz:2,omuzMob:2,karin:2},agri:[]}};
// Bugün 16 Kasım 2026 Pazartesi; önceki kayıt 9 Kasım.
const MON='2026-11-16',PREV='2026-11-09';
const ITEMS=[
  {id:'bench',n:'Bench Press',alet:'bar',inc:2.5,s:2,r:'6–10',w0:40},
  {id:'curl',n:'Dambıl Curl',alet:'dambil',inc:1,s:2,r:'12–15',w0:4},
  {id:'cekic',n:'Çekiç Curl',alet:'dambil',inc:1,s:2,r:'12–15',w0:6},
  {id:'yana',n:'Kablo Yana Açış',alet:'kablo',inc:1.25,s:2,r:'12–15',w0:2.5},
  {id:'barfiks',n:'Destekli Barfiks',alet:'destek',s:2,r:'6–10'},
  {id:'face',n:'Lastik Face Pull',alet:'lastik',s:2,r:'12–15'},
  {id:'plank',n:'Plank',s:2,r:'30 sn',w:false}];
const program=(extra)=>Object.assign({start:'2026-11-02',weeks:8,rules:[],blocks:{a:{t:'Ana bölüm',items:ITEMS}},
  days:{1:{title:'Tüm vücut',sessions:{antrenman:['a']}}}},extra||{});
// prev('curl','4',18) → 9 Kasım'da 4 kg × 18/18
const prev=(id,w,n,it,day)=>({[PREV]:Object.assign({items:{['a.'+id]:Object.assign({w,reps:[String(n),String(n)],d:[true,true]},it||{})}},day||{})});
const BILINEN={kademe:{tur:{bar:0,dambil:0,kablo:0,makine:0},hareket:{}}}; // soru çıkmasın: hepsi "Bilmiyorum"
const tur=(o)=>({kademe:{tur:Object.assign({bar:0,dambil:0,kablo:0,makine:0},o),hareket:{}}});

let browser,server,base,failed=0;const errors=[];
async function open(P,opt){
  opt=opt||{};const db=opt.db||{logs:opt.logs||{},settings:opt.settings||{},saves:0,ssaves:0};
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:SHOTS?2:1,colorScheme:opt.scheme||'light',timezoneId:'Europe/Istanbul'});
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(String(e)));page.db=db;
  await page.clock.install({time:new Date(MON+'T10:00:00+03:00')});
  await page.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
  await page.route('**/rest/v1/rpc/**',async r=>{const fn=r.request().url().split('/rpc/')[1];const a=r.request().postDataJSON()||{};
    if(fn==='pt_get')return r.fulfill({json:{profil:PROFIL,program:P,targets:{items:{}},settings:db.settings,logs:db.logs}});
    if(fn==='pt_save_log'){db.logs[a.p_day]=a.p_data;db.saves++;}
    if(fn==='pt_save_settings'){db.settings=a.p_settings;db.ssaves++;}
    return r.fulfill({json:true});});
  await page.goto(base+'/index.html?k='+TOKEN);await page.waitForSelector('.daytitle,.empty:not(:text("Yükleniyor"))');
  return page;
}
const card=(page,name)=>page.locator('article.ex',{hasText:name});
const one=s=>s.replace(/\s+/g,' ').trim();
// Kartın öneri durumu: {up, down, line}
const sug=async(page,name)=>{const c=card(page,name);const t=one(await c.innerText());const u=t.match(/↑ Öneri: ([\d,]+ kg)/),d=t.match(/↓ Destek: ([\d,]+ kg)/);
  return {up:u?u[1]:null,down:d?d[1]:null,line:await c.locator('.sug').count()?one(await c.locator('.sug').innerText()):null};};
const S_=(up,line,down)=>({up:up||null,down:down||null,line:line||null});
const check=async(logs,name,want,settings)=>{const page=await open(program(),{logs,settings:settings||BILINEN});assert.deepEqual(await sug(page,name),want);await page.context().close();};
const ssaved=async(page,n)=>{for(let i=0;i<50&&page.db.ssaves<n;i++)await page.waitForTimeout(100);assert.ok(page.db.ssaves>=n,'ayar kaydedilmedi');};
const noOverflow=async page=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'390 px genişlikte yatay taşma var');
const shot=async(loc,name)=>{if(!SHOTS)return;const page=loc.page();const st=await page.addStyleTag({content:'.tabbar,.timer{display:none!important}header.top{position:static!important}'});
  await loc.screenshot({path:path.join(SHOTS,name+'.png')});await st.evaluate(e=>e.remove());};
async function test(name,fn){try{await fn();console.log('✓ '+name);}catch(e){failed++;console.log('✗ '+name+'\n   '+String(e.message||e).split('\n')[0]);}}

(async()=>{
  server=http.createServer((q,s)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));fs.readFile(f,(e,b)=>{if(e){s.writeHead(404);s.end();}else{s.writeHead(200,{'Content-Type':f.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream'});s.end(b);}});});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch();

  await test('kablo yana açış 2,5 kg (inc 1,25): 15/15 → önce tekrar; 18/18 → ↑ Öneri: 3,75 kg',async()=>{
    await check(prev('yana','2,5',15),'Kablo Yana Açış',S_(null,'Önce tekrarı artır: 18 tekrara çık'));
    await check(prev('yana','2,5',18),'Kablo Yana Açış',S_('3,75 kg'));
  });

  await test('dambıl curl 4 kg (inc 1) × 18/18 → 5 kg; dambıl türü 2 → 6 kg',async()=>{
    await check(prev('curl','4',18),'Dambıl Curl',S_('5 kg'));
    await check(prev('curl','4',15),'Dambıl Curl',S_(null,'Önce tekrarı artır: 18 tekrara çık'));
    await check(prev('curl','4',18),'Dambıl Curl',S_('6 kg'),tur({dambil:2}));
  });

  await test('bench 40 kg (inc 2,5, 6–10) × 10/10 → 42,5 kg; bar kademesi 5: %10 kuralı → önce tekrar, 13/13 → 45 kg',async()=>{
    await check(prev('bench','40',10),'Bench Press',S_('42,5 kg'));
    await check(prev('bench','40',10),'Bench Press',S_(null,'Önce tekrarı artır: 13 tekrara çık'),tur({bar:5}));
    await check(prev('bench','40',13),'Bench Press',S_('45 kg'),tur({bar:5}));
    await check(prev('bench','50',10),'Bench Press',S_('55 kg'),tur({bar:5}));
  });

  await test('sıra: harekete özel → alet türü → programdaki inc → varsayılan',async()=>{
    const st=tur({dambil:2});st.kademe.hareket={curl:2.5};
    await check(prev('curl','4',18),'Dambıl Curl',S_('6,5 kg'),st);
    await check(prev('cekic','6',18),'Çekiç Curl',S_('8 kg'),st);
    // inc yok, tür yok → varsayılan (20 kg altı +2, üstü +2,5)
    const P=program();P.blocks={a:{t:'Ana bölüm',items:[{id:'x',n:'Eski Hareket',s:2,r:'8–12'}]}};
    for(const [w,want] of [['40','42,5 kg'],['10','12 kg']]){const page=await open(P,{logs:prev('x',w,15)});
      assert.deepEqual(await sug(page,'Eski Hareket'),S_(want));assert.equal(await page.locator('.kq,.kad').count(),0,'alet alanı olmayan programda soru/ayar olmamalı');await page.context().close();}
  });

  for(const scheme of ['light','dark'])await test('destek: ilerleme ters → ↓ Destek ('+scheme+')',async()=>{
    const page=await open(program(),{logs:prev('barfiks','30',10),settings:tur({makine:5}),scheme});
    assert.deepEqual(await sug(page,'Destekli Barfiks'),S_(null,null,'25 kg'));
    await noOverflow(page);await shot(card(page,'Destekli Barfiks'),'3-kademe-destek'+(scheme==='dark'?'-koyu':''));await page.context().close();
    await check(prev('barfiks','3',10),'Destekli Barfiks',S_(null,null,'0 kg'),tur({makine:5}));
    await check(prev('barfiks','30',9),'Destekli Barfiks',S_(),tur({makine:5}));
    await check(prev('barfiks','30',10,{rir:0}),'Destekli Barfiks',S_(null,'Bu hafta aynı ağırlık: son sette hiç tekrar kalmamıştı'),tur({makine:5}));
  });

  await test('lastik / diğer: kg önerisi yok, yalnızca tekrar ve kapı mesajları',async()=>{
    await check(prev('face','kırmızı',15),'Lastik Face Pull',S_(null,'Önce tekrarı artır: 18 tekrara çık'));
    await check(prev('face','kırmızı',18),'Lastik Face Pull',S_());
    await check(prev('face','10',18),'Lastik Face Pull',S_());
    await check(prev('face','kırmızı',15,{form:'bozuk'}),'Lastik Face Pull',S_(null,'Bu hafta aynı ağırlık: form bozulmuştu'));
  });

  await test('hafif günde destek azaltılmaz',async()=>{
    const logs=Object.assign(prev('barfiks','30',10),{[MON]:{items:{},hazir:{uyku:2,enerji:4,agri:0,renk:'sari'}}});
    await check(logs,'Destekli Barfiks',S_(null,'Bugün desteği azaltma'),tur({makine:5}));
  });

  for(const scheme of ['light','dark'])await test('soru: türün ilk kartında bir kez sorulur, kaydedilir, yenileyince tekrar çıkmaz ('+scheme+')',async()=>{
    let page=await open(program(),{logs:prev('curl','4',18),scheme});
    assert.deepEqual(await page.locator('.kq').evaluateAll(a=>a.map(e=>e.dataset.kq)),['bar','dambil','kablo'],'her tür için tek soru, yalnız bar/dambıl/makine/kablo');
    const q=card(page,'Dambıl Curl').locator('.kq');assert.equal(one(await q.locator('span').innerText()),'Bu salonda dambıl ağırlıkları kaçar kilo artıyor?');
    assert.deepEqual(await q.locator('button').allInnerTexts(),['1','2','2,5','Bilmiyorum']);
    assert.deepEqual(await card(page,'Bench Press').locator('.kq button').allInnerTexts(),['2,5','5','Bilmiyorum']);
    assert.deepEqual(await card(page,'Kablo Yana Açış').locator('.kq button').allInnerTexts(),['1,25','2,5','5','Bilmiyorum']);
    assert.equal(await card(page,'Çekiç Curl').locator('.kq').count(),0);assert.equal(await card(page,'Destekli Barfiks').locator('.kq').count(),0);
    const small=await page.locator('.kq button,.kad').evaluateAll(a=>a.filter(b=>b.offsetHeight<36||b.offsetWidth<36).length);assert.equal(small,0,'36 px altı dokunma hedefi');
    assert.deepEqual(await sug(page,'Dambıl Curl'),S_('5 kg'));
    await noOverflow(page);await shot(card(page,'Dambıl Curl'),'1-kademe-soru'+(scheme==='dark'?'-koyu':''));
    await q.locator('button',{hasText:/^2$/}).click();await ssaved(page,1);
    assert.deepEqual(page.db.settings.kademe.tur,{dambil:2});assert.equal(page.db.settings.knee,'normal','diğer ayarlar korunmalı');
    assert.equal(await page.locator('.kq[data-kq="dambil"]').count(),0);assert.deepEqual(await sug(page,'Dambıl Curl'),S_('6 kg'));
    // Bilmiyorum → programdaki değer, tekrar sorulmaz
    await card(page,'Bench Press').locator('.kq button',{hasText:'Bilmiyorum'}).click();await ssaved(page,2);
    assert.deepEqual(page.db.settings.kademe.tur,{dambil:2,bar:0});assert.equal(await page.locator('.kq[data-kq="bar"]').count(),0);
    const db=page.db;await page.context().close();
    page=await open(program(),{db,scheme});
    assert.deepEqual(await page.locator('.kq').evaluateAll(a=>a.map(e=>e.dataset.kq)),['kablo']);assert.deepEqual(await sug(page,'Dambıl Curl'),S_('6 kg'));
    assert.equal(one(await card(page,'Dambıl Curl').locator('.kad').innerText()),'kademe: 2 kg');
    await page.context().close();
  });

  await test('bar sorusunda 5 seçilince bench önerisi yeni kademeyle hesaplanır',async()=>{
    const page=await open(program(),{logs:prev('bench','50',10)});assert.deepEqual(await sug(page,'Bench Press'),S_('52,5 kg'));
    await card(page,'Bench Press').locator('.kq button',{hasText:/^5$/}).click();await ssaved(page,1);
    assert.deepEqual(await sug(page,'Bench Press'),S_('55 kg'));assert.equal(page.db.settings.kademe.tur.bar,5);await page.context().close();
  });

  for(const scheme of ['light','dark'])await test('kartta "kademe" ayarı: yalnız o harekete kaydedilir, yenileyince korunur ('+scheme+')',async()=>{
    const logs=prev('curl','4',18);logs[PREV].items['a.cekic']={w:'6',reps:['18','18'],d:[true,true]};
    let page=await open(program(),{logs,settings:tur({dambil:2}),scheme});const g=()=>card(page,'Dambıl Curl');
    assert.equal(one(await g().locator('.kad').innerText()),'kademe: 2 kg');assert.equal(await g().locator('[data-kadbox]').count(),0);
    await g().locator('.kad').click();assert.deepEqual(await g().locator('[data-kadv]').allInnerTexts(),['1','2','2,5']);
    await noOverflow(page);await shot(g(),'2-kademe-ayar'+(scheme==='dark'?'-koyu':''));
    await g().locator('[data-kadv="1"]').click();await ssaved(page,1);
    assert.deepEqual(page.db.settings.kademe.hareket,{curl:1});assert.equal(page.db.settings.kademe.tur.dambil,2);
    assert.equal(await g().locator('[data-kadbox]').count(),0);assert.equal(one(await g().locator('.kad').innerText()),'kademe: 1 kg');
    assert.deepEqual(await sug(page,'Dambıl Curl'),S_('5 kg'));assert.deepEqual(await sug(page,'Çekiç Curl'),S_('8 kg'),'diğer hareket etkilenmemeli');
    const db=page.db;await page.context().close();
    page=await open(program(),{db,scheme});assert.equal(one(await g().locator('.kad').innerText()),'kademe: 1 kg');assert.deepEqual(await sug(page,'Dambıl Curl'),S_('5 kg'));
    // seçili değere tekrar basınca harekete özel ayar kalkar, türün değeri geçerli olur
    await g().locator('.kad').click();assert.equal(await g().locator('[data-kadv][aria-pressed="true"]').innerText(),'1');
    await g().locator('[data-kadv="1"]').click();await ssaved(page,2);assert.deepEqual(db.settings.kademe.hareket,{});assert.deepEqual(await sug(page,'Dambıl Curl'),S_('6 kg'));
    // destekli harekette makine seçenekleri
    await page.context().close();
    page=await open(program(),{logs:prev('barfiks','30',10),settings:BILINEN});const b=card(page,'Destekli Barfiks');
    assert.deepEqual(await sug(page,'Destekli Barfiks'),S_(null,null,'27,5 kg'));await b.locator('.kad').click();
    assert.deepEqual(await b.locator('[data-kadv]').allInnerTexts(),['2,5','5','7']);await b.locator('[data-kadv="7"]').click();await ssaved(page,1);
    assert.deepEqual(await sug(page,'Destekli Barfiks'),S_(null,null,'23 kg'));await page.context().close();
  });

  for(const scheme of ['light','dark'])await test('ağırlık bulma kartında da soru görünür ve kademe kullanılır ('+scheme+')',async()=>{
    const page=await open(program({start:MON,kalibrasyon:{hafta:[1]}}),{scheme});const g=()=>card(page,'Bench Press');
    assert.equal(await g().locator('[data-cal]').count(),1);assert.equal(await g().locator('.kq[data-kq="bar"]').count(),1);
    await noOverflow(page);await shot(g(),'4-kademe-agirlik-bulma'+(scheme==='dark'?'-koyu':''));
    await g().locator('.kq button',{hasText:/^5$/}).click();await ssaved(page,1);assert.equal(await g().locator('.kq').count(),0);
    // 40 kg × 8, 4+ tekrar kalmış → hafif; öneri 5'in katı olmalı
    await g().locator('[data-calw]').fill('40');await g().locator('[data-calr]').fill('8');await g().locator('[data-rir="4"]').click();
    const w=parseFloat((await g().locator('[data-calw]').inputValue()).replace(',','.'));assert.ok(w>40&&w%5===0,'kalibrasyon önerisi 5 kg kademeyle değil: '+w);
    await page.context().close();
  });

  await test('pageerror yok',async()=>assert.deepEqual(errors,[]));
  await browser.close();server.close();
  console.log(failed?failed+' test başarısız':'Tüm testler geçti');process.exit(failed?1:0);
})();
