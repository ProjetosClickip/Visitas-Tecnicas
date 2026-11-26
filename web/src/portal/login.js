/* ================== LOGIN (colaborador e supervisão) ==================
 * E-mail e senha são conferidos pelo servidor. Não há cadastro aberto: as contas são criadas
 * pela supervisão (Ambiente da supervisão → Equipe), que também redefine senhas esquecidas.
 */
import { api, msgErro } from '../shared/api.js';
import { ENV } from './ambientes.js';
import { S } from './estado.js';
import { logout, startSession } from './sessao.js';
import { $, esc, toast } from './util.js';


const INTRO = {
  sup: `<span class="kicker">AMBIENTE DA SUPERVISÃO</span><h2>Central de gestão e aprovação</h2><p>Acesso exclusivo para a supervisão do Grupo Click IP.</p><ul class="feat"><li>✔ Aprovação dos relatórios e dos orçamentos de custos</li><li>📊 Visão detalhada de todas as visitas e números</li><li>👥 Acompanhamento e gestão da equipe</li><li>🔓 Acesso completo aos dados dos clientes</li></ul>`,
  col: `<span class="kicker">AMBIENTE DO COLABORADOR</span><h2>Plataforma de Projetos Click IP</h2><p>Um único acesso para todos os sistemas do time de projetos.</p><ul class="feat"><li>📋 Visitas Técnicas – levantamento, croqui e projeto executivo</li><li>💰 Mensuração de Custos – orçamentos de materiais e serviços</li><li>🛰️ ClickIP FiberControl – em integração</li><li>📊 Início com seus resumos e demandas</li></ul>`
};
let loginEmail = '';

function renderLogin(el, ctx) {
  el = el || $('#colLogin'); ctx = ctx || 'col';
  ['#colLogin', '#supMain'].forEach(id => { const x = $(id); if (x && x !== el) x.innerHTML = ''; });
  el.innerHTML = `<div class="split-card"><div class="split-l">${INTRO[ctx]}</div><div class="split-r">
    <form id="lgForm" autocomplete="on">
      <h3 style="margin-bottom:10px">Entrar</h3>
      <label class="f">E-mail corporativo<input type="email" id="lgEmail" autocomplete="username" value="${esc(loginEmail)}" placeholder="nome@clickip.com.br" required></label>
      <label class="f" style="margin-top:8px">Senha<input type="password" id="lgPin" autocomplete="current-password" required></label>
      <button class="btn primary block" id="lgGo" type="submit" style="margin-top:14px">Entrar</button>
    </form>
    <a href="#" id="lgForgot" class="small" style="display:block;text-align:center;margin-top:10px">Esqueci minha senha</a>
    <div id="lgAjuda" class="note hidden" style="margin-top:10px">Peça a um supervisor para redefinir a sua senha em <b>Ambiente da supervisão → Equipe → Redefinir senha</b>. Você receberá uma senha provisória e definirá uma nova no primeiro acesso.</div>
    <p class="small muted" style="margin:14px 0 0;text-align:center">Não tem conta? Solicite à supervisão do time de projetos.</p>
  </div></div>`;
  const form = $('#lgForm', el);
  form.onsubmit = async ev => {
    ev.preventDefault();
    const email = $('#lgEmail', el).value.trim(), senha = $('#lgPin', el).value;
    if (!email || !senha) return toast('Informe e-mail e senha');
    loginEmail = email;
    const bt = $('#lgGo', el); bt.disabled = true; bt.textContent = 'Entrando…';
    try {
      const r = await api.post('/auth/entrar', { email, senha });
      await startSession(r.usuario);
    } catch (e) {
      toast(msgErro(e), 4000); bt.disabled = false; bt.textContent = 'Entrar';
      const p = $('#lgPin', el); if (p) { p.value = ''; p.focus(); }
    }
  };
  $('#lgForgot', el).onclick = e => { e.preventDefault(); $('#lgAjuda', el).classList.toggle('hidden'); };
  setTimeout(() => { const i = $(loginEmail ? '#lgPin' : '#lgEmail', el); if (i) i.focus(); }, 50);
}

/** Primeiro acesso (senha provisória) ou senha redefinida pela supervisão: obriga a definir uma nova senha. */
function renderTrocarSenha(el) {
  el = el || (ENV === 'sup' ? $('#supMain') : $('#colLogin'));
  if (ENV === 'col') { $('#app').classList.add('hidden'); el.classList.remove('hidden'); }
  el.innerHTML = `<div class="split-card"><div class="split-l"><span class="kicker">PRIMEIRO ACESSO</span><h2>Defina a sua senha</h2><p>Olá, ${esc(S.user ? S.user.name : '')}! Você entrou com uma senha provisória. Crie agora uma senha pessoal para continuar.</p><ul class="feat"><li>🔒 Mínimo de 8 caracteres, com letras e números</li><li>🙈 Não use o seu nome ou e-mail</li><li>👤 A senha é pessoal: não compartilhe</li></ul></div><div class="split-r">
    <form id="tsForm">
      <label class="f">Senha provisória (atual)<input type="password" id="tsAtual" autocomplete="current-password" required></label>
      <label class="f" style="margin-top:8px">Nova senha<input type="password" id="tsNova" autocomplete="new-password" required></label>
      <label class="f" style="margin-top:8px">Confirme a nova senha<input type="password" id="tsNova2" autocomplete="new-password" required></label>
      <button class="btn primary block" type="submit" style="margin-top:14px">Salvar e continuar</button>
    </form>
    <button class="btn block" id="tsSair" style="margin-top:8px">Sair</button>
  </div></div>`;
  $('#tsSair', el).onclick = () => logout();
  $('#tsForm', el).onsubmit = async ev => {
    ev.preventDefault();
    const atual = $('#tsAtual', el).value, nova = $('#tsNova', el).value;
    if (nova !== $('#tsNova2', el).value) return toast('As senhas não conferem');
    try {
      const r = await api.post('/auth/senha', { atual, nova });
      toast('Senha definida');
      await startSession(r.usuario);
    } catch (e) { toast(msgErro(e), 4000); }
  };
  setTimeout(() => { const i = $('#tsAtual', el); if (i) i.focus(); }, 50);
}

export { renderLogin, renderTrocarSenha };
