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
const modes = { all: {file:'文章.md',label:'综合版',html:'离线阅读版.html',json:'chapters.json'}, primary: {file:'小学版.md',label:'小学版',html:'小学版-离线试读.html',json:'chapters-primary.json'}, secondary: {file:'中学版.md',label:'中学版',html:'中学版-离线试读.html',json:'chapters-secondary.json'} };
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
const {TOPIC_GROUPS,readerChapterHTML}=require('./reader-view.cjs');
const escapeHTML=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const json=value=>JSON.stringify(value).replace(/</g,'\\u003c');
const topicDirectory=expectedIds.map(id=>({id,title:fs.readFileSync(path.join(topics,id,'文章.md'),'utf8').split(/\r?\n/).find(line=>/^# /.test(line)).replace(/^#\s*(?:K\d{3}\s*[｜|]\s*)?/,''),versions:Object.entries(modes).filter(([,item])=>isFile(path.join(topics,id,item.file))).map(([name])=>name)}));
const style=fs.readFileSync(path.join(__dirname,'reader.css'),'utf8');
const ageRanges=new Set(chapters.filter(c=>c.ageRange).map(c=>c.ageRange.min+'-'+c.ageRange.max));
const hasAgeFilter=modeName!=='all'&&ageRanges.size>1;
const staticPrefix=webOutput?'read/':'https://marcell-lee.github.io/youth-life-guide/read/';
const staticCatalog=TOPIC_GROUPS.map(group=>`<details class="topic-group"><summary>${escapeHTML(group.name)}</summary><ul>${group.ids.filter(id=>selectedIds.includes(id)).map(id=>{const chapter=chapters.find(c=>c.id===id);return `<li><a href="${staticPrefix}${modeName}/${id}.html">${escapeHTML(chapter.title)}</a></li>`}).join('')}</ul></details>`).join('');
const safe=json(chapters);
const page=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="从学习、朋友到情绪和成长，按具体问题查找可以先做的小事。少年生活指南，陪你找到办法。"><meta name="theme-color" content="#236452"><title>少年生活指南｜${mode.label}</title><style>${style}</style></head><body>
<a class="skip-link" href="#article">跳到正文</a>
<header><div class="header-inner"><div class="brand"><strong>少年生活指南</strong><span class="edition-tag">${mode.label}</span></div><nav class="edition-links" aria-label="阅读版本">${Object.entries(modes).map(([name,item])=>`<a data-mode="${name}" href="${item.html}" ${name===modeName?'aria-current="page"':''}>${item.label}</a>`).join('')}</nav><div class="header-actions"><a class="catalog-trigger js-only" href="#catalog" aria-controls="catalog" aria-expanded="false">目录</a><a href="#about">关于</a></div></div></header>
<div class="layout"><aside class="sidebar" aria-label="文章目录"><details id="catalog"><summary>找一篇文章</summary><button id="close-catalog" class="js-only" type="button">收起</button>
<form id="search-form" class="js-only" role="search"><label for="search">搜索问题或关键词</label><div class="search-input"><input id="search" type="search" maxlength="200" placeholder="朋友、作业，或“手机 时间”" autocomplete="off"><button id="clear-search" type="button" hidden>清空</button></div></form>
${hasAgeFilter?`<div class="age-filter js-only"><label for="age">按稿件标注年龄筛选</label><select id="age"><option value="">全部已标注年龄</option>${Array.from({length:6},(_,i)=>i+(modeName==='primary'?6:12)).map(age=>`<option value="${age}">${age} 岁</option>`).join('')}</select></div>`:''}
<p id="count" class="js-only" role="status"></p><div id="list">${staticCatalog}</div></details></aside>
<main><p id="age-message" role="status" tabindex="-1"></p><div class="reading-tools js-only"><p id="progress" aria-live="polite"></p><div class="reader-actions"><button id="font-size" type="button" aria-pressed="false">大字阅读</button><details id="agent-entry"><summary>交给 AI</summary><div class="agent-panel"><p>让 AI 先查指南，再回答你的问题。</p><p><a href="https://raw.githubusercontent.com/Marcell-Lee/youth-life-guide/main/skills/youth-life-guide/SKILL.md">查看技能</a> · <a href="https://github.com/Marcell-Lee/youth-life-guide/blob/main/docs/agent使用说明.md">安装方法</a></p><button id="copy-agent" type="button">复制使用提示</button><p id="agent-copy-status" role="status"></p><textarea id="agent-prompt" aria-label="给 AI 的使用提示" rows="6" readonly hidden>请读取并使用 https://raw.githubusercontent.com/Marcell-Lee/youth-life-guide/main/skills/youth-life-guide/SKILL.md 。若不能安装，请在当前对话使用。先查相关正文与依据，按年龄回答，附主题出处和阅读链接。我的问题是：</textarea></div></details></div></div>
<noscript><p class="no-script">当前显示本版本第一篇。其他文章可从<a href="${staticPrefix}index.html">静态目录</a>选择，无需 JavaScript。</p></noscript><article id="article" tabindex="-1">${readerChapterHTML(chapters[0],modeName)}</article>
<details id="evidence"><summary>查看本篇依据与核查</summary><div id="evidence-content">${chapters[0].evidenceHtml}</div></details><nav class="chapter-navigation js-only" aria-label="篇章导航"><button id="prev" type="button">← 上一篇</button><button id="next" type="button">下一篇 →</button></nav>
<details id="about"><summary>关于这份指南</summary><p>面向 6—17 岁的孩子及支持他们的大人。小学版、中学版分别阅读；综合版可按读者展开段落。每篇的年龄与共读提示以正文为准。</p><p>内容由 AI 辅助整理，提供一般生活建议。具体医疗、法律等问题请向相应专业人员核实。</p><p>阅读无需注册。浏览器会记住字号、最近篇章和搜索偏好，清除浏览器数据会重置记录。搜索词也会写入网址，方便刷新与切换版本；分享链接时会一并带上。</p><p>原创正文采用 <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>。转载或改编请注明<a href="https://github.com/Marcell-Lee/youth-life-guide">少年生活指南项目贡献者与原项目</a>、许可及修改。第三方材料保留各自权利。</p><p><a id="static-link" href="${staticPrefix}${modeName}/${chapters[0].id}.html">静态阅读当前篇章</a> · <a href="${staticPrefix}index.html">静态目录</a></p></details><footer>少年生活指南 · 一次解决一个小问题</footer></main></div>
<script>const chapters=${safe};const modeName=${json(modeName)};const topicGroups=${json(TOPIC_GROUPS)};const topicDirectory=${json(topicDirectory)};const readerModes=${json(modes)};const staticBase=${json(staticPrefix)};const readerChapterHTML=${readerChapterHTML.toString()};
${fs.readFileSync(path.join(__dirname,'reader-app.js'),'utf8')}
</script></body></html>`;
const outputDir=webOutput?path.resolve(webOutput):path.join(base,'阅读版本');
fs.mkdirSync(outputDir,{recursive:true});
fs.writeFileSync(path.join(outputDir,mode.html),page,'utf8');
if(!webOutput)fs.writeFileSync(path.join(base,'build',mode.json),JSON.stringify(chapters,null,2),'utf8');
if(webOutput){
 const staticDir=path.join(outputDir,'read',modeName);fs.mkdirSync(staticDir,{recursive:true});
 const order=TOPIC_GROUPS.flatMap(g=>g.ids).filter(id=>selectedIds.includes(id));
 for(const chapter of chapters){
  const title=escapeHTML(chapter.title),position=order.indexOf(chapter.id),topic=topicDirectory.find(t=>t.id===chapter.id);
  const previous=order[position-1],next=order[position+1];
  const versionLinks=topic.versions.map(version=>`<a href="../${version}/${chapter.id}.html">${modes[version].label}</a>`).join('');
  const staticPage=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}｜${mode.label}｜少年生活指南</title><meta name="description" content="少年生活指南 ${chapter.id} ${mode.label}：${title}"><style>${style}</style></head><body><header><div class="header-inner"><div class="brand"><strong>少年生活指南</strong><span class="edition-tag">${mode.label}</span></div><nav class="header-actions" aria-label="阅读入口"><a href="../index.html">目录</a><a href="../../${mode.html}#${chapter.id}">交互版</a></nav></div></header><main class="static-layout"><nav aria-label="读者版本">${versionLinks}</nav><article id="article">${readerChapterHTML(chapter,modeName)}</article><details id="evidence"><summary>本篇依据与核查</summary><div>${chapter.evidenceHtml}${chapter.extraEvidence.map(e=>`<section id="evidence-${e.target}">${e.html}</section>`).join('')}</div></details><nav aria-label="篇章导航">${previous?`<a href="${previous}.html">← 上一篇</a>`:''}<a href="../index.html">全部目录</a>${next?`<a href="${next}.html">下一篇 →</a>`:''}</nav><footer>原创正文采用 <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> · <a href="https://github.com/Marcell-Lee/youth-life-guide">少年生活指南项目贡献者</a></footer></main></body></html>`;
  fs.writeFileSync(path.join(staticDir,chapter.id+'.html'),staticPage.replace(/href="#(K\d{3})"/g,'href="$1.html"'));
 }
 if(modeName==='all'){
  const groups=TOPIC_GROUPS.map(group=>`<section><h2>${escapeHTML(group.name)}</h2><ul>${group.ids.map(id=>{const topic=topicDirectory.find(t=>t.id===id);return `<li>${escapeHTML(topic.title)}<br>${topic.versions.map(version=>`<a href="${version}/${id}.html">${modes[version].label}</a>`).join(' · ')}</li>`}).join('')}</ul></section>`).join('');
  fs.writeFileSync(path.join(outputDir,'read/index.html'),`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>静态目录｜少年生活指南</title><style>${style}</style></head><body><main class="static-layout static-catalog"><h1>少年生活指南 · 静态目录</h1><p>选择版本即可阅读，无需 JavaScript。<a href="../离线阅读版.html">返回交互阅读</a></p>${groups}</main></body></html>`);
 }
}
console.log(`Generated ${mode.label}: ${chapters.length} chapters`);
