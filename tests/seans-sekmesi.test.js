// Seans sekmeleri (tek seanslı programda "Antrenman") — Playwright mock testleri.
// Çalıştır: node tests/seans-sekmesi.test.js   (ekran görüntüsü için: SHOTS=klasor node ...)
// Gerçek Supabase'e bağlanmaz; rpc istekleri route mock ile yakalanır. Saat page.clock ile sabitlenir.
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert');
const ROOT=path.join(__dirname,'..'),SHOTS=process.env.SHOTS||'';
const TOKEN='00000000-0000-4000-8000-000000000000';
const PROFIL={ad:'Test',yas:'30',cinsiyet:'Erkek',boy:'180',kilo:'80',bel:'85',boyun:'38',hedef:'Kas',gun:'3',onay:true,
  test:{done:true,skip:false,seviye:{bacak:2,kalca:2,gogus:2,sirt:2,kol:2,omuz:2,omuzMob:2,karin:2},agri:[]}};
const BLOCKS={a:{t:'A günü',items:[{id:'goblet',n:'Goblet Squat',s:2,r:'8–12',w0:10,inc:2},{id:'plank',n:'Plank',s:2,r:'30 sn',w:false}]},
  b:{t:'B günü',items:[{id:'lat',n:'Lat Pulldown',s:2,r:'10–12',w0:20,inc:2.5}]}};
// 16 Kasım 2026 Pazartesi. days: {gün no: sessions}
const MON='2026-11-16';
const program=(days,extra)=>Object.assign({start:MON,weeks:8,rules:[],blocks:BLOCKS,
  days:Object.fromEntries(Object.entries(days).map(([k,s])=>[k,{title:'Tüm vücut',sessions:s}]))},extra||{});
const YG=()=>program({1:{sabah:['a']},3:{sabah:['b']},5:{sabah:['a']}},{kalibrasyon:{hafta:[1]}});          // yalnız sabah, 3 gün
const ALI=()=>program(Object.fromEntries([0,1,2,3,4,5,6].map(i=>[i,{aksam:['a']}])));                      // yalnız akşam, her gün
const IKI=()=>program({1:{sabah:['a'],aksam:['b']},2:{sabah:['a']},3:{aksam:['b']},4:{sabah:[],aksam:[]}}); // iki seanslı
const YENI=()=>program({1:{antrenman:['a']},3:{antrenman:['b']}});                                         // yeni anahtar

let browser,server,base,failed=0;const errors=[];
async function open(P,hour,opt){
  opt=opt||{};const db={logs:opt.logs||{},saves:0};
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:SHOTS?2:1,colorScheme:opt.scheme||'light',timezoneId:'Europe/Istanbul'});
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(String(e)));page.db=db;
  await page.clock.install({time:new Date(`${opt.date||MON}T${String(hour).padStart(2,'0')}:00:00+03:00`)});
  await page.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
  await page.route('**/rest/v1/rpc/**',async r=>{const fn=r.request().url().split('/rpc/')[1];const a=r.request().postDataJSON()||{};
    if(fn==='pt_get')return r.fulfill({json:{profil:PROFIL,program:P,targets:{items:{}},settings:{},logs:db.logs}});
    if(fn==='pt_save_log'){db.logs[a.p_day]=a.p_data;db.saves++;}
    return r.fulfill({json:true});});
  await page.goto(base+'/index.html?k='+TOKEN);await page.waitForSelector('.daytitle,.empty:not(:text("Yükleniyor"))');
  return page;
}
const seg=page=>page.locator('#seg button:visible').allInnerTexts();
const pressed=page=>page.locator('#seg button[aria-pressed="true"]').innerText();
const has=async(page,name)=>assert.ok(await page.locator('article.ex',{hasText:name}).count()>0,name+' görünmüyor: '+await page.locator('#view').innerText());
const noOverflow=async page=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'390 px genişlikte yatay taşma var');
const shot=async(page,name)=>{if(SHOTS)await page.screenshot({path:path.join(SHOTS,name+'.png')});};
async function test(name,fn){try{await fn();console.log('✓ '+name);}catch(e){failed++;console.log('✗ '+name+'\n   '+String(e.message||e).split('\n')[0]);}}

