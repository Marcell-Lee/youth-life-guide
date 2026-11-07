const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../dist/site');
const headers = Object.fromEntries(fs.readFileSync(path.join(root,'_headers'),'utf8').split('\n').filter(line=>line.startsWith('  ')).map(line=>{
 const split = line.indexOf(':');
 return [line.slice(0,split).trim(), line.slice(split+1).trim()];
}));
http.createServer((req,res) => {
 for(const [name,value] of Object.entries(headers)) res.setHeader(name,value);
 let requested;
 try { requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
 catch { res.writeHead(400).end(); return; }
 const file = path.resolve(root, '.' + (requested === '/' ? '/index.html' : requested));
 if (!file.startsWith(root + path.sep) || !/\.(html|json|md|js|txt)$/.test(file)) { res.writeHead(404).end(); return; }
 fs.readFile(file, (error,data) => {
  if (error) { res.writeHead(404, {'Content-Type':'text/html; charset=utf-8'}); res.end(fs.readFileSync(path.join(root,'404.html'))); return; }
  const type = {'.json':'application/json', '.md':'text/markdown', '.html':'text/html', '.js':'application/javascript', '.txt':'text/plain'}[path.extname(file)];
  res.writeHead(200, {'Content-Type':type+'; charset=utf-8','X-Content-Type-Options':'nosniff'});res.end(data);
 });
}).listen(4173, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:4173'));
