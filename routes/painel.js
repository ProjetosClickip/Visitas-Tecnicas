/**
 * Painéis consolidados.
 * - /api/publico/painel: sem login (se habilitado em config/organizacao.json → painelPublico).
 *   Só nome da demanda, responsável, tipo, status e data. Nenhum valor, contato ou dado técnico.
 * - /api/painel: usuário logado. "meu" = minhas demandas; "equipe" = todas (somente supervisão, com valores).
 */
import { Router } from 'express';
import { json } from '../db.js';
import { ehSupervisor, erro, exigirLogin } from '../http.js';
import { mapaNomes } from '../lib/usuarios.js';
import { projetoVazio, situacaoAprovacao, totais, TIPOS_PROJETO } from '../lib/custos.js';

function coletar(db, { donoId = null, comValores = false }) {
  const nomes = mapaNomes(db);
  const filtro = donoId ? 'WHERE dono_id = ?' : '';
  const args = donoId ? [donoId] : [];
  const visitas = db.prepare(
    `SELECT id, dono_id, tipo, status, criado_em, atualizado_em,
            json_extract(dados, '$.cli.nome') AS nome, json_extract(dados, '$.cli.evento') AS evento, json_extract(dados, '$.cli.data') AS data
       FROM visitas ${filtro}`,
  ).all(...args);
  const itens = visitas.map((v) => ({
    sys: 'visitas', k: v.tipo, id: v.id,
    nome: v.tipo === 'evt' ? v.evento || v.nome || '(evento sem nome)' : v.nome || '(sem nome)',
    userId: v.dono_id, userName: nomes[v.dono_id] || 'Usuário', status: v.status,
    data: v.data || String(v.criado_em).slice(0, 10), atualizado: v.atualizado_em,
  }));
  const selAprov = db.prepare('SELECT * FROM aprovacoes_custos WHERE projeto_id = ? ORDER BY em');
  const clientes = new Set(itens.map((x) => x.nome.toLowerCase()));
  for (const p of db.prepare(`SELECT * FROM projetos_custos ${filtro}`).all(...args)) {
    const d = json(p.dados);
    if (projetoVazio(d)) continue;
    const ap = situacaoAprovacao(selAprov.all(p.id), p.conteudo_alterado_em, nomes);
    const info = d.info || {};
    clientes.add(String(info.cliente || info.nome || '').toLowerCase());
    const item = {
      sys: 'custos', k: 'custo', id: p.id, nome: info.nome || '(projeto sem nome)',
      tipo: TIPOS_PROJETO[info.tipo] || '', userId: p.dono_id, userName: nomes[p.dono_id] || 'Usuário',
      status: ap.status, data: String(info.data || p.criado_em).slice(0, 10), atualizado: p.atualizado_em,
    };
    if (comValores) Object.assign(item, { cliente: info.cliente || '', t: totais(d), aprov: ap });
    itens.push(item);
  }
  return { itens, clientes: clientes.size };
}

export function rotasPainel({ db, config }) {
  const r = Router();

  r.get('/publico/painel', (req, res) => {
    if (!config.organizacao.painelPublico) throw erro(404, 'Painel público desabilitado.');
    const { itens, clientes } = coletar(db, {});
    const usuarios = [...new Map(itens.map((x) => [x.userId, { id: x.userId, name: x.userName }])).values()];
    res.json({ itens, clientes, usuarios });
  });

  r.get('/painel', exigirLogin, (req, res) => {
    const equipe = req.query.escopo === 'equipe';
    if (equipe && !ehSupervisor(req)) throw erro(403, 'Acesso restrito à supervisão.');
    res.json(coletar(db, { donoId: equipe ? null : req.usuario.id, comValores: true }));
  });

  return r;
}
