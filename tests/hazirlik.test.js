// Günlük hazırlık sorusu (yeşil/sarı/kırmızı) — Playwright mock testleri.
// Çalıştır: node tests/hazirlik.test.js   (ekran görüntüsü için: SHOTS=klasor node ...)
// Gerçek Supabase'e bağlanmaz; rpc istekleri route mock ile yakalanır. Saat page.clock ile sabitlenir.
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert');
const ROOT=path.join(__dirname,'..'),SHOTS=process.env.SHOTS||'';
const TOKEN='00000000-0000-4000-8000-000000000000';
const PROFIL={ad:'Test',yas:'30',cinsiyet:'Erkek',boy:'180',kilo:'80',bel:'85',boyun:'38',hedef:'Kas',gun:'3',onay:true,
  test:{done:true,skip:false,seviye:{bacak:2,kalca:2,gogus:2,sirt:2,kol:2,omuz:2,omuzMob:2,karin:2},agri:[]}};
// 16 Kasım 2026 Pazartesi = bugün. Pazartesi dolu, Salı boş seans, Çarşamba programsız, Pazar (dün) dolu.
const MON='2026-11-16',SUN='2026-11-15';
const program=(extra)=>Object.assign({start:'2026-11-09',weeks:8,rules:[],
  blocks:{a:{t:'Ana bölüm',items:[
    {id:'squat',n:'Squat',s:4,r:'8–12',w0:40,inc:2.5},
    {id:'row',n:'Row',s:3,r:'8–12',w0:30,inc:2.5},
    {id:'curl',n:'Curl',s:2,r:'10–12',w0:8,inc:2},
    {id:'plank',n:'Plank',s:2,r:'30 sn',w:false}]}},
  days:{0:{title:'Tüm vücut',sessions:{antrenman:['a']}},1:{title:'Tüm vücut',sessions:{antrenman:['a']}},2:{title:'Dinlenme',sessions:{}}}},extra||{});

let browser,server,base,failed=0;const errors=[];
async function open(P,opt){
  opt=opt||{};const db=opt.db||{logs:opt.logs||{},saves:0};
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:SHOTS?2:1,colorScheme:opt.scheme||'light',timezoneId:'Europe/Istanbul'});
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(String(e)));page.db=db;
  await page.clock.install({time:new Date(MON+'T10:00:00+03:00')});
  await page.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
  await page.route('**/rest/v1/rpc/**',async r=>{const fn=r.request().url().split('/rpc/')[1];const a=r.request().postDataJSON()||{};
    if(fn==='pt_get')return r.fulfill({json:{profil:PROFIL,program:P,targets:{items:{}},settings:{},logs:db.logs}});
    if(fn==='pt_save_log'){db.logs[a.p_day]=a.p_data;db.saves++;}
    return r.fulfill({json:true});});
  await page.goto(base+'/index.html?k='+TOKEN);await page.waitForSelector('.daytitle,.empty:not(:text("Yükleniyor"))');
  return page;
}
const card=(page,name)=>page.locator('article.ex',{hasText:name});
const sets=async page=>{const o=[];for(const n of ['Squat','Row','Curl','Plank'])o.push(await card(page,n).locator('button.set').count());return o;};
const answer=async(page,u,e,a)=>{await page.click(`[data-hz="uyku"][data-v="${u}"]`);await page.click(`[data-hz="enerji"][data-v="${e}"]`);await page.click(`[data-hz="agri"][data-v="${a}"]`);};
const saved=async(page,n)=>{await page.clock.runFor(1500);for(let i=0;i<50&&page.db.saves<n;i++)await page.waitForTimeout(100);assert.ok(page.db.saves>=n,'log kaydedilmedi');};
const txt=async(page,sel)=>(await page.locator(sel).innerText()).replace(/\s+/g,' ').trim();
const noOverflow=async page=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'390 px genişlikte yatay taşma var');
const shot=async(page,name)=>{if(SHOTS)await page.screenshot({path:path.join(SHOTS,name+'.png')});};
async function test(name,fn){try{await fn();console.log('✓ '+name);}catch(e){failed++;console.log('✗ '+name+'\n   '+String(e.message||e).split('\n')[0]);}}

