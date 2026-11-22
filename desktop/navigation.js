const pathKey=p=>p.toLowerCase();
const stored=key=>JSON.parse(localStorage.getItem(key)||'[]');
const basename=p=>p.split(/[\\/]/).pop();
export function installNavigation({source,preview,preparePrint}){
  const post=(action,extra={})=>chrome.webview.postMessage({action,...extra});
  const library=document.createElement('dialog'), menu=document.createElement('div');
  library.id='library';
  library.setAttribute('autofocus','');
  library.setAttribute('aria-labelledby','libraryTitle');
  library.innerHTML='<div class="prefTitle"><h2 id="libraryTitle"></h2><button aria-label="关闭">×</button></div><div class="address"><button title="上级目录">↑</button><button class="locate-file" title="定位当前文件" aria-label="定位当前文件"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></svg></button><input aria-label="当前文件夹"><button>转到</button></div><div class="library-list"></div><div class="favorite-actions" hidden><button type="button">收藏本文件</button><button type="button">清空收藏</button></div>';
  menu.id='contextActions';menu.setAttribute('popover','auto');
  document.body.append(library,menu);
  const list=library.querySelector('.library-list'),address=library.querySelector('.address'),input=address.querySelector('input');
  let panel='',folder='',parent='',file='',back=false,forward=false;
  const favoriteActions=library.querySelector('.favorite-actions');
  function saveFavorites(paths){
    localStorage.setItem('favoriteFiles',JSON.stringify(paths));updateStar();
    if(library.open&&panel==='favorites')openPanel(panel);
  }
  favoriteActions.firstElementChild.onclick=()=>{
    const paths=stored('favoriteFiles');
    if(file&&!paths.some(p=>pathKey(p)===pathKey(file)))saveFavorites([file,...paths]);
  };
  favoriteActions.lastElementChild.onclick=()=>{
    if(panel==='recent'){localStorage.removeItem('recentFiles');openPanel(panel);}
    else saveFavorites([]);
  };
  const star=document.getElementById('starFile');
  function updateStar(){
    star.disabled=!file;
    const selected=!!file&&stored('favoriteFiles').some(p=>pathKey(p)===pathKey(file));
    star.setAttribute('aria-pressed',selected);
    star.title=selected?'取消收藏':'收藏当前文件';
    star.setAttribute('aria-label',star.title);
  }
  function toggleStar(){
    if(!file)return;
    const paths=stored('favoriteFiles'),others=paths.filter(p=>pathKey(p)!==pathKey(file));
    saveFavorites(others.length===paths.length?[file,...paths]:others);
  }
  star.onclick=toggleStar;
  const printButton=document.getElementById('printFile');
  printButton.onclick=()=>{
    menu.replaceChildren();
    item('打印为 PDF','e8a5',()=>print('pdf'));
    item('导出为 HTML','e943',()=>print('html'));
    const rect=printButton.getBoundingClientRect();
    showMenu(rect.left,rect.bottom+4,document.body);
  };

  const locateButton=address.querySelector('.locate-file');
  function setFile(path){
    locateButton.disabled=!path;
    file=path;updateStar();
    if(library.open && panel==='favorites')openPanel(panel);
  }
  setFile('');
  function recentFiles(){
    return stored('recentFiles')
      .map(entry=>typeof entry==='string'?{path:entry,openedAt:0}:entry)
      .filter(entry=>entry && typeof entry.path==='string' && entry.path)
      .sort((a,b)=>(b.openedAt||0)-(a.openedAt||0));
  }
  function remember(path){
    if(!document.getElementById('recordRecent').checked)return;
    const previous=recentFiles().filter(entry=>pathKey(entry.path)!==pathKey(path));
    localStorage.setItem('recentFiles',JSON.stringify([{path,openedAt:Date.now()},...previous].slice(0,50)));
  }
  function openFile(p){library.close();post('openListed',{text:source.value,file:p});}
  function directory(value,locate=false){post('browseDirectory',{folder:value,locate});}
  locateButton.onclick=()=>{if(file)directory('',true);};
  function rows(entries){
    list.replaceChildren();
    if(!entries.length){const p=document.createElement('p');p.textContent=panel==='favorites'?'暂无收藏文件':panel==='recent'?'暂无打开记录':'此目录没有子文件夹或可打开的文本文件';list.append(p);}
    const clock=panel==='recent' && entries.length ? new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}) : null;
    for(const item of entries){
      const b=document.createElement('button'),glyph=document.createElement('i'),name=document.createElement('span'),detail=document.createElement('small');
      glyph.textContent=item.dir?'\ue8b7':'\ue8a5';name.textContent=item.name;detail.textContent=panel==='browse'?'':item.path;
      if(clock)detail.textContent=item.openedAt?clock.format(item.openedAt):'时间未知';
      b.append(glyph,name,detail);b.title=item.path;
      b.onclick=()=>item.dir?directory(item.path):openFile(item.path);if(panel!=='favorites'){list.append(b);continue;}
      const row=document.createElement('div'),remove=document.createElement('button');
      row.className='favorite-row';remove.className='remove-favorite';remove.type='button';remove.textContent='×';
      remove.title='移除收藏';remove.setAttribute('aria-label','移除收藏 '+item.name);
      remove.onclick=()=>saveFavorites(stored('favoriteFiles').filter(p=>pathKey(p)!==pathKey(item.path)));
      row.append(b,remove);list.append(row);
    }
  }
  function openPanel(key){
    panel=key;library.dataset.panel=key;
    library.querySelector('h2').textContent={recent:'最近打开',favorites:'收藏文件',browse:'浏览文件'}[key];
    favoriteActions.hidden=key==='browse';
    favoriteActions.firstElementChild.hidden=key!=='favorites';
    favoriteActions.lastElementChild.textContent=key==='recent'?'清空最近打开':'清空收藏';
    if(key==='recent')favoriteActions.lastElementChild.disabled=!recentFiles().length;
    if(key==='favorites'){
      const favorites=stored('favoriteFiles');
      const already=file&&favorites.some(p=>pathKey(p)===pathKey(file));
      favoriteActions.firstElementChild.disabled=!file||already;
      favoriteActions.firstElementChild.textContent=already?'已收藏本文件':'收藏本文件';
      favoriteActions.lastElementChild.disabled=!favorites.length;
    }
    address.hidden=key!=='browse';list.replaceChildren();
    if(key==='browse'){input.value=folder==='::drives'?'此电脑':folder;directory(folder);}
    else if(key==='recent')rows(recentFiles().map(entry=>({...entry,name:basename(entry.path)})));
    else rows(stored('favoriteFiles').map(p=>({name:basename(p),path:p})));
    if(!library.open)library.showModal();
  }
  for(const key of ['recent','favorites','browse'])document.getElementById(key).onclick=()=>openPanel(key);
  library.querySelector('.prefTitle button').onclick=()=>library.close();
  address.firstElementChild.onclick=()=>{if(parent)directory(parent)};
  address.lastElementChild.onclick=()=>directory(input.value.trim());
  input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();directory(input.value.trim())}};
  chrome.webview.addEventListener('message',({data})=>{
    if(data.action==='directory'&&panel==='browse'){folder=data.folder;parent=data.parent;input.value=folder==='::drives'?'此电脑':folder;address.firstElementChild.disabled=!parent;rows(data.entries);
      if(data.locate){
        const selected=[...list.querySelectorAll('button')].find(button=>pathKey(button.title)===pathKey(file));
        if(selected){selected.setAttribute('aria-current','location');selected.focus({preventScroll:true});selected.scrollIntoView({block:'nearest'});}
      }
    }
    if(data.action==='load'){setFile(data.path);remember(file);back=data.back;forward=data.forward;}
    if(data.action==='saved'){if(pathKey(data.path)!==pathKey(file))remember(data.path);setFile(data.path);}
    if(data.action==='closed')setFile('');
  });
  let focusTarget,selection='';
  function item(label,icon,run,disabled=false,parentMenu=menu){
    const b=document.createElement('button'),glyph=document.createElement('i'),caption=document.createElement('span');
    glyph.textContent=String.fromCodePoint(parseInt(icon,16));caption.textContent=label;b.append(glyph,caption);b.disabled=disabled;
    b.onclick=async()=>{menu.hidePopover();try{await run()}catch(error){post('feedback',{message:String(error.message||error)})}};
    parentMenu.append(b);return b;
  }
  async function print(format){
    await preparePrint();
    if(format==='pdf'){post('outputPdf');return;}
    const copy=preview.cloneNode(true);copy.querySelectorAll('.code-bar button').forEach(n=>n.remove());
    copy.querySelectorAll('.katex').forEach(n=>{const math=n.querySelector('math');if(math)n.replaceWith(math.cloneNode(true))});
    const doc=document.implementation.createHTMLDocument(file?basename(file):'笔记');
    doc.documentElement.lang='zh-CN';
    doc.head.insertAdjacentHTML('afterbegin','<meta charset="utf-8">');
    const style=doc.createElement('style');
    style.textContent='body{max-width:850px;margin:3em auto;padding:0 24px;font:16px/1.75 "Segoe UI",sans-serif}pre{white-space:pre-wrap;background:#f2f2f5;padding:12px}table{border-collapse:collapse}td,th{border:1px solid #aaa;padding:4px 10px}img,svg{max-width:100%}.code-bar{color:#666;font-size:.85em}';doc.head.append(style);doc.body.append(copy);
    post('outputHtml',{html:'<!doctype html>'+doc.documentElement.outerHTML});
  }
  function showMenu(x,y,container){
    if(menu.matches(':popover-open'))menu.hidePopover();
    container.append(menu);
    menu.style.left=x+'px';menu.style.top=y+'px';menu.showPopover();
    const rect=menu.getBoundingClientRect();menu.style.left=Math.max(4,Math.min(x,innerWidth-rect.width-4))+'px';menu.style.top=Math.max(4,Math.min(y,innerHeight-rect.height-4))+'px';
  }
  const header=document.querySelector('header');
  const isCaption=target=>header.contains(target)&&!target.closest('button,.views,.caption,[popover]');
  let dragStart=null;
  header.addEventListener('pointerdown',event=>{
    if(event.button===0 && isCaption(event.target)){
      dragStart={x:event.clientX,y:event.clientY};
      event.target.setPointerCapture(event.pointerId);
    }
  });
  header.addEventListener('pointermove',event=>{
    if(dragStart && event.buttons===1 && Math.hypot(event.clientX-dragStart.x,event.clientY-dragStart.y)>=4){
      dragStart=null;post('dragWindow');
    }
  });
  header.addEventListener('lostpointercapture',()=>{dragStart=null});
  header.addEventListener('dblclick',event=>{if(isCaption(event.target))post('maximize')});
  chrome.webview.addEventListener('message',({data})=>{
    if(data.action!=='windowMenu'||document.querySelector('dialog[open], :popover-open'))return;
    menu.replaceChildren();
    item('还原','e923',()=>post('maximize'),!data.maximized);
    item('移动','e7c2',()=>post('moveWindow'),data.maximized);
    item('调整大小','e799',()=>post('sizeWindow'),data.maximized);
    item('最小化','e921',()=>post('minimize'));
    item('最大化','e922',()=>post('maximize'),data.maximized);
    item('关闭','e8bb',()=>post('close'));
    showMenu(data.x,data.y,document.body);
  });
  document.addEventListener('contextmenu',event=>{
    event.preventDefault();
    if(document.querySelector('dialog[open], :popover-open'))return;
    if(isCaption(event.target)){
      post('windowMenu',{x:event.clientX,y:event.clientY});return;
    }
    const container=document.body;
    focusTarget=event.target.closest('textarea,input')||event.target;
    const editable=focusTarget instanceof HTMLTextAreaElement||focusTarget instanceof HTMLInputElement&&['text','search','url'].includes(focusTarget.type);
    selection=editable?focusTarget.value.slice(focusTarget.selectionStart,focusTarget.selectionEnd):String(getSelection());
    menu.replaceChildren();
    item('上一步','e72b',()=>post('navigate',{step:-1,text:source.value}),!back||container!==document.body);
    item('下一步','e72a',()=>post('navigate',{step:1,text:source.value}),!forward||container!==document.body);
    item('复制','e8c8',()=>navigator.clipboard.writeText(selection),!selection);
    item('粘贴','e77f',async()=>{const value=await navigator.clipboard.readText();focusTarget.focus();document.execCommand('insertText',false,value)},!editable);
    const favs=stored('favoriteFiles'),favorite=file&&favs.some(p=>pathKey(p)===pathKey(file));
    item(favorite?'取消收藏':'收藏文件','e734',toggleStar,!file);
    const group=document.createElement('div'),sub=document.createElement('div');
    group.className='print-group';sub.className='print-submenu';sub.hidden=true;
    menu.append(group);
    const printButton=item('打印　›','e749',()=>{},false,group);
    printButton.setAttribute('aria-haspopup','true');printButton.setAttribute('aria-expanded','false');
    group.append(sub);
    item('打印为 PDF','e8a5',()=>print('pdf'),false,sub);
    item('导出为 HTML','e943',()=>print('html'),false,sub);
    function expand(){
      sub.hidden=false;printButton.setAttribute('aria-expanded','true');
      const rect=group.getBoundingClientRect(),outer=menu.getBoundingClientRect();
      sub.style.left=outer.right+sub.offsetWidth<=innerWidth?(outer.right-rect.left-1)+'px':'auto';
      sub.style.right=sub.style.left==='auto'?(rect.right-outer.left-1)+'px':'auto';
      const inset=parseFloat(getComputedStyle(sub).paddingTop)+sub.clientTop;
      sub.style.top=Math.max(4-rect.top,Math.min(-inset,innerHeight-rect.top-sub.offsetHeight-4))+'px';
    }
    function collapse(){sub.hidden=true;printButton.setAttribute('aria-expanded','false');}
    printButton.onclick=expand;group.onpointerenter=expand;group.onpointerleave=collapse;
    group.onkeydown=e=>{
      if(e.key==='ArrowRight'){e.preventDefault();expand();sub.firstElementChild.focus();}
      if(e.key==='ArrowLeft'){e.preventDefault();collapse();printButton.focus();}
    };
    showMenu(event.clientX,event.clientY,container);
  },true);
}
