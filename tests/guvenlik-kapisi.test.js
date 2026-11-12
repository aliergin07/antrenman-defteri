// İlerleme güvenlik kapısı (ağırlık önerisi kontrolü) — Playwright mock testleri.
// Çalıştır: node tests/guvenlik-kapisi.test.js   (ekran görüntüsü için: SHOTS=klasor node ...)
// Gerçek Supabase'e bağlanmaz; rpc istekleri route mock ile yakalanır. Saat page.clock ile sabitlenir.
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert');
const ROOT=path.join(__dirname,'..'),SHOTS=process.env.SHOTS||'';
const TOKEN='00000000-0000-4000-8000-000000000000';
const PROFIL={ad:'Test',yas:'30',cinsiyet:'Erkek',boy:'180',kilo:'80',bel:'85',boyun:'38',hedef:'Kas',gun:'3',onay:true,
  test:{done:true,skip:false,seviye:{bacak:2,kalca:2,gogus:2,sirt:2,kol:2,omuz:2,omuzMob:2,karin:2},agri:[]}};
// Bugün 16 Kasım 2026 Pazartesi; önceki kayıt 9 Kasım.
const MON='2026-11-16',PREV='2026-11-09';
const program=(extra)=>Object.assign({start:'2026-11-02',weeks:8,rules:[],
  blocks:{a:{t:'Ana bölüm',items:[
    {id:'bench',n:'Bench Press',s:3,r:'8–12',w0:40,inc:2.5},
    {id:'curl',n:'Dambıl Curl',s:2,r:'12–15',w0:4,inc:2},
    {id:'plank',n:'Plank',s:2,r:'30 sn',w:false}]}},
  days:{1:{title:'Tüm vücut',sessions:{antrenman:['a']}}}},extra||{});
const bench=(it,day)=>({[PREV]:Object.assign({items:{'a.bench':Object.assign({w:'40',reps:['12','12','12'],d:[true,true,true]},it||{})}},day||{})});
const curl=(n)=>({[PREV]:{items:{'a.curl':{w:'4',reps:[String(n),String(n)],d:[true,true]}}}});

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
const ctext=async(page,name)=>(await card(page,name).innerText()).replace(/\s+/g,' ').trim();
// Kartın öneri durumu: {up:'42,5 kg'|null, line:'Bu hafta aynı ağırlık: …'|null}
const sug=async(page,name)=>{const c=card(page,name);const t=await ctext(page,name);const m=t.match(/↑ Öneri: ([\d,]+ kg)/);
  return {up:m?m[1]:null,line:await c.locator('.sug').count()?(await c.locator('.sug').innerText()).trim():null};};
const check=async(logs,name,want,opt)=>{const page=await open(program(),Object.assign({logs},opt));assert.deepEqual(await sug(page,name),want);return page;};
const saved=async(page,n)=>{await page.clock.runFor(1500);for(let i=0;i<50&&page.db.saves<n;i++)await page.waitForTimeout(100);assert.ok(page.db.saves>=n,'log kaydedilmedi');};
const noOverflow=async page=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'390 px genişlikte yatay taşma var');
const shot=async(loc,name)=>{if(!SHOTS)return;const page=loc.page();const st=await page.addStyleTag({content:'.tabbar,.timer{display:none!important}header.top{position:static!important}'});
  await loc.screenshot({path:path.join(SHOTS,name+'.png')});await st.evaluate(e=>e.remove());};
async function test(name,fn){try{await fn();console.log('✓ '+name);}catch(e){failed++;console.log('✗ '+name+'\n   '+String(e.message||e).split('\n')[0]);}}

