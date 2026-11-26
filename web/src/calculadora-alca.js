/* =====================================================================
   12b. CALCULADORA DE ALÇA E LAÇO (ferragens por postes)
   Regra das planilhas de levantamento: ancoragens = postes - 1; dupla ≈ postes/3 - 1; simples = 2 (pontas);
   suspensão = restante. BAP = simples+suspensão+dupla; SUPA = simples+suspensão+2×dupla; ALÇA = simples+2×dupla; LAÇO = suspensão.
   Margens padrão: BAP +10%, SUPA +10%, ALÇA +80%, LAÇO +20% (arredondado para cima).
   ===================================================================== */
import { cur, db, touch } from './armazenamento.js';
import { catalogDatalist, catalogFind } from './catalogo.js';
import { closeModal, go, icon, openModal, toast } from './interface.js';
import { datalists } from './telas/materiais.js';
import { $, esc, fmtBRL, fmtNum, parseBR, round2, uid } from './util.js';

const CALC_CABOS = {
  fino: {label:'Cabo 06FO / 12FO (6,8 a 7,5 mm)', alca:'9', laco:'75'},
  medio:{label:'Cabo 24FO a 48FO (8,4 a 9,0 mm)', alca:'475', laco:'869'}
};
function calcFerragens(postes, simples, dupla, susp, mg){
  const BAP = simples+susp+dupla, SUPA = simples+susp+2*dupla, ALCA = simples+2*dupla, LACO = susp;
  const up = (v,p)=> Math.ceil(v*(1+p/100) - 1e-9);
  return {BAP, SUPA, ALCA, LACO, qBAP:up(BAP,mg.bap), qSUPA:up(SUPA,mg.supa), qALCA:up(ALCA,mg.alca), qLACO:up(LACO,mg.laco)};
}
function calcForm(){
  const p = cur(); if (!p) return;
  const st = {postes:150, simples:2, dupla:49, susp:98, auto:true, cabo:'medio', mg:{bap:10,supa:10,alca:80,laco:20}, cod:{bap:'2',supa:'98',alca:'475',laco:'869'}, empresa: db.settings.empresaPadrao||'CLICK IP'};
  const ov = openModal(`<div class="mh"><h3>Calculadora de alça e laço (ferragens por postes)</h3><button class="btn icon" data-x>${icon('x')}</button></div>
  <div class="mb">${catalogDatalist()}${datalists()}
    <p class="muted" style="margin-top:0;font-size:12.5px">Mesma regra das planilhas de levantamento de custo (vãos de 35 a 40 m). As quantidades de ancoragem são sugeridas a partir do nº de postes e podem ser ajustadas.</p>
    <div class="form-grid">
      <div class="fld"><label>Nº de postes</label><input class="inp num" id="cPostes" value="${st.postes}"></div>
      <div class="fld"><label>Cabo</label><select class="inp" id="cCabo">${Object.entries(CALC_CABOS).map(([k,v])=>`<option value="${k}" ${st.cabo===k?'selected':''}>${v.label}</option>`).join('')}</select></div>
      <div class="fld"><label>Ancoragem simples</label><input class="inp num" id="cSim" value="${st.simples}"></div>
      <div class="fld"><label>Suspensão</label><input class="inp num" id="cSus" value="${st.susp}"></div>
      <div class="fld"><label>Ancoragem dupla</label><input class="inp num" id="cDup" value="${st.dupla}"></div>
      <div class="fld full"><label><input type="checkbox" id="cAuto" checked> Calcular ancoragens automaticamente pelo nº de postes</label></div>
    </div>
    <div class="tbl-wrap mt8"><table class="tbl compact"><thead><tr><th>Item</th><th title="Código do item no catálogo de materiais">Ref. catálogo</th><th>Descrição (catálogo)</th><th class="num">Calculado</th><th class="num">Margem %</th><th class="num">Quantidade</th><th class="num">Valor unit.</th><th class="num">Total</th></tr></thead><tbody id="cRows"></tbody></table></div>
    <div class="foot-sum" id="cSum"></div>
  </div>
  <div class="mf"><button class="btn" data-x>Cancelar</button><button class="btn primary" data-ok>Adicionar aos materiais de obra</button></div>`, {size:'lg'});
  const num = id => Math.max(0, Math.round(parseBR($(id,ov).value)||0));
  let res = null;
  const draw = ()=>{
    st.postes = num('#cPostes'); st.auto = $('#cAuto',ov).checked;
    if (st.auto){ st.simples = st.postes>1 ? 2 : 0; st.dupla = Math.max(0, Math.round(st.postes/3) - 1); st.susp = Math.max(0, st.postes - 1 - st.simples - st.dupla);
      $('#cSim',ov).value = st.simples; $('#cDup',ov).value = st.dupla; $('#cSus',ov).value = st.susp; }
    else { st.simples = num('#cSim'); st.dupla = num('#cDup'); st.susp = num('#cSus'); }
    res = calcFerragens(st.postes, st.simples, st.dupla, st.susp, st.mg);
    const rows = [['bap','BAP (abraçadeira)',res.BAP,res.qBAP],['supa','SUPA (suporte dielétrico)',res.SUPA,res.qSUPA],['alca','Alça preformada',res.ALCA,res.qALCA],['laco','Laço preformado',res.LACO,res.qLACO]];
    let tot = 0;
    $('#cRows',ov).innerHTML = rows.map(([k,l,calc,q])=>{ const it = catalogFind(st.cod[k]); const v = it ? it.valor : 0; tot += round2(q*v);
      return `<tr data-k="${k}"><td><b>${l}</b></td><td><input class="inp" data-f="cod" list="dlCatCod" value="${esc(st.cod[k])}" style="width:80px"></td><td>${it?esc(it.descricao):'<span class="badge b-warn">Código não encontrado no catálogo</span>'}</td>
        <td class="num">${fmtNum(calc)}</td><td><input class="inp num" data-f="mg" value="${st.mg[k]}" style="width:60px"></td><td class="num"><b>${fmtNum(q)}</b></td><td class="num">${fmtBRL(v)}</td><td class="num">${fmtBRL(round2(q*v))}</td></tr>`; }).join('');
    $('#cSum',ov).innerHTML = `<span>Ancoragens: ${st.simples} simples · ${st.susp} suspensão · ${st.dupla} dupla (total ${st.simples+st.susp+st.dupla})</span><span>Total estimado: <b>${fmtBRL(round2(tot))}</b></span>`;
  };
  draw();
  ['#cPostes','#cSim','#cSus','#cDup'].forEach(id=>$(id,ov).addEventListener('input', ()=>{ if (id!=='#cPostes') $('#cAuto',ov).checked = false; draw(); }));
  $('#cAuto',ov).addEventListener('change', draw);
  $('#cCabo',ov).addEventListener('change', e=>{ st.cabo = e.target.value; st.cod.alca = CALC_CABOS[st.cabo].alca; st.cod.laco = CALC_CABOS[st.cabo].laco; draw(); });
  $('#cRows',ov).addEventListener('change', e=>{ const tr = e.target.closest('tr[data-k]'); if (!tr) return; const k = tr.dataset.k;
    if (e.target.dataset.f==='cod') st.cod[k] = e.target.value.trim(); else { const v = parseBR(e.target.value); st.mg[k] = v==null||v<0 ? 0 : v; } draw(); });
  ov.addEventListener('click', e=>{
    if (e.target.closest('[data-x]')) return closeModal(ov);
    if (!e.target.closest('[data-ok]')) return;
    let n = 0;
    [['bap',res.qBAP],['supa',res.qSUPA],['alca',res.qALCA],['laco',res.qLACO]].forEach(([k,q])=>{ if (!(q>0)) return; const it = catalogFind(st.cod[k]);
      const d = {id:uid(), origem:'Calculadora alça e laço', empresa:'', codigo:'', nome: it?it.descricao:({bap:'ABRACADEIRA BAP',supa:'SUPORTE DIELETRICO SUPA',alca:'ALCA PREFORMADA P/ CABO OPTICO',laco:'LACO PREFORMADO P/ CABO OPTICO'}[k]), categoria:'obra', unidade: it?it.unidade:'Unidade', quantidade:q, valorUnitario: it?it.valor:0};
      d.valorTotal = round2(d.quantidade*d.valorUnitario); p.materiais.push(d); n++; });
    touch(`Calculadora de alça e laço: ${n} item(ns) adicionados (${st.postes} postes)`); closeModal(ov); go('obra'); toast(`${n} item(ns) de ferragens adicionados aos materiais de obra.`,'ok');
  });
}

export { calcForm };
