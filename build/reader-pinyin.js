// Ruby annotation works on DOM text nodes. It never reparses article text as HTML.
function createReadingPinyin({article,button,status,scriptURL,readPreference,savePreference,canAnnotate}) {
 let enabled=readPreference()==='true',revision=0,libraryPromise=null;
 const han=/\p{Script=Han}/u;
 function sync(){button.setAttribute('aria-pressed',String(enabled));button.textContent=enabled?'隐藏拼音':'显示拼音'}
 function clear(){
  revision++;
  for(const ruby of article.querySelectorAll('ruby[data-reading-char]'))ruby.replaceWith(document.createTextNode(ruby.dataset.readingChar));
  article.normalize();article.classList.remove('with-pinyin');button.removeAttribute('aria-busy');status.textContent='';
 }
 function loadLibrary(){
  if(window.pinyinPro?.pinyin)return Promise.resolve(window.pinyinPro.pinyin);
  if(libraryPromise)return libraryPromise;
  libraryPromise=new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.src=scriptURL;script.async=true;
   const timer=setTimeout(()=>{script.remove();reject(new Error('拼音加载超时'))},12000);
   script.onload=()=>{clearTimeout(timer);if(window.pinyinPro?.pinyin)resolve(window.pinyinPro.pinyin);else reject(new Error('拼音组件不可用'))};
   script.onerror=()=>{clearTimeout(timer);script.remove();reject(new Error('拼音组件未能加载'))};document.head.append(script);
  }).catch(error=>{libraryPromise=null;throw error});return libraryPromise;
 }
 function annotateBlock(block,pinyin){
  const walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT,{acceptNode:node=>node.parentElement.closest('ruby,rt,rp,script,style,pre,code,kbd,samp,textarea,button')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
  const nodes=[];let node,offset=0;while((node=walker.nextNode())){nodes.push({node,start:offset});offset+=node.textContent.length}
  const text=nodes.map(item=>item.node.textContent).join('');if(!han.test(text))return;
  const data=pinyin(text,{type:'all',toneType:'symbol',nonZh:'spaced'}),syllables=new Map();let cursor=0;
  // origin also preserves emoji and non-Chinese text, so offsets use UTF-16 lengths.
  for(const item of data){if(item.isZh&&[...item.origin].length===1&&item.pinyin&&item.pinyin!==item.origin)syllables.set(cursor,item.pinyin);cursor+=item.origin.length}
  if(cursor!==text.length)throw new Error('拼音与正文位置不一致');
  for(const item of nodes){
   const fragment=document.createDocumentFragment();let position=item.start;
   for(const char of item.node.textContent){
    const sound=syllables.get(position);position+=char.length;
    if(!sound||!han.test(char)){fragment.append(document.createTextNode(char));continue}
    const ruby=document.createElement('ruby');ruby.dataset.readingChar=char;ruby.append(document.createTextNode(char));
    const before=document.createElement('rp');before.textContent='(';before.setAttribute('aria-hidden','true');
    const rt=document.createElement('rt');rt.textContent=sound;rt.setAttribute('aria-hidden','true');
    const after=document.createElement('rp');after.textContent=')';after.setAttribute('aria-hidden','true');
    ruby.append(before,rt,after);fragment.append(ruby);
   }
   item.node.replaceWith(fragment);
  }
 }
 async function refresh(){
  clear();if(!enabled||!canAnnotate())return;const request=revision;
  button.setAttribute('aria-busy','true');status.textContent='正在准备拼音…';
  try{
   const pinyin=await loadLibrary();if(request!==revision||!enabled||!canAnnotate())return;
   for(const block of article.querySelectorAll('h1,h2,h3,h4,p,li,summary,td,th'))annotateBlock(block,pinyin);
   article.classList.add('with-pinyin');button.removeAttribute('aria-busy');status.textContent='';
  }catch(error){
   if(request!==revision)return;
   clear();enabled=false;savePreference('false');sync();status.textContent='拼音暂时无法显示，已恢复原文。可以稍后再试。';
   console.error('Pinyin annotation failed:',error);
  }
 }
 button.addEventListener('click',()=>{enabled=!enabled;savePreference(String(enabled));sync();void refresh()});sync();
 return {clear,refresh};
}
