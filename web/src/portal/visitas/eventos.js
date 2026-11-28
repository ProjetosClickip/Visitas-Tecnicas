/* ---------- eventos: período (início/término) ---------- */
import { dtBR } from '../util.js';
import { iOr } from './dimensionamento.js';

function evtDataAdd(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function evtTerminoHint(e) {
  const dias = iOr(e.dias, 1); if (!e.inicio) return '';
  const prev = evtDataAdd(e.inicio, dias - 1);
  if (!e.termino) return `previsto: ${dtBR(prev)} (${dias} dias)`;
  if (e.termino < e.inicio) return 'Atenção: término anterior ao início';
  const n = Math.round((new Date(e.termino + 'T12:00:00') - new Date(e.inicio + 'T12:00:00')) / 864e5) + 1;
  return n === dias ? `${n} dias de evento` : `Atenção: período de ${n} dias – diferente da quantidade informada (${dias})`;
}
function evtPeriodo(e) {
  const dias = iOr(e.dias, 1);
  if (dias <= 1) return e.inicio ? dtBR(e.inicio) : '';
  if (!e.inicio && !e.termino) return '';
  return `${e.inicio ? dtBR(e.inicio) : '-'} a ${dtBR(e.termino || (e.inicio ? evtDataAdd(e.inicio, dias - 1) : ''))}`;
}

export { evtPeriodo, evtTerminoHint };