(async()=>{
  server=http.createServer((q,s)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));fs.readFile(f,(e,b)=>{if(e){s.writeHead(404);s.end();}else{s.writeHead(200,{'Content-Type':f.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream'});s.end(b);}});});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch();

  for(const scheme of ['light','dark'])await test('yalnız sabah (Yg), saat 16:00: seans görünür, sekme "Antrenman" ('+scheme+')',async()=>{
    const page=await open(YG(),16,{scheme});
    assert.deepEqual(await seg(page),['Antrenman','Yemek']);assert.equal(await pressed(page),'Antrenman');
    await has(page,'Goblet Squat');assert.equal(await page.locator('#calInfo').count(),1,'ağırlık bulma bilgisi yok');
    assert.equal(await page.locator('#timer').isVisible(),true);
    await noOverflow(page);await shot(page,'1-tek-seans-antrenman'+(scheme==='dark'?'-koyu':''));
    // Yemek'e gidip dönünce de açılır
    await page.click('#seg [data-s="yemek"]');assert.equal(await page.locator('article.ex').count(),0);assert.equal(await page.locator('#timer').isVisible(),false);
    await page.click('#seg [data-s="antrenman"]');await has(page,'Goblet Squat');
    // Dinlenme günü
    await page.click('#next');assert.ok((await page.locator('#view').innerText()).includes('Bu gün için program yok.'));
    await page.click('#next');await has(page,'Lat Pulldown');
    // Hafta görünümü: tek satır
    await page.click('.tabbar [data-t="hafta"]');const t=await page.locator('#view').innerText();
    assert.ok(t.includes('Antrenman: A günü'),t);assert.ok(!/Sabah:|Akşam:/.test(t),t);
    await noOverflow(page);await shot(page,'2-tek-seans-hafta'+(scheme==='dark'?'-koyu':''));await page.context().close();
  });

  await test('yalnız akşam (Ali - deneme), saat 09:00: seans görünür',async()=>{
    const page=await open(ALI(),9);
    assert.deepEqual(await seg(page),['Antrenman','Yemek']);await has(page,'Goblet Squat');await page.context().close();
  });

  await test('sessions.antrenman anahtarı: seans görünür; boş günde "Bugün antrenman yok."',async()=>{
    for(const h of [9,16]){const page=await open(YENI(),h);
      assert.deepEqual(await seg(page),['Antrenman','Yemek']);await has(page,'Goblet Squat');await page.context().close();}
    const P=YENI();P.days[2]={title:'Dinlenme',sessions:{}};const page=await open(P,16,{date:'2026-11-17'});
    assert.ok((await page.locator('#view').innerText()).includes('Bugün antrenman yok.'));await page.context().close();
  });

  for(const scheme of ['light','dark'])await test('iki seanslı program: Sabah/Akşam ve saat kuralı aynen ('+scheme+')',async()=>{
    let page=await open(IKI(),9,{scheme});
    assert.deepEqual(await seg(page),['Sabah','Akşam','Yemek']);assert.equal(await pressed(page),'Sabah');
    await has(page,'Goblet Squat');assert.equal(await page.locator('article.ex',{hasText:'Lat Pulldown'}).count(),0);
    await page.click('#seg [data-s="aksam"]');await has(page,'Lat Pulldown');assert.equal(await page.locator('article.ex',{hasText:'Goblet Squat'}).count(),0);
    await page.click('.tabbar [data-t="hafta"]');const t=await page.locator('#view').innerText();
    assert.ok(t.includes('Sabah: A günü')&&t.includes('Akşam: B günü'),t);assert.ok(!t.includes('Antrenman:'),t);
    await page.context().close();
    page=await open(IKI(),16,{scheme});assert.equal(await pressed(page),'Akşam');await has(page,'Lat Pulldown');
    await noOverflow(page);await shot(page,'3-iki-seans'+(scheme==='dark'?'-koyu':''));
    // Salı: yalnız sabah dolu → 16:00'da da Sabah seçilir
    await page.click('#next');assert.equal(await pressed(page),'Sabah');await has(page,'Goblet Squat');
    // Kullanıcı Akşam'a basarsa o gün için seçimi korunur
    await page.click('#seg [data-s="aksam"]');assert.ok((await page.locator('#view').innerText()).includes('Bu akşam antrenman yok.'));
    // Çarşamba: yalnız akşam dolu
    await page.click('#next');assert.equal(await pressed(page),'Akşam');await has(page,'Lat Pulldown');
    await page.click('#seg [data-s="sabah"]');assert.ok((await page.locator('#view').innerText()).includes('Bu sabah antrenman yok.'));
    // Perşembe: ikisi de boş → saat kuralı (16:00 → Akşam)
    await page.click('#next');assert.equal(await pressed(page),'Akşam');assert.ok((await page.locator('#view').innerText()).includes('Bu akşam antrenman yok.'));
    await page.context().close();
    // Salı 09:00 → Sabah; Çarşamba 09:00 → Akşam
    page=await open(IKI(),9,{date:'2026-11-18'});assert.equal(await pressed(page),'Akşam');await has(page,'Lat Pulldown');await page.context().close();
  });

  await test('kayıt: log anahtarı değişmez, eski kayıt okunur, sayaç çalışır',async()=>{
    const logs={[MON]:{items:{'a.goblet':{w:'12',reps:['10',''],d:[true,false],cal:{tries:[{w:12,reps:10,rir:2}],done:true,w:12,e1rm:16,T:10}}}}};
    const page=await open(YG(),16,{logs});const g=page.locator('article.ex',{hasText:'Goblet Squat'});
    assert.equal(await g.locator('.calres').count(),1,'eski kayıt okunmadı');
    await page.locator('article.ex',{hasText:'Plank'}).locator('button.set').first().click();
    assert.ok(await page.locator('#timer').evaluate(e=>e.classList.contains('run')),'dinlenme sayacı başlamadı');
    await page.clock.runFor(1500);for(let i=0;i<50&&!page.db.saves;i++)await page.waitForTimeout(100);
    assert.ok(page.db.saves>=1,'pt_save_log çağrılmadı');const it=page.db.logs[MON].items;
    assert.deepEqual(Object.keys(it).sort(),['a.goblet','a.plank']);assert.equal(it['a.plank'].d[0],true);assert.equal(it['a.goblet'].w,'12');
    await page.context().close();
  });

  await test('pageerror yok',async()=>assert.deepEqual(errors,[]));
  await browser.close();server.close();
  console.log(failed?failed+' test başarısız':'Tüm testler geçti');process.exit(failed?1:0);
})();
