// Shared by the offline reader, static pages and browser application.
const TOPIC_GROUPS = [
 {name:'学习与安排',ids:[1,16,36,37,38,39,40]},
 {name:'身体与日常',ids:[2,3,4,5,6,7,8,9,10,81,82]},
 {name:'情绪与求助',ids:[11,12,13,14,15,17,18,19,20]},
 {name:'朋友与同伴',ids:[21,22,23,24,25,26,27,28,29,30,83]},
 {name:'家庭与沟通',ids:[31,32,33,34,35,67]},
 {name:'休息与兴趣',ids:[41,42,43,44,45]},
 {name:'网络与手机',ids:[46,47,48,49,50]},
 {name:'零花钱与消费',ids:[51,52,53,54,55]},
 {name:'边界与安全',ids:[56,57,58,59,60,61,62,63,64,65]},
 {name:'支持与权益',ids:[66,68,69,70,71,72,73,74,75]},
 {name:'未来与生活技能',ids:[76,77,78,79,80]},
].map(group=>({...group,ids:group.ids.map(n=>'K'+String(n).padStart(3,'0'))}));
const covered=TOPIC_GROUPS.flatMap(g=>g.ids);
if(covered.length!==83||new Set(covered).size!==83)throw new Error('阅读目录分组必须完整覆盖 83 个主题');

function readerChapterHTML(chapter, mode, sectionState = {}) {
 const escape = value => value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
 const adultLabels=new Set(['成人与学校需要一起做的事','给成人的支持说明','给支持你的大人','给支持孩子的大人','给陪伴你的大人','给支持你的成年人','给陪伴 6—8 岁孩子的成年人','成人支持','大人和学校可以做什么']);
 const withAdultNotes=chapter.html.replace(/<h3>([\s\S]*?)<\/h3>\n?([\s\S]*?)(?=<h[23]>|$)/g,(full,title,body)=>{
  const label=title.replace(/<[^>]+>/g,'');
  const open=typeof sectionState.adult==='boolean'?sectionState.adult:mode==='all';
  return adultLabels.has(label)?`<details class="adult-note" data-audience="adult"${open?' open':''}><summary>${escape(label)}</summary><div>${body}</div></details>`:full;
 });
 const parts=withAdultNotes.replace('<p>综合正文</p>','').split(/(?=<h2>)/);
 const sections=parts.map((html,index)=>{
  const match=/^<h2>([\s\S]*?)<\/h2>\n?/.exec(html);
  if(!match)return {html};
  const heading=match[1].replace(/<[^>]+>/g,'');
  // Only explicit audience labels are folded. A child's heading may itself
  // mention adults (e.g. "6—8 岁：马上找能帮忙的大人"). Keep that guidance visible.
  const audience=mode==='all'&&/^(?:小学(?:版|读者)(?:[：:｜]|$)|(?:6[—－-]8|9[—－-]11)\s*岁)/.test(heading)?'primary':mode==='all'&&/^(?:中学(?:版|读者)(?:[：:｜]|$)|(?:9[—－-]17|12[—－-]17)\s*岁)/.test(heading)?'secondary':adultLabels.has(heading)?'adult':null;
  return {html,heading,headingHTML:match[1],audience,index,body:html.slice(match[0].length)};
 });
 return sections.map(section=>{
  if(!section.audience)return section.html;
  const expanded=typeof sectionState[section.audience]==='boolean'?sectionState[section.audience]:mode==='all';
  const open=expanded?' open':'';
  // headingHTML has already passed the same Markdown renderer as the article.
  return `<details class="reader-section" data-audience="${section.audience}"${open}><summary>${section.headingHTML}</summary><div class="section-body">${section.body}</div></details>`;
 }).join('');
}

module.exports={TOPIC_GROUPS,readerChapterHTML};
