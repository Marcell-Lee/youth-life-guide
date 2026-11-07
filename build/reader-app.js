/* Offline-first reader. Source content is already escaped by the build renderer. */
document.body.classList.add('js-reader');
const article=document.getElementById('article'),list=document.getElementById('list'),search=document.getElementById('search');
const prev=document.getElementById('prev'),next=document.getElementById('next'),catalog=document.getElementById('catalog');
const ageSelect=document.getElementById('age'),message=document.getElementById('age-message'),fontButton=document.getElementById('font-size');
const media=matchMedia('(max-width: 980px)');
const storageKey='youth-guide:'+modeName;
function readSetting(key){try{return localStorage.getItem(key)}catch{return null}}
function saveSetting(key,value){try{localStorage.setItem(key,value)}catch{}}
let current=-1,requestedId='',scope=[],words=[],routedURL='',mobileOpen=false;
const indexById=new Map(chapters.map((chapter,i)=>[chapter.id,i]));
const ordered=topicGroups.flatMap(group=>group.ids).map(id=>indexById.get(id)).filter(i=>i!==undefined);
const groupsOpen=new Set();
const searchText=chapters.map(c=>new DOMParser().parseFromString(c.html,'text/html').body.textContent.replace(/\s+/g,' ').trim());
const synonyms={睡眠:['睡眠','睡觉'],睡觉:['睡觉','睡眠']};
const terms=()=>search.value.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean).slice(0,12);
const options=word=>Object.hasOwn(synonyms,word)?synonyms[word]:[word];
function matches(text){const normalized=text.toLocaleLowerCase();return words.every(word=>options(word).some(value=>normalized.includes(value)))}
function eligibleIndices(){const age=ageSelect?.value;return ordered.filter(i=>!age||(chapters[i].ageRange&&Number(age)>=chapters[i].ageRange.min&&Number(age)<=chapters[i].ageRange.max))}

function updateURL(hash,replace=false){
 const url=new URL(location.href);url.hash=hash;
 if(search.value.trim())url.searchParams.set('q',search.value.trim());else url.searchParams.delete('q');
 if(ageSelect?.value)url.searchParams.set('age',ageSelect.value);else url.searchParams.delete('age');
 if(url.href!==location.href)history[replace?'replaceState':'pushState'](null,'',url.href);
 routedURL=location.href;
}
function updateEditionLinks(){
 const id=requestedId||(current>=0?chapters[current].id:'K001');
 for(const link of document.querySelectorAll('.edition-links a[data-mode]')){
  const params=new URLSearchParams();if(search.value.trim())params.set('q',search.value.trim());
  link.setAttribute('href',readerModes[link.dataset.mode].html+(params.size?'?'+params.toString():'')+'#'+id);
 }
}
function setFont(large){document.body.classList.toggle('large-text',large);fontButton.setAttribute('aria-pressed',String(large));fontButton.textContent=large?'标准字号':'大字阅读'}
const globalLarge=readSetting('youth-guide:large');
const initialLarge=(globalLarge??readSetting(storageKey+':large'))==='true';
setFont(initialLarge);
if(globalLarge===null)saveSetting('youth-guide:large',String(initialLarge));
fontButton.addEventListener('click',()=>{const large=!document.body.classList.contains('large-text');setFont(large);saveSetting('youth-guide:large',String(large))});
const readingPinyin=createReadingPinyin({article,button:document.getElementById('pinyin-toggle'),status:document.getElementById('reading-status'),scriptURL:pinyinScriptURL,readPreference:()=>readSetting('youth-guide:pinyin'),savePreference:value=>saveSetting('youth-guide:pinyin',value),canAnnotate:()=>current>=0});

function setCatalog(open,focus=false){
 mobileOpen=media.matches&&open;document.body.classList.toggle('catalog-open',mobileOpen);catalog.open=media.matches?mobileOpen:true;
 document.querySelector('.catalog-trigger').setAttribute('aria-expanded',String(catalog.open));
 if(focus&&open){search.focus({preventScroll:true});syncSelected(true)}
}
setCatalog(false);
media.addEventListener('change',()=>setCatalog(false));
document.querySelector('.catalog-trigger').addEventListener('click',event=>{event.preventDefault();setCatalog(!mobileOpen,true)});
document.getElementById('close-catalog').addEventListener('click',()=>{setCatalog(false);document.querySelector('.catalog-trigger').focus()});
catalog.addEventListener('toggle',()=>{
 if(media.matches&&!catalog.open){mobileOpen=false;document.body.classList.remove('catalog-open');document.querySelector('.catalog-trigger').setAttribute('aria-expanded','false')}
});

