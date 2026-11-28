import { api, msgErro } from '../../shared/api.js';
import { S } from '../estado.js';
import { salvarPerfil } from '../sessao.js';
import { $, $$, confirmBox, dtHrBR, esc, modal, readImage, toast } from '../util.js';
import { aplicarDoServidor, saveNow, visitTitle } from './lista.js';

/* ================== ASSINATURA ELETRÔNICA (vinculada à conta do usuário) ================== */
/* O servidor confere a senha, calcula o hash do conteúdo salvo e grava quem assinou e quando.
   Se a visita for alterada depois, o servidor marca a assinatura como inválida. */
function assinaturaValida(v) { return !!(v && v.assinatura && v.assinatura.img && v.assinatura.valida && !(S.cur === v && S.dirty)); }
function cpfMask(c) { const d = String(c || '').replace(/\D/g, ''); return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : ''; }
function renderAssinatura() {
  const el = $('#assBox'); if (!el) return; const v = S.cur, u = S.user, sg = u.assinatura, a = v.assinatura;
  const valida = assinaturaValida(v);
  el.innerHTML = `<div class="grid g2">
    <div><div style="font-size:13px;font-weight:600;color:var(--navy-2);margin-bottom:6px">Assinatura registrada na conta de ${esc(u.name)}</div>
      <div style="border:1px dashed var(--line);border-radius:10px;height:110px;display:flex;align-items:center;justify-content:center;background:#fff">${sg && sg.img ? `<img src="${esc(sg.img)}" style="max-height:95px;max-width:90%">` : '<span class="muted small">Nenhuma assinatura registrada</span>'}</div>
      <div class="row" style="margin-top:8px"><button class="btn sm" id="sgEdit">${sg && sg.img ? 'Alterar assinatura' : 'Cadastrar assinatura'}</button>${sg && sg.cpf ? `<span class="small muted">CPF ${esc(cpfMask(sg.cpf))}</span>` : ''}</div></div>
    <div><div style="font-size:13px;font-weight:600;color:var(--navy-2);margin-bottom:6px">Assinatura deste relatório</div>
      ${a ? (valida
        ? `<div class="note" style="margin-top:0">✓ Assinado eletronicamente por <b>${esc(a.nome)}</b> em ${dtHrBR(a.em)}.<br>Código de verificação: <b>${esc(a.codigo)}</b></div>`
        : `<div class="note warn" style="margin-top:0"><svg class="ic" aria-hidden="true"><use href="#i-alert"/></svg> A visita foi alterada depois da assinatura de ${esc(a.nome)} (${dtHrBR(a.em)}). A assinatura não será impressa no PDF – assine novamente.</div>`)
        : `<div class="note" style="margin-top:0">Relatório ainda não assinado. Ao assinar, a imagem da sua assinatura, a data/hora e um código de verificação serão impressos na última folha do PDF.</div>`}
      <div class="row" style="margin-top:8px"><button class="btn primary sm" id="sgSign" ${sg && sg.img ? '' : 'disabled'}>${a ? 'Assinar novamente' : 'Assinar relatório'}</button>${a ? '<button class="btn sm danger" id="sgDel">Remover assinatura</button>' : ''}</div>
      <p class="small muted" style="margin:8px 0 0">Assinatura eletrônica interna, confirmada com a senha da conta e registrada pelo servidor. Para assinatura com validade jurídica, assine o PDF exportado no assinador do gov.br.</p></div>
  </div>`;
  $('#sgEdit').onclick = e => { e.stopPropagation(); editarAssinatura(() => renderAssinatura()); };
  $('#sgSign').onclick = e => { e.stopPropagation(); assinarVisita(); };
  if ($('#sgDel')) $('#sgDel').onclick = async e => {
    e.stopPropagation();
    if (!(await confirmBox('Remover a assinatura deste relatório?'))) return;
    try { const r = await api.del(`/visitas/${encodeURIComponent(v.id)}/assinatura`); aplicarDoServidor(v, r.visita); renderAssinatura(); }
    catch (er) { toast(msgErro(er), 4000); }
  };
}
function assinarVisita() {
  const v = S.cur, u = S.user;
  modal(`<h3>Assinar relatório</h3><p>Você está assinando eletronicamente o relatório <b>${esc(visitTitle(v))}</b> como <b>${esc(u.name)}</b>.</p>
    <label class="f">Confirme com a sua senha<input type="password" id="sgPin" autocomplete="current-password"></label>
    <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="sgOk">Assinar</button></div>`, (m, close) => {
    const ok = async () => {
      await saveNow();
      if (S.dirty) return toast('Não foi possível salvar a visita antes de assinar');
      try {
        const r = await api.post(`/visitas/${encodeURIComponent(v.id)}/assinar`, { senha: $('#sgPin', m).value, versao: v.versao });
        aplicarDoServidor(v, r.visita); close(); renderAssinatura(); toast('Relatório assinado');
      } catch (er) { toast(msgErro(er), 4000); }
    };
    $('#sgOk', m).onclick = ok; $('#sgPin', m).onkeydown = e => { if (e.key === 'Enter') ok(); }; setTimeout(() => $('#sgPin', m).focus(), 50);
  });
}
/* editor de assinatura: desenhar ou enviar imagem; salva na conta do usuário */
function editarAssinatura(done) {
  const u = S.user; let mode = 'draw', upImg = null;
  modal(`<h3>Assinatura da conta – ${esc(u.name)}</h3>
    <div class="login-tabs"><button data-sm="draw" class="on">Desenhar</button><button data-sm="up">Enviar imagem</button></div>
    <div id="sgDraw"><canvas id="sgCv" width="900" height="300" style="width:100%;border:1px solid var(--line);border-radius:10px;background:#fff;touch-action:none;cursor:crosshair"></canvas>
      <div class="row" style="justify-content:space-between"><span class="small muted">Assine com o mouse, caneta ou dedo.</span><button class="btn sm" id="sgClr">Limpar</button></div></div>
    <div id="sgUp" class="hidden"><label class="drop"><svg class="ic" aria-hidden="true"><use href="#i-paperclip"/></svg> Selecione uma foto/scan da assinatura (PNG/JPEG) – o fundo branco é removido automaticamente<input type="file" id="sgFile" accept="image/png,image/jpeg" hidden></label>
      <div id="sgPrev" style="height:110px;display:flex;align-items:center;justify-content:center;margin-top:8px"></div></div>
    <label class="f" style="margin-top:10px">CPF (opcional – exibido mascarado no selo, como no gov.br)<input type="text" id="sgCpf" inputmode="numeric" value="${esc((u.assinatura && u.assinatura.cpf) || '')}" placeholder="000.000.000-00"></label>
    <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="sgSave">Salvar na minha conta</button></div>`, (m, close) => {
    m.style.maxWidth = '640px';
    const cv = $('#sgCv', m), x = cv.getContext('2d'); let drawing = false, drawn = false, last = null;
    x.lineWidth = 3.2; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#13294b';
    const pt = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; };
    cv.onpointerdown = e => { drawing = true; last = pt(e); cv.setPointerCapture(e.pointerId); };
    cv.onpointermove = e => { if (!drawing) return; const p = pt(e); x.beginPath(); x.moveTo(last.x, last.y); x.lineTo(p.x, p.y); x.stroke(); last = p; drawn = true; };
    cv.onpointerup = () => { drawing = false; };
    $('#sgClr', m).onclick = () => { x.clearRect(0, 0, cv.width, cv.height); drawn = false; };
    $$('[data-sm]', m).forEach(b => b.onclick = () => { mode = b.dataset.sm; $$('[data-sm]', m).forEach(z => z.classList.toggle('on', z === b)); $('#sgDraw', m).classList.toggle('hidden', mode !== 'draw'); $('#sgUp', m).classList.toggle('hidden', mode !== 'up'); });
    $('#sgFile', m).onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const r = await readImage(f, 1400, 0.95); upImg = await limparAssinatura(r.data); $('#sgPrev', m).innerHTML = `<img src="${esc(upImg)}" style="max-height:105px;max-width:100%">`; } catch (er) { toast('Não foi possível ler a imagem'); } };
    $('#sgSave', m).onclick = async () => {
      let img = null;
      if (mode === 'draw') { if (!drawn) return toast('Desenhe a assinatura'); img = await limparAssinatura(cv.toDataURL('image/png')); }
      else { if (!upImg) return toast('Selecione a imagem da assinatura'); img = upImg; }
      const cpf = $('#sgCpf', m).value.replace(/\D/g, '');
      if (cpf && cpf.length !== 11) return toast('CPF deve ter 11 dígitos');
      try { await salvarPerfil({ assinatura: { img, cpf } }); close(); toast('Assinatura salva na sua conta'); done && done(); }
      catch (er) { toast(msgErro(er), 4000); }
    };
  });
}
/* remove fundo claro, recorta e reduz a imagem da assinatura (PNG transparente) */
function limparAssinatura(src) {
  return new Promise(res => {
    const im = new Image(); im.onload = () => {
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height), p = d.data; let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
      for (let i = 0; i < p.length; i += 4) {
        const lum = (p[i] + p[i + 1] + p[i + 2]) / 3;
        if (p[i + 3] < 20 || lum > 200) { p[i + 3] = 0; continue; }
        if (lum > 150) p[i + 3] = Math.round(p[i + 3] * (200 - lum) / 50);
        const k = i / 4, px = k % c.width, py = (k / c.width) | 0; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
      }
      x.putImageData(d, 0, 0);
      if (x1 <= x0) return res(c.toDataURL('image/png'));
      const pad = 8, w = x1 - x0 + 2 * pad, h = y1 - y0 + 2 * pad, k = Math.min(1, 600 / w, 200 / h);
      const o = document.createElement('canvas'); o.width = Math.round(w * k); o.height = Math.round(h * k);
      o.getContext('2d').drawImage(c, x0 - pad, y0 - pad, w, h, 0, 0, o.width, o.height);
      res(o.toDataURL('image/png'));
    }; im.src = src;
  });
}

export { assinaturaValida, cpfMask, editarAssinatura, renderAssinatura };
