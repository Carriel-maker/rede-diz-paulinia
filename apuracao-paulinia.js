/*!
 * Rede Diz — "Paulínia nas urnas" (apuração ao vivo, Eleições 2026, 1º turno)
 * Fonte: arquivos JSON oficiais do TSE (resultados.tse.jus.br), especificação EA20/EA12.
 *
 * Como usar: incluir antes de </body>:
 *   <script src="apuracao-paulinia.js" defer></script>
 *
 * Testes (no endereço do site):
 *   ?apuracao=demo       -> abre com dados fictícios (só visual)
 *   ?apuracao=simulado   -> usa o ambiente SIMULADO do TSE (testa conexão/CORS de verdade)
 *   ?apuracao=1          -> força abrir com os dados OFICIAIS
 */
(function () {
  'use strict';

  /* ===================== CONFIGURAÇÃO ===================== */
  var CONFIG = {
    // Janela em que o pop-up abre sozinho (1x por sessão) e o botão flutuante aparece
    ABRE_SOZINHO_DE: '2026-10-04T17:00:00-03:00',
    ABRE_SOZINHO_ATE: '2026-10-05T23:59:00-03:00',
    BOTAO_ATE: '2026-10-11T23:59:00-03:00',

    UF: 'sp',
    NOME_MUNICIPIO: 'PAULINIA',   // usado para achar o código TSE automaticamente
    COD_MUNICIPIO_TSE: '',        // se souber, preencha com 5 dígitos (ex.: '6xxxx') e pula a busca

    ATUALIZA_SEGUNDOS: 60,        // intervalo de atualização (TSE: limite de 100 req/s por IP)
    TOP_DEPUTADOS: 10,

    // Monitor editorial "Candidatos ligados a Paulínia" (preencher até sábado)
    // cargo: '0006' = Dep. Federal | '0007' = Dep. Estadual
    MONITOR: [
      { cargo: '0007', numero: 20077, nome: 'Du Cazellato', partido: 'PODE' },
      { cargo: '0007', numero: 15152, nome: 'Anderson Henrique', partido: 'MDB' },
      { cargo: '0006', numero: 5506, nome: 'Bruno Wellington (BW)', partido: 'PSD' },
      { cargo: '0006', numero: 5553, nome: 'Eliel Miranda', partido: 'PSD' },
      { cargo: '0006', numero: 2750, nome: 'Pedro Bernarde', partido: 'DC' },
      { cargo: '0006', numero: 4520, nome: 'Robert Paiva', partido: 'PSDB' },
      { cargo: '0006', numero: 1251, nome: 'Sanzio Rodrigues', partido: 'PDT' }
    ],

    AMBIENTES: {
      oficial:  { base: 'https://resultados.tse.jus.br/oficial',  amb: '', federal: 6257,  estadual: 6259 },
      simulado: { base: 'https://resultados-sim.tse.jus.br/simulado', amb: 'simulado2026', federal: 21270, estadual: 21272 }
    },
    CICLO: 'ele2026'
  };

  var CARGOS = {
    '0001': { nome: 'Presidente', eleicao: 'federal' },
    '0003': { nome: 'Governador', eleicao: 'estadual' },
    '0005': { nome: 'Senador', eleicao: 'estadual' },
    '0006': { nome: 'Deputado Federal', eleicao: 'estadual' },
    '0007': { nome: 'Deputado Estadual', eleicao: 'estadual' }
  };

  /* ===================== MODO ===================== */
  var qs = new URLSearchParams(location.search);
  var modoParam = qs.get('apuracao');
  var MODO = modoParam === 'demo' ? 'demo' : (modoParam === 'simulado' ? 'simulado' : 'oficial');
  var forcar = !!modoParam;
  var agora = Date.now();
  var t = function (s) { return new Date(s).getTime(); };
  if (!forcar && agora > t(CONFIG.BOTAO_ATE)) return;
  if (!forcar && agora < t(CONFIG.ABRE_SOZINHO_DE)) return;

  var AMB = CONFIG.AMBIENTES[MODO === 'simulado' ? 'simulado' : 'oficial'];

  /* ===================== UTIL ===================== */
  function pad(n, len) { n = String(n); while (n.length < len) n = '0' + n; return n; }
  function num(v) {
    if (v === undefined || v === null || v === '') return 0;
    if (typeof v === 'number') return v;
    return parseFloat(String(v).replace(/[.]/g, '').replace(',', '.')) || 0;
  }
  function pct(v) { return num(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'; }
  function int(v) { return num(v).toLocaleString('pt-BR'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim(); }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  function eleCode(cargo) { return AMB[CARGOS[cargo].eleicao]; }
  function root(ele) { return AMB.base + (AMB.amb ? '/' + AMB.amb : '') + '/' + CONFIG.CICLO + '/' + ele; }
  function urlResultado(abr, cargo) {
    var ele = eleCode(cargo);
    var pasta = abr === 'br' ? 'br' : CONFIG.UF;
    return root(ele) + '/dados/' + pasta + '/' + abr + '-c' + cargo + '-e' + pad(ele, 6) + '-u.json';
  }

  // cache por URL + proteção contra 404 repetido (TSE bloqueia IP com muitos 404)
  var cache = {}, falhas = {};
  function getJSON(url) {
    if (falhas[url] && Date.now() - falhas[url] < 5 * 60 * 1000) return Promise.reject(new Error('aguardando'));
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) { falhas[url] = Date.now(); throw new Error('HTTP ' + r.status); }
      return r.json();
    }).then(function (j) { cache[url] = j; return j; })
      .catch(function (e) { if (cache[url]) return cache[url]; throw e; });
  }

  /* ===================== CÓDIGO DO MUNICÍPIO ===================== */
  function codMunicipio() {
    if (CONFIG.COD_MUNICIPIO_TSE) return Promise.resolve(pad(CONFIG.COD_MUNICIPIO_TSE, 5));
    var chave = 'rd-cod-mun-' + MODO;
    var salvo = ls(chave);
    if (salvo) return Promise.resolve(salvo);
    var ele = AMB.federal;
    var url = root(ele) + '/config/mun-e' + pad(ele, 6) + '-cm.json';
    return getJSON(url).then(function (cfg) {
      var ufs = cfg.abr || [];
      for (var i = 0; i < ufs.length; i++) {
        if (norm(ufs[i].cd) !== norm(CONFIG.UF)) continue;
        var mus = ufs[i].mu || [];
        for (var k = 0; k < mus.length; k++) {
          if (norm(mus[k].nm) === CONFIG.NOME_MUNICIPIO) {
            var c = pad(mus[k].cd, 5);
            ls(chave, c);
            return c;
          }
        }
      }
      throw new Error('Município não encontrado na configuração do TSE');
    });
  }

  /* ===================== LEITURA EA20 ===================== */
  function candidatos(json) {
    var out = [];
    ((json && json.carg) || []).forEach(function (cg) {
      (cg.agr || []).forEach(function (ag) {
        (ag.par || []).forEach(function (p) {
          (p.cand || []).forEach(function (c) {
            out.push({ n: num(c.n), nome: c.nmu || c.nm, partido: p.sg, vap: num(c.vap), pvap: num(c.pvap), st: c.st || '', dvt: c.dvt || '', e: c.e });
          });
        });
      });
    });
    out.sort(function (a, b) { return b.vap - a.vap; });
    return out;
  }
  function resumo(json) {
    var s = (json && json.s) || {}, v = (json && json.v) || {}, e = (json && json.e) || {};
    return {
      pst: num(s.pst), st: num(s.st), ts: num(s.ts),
      vv: num(v.vv), pvv: num(v.pvv), vb: num(v.vb), pvb: num(v.pvb), tvn: num(v.tvn), ptvn: num(v.ptvn),
      pa: num(e.pa), te: num(e.te),
      hora: (json && (json.ht || json.hg)) || '', data: (json && (json.dt || json.dg)) || ''
    };
  }

  /* ===================== DADOS DEMO ===================== */
  function demo(cargo, abr) {
    var nomes = {
      '0001': [['CANDIDATO A', 'PTA'], ['CANDIDATA B', 'PTB'], ['CANDIDATO C', 'PTC'], ['CANDIDATA D', 'PTD']],
      '0003': [['CANDIDATO E', 'PTE'], ['CANDIDATA F', 'PTF'], ['CANDIDATO G', 'PTG']],
      '0005': [['CANDIDATA H', 'PTH'], ['CANDIDATO I', 'PTI'], ['CANDIDATA J', 'PTJ'], ['CANDIDATO K', 'PTK']]
    }[cargo];
    var seed = (abr === 'br' ? 7 : abr === 'sp' ? 3 : 1) + num(cargo);
    if (!nomes) {
      nomes = []; for (var i = 0; i < 40; i++) nomes.push(['CANDIDATO ' + (i + 1), 'P' + (i % 9), 100 + i]);
      CONFIG.MONITOR.forEach(function (m, j) { if (m.cargo === cargo) nomes.splice(3 + j * 4, 0, [m.nome.toUpperCase(), m.partido, m.numero]); });
    }
    var votos = nomes.map(function (x, i) { return Math.round(30000 / (i + 1 + (seed % 3) * 0.3)); });
    var tot = votos.reduce(function (a, b) { return a + b; }, 0);
    return {
      ht: new Date().toTimeString().slice(0, 8), dt: new Date().toLocaleDateString('pt-BR'),
      s: { ts: 300, st: 214, pst: '71,33' }, e: { te: 90000, pa: '18,40' },
      v: { vv: tot, pvv: '91,20', vb: 2100, pvb: '3,10', tvn: 3800, ptvn: '5,70' },
      carg: [{ agr: [{ par: nomes.map(function (x, i) {
        return { sg: x[1], cand: [{ n: x[2] || 10 + i, nmu: x[0], vap: votos[i], pvap: (votos[i] / tot * 100).toFixed(2).replace('.', ','), st: '', dvt: 'Válido' }] };
      }) }] }]
    };
  }

  function carregar(abr, cargo) {
    if (MODO === 'demo') return Promise.resolve(demo(cargo, abr));
    return getJSON(urlResultado(abr, cargo));
  }

  /* ===================== ESTILO ===================== */
  var css = '' +
    '.rdap-pill{position:fixed;right:16px;bottom:16px;z-index:9998;background:#142850;color:#fff;border:0;border-radius:999px;padding:12px 18px;font:700 14px/1 system-ui,-apple-system,Segoe UI,Arial,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25);cursor:pointer;display:flex;align-items:center;gap:8px}' +
    '.rdap-dot{width:9px;height:9px;border-radius:50%;background:#FF6B35;animation:rdap-p 1.4s infinite}' +
    '@keyframes rdap-p{0%{box-shadow:0 0 0 0 rgba(255,107,53,.7)}70%{box-shadow:0 0 0 8px rgba(255,107,53,0)}100%{box-shadow:0 0 0 0 rgba(255,107,53,0)}}' +
    '.rdap-ov{position:fixed;inset:0;z-index:9999;background:rgba(10,20,40,.55);display:flex;align-items:center;justify-content:center;padding:16px}' +
    '.rdap-box{background:#F7F5F2;color:#1B1B1B;width:100%;max-width:720px;max-height:92vh;border-radius:16px;overflow:hidden;display:flex;flex-direction:column;font:14px/1.45 system-ui,-apple-system,Segoe UI,Arial,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.35)}' +
    '.rdap-hd{background:#142850;color:#fff;padding:16px 18px 0}' +
    '.rdap-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}' +
    '.rdap-kick{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#FF6B35;display:flex;align-items:center;gap:6px}' +
    '.rdap-tt{font-size:22px;font-weight:900;margin:2px 0 4px;letter-spacing:-.01em}' +
    '.rdap-sub{font-size:12px;opacity:.8}' +
    '.rdap-x{background:rgba(255,255,255,.12);color:#fff;border:0;width:34px;height:34px;border-radius:50%;font-size:18px;cursor:pointer;flex:none}' +
    '.rdap-prog{height:6px;background:rgba(255,255,255,.18);border-radius:3px;margin:12px 0 4px;overflow:hidden}' +
    '.rdap-prog i{display:block;height:100%;background:#FF6B35;transition:width .6s}' +
    '.rdap-tabs{display:flex;gap:4px;overflow-x:auto;margin-top:10px;scrollbar-width:none}' +
    '.rdap-tab{background:none;border:0;color:rgba(255,255,255,.7);padding:10px 12px;font:600 13px system-ui,sans-serif;cursor:pointer;border-bottom:3px solid transparent;white-space:nowrap}' +
    '.rdap-tab[aria-selected=true]{color:#fff;border-bottom-color:#FF6B35}' +
    '.rdap-bd{overflow-y:auto;padding:16px;flex:1}' +
    '.rdap-card{background:#fff;border-radius:12px;padding:14px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,.06)}' +
    '.rdap-ch{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:10px}' +
    '.rdap-ch h3{margin:0;font-size:15px;color:#142850;font-weight:800}' +
    '.rdap-ch span{font-size:11px;color:#6B7280}' +
    '.rdap-row{display:grid;grid-template-columns:1fr auto;gap:2px 10px;margin-bottom:9px}' +
    '.rdap-nm{font-weight:700;font-size:13px}.rdap-nm small{font-weight:500;color:#6B7280;margin-left:4px}' +
    '.rdap-pc{font-weight:800;font-variant-numeric:tabular-nums;text-align:right}' +
    '.rdap-bar{grid-column:1/-1;height:7px;background:#EEF0F4;border-radius:4px;overflow:hidden}' +
    '.rdap-bar i{display:block;height:100%;background:#1f3a6e;border-radius:4px}' +
    '.rdap-row:first-of-type .rdap-bar i{background:#FF6B35}' +
    '.rdap-vt{grid-column:1/-1;font-size:11px;color:#6B7280;font-variant-numeric:tabular-nums}' +
    '.rdap-st{display:inline-block;font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;background:#2EC4B6;color:#fff;margin-left:6px;vertical-align:1px}' +
    '.rdap-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}' +
    '.rdap-kpi{background:#fff;border-radius:10px;padding:10px;text-align:center}' +
    '.rdap-kpi b{display:block;font-size:17px;color:#142850;font-variant-numeric:tabular-nums}.rdap-kpi span{font-size:11px;color:#6B7280}' +
    '.rdap-note{font-size:12px;color:#6B7280;background:#fff;border-left:3px solid #2EC4B6;padding:8px 10px;border-radius:6px;margin-bottom:12px}' +
    '.rdap-tbl{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}' +
    '.rdap-tbl th{text-align:right;font-size:11px;color:#6B7280;font-weight:600;padding:4px 6px}.rdap-tbl th:first-child,.rdap-tbl td:first-child{text-align:left}' +
    '.rdap-tbl td{padding:6px;border-top:1px solid #EEF0F4;text-align:right}' +
    '.rdap-ft{padding:10px 16px;font-size:11px;color:#6B7280;border-top:1px solid #e5e2dc;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}' +
    '.rdap-ft a{color:#142850}' +
    '.rdap-err{color:#b42318;font-size:13px}' +
    '@media (max-width:560px){.rdap-ov{padding:0;align-items:flex-end}.rdap-box{max-height:94vh;border-radius:16px 16px 0 0}.rdap-kpis{grid-template-columns:repeat(2,1fr)}.rdap-tt{font-size:19px}}';

  /* ===================== UI ===================== */
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var abas = [
    { id: 'geral', nome: 'Visão geral' },
    { id: 'deputados', nome: 'Deputados' },
    { id: 'monitor', nome: 'Candidatos ligados a Paulínia' },
    { id: 'comparativo', nome: 'Paulínia x SP x Brasil' }
  ];
  if (!CONFIG.MONITOR.length) abas = abas.filter(function (a) { return a.id !== 'monitor'; });

  var ov, bd, prog, sub, aberta = false, abaAtual = 'geral', timer = null, MUN = null;

  var pill = document.createElement('button');
  pill.className = 'rdap-pill';
  pill.innerHTML = '<span class="rdap-dot"></span>Apuração ao vivo';
  pill.addEventListener('click', abrir);
  document.body.appendChild(pill);

  function montar() {
    ov = document.createElement('div');
    ov.className = 'rdap-ov';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', 'Paulínia nas urnas — apuração ao vivo');
    ov.innerHTML =
      '<div class="rdap-box">' +
        '<div class="rdap-hd">' +
          '<div class="rdap-top"><div>' +
            '<div class="rdap-kick"><span class="rdap-dot"></span>Apuração ao vivo' + (MODO !== 'oficial' ? ' · ' + MODO.toUpperCase() : '') + '</div>' +
            '<div class="rdap-tt">Paulínia nas urnas</div>' +
            '<div class="rdap-sub" id="rdap-sub">Carregando dados do TSE…</div>' +
          '</div><button class="rdap-x" aria-label="Fechar">×</button></div>' +
          '<div class="rdap-prog"><i id="rdap-prog" style="width:0"></i></div>' +
          '<div class="rdap-tabs" role="tablist">' + abas.map(function (a) {
            return '<button class="rdap-tab" role="tab" data-aba="' + a.id + '" aria-selected="' + (a.id === abaAtual) + '">' + a.nome + '</button>';
          }).join('') + '</div>' +
        '</div>' +
        '<div class="rdap-bd" id="rdap-bd"></div>' +
        '<div class="rdap-ft"><span>Fonte: TSE — resultados parciais e oficiais da totalização.</span><a href="https://resultados.tse.jus.br/oficial/app/index.html" target="_blank" rel="noopener">Ver no TSE</a></div>' +
      '</div>';
    document.body.appendChild(ov);
    bd = ov.querySelector('#rdap-bd'); prog = ov.querySelector('#rdap-prog'); sub = ov.querySelector('#rdap-sub');
    ov.querySelector('.rdap-x').addEventListener('click', fechar);
    ov.addEventListener('click', function (e) { if (e.target === ov) fechar(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && aberta) fechar(); });
    ov.querySelectorAll('.rdap-tab').forEach(function (b) {
      b.addEventListener('click', function () {
        abaAtual = b.getAttribute('data-aba');
        ov.querySelectorAll('.rdap-tab').forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
        bd.innerHTML = '<p class="rdap-sub" style="color:#6B7280">Carregando…</p>';
        atualizar();
      });
    });
  }

  function abrir() {
    if (!ov) montar();
    ov.style.display = 'flex'; aberta = true; pill.style.display = 'none';
    document.documentElement.style.overflow = 'hidden';
    atualizar();
  }
  function fechar() {
    ov.style.display = 'none'; aberta = false; pill.style.display = '';
    document.documentElement.style.overflow = '';
    clearTimeout(timer);
  }

  /* ===================== RENDER ===================== */
  function linhas(lista, max) {
    return lista.slice(0, max || lista.length).map(function (c) {
      return '<div class="rdap-row"><div class="rdap-nm">' + esc(c.nome) + '<small>' + esc(c.partido) + '</small>' +
        (c.st && /eleito|2º turno/i.test(c.st) && !/não/i.test(c.st) ? '<span class="rdap-st">' + esc(c.st) + '</span>' : '') +
        '</div><div class="rdap-pc">' + pct(c.pvap) + '</div><div class="rdap-bar"><i style="width:' + Math.min(100, c.pvap) + '%"></i></div>' +
        '<div class="rdap-vt">' + int(c.vap) + ' votos</div></div>';
    }).join('');
  }
  function card(titulo, nota, corpo) {
    return '<div class="rdap-card"><div class="rdap-ch"><h3>' + titulo + '</h3><span>' + (nota || '') + '</span></div>' + corpo + '</div>';
  }

  function cabecalho(json) {
    var r = resumo(json);
    prog.style.width = Math.min(100, r.pst) + '%';
    sub.textContent = pct(r.pst) + ' das seções totalizadas em Paulínia' + (r.hora ? ' · atualizado às ' + r.hora.slice(0, 5) : '');
    return r;
  }

  function abaGeral() {
    var mun = CONFIG.UF + MUN;
    return Promise.all(['0001', '0003', '0005'].map(function (c) { return carregar(mun, c); })).then(function (js) {
      var r = cabecalho(js[0]);
      var h = '<div class="rdap-kpis">' +
        '<div class="rdap-kpi"><b>' + pct(r.pst) + '</b><span>seções totalizadas</span></div>' +
        '<div class="rdap-kpi"><b>' + pct(r.pvv) + '</b><span>votos válidos</span></div>' +
        '<div class="rdap-kpi"><b>' + pct(r.pvb) + '</b><span>brancos</span></div>' +
        '<div class="rdap-kpi"><b>' + pct(r.ptvn) + '</b><span>nulos</span></div></div>';
      h += '<div class="rdap-note">Percentuais de votos válidos em Paulínia. Brancos e nulos referem-se à votação para presidente.</div>';
      h += card('Presidente em Paulínia', int(resumo(js[0]).vv) + ' válidos', linhas(candidatos(js[0])));
      h += card('Governador em Paulínia', int(resumo(js[1]).vv) + ' válidos', linhas(candidatos(js[1])));
      h += card('Senado em Paulínia', '2 vagas · 2 votos por eleitor', linhas(candidatos(js[2])));
      return h;
    });
  }

  function abaDeputados() {
    var mun = CONFIG.UF + MUN;
    return Promise.all([carregar(mun, '0006'), carregar(mun, '0007')]).then(function (js) {
      cabecalho(js[0]);
      var h = '<div class="rdap-note">Lista dos <b>mais votados em Paulínia</b>. Deputados são eleitos pelo sistema proporcional, com a votação de todo o estado — estar no topo aqui não significa estar eleito.</div>';
      h += card('Dep. federal — mais votados em Paulínia', 'top ' + CONFIG.TOP_DEPUTADOS, linhas(candidatos(js[0]), CONFIG.TOP_DEPUTADOS));
      h += card('Dep. estadual — mais votados em Paulínia', 'top ' + CONFIG.TOP_DEPUTADOS, linhas(candidatos(js[1]), CONFIG.TOP_DEPUTADOS));
      return h;
    });
  }

  function abaMonitor() {
    var mun = CONFIG.UF + MUN;
    var cargos = CONFIG.MONITOR.map(function (m) { return m.cargo; }).filter(function (c, i, a) { return a.indexOf(c) === i; });
    var reqs = [];
    cargos.forEach(function (c) { reqs.push(carregar(mun, c)); reqs.push(carregar(CONFIG.UF, c)); });
    return Promise.all(reqs).then(function (js) {
      cabecalho(js[0]);
      var porCargo = {};
      cargos.forEach(function (c, i) { porCargo[c] = { mun: candidatos(js[i * 2]), uf: candidatos(js[i * 2 + 1]), rUf: resumo(js[i * 2 + 1]) }; });
      var h = '<div class="rdap-note">Seleção editorial da Rede Diz. Votos em Paulínia, total no estado e situação oficial na disputa (definida pela votação estadual).</div>';
      var linhasMon = CONFIG.MONITOR.map(function (m) {
        var d = porCargo[m.cargo];
        var cm = d.mun.filter(function (c) { return c.n === num(m.numero); })[0] || {};
        var cu = d.uf.filter(function (c) { return c.n === num(m.numero); })[0] || {};
        return { m: m, cm: cm, cu: cu, pos: d.uf.indexOf(cu) + 1 };
      });
      linhasMon.sort(function (a, b) { return (b.cm.vap || 0) - (a.cm.vap || 0); });
      var rows = linhasMon.map(function (x) {
        var m = x.m, cm = x.cm, cu = x.cu, pos = x.pos;
        return '<tr><td><b>' + esc(m.nome || cu.nome || cm.nome || ('Nº ' + m.numero)) + '</b> <small style="color:#6B7280">' + esc(cu.partido || m.partido || '') + ' ' + m.numero + '</small>' +
          '<br><small style="color:#6B7280">' + CARGOS[m.cargo].nome + (m.rotulo ? ' · ' + esc(m.rotulo) : '') + '</small></td>' +
          '<td>' + int(cm.vap) + '<br><small style="color:#6B7280">' + pct(cm.pvap) + '</small></td>' +
          '<td>' + int(cu.vap) + '<br><small style="color:#6B7280">' + (pos ? pos + 'º no estado' : '—') + '</small></td>' +
          '<td>' + esc(cu.st || 'Em apuração') + '</td></tr>';
      }).join('');
      h += card('Candidatos ligados a Paulínia', '',
        '<table class="rdap-tbl"><thead><tr><th>Candidato</th><th>Paulínia</th><th>Estado</th><th>Situação</th></tr></thead><tbody>' + rows + '</tbody></table>');
      return h;
    });
  }

  function abaComparativo() {
    var mun = CONFIG.UF + MUN;
    var reqs = [carregar(mun, '0001'), carregar(CONFIG.UF, '0001'), carregar('br', '0001'),
      carregar(mun, '0003'), carregar(CONFIG.UF, '0003'), carregar(mun, '0005'), carregar(CONFIG.UF, '0005')];
    return Promise.all(reqs).then(function (js) {
      cabecalho(js[0]);
      function tabela(titulo, fontes, rotulos) {
        var base = candidatos(fontes[0]).slice(0, 5);
        var outros = fontes.map(candidatos);
        var rs = fontes.map(resumo);
        var head = '<tr><th>Candidato</th>' + rotulos.map(function (r, i) { return '<th>' + r + '<br><span style="font-weight:400">' + pct(rs[i].pst) + ' apur.</span></th>'; }).join('') + '</tr>';
        var body = base.map(function (c) {
          return '<tr><td><b>' + esc(c.nome) + '</b> <small style="color:#6B7280">' + esc(c.partido) + '</small></td>' + outros.map(function (lista) {
            var x = lista.filter(function (y) { return y.n === c.n && y.partido === c.partido; })[0];
            return '<td>' + (x ? pct(x.pvap) : '—') + '</td>';
          }).join('') + '</tr>';
        }).join('');
        return card(titulo, '% dos votos válidos', '<table class="rdap-tbl"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>');
      }
      return tabela('Presidente', [js[0], js[1], js[2]], ['Paulínia', 'SP', 'Brasil']) +
        tabela('Governador', [js[3], js[4]], ['Paulínia', 'SP']) +
        tabela('Senado', [js[5], js[6]], ['Paulínia', 'SP']);
    });
  }

  var render = { geral: abaGeral, deputados: abaDeputados, monitor: abaMonitor, comparativo: abaComparativo };

  function atualizar() {
    clearTimeout(timer);
    if (!aberta) return;
    var aba = abaAtual;
    var p = MODO === 'demo' ? Promise.resolve('00000') : (MUN ? Promise.resolve(MUN) : codMunicipio());
    p.then(function (c) { MUN = c; return render[aba](); })
      .then(function (html) { if (aba === abaAtual && aberta) bd.innerHTML = html; })
      .catch(function (e) {
        if (!bd.innerHTML || /Carregando/.test(bd.innerHTML)) {
          bd.innerHTML = '<p class="rdap-err">Os dados do TSE ainda não estão disponíveis ou não puderam ser carregados. Tentaremos de novo em instantes.</p>';
        }
        if (window.console) console.warn('[apuracao-paulinia]', e);
      })
      .then(function () {
        if (aberta && !document.hidden) timer = setTimeout(atualizar, CONFIG.ATUALIZA_SEGUNDOS * 1000);
      });
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && aberta) atualizar(); });

  /* ===================== ABERTURA AUTOMÁTICA ===================== */
  var dentroJanela = agora >= t(CONFIG.ABRE_SOZINHO_DE) && agora <= t(CONFIG.ABRE_SOZINHO_ATE);
  if (forcar || (dentroJanela && !ss('rdap-visto'))) {
    ss('rdap-visto', '1');
    setTimeout(abrir, forcar ? 0 : 1500);
  }
})();
