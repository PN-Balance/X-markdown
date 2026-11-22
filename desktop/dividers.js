const main = document.querySelector('main');
const panes = document.querySelector('.panes');
const sidebar = document.querySelector('#sidebar');
const sourcePane = document.querySelector('#sourcePane');
const stacked = matchMedia('(max-width:560px)');
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));

function divider(parent, label, isSidebar) {
  const handle = document.createElement('div');
  handle.className = 'workspace-divider '+(isSidebar?'sidebar-divider':'pane-divider');
  handle.tabIndex = 0;
  handle.setAttribute('role','separator');
  handle.setAttribute('aria-label',label);
  handle.setAttribute('aria-controls',isSidebar?'sidebar':'sourcePane previewPane');
  parent.append(handle);
  const key=isSidebar?'sidebar-width':'source-share';
  const stored=Number(localStorage.getItem(key));
  let preferred=Number.isFinite(stored)&&stored>0?stored:(isSidebar?180:50);
  function layout(){
    const horizontal=!isSidebar&&stacked.matches;
    const bounds=parent.getBoundingClientRect();
    const size=horizontal?bounds.height:bounds.width;
    const max=isSidebar?Math.max(120,Math.min(520,size*.52)):80;
    const min=isSidebar?120:20;
    const value=clamp(preferred,min,max);
    const pos=value+(isSidebar?'px':'%');
    parent.style.setProperty(isSidebar?'--outline-size':'--source-size',pos);
    handle.setAttribute('aria-orientation',horizontal?'horizontal':'vertical');
    handle.setAttribute('aria-valuemin',min);
    handle.setAttribute('aria-valuemax',Math.round(max));
    handle.setAttribute('aria-valuenow',Math.round(value));
    handle.setAttribute('aria-valuetext',Math.round(value)+(isSidebar?' 像素':'%'));
    return {bounds,size,horizontal,min,max,value};
  }
  handle.onpointerdown=event=>{
    if(event.button!==0)return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    handle.classList.add('dragging');
  };
  handle.onpointermove=event=>{
    if(!handle.hasPointerCapture(event.pointerId))return;
    const {bounds,size,horizontal,min,max}=layout();
    if(!size)return;
    const offset=horizontal?event.clientY-bounds.top:event.clientX-bounds.left;
    preferred=clamp(isSidebar?offset:100*offset/size,min,max);
    layout();
  };
  handle.onlostpointercapture=()=>{
    handle.classList.remove('dragging');
    localStorage.setItem(key,preferred);
  };
  handle.onkeydown=event=>{
    const {horizontal,min,max,value}=layout();
    const keys=horizontal?['ArrowUp','ArrowDown']:['ArrowLeft','ArrowRight'];
    if(!keys.includes(event.key))return;
    event.preventDefault();
    preferred=clamp(value+(event.key===keys[0]?-1:1)*(isSidebar?12:2),min,max);
    layout();localStorage.setItem(key,preferred);
  };
  new ResizeObserver(layout).observe(parent);
  layout();
}
divider(main,'调整目录宽度',true);
divider(panes,'调整源码与预览比例',false);
