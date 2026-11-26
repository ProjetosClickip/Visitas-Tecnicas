/* ================== NAVEGAÇÃO ================== */
import { api, msgErro } from '../shared/api.js';
import { S } from './estado.js';
import { renderSettings } from './perfil/configuracoes.js';
import { setSysbar, showPane } from './sistemas.js';
import { $$, toast } from './util.js';
import { renderForm } from './visitas/formulario.js';
import { renderList, saveNow } from './visitas/lista.js';


/** Busca a versão completa (com fotos e planta) de uma visita da lista resumida. */
async function visitaCompleta(id) {
  const v = (await api.get('/visitas/' + encodeURIComponent(id))).visita;
  const i = S.visits.findIndex(x => x.id === id); if (i >= 0) S.visits[i] = v;
  return v;
}
function go(tab, visit) {
  if (S.cur && S.dirty) saveNow();
  if (visit && visit._lite) {
    visitaCompleta(visit.id).then(v => go(tab, v)).catch(e => toast(msgErro(e), 4000));
    return;
  }
  S.tab = tab; S.cur = visit || null; S.dirty = false;
  setSysbar(tab === 'cfg' ? 'perfil' : 'visitas'); showPane(tab === 'cfg' ? 'main' : 'visitas');
  $$('.tabs-in button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  window.scrollTo(0, 0);
  if (visit) return renderForm(visit);
  if (tab === 'cfg') return renderSettings();
  renderList(tab === 'hist' ? '' : tab);
}

export { go, visitaCompleta };
