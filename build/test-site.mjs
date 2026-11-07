import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..');
const site = path.join(root,'dist/site');
const manifest = JSON.parse(fs.readFileSync(path.join(site,'manifest.json'),'utf8'));
for (const [name, hash] of Object.entries(manifest.files)) assert.equal(createHash('sha256').update(fs.readFileSync(path.join(site,name))).digest('hex'),hash);
assert.deepEqual(fs.readdirSync(site).sort(), ['.nojekyll','agent','skills','read','404.html','_headers','index.html','manifest.json','中学版-离线试读.html','小学版-离线试读.html','离线阅读版.html'].sort());
fs.mkdirSync(path.join(root,'work/verification'),{recursive:true});
const server = spawn(process.execPath, ['build/preview.cjs'], {cwd:root, stdio:['ignore','pipe','pipe']});
let browser;
try {
 await Promise.race([once(server.stdout,'data'), once(server,'exit').then(() => {throw new Error('Preview did not start')})]);
 browser = await chromium.launch({headless:true});
 const page = await browser.newPage({viewport:{width:375,height:812}});
 const errors = [];
 page.on('pageerror', e => errors.push(e.message));
 await page.goto('http://127.0.0.1:4173/');
 assert.match((await page.request.get('http://127.0.0.1:4173/')).headers()['content-security-policy'],/frame-ancestors 'none'/);
 assert.equal(await page.locator('#article h1').count(),1);
 assert.equal(await page.locator('.notice').count(),0);
 assert.equal(await page.locator('#about').evaluate(e=>e.open),false);
 assert.equal(await page.locator('#agent-entry').evaluate(e=>e.open),false);
 await page.locator('#agent-entry summary').click();
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedAgentPrompt=text}}}));
 await page.locator('#copy-agent').click();
 await page.waitForFunction(()=>document.getElementById('agent-copy-status').textContent.includes('已复制'));
 assert.equal(await page.evaluate(()=>window.copiedAgentPrompt),await page.locator('#agent-prompt').inputValue());
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('blocked')}}}));
 await page.locator('#copy-agent').click();
 await page.waitForFunction(()=>!document.getElementById('agent-prompt').hidden);
 assert.match(await page.locator('#agent-prompt').inputValue(),/skills\/youth-life-guide\/SKILL.md/);
 assert.equal((await page.request.get('http://127.0.0.1:4173/agent/index.json')).status(),200);
 const skillResponse=await page.request.get('http://127.0.0.1:4173/skills/youth-life-guide/SKILL.md');
 assert.equal(skillResponse.status(),200);
 assert.match(skillResponse.headers()['content-type'],/text\/markdown/);
 await page.locator('#agent-entry summary').click();
 // Check every rendered article, not just the initial page or hidden source data.
 await page.evaluate(() => {
  for(let i=0;i<chapters.length;i++) {
   show(i,false,'none');
   if (/内部研究稿|内部试读稿/.test(article.textContent)) throw new Error(chapters[i].id+': repeated editorial warning');
  }
 });
 await page.locator('.catalog-trigger').click();
 await page.locator('#search').fill('zzzz-no-match');
 assert.equal(await page.locator('#list a').count(),0);
 assert.match(await page.locator('#count').innerText(),/没有找到/);
 await page.locator('#search').fill('');
 await page.locator('#list a[href="#K037"]').evaluate(e=>e.closest('details').open=true);
 await page.locator('#list a[href="#K037"]').click();
 assert.equal(await page.locator('#catalog').evaluate(e=>e.open),false);
 await page.locator('#font-size').click();
 await page.goto('http://127.0.0.1:4173/');
 assert.equal(new URL(page.url()).hash,'#K037');
 assert.equal(await page.locator('#font-size').getAttribute('aria-pressed'),'true');
 await page.locator('.edition-links a').filter({hasText:'小学版'}).click();
 await page.waitForFunction(() => document.querySelectorAll('#list a').length === 79);
 assert.equal(await page.locator('#list a').count(),79);
 await page.locator('.edition-links a').filter({hasText:'中学版'}).click();
 await page.waitForFunction(() => document.querySelectorAll('#list a').length === 83);
 assert.equal(await page.locator('#list a').count(),83);
 assert.equal((await page.request.get('http://127.0.0.1:4173/missing')).status(),404);
 assert.equal(errors.length,0,errors.join('\n'));
 await page.goto('http://127.0.0.1:4173/');
 await page.screenshot({path:path.join(root,'work/verification/site-mobile.png'),fullPage:false});
 await page.setViewportSize({width:1440,height:900});
 await page.reload();
 await page.screenshot({path:path.join(root,'work/verification/site-desktop.png'),fullPage:false});
 // Private / blocked storage must not prevent reading.
 const context = await browser.newContext();
 await context.addInitScript(() => Object.defineProperty(window,'localStorage',{get(){throw new Error('disabled')}}));
 const privatePage = await context.newPage();
 await privatePage.goto('http://127.0.0.1:4173/');
 assert.equal(await privatePage.locator('#article h1').count(),1);
 console.log('PASS: manifest, public files, HTTP reading, clean copy, search, mobile navigation, resume, typography, editions, 404, blocked storage');
} finally {
 if(browser) await browser.close();
 server.kill();
}
