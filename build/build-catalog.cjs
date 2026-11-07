// Checked-in discovery catalog for agents that can only read GitHub raw URLs.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const output = path.join(root,'docs/主题目录.md');
const modes = {all:'文章.md', primary:'小学版.md', secondary:'中学版.md', evidence:'依据与核查.md'};
const labels = {all:'综合',primary:'小学',secondary:'中学',evidence:'依据'};
const lines = ['# 少年生活指南 · 源码主题目录','','由 `npm run catalog` 从 topics/ 生成；正文仍以 topics/ 为准。','','| 编号 | 主题 | 正文与依据 |','|---|---|---|'];
for (let i=1;i<=83;i++) {
  const id='K'+String(i).padStart(3,'0');
  const source=fs.readFileSync(path.join(root,'topics',id,modes.all),'utf8');
  const title=source.match(/^#\s+(.+)$/m)?.[1].replace(/^K\d{3}\s*[｜|]\s*/,'');
  if (!title) throw new Error(id+': 缺少标题');
  const links=Object.entries(modes).filter(([,file])=>fs.existsSync(path.join(root,'topics',id,file)))
    .map(([mode,file])=>`[${labels[mode]}](../topics/${id}/${file})`).join(' · ');
  lines.push(`| ${id} | ${title.replaceAll('|','\\|')} | ${links} |`);
}
const markdown=lines.join('\n')+'\n';
if (process.argv.includes('--check')) {
  if (fs.readFileSync(output,'utf8').replaceAll('\r\n','\n')!==markdown) throw new Error('主题目录过期，请运行 npm run catalog 并提交更新');
} else {
  fs.writeFileSync(output,markdown);
  console.log('Updated docs/主题目录.md');
}
