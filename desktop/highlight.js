import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import bash from 'highlight.js/lib/languages/bash';
for(const [key,definition] of Object.entries({javascript,python,json,xml,css,bash})) hljs.registerLanguage(key,definition);
window.highlightCode=node=>{if(hljs.getLanguage(node.className.replace('language-',''))) hljs.highlightElement(node)};
