/* ================== MENU LATERAL (gaveta no celular) ================== */
import { $ } from './util.js';

function iniciarMenuLateral() {
  const body = document.body, bt = $('#menuBt'), rail = $('#menuLateral');
  if (!bt || !rail) return;
  const abrir = on => {
    body.classList.toggle('menu-aberto', on);
    bt.setAttribute('aria-expanded', on ? 'true' : 'false');
    bt.setAttribute('aria-label', on ? 'Fechar menu' : 'Abrir menu');
    if (on) { const a = rail.querySelector('button.on, button'); if (a) a.focus(); } else if (rail.contains(document.activeElement)) bt.focus();
  };
  bt.addEventListener('click', () => abrir(!body.classList.contains('menu-aberto')));
  $('#menuFechar').addEventListener('click', () => abrir(false));
  $('#menuScrim').addEventListener('click', () => abrir(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && body.classList.contains('menu-aberto')) abrir(false); });
  // escolher um item fecha a gaveta (os próprios botões continuam com os seus handlers)
  rail.addEventListener('click', e => { if (e.target.closest('[data-env],[data-sys],[data-tab],#hdrEntrar')) abrir(false); });
}

export { iniciarMenuLateral };
