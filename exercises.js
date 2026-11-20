/* After-class solutions for 课后题解答.
   Text comes from exercises.json. Math tries TeX, then the raw fallback. */
(function(){
'use strict';
var state={part:'all',chapter:'all',q:''};
var token=0;
var pending=null;
var katexCache=Object.create(null);

function load(){
  if(!pending){
    pending=fetch('exercises.json').then(function(r){
      if(!r.ok) throw new Error('exercises '+r.status);
      return r.json();
    });
  }
  return pending;
}
function esc(s){
  return String(s==null?'':s).replace(/[&<>"']/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function partName(p){return p==='atmos'?'大气':p==='env'?'环境':String(p);}
function tally(items){
  var o={n:items.length,atmos:0,env:0};
  items.forEach(function(it){if(o[it.part]!=null) o[it.part]++;});
  return o;
}
function chaptersFor(items,part){
  var map={};
  items.forEach(function(it){
    if(part!=='all'&&it.part!==part) return;
    if(!map[it.chapter]) map[it.chapter]={n:it.chapter};
    map[it.chapter][it.part]=it.chapter_title;
  });
  return Object.keys(map).map(function(k){return map[k];}).sort(function(a,b){return a.n-b.n;});
}
function chapterLabel(row,part){
  if(part==='atmos') return '第'+row.n+'章 '+(row.atmos||'');
  if(part==='env') return '第'+row.n+'章 '+(row.env||'');
  var bits=[];
  if(row.atmos) bits.push(row.atmos);
  if(row.env) bits.push(row.env);
  return '第'+row.n+'章 '+bits.join(' / ');
}
function pushBlocks(blocks, acc){
  (blocks||[]).forEach(function(b){
    if(b.kind==='p'){
      (b.inlines||[]).forEach(function(n){
        if(n.t==='text'||n.t==='link') acc.push(n.s||'');
        else if(n.t==='math') acc.push(n.raw||'', n.tex||'');
      });
    }else if(b.kind==='math'){
      acc.push(b.raw||'', b.tex||'');
    }else if(b.kind==='img'){
      acc.push(b.alt||'');
    }else if(b.kind==='table'){
      (b.rows||[]).forEach(function(row){
        row.forEach(function(cell){pushBlocks(cell, acc);});
      });
    }
  });
}
function haystack(it){
  var acc=[it.id, it.title, it.pages||''];
  pushBlocks(it.question, acc);
  pushBlocks(it.answer, acc);
  pushBlocks(it.points, acc);
  return acc.join('\n');
}
function filtered(data){
  var q=state.q.trim().toLowerCase();
  return data.items.filter(function(it){
    if(state.part!=='all'&&it.part!==state.part) return false;
    if(state.chapter!=='all'&&String(it.chapter)!==String(state.chapter)) return false;
    if(q&&haystack(it).toLowerCase().indexOf(q)<0) return false;
    return true;
  });
}
function mathHtml(tex, display){
  var key=(display?'D:':'I:')+(tex||'');
  if(Object.prototype.hasOwnProperty.call(katexCache, key)) return katexCache[key];
  var html=null;
  try{
    if(window.katex&&tex){
      html=window.katex.renderToString(tex,{throwOnError:true,displayMode:!!display,strict:'ignore',trust:false});
      if(!html||html.indexOf('katex-error')>=0) html=null;
    }
  }catch(e){html=null;}
  katexCache[key]=html;
  return html;
}
function mathInline(node){
  var html=mathHtml(node&&node.tex, false);
  if(html) return '<span class="math-in">'+html+'</span>';
  return '<span class="fx-raw-in">'+esc(node&&node.raw!=null?node.raw:'')+'</span>';
}
function mathDisplay(node){
  var html=mathHtml(node&&node.tex, true);
  if(html) return '<div class="fx">'+html+'</div>';
  return '<div class="fx fx-raw">'+esc(node&&node.raw!=null?node.raw:'')+'</div>';
}
function linkHtml(node){
  var href=String(node&&node.href||'');
  var label=node&&node.s!=null?node.s:href;
  if(!/^https:\/\//i.test(href)) return esc(label);
  return '<a class="ref-a" href="'+esc(href)+'" rel="noopener noreferrer" target="_blank">'+esc(label)+'</a>';
}
function inlinesHtml(inlines){
  return (inlines||[]).map(function(n){
    if(n.t==='math') return mathInline(n);
    if(n.t==='link') return linkHtml(n);
    return esc(n.s||'');
  }).join('');
}
function blocksHtml(blocks){
  return (blocks||[]).map(function(b){
    if(b.kind==='math') return mathDisplay(b);
    if(b.kind==='img'){
      var src=String(b.src||'');
      if(!src || src.indexOf('://')>=0 || src.charAt(0)==='/') return '';
      return '<figure class="ex-fig"><img src="'+esc(src)+'" alt="'+esc(b.alt||'')+'"></figure>';
    }
    if(b.kind==='table'){
      var rows=(b.rows||[]).map(function(row, i){
        var tag=i===0?'th':'td';
        return '<tr>'+row.map(function(cell){
          return '<'+tag+'>'+blocksHtml(cell)+'</'+tag+'>';
        }).join('')+'</tr>';
      }).join('');
      return '<div class="ex-table-wrap"><table class="ex-table">'+rows+'</table></div>';
    }
    return '<div class="ex-p">'+inlinesHtml(b.inlines)+'</div>';
  }).join('');
}
function section(label, blocks){
  if(!blocks||!blocks.length) return '';
  return '<div class="ref-sec"><div class="ref-k">'+esc(label)+'</div>'+blocksHtml(blocks)+'</div>';
}
function card(it){
  var ansLabel=it.part==='env'?'建议写法':'参考解答';
  var pages=it.pages?('<div class="ref-sec"><div class="ref-k">教材定位 · 印刷页</div><div>'+esc(it.pages)+'</div><div class="mut">扫描 PDF 页序比印刷页大 12。</div></div>'):'';
  return '<article class="card ref" data-id="'+esc(it.part+'-'+it.id)+'">'+
    '<div class="ref-top"><span class="tag">'+esc(it.id)+'</span>'+
    '<span class="tag">'+esc(partName(it.part))+' · 第'+esc(it.chapter)+'章 '+esc(it.chapter_title)+'</span></div>'+
    '<h3 class="ref-title">'+esc(it.title)+'</h3>'+
    section('题目', it.question)+
    section(ansLabel, it.answer)+
    section('得分要点', it.points)+
    pages+
    '</article>';
}
function syncNavH(){
  var bar=document.getElementById('topbar')||document.getElementById('modeNav');
  if(bar) document.documentElement.style.setProperty('--topbar-h', bar.getBoundingClientRect().height+'px');
}
function chapterNote(data){
  if(state.chapter==='all') return '';
  var bits=[];
  (data.chapters||[]).forEach(function(c){
    if(String(c.chapter)!==String(state.chapter)) return;
    if(state.part!=='all'&&c.part!==state.part) return;
    if(!c.note) return;
    bits.push((state.part==='all'?partName(c.part)+'：':'')+c.note);
  });
  return bits.join(' ');
}
function fillChapters(data){
  var sel=document.getElementById('exChap');
  if(!sel) return;
  var rows=chaptersFor(data.items, state.part);
  sel.innerHTML='<option value="all">全部章节</option>'+rows.map(function(row){
    return '<option value="'+esc(row.n)+'">'+esc(chapterLabel(row, state.part))+'</option>';
  }).join('');
  sel.value=String(state.chapter);
  if(sel.value!==String(state.chapter)){state.chapter='all';sel.value='all';}
}
function renderList(data){
  var list=document.getElementById('exList');
  var count=document.getElementById('exCount');
  var note=document.getElementById('exChapNote');
  if(!list||!count) return;
  var all=data.items;
  var got=filtered(data);
  count.textContent='课后题解答 · 当前 '+got.length+' / '+all.length+' 题';
  if(note){
    var extra=chapterNote(data);
    note.textContent=extra;
    note.style.display=extra?'block':'none';
  }
  if(!got.length){
    list.innerHTML='<div class="card mut" id="exEmpty">没有符合筛选的条目。</div>';
    return;
  }
  list.innerHTML=got.map(card).join('');
}
function shell(data){
  var all=tally(data.items);
  var note=data.meta&&data.meta.note?data.meta.note:'';
  var lib='全库 '+all.n+' 题：大气 '+all.atmos+'，环境 '+all.env+'。不标必考。';
  function partBtn(val, label){
    var on=state.part===val;
    return '<button type="button" data-part="'+val+'" class="'+(on?'on':'')+'" aria-pressed="'+(on?'true':'false')+'">'+label+'</button>';
  }
  return '<p class="ref-note" id="exNote">'+esc(note)+'</p>'+
    '<div class="mut" id="exAll">'+esc(lib)+'</div>'+
    '<div class="ref-tools">'+
      '<div class="ref-count" id="exCount"></div>'+
      '<div class="seg" role="group" aria-label="分部">'+partBtn('all','全部')+partBtn('atmos','大气')+partBtn('env','环境')+'</div>'+
      '<label class="mut ref-lab" for="exChap">章节</label>'+
      '<select id="exChap"></select>'+
      '<p class="mut" id="exChapNote" style="display:none"></p>'+
    '</div>'+
    '<input id="exQ" type="search" aria-label="搜索课后题" enterkeyhint="search" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="编号、标题、题目或解答" value="'+esc(state.q)+'">'+
    '<div id="exList"></div>';
}
function bind(root, data){
  Array.prototype.forEach.call(root.querySelectorAll('[data-part]'), function(btn){
    btn.addEventListener('click', function(){
      state.part=btn.getAttribute('data-part');
      Array.prototype.forEach.call(root.querySelectorAll('[data-part]'), function(b){
        var on=b===btn;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on?'true':'false');
      });
      fillChapters(data);
      renderList(data);
      window.scrollTo(0,0);
    });
  });
  var chap=document.getElementById('exChap');
  chap.addEventListener('change', function(){
    state.chapter=chap.value;
    renderList(data);
    window.scrollTo(0,0);
  });
  var input=document.getElementById('exQ');
  var timer=null;
  var composing=false;
  function queue(){
    clearTimeout(timer);
    timer=setTimeout(function(){renderList(data);},80);
  }
  input.addEventListener('compositionstart', function(){composing=true;});
  input.addEventListener('compositionend', function(){composing=false;state.q=input.value;queue();});
  input.addEventListener('input', function(){if(composing)return;state.q=input.value;queue();});
}
function open(root){
  var my=++token;
  syncNavH();
  root.innerHTML='<div class="card mut" id="exStatus">正在加载课后题…</div>';
  load().then(function(data){
    if(my!==token||!document.getElementById('exStatus')) return;
    if(!data||!data.items||!data.items.length) throw new Error('shape');
    root.innerHTML=shell(data);
    syncNavH();
    fillChapters(data);
    bind(root, data);
    renderList(data);
  }).catch(function(){
    if(my!==token||!document.getElementById('exStatus')) return;
    root.innerHTML='<div class="card">课后题目录加载失败。请确认页面同一目录下可以打开 exercises.json。</div>';
  });
}
window.ExerciseCatalog={open:open,load:load};
})();
