import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {marked} from 'marked';

const root = path.resolve(import.meta.dirname, '..');
const site = path.join(root, 'dist/site');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = relative => fs.readFileSync(path.join(site, relative), 'utf8');
const catalog = JSON.parse(read('agent/index.json'));
const manifest = JSON.parse(read('agent/manifest.json'));
assert.equal(catalog.schema_version, 1);
assert.equal(catalog.topics.length, 83);
assert.equal(catalog.commit, manifest.commit);
assert.match(catalog.commit, /^[a-f0-9]{40}$/);
const counts = {all:0, primary:0, secondary:0, evidence:0};
const origin = new URL(catalog.base_url);
for (const topic of catalog.topics) {
  assert.equal(topic.available_versions.includes('primary'), !['K058','K059','K078','K079'].includes(topic.id));
  for (const [mode, item] of Object.entries(topic.versions)) {
    counts[mode]++;
    const bytes = fs.readFileSync(path.join(site, 'agent/topics', topic.id, mode+'.md'));
    assert.equal(hash(bytes), item.sha256);
    assert.equal(hash(fs.readFileSync(path.join(root, item.source_path))), item.source_sha256);
    assert.ok(item.title.length > 0);
    if (mode !== 'evidence') {
      assert.equal(new URL(item.reader_url).hash, '#'+topic.id);
      const page = read({all:'离线阅读版.html', primary:'小学版-离线试读.html', secondary:'中学版-离线试读.html'}[mode]);
      const start = page.indexOf('const chapters=') + 'const chapters='.length;
      const chapters = JSON.parse(page.slice(start, page.indexOf(';const modeName=', start)));
      const chapter = chapters.find(c => c.id === topic.id);
      assert.equal(chapter.sourceSha256, item.source_sha256);
      assert.equal(hash(chapter.markdown), item.reader_markdown_sha256);
      assert.deepEqual(chapter.ageRange, item.age_range);
    }
    marked.walkTokens(marked.lexer(bytes.toString()), token => {
      if (token.type !== 'link') return;
      assert.match(token.href, /^(https?:|mailto:|#)/, topic.id+': unresolved '+token.href);
      const url = new URL(token.href, item.url);
      if (url.origin !== origin.origin || !url.pathname.startsWith(origin.pathname)) return;
      const relative = decodeURIComponent(url.pathname.slice(origin.pathname.length));
      assert.ok(fs.existsSync(path.join(site, relative || 'index.html')), 'Broken local link: '+url.href);
    });
  }
}
assert.deepEqual(counts, {all:83, primary:79, secondary:83, evidence:83});
assert.equal(fs.existsSync(path.join(site,'agent/topics/K058/primary.md')),false);
assert.match(read('agent/topics/K043/primary.md'), /不用先证明对学习有帮助/);
assert.equal(read('skills/youth-life-guide/SKILL.md'),fs.readFileSync(path.join(root,'skills/youth-life-guide/SKILL.md'),'utf8'));
for (const [name, digest] of Object.entries(manifest.files)) assert.equal(hash(fs.readFileSync(path.join(site,name))),digest);
assert.ok(Object.keys(manifest.files).length > 330);
const {rewriteLinks} = await import('./build-agent.cjs');
assert.match(rewriteLinks('[依据](依据与核查.md)', 'K043', 'primary', site), /K043\/evidence.md/);
assert.match(rewriteLinks('[缺失](../K058/小学版.md)', 'K057', 'primary', site), /该版本暂无此篇/);
assert.throws(()=>rewriteLinks('[坏链接](../../不存在.md)', 'K043', 'all', site), /无法映射/);
assert.equal(rewriteLinks('[来源](https://example.com/a%20b)', 'K043', 'all', site),'[来源](https://example.com/a%20b)');
const example = '\n\n```markdown\n[依据](依据与核查.md)\n```\n\n`[依据](依据与核查.md)`';
assert.equal(rewriteLinks('[依据](依据与核查.md)'+example,'K043','all'),rewriteLinks('[依据](依据与核查.md)','K043','all')+example);
console.log('PASS: 328 agent documents, source/reader hashes, ages, links, missing editions, catalog and manifests');
