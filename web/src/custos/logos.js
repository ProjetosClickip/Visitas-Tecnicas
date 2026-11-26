/* Logos e papel timbrado (arquivos em ./img, embutidos pelo Vite para uso no jsPDF) */
import imais from './img/logo-imais.png?inline';
import click from './img/logo-click.png?inline';
import imaisW from './img/logo-imaisW.png?inline';
import clickW from './img/logo-clickW.png?inline';
import timbreTopo from './img/logo-timbreTopo.png?inline';
import timbreRodape from './img/logo-timbreRodape.png?inline';
import full from './img/logo-full.png?inline';

const LOGOS = { imais, click, imaisW, clickW, timbreTopo, timbreRodape, full };
const LOGO_RATIO = {imais:344/84, click:376/141, full:720/141};
/* Papel timbrado oficial: faixa superior 0–8,6 mm e rodapé 271,5–297 mm em A4 */
const TIMBRE = {topoH:58/2000*297, rodapeY:1828/2000*297, rodapeH:172/2000*297};
function setLogos(root){ (root||document).querySelectorAll('img[data-logo]').forEach(i=>{ i.src = LOGOS[i.dataset.logo]; }); }
const logoPair = (cls)=>`<img class="i logo-light" src="${LOGOS.imais}" alt="i_mais"><img class="i logo-dark" src="${LOGOS.imaisW}" alt="i_mais"><img class="c logo-light" src="${LOGOS.click}" alt="ClickIP"><img class="c logo-dark" src="${LOGOS.clickW}" alt="ClickIP">`;

export { LOGOS, TIMBRE, setLogos };
