// Ağırlık bulma haftası — Playwright mock testleri.
// Çalıştır: node tests/agirlik-bulma.test.js   (ekran görüntüsü için: SHOTS=klasor node ...)
// Gerçek Supabase'e bağlanmaz; rpc istekleri route mock ile yakalanır.
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert');
const ROOT=path.join(__dirname,'..'),SHOTS=process.env.SHOTS||'';
const TOKEN='00000000-0000-4000-8000-000000000000';
const pad=n=>String(n).padStart(2,'0');
const key=off=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+off);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
const PROFIL={ad:'Test',yas:'30',cinsiyet:'Erkek',boy:'180',kilo:'80',bel:'85',boyun:'38',hedef:'Kas',gun:'3',onay:true,
  test:{done:true,skip:false,seviye:{bacak:2,kalca:2,gogus:2,sirt:2,kol:2,omuz:2,omuzMob:2,karin:2},agri:[]}};
function program(startOff,kal){
  const day={title:'Tüm vücut',sessions:{sabah:['a'],aksam:['a']}};const days={};for(let i=0;i<7;i++)days[i]=day;
  const P={start:key(startOff),weeks:8,rules:[],days,blocks:{a:{t:'Ana bölüm',items:[
    {id:'goblet',n:'Goblet Squat',s:[[1,2],[2,3]],r:'8–12',note:'Dambılı göğüste tut, gövde dik.',w0:10,inc:2},
    {id:'lat',n:'Lat Pulldown',s:2,r:'10–12',w0:20,inc:2.5},
    {id:'plank',n:'Plank',s:2,r:'30 sn',w:false}]}}};
  if(kal)P.kalibrasyon={hafta:[1]};return P;
}
const calLog=(w,e1rm)=>({items:{'a.goblet':{w:String(w),reps:['10','10'],d:[true,true],cal:{tries:[{w,reps:10,rir:2}],done:true,w,e1rm,T:10}}}});

let browser,server,base,failed=0;const errors=[];
async function open(db,scheme){
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:SHOTS?2:1,colorScheme:scheme||'light'});
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(String(e)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
  await page.route('**/rest/v1/rpc/**',async r=>{const fn=r.request().url().split('/rpc/')[1];const a=r.request().postDataJSON()||{};
    if(fn==='pt_get')return r.fulfill({json:{profil:db.profil,program:db.program,targets:{items:db.targets||{}},settings:{},logs:db.logs}});
    if(fn==='pt_save_log'){db.logs[a.p_day]=a.p_data;db.saves=(db.saves||0)+1;}
    return r.fulfill({json:true});});
  await page.goto(base+'/index.html?k='+TOKEN);await page.waitForSelector('.daytitle,.empty');
  return page;
}
const mkdb=(P,logs,targets)=>({profil:PROFIL,program:P,logs:logs||{},targets:targets||{}});
const card=(page,name)=>page.locator('article.ex',{hasText:name});
const noOverflow=async page=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'390 px genişlikte yatay taşma var');
const saved=async(page,db,n)=>{for(let i=0;i<50&&(db.saves||0)<n;i++)await page.waitForTimeout(100);assert.ok((db.saves||0)>=n,'log kaydedilmedi');};
// Ekran görüntüsünde sabit öğeler (sekme çubuğu, sayaç) kartı kapatmasın diye geçici gizlenir.
const shot=async(loc,name)=>{if(!SHOTS)return;const page=loc.goto?loc:loc.page();const o={path:path.join(SHOTS,name+'.png')};
  const st=await page.addStyleTag({content:'.tabbar,.timer{display:none!important}header.top{position:static!important}'});
  if(loc.goto)await loc.screenshot(Object.assign(o,{fullPage:true}));else await loc.screenshot(o);
  await st.evaluate(e=>e.remove());};
async function test(name,fn){try{await fn();console.log('✓ '+name);}catch(e){failed++;console.log('✗ '+name+'\n   '+String(e.message||e).split('\n')[0]);}}

