/* ================== TEMA / APARÊNCIA ================== */
import { S } from './estado.js';
import { salvarPerfil } from './sessao.js';
import { $, $$, readImage, toast } from './util.js';

const CORES = { laranja: ['Laranja Click IP', '#f26a21', '#ff8a4a'], teal: ['Verde-água', '#159c98', '#1fb8b3'], azul: ['Azul', '#2f6fde', '#5a8ef0'], roxo: ['Roxo', '#7a3db8', '#9a62d4'], vermelho: ['Vermelho', '#d23c3c', '#e86464'], verde: ['Verde', '#1f9d55', '#36c072'] };
const FUNDOS = {
  nenhum: ['Sem fundo', ''],
  clickip: ['Click IP', 'linear-gradient(135deg,#13294b 0%,#1d3a66 45%,#159c98 120%)'],
  aurora: ['Aurora', 'linear-gradient(135deg,#0f2027 0%,#203a43 50%,#2c5364 100%)'],
  porsol: ['Pôr do sol', 'linear-gradient(135deg,#f26a21 0%,#c2185b 55%,#13294b 100%)'],
  floresta: ['Floresta', 'linear-gradient(135deg,#0b3d2e 0%,#1f9d55 60%,#a8e063 140%)'],
  grafite: ['Grafite', 'linear-gradient(135deg,#232526 0%,#414345 100%)'],
  pontos: ['Pontilhado', 'radial-gradient(circle,rgba(19,41,75,.18) 1px,transparent 1.5px) 0 0/18px 18px']
};
function prefsAtuais() { if (S.user && S.user.prefs) return S.user.prefs; try { return JSON.parse(localStorage.getItem('cip_prefs') || '{}'); } catch (e) { return {}; } }
function applyTheme(p) {
  p = p || prefsAtuais(); const root = document.documentElement;
  const dark = p.tema === 'escuro' || (p.tema === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  const c = CORES[p.cor] || CORES.laranja; root.style.setProperty('--orange', c[1]); root.style.setProperty('--orange-2', c[2]);
  const bg = p.fundo === 'imagem' && p.fundoImg ? `url(${p.fundoImg}) center/cover fixed` : (FUNDOS[p.fundo] || FUNDOS.nenhum)[1];
  document.body.style.background = bg || ''; document.body.classList.toggle('has-wall', !!bg);
  try { localStorage.setItem('cip_prefs', JSON.stringify(Object.assign({}, p, { fundoImg: p.fundo === 'imagem' ? p.fundoImg : undefined }))); } catch (e) { }
}
async function savePrefs(p) {
  applyTheme(p);
  if (S.user) { S.user.prefs = p; try { await salvarPerfil({ prefs: p }); } catch (e) { toast('Preferências não salvas: ' + e.message, 4000); } }
}
function aparenciaCard() {
  const p = prefsAtuais();
  return `<div class="card"><div class="card-h"><h3>Aparência</h3></div><div class="card-b">
    <div style="font-size:13px;font-weight:600;margin-bottom:6px">Tema</div>
    <div class="seg">${[['claro', '☀️ Claro'], ['escuro', '🌙 Escuro'], ['auto', '🖥️ Automático']].map(([k, l]) => `<button type="button" data-tema="${k}" class="${(p.tema || 'claro') === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div style="font-size:13px;font-weight:600;margin:14px 0 6px">Cor de destaque</div>
    <div class="row">${Object.entries(CORES).map(([k, c]) => `<button type="button" class="swatch ${(p.cor || 'laranja') === k ? 'on' : ''}" data-cor="${k}" title="${c[0]}" style="background:${c[1]}"></button>`).join('')}</div>
    <div style="font-size:13px;font-weight:600;margin:14px 0 6px">Papel de parede / fundo</div>
    <div class="walls">${Object.entries(FUNDOS).map(([k, f]) => `<button type="button" class="wall ${(p.fundo || 'nenhum') === k ? 'on' : ''}" data-fundo="${k}" style="background:${f[1] || 'var(--bg)'}"><span>${f[0]}</span></button>`).join('')}
      <label class="wall ${p.fundo === 'imagem' ? 'on' : ''}" style="${p.fundoImg ? `background:url(${p.fundoImg}) center/cover` : ''}"><span>📷 Minha imagem</span><input type="file" id="wallIn" accept="image/*" hidden></label></div>
  </div></div>`;
}
function bindAparencia(after) {
  const p = Object.assign({}, prefsAtuais());
  $$('[data-tema]').forEach(b => b.onclick = () => { p.tema = b.dataset.tema; savePrefs(p).then(after); });
  $$('[data-cor]').forEach(b => b.onclick = () => { p.cor = b.dataset.cor; savePrefs(p).then(after); });
  $$('[data-fundo]').forEach(b => b.onclick = () => { p.fundo = b.dataset.fundo; savePrefs(p).then(after); });
  const wi = $('#wallIn'); if (wi) wi.onchange = async () => { const f = wi.files[0]; if (!f) return; const r = await readImage(f, 1920, 0.8); p.fundo = 'imagem'; p.fundoImg = r.data; savePrefs(p).then(after); };
}

export { aparenciaCard, applyTheme, bindAparencia };
