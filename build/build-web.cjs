const fs = require('fs');
const path = require('path');
const {createHash} = require('node:crypto');
// Prefer a normal project dependency; the Codex bundled copy is a local fallback.
let marked;
try { ({ marked } = require('marked')); }
catch (error) {
 if (error.code !== 'MODULE_NOT_FOUND') throw error;
 const bundled = path.join(require('os').homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'marked');
 try { ({ marked } = require(bundled)); }
 catch { throw new Error('缺少 marked：请在项目中安装 marked，或使用包含该依赖的 Codex 工作区运行时。'); }
}
// Markdown is project content, but do not allow source HTML or executable URL schemes
// to become active markup in the generated offline reader.
const originalRenderer = new marked.Renderer();
marked.use({ renderer: {
 html({text}) { return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); },
 link(token) {
  // Only translate links to a chapter in this same reader; never expose arbitrary local paths.
  const chapterLink = /^\.\.\/(K\d{3})\/(文章|小学版|中学版)\.md$/.exec(token.href);
  if (chapterLink) {
   if (chapterLink[2] + '.md' !== mode.file || !selectedIds.includes(chapterLink[1])) return this.parser.parseInline(token.tokens) + '（当前版本暂无该篇）';
   return originalRenderer.link.call(this, {...token, href: '#' + chapterLink[1]});
  }
  if (!/^(https?:|mailto:|#)/i.test(token.href)) return this.parser.parseInline(token.tokens);
  return originalRenderer.link.call(this, token);
 }
}});
// Handle emphasis followed directly by Chinese text without altering URLs or code.
marked.use({ extensions: [{
 name: 'adjacentStrong', level: 'inline',
 start(src) { return src.indexOf('**'); },
 tokenizer(src) {
  const match = /^\*\*([^*\n]+)\*\*(?=\S)/.exec(src);
  if (match) return { type: 'adjacentStrong', raw: match[0], tokens: this.lexer.inlineTokens(match[1]) };
 },
 renderer(token) { return '<strong>' + this.parser.parseInline(token.tokens) + '</strong>'; }
}] });
const renderMarkdown = text => marked.parse(text);
const base = path.resolve(__dirname, '..');
const webOutput = process.env.GUIDE_WEB_OUTPUT;
const topics = path.join(base, 'topics');
const first = ['K001','K037','K039','K046','K011','K016','K006','K041','K023','K026','K051','K032'];
const expectedIds = Array.from({length:83}, (_, i) => `K${String(i + 1).padStart(3, '0')}`);
function validateTopicDirectories(entries) {
 const matches = entries.filter(entry => /^K\d{3}$/.test(entry.name));
 if (matches.some(entry => !entry.isDirectory())) throw new Error('主题必须是目录');
 const names = matches.map(entry => entry.name).sort();
 if (names.length !== expectedIds.length || names.some((name, i) => name !== expectedIds[i])) throw new Error('主题目录必须完整覆盖 K001–K083');
 return names;
}
const all = validateTopicDirectories(fs.readdirSync(topics, {withFileTypes:true}));
const ids = first.concat(all.filter(x => !first.includes(x)));
const modes = { all: {file:'文章.md',label:'完整主题',html:'离线阅读版.html',json:'chapters.json'}, primary: {file:'小学版.md',label:'小学版',html:'小学版-离线试读.html',json:'chapters-primary.json'}, secondary: {file:'中学版.md',label:'中学版',html:'中学版-离线试读.html',json:'chapters-secondary.json'} };
const modeName = process.argv[2] || 'all';
const mode = modes[modeName];
if (!mode) throw new Error('用法：node build-web.cjs [all|primary|secondary]');
const isFile = file => { try { return fs.statSync(file).isFile(); } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
const selectedIds = ids.filter(id => isFile(path.join(topics,id,mode.file)));
if (!selectedIds.length) throw new Error('没有对应分龄稿');
if (mode.file === '文章.md' && selectedIds.length !== ids.length) throw new Error('完整主题缺少文章文件，拒绝生成不完整版本');
// Source-controlled age data contains only declared ranges; uncertain entries never enter an age-filtered result.
const ageById = new Map();
if (modeName !== 'all') {
 for (const file of ['年龄范围A.json', '年龄范围B.json']) {
  const input = JSON.parse(fs.readFileSync(path.join(base, 'metadata', file), 'utf8'));
  if (!Array.isArray(input.items)) throw new Error(`${file}: 缺少主题记录`);
  for (const entry of input.items) {
   if (!entry || !/^K\d{3}$/.test(entry.id) || ageById.has(entry.id)) throw new Error(`${file}: 重复或无效主题`);
   ageById.set(entry.id, entry);
  }
 }
 if (ageById.size !== expectedIds.length || ids.some(id => !ageById.has(id))) throw new Error('年龄记录不完整');
 for (const id of ids) {
  const record = ageById.get(id);
  for (const [ageMode, filename] of [['primary','小学版.md'], ['secondary','中学版.md']]) {
   if (!Object.hasOwn(record, ageMode)) throw new Error(`${id}: 缺少 ${ageMode} 年龄记录`);
   if ((record[ageMode] !== null) !== isFile(path.join(topics,id,filename))) throw new Error(`${id}: ${ageMode} 稿件与年龄记录存在性不一致`);
  }
 }
}
const chapters = selectedIds.map(id => {
 const source=fs.readFileSync(path.join(topics,id,mode.file),'utf8').replace(/^\uFEFF/,'');
 let ageRange = null;
 if (modeName !== 'all') {
  const metadata = ageById.get(id)[modeName];
  if (!metadata || metadata.uncertain !== false) {
   // Null and explicitly uncertain records remain visible without an age selection only.
   if (metadata && metadata.uncertain !== true) throw new Error(`${id}: 年龄数据无效`);
  } else {
   const {min_age, max_age, evidence} = metadata;
   const floor = modeName === 'primary' ? 6 : 12, ceiling = modeName === 'primary' ? 11 : 17;
   if (!Number.isInteger(min_age) || !Number.isInteger(max_age) || min_age < floor || max_age > ceiling || min_age > max_age || typeof evidence !== 'string' || !evidence || !source.includes(evidence)) throw new Error(`${id}: 年龄记录与稿件不一致`);
   ageRange = {min: min_age, max: max_age};
  }
 }

 const crossReferences = new Set();
 // Keep age/co-reading information, but move repeated editorial status into About.
 const readingSource = source.split(/\r?\n/).map((line, index) => {
  // Editorial metadata occurs near the title. Never rewrite advice in the body.
  if (index > 7) return line;
  if (/^状态：.*(?:AI|未经过)/.test(line)) return line.replace(/^状态：[^。]*。/, '');
  if (!/内部(?:研究|试读)稿/.test(line)) return line;
  return line
   .replace(/内部研究稿(?: v[\d.]+)?(?:｜\d{4}-\d{2}-\d{2})?｜?/g, '')
   .replace(/｜\d{4}-\d{2}-\d{2}/g, '')
   .replace(/｜?内部(?:试读|研究)稿[，；。][^。]*(?:审阅|试读)[^。]*。/g, '')
   .replace(/(?:AI 资料整理与编辑；)?(?:尚未|未)经过[^。]*(?:审阅|试读)[^。]*。/g, '')
   .replace(/由 AI 检索和编辑，未经[^。]*公开定稿。/g, '')
   .replace(/^(?:条目：)?K\d{3}｜?/, '').replace(/｜$/, '');
 }).join('\n');
 const cleaned=readingSource.replace(/^# K\d{3}\s*[｜|]\s*/m, '# ')
   .replace(/\r?\n---\s*\r?\n\*\*阅读导航\*\*[\s\S]*$/,'')
   .replaceAll('(依据与核查.md)', '(#evidence)')
   .replace(/\(\.\.\/(K\d{3})\/依据与核查\.md\)/g, (_, target) => { crossReferences.add(target); return `(#evidence-${target})`; });
 let evidence=fs.readFileSync(path.join(topics,id,'依据与核查.md'),'utf8').replace(/^\uFEFF/,'');
 const extraEvidence = [...crossReferences].map(target => {
   const sourcePath=path.join(topics,target,'依据与核查.md');
   if (!fs.existsSync(sourcePath)) throw new Error(`${id} 引用的依据不存在：${target}`);
   const text=fs.readFileSync(sourcePath,'utf8').replace(/^\uFEFF/,'');
   return {target, html: renderMarkdown(text)};
 });
 const heading=source.split(/\r?\n/).find(x=>/^# /.test(x)).replace(/^#\s*/, '').replace(/^K\d{3}\s*[｜|]\s*/, '');
 const sourceSha256 = createHash('sha256').update(fs.readFileSync(path.join(topics,id,mode.file))).digest('hex');
 return {id,title:heading,markdown:cleaned,html:renderMarkdown(cleaned),evidenceHtml:renderMarkdown(evidence),extraEvidence,ageRange,sourceSha256};
});
const safe=JSON.stringify(chapters).replace(/</g,'\\u003c');
const page=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="从作业、朋友到情绪和成长，按具体问题查找可以先做的小事。少年生活指南，陪你一步一步找到办法。"><meta name="theme-color" content="#236452"><title>少年生活指南｜阅读版</title><style>
:root{color-scheme:light;--ink:#24352f;--muted:#53665e;--paper:#faf8f1;--line:#d5ddd4;--accent:#236452}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:"Microsoft YaHei",system-ui,sans-serif;line-height:1.85}a{color:#145f51}header{padding:20px max(24px,calc((100vw - 1120px)/2));background:#e1eee6;border-bottom:1px solid var(--line)}header strong{font-size:1.3rem}header p{margin:4px 0;color:var(--muted)}.layout{max-width:1120px;margin:auto;display:grid;grid-template-columns:300px 1fr;gap:40px;padding:32px 24px}select{width:100%;font:inherit;padding:9px;border:1px solid #95aa9d;border-radius:8px;margin-bottom:8px}aside{position:sticky;top:20px;max-height:calc(100vh - 40px);overflow:auto}input{width:100%;font:inherit;padding:9px;border:1px solid #95aa9d;border-radius:8px}ol{padding-left:25px}li{padding:4px 0}main{min-width:0;max-width:730px}article{font-size:1.08rem;overflow-wrap:anywhere}article h1{font-size:1.9rem;line-height:1.4}article h2{margin-top:2em;font-size:1.35rem}article h3{font-size:1.12rem}.age-match{display:inline-block;margin-left:.65em;padding:.15em .55em;border:2px solid #236452;border-radius:6px;background:#e1eee6;color:#174638;font-size:.72em;line-height:1.5;vertical-align:middle}article p{margin:1em 0}details{margin:2rem 0;border:1px solid var(--line);border-radius:8px;padding:12px 16px}summary{cursor:pointer;font-weight:bold}#catalog{margin:0 0 1rem}#catalog>summary{color:var(--accent)}#catalog[open]>summary{margin-bottom:1rem}details table{display:block;overflow-x:auto;border-collapse:collapse}details th,details td{border:1px solid var(--line);padding:6px}nav{display:flex;justify-content:space-between;gap:20px;border-top:1px solid var(--line);margin-top:32px;padding:20px 0}nav button{font:inherit;background:#236452;color:white;border:0;border-radius:8px;padding:9px 18px;cursor:pointer}button:disabled{opacity:.45;cursor:default}.notice{background:#fff4d4;border-left:4px solid #bb8c28;padding:12px 16px;font-size:.95rem}#count{color:var(--muted)}@media(max-width:760px){.layout{display:block;padding:22px 18px}aside{position:static;max-height:none;margin-bottom:25px}aside ol{max-height:220px;overflow:auto}header{padding:16px 18px}article h1{font-size:1.55rem}}@media print{aside,nav{display:none}.layout{display:block}body{background:white}}
${fs.readFileSync(path.join(__dirname,'reader.css'),'utf8')}</style></head><body>
<a class="skip-link" href="#article">跳到正文</a>
<header><div><strong>少年生活指南 · ${mode.label}</strong><p>遇到生活里的小难题，从这里找找办法。</p></div>
<div class="edition-links" aria-label="选择阅读版本"><a href="离线阅读版.html" ${modeName === 'all' ? 'aria-current="page"' : ''}>全部主题</a><a href="小学版-离线试读.html" ${modeName === 'primary' ? 'aria-current="page"' : ''}>小学版</a><a href="中学版-离线试读.html" ${modeName === 'secondary' ? 'aria-current="page"' : ''}>中学版</a><a href="#about">关于</a></div></header>
<div class="layout"><aside><details id="catalog" open><summary>选择文章、搜索${modeName === 'all' ? '' : '和年龄'}</summary>
${modeName === 'all' ? '' : `<label for="age">按年龄查看</label><select id="age" aria-describedby="age-hint"><option value="">不按年龄筛选</option>${Array.from({length:6},(_,i)=>i+(modeName === 'primary' ? 6 : 12)).map(age=>`<option value="${age}">${age} 岁</option>`).join('')}</select><p id="age-hint">按文章标注的年龄筛选；也可以请大人一起读。</p>`}
<label for="search">查找你关心的问题</label><input id="search" type="search" placeholder="例如：朋友、睡眠、求助"><p id="count" role="status"></p><ol id="list"></ol></details>
<details id="agent-entry"><summary>交给你的 AI</summary><p>让 AI 先查指南，再聊你关心的问题。</p><p><a href="https://marcell-lee.github.io/youth-life-guide/skills/youth-life-guide/SKILL.md">查看技能</a> · <a href="https://github.com/Marcell-Lee/youth-life-guide/blob/main/docs/agent使用说明.md">安装方法</a></p><button id="copy-agent" type="button">复制使用提示</button><p id="agent-copy-status" role="status"></p><textarea id="agent-prompt" aria-label="给 AI 的使用提示" rows="7" readonly hidden>请读取并使用 https://marcell-lee.github.io/youth-life-guide/skills/youth-life-guide/SKILL.md 。若不能安装，请在当前对话使用。先查相关正文与依据，按年龄回答，附主题出处和阅读链接。我的问题是：</textarea></details></aside>
<main><p id="age-message" role="status" tabindex="-1"></p><div class="reading-tools"><p id="progress" aria-live="polite"></p><button id="font-size" type="button" aria-pressed="false">大字阅读</button></div><article id="article" tabindex="-1"></article>
<details id="evidence"><summary>查看本篇依据与核查</summary><div id="evidence-content"></div></details><nav aria-label="章节导航"><button id="prev">← 上一篇</button><button id="next">下一篇 →</button></nav>
<details id="about"><summary>关于这份指南</summary><p>面向 6—17 岁的孩子及支持他们的大人。你可以按问题搜索，也可以选择小学版、中学版，逐篇阅读。</p><p>内容由 AI 辅助整理，提供一般生活建议。请参考每篇的年龄与共读提示；医疗、法律等具体问题请向相应专业人员求助。眼前有危险时，先联系能帮助你的安全成人或当地紧急服务。</p><p>阅读无需注册。此页面仅在当前浏览器保存最近阅读的文章和字号；不会主动上传阅读记录。清除浏览器数据会重置记录。</p><p>内容来源可在每篇末尾查看。原创正文采用 <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>；转载或改编请注明<a href="https://github.com/Marcell-Lee/youth-life-guide">少年生活指南项目贡献者与原项目</a>、许可及修改。第三方材料保留各自权利。</p></details>
<footer>少年生活指南 · 一次解决一个小问题</footer><noscript><p>请启用 JavaScript 查看文章、搜索和切换主题。</p></noscript></main></div><script>
document.getElementById('catalog').open=!window.matchMedia('(max-width:760px)').matches;
document.querySelector('.edition-links a[href="#about"]').addEventListener('click',()=>{document.getElementById('about').open=true});
document.getElementById('copy-agent').addEventListener('click',async()=>{const prompt=document.getElementById('agent-prompt'),status=document.getElementById('agent-copy-status');try{await navigator.clipboard.writeText(prompt.value);status.textContent='已复制，可以粘贴给你的 AI。'}catch{prompt.hidden=false;prompt.focus();prompt.select();status.textContent='请复制下方已选中的提示。'}});
const chapters=${safe};const modeName=${JSON.stringify(modeName)};const article=document.getElementById('article'),list=document.getElementById('list'),search=document.getElementById('search'),prev=document.getElementById('prev'),next=document.getElementById('next'),ageSelect=document.getElementById('age');let current=0, eligible=chapters.map((_,i)=>i);
const storageKey='youth-guide:'+modeName;
function readSetting(key){try{return localStorage.getItem(storageKey+key)}catch{return null}}
function saveSetting(key,value){try{localStorage.setItem(storageKey+key,value)}catch{}}
const fontButton=document.getElementById('font-size');
function setFont(large){document.body.classList.toggle('large-text',large);fontButton.setAttribute('aria-pressed',String(large));fontButton.textContent=large?'标准字号':'大字阅读'}
setFont(readSetting(':large')==='true');fontButton.onclick=()=>{const large=!document.body.classList.contains('large-text');setFont(large);saveSetting(':large',String(large))};
function markSelectedAge(){
 if(modeName!=='primary'||!ageSelect||!ageSelect.value)return;
 const age=Number(ageSelect.value);
 for(const heading of article.querySelectorAll('h2')){
  const match=/^(6—8|9—11) 岁(?:：|$)/.exec(heading.textContent.trim());
  if(!match||!(match[1]==='6—8'?age>=6&&age<=8:age>=9&&age<=11))continue;
  const label=document.createElement('span');label.className='age-match';label.textContent='与你选择的年龄相符';heading.append(' ',label);
 }
}
function show(i,scroll=true,historyMode='push'){
 if(!eligible.includes(i)) return;
 if(historyMode==='push') document.getElementById('age-message').textContent='';
 current=i;saveSetting(':chapter',chapters[i].id);for(const link of list.querySelectorAll('a')){if(link.hash==='#'+chapters[i].id)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current')}const position=eligible.indexOf(i);article.innerHTML=chapters[i].html;markSelectedAge();article.setAttribute('aria-label',chapters[i].title);document.getElementById('evidence-content').innerHTML=chapters[i].evidenceHtml+chapters[i].extraEvidence.map(e=>'<section id="evidence-'+e.target+'"><h2>补充依据：'+e.target+'</h2>'+e.html+'</section>').join('');document.getElementById('evidence').open=false;document.getElementById('evidence').hidden=false;document.getElementById('progress').textContent='第 '+(position+1)+' / '+eligible.length+' 篇';prev.disabled=position===0;next.disabled=position===eligible.length-1;document.title=chapters[i].title+'｜少年生活指南';const hash='#'+chapters[i].id;if(historyMode==='replace')history.replaceState(null,'',hash);else if(historyMode==='push' && location.hash!==hash)history.pushState(null,'',hash);if(scroll){article.focus({preventScroll:true});article.scrollIntoView({block:'start'});}
}
function render(){const q=search.value.trim().toLowerCase();const found=eligible.map(i=>({c:chapters[i],i})).filter(x=>(x.c.title+' '+x.c.id+' '+x.c.markdown).toLowerCase().includes(q));list.replaceChildren();for(const {c,i} of found){const li=document.createElement('li'),a=document.createElement('a');a.href='#'+c.id;a.textContent=c.title;a.onclick=e=>{e.preventDefault();show(i);if(window.matchMedia('(max-width:760px)').matches)document.getElementById('catalog').open=false};if(i===current)a.setAttribute('aria-current','page');li.append(a);list.append(li)}document.getElementById('count').textContent=found.length?'找到 '+found.length+' 个主题':'没有找到，试试更短的词，比如“朋友”或“作业”。';}
function filterAge(){const raw=ageSelect ? ageSelect.value : '';const age=raw === '' ? null : Number(raw);eligible=chapters.map((_,i)=>i).filter(i=>age===null || (chapters[i].ageRange && age>=chapters[i].ageRange.min && age<=chapters[i].ageRange.max));render();if(!eligible.length){article.textContent='这个年龄暂时没有已标注可读的主题。可以选择其他年龄或查看不按年龄筛选。';article.removeAttribute('aria-label');document.getElementById('evidence').hidden=true;document.getElementById('progress').textContent='没有符合年龄的主题';prev.disabled=true;next.disabled=true;history.replaceState(null,'',location.pathname+location.search);return}if(!eligible.includes(current)){if(ageSelect)document.getElementById('age-message').textContent='原文章未标注适合所选年龄，已切换到第一篇。';show(eligible[0],true,'replace');}else{if(ageSelect)document.getElementById('age-message').textContent='';show(current,false,'replace')}}
article.addEventListener('click',e=>{const link=e.target.closest('a');if(!link)return;const href=link.getAttribute('href');if(/^#evidence(?:-K\\d{3})?$/.test(href)){e.preventDefault();const details=document.getElementById('evidence');details.open=true;const target=document.getElementById(href.slice(1)) || details;target.scrollIntoView({block:'start'});details.querySelector('summary').focus({preventScroll:true});return}if(/^#K\\d{3}$/.test(href)){e.preventDefault();const i=chapters.findIndex(c=>'#'+c.id===href);if(i<0)return;if(!eligible.includes(i)){const message=document.getElementById('age-message');message.textContent='这篇文章未标注适合所选年龄；如需查看，请先更改年龄筛选。';message.focus({preventScroll:true});message.scrollIntoView({block:'center'});return}show(i)}});search.addEventListener('input',render);if(ageSelect)ageSelect.addEventListener('change',filterAge);prev.onclick=()=>show(eligible[eligible.indexOf(current)-1]);next.onclick=()=>show(eligible[eligible.indexOf(current)+1]);window.addEventListener('hashchange',()=>{const i=chapters.findIndex(c=>'#'+c.id===location.hash);if(i>=0&&eligible.includes(i)){document.getElementById('age-message').textContent='';show(i,true,'none')}else if(i>=0&&ageSelect){document.getElementById('age-message').textContent='历史中的文章未标注适合所选年龄；请更改年龄筛选后再查看。';history.replaceState(null,'','#'+chapters[current].id)} });render();let initial=chapters.findIndex(c=>'#'+c.id===(location.hash||'#'+readSetting(':chapter')));show(initial<0?0:initial,false,'replace');
</script></body></html>`;
const outputDir = webOutput ? path.resolve(webOutput) : path.join(base,'阅读版本');
fs.mkdirSync(outputDir, {recursive:true});
fs.writeFileSync(path.join(outputDir,mode.html),page,'utf8');
if (!webOutput) fs.writeFileSync(path.join(base,'build',mode.json),JSON.stringify(chapters,null,2),'utf8');
console.log(`Generated ${mode.label}: ${chapters.length} chapters`);
