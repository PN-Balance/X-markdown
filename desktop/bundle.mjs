import {version} from './version.mjs';
import {build} from 'esbuild';
import fs from 'node:fs';
const ui='build/app/ui';
fs.mkdirSync(ui+'/fonts',{recursive:true});
for(const file of ['editor','highlight']){
  await build({entryPoints:['desktop/'+file+'.js'],bundle:true,minify:true,outfile:ui+'/'+file+'.js'});
}
const html=fs.readFileSync('desktop/index.template.html','utf8').replace('{{VERSION}}',version);
fs.copyFileSync('desktop/appearance.css',ui+'/appearance.css');

fs.writeFileSync(ui+'/index.html',html);
for(const [src,dst] of [
  ['mermaid/dist/mermaid.min.js','mermaid.js'],['katex/dist/katex.min.js','katex.js'],
  ['katex/dist/katex.min.css','katex.css'],['highlight.js/styles/github-dark.min.css','highlight.css']
])fs.copyFileSync('node_modules/'+src,ui+'/'+dst);
for(const font of fs.readdirSync('node_modules/katex/dist/fonts').filter(x=>x.endsWith('.woff2')))
  fs.copyFileSync('node_modules/katex/dist/fonts/'+font,ui+'/fonts/'+font);
const notices=[];
for(const entry of fs.readdirSync('node_modules',{withFileTypes:true})){
  if(!entry.isDirectory())continue;
  const dirs=entry.name.startsWith('@')?fs.readdirSync('node_modules/'+entry.name).map(x=>entry.name+'/'+x):[entry.name];
  for(const dir of dirs){
    const path='node_modules/'+dir;
    for(const f of fs.readdirSync(path).filter(x=>/^(license|notice|copying)(\.|$)/i.test(x))){
      if(fs.statSync(path+'/'+f).isFile())notices.push(dir+'\n'+fs.readFileSync(path+'/'+f,'utf8'));
    }
  }
}
fs.writeFileSync('build/app/ThirdPartyNotices.txt',notices.join('\n\n'));

