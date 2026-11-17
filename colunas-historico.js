/* Diz que Diz — histórico de colunas exibido embaixo da coluna aberta.
   Uso: RDColunasHistorico.render(elementoAlvo, idDaColunaAtual)
   Junta colunas.json + matérias com tag "Diz que Diz" do noticias.json (sem duplicar),
   mostra as 5 mais recentes e um botão "Ver mais colunas" para listar todas. */
(function(){
  var INICIAIS = 5;
  var cache = null;

  function esc(s){ var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
  function fmt(iso){
    if(!iso) return '';
    var p = iso.split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
  }
  function ehColuna(n){ return n && (n.tag === 'Diz que Diz' || /diz-que-diz/.test(n.id || '')); }

  function getJson(url){
    return fetch(url).then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; });
  }

  function carregar(){
    if(cache) return cache;
    cache = Promise.all([getJson('colunas.json'), getJson('noticias.json')]).then(function(res){
      var mapa = {};
      (res[0] || []).forEach(function(c){ if(c && c.id) mapa[c.id] = c; });
      (res[1] || []).filter(ehColuna).forEach(function(n){
        // a versão do noticias.json prevalece (é onde título/edições mais recentes entram)
        mapa[n.id] = Object.assign({}, mapa[n.id] || {}, n);
      });
      return Object.keys(mapa).map(function(k){ return mapa[k]; })
        .sort(function(a, b){ return (b.data || '').localeCompare(a.data || '') || (b.id || '').localeCompare(a.id || ''); });
    });
    return cache;
  }

  function injetarEstilo(){
    if(document.getElementById('rd-hist-css')) return;
    var css = '' +
      '.rd-hist{margin:10px 0 40px;}' +
      '.rd-hist-head{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #142850;padding-bottom:8px;margin-bottom:16px;}' +
      '.rd-hist-head h2{font-size:17px;font-weight:800;color:#142850;text-transform:uppercase;letter-spacing:.3px;margin:0;}' +
      '.rd-hist-head a{font-size:13px;font-weight:700;color:#FF6B35;}' +
      '.rd-hist-lista{display:flex;flex-direction:column;gap:12px;}' +
      '.rd-hist-item{display:flex;gap:14px;align-items:center;background:#fff;border-radius:12px;padding:12px;box-shadow:0 2px 10px rgba(20,40,80,.06);transition:transform .15s;text-decoration:none;color:inherit;}' +
      '.rd-hist-item:hover{transform:translateY(-2px);}' +
      '.rd-hist-item img{width:112px;height:72px;object-fit:cover;border-radius:8px;flex:0 0 auto;background:#eee;}' +
      '.rd-hist-txt{min-width:0;}' +
      '.rd-hist-data{display:block;font-size:11px;font-weight:700;color:#FF6B35;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;}' +
      '.rd-hist-titulo{display:block;font-size:15px;font-weight:800;color:#142850;line-height:1.3;}' +
      '.rd-hist-resumo{display:block;font-size:13px;color:#6B7280;line-height:1.4;margin-top:3px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}' +
      '.rd-hist-mais{display:block;width:100%;margin-top:14px;padding:13px;border:2px solid #142850;border-radius:30px;background:transparent;color:#142850;font-weight:800;font-size:14px;cursor:pointer;font-family:inherit;}' +
      '.rd-hist-mais:hover{background:#142850;color:#fff;}' +
      '@media(max-width:500px){.rd-hist-item img{width:88px;height:60px;}.rd-hist-resumo{display:none;}}';
    var st = document.createElement('style');
    st.id = 'rd-hist-css';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function itemHtml(c){
    return '<a class="rd-hist-item" href="coluna.html?id=' + encodeURIComponent(c.id) + '">' +
      (c.foto ? '<img src="' + esc(c.foto) + '" alt="" loading="lazy">' : '') +
      '<span class="rd-hist-txt">' +
        '<span class="rd-hist-data">' + fmt(c.data) + '</span>' +
        '<span class="rd-hist-titulo">' + esc(c.titulo) + '</span>' +
        (c.resumo ? '<span class="rd-hist-resumo">' + esc(c.resumo) + '</span>' : '') +
      '</span></a>';
  }

  function render(alvo, idAtual){
    if(!alvo) return;
    injetarEstilo();
    carregar().then(function(todas){
      var outras = todas.filter(function(c){ return c.id !== idAtual; });
      if(!outras.length){ alvo.innerHTML = ''; return; }
      var mostrandoTudo = false;
      function desenhar(){
        var lista = mostrandoTudo ? outras : outras.slice(0, INICIAIS);
        alvo.innerHTML = '<section class="rd-hist">' +
          '<div class="rd-hist-head"><h2>Outras colunas do Vizinho</h2><a href="coluna.html">Ver todas &rarr;</a></div>' +
          '<div class="rd-hist-lista">' + lista.map(itemHtml).join('') + '</div>' +
          (!mostrandoTudo && outras.length > INICIAIS
            ? '<button type="button" class="rd-hist-mais">Ver mais colunas (' + (outras.length - INICIAIS) + ')</button>'
            : '') +
          '</section>';
        var btn = alvo.querySelector('.rd-hist-mais');
        if(btn) btn.addEventListener('click', function(){ mostrandoTudo = true; desenhar(); });
      }
      desenhar();
    });
  }

  window.RDColunasHistorico = { render: render, carregar: carregar };
})();
