/* Tipos de projeto */
import { icon, view } from './interface.js';
import { libGet } from './libs.js';
import { drawCharts } from './telas/dashboard.js';

const TIPOS = [['rede','Projeto de rede'],['backbone','Projeto de backbone'],['cliente','Projeto de cliente'],['evento','Evento'],['condominio','Condomínio']];
const tipoLabel = k => (TIPOS.find(t=>t[0]===k)||[,''])[1];

/* Tema (modo noturno) */
const THEME_KEY = 'mensuracaoCustos.theme';
function themePref(){ try{ return localStorage.getItem(THEME_KEY) || 'auto'; }catch(e){ return 'auto'; } }
function resolvedTheme(){ const p = themePref(); return p==='auto' ? (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : p; }
function applyTheme(){
  document.documentElement.dataset.theme = resolvedTheme();
  const b = document.getElementById('themeBtn');
  if (b) { b.innerHTML = icon(resolvedTheme()==='dark'?'sun':'moon'); b.title = resolvedTheme()==='dark' ? 'Usar modo claro' : 'Usar modo noturno'; }
  const ab = document.getElementById('authTheme'); if (ab) ab.innerHTML = icon(resolvedTheme()==='dark'?'sun':'moon') + (resolvedTheme()==='dark'?' Modo claro':' Modo noturno');
  if (typeof view!=='undefined' && view==='dashboard' && libGet('chart') && document.getElementById('ch1')) drawCharts();
}
function setTheme(t){ try{ localStorage.setItem(THEME_KEY, t); }catch(e){} applyTheme(); }
if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ()=>{ if (themePref()==='auto') applyTheme(); });

export { THEME_KEY, TIPOS, applyTheme, resolvedTheme, setTheme, themePref, tipoLabel };
