const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {marked} = require('marked');

const root = path.resolve(__dirname, '..');
const baseUrl = 'https://marcell-lee.github.io/youth-life-guide/';
const repoUrl = 'https://github.com/Marcell-Lee/youth-life-guide';
const files = {all:'文章.md', primary:'小学版.md', secondary:'中学版.md', evidence:'依据与核查.md'};
const pages = {all:'离线阅读版.html', primary:'小学版-离线试读.html', secondary:'中学版-离线试读.html'};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const urlFor = relative => new URL(relative.split('/').map(encodeURIComponent).join('/'), baseUrl).href;

function hashTree(directory, prefix = '') {
  const entries = fs.readdirSync(directory, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'));
  return Object.fromEntries(entries.flatMap(entry => {
    if (entry.isSymbolicLink()) throw new Error('发布目录不允许符号链接：'+entry.name);
    const relative = prefix + entry.name;
    if (entry.isDirectory()) return Object.entries(hashTree(path.join(directory,entry.name),relative+'/'));
    return [[relative,sha256(fs.readFileSync(path.join(directory,entry.name)))]];
  }));
}

function rewriteLinks(markdown, id, mode) {
  // Preserve examples verbatim even when they contain the same text as a real link.
  let sentinel = '\u0000guide-code-';
  while (markdown.includes(sentinel)) sentinel += '-';
  const code = [];
  marked.walkTokens(marked.lexer(markdown), token => {
    if (token.type === 'code' || token.type === 'codespan') code.push(token.raw);
  });
  const protectedCode = [...new Set(code)].sort((a,b)=>b.length-a.length).map((raw,i)=>({raw,key:sentinel+i+'\u0000'}));
  for (const {raw,key} of protectedCode) markdown = markdown.split(raw).join(key);
  function destination(href) {
    if (/^(https?:|mailto:)/i.test(href)) return href;
    if (href === '#evidence') return urlFor(`agent/topics/${id}/evidence.md`);
    const evidence = /^#evidence-(K\d{3})$/.exec(href);
    if (evidence) return urlFor(`agent/topics/${evidence[1]}/evidence.md`);
    if (/^#K\d{3}$/.test(href)) {
      const target = href.slice(1);
      if (!fs.existsSync(path.join(root,'topics',target,files[mode]))) return null;
      return urlFor(`agent/topics/${target}/${mode}.md`);
    }
    if (href.startsWith('#')) return href;
    const decoded = decodeURIComponent(href);
    const [relative, fragment] = decoded.split('#');
    const resolved = path.resolve(root,'topics',id,relative);
    const local = path.relative(root,resolved).split(path.sep).join('/');
    if (local.startsWith('reviews/') || local.startsWith('docs/')) return 'internal';
    const match = /^topics\/(K\d{3})\/(文章|小学版|中学版|依据与核查)\.md$/.exec(local);
    if (match) {
      const targetMode = Object.keys(files).find(key=>files[key]===match[2]+'.md');
      if (!fs.existsSync(resolved)) return null;
      return urlFor(`agent/topics/${match[1]}/${targetMode}.md`) + (fragment ? '#'+encodeURIComponent(fragment) : '');
    }
    if (/^(README|连续阅读版|小学版-目录|中学版-目录)\.md$/.test(local)) return urlFor('agent/index.md');
    throw new Error(`${id}: 无法映射链接 ${href}`);
  }
  // Change destinations discovered by the Markdown parser, preserving surrounding prose.
  const edits = new Map();
  marked.walkTokens(marked.lexer(markdown), token => {
    if (token.type !== 'link' && token.type !== 'image') return;
    const href = destination(token.href);
    if (href === token.href) return;
    if (!token.raw.includes('](')) throw new Error(`${id}: 请将引用式链接改为内联链接：${token.raw}`);
    edits.set(token.raw, href === null ? `${token.text}（该版本暂无此篇）` : href === 'internal' ? `${token.text}（内部记录未公开）` : token.raw.replace(/\]\(<?[^\s)>]+>?/, ']('+href));
  });
  for (const [before, after] of edits) markdown = markdown.split(before).join(after);
  for (const {raw,key} of protectedCode) markdown = markdown.split(key).join(raw);
  return markdown;
}

