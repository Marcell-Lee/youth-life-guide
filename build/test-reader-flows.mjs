import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');
const server=spawn(process.execPath,['build/preview.cjs'],{cwd:root,stdio:['ignore','pipe','pipe']});
let browser;
try {
 await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('Preview did not start')})]);
 browser=await chromium.launch();
 const context=await browser.newContext({viewport:{width:1440,height:900}});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const base='http://127.0.0.1:4173/';
 await p.goto(base+'#K067');
 await p.waitForFunction(()=>document.querySelectorAll('#list a').length===83);
 await p.locator('#font-size').click();
 await p.locator('.edition-links a[data-mode="primary"]').click();
 await p.waitForFunction(()=>location.hash==='#K067'&&document.querySelectorAll('#list a').length===79);
 assert.equal(await p.locator('#font-size').getAttribute('aria-pressed'),'true');
 assert.equal(await p.locator('#age').count(),0,'Do not show identical age filters');
 await p.goto(base+'小学版-离线试读.html?test=missing#K058');
 assert.equal(new URL(p.url()).hash,'#K058');
 assert.match(await p.locator('#article').innerText(),/暂时没有小学版/);
 assert.ok(await p.locator('#article a[href*="#K058"]').count()>0);
 await p.goto(base+'?test=search#K043');
 await p.locator('#search').fill('奖项');
 assert.equal(await p.locator('#list a').count(),1);
 await p.locator('#list a').click();
 assert.equal(await p.locator('#next').isDisabled(),true);
 assert.match(await p.locator('#progress').innerText(),/1\s*\/\s*1/);
 assert.ok(await p.locator('#article mark').count()>0);
 assert.ok(await p.locator('.search-snippet').count()>0);
 await p.reload();assert.equal(await p.locator('#search').inputValue(),'奖项');
 await p.locator('#search').fill('<img src=x onerror=alert(1)>');
 assert.equal(await p.locator('#list img').count(),0);
 assert.equal(await p.locator('#list a').count(),0);
 for(const query of ['constructor','__proto__','toString']){await p.locator('#search').fill(query);assert.equal(await p.locator('#list a').count(),0)}
 await p.locator('#search').fill('K043');assert.equal(await p.locator('#list a').count(),1);assert.ok((await p.locator('.search-snippet').innerText()).length>20);
 await p.locator('#search').fill('手机 时间');assert.ok(await p.locator('#list a').count()>0);
 await p.locator('#clear-search').click();
 await p.goto(base+'?test=about#about');assert.equal(await p.locator('#about').evaluate(e=>e.open),true);
 assert.equal(new URL(p.url()).hash,'#about');
 await p.goto(base+'?test=bad#K999');assert.match(await p.locator('#article').innerText(),/没有找到/);
 await p.goto(base+'?test=group#K067');
 assert.ok(await p.locator('.topic-group').count()>=8);
 assert.ok(await p.locator('#list a[aria-current]').isVisible());
 assert.equal(await p.locator('#list a[aria-current]').evaluate(e=>{const a=e.getBoundingClientRect(),b=document.getElementById('list').getBoundingClientRect();return a.top>=b.top-1&&a.bottom<=b.bottom+1}),true);
 assert.ok((await p.locator('#agent-entry').boundingBox()).y<200);
 await p.goto(base+'?test=history#K043');
 await p.evaluate(()=>show(chapters.findIndex(c=>c.id==='K050')));
 await p.goBack();assert.equal(new URL(p.url()).hash,'#K043');assert.match(await p.locator('#article h1').innerText(),/兴趣/);
 await p.goto(base+'?test=sections#K001');
 assert.equal(await p.locator('#article details[data-audience][open]').count(),3);
 assert.equal(await p.locator('#article details[data-audience="adult"]').evaluate(e=>e.open),true);
 await p.goto(base+'?test=heading#K060');
 const sizes=await p.evaluate(()=>({body:parseFloat(getComputedStyle(document.getElementById('article')).fontSize),h3:parseFloat(getComputedStyle(document.querySelector('#article h3, #article .adult-note>summary')).fontSize)}));assert.ok(sizes.h3>=sizes.body);
 assert.equal(await p.locator('#article .adult-note').evaluate(e=>e.open),true);
 await p.goto(base+'?test=adult-heading#K023');assert.equal(await p.locator('#article details[data-audience="adult"]').evaluate(e=>e.open),true);
 await p.goto(base+'?test=age-sections#K081');assert.equal(await p.locator('#article details[data-audience="primary"][open]').count(),await p.locator('#article details[data-audience="primary"]').count());
 for(const id of ['K026','K035','K082','K083']){
  await p.goto(base+'?test=child-label#'+id);
  assert.equal(await p.locator('#article details[data-audience="primary"][open]').count(),1,id+': child guidance must open even if its heading mentions adults');
  assert.equal(await p.locator('#article details[data-audience="adult"]').filter({hasText:/^小学版|^中学版/}).count(),0);
 }
 const sections=await browser.newContext();await sections.addInitScript(()=>localStorage.setItem('youth-guide:audience','secondary'));
 const s=await sections.newPage();await s.goto(base+'#K001');await s.waitForFunction(()=>document.querySelectorAll('#list a').length===83);
 const expanded=audience=>s.locator(`#article .reader-section[data-audience="${audience}"]`).evaluate(e=>e.open);
 assert.equal(await s.locator('#article .reader-section[open]').count(),3,'Old preferred-reader setting must not collapse sections');
 await s.locator('.reader-section[data-audience="primary"]>summary').click();assert.equal(await expanded('primary'),false);assert.equal(await expanded('secondary'),true);assert.equal(await expanded('adult'),true);
 await s.locator('.reader-section[data-audience="adult"]>summary').click();await s.goto(base+'#K002');
 assert.equal(await expanded('primary'),false);assert.equal(await expanded('secondary'),true);assert.equal(await expanded('adult'),false);
 await s.reload();assert.equal(await expanded('primary'),false);assert.equal(await expanded('secondary'),true);assert.equal(await expanded('adult'),false);
 await s.locator('.reader-section[data-audience="primary"]>summary').click();assert.equal(await expanded('secondary'),true);assert.equal(await expanded('adult'),false);
 await s.goto(base+'?q='+encodeURIComponent('成人与学校需要一起做的事')+'#K001');assert.equal(await expanded('adult'),false,'Search must respect a manually collapsed section');
 await s.goto(base+'#K060');assert.ok(await s.locator('.adult-note').count());assert.equal(await s.locator('.adult-note[open]').count(),0,'Nested adult notes share the adult preference');
 await s.locator('.adult-note>summary').first().click();assert.equal(await s.locator('.adult-note[open]').count(),await s.locator('.adult-note').count());
 await s.goto(base+'#K001');assert.equal(await expanded('adult'),true);await s.locator('.reader-section[data-audience="secondary"]>summary').click();
 await s.reload();assert.equal(await expanded('primary'),true);assert.equal(await expanded('secondary'),false);assert.equal(await expanded('adult'),true);
 const fresh=await browser.newContext(),f=await fresh.newPage();await f.goto(base+'#K001');assert.equal(await f.locator('.reader-section[open]').count(),3,'Another device/profile starts with all sections open');
 for(const audience of ['primary','secondary','adult'])await f.locator(`.reader-section[data-audience="${audience}"]>summary`).click();
 await f.reload();assert.equal(await f.locator('.reader-section[open]').count(),0,'All three choices can remain closed');
 await f.locator('.reader-section[data-audience="adult"]>summary').focus();await f.keyboard.press('Enter');assert.equal(await f.locator('.reader-section[open]').count(),1);
 for(const invalid of ['broken','null','[]','{"primary":"false"}']){await f.evaluate(value=>localStorage.setItem('youth-guide:sections',value),invalid);await f.reload();assert.equal(await f.locator('.reader-section[open]').count(),3)}
 await sections.close();await fresh.close();
 await p.goto(base+'小学版-离线试读.html?test=child-age#K020');
 assert.ok(await p.locator('#article h2').filter({hasText:'6—8 岁'}).isVisible());
 assert.ok(await p.locator('#article h2').filter({hasText:'9—11 岁'}).isVisible());
 await p.goto(base+'?test=resize#K001');
 await p.setViewportSize({width:375,height:812});
 await p.waitForFunction(()=>!document.body.classList.contains('catalog-open'));
 assert.ok((await p.locator('#article').boundingBox()).y<400);
 const mobile=await browser.newContext({viewport:{width:375,height:812}});const m=await mobile.newPage();await m.goto(base);
 assert.ok((await m.locator('#article h2+p, #article .section-body p').first().boundingBox()).y<450);
 await m.locator('.catalog-trigger').click();await m.locator('#search').fill('朋友');await m.locator('#list a').first().click();
 assert.equal(await m.locator('#catalog').evaluate(e=>e.open),false);
 const headerRect=await m.locator('header').boundingBox();assert.ok(headerRect.y>=0);
 await m.locator('#agent-entry summary').click();await m.keyboard.press('Escape');assert.equal(await m.locator('#agent-entry').evaluate(e=>e.open),false);
 fs.mkdirSync(path.join(root,'work/verification/reader-redesign'),{recursive:true});
 for(const width of [320,375,414,768,1024,1440,1920,2560]) {
  await m.setViewportSize({width,height:900});await m.goto(base+'?viewport='+width+'#K001');
  assert.ok(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.ok((await m.locator('#article').boundingBox()).width>(width<400?250:350));
  if(width>980){
   const sidebar=await m.locator('.sidebar').boundingBox(),main=await m.locator('main').boundingBox(),brand=await m.locator('.brand').boundingBox();
   assert.ok(sidebar.x<=65,'Desktop catalog should use the left margin');
   assert.ok(width-main.x-main.width<=65,'Desktop article should use the right margin');
   assert.ok(Math.abs(brand.x-sidebar.x)<1,'Header and catalog should align');
   assert.ok(main.x-sidebar.x-sidebar.width>=31,'Keep space between catalog and reading');
  }
  await m.screenshot({path:path.join(root,`work/verification/reader-redesign/${width}.png`)});
 }
 const off=await browser.newContext({javaScriptEnabled:false});const n=await off.newPage();await n.goto(base);
 assert.equal(await n.locator('#article h1').count(),1);assert.ok(await n.locator('#list a[href*="read/"]').count()>0);
 await n.goto(base+'read/primary/K043.html');assert.match(await n.locator('#article').innerText(),/不用先证明对学习有帮助/);
 for(const version of ['all','primary','secondary']){
  const files=fs.readdirSync(path.join(root,'dist/site/read',version));assert.equal(files.length,version==='primary'?79:83);
  for(const filename of files){const html=fs.readFileSync(path.join(root,'dist/site/read',version,filename),'utf8');
   for(const match of html.matchAll(/href="([^"#]+)(?:#[^"]*)?"/g)){const href=match[1];if(/^(https?:|mailto:)/.test(href))continue;assert.ok(fs.existsSync(path.resolve(root,'dist/site/read',version,decodeURIComponent(href))),version+'/'+filename+': '+href)}
  }
 }
 const legacy=await browser.newContext();await legacy.addInitScript(()=>{if(!sessionStorage.getItem('seeded')){localStorage.removeItem('youth-guide:large');localStorage.setItem('youth-guide:all:large','true');localStorage.setItem('youth-guide:primary:large','false');sessionStorage.setItem('seeded','yes')}});
 const old=await legacy.newPage();await old.goto(base+'#K043');await old.waitForFunction(()=>document.body.classList.contains('js-reader'));assert.equal(await old.locator('#font-size').getAttribute('aria-pressed'),'true');await old.locator('.edition-links a[data-mode="primary"]').click();await old.waitForFunction(()=>typeof modeName!=='undefined'&&modeName==='primary'&&document.body.classList.contains('js-reader'));assert.equal(await old.locator('#font-size').getAttribute('aria-pressed'),'true');
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS: context, missing/invalid links, search scope, grouped catalog, type, mobile reading, resizing and no-script pages');
} finally {if(browser)await browser.close();server.kill();}
