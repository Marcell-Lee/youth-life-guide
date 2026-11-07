import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..');
const server=spawn(process.execPath,['build/preview.cjs'],{cwd:root,stdio:['ignore','pipe','pipe']});let browser;
try{
 await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('Preview did not start')})]);browser=await chromium.launch();
 const context=await browser.newContext({viewport:{width:375,height:900}});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));const requests=[];p.on('request',r=>requests.push(r.url()));
 await p.goto('http://127.0.0.1:4173/#K001');
 const plain=()=>p.locator('#article').evaluate(e=>{const copy=e.cloneNode(true);copy.querySelectorAll('rt,rp').forEach(n=>n.remove());return copy.textContent});
 const before=await plain();assert.equal(await p.locator('#article ruby').count(),0);assert.ok(!requests.some(url=>url.includes('reading-pinyin.js')));
 await p.locator('#pinyin-toggle').click();await p.waitForSelector('#article ruby rt');assert.equal(await p.locator('#pinyin-toggle').getAttribute('aria-pressed'),'true');assert.equal(await plain(),before);
 assert.ok(await p.locator('#article h1 rt').count()>8);
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 const sounds=await p.locator('#article h1 rt').allTextContents();assert.equal(sounds[3],'xiě');assert.equal(sounds[8],'de');
 await p.locator('.catalog-trigger').click();await p.locator('#search').fill('困');await p.locator('#list a[href="#K001"]').click();await p.waitForSelector('#article mark ruby');assert.ok(await p.locator('#article mark rt').count()>0);
 await p.locator('#pinyin-toggle').click();assert.equal(await p.locator('#article ruby').count(),0);assert.equal(await plain(),before);
 await p.locator('#pinyin-toggle').click();await p.waitForSelector('#article ruby');await p.locator('.edition-links a[data-mode="primary"]').click();await p.waitForFunction(()=>typeof modeName!=='undefined'&&modeName==='primary'&&document.querySelector('#article rt'));assert.equal(new URL(p.url()).hash,'#K001');
 await p.reload();await p.waitForSelector('#article rt');assert.equal(await p.locator('#pinyin-toggle').getAttribute('aria-pressed'),'true');
 const sample=await p.evaluate(()=>{
  const host=document.createElement('p');host.innerHTML='音乐、快乐、<strong>成长</strong>、<mark>长</mark>大、银行、我🙂喜欢AI';document.getElementById('article').append(host);return host.textContent;
 });
 await p.evaluate(()=>readingPinyin.refresh());
 const rubric=await p.locator('#article p').last().evaluate(e=>[...e.querySelectorAll('ruby')].map(r=>[r.dataset.readingChar,r.querySelector('rt').textContent]));
 assert.ok(rubric.some(([char,sound])=>char==='乐'&&sound==='yuè'));assert.ok(rubric.some(([char,sound])=>char==='乐'&&sound==='lè'));assert.ok(rubric.some(([char,sound])=>char==='长'&&sound==='zhǎng'));assert.ok(rubric.some(([char,sound])=>char==='行'&&sound==='háng'));assert.ok(sample.includes('🙂'));
 fs.mkdirSync(path.join(root,'work/verification/pinyin'),{recursive:true});
 for(const width of [320,375,414,768,1440]){await p.setViewportSize({width,height:900});await p.goto('http://127.0.0.1:4173/?width='+width+'#K001');await p.waitForSelector('#article rt');assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:path.join(root,'work/verification/pinyin/'+width+'.png')})}
 await p.locator('#pinyin-toggle').click();assert.equal(await p.locator('#article ruby').count(),0);
 const off=await browser.newContext();await off.route('**/assets/reading-pinyin.js',r=>r.abort());const failed=await off.newPage();await failed.goto('http://127.0.0.1:4173/');await failed.locator('#pinyin-toggle').click();await failed.waitForFunction(()=>document.getElementById('reading-status').textContent.includes('恢复原文'));assert.equal(await failed.locator('#article ruby').count(),0);
 const delayed=await browser.newContext();let release;const gate=new Promise(resolve=>release=resolve);await delayed.route('**/assets/reading-pinyin.js',async route=>{await gate;await route.continue()});
 const race=await delayed.newPage();await race.goto('http://127.0.0.1:4173/#K001');await race.locator('#pinyin-toggle').click();await race.waitForFunction(()=>document.getElementById('pinyin-toggle').getAttribute('aria-busy')==='true');
 await race.locator('#pinyin-toggle').click();await race.evaluate(()=>location.hash='#K043');release();await race.waitForFunction(()=>window.pinyinPro&&document.querySelector('#article h1').textContent.includes('兴趣'));assert.equal(await race.locator('#article ruby').count(),0);
 await race.locator('#pinyin-toggle').click();await race.waitForSelector('#article rt');assert.equal(await race.locator('#pinyin-toggle').getAttribute('aria-pressed'),'true');
 const file=await browser.newPage();await file.goto(pathToFileURL(path.join(root,'dist/site/index.html')).href+'#K043');await file.locator('#pinyin-toggle').click();await file.waitForSelector('#article rt');assert.equal(await file.locator('#pinyin-toggle').getAttribute('aria-pressed'),'true');
 assert.deepEqual(errors,[]);console.log('PASS: pinyin toggle, lazy local bundle, tones/context, markup preservation, search, editions, responsive layout, file/offline and failure recovery');
}finally{if(browser)await browser.close();server.kill()}