(async()=>{
  server=http.createServer((q,s)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));fs.readFile(f,(e,b)=>{if(e){s.writeHead(404);s.end();}else{s.writeHead(200,{'Content-Type':f.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream'});s.end(b);}});});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch();

  await test('kalibrasyonsuz program: eski davranış',async()=>{
    const page=await open(mkdb(program(0,false)));
    assert.equal(await page.locator('.cal, #calInfo, .tag.cal, .calres').count(),0);
    const g=card(page,'Goblet Squat');
    assert.equal(await g.locator('button.set').count(),2);assert.equal(await g.locator('.w input').count(),1);
    assert.equal(await g.locator('.dose').innerText(),'2 × 8–12');assert.equal(await g.locator('.hedef').count(),0);
    await g.locator('button.set').first().click();assert.equal(await card(page,'Goblet Squat').locator('button.set[aria-pressed="true"]').count(),1);
    await noOverflow(page);await page.context().close();
  });

  for(const scheme of ['light','dark'])await test('1. hafta kartı, örnek akış, 3 deneme, yenileme ('+scheme+')',async()=>{
    const db=mkdb(program(0,true));const page=await open(db,scheme);const sfx=scheme==='dark'?'-koyu':'';
    assert.ok((await page.locator('#calInfo').innerText()).includes('1. hafta: ağırlık bulma haftası'));
    assert.equal(await page.locator('#calInfo').count(),1);
    let g=card(page,'Goblet Squat');
    assert.equal(await g.locator('.tag.cal').count(),1);assert.equal(await g.locator('.dose').innerText(),'hedef 10 tekrar');
    assert.ok((await g.innerText()).includes('Isınma: çok hafif (5 kg) × 10 tekrar'));
    assert.equal(await g.locator('[data-calw]').inputValue(),'10');assert.equal(await g.locator('[data-calr]').inputValue(),'10');
    assert.deepEqual(await g.locator('[data-rir]').allInnerTexts(),['0','1','2','3','4+']);
    assert.ok((await g.innerText()).includes('Kaç tekrar daha yapabilirdin?'));
    assert.equal(await card(page,'Lat Pulldown').locator('.dose').innerText(),'hedef 11 tekrar');
    const pl=card(page,'Plank');assert.equal(await pl.locator('.cal, .tag.cal, [data-rir]').count(),0);assert.equal(await pl.locator('button.set').count(),2);
    await noOverflow(page);await shot(page,'1-hafta1-kart'+sfx);

    // örnek akış: 10 kg × 10 + "4+" → 12 kg, "hafif ↑"
    await g.locator('[data-calwarm]').click();
    await card(page,'Goblet Squat').locator('[data-rir="4"]').click();g=card(page,'Goblet Squat');
    assert.ok((await g.innerText()).includes('Deneme 2:'));assert.equal(await g.locator('[data-calw]').inputValue(),'12');
    assert.ok((await g.locator('.caltry').first().innerText()).includes('hafif ↑'));
    assert.equal(await g.locator('[data-calwarm]').getAttribute('aria-pressed'),'true');
    await shot(g,'2a-deneme2'+sfx);
    // 12 kg × 10 + "2" → sonuç 12 kg × 10, ~17 kg
    await g.locator('[data-rir="2"]').click();g=card(page,'Goblet Squat');
    const res=await g.locator('.calres').innerText();
    assert.ok(res.includes('Çalışma ağırlığın')&&res.includes('12 kg × 10'),res);assert.ok(res.includes('~17 kg'),res);
    assert.equal(await g.locator('[data-rir], [data-calw]').count(),0);
    assert.equal(await g.locator('button.set').count(),1,'kalan set = setsFor − 1');
    assert.ok((await g.innerText()).includes('Kalan setleri 12 kg ile yap'));
    await noOverflow(page);await shot(g,'2-sonuc-kutusu'+sfx);

    // RIR 0 → öneri en fazla w − inc; 3 denemeden sonra 4. açılmaz
    let l=card(page,'Lat Pulldown');
    await l.locator('[data-rir="0"]').click();l=card(page,'Lat Pulldown');
    assert.equal(await l.locator('[data-calw]').inputValue(),'17,5');assert.ok((await l.locator('.caltry').first().innerText()).includes('ağır ↓'));
    await l.locator('[data-rir="0"]').click();l=card(page,'Lat Pulldown');
    assert.ok(parseFloat((await l.locator('[data-calw]').inputValue()).replace(',','.'))<=15);
    assert.ok((await l.innerText()).includes('Deneme 3:'));
    await l.locator('[data-rir="4"]').click();l=card(page,'Lat Pulldown');
    assert.equal(await l.locator('.caltry').count(),3);assert.equal(await l.locator('[data-rir], [data-calw]').count(),0,'4. deneme açılmamalı');
    assert.equal(await l.locator('.calres').count(),1);
    await noOverflow(page);await shot(page,'2b-uc-deneme'+sfx);

    // veri şekli
    await saved(page,db,1);await page.waitForTimeout(900);
    const c=db.logs[key(0)].items['a.goblet'].cal;
    assert.deepEqual(c.tries,[{w:10,reps:10,rir:4},{w:12,reps:10,rir:2}]);assert.equal(c.done,true);assert.equal(c.w,12);assert.equal(c.e1rm,16.8);assert.equal(c.T,10);
    assert.equal(db.logs[key(0)].items['a.lat'].cal.tries.length,3);
    assert.ok(JSON.stringify(db.logs[key(0)]).length<2000,'log küçük kalmalı');

    // yenileme: denemeler ve sonuç korunur
    const before=await card(page,'Lat Pulldown').locator('.calres').innerText();
    await page.reload();await page.waitForSelector('.calres');
    g=card(page,'Goblet Squat');assert.ok((await g.locator('.calres').innerText()).includes('12 kg × 10'));assert.equal(await g.locator('.caltry').count(),2);
    assert.equal(await card(page,'Lat Pulldown').locator('.calres').innerText(),before);

    // aynı hafta ikinci kez: ağırlık bulma açılmaz, hedef görünür
    await page.click('#next');g=card(page,'Goblet Squat');
    assert.equal(await page.locator('#calInfo').count(),1);
    assert.equal(await g.locator('.cal, .tag.cal').count(),0);assert.equal(await g.locator('button.set').count(),2);
    assert.ok((await g.innerText()).includes('Hedef: 12 kg'));assert.ok((await g.innerText()).includes('Geçen: 12 × 10'));
    await noOverflow(page);await page.context().close();
  });

  for(const scheme of ['light','dark'])await test('2. hafta: Hedef kartta ('+scheme+')',async()=>{
    const page=await open(mkdb(program(-7,true),{[key(-6)]:calLog(12,16.8)}),scheme);
    const g=card(page,'Goblet Squat');
    assert.equal(await page.locator('.cal, #calInfo, .tag.cal').count(),0);
    assert.equal(await g.locator('.dose').innerText(),'3 × 8–12');assert.equal(await g.locator('button.set').count(),3);
    assert.equal(await g.locator('small.hedef').first().innerText(),'Hedef: 12 kg');
    assert.equal(await g.locator('.w input').getAttribute('placeholder'),'12');
    await noOverflow(page);await shot(g,'3-hafta2-kart'+(scheme==='dark'?'-koyu':''));await page.context().close();
  });

  await test('koç hedefi varsa o gösterilir',async()=>{
    const page=await open(mkdb(program(-7,true),{[key(-6)]:calLog(12,16.8)},{goblet:{w:'14 kg'}}));
    const t=await card(page,'Goblet Squat').innerText();assert.ok(t.includes('Hedef: 14 kg'),t);assert.ok(!t.includes('Hedef: 12 kg'),t);
    await page.context().close();
  });

  await test('geri al ve boş giriş',async()=>{
    const db=mkdb(program(0,true));const page=await open(db);let g=card(page,'Goblet Squat');
    await g.locator('[data-calw]').fill('');await g.locator('[data-rir="2"]').click();
    assert.ok((await g.locator('[data-calerr]').innerText()).length>0);assert.equal(await g.locator('.calres').count(),0);
    await g.locator('[data-calw]').fill('12');await g.locator('[data-rir="3"]').click();
    assert.equal(await card(page,'Goblet Squat').locator('.calres').count(),1);
    await card(page,'Goblet Squat').locator('[data-calundo]').click();g=card(page,'Goblet Squat');
    assert.equal(await g.locator('.calres').count(),0);assert.equal(await g.locator('[data-rir]').count(),5);
    await page.context().close();
  });

  for(const scheme of ['light','dark'])await test('profil: güç gelişimin ('+scheme+')',async()=>{
    const logs={[key(-20)]:calLog(14,19),[key(-2)]:{items:{'a.goblet':{w:'18',reps:['15','12','12'],d:[true,true,true]}}}};
    const page=await open(mkdb(program(-21,true),logs),scheme);
    await page.click('.tabbar [data-t="profil"]');const s=page.locator('#gucGelisim');
    const t=(await s.innerText()).replace(/\s+/g,' ');assert.ok(/Goblet Squat tahmini maks 19 → 27 kg \+%42/.test(t),t);
    await noOverflow(page);await shot(s,'4-profil-guc-gelisimi'+(scheme==='dark'?'-koyu':''));await page.context().close();
    // 1 haftadan az veri: bölüm yok
    const p2=await open(mkdb(program(-3,true),{[key(-3)]:calLog(14,19),[key(-1)]:logs[key(-2)]}));
    await p2.click('.tabbar [data-t="profil"]');await p2.waitForSelector('#saveProf');assert.equal(await p2.locator('#gucGelisim').count(),0);await p2.context().close();
  });

  await test('pageerror yok',async()=>assert.deepEqual(errors,[]));
  await browser.close();server.close();
  console.log(failed?failed+' test başarısız':'Tüm testler geçti');process.exit(failed?1:0);
})();
