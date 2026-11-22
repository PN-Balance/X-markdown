import {layoutGitHistory} from './git-history.js';
import './dividers.js';
import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';
import footnotes from 'markdown-it-footnote';
import tasks from 'markdown-it-task-lists';

const el = id => document.getElementById(id);
const source = el('source'), preview = el('content');
const parser = new MarkdownIt('commonmark',{html:true,linkify:true})
  .enable(['table','strikethrough','linkify']).use(footnotes).use(tasks);
parser.core.ruler.after('github-task-lists','map-task-checkboxes',state=>{
  for(let i=2;i<state.tokens.length;i++){
    const inline=state.tokens[i],item=state.tokens[i-2];
    if(inline.type!=='inline'||item.type!=='list_item_open'||item.attrGet('class')!=='task-list-item')continue;
    const box=inline.children[0];
    box.type='task_checkbox';
    box.meta={line:inline.map[0],checked:box.content.includes('checked=""')};
  }
});
parser.renderer.rules.task_checkbox=(tokens,i)=>{
  const {line,checked}=tokens[i].meta;
  return '<input type="checkbox" class="task-list-item-checkbox" aria-label="任务状态" data-task-line="'+line+'"'+(checked?' checked':'')+'>';
};
// Raw document HTML may use presentation elements only. Editor-generated controls stay separate.
const safeTags=['p','div','span','section','article','aside','br','hr','strong','b','em','i','u','s','del','ins','small','sub','sup','kbd','code','pre','mark','blockquote','ul','ol','li','table','thead','tbody','tr','td','th','details','summary','figure','figcaption','a','img','h1','h2','h3','h4','h5','h6'];
const htmlPolicy={ALLOWED_TAGS:safeTags,ALLOWED_ATTR:['href','src','alt','title','colspan','rowspan','open','align','width','height'],ALLOW_DATA_ATTR:false,ALLOW_ARIA_ATTR:false};
parser.renderer.rules.html_block=(tokens,i)=>DOMPurify.sanitize(tokens[i].content,htmlPolicy);
parser.renderer.rules.html_inline=(tokens,i)=>{
  const raw=tokens[i].content, match=/^<(\/?)([a-z][a-z0-9]*)\b/i.exec(raw);
  if(!match||!safeTags.includes(match[2].toLowerCase()))return '';
  if(match[1])return '</'+match[2].toLowerCase()+'>';
  const safe=DOMPurify.sanitize(raw,htmlPolicy);
  return safe.replace(/<\/[a-z0-9]+>$/i,'');
};
const enabled = id => el(id).checked;
parser.inline.ruler.before('escape','math',(state,silent)=>{
  const start=state.pos;
  if (state.src[start]!=='$') return false;
  const delimiter=state.src.startsWith('$$',start)?'$$':'$';
  const end=state.src.indexOf(delimiter,start+delimiter.length);
  if(end<=start+delimiter.length) return false;
  if(!silent){
    const token=state.push('formula','span',0);
    token.content=state.src.slice(start+delimiter.length,end);
    token.block=delimiter.length===2;
  }
  state.pos=end+delimiter.length;
  return true;
});
parser.renderer.rules.formula=(tokens,i)=>'<span class="formula" data-block="'+tokens[i].block+'">'+parser.utils.escapeHtml(tokens[i].content)+'</span>';
const libraries=new Map();
function load(name){
  if(!libraries.has(name)) libraries.set(name,new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=name+'.js'; script.onload=resolve; script.onerror=reject;
    document.head.append(script);
  }));
  return libraries.get(name);
}
let renderCompletion=Promise.resolve();
let version=0,mode='split',timer,chart=0;
function diagramStyle(){
  const styles=getComputedStyle(document.documentElement);
  const accent=styles.getPropertyValue('--accent').trim()||'#9a8adb';
  const light=document.documentElement.hasAttribute('data-light');
  const custom=document.documentElement.hasAttribute('data-custom');
  const background=custom?el('background').value:light?'#fafafd':'#202128';
  const ink=custom?el('foreground').value:light?'#30313c':'#e7e6ef';
  function tint(color,weight){
    const channels=[1,3,5].map(i=>Math.round(parseInt(background.slice(i,i+2),16)*(1-weight)+parseInt(color.slice(i,i+2),16)*weight));
    return '#'+channels.map(n=>n.toString(16).padStart(2,'0')).join('');
  }
  const fill=tint(accent,.18),stroke=tint(accent,.62),line=tint(ink,.60);
  return {look:'classic',startOnLoad:false,securityLevel:'strict',theme:'base',suppressErrorRendering:true,
    fontFamily:'Segoe UI, Microsoft YaHei UI, sans-serif',
    gitGraph:{parallelCommits:false,rotateCommitLabel:false,showCommitLabel:true,showBranches:true},
    flowchart:{curve:'basis',nodeSpacing:32,rankSpacing:44,padding:14},
    themeVariables:{darkMode:!light,background,primaryColor:fill,primaryTextColor:ink,primaryBorderColor:stroke,lineColor:line,textColor:ink,
      secondaryColor:tint('#72aeac',.25),tertiaryColor:tint('#d4aa77',.23),mainBkg:fill,actorBkg:fill,actorBorder:stroke,actorTextColor:ink,
      signalColor:line,signalTextColor:ink,edgeLabelBackground:background,clusterBkg:tint(accent,.06),clusterBorder:tint(accent,.27),
      pie1:'#748dff',pie2:'#49d9be',pie3:'#ffa1b4',pie4:'#ffd375',pie5:'#b294ff',pie6:'#77ccff',
      pieOpacity:'1',pieStrokeColor:background,pieStrokeWidth:'2px',pieOuterStrokeWidth:'0px',pieSectionTextColor:'#17213a',pieLegendTextColor:ink,
      git0:'#588aff',git1:'#19ba9a',git2:'#b382ff',git3:'#f29c64',commitLabelColor:ink,commitLabelBackground:background}};
}
function finishDiagram(box){
  const svg=box.querySelector('svg');
  if(!svg||layoutGitHistory(svg))return;
  const background=getComputedStyle(box).backgroundColor;
  // Use a sibling in the label's own coordinates so nested SVG transforms are retained.
  const labels=svg.querySelectorAll('.edgeLabel foreignObject,.edgeLabel text,.relationshipLabel,.messageText,.transition text,.commit-label');
  for(const label of labels){
    if(!['text','foreignObject'].includes(label.localName)||!label.textContent.trim())continue;
    const bounds=label.getBBox();
    if(!bounds.width||!bounds.height)continue;
    const plate=document.createElementNS(svg.namespaceURI,'rect');
    for(const [key,value] of Object.entries({x:bounds.x-4,y:bounds.y-2,width:bounds.width+8,height:bounds.height+4,rx:5,fill:background}))
      plate.setAttribute(key,value);
    if(label.hasAttribute('transform'))plate.setAttribute('transform',label.getAttribute('transform'));
    plate.classList.add('edge-caption-plate');
    label.before(plate);
  }
}
function codeHeader(node){
  const label=document.createElement('span'),button=document.createElement('button'),bar=document.createElement('div'),frame=document.createElement('div');
  const language=[...node.classList].find(name=>name.startsWith('language-'));
  label.textContent=language?language.slice(9):'纯文本';
  button.textContent='复制';button.type='button';button.setAttribute('aria-label','复制代码');
  const original=node.textContent;
  button.onclick=async()=>{
    try{await navigator.clipboard.writeText(original);button.textContent='已复制';}
    catch{button.textContent='复制失败';}
    setTimeout(()=>{button.textContent='复制';},1400);
  };
  frame.className='code-frame';bar.className='code-bar';bar.append(label,button);
  const pre=node.parentElement;pre.replaceWith(frame);frame.append(bar,pre);
}
async function enhance(root){
  for(const node of root.querySelectorAll('.formula,pre code')){
    if(!node.isConnected) return;
    const text=node.textContent;
    try{
      if(node.classList.contains('formula')){
        await load('katex');
        if(!el('mathStyles')){const css=document.createElement('link');css.id='mathStyles';css.rel='stylesheet';css.href='katex.css';document.head.append(css);}
        window.katex.render(text,node,{displayMode:node.dataset.block==='true',throwOnError:false});
      } else if(node.classList.contains('language-mermaid')){
        await load('mermaid');
        if(!node.isConnected) return;
        window.mermaid.initialize(diagramStyle());
        const result=await window.mermaid.render('chart'+(++chart),text.replace(/^(\s*gitGraph)(?:\s+(?:LR|TB|BT))?[ \t]*:?[ \t]*$/m,'$1 TB:'));
        const box=document.createElement('div');box.className='diagram-view';box.innerHTML=result.svg;node.parentElement.replaceWith(box);try{finishDiagram(box)}catch(error){console.error(error);box.title=error.message}
      } else if(node.className){
        await load('highlight');window.highlightCode(node);
      }
    }catch{node.title='无法渲染，已显示源码';}
  }
}
const headingTargets=new Map();
function headingSlug(text){
  return text.trim().toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\s-]/gu,'').replace(/\s/g,'-');
}
preview.addEventListener('click',event=>{
  const link=event.target.closest('a[href^="#"]');
  if(!link||!preview.contains(link))return;
  event.preventDefault();
  let name=link.hash.slice(1);
  try{name=decodeURIComponent(name);}catch{return;}
  if(!name){el('preview').scrollTop=0;return;}
  const target=preview.querySelector('#'+CSS.escape(name))||headingTargets.get(name)||headingTargets.get(headingSlug(name));
  if(target)target.scrollIntoView({block:'start'});
});
let renderedTaskSource='',taskBodyStart=0;
preview.addEventListener('change',event=>{
  const box=event.target;
  if(!box.matches('input.task-list-item-checkbox[data-task-line]'))return;
  const text=source.value;
  if(text!==renderedTaskSource){render();return;}
  let start=taskBodyStart;
  for(let line=Number(box.dataset.taskLine);line>0;line--)start=text.indexOf('\n',start)+1;
  const end=text.indexOf('\n',start);
  const marker=/^[ \t>]*(?:(?:[-+*]|\d+[.)])[ \t]+[ \t>]*)*\[([ xX])\](?=\s|$)/.exec(text.slice(start,end<0?undefined:end));
  if(!marker){render();return;}
  const pos=start+marker[0].length-2;
  source.setRangeText(box.checked?'x':' ',pos,pos+1,'preserve');
  renderedTaskSource=source.value;
  box.toggleAttribute('checked',box.checked);
  source.dispatchEvent(new Event('input'));
});
function render(force=false){
  const text=source.value;
  el('count').textContent=text.split('\n').length+' 行';
  if(mode==='source'&&force!==true) return;
  const front=enabled('metadata') && /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text);
  renderedTaskSource=text;
  taskBodyStart=front?front[0].length:0;
  preview.innerHTML=!text?'':DOMPurify.sanitize(parser.render(front?text.slice(front[0].length):text),{USE_PROFILES:{html:true},FORBID_TAGS:['style','form','button','textarea','select']});
  if(front){
    const details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');
    summary.textContent='文档属性';pre.textContent=front[1];details.append(summary,pre);preview.prepend(details);
  }
  headingTargets.clear();
  el('outline').replaceChildren(...Array.from(preview.querySelectorAll('h1,h2,h3,h4,h5,h6'),heading=>{
    const base=headingSlug(heading.textContent);
    let name=base, suffix=0;
    while(headingTargets.has(name))name=base+'-'+(++suffix);
    headingTargets.set(name,heading);
    heading.id='xmd-heading-'+name;
    const button=document.createElement('button');button.textContent=heading.textContent;
    button.onclick=()=>heading.scrollIntoView();return button;
  }));
  preview.querySelectorAll('pre > code').forEach(codeHeader);
  renderCompletion=enhance(preview);
}
function view(name, documentChanged=false){
  const previous=mode,reader=el('preview');
  const top=reader.getBoundingClientRect().top;
  const anchor=previous==='preview'&&name==='split'?[...preview.children].find(block=>block.getBoundingClientRect().bottom>top):null;
  const within=anchor?(top-anchor.getBoundingClientRect().top)/Math.max(1,anchor.offsetHeight):0;
  mode=name;el('sourcePane').hidden=name==='preview';el('previewPane').hidden=name==='source';
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.mode===name));
  if(documentChanged||previous==='source'||name==='source'||!preview.childElementCount)render();
  if(anchor){
    reader.scrollTop+=anchor.getBoundingClientRect().top-reader.getBoundingClientRect().top+within*anchor.offsetHeight;
    if(enabled('sync'))source.scrollTop=reader.scrollTop/Math.max(1,reader.scrollHeight-reader.clientHeight)*(source.scrollHeight-source.clientHeight);
  }
}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>view(b.dataset.mode));
const send=(action)=>chrome.webview.postMessage({action,text:source.value,version});
el('closeFile').onclick=()=>send('closeFile');
el('openFile').onclick=()=>send('open');el('save').onclick=()=>send('save');
el('settings').onclick=()=>el('prefs').showModal();
el('outlineToggle').onclick=()=>{el('sidebar').hidden=!el('sidebar').hidden;el('outlineToggle').setAttribute('aria-pressed',!el('sidebar').hidden)};
for(const box of document.querySelectorAll('#prefs input[type=checkbox]')){
  if(box.id==='showStatusBar'){
    const apply=()=>{document.documentElement.toggleAttribute('data-status-bar',box.checked);};
    box.checked=localStorage.getItem(box.id)==='on';
    apply();
    box.onchange=()=>{localStorage.setItem(box.id,box.checked?'on':'off');apply();};
    continue;
  }
  box.checked=localStorage.getItem(box.id)!=='off';
  box.onchange=()=>{localStorage.setItem(box.id,box.checked?'on':'off');render();};
}
source.addEventListener('input',()=>{
  version++;
  clearTimeout(timer);
  if(mode!=='source' && !source.value.includes('\n') && source.value.length<160)render();
  else timer=setTimeout(render,90);
  el('status').textContent='未保存修改';
  chrome.webview.postMessage({action:'dirty'});
});
chrome.webview.addEventListener('message',({data})=>{
  if(data.action==='askSave'){
    const dialog=el('changes');
    dialog.returnValue='cancel';
    el('changesText').textContent=(el('filename').textContent||'未命名文档')+' 有未保存的修改。';
    dialog.showModal();return;
  }
  if(data.action==='closed'){
    source.value='';version++;clearTimeout(timer);el('filename').textContent='';el('status').textContent='';
    view('split');render();source.focus();return;
  }
  if(data.action==='load'){source.value=data.text;version++;el('filename').textContent=data.name;el('status').textContent='';view('preview',true)}
  if(data.action==='saved' && data.version===version){el('filename').textContent=data.name;el('status').textContent=''}
});
document.addEventListener('keydown',event=>{
  const panelButton = {F5:'recent', F6:'favorites', F7:'browse'}[event.key];
  if(panelButton && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey){
    event.preventDefault();
    if(!event.repeat && !event.isComposing && !el('prefs').open && !el('changes').open)
      el(panelButton).click();
    return;
  }
  if(el('prefs').open||el('changes').open||event.altKey||event.metaKey)return;
  const targetView={F1:'source',F2:'split',F3:'preview'}[event.key];
  if(targetView&&!event.ctrlKey&&!event.shiftKey){
    event.preventDefault();if(event.repeat)return;
    view(targetView);if(isFullscreen)(targetView==='preview'?el('preview'):source).focus();return;
  }
  if(!event.ctrlKey)return;
  const key=event.key.toLowerCase();
  if(!['o','s','b','w'].includes(key)||(event.shiftKey&&key!=='s'))return;
  event.preventDefault();
  if(event.repeat)return;
  if(key==='w'){send('closeFile');return;}
  if(key==='b')el('outlineToggle').click();
  else send(key==='o'?'open':event.shiftKey?'saveAs':'save');
});
el('outlineToggle').title='切换目录 (Ctrl+B)';
el('openFile').title='打开文件 (Ctrl+O)';