(async()=>{
  server=http.createServer((q,s)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));fs.readFile(f,(e,b)=>{if(e){s.writeHead(404);s.end();}else{s.writeHead(200,{'Content-Type':f.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream'});s.end(b);}});});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch();

  for(const scheme of ['light','dark'])await test('40 kg × 12/12/12, 2 tekrar kalmış, form normal, ağrı 0 → ↑ Öneri: 42,5 kg ('+scheme+')',async()=>{
    const page=await check(bench({rir:2},{pain:0}),'Bench Press',{up:'42,5 kg',line:null},{scheme});
    await noOverflow(page);await shot(card(page,'Bench Press'),'1-kapi-oneri'+(scheme==='dark'?'-koyu':''));await page.context().close();
  });

  for(const scheme of ['light','dark'])await test('son sette 0 tekrar kalmış → aynı ağırlık, sebebiyle ('+scheme+')',async()=>{
    const page=await check(bench({rir:0}),'Bench Press',{up:null,line:'Bu hafta aynı ağırlık: son sette hiç tekrar kalmamıştı'},{scheme});
    await noOverflow(page);await shot(card(page,'Bench Press'),'2-kapi-engel'+(scheme==='dark'?'-koyu':''));await page.context().close();
  });

  await test('form bozuk → engel ve sebep',async()=>{
    (await check(bench({rir:2,form:'bozuk'}),'Bench Press',{up:null,line:'Bu hafta aynı ağırlık: form bozulmuştu'})).context().close();
  });

  await test('o gün ağrı 5 → engel; ağrı 4 → engel; ağrı 3 → öneri',async()=>{
    (await check(bench({},{pain:5}),'Bench Press',{up:null,line:'Bu hafta aynı ağırlık: ağrı vardı'})).context().close();
    (await check(bench({},{pain:4}),'Bench Press',{up:null,line:'Bu hafta aynı ağırlık: ağrı vardı'})).context().close();
    (await check(bench({},{pain:3}),'Bench Press',{up:'42,5 kg',line:null})).context().close();
  });

  await test('o gün hazırlık kırmızı → engel; sarı → öneri',async()=>{
    (await check(bench({},{hazir:{uyku:1,enerji:1,agri:0,renk:'kirmizi'}}),'Bench Press',{up:null,line:'Bu hafta aynı ağırlık: kendini iyi hissetmiyordun'})).context().close();
    (await check(bench({},{hazir:{uyku:2,enerji:4,agri:0,renk:'sari'}}),'Bench Press',{up:'42,5 kg',line:null})).context().close();
  });

  await test('birden fazla sebep → ilki yazılır',async()=>{
    (await check(bench({rir:0,form:'bozuk'},{pain:6}),'Bench Press',{up:null,line:'Bu hafta aynı ağırlık: ağrı vardı'})).context().close();
    (await check(bench({rir:0,form:'bozuk'}),'Bench Press',{up:null,line:'Bu hafta aynı ağırlık: son sette hiç tekrar kalmamıştı'})).context().close();
  });

  await test('eski kayıt (alanlar yok) → mevcut davranış; 4+ ve 1 tekrar kalmış → öneri',async()=>{
    (await check(bench(),'Bench Press',{up:'42,5 kg',line:null})).context().close();
    (await check(bench({rir:4}),'Bench Press',{up:'42,5 kg',line:null})).context().close();
    (await check(bench({rir:1}),'Bench Press',{up:'42,5 kg',line:null})).context().close();
  });

  await test('tekrar tavanına ulaşılmadıysa hiçbir şey yazılmaz',async()=>{
    (await check(bench({reps:['12','11','10'],rir:0,form:'bozuk'},{pain:7}),'Bench Press',{up:null,line:null})).context().close();
  });

  for(const scheme of ['light','dark'])await test('küçük adım: 4 kg × 15/15 → önce tekrar; 18/18 → ↑ Öneri: 6 kg ('+scheme+')',async()=>{
    const page=await check(curl(15),'Dambıl Curl',{up:null,line:'Önce tekrarı artır: 18 tekrara çık'},{scheme});
    await noOverflow(page);await shot(card(page,'Dambıl Curl'),'3-kapi-kucuk-adim'+(scheme==='dark'?'-koyu':''));await page.context().close();
    (await check(curl(17),'Dambıl Curl',{up:null,line:'Önce tekrarı artır: 18 tekrara çık'})).context().close();
    (await check(curl(18),'Dambıl Curl',{up:'6 kg',line:null})).context().close();
    // 25 kg: +2,5 tam %10 → doğrudan öneri; 22,5 kg: %10'dan büyük → önce tekrar
    const L=w=>({[PREV]:{items:{'a.bench':{w,reps:['12','12','12'],d:[true,true,true]}}}});
    (await check(L('25'),'Bench Press',{up:'27,5 kg',line:null})).context().close();
    (await check(L('22,5'),'Bench Press',{up:null,line:'Önce tekrarı artır: 15 tekrara çık'})).context().close();
  });

  await test('bugün sarı/kırmızı hazırlık → "Bugün ağırlık artırma"',async()=>{
    const page=await check(bench({rir:2}),'Bench Press',{up:'42,5 kg',line:null});
    await page.click('[data-hz="uyku"][data-v="2"]');await page.click('[data-hz="enerji"][data-v="4"]');await page.click('[data-hz="agri"][data-v="0"]');
    assert.deepEqual(await sug(page,'Bench Press'),{up:null,line:'Bugün ağırlık artırma'});
    await page.click('[data-hzedit]');await page.click('[data-hz="agri"][data-v="7"]');assert.deepEqual(await sug(page,'Bench Press'),{up:null,line:'Bugün ağırlık artırma'});
    await page.click('[data-hz="uyku"][data-v="4"]');await page.click('[data-hz="agri"][data-v="0"]');assert.deepEqual(await sug(page,'Bench Press'),{up:'42,5 kg',line:null});
    await page.context().close();
    // engel varsa sebep yazılmaya devam eder
    const p2=await check(bench({rir:0}),'Bench Press',{up:null,line:'Bu hafta aynı ağırlık: son sette hiç tekrar kalmamıştı'},
      {logs:Object.assign(bench({rir:0}),{[MON]:{items:{},hazir:{uyku:2,enerji:4,agri:0,renk:'sari'}}})});await p2.context().close();
  });

  for(const scheme of ['light','dark'])await test('son set girişi: kaydedilir, yenileyince korunur, kapatınca silinir ('+scheme+')',async()=>{
    let page=await open(program(),{scheme});const g=()=>card(page,'Bench Press');
    assert.ok((await ctext(page,'Bench Press')).includes('Son sette kaç tekrar daha yapabilirdin?'));
    assert.deepEqual(await g().locator('[data-lr]').allInnerTexts(),['0','1','2','3','4+']);
    assert.equal(await card(page,'Plank').locator('.last,[data-lr],[data-form]').count(),0,'ağırlıksız harekette son set girişi olmamalı');
    assert.ok(!/RIR/i.test(await page.locator('#view').innerText()),'kullanıcı RIR terimini görmemeli');
    const small=await page.locator('.last button').evaluateAll(a=>a.filter(b=>b.offsetHeight<36||b.offsetWidth<36).length);assert.equal(small,0,'36 px altı dokunma hedefi');
    await g().locator('.w input').fill('40');await g().locator('button.set').first().click();
    await g().locator('[data-lr][data-v="4"]').click();await g().locator('[data-form]').click();
    assert.equal(await g().locator('[data-lr][aria-pressed="true"]').innerText(),'4+');assert.equal(await g().locator('[data-form]').getAttribute('aria-pressed'),'true');
    await noOverflow(page);await shot(g(),'4-kapi-son-set'+(scheme==='dark'?'-koyu':''));
    await saved(page,1);let it=page.db.logs[MON].items['a.bench'];assert.equal(it.rir,4);assert.equal(it.form,'bozuk');assert.equal(it.w,'40');assert.deepEqual(it.d,[true]);
    const db=page.db;await page.context().close();
    page=await open(program(),{db,scheme});
    assert.equal(await g().locator('[data-lr][aria-pressed="true"]').innerText(),'4+');assert.equal(await g().locator('[data-form]').getAttribute('aria-pressed'),'true');
    assert.equal(await g().locator('button.set[aria-pressed="true"]').count(),1);
    await g().locator('[data-lr][data-v="0"]').click();await g().locator('[data-form]').click();await saved(page,1);
    it=db.logs[MON].items['a.bench'];assert.equal(it.rir,0);assert.ok(!('form' in it),'form alanı silinmeli');
    await g().locator('[data-lr][data-v="0"]').click();db.saves=0;await saved(page,1);assert.ok(!('rir' in db.logs[MON].items['a.bench']),'aynı düğmeye tekrar basınca seçim kalkmalı');
    await page.context().close();
  });

  await test('ağırlık bulma kartı değişmez',async()=>{
    const page=await open(program({start:MON,kalibrasyon:{hafta:[1]}}));const g=card(page,'Bench Press');
    assert.equal(await g.locator('[data-cal]').count(),1);assert.equal(await g.locator('.last,[data-lr],[data-form],.sug').count(),0);
    assert.equal(await g.locator('[data-rir]').count(),5);
    await g.locator('[data-calw]').fill('40');await g.locator('[data-rir="2"]').click();
    assert.equal(await card(page,'Bench Press').locator('.calres').count(),1);assert.equal(await card(page,'Bench Press').locator('.last,[data-lr],[data-form]').count(),0);
    await page.context().close();
  });

  await test('pageerror yok',async()=>assert.deepEqual(errors,[]));
  await browser.close();server.close();
  console.log(failed?failed+' test başarısız':'Tüm testler geçti');process.exit(failed?1:0);
})();
