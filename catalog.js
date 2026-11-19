/* Reference catalogs for 公式大全 and 知识点大全.
   Text is rendered from catalog.json unchanged. */
(function(){
'use strict';
var state={
  formula:{part:'all',chapter:'all',levels:{A:true,B:true,C:true},q:''},
  concept:{part:'all',chapter:'all',levels:{A:true,B:true,C:true},q:''}
};
var token=0;
var pending=null;
var katexCache=Object.create(null);

function load(){
  if(!pending){
    pending=fetch('catalog.json').then(function(r){
      if(!r.ok) throw new Error('catalog '+r.status);
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
function itemsOf(data,kind){return kind==='concept'?data.concepts:data.formulas;}
function tally(items){
  var o={n:items.length,atmos:0,env:0,A:0,B:0,C:0};
  items.forEach(function(it){
    if(o[it.part]!=null) o[it.part]++;
    if(o[it.level]!=null) o[it.level]++;
  });
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
function haystack(it,kind){
  if(kind==='concept') return [it.id,it.title,it.keywords,it.definition].join('\n');
  var fx=(it.expressions||[]).map(function(e){return (e.raw||'')+'\n'+(e.tex||'');}).join('\n');
  return [it.id,(it.aliases||[]).join(' '),it.title,fx].join('\n');
}
function selectedLevels(st){
  return ['A','B','C'].filter(function(lv){return st.levels[lv];});
}
function filtered(data,kind){
  var st=state[kind];
  var q=st.q.trim().toLowerCase();
  var lvs=selectedLevels(st);
  return itemsOf(data,kind).filter(function(it){
    if(st.part!=='all'&&it.part!==st.part) return false;
    if(st.chapter!=='all'&&String(it.chapter)!==String(st.chapter)) return false;
    if(lvs.indexOf(it.level)<0) return false;
    if(q&&haystack(it,kind).toLowerCase().indexOf(q)<0) return false;
    return true;
  });
}
function formulaHtml(expr){
  var tex=expr&&expr.tex!=null?String(expr.tex):'';
  if(Object.prototype.hasOwnProperty.call(katexCache,tex)) return katexCache[tex];
  var html=null;
  try{
    if(window.katex&&tex){
      html=window.katex.renderToString(tex,{throwOnError:true,displayMode:true,strict:'ignore',trust:false});
      if(!html||html.indexOf('katex-error')>=0) html=null;
    }
  }catch(e){html=null;}
  katexCache[tex]=html;
  return html;
}
function formulaBlock(expr){
  var html=formulaHtml(expr);
  if(html) return '<div class="fx">'+html+'</div>';
  return '<div class="fx fx-raw">'+esc(expr&&expr.raw!=null?expr.raw:'')+'</div>';
}
function conceptCard(it){
  return '<article class="card ref" data-id="'+esc(it.id)+'">'+
    '<div class="ref-top"><span class="tag">'+esc(it.id)+'</span>'+
    '<span class="lv '+esc(it.level)+'">'+esc(it.level)+' · '+esc(it.level_label)+'</span>'+
    (it.kind?'<span class="tag">'+esc(it.kind)+'</span>':'')+
    '<span class="tag">'+esc(partName(it.part))+' · 第'+esc(it.chapter)+'章 '+esc(it.chapter_title)+'</span></div>'+
    '<h3 class="ref-title">'+esc(it.title)+'</h3>'+
    '<div class="ref-def">'+esc(it.definition)+'</div>'+
    '<div class="ref-sec"><div class="ref-k">关键词</div><div>'+esc(it.keywords)+'</div></div>'+
    '<div class="ref-sec"><div class="ref-k">易错点</div><div>'+esc(it.pitfalls)+'</div></div>'+
    '</article>';
}
function formulaCard(it){
  var alias=(it.aliases&&it.aliases.length)?'<span class="alias">别名 '+esc(it.aliases.join('、'))+'</span>':'';
  var tag=it.tag?'<span class="tag o">'+esc(it.tag)+'</span>':'';
  var fx=(it.expressions||[]).map(formulaBlock).join('');
  return '<article class="card ref" data-id="'+esc(it.id)+'">'+
    '<div class="ref-top"><span class="tag">'+esc(it.id)+'</span>'+alias+
    '<span class="lv '+esc(it.level)+'">'+esc(it.level)+' · '+esc(it.level_note)+'</span>'+
    tag+
    '<span class="tag">'+esc(partName(it.part))+' · 第'+esc(it.chapter)+'章 '+esc(it.chapter_title)+'</span></div>'+
    '<h3 class="ref-title">'+esc(it.title)+'</h3>'+
    fx+
    '<div class="ref-sec"><div class="ref-k">符号</div><div>'+esc(it.symbols)+'</div></div>'+
    '<div class="ref-sec"><div class="ref-k">条件</div><div>'+esc(it.conditions)+'</div></div>'+
    '<div class="ref-sec"><div class="ref-k">易错点</div><div>'+esc(it.pitfalls)+'</div></div>'+
    '</article>';
}
function syncNavH(){
  var bar=document.getElementById('topbar')||document.getElementById('modeNav');
  if(bar) document.documentElement.style.setProperty('--topbar-h',bar.getBoundingClientRect().height+'px');
}
function fillChapters(data,kind){
  var sel=document.getElementById('refChap');
  if(!sel) return;
  var st=state[kind];
  var rows=chaptersFor(itemsOf(data,kind),st.part);
  sel.innerHTML='<option value="all">全部章节</option>'+rows.map(function(row){
    return '<option value="'+esc(row.n)+'">'+esc(chapterLabel(row,st.part))+'</option>';
  }).join('');
  sel.value=String(st.chapter);
  if(sel.value!==String(st.chapter)){st.chapter='all';sel.value='all';}
}
function renderList(data,kind){
  var list=document.getElementById('refList');
  var count=document.getElementById('refCount');
  if(!list||!count) return;
  var all=itemsOf(data,kind);
  var got=filtered(data,kind);
  var unit=kind==='concept'?'条概念':'组公式';
  var name=kind==='concept'?'知识点大全':'公式大全';
  count.textContent=name+' · 当前 '+got.length+' / '+all.length+' '+unit;
  var st=state[kind];
  var onlyC=!!(st.levels.C&&!st.levels.A&&!st.levels.B);
  if(!got.length){
    if(kind==='formula'&&onlyC){
      list.innerHTML='<div class="card mut" id="refEmpty">公式没有 C 级，当前没有条目。</div>';
    }else{
      list.innerHTML='<div class="card mut" id="refEmpty">没有符合筛选的条目。</div>';
    }
    return;
  }
  list.innerHTML=got.map(kind==='concept'?conceptCard:formulaCard).join('');
}
function legendHtml(kind){
  if(kind==='concept') return 'A 先背 · B 重点理解 · C 查漏。可多选。';
  return 'A 写出主式并会基本应用 · B 理解识别或给式应用 · <span class="nobr">无 C 级</span>。可多选。';
}
function shell(data,kind){
  var all=tally(itemsOf(data,kind));
  var note=data.meta&&data.meta.note?data.meta.note:'';
  var lib=kind==='concept'
    ?('全库 '+all.n+' 条：大气 '+all.atmos+'，环境 '+all.env+'；A '+all.A+'，B '+all.B+'，C '+all.C)
    :('全库 '+all.n+' 组：大气 '+all.atmos+'，环境 '+all.env+'；A '+all.A+'，B '+all.B+'，无 C 级');
  var st=state[kind];
  var ph=kind==='concept'?'编号、标题、关键词或定义':'编号、标题或公式';
  function partBtn(val,label){
    var on=st.part===val;
    return '<button type="button" data-part="'+val+'" class="'+(on?'on':'')+'" aria-pressed="'+(on?'true':'false')+'">'+label+'</button>';
  }
  function lvBtn(lv,label){
    var on=!!st.levels[lv];
    return '<button type="button" data-lv="'+lv+'" class="'+lv+(on?' on':'')+'" aria-pressed="'+(on?'true':'false')+'">'+label+'</button>';
  }
  var lvLabels=kind==='concept'
    ?{A:'A 先背',B:'B 重点理解',C:'C 查漏'}
    :{A:'A',B:'B',C:'C'};
  return '<p class="ref-note" id="refNote">'+esc(note)+'</p>'+
    '<div class="mut" id="refAll">'+esc(lib)+'</div>'+
    '<div class="ref-tools">'+
      '<div class="ref-count" id="refCount"></div>'+
      '<div class="seg" role="group" aria-label="分部">'+partBtn('all','全部')+partBtn('atmos','大气')+partBtn('env','环境')+'</div>'+
      '<label class="mut ref-lab" for="refChap">章节</label>'+
      '<select id="refChap"></select>'+
      '<div class="mut ref-lab" id="refLvLegend">'+legendHtml(kind)+'</div>'+
      '<div class="seg lvs" role="group" aria-label="重要级">'+lvBtn('A',lvLabels.A)+lvBtn('B',lvLabels.B)+lvBtn('C',lvLabels.C)+'</div>'+
    '</div>'+
    '<input id="refQ" type="search" aria-label="搜索" enterkeyhint="search" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="'+esc(ph)+'" value="'+esc(st.q)+'">'+
    '<div id="refList"></div>';
}
function bind(root,data,kind){
  var st=state[kind];
  Array.prototype.forEach.call(root.querySelectorAll('[data-part]'),function(btn){
    btn.addEventListener('click',function(){
      st.part=btn.getAttribute('data-part');
      Array.prototype.forEach.call(root.querySelectorAll('[data-part]'),function(b){
        var on=b===btn;
        b.classList.toggle('on',on);
        b.setAttribute('aria-pressed',on?'true':'false');
      });
      fillChapters(data,kind);
      renderList(data,kind);
      window.scrollTo(0,0);
    });
  });
  var chap=document.getElementById('refChap');
  chap.addEventListener('change',function(){
    st.chapter=chap.value;
    renderList(data,kind);
    window.scrollTo(0,0);
  });
  Array.prototype.forEach.call(root.querySelectorAll('[data-lv]'),function(btn){
    btn.addEventListener('click',function(){
      var lv=btn.getAttribute('data-lv');
      st.levels[lv]=!st.levels[lv];
      btn.classList.toggle('on',!!st.levels[lv]);
      btn.setAttribute('aria-pressed',st.levels[lv]?'true':'false');
      renderList(data,kind);
      window.scrollTo(0,0);
    });
  });
  var input=document.getElementById('refQ');
  var timer=null;
  var composing=false;
  function queue(){
    clearTimeout(timer);
    timer=setTimeout(function(){renderList(data,kind);},80);
  }
  input.addEventListener('compositionstart',function(){composing=true;});
  input.addEventListener('compositionend',function(){composing=false;st.q=input.value;queue();});
  input.addEventListener('input',function(){if(composing)return;st.q=input.value;queue();});
}
function open(root,kind){
  if(kind!=='formula'&&kind!=='concept') return;
  var my=++token;
  syncNavH();
  root.innerHTML='<div class="card mut" id="refStatus">正在加载手册条目…</div>';
  load().then(function(data){
    if(my!==token||!document.getElementById('refStatus')) return;
    if(!data||!data.concepts||!data.formulas) throw new Error('shape');
    root.innerHTML=shell(data,kind);
    syncNavH();
    fillChapters(data,kind);
    bind(root,data,kind);
    renderList(data,kind);
  }).catch(function(){
    if(my!==token||!document.getElementById('refStatus')) return;
    root.innerHTML='<div class="card">手册目录加载失败。请确认页面同一目录下可以打开 catalog.json。</div>';
  });
}
window.RefCatalog={open:open,load:load};
})();