const mirroredScroll=new WeakMap();
for(const [from,to] of [[source,el('preview')],[el('preview'),source]]){
  from.onscroll=()=>{
    const expected=mirroredScroll.get(from);
    mirroredScroll.delete(from);
    if(expected!==undefined && Math.abs(from.scrollTop-expected)<1)return;
    if(!enabled('sync')||mode!=='split')return;
    const range=from.scrollHeight-from.clientHeight;
    if(range<=0)return;
    const top=from.scrollTop/range*(to.scrollHeight-to.clientHeight);
    if(Math.abs(to.scrollTop-top)<1)return;
    to.scrollTop=top;
    mirroredScroll.set(to,to.scrollTop);
  };
}
render();
chrome.webview.postMessage({action:'ready'});

document.querySelectorAll('[data-window]').forEach(button=>{
  button.onclick=()=>button.dataset.window==='fullscreen'?transitionFullscreen():chrome.webview.postMessage({action:button.dataset.window});
});
if(matchMedia('(max-width:760px)').matches) el('outlineToggle').click();

const root=document.documentElement;
const systemTheme=matchMedia('(prefers-color-scheme:light)');
function appearance(){
  document.querySelectorAll('.seg-setting button').forEach(b=>b.setAttribute('aria-pressed',el(b.parentNode.dataset.setting).value===b.value));
  const theme=el('theme').value;
  const custom=theme==='custom';
  const color=id=>localStorage.getItem(id)||({accent:'#a997ef',background:'#191920',foreground:'#e7e5f0'})[id];
  document.querySelectorAll('[data-pick]').forEach(button=>button.style.backgroundColor=color(button.dataset.pick));
  const rgb=color('background').slice(1).match(/../g).map(v=>parseInt(v,16));
  const light=theme==='light'||(theme==='system'&&systemTheme.matches)||(custom&&rgb[0]*.299+rgb[1]*.587+rgb[2]*.114>145);
  root.toggleAttribute('data-custom',custom);
  root.style.setProperty('--chosen-bg',color('background'));
  root.style.setProperty('--chosen-ink',color('foreground'));
  const colors=['accent','background','foreground'].map(id=>el(id).value).join(',');
  document.querySelectorAll('.palette').forEach(b=>b.setAttribute('aria-pressed',custom&&b.dataset.colors===colors.toLowerCase()));
  root.toggleAttribute('data-light',light);
  const accent=theme==='custom'?color('accent'):light?'#7960bc':'#b8aaff';
  root.style.setProperty('--accent',accent);
  root.style.setProperty('--reading-width',el('readWidth').value);
  root.style.setProperty('--reading-size',el('fontSize').value+'px');
  root.style.setProperty('--code-wrap',el('wrapCode').checked?'pre-wrap':'pre');
  el('accentRow').hidden=theme!=='custom';
  chrome.webview.postMessage({action:'appearance',color:light?'light':'dark'});
}
for(const [id,initial] of Object.entries({immersiveView:'preview',theme:'system',accent:'#a997ef',background:'#191920',foreground:'#e7e5f0',fontSize:'16',readWidth:'760px'})){
  el(id).value=localStorage.getItem(id)||initial;
  if(el(id).classList.contains('hex-color')){
    el(id).value=el(id).value.toUpperCase();
    el(id).onblur=()=>{el(id).value=(localStorage.getItem(id)||initial).toUpperCase()};
  }
  el(id).oninput=()=>{if(el(id).classList.contains('hex-color')){
    const field=el(id),pos=field.selectionStart;
    field.value=field.value.toUpperCase();field.setSelectionRange(pos,pos);
    if(!/^#[0-9A-F]{6}$/.test(field.value))return;
  }localStorage.setItem(id,el(id).value);appearance();if(['theme','accent','background','foreground'].includes(id))render();};
}
for(const button of document.querySelectorAll('.palette')){
  button.onclick=()=>{
    el('theme').value='custom';
    localStorage.setItem('theme','custom');
    button.dataset.colors.split(',').forEach((value,index)=>{
      const id=['accent','background','foreground'][index];
      el(id).value=value.toUpperCase();
      localStorage.setItem(id,value);
    });
    appearance();
    render();
  };
}
el('wrapCode').addEventListener('change',appearance);
systemTheme.addEventListener('change',()=>{appearance();render()});
const fontControls=[['bodyFont','--body-family','-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'],['codeFont','--code-family','ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace']];
function applyFont(id,property,fallback){
  const name=el(id).value;
  root.style.setProperty(property,name?CSS.escape(name)+', '+fallback:fallback);
}
for(const [id,property,fallback] of fontControls){
  const selected=localStorage.getItem(id);
  if(selected)el(id).add(new Option(selected,selected,true,true));
  applyFont(id,property,fallback);
  el(id).onchange=()=>{
    localStorage.setItem(id,el(id).value);
    applyFont(id,property,fallback);
  };
}
let requestedFonts=false;
chrome.webview.addEventListener('message',({data})=>{
  if(data.action!=='fonts')return;
  for(const [id] of fontControls){
    const control=el(id),current=control.value;
    for(const name of data.names){
      if(name!==current)control.add(new Option(name,name));
    }
    control.value=current;
  }
});
for(const tab of document.querySelectorAll('[data-tab]')){
  tab.onclick=()=>{
    if(tab.dataset.tab==='1'&&!requestedFonts){
      requestedFonts=true;
      chrome.webview.postMessage({action:'fonts'});
    }
    document.querySelectorAll('[data-section]').forEach(section=>section.hidden=section.dataset.section!==tab.dataset.tab);
    document.querySelectorAll('[data-tab]').forEach(other=>other.setAttribute('aria-pressed',other===tab));
  };
}
document.querySelector('[data-tab]').click();
for(const id of ['theme','fontSize','readWidth','immersiveView']){
  const select=el(id), row=document.createElement('div'), group=document.createElement('div');
  row.className='setting-row';
  const caption=select.parentNode.firstChild.textContent;
  select.parentNode.replaceWith(row);
  row.append(document.createTextNode(caption),select,group);
  select.hidden=true;
  group.className='seg-setting';group.dataset.setting=id;
  group.setAttribute('role','group');group.setAttribute('aria-label',caption);
  for(const option of select.options){
    const button=document.createElement('button');button.type='button';
    button.value=option.value;button.textContent=option.textContent;
    button.onclick=()=>{select.value=button.value;select.dispatchEvent(new Event('input'))};
    group.append(button);
  }
}
appearance();
function transitionFullscreen(){
  if(document.body.classList.contains('transitioning'))return;
  document.body.classList.add('transitioning');
  setTimeout(()=>chrome.webview.postMessage({action:'fullscreen'}),matchMedia('(prefers-reduced-motion:reduce)').matches?0:130);
}
let isFullscreen=false, priorView='split';
chrome.webview.addEventListener('message',({data})=>{
  if(data.action!=='windowState')return;
  document.body.classList.remove('transitioning');
  if(isFullscreen!==data.fullscreen){
    if(data.fullscreen)priorView=mode;
    isFullscreen=data.fullscreen;
    if(isFullscreen&&el('prefs').open)el('prefs').close();
    root.toggleAttribute('data-immersive',isFullscreen);
    view(isFullscreen&&el('immersiveView').value!=='current'?el('immersiveView').value:priorView);
    if(isFullscreen)(mode==='preview'?el('preview'):source).focus();
  }
  for(const [action,state,label] of [['fullscreen',isFullscreen,isFullscreen?'退出全屏':'全屏'],['pin',data.pinned,data.pinned?'取消置顶':'窗口置顶']]){
    const button=document.querySelector('[data-window="'+action+'"]');
    button.setAttribute('aria-pressed',state);button.title=label;button.setAttribute('aria-label',label);
  }
});
document.addEventListener('keydown',event=>{
  if(event.key==='F11'||(event.key==='Escape'&&isFullscreen&&!el('prefs').open)){
    event.preventDefault();if(!event.repeat)transitionFullscreen();
  }
});


const fileMenu=el('fileMenu'), fileButton=el('fileButton');
fileMenu.addEventListener('beforetoggle',event=>{
  const open=event.newState==='open';
  fileButton.setAttribute('aria-expanded',open);
  if(open){
    const rect=fileButton.getBoundingClientRect();
    fileMenu.style.left=rect.left+'px';
    fileMenu.style.top=rect.bottom+6+'px';
  }
});
fileMenu.addEventListener('click',event=>{
  if(event.target.closest('button'))fileMenu.hidePopover();
},true);
el('saveAs').onclick=()=>send('saveAs');
fileMenu.addEventListener('keydown',event=>{
  if(!['ArrowDown','ArrowUp'].includes(event.key))return;
  event.preventDefault();
  const items=[...fileMenu.querySelectorAll('button')];
  items[(items.indexOf(document.activeElement)+(event.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();
});

el('changes').addEventListener('close',()=>chrome.webview.postMessage({action:'saveChoice',choice:el('changes').returnValue}));
import {installNavigation} from './navigation.js';
installNavigation({source,preview,preparePrint:async()=>{
  clearTimeout(timer);
  render(true);
  await renderCompletion;
  await document.fonts.ready;
}});




const picker=document.createElement('div');
picker.id='colorPicker';
picker.setAttribute('popover','auto');
picker.innerHTML='<div class="sv-plane" aria-label="饱和度和明度"><i></i></div><input type="range" min="0" max="360" aria-label="色相">';
el('prefs').append(picker);
const plane=picker.firstElementChild,hue=picker.lastElementChild;
let channel,saturation=0,brightness=1;
function drawPicker(){
  plane.style.backgroundColor='hsl('+hue.value+' 100% 50%)';
  plane.firstChild.style.left=saturation*100+'%';
  plane.firstChild.style.top=(1-brightness)*100+'%';
}
function applyPicker(){
  const component=n=>{
    const k=(n+Number(hue.value)/60)%6;
    const level=brightness*(1-saturation*Math.max(0,Math.min(k,4-k,1)));
    return Math.round(level*255).toString(16).padStart(2,'0');
  };
  channel.value='#'+[5,3,1].map(component).join('');
  channel.dispatchEvent(new Event('input'));
  drawPicker();
}
for(const button of document.querySelectorAll('[data-pick]')){
  button.onclick=()=>{
    channel=el(button.dataset.pick);
    const [r,g,b]=channel.value.slice(1).match(/../g).map(x=>parseInt(x,16)/255);
    brightness=Math.max(r,g,b);
    const delta=brightness-Math.min(r,g,b);
    saturation=brightness?delta/brightness:0;
    hue.value=delta?((brightness===r?(g-b)/delta:brightness===g?2+(b-r)/delta:4+(r-g)/delta)*60+360)%360:0;
    drawPicker();
    picker.showPopover();
    const rect=button.getBoundingClientRect();
    picker.style.left=Math.max(4,Math.min(rect.right-picker.offsetWidth,innerWidth-picker.offsetWidth-4))+'px';
    picker.style.top=(rect.bottom+picker.offsetHeight+6<innerHeight?rect.bottom+4:Math.max(4,rect.top-picker.offsetHeight-4))+'px';
  };
}
function pickPoint(event){
  const rect=plane.getBoundingClientRect();
  const clamp=x=>Math.min(1,Math.max(0,x));
  saturation=clamp((event.clientX-rect.left)/rect.width);
  brightness=1-clamp((event.clientY-rect.top)/rect.height);
  applyPicker();
}
plane.onpointerdown=event=>{plane.setPointerCapture(event.pointerId);pickPoint(event)};
plane.onpointermove=event=>{if(plane.hasPointerCapture(event.pointerId))pickPoint(event)};
hue.oninput=applyPicker;
