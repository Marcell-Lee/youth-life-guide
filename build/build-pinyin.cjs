const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

function packageRoot(entry,name){
 let directory=path.dirname(entry);
 while(path.dirname(directory)!==directory){
  const metadata=path.join(directory,'package.json');
  if(fs.existsSync(metadata)&&JSON.parse(fs.readFileSync(metadata,'utf8')).name===name)return directory;
  directory=path.dirname(directory);
 }
 throw new Error('无法定位拼音依赖许可：'+name);
}

function buildPinyinBundle(){
 const pinyinEntry=require.resolve('pinyin-pro');
 const modernModule=require('@pinyin-pro/data/modern');
 const modern=modernModule.default??modernModule;
 const corpus=fs.readdirSync(path.join(root,'topics')).filter(id=>/^K\d{3}$/.test(id)).flatMap(id=>['文章.md','小学版.md','中学版.md'].map(name=>path.join(root,'topics',id,name)).filter(file=>fs.existsSync(file)).map(file=>fs.readFileSync(file,'utf8'))).join('\n');
 // Ship only entries used by this book, not the entire external dictionary.
 const subset=Object.fromEntries(Object.entries(modern).filter(([word])=>word.length>1&&corpus.includes(word)));
 const corrections=JSON.parse(fs.readFileSync(path.join(root,'metadata/pinyin-overrides.json'),'utf8'));
 const text=fs.readFileSync(pinyinEntry,'utf8')+'\n;pinyinPro.addDict('+JSON.stringify(subset)+');\npinyinPro.customPinyin('+JSON.stringify(corrections)+');\n';
 const license=['pinyin-pro (MIT)',fs.readFileSync(path.join(packageRoot(pinyinEntry,'pinyin-pro'),'LICENSE'),'utf8'),fs.readFileSync(path.join(__dirname,'third-party/pinyin-pro-data.LICENSE.txt'),'utf8')].join('\n\n');
 return {text,license,words:Object.keys(subset).length};
}
module.exports={buildPinyinBundle};