(async()=>{
  server=http.createServer((q,s)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));fs.readFile(f,(e,b)=>{if(e){s.writeHead(404);s.end();}else{s.writeHead(200,{'Content-Type':f.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream'});s.end(b);}});});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch();

  for(const scheme of ['light','dark'])await test('kart: dolu seansta görünür; Yemek, boş gün ve programsız günde görünmez ('+scheme+')',async()=>{
    const page=await open(program(),{scheme});
    assert.equal(await page.locator('#hzCard').count(),1);assert.ok((await txt(page,'#hzCard')).includes('Bugün nasıl hissediyorsun?'));
    assert.deepEqual(await sets(page),[4,3,2,2],'cevapsızken program normal olmalı');assert.equal(await page.locator('#hzBanner').count(),0);
    const small=await page.locator('#hzCard button').evaluateAll(a=>a.filter(b=>b.offsetHeight<36||b.offsetWidth<36).length);assert.equal(small,0,'36 px altı dokunma hedefi');
    await noOverflow(page);await shot(page,'1-hazirlik-kart'+(scheme==='dark'?'-koyu':''));
    await page.click('#seg [data-s="yemek"]');assert.equal(await page.locator('#hzCard,#hzRow').count(),0);
    await page.click('#seg [data-s="antrenman"]');assert.equal(await page.locator('#hzCard').count(),1);
    await page.click('#next');assert.ok((await txt(page,'#view')).includes('Bugün antrenman yok.'));assert.equal(await page.locator('#hzCard,#hzRow').count(),0);
    await page.click('#next');assert.ok((await txt(page,'#view')).includes('Bu gün için program yok.'));assert.equal(await page.locator('#hzCard,#hzRow').count(),0);
    await page.context().close();
  });

  await test('uyku 4, enerji 4, ağrı 2 → Yeşil, setler değişmez',async()=>{
    const page=await open(program());await answer(page,4,4,2);
    assert.equal(await page.locator('#hzCard').count(),0);assert.equal(await txt(page,'#hzRow'),'Hazırlık: Yeşil Değiştir');
    assert.deepEqual(await sets(page),[4,3,2,2]);assert.equal(await page.locator('#hzBanner').count(),0);
    await saved(page,1);const H=page.db.logs[MON].hazir;
    assert.deepEqual([H.uyku,H.enerji,H.agri,H.renk],[4,4,2,'yesil']);assert.ok(!isNaN(Date.parse(H.t)),'t ISO zaman değil');
    await page.context().close();
  });

  for(const scheme of ['light','dark'])await test('uyku 2, enerji 4, ağrı 1 → Sarı: 4→3, 3→2, 2→1, banner; yenileyince korunur; Değiştir ('+scheme+')',async()=>{
    const logs={[MON]:{items:{'a.squat':{w:'40',reps:['10'],d:[true]}}}};
    let page=await open(program(),{logs,scheme});
    // iki cevap: henüz kayıt yok, kart açık
    await page.click('[data-hz="uyku"][data-v="2"]');await page.click('[data-hz="enerji"][data-v="4"]');
    assert.equal(await page.locator('#hzCard').count(),1);assert.deepEqual(await sets(page),[4,3,2,2]);
    await page.click('[data-hz="agri"][data-v="1"]');
    assert.equal(await txt(page,'#hzRow'),'Hazırlık: Sarı Değiştir');assert.deepEqual(await sets(page),[3,2,1,1]);
    const b=await txt(page,'#hzBanner');assert.equal(b,'Bugün hafif gün: setler azaltıldı, ana harekette 3–4 tekrar fazla bırak. Ağırlık artırma.');
    assert.equal(await card(page,'Squat').locator('.dose').innerText(),'3 × 8–12');
    await noOverflow(page);await shot(page,'2-hazirlik-sari'+(scheme==='dark'?'-koyu':''));
    await saved(page,1);const L=page.db.logs[MON];assert.equal(L.hazir.renk,'sari');
    assert.deepEqual(L.items,{'a.squat':{w:'40',reps:['10'],d:[true]}},'mevcut set kaydı bozuldu');
    const db=page.db;await page.context().close();
    // yenileme
    page=await open(program(),{db,scheme});
    assert.equal(await page.locator('#hzCard').count(),0);assert.equal(await txt(page,'#hzRow'),'Hazırlık: Sarı Değiştir');assert.deepEqual(await sets(page),[3,2,1,1]);
    assert.equal(await card(page,'Squat').locator('button.set[aria-pressed="true"]').count(),1);
    // Değiştir → kart önceki cevaplarla açılır, uyku 4 → Yeşil
    await page.click('[data-hzedit]');assert.equal(await page.locator('#hzCard [data-hz="uyku"][aria-pressed="true"]').innerText(),'2');
    await page.click('[data-hz="uyku"][data-v="4"]');assert.equal(await page.locator('#hzCard').count(),1,'düzenlerken kart açık kalmalı');
    assert.deepEqual(await sets(page),[4,3,2,2]);await page.click('[data-hzok]');assert.equal(await txt(page,'#hzRow'),'Hazırlık: Yeşil Değiştir');
    // Geçmiş sekmesi
    await page.click('[data-hzedit]');await page.click('[data-hz="enerji"][data-v="2"]');await page.click('[data-hzok]');
    await page.click('.tabbar [data-t="gecmis"]');assert.ok((await txt(page,'.hist')).includes('hazırlık: sarı'),await txt(page,'.hist'));
    await page.context().close();
  });

  for(const scheme of ['light','dark'])await test('ağrı 6 → Kırmızı: set azaltma ve kırmızı banner ('+scheme+')',async()=>{
    const page=await open(program(),{scheme});await answer(page,4,4,6);
    assert.equal(await txt(page,'#hzRow'),'Hazırlık: Kırmızı Değiştir');assert.deepEqual(await sets(page),[3,2,1,1]);
    const b=await txt(page,'#hzBanner');assert.ok(b.includes('setler azaltıldı')&&b.includes('Ağırlıkları %10 azaltabilirsin. Kendini iyi hissetmiyorsan bugünü atlayabilirsin.'),b);
    await noOverflow(page);await shot(page,'3-hazirlik-kirmizi'+(scheme==='dark'?'-koyu':''));await page.context().close();
  });

  await test('renk eşikleri',async()=>{
    for(const [u,e,a,renk] of [[2,2,0,'Kırmızı'],[1,5,0,'Sarı'],[5,2,0,'Sarı'],[3,3,4,'Sarı'],[3,3,5,'Sarı'],[3,3,3,'Yeşil'],[5,5,10,'Kırmızı']]){
      const page=await open(program());await answer(page,u,e,a);assert.equal(await txt(page,'#hzRow b'),renk,[u,e,a].join('/'));await page.context().close();}
  });

  await test('ağırlık bulma haftasında Sarı: kalibrasyon çalışır, set azaltma uygulanır',async()=>{
    const page=await open(program({start:MON,kalibrasyon:{hafta:[1]}}));
    assert.equal(await page.locator('#calInfo').count(),1);await answer(page,2,4,0);
    const g=card(page,'Row');assert.equal(await g.locator('.dose').innerText(),'hedef 10 tekrar');
    await g.locator('[data-calw]').fill('30');await g.locator('[data-rir="2"]').click();
    assert.equal(await card(page,'Row').locator('.calres').count(),1);assert.equal(await card(page,'Row').locator('button.set').count(),1,'3 set → 2 set: 1 kalan set');
    assert.equal(await card(page,'Plank').locator('button.set').count(),1);
    await saved(page,1);const it=page.db.logs[MON].items['a.row'];assert.equal(it.cal.done,true);assert.equal(page.db.logs[MON].hazir.renk,'sari');
    await page.context().close();
  });

  await test('deload haftasında: önce yarılama, sonra hazırlık azaltması, en az 1 set',async()=>{
    const page=await open(program({deload:2}));assert.deepEqual(await sets(page),[2,2,1,1]);
    await answer(page,2,4,0);assert.deepEqual(await sets(page),[1,1,1,1]);await page.context().close();
  });

  await test('geçmiş gün salt okunur',async()=>{
    const logs={[SUN]:{items:{},hazir:{uyku:2,enerji:3,agri:0,renk:'sari',t:'2026-11-15T07:00:00.000Z'}}};
    const page=await open(program(),{logs});await page.click('#prev');
    assert.equal(await txt(page,'#hzRow'),'Hazırlık: Sarı');assert.equal(await page.locator('[data-hzedit],#hzCard').count(),0);assert.deepEqual(await sets(page),[3,2,1,1]);
    await page.context().close();
    const p2=await open(program());await p2.click('#prev');assert.equal(await p2.locator('#hzCard,#hzRow').count(),0);assert.deepEqual(await sets(p2),[4,3,2,2]);await p2.context().close();
  });

  await test('pageerror yok',async()=>assert.deepEqual(errors,[]));
  await browser.close();server.close();
  console.log(failed?failed+' test başarısız':'Tüm testler geçti');process.exit(failed?1:0);
})();