function buildAgent(site) {
  const commit = process.env.GITHUB_SHA || execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('无效发布提交');
  const byMode = {};
  for (const [mode, page] of Object.entries(pages)) {
    const html = fs.readFileSync(path.join(site,page),'utf8');
    const start = html.indexOf('const chapters=');
    const end = html.indexOf(';const modeName=',start);
    if (start < 0 || end < 0) throw new Error(page+': 缺少阅读数据');
    byMode[mode] = new Map(JSON.parse(html.slice(start+'const chapters='.length,end)).map(c=>[c.id,c]));
  }
  const topics = [];
  for (let i=1;i<=83;i++) {
    const id = 'K'+String(i).padStart(3,'0');
    const topic = {id, available_versions:[], versions:{}};
    for (const [mode, sourceName] of Object.entries(files)) {
      const sourcePath = `topics/${id}/${sourceName}`;
      if (!fs.existsSync(path.join(root,sourcePath))) {
        if (mode !== 'primary') throw new Error('缺少必需正文：'+sourcePath);
        continue;
      }
      const raw = fs.readFileSync(path.join(root,sourcePath));
      const chapter = byMode[mode]?.get(id);
      if (mode !== 'evidence' && (!chapter || chapter.sourceSha256 !== sha256(raw))) throw new Error(id+': 阅读页与源文件不一致');
      const text = mode === 'evidence' ? raw.toString('utf8').replace(/^\uFEFF/,'') : chapter.markdown;
      const markdown = rewriteLinks(text,id,mode);
      const output = `agent/topics/${id}/${mode}.md`;
      fs.mkdirSync(path.dirname(path.join(site,output)),{recursive:true});
      fs.writeFileSync(path.join(site,output),markdown,'utf8');
      const entry = {
        title:chapter?.title || text.match(/^#\s+(.+)$/m)?.[1],
        age_range:chapter?.ageRange || null,
        url:urlFor(output),
        reader_url:urlFor(pages[mode] || pages.all)+'#'+id,
        source_path:sourcePath,
        source_url:`${repoUrl}/blob/${commit}/`+sourcePath.split('/').map(encodeURIComponent).join('/'),
        source_sha256:sha256(raw), sha256:sha256(markdown),
      };
      if (mode !== 'evidence') {
        entry.reader_markdown_sha256 = sha256(chapter.markdown);
        topic.available_versions.push(mode);
      }
      topic.versions[mode] = entry;
    }
    topics.push(topic);
  }
  const catalog = {schema_version:1, commit, base_url:baseUrl, content_license:'CC-BY-4.0', age_note:'年龄来自稿件标注，不代表经过专业适龄审阅。综合版不设筛选范围。', topics};
  fs.writeFileSync(path.join(site,'agent/index.json'),JSON.stringify(catalog,null,2)+'\n');
  const lines = ['# 少年生活指南 · Agent 主题目录','',`发布提交：${commit}`,'','先选择相关主题，再完整阅读对应年龄版本和依据。小学稿缺失时，不将综合稿冒充小学稿。','', '| 编号 | 主题 | 版本与依据 |','|---|---|---|'];
  for (const topic of topics) {
    const links = Object.entries(topic.versions).map(([mode,item])=>`[${{all:'综合',primary:'小学',secondary:'中学',evidence:'依据'}[mode]}${item.age_range ? ` ${item.age_range.min}—${item.age_range.max}岁` : ''}](${item.url})`).join(' · ');
    lines.push(`| ${topic.id} | ${topic.versions.all.title.replaceAll('|','\\|')} | ${links} |`);
  }
  lines.push('',`正文：CC BY 4.0。署名：少年生活指南项目贡献者；[原项目](${repoUrl})。第三方材料保留各自权利。`,'');
  fs.writeFileSync(path.join(site,'agent/index.md'),lines.join('\n'));
  fs.mkdirSync(path.join(site,'skills/youth-life-guide'),{recursive:true});
  fs.copyFileSync(path.join(root,'skills/youth-life-guide/SKILL.md'),path.join(site,'skills/youth-life-guide/SKILL.md'));
  const hashes = {...hashTree(path.join(site,'agent'),'agent/'), ...hashTree(path.join(site,'skills'),'skills/')};
  fs.writeFileSync(path.join(site,'agent/manifest.json'),JSON.stringify({schema_version:1,commit,files:hashes},null,2)+'\n');
  console.log('Agent ready: 83 topics, 328 Markdown documents');
}

module.exports = {buildAgent, hashTree, rewriteLinks};
