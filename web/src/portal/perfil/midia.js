/* foto de perfil e banner (salvos no servidor) */
import { api, msgErro } from '../../shared/api.js';
import { avatarHTML, isSup, refreshWho } from '../ambientes.js';
import { S } from '../estado.js';
import { renderSettings } from './configuracoes.js';
import { salvarPerfil } from '../sessao.js';
import { $, esc, readImage, toast, urlImg } from '../util.js';

function perfilMidiaHTML() {
  const u = S.user;
  return `<div class="pf-banner" style="${urlImg(u.banner) ? `background-image:url(${urlImg(u.banner)})` : ''}">
      <label class="btn sm pf-bbtn">🖼️ ${u.banner ? 'Trocar banner' : 'Adicionar banner'}<input type="file" id="pfBanIn" accept="image/*" hidden></label>
      ${u.banner ? '<button class="btn sm pf-bdel" id="pfBanDel">Remover</button>' : ''}
      <div class="pf-av"><label title="Trocar foto de perfil">${avatarHTML(u, 96)}<input type="file" id="pfAvIn" accept="image/*" hidden></label>${u.avatar ? '<button class="btn sm" id="pfAvDel" style="margin-top:4px">Remover foto</button>' : ''}</div>
    </div>
    <div class="pf-name"><h3>${esc(u.name)}</h3><span class="muted">${esc(u.role || '')}${u.email ? ' · ' + esc(u.email) : ''}</span>${isSup(u) ? ' <span class="pill done">🛡️ Supervisão</span>' : ''}</div>`;
}
function cropImage(file, w, h, q = 0.85) {
  return new Promise(async res => {
    const r = await readImage(file, 2400, 0.92); const im = new Image();
    im.onload = () => { const k = Math.max(w / im.width, h / im.height), sw = w / k, sh = h / k; const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, 0, 0, w, h); res(c.toDataURL('image/jpeg', q)); };
    im.src = r.data;
  });
}
function bindPerfilMidia(after) {
  const sv = async (campos, msg) => {
    try { await salvarPerfil(campos); refreshWho(); if (msg) toast(msg); after && after(); }
    catch (e) { toast(msgErro(e), 4000); }
  };
  $('#pfAvIn').onchange = async e => { const f = e.target.files[0]; if (!f) return; sv({ avatar: await cropImage(f, 256, 256) }, 'Foto de perfil atualizada'); };
  $('#pfBanIn').onchange = async e => { const f = e.target.files[0]; if (!f) return; sv({ banner: await cropImage(f, 1500, 380, 0.8) }, 'Banner atualizado'); };
  if ($('#pfAvDel')) $('#pfAvDel').onclick = () => sv({ avatar: '' });
  if ($('#pfBanDel')) $('#pfBanDel').onclick = () => sv({ banner: '' });
}
/* segurança da conta: troca de senha (a recuperação é feita pela supervisão) */
function segurancaHTML() {
  return `<div class="span3"><div style="font-size:13px;font-weight:600;color:var(--navy-2);margin-bottom:6px">Senha</div>
    <div class="grid g3"><label class="f">Senha atual<input type="password" id="pfSenhaAtual" autocomplete="current-password"></label>
    <label class="f">Nova senha<input type="password" id="pfSenhaNova" autocomplete="new-password" placeholder="mín. 8, com maiúscula, minúscula, número e símbolo"></label>
    <label class="f">Confirme a nova senha<input type="password" id="pfSenhaNova2" autocomplete="new-password"></label></div>
    <button class="btn sm" id="pfSenhaSalvar" style="margin-top:8px">Trocar senha</button>
    <p class="small muted" style="margin:6px 0 0">Esqueceu a senha? Um supervisor pode gerar uma senha provisória em Ambiente da supervisão → Equipe.</p></div>`;
}
function bindSeguranca() {
  $('#pfSenhaSalvar').onclick = async () => {
    const atual = $('#pfSenhaAtual').value, nova = $('#pfSenhaNova').value;
    if (nova !== $('#pfSenhaNova2').value) return toast('As senhas não conferem');
    try { await api.post('/auth/senha', { atual, nova }); toast('Senha alterada. As outras sessões abertas foram encerradas.', 4000); renderSettings(); }
    catch (e) { toast(msgErro(e), 4000); }
  };
}

export { bindPerfilMidia, bindSeguranca, perfilMidiaHTML, segurancaHTML };
