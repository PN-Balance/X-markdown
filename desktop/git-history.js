export function layoutGitHistory(svg){
  const bullets=svg.querySelector('.commit-bullets');
  if(!bullets)return false;
  const byRow=new Map();
  for(const marker of svg.querySelectorAll('.commit-bullets circle.commit,.commit-bullets rect.commit')){
    const raw=marker.getAttribute('class');
    const id=/^commit (.+?) (?:commit\d+|commit-highlight\d+)(?:\s|$)/.exec(raw)?.[1];
    if(!id||marker.classList.contains('commit-merge'))continue;
    const rect=marker.getBBox(),y=rect.y+rect.height/2;
    // Special commit symbols can contain multiple shapes at the same point.
    if([...byRow.keys()].some(row=>Math.abs(row-y)<4))continue;
    byRow.set(y,id);
  }
  const rows=[...byRow].sort(([first],[second])=>first-second);
  if(!rows.length)return false;
  svg.querySelectorAll('text.commit-label').forEach(label=>label.parentNode.remove());
  svg.classList.add('git-history');
  const bounds=svg.getBBox(),left=bounds.x-12,column=bounds.x+bounds.width+30;
  const ns=svg.namespaceURI;
  const group=document.createElementNS(ns,'g');
  svg.append(group);
  function label(value,y,header=false){
    const text=document.createElementNS(ns,'text');
    text.setAttribute('x',column);text.setAttribute('y',y);
    text.setAttribute('dominant-baseline','middle');
    text.setAttribute('class',header?'history-header':'history-id');
    text.textContent=value;group.append(text);return text;
  }
  const header=label('提交 ID',rows[0][0]-36,true);
  const badges=[...svg.querySelectorAll('rect.branchLabelBkg')];
  let firstRule=rows[0][0]-21;
  if(badges.length){
    const center=element=>{
      const rect=element.getBoundingClientRect();
      return rect.top+rect.height/2;
    };
    const scale=svg.getScreenCTM().d;
    if(scale>0){
      const target=center(badges[0]);
      for(const badge of badges){
        const branch=badge.nextElementSibling;
        if(branch?.classList.contains('branchLabel')){
          branch.setAttribute('transform','translate(0 '+((target-center(branch))/scale)+')');
        }
      }
      header.setAttribute('y',Number(header.getAttribute('y'))+(target-center(header))/scale);
      firstRule=(badges[0].getBBox().y+badges[0].getBBox().height+rows[0][0]-6)/2;
    }
  }
  let right=column+170;
  for(const [y,id] of rows){
    const text=label(id,y);
    right=Math.max(right,column+text.getBBox().width+16);
  }
  const rules=document.createElementNS(ns,'g');
  svg.insertBefore(rules,bullets.parentNode===svg?svg.querySelector('g'):svg.firstChild);
  for(let i=0;i<rows.length;i++){
    const y=i?(rows[i-1][0]+rows[i][0])/2:firstRule;
    const rule=document.createElementNS(ns,'line');
    for(const [attr,value] of Object.entries({x1:left,x2:right,y1:y,y2:y,class:'history-rule'}))rule.setAttribute(attr,value);
    rules.append(rule);
  }
  const top=Math.min(bounds.y-5,rows[0][0]-49),bottom=Math.max(bounds.y+bounds.height+6,rows.at(-1)[0]+20);
  svg.setAttribute('viewBox',[left,top,right-left,bottom-top].join(' '));
  svg.style.maxWidth=(right-left)+'px';
  svg.setAttribute('width','100%');
  return true;
}