function syncSelected(scroll=false){
 for(const link of list.querySelectorAll('a')){
  const selected=current>=0&&link.hash==='#'+chapters[current].id;
  if(selected){link.setAttribute('aria-current','page');const group=link.closest('.topic-group');if(group){group.open=true;groupsOpen.add(group.dataset.group)}}else link.removeAttribute('aria-current');
 }
 if(!scroll)return;
 const selected=list.querySelector('a[aria-current]');if(!selected||!list.getClientRects().length)return;
 const a=selected.getBoundingClientRect(),b=list.getBoundingClientRect();
 if(a.top<b.top)list.scrollTop+=a.top-b.top-8;else if(a.bottom>b.bottom)list.scrollTop+=a.bottom-b.bottom+8;
}
function updateProgress(){
 const position=scope.indexOf(current),active=current>=0;
 const prefix=words.length?'搜索结果 ':'';
 document.getElementById('progress').textContent=!active?'请选择可用版本':position<0?'当前文章不在筛选结果中':prefix+(position+1)+' / '+scope.length+' 篇';
 prev.disabled=position<=0;next.disabled=position<0||position===scope.length-1;
 document.getElementById('clear-search').hidden=!search.value;
 updateEditionLinks();
}
function appendHighlighted(target,text){
 if(!words.length){target.append(document.createTextNode(text));return}
 const pieces=words.flatMap(options).sort((a,b)=>b.length-a.length).map(value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
 const regex=new RegExp(pieces.join('|'),'giu');let last=0;
 for(const match of text.matchAll(regex)){target.append(document.createTextNode(text.slice(last,match.index)));const mark=document.createElement('mark');mark.textContent=match[0];target.append(mark);last=match.index+match[0].length}
 target.append(document.createTextNode(text.slice(last)));
}
function snippet(i){const text=searchText[i],lower=text.toLocaleLowerCase();const hits=words.flatMap(options).map(word=>lower.indexOf(word)).filter(n=>n>=0);const start=hits.length?Math.max(0,Math.min(...hits)-28):0;return (start?'…':'')+text.slice(start,start+95)+(start+95<text.length?'…':'')}
function chapterLink(i,withSnippet=false){
 const link=document.createElement('a');link.href='#'+chapters[i].id;link.dataset.index=String(i);
 const title=document.createElement('span');title.className='result-title';appendHighlighted(title,chapters[i].title);link.append(title);
 if(withSnippet){const preview=document.createElement('span');preview.className='search-snippet';appendHighlighted(preview,snippet(i));link.append(preview)}
 return link;
}
function render(){
 for(const group of list.querySelectorAll('.topic-group')){if(group.open)groupsOpen.add(group.dataset.group);else groupsOpen.delete(group.dataset.group)}
 words=terms();scope=eligibleIndices().filter(i=>matches(chapters[i].title+' '+chapters[i].id+' '+searchText[i]));
 if(words.length)scope.sort((a,b)=>{const score=i=>words.reduce((n,word)=>n+(options(word).some(w=>chapters[i].title.toLocaleLowerCase().includes(w))?10:0),0);return score(b)-score(a)});
 list.replaceChildren();
 if(words.length){const results=document.createElement('ol');results.className='search-results';for(const i of scope){const item=document.createElement('li');item.append(chapterLink(i,true));results.append(item)}list.append(results)}
 else for(const [g,group] of topicGroups.entries()){
  const indices=group.ids.map(id=>indexById.get(id)).filter(i=>i!==undefined&&scope.includes(i));if(!indices.length)continue;
  const details=document.createElement('details');details.className='topic-group';details.dataset.group=String(g);details.open=groupsOpen.has(String(g));
  const summary=document.createElement('summary');summary.textContent=group.name;const count=document.createElement('span');count.className='group-count';count.textContent=String(indices.length);summary.append(count);details.append(summary);
  const ul=document.createElement('ul');for(const i of indices){const li=document.createElement('li');li.append(chapterLink(i));ul.append(li)}details.append(ul);list.append(details);
 }
 const total=scope.length;document.getElementById('count').textContent=total?(words.length?'找到 '+total+' 个主题':'共 '+total+' 个主题，按类别选择'):'没有找到；试试减少关键词，或分开输入，例如“手机 时间”。';
 syncSelected();updateProgress();markArticle(false);
}
function markArticle(openFirst){
 readingPinyin.clear();
 for(const mark of article.querySelectorAll('mark[data-search]'))mark.replaceWith(document.createTextNode(mark.textContent));article.normalize();
 if(!words.length||current<0){void readingPinyin.refresh();return}
 const walker=document.createTreeWalker(article,NodeFilter.SHOW_TEXT,{acceptNode:node=>node.parentElement.closest('script,style,button,textarea,mark')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
 const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
 for(const node of nodes){const fragment=document.createDocumentFragment();appendHighlighted(fragment,node.textContent);for(const mark of fragment.querySelectorAll('mark'))mark.dataset.search='true';node.replaceWith(fragment)}
 if(openFirst){const first=article.querySelector('mark[data-search]');let parent=first?.parentElement;while(parent&&parent!==article){if(parent.tagName==='DETAILS')parent.open=true;parent=parent.parentElement}}
 void readingPinyin.refresh();
}
function scrollToArticle(){article.focus({preventScroll:true});article.scrollIntoView({block:'start'})}
function show(i,scroll=true,historyMode='push'){
 if(!Number.isInteger(i)||!chapters[i])return;
 current=i;requestedId=chapters[i].id;saveSetting(storageKey+':chapter',requestedId);message.replaceChildren();
 article.innerHTML=readerChapterHTML(chapters[i],modeName,readSetting('youth-guide:audience')||'primary');article.setAttribute('aria-label',chapters[i].title);
 document.getElementById('evidence-content').innerHTML=chapters[i].evidenceHtml+chapters[i].extraEvidence.map(e=>'<section id="evidence-'+e.target+'"><h2>补充依据：'+e.target+'</h2>'+e.html+'</section>').join('');
 const evidence=document.getElementById('evidence');evidence.open=false;evidence.hidden=false;
 document.getElementById('static-link').href=staticBase+modeName+'/'+requestedId+'.html';
 document.getElementById('static-link').textContent='静态阅读当前篇章';
 document.title=chapters[i].title+'｜'+readerModes[modeName].label+'｜少年生活指南';
 if(historyMode!=='none')updateURL('#'+requestedId,historyMode==='replace');
 syncSelected();updateProgress();markArticle(words.length>0);
 requestAnimationFrame(()=>syncSelected(true));
 if(scroll){setCatalog(false);scrollToArticle()}
}
function showMissing(id){
 readingPinyin.clear();
 current=-1;requestedId=id;message.replaceChildren();article.replaceChildren();
 const topic=topicDirectory.find(t=>t.id===id),h1=document.createElement('h1');h1.textContent=topic?topic.title:'没有找到这个主题';article.append(h1);article.setAttribute('aria-label',h1.textContent);
 const text=document.createElement('p');text.textContent=topic?'这篇暂时没有'+readerModes[modeName].label+'。可以选择以下版本：':'这个链接中的主题编号不存在，可以从目录重新选择。';article.append(text);
 if(topic){const links=document.createElement('p');for(const version of topic.versions){const a=document.createElement('a');a.href=readerModes[version].html+'#'+id;a.textContent='查看'+readerModes[version].label;a.className='button-link';links.append(a)}article.append(links)}
 else {const a=document.createElement('a');a.href='#K001';a.textContent='从第一篇开始';article.append(a)}
 const staticLink=document.getElementById('static-link');staticLink.href=topic?staticBase+'all/'+id+'.html':staticBase+'index.html';staticLink.textContent=topic?'静态阅读综合版':'静态目录';
 document.getElementById('evidence').hidden=true;document.title='主题暂不可用｜少年生活指南';syncSelected();updateProgress();
}
function route(){
 if(routedURL===location.href)return;
 const url=new URL(location.href),hash=url.hash.slice(1);
 search.value=(url.searchParams.get('q')??(hash?'':readSetting('youth-guide:query'))??'').slice(0,200);
 if(ageSelect){const requested=url.searchParams.get('age')??readSetting(storageKey+':age')??'';ageSelect.value=[...ageSelect.options].some(o=>o.value===requested)?requested:''}
 render();
 if(/^K\d{3}$/.test(hash)){
  const index=indexById.get(hash);if(index===undefined)showMissing(hash);else show(index,false,'none');
 }else if(hash&&!['about','article','catalog','evidence'].includes(hash)&&!/^evidence-K\d{3}$/.test(hash))showMissing(hash);
 else {
  const saved=indexById.get(readSetting(storageKey+':chapter'));show(saved??ordered[0],false,'none');
  if(hash==='about'){const about=document.getElementById('about');about.open=true;requestAnimationFrame(()=>about.scrollIntoView({block:'start'}))}
  else if(hash==='catalog')setCatalog(true,true);
  else if(hash.startsWith('evidence')){const target=/^evidence-(K\d{3})$/.exec(hash);if(target&&indexById.has(target[1]))show(indexById.get(target[1]),false,'none');document.getElementById('evidence').open=true;requestAnimationFrame(()=>document.getElementById('evidence').scrollIntoView({block:'start'}))}
  else if(!hash)updateURL('#'+chapters[current].id,true);
 }
 routedURL=location.href;
}
list.addEventListener('click',event=>{const link=event.target.closest('a[data-index]');if(!link)return;event.preventDefault();show(Number(link.dataset.index))});
search.addEventListener('input',()=>{saveSetting('youth-guide:query',search.value);render();updateURL(location.hash,true)});
document.getElementById('search-form').addEventListener('submit',event=>{event.preventDefault();if(scope.length)show(scope[0])});
document.getElementById('clear-search').addEventListener('click',()=>{search.value='';saveSetting('youth-guide:query','');render();updateURL(location.hash,true);search.focus()});
if(ageSelect)ageSelect.addEventListener('change',()=>{saveSetting(storageKey+':age',ageSelect.value);render();updateURL(location.hash,true)});
prev.addEventListener('click',()=>show(scope[scope.indexOf(current)-1]));next.addEventListener('click',()=>show(scope[scope.indexOf(current)+1]));
article.addEventListener('click',event=>{
 const summary=event.target.closest('.reader-section>summary');if(summary){event.preventDefault();const details=summary.parentElement;const open=!details.open;for(const other of article.querySelectorAll('.reader-section'))other.open=false;details.open=open;if(open)saveSetting('youth-guide:audience',details.dataset.audience);return}
 const link=event.target.closest('a');if(!link)return;const href=link.getAttribute('href');
 if(/^#K\d{3}$/.test(href)){event.preventDefault();const id=href.slice(1),index=indexById.get(id);if(index===undefined){showMissing(id);updateURL(href)}else show(index)}
 else if(/^#evidence(?:-K\d{3})?$/.test(href)){event.preventDefault();const details=document.getElementById('evidence');details.open=true;const target=document.getElementById(href.slice(1))||details;target.scrollIntoView({block:'start'});details.querySelector('summary').focus({preventScroll:true})}
});
document.querySelector('.skip-link').addEventListener('click',event=>{event.preventDefault();scrollToArticle()});
document.querySelector('a[href="#about"]').addEventListener('click',()=>{document.getElementById('about').open=true});
const ai=document.getElementById('agent-entry');
document.getElementById('copy-agent').addEventListener('click',async()=>{
 const prompt=document.getElementById('agent-prompt'),status=document.getElementById('agent-copy-status');
 try{await navigator.clipboard.writeText(prompt.value);status.textContent='已复制，可以粘贴给你的 AI。'}catch{prompt.hidden=false;prompt.focus();prompt.select();status.textContent='请复制下方已选中的提示。'}
});
document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;if(ai.open){ai.open=false;ai.querySelector('summary').focus()}else if(mobileOpen){setCatalog(false);document.querySelector('.catalog-trigger').focus()}});
document.addEventListener('click',event=>{if(ai.open&&!ai.contains(event.target))ai.open=false;if(mobileOpen&&!event.target.closest('.sidebar,.catalog-trigger'))setCatalog(false)});
new ResizeObserver(entries=>{document.documentElement.style.setProperty('--header-height',entries[0].target.getBoundingClientRect().height+'px')}).observe(document.querySelector('header'));
window.addEventListener('hashchange',route);window.addEventListener('popstate',route);route();
