/* Publish the reader and allowlisted agent resources; keep author review data local. */
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {buildAgent, hashTree} = require('./build-agent.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist', 'site');
fs.mkdirSync(path.dirname(output), {recursive:true});
const stage = fs.mkdtempSync(path.join(root, 'dist', '.site-'));
const pages = ['离线阅读版.html', '小学版-离线试读.html', '中学版-离线试读.html'];
try {
 for (const mode of ['all', 'primary', 'secondary']) {
  execFileSync(process.execPath, [path.join(__dirname, 'build-web.cjs'), mode], {
   cwd:root, env:{...process.env, GUIDE_WEB_OUTPUT:stage}, stdio:'inherit'
  });
 }
 fs.copyFileSync(path.join(stage, pages[0]), path.join(stage, 'index.html'));
 fs.writeFileSync(path.join(stage, '404.html'), '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>没有找到这页｜少年生活指南</title><body style="font-family:system-ui;max-width:38rem;margin:12vh auto;padding:24px;line-height:1.8"><h1>这页走丢了</h1><p>可以回到目录，重新找找你关心的问题。</p><a href="./">回到少年生活指南</a></body></html>');
 fs.writeFileSync(path.join(stage, '_headers'), '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Content-Security-Policy: default-src \'none\'; script-src \'self\' \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src https: data:; base-uri \'none\'; form-action \'none\'; frame-ancestors \'none\'\n  Cache-Control: public, max-age=0, must-revalidate\n');
 buildAgent(stage);
 fs.writeFileSync(path.join(stage,'.nojekyll'),'');
 const hashes = hashTree(stage);
 fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify({version:1, files:hashes}, null, 2)+'\n');
 // The fixed output is generated-only. Reject symlinks before replacing it.
 if (fs.existsSync(output) && (!fs.lstatSync(output).isDirectory() || fs.lstatSync(output).isSymbolicLink())) throw new Error('dist/site 必须是普通目录');
 const previous = output + '.previous';
 if (fs.existsSync(previous)) throw new Error('dist/site.previous 已存在，请先检查上次构建');
 if (fs.existsSync(output)) fs.renameSync(output, previous);
 try { fs.renameSync(stage, output); }
 catch (error) { if (fs.existsSync(previous)) fs.renameSync(previous, output); throw error; }
 if (fs.existsSync(previous)) fs.rmSync(previous, {recursive:true});
 console.log('Website ready: dist/site');
} finally {
 if (fs.existsSync(stage)) fs.rmSync(stage, {recursive:true});
}
