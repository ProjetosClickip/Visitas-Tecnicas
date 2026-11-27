/**
 * Gestão de contas pela supervisão (roda nos servidores do Supabase).
 * Usa a chave de serviço, que fica só aqui (variável SUPABASE_SERVICE_ROLE_KEY,
 * fornecida automaticamente pelo Supabase) e nunca vai para o navegador.
 *
 * POST { acao: 'criar', email, nome, cargo, papel }       → { usuario, senhaProvisoria }
 * POST { acao: 'redefinir_senha', id }                     → { senhaProvisoria }
 * POST { acao: 'alterar', id, nome?, cargo?, papel?, ativo? } → { usuario }
 *
 * Só aceita chamadas de um supervisor ativo (conferido pelo token de quem chamou).
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const resposta = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const erro = (status: number, mensagem: string) => resposta(status, { erro: mensagem });

/** Senha provisória legível (sem caracteres ambíguos): 12 caracteres com minúscula, maiúscula, número e símbolo. */
function senhaProvisoria(): string {
  const minus = 'abcdefghjkmnpqrstuvwxyz';
  const maius = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digitos = '23456789';
  const simbolos = '!@#$%&*?';
  const todos = minus + maius + digitos + simbolos;
  const aleatorio = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  const c = [minus, maius, digitos, simbolos].map((g) => g[aleatorio(g.length)]);
  while (c.length < 12) c.push(todos[aleatorio(todos.length)]);
  for (let i = c.length - 1; i > 0; i--) { const j = aleatorio(i + 1); [c[i], c[j]] = [c[j], c[i]]; }
  return c.join('');
}

const publico = (u: Record<string, unknown>) => ({
  id: u.id, nome: u.nome, email: u.email, cargo: u.cargo, papel: u.papel, supervisor: u.papel === 'supervisor',
  ativo: u.ativo, trocarSenha: u.trocar_senha, avatar: (u.perfil as Record<string, string>)?.avatar || '',
  ultimoAcesso: u.ultimo_acesso, criadoEm: u.criado_em,
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return erro(405, 'Método não permitido.');

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  // quem está chamando?
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: quem, error: errQuem } = await admin.auth.getUser(token);
  if (errQuem || !quem?.user) return erro(401, 'Sessão expirada. Entre novamente.');
  const { data: eu } = await admin.from('perfis').select('*').eq('id', quem.user.id).maybeSingle();
  if (!eu || !eu.ativo || eu.trocar_senha || eu.papel !== 'supervisor') return erro(403, 'Acesso restrito à supervisão.');

  let corpo: Record<string, unknown>;
  try { corpo = await req.json(); } catch { return erro(400, 'JSON inválido.'); }
  const auditar = (acao: string, entidadeId: string, detalhe: unknown = null) =>
    admin.from('auditoria').insert({ usuario_id: eu.id, acao, entidade: 'usuario', entidade_id: entidadeId, detalhe });

  /* ---------------------------------------------------------------- criar conta */
  if (corpo.acao === 'criar') {
    const email = String(corpo.email || '').trim().toLowerCase();
    const nome = String(corpo.nome || '').trim();
    const cargo = String(corpo.cargo || '').trim();
    const papel = corpo.papel === 'supervisor' ? 'supervisor' : 'colaborador';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return erro(400, 'E-mail inválido.');
    if (!nome) return erro(400, 'Informe o nome.');
    const { data: org } = await admin.from('organizacao').select('dados').eq('id', 1).single();
    const dominios: string[] = (org?.dados?.dominiosEmailPermitidos || []).map((d: string) => d.toLowerCase());
    if (dominios.length && !dominios.includes(email.split('@')[1])) {
      return erro(400, `Use um e-mail corporativo (${dominios.map((d) => '@' + d).join(', ')}).`);
    }
    const { data: existe } = await admin.from('perfis').select('id').ilike('email', email).maybeSingle();
    if (existe) return erro(409, 'Já existe uma conta com este e-mail.');
    const senha = senhaProvisoria();
    const { data: criado, error: errCriar } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
    if (errCriar || !criado.user) return erro(400, 'Não foi possível criar a conta: ' + (errCriar?.message || 'erro desconhecido'));
    const { data: perfil, error: errPerfil } = await admin.from('perfis')
      .insert({ id: criado.user.id, email, nome, cargo, papel, trocar_senha: true }).select('*').single();
    if (errPerfil) {
      await admin.auth.admin.deleteUser(criado.user.id);
      return erro(400, 'Não foi possível criar o perfil: ' + errPerfil.message);
    }
    await auditar('usuario.criar', criado.user.id, { email, papel });
    return resposta(201, { usuario: publico(perfil), senhaProvisoria: senha });
  }

  const id = String(corpo.id || '');
  const { data: alvo } = await admin.from('perfis').select('*').eq('id', id).maybeSingle();
  if (!alvo) return erro(404, 'Usuário não encontrado.');

  /* ---------------------------------------------------------------- redefinir senha */
  if (corpo.acao === 'redefinir_senha') {
    if (alvo.id === eu.id) return erro(400, 'Para trocar a sua própria senha use Perfil → Segurança.');
    const senha = senhaProvisoria();
    const { error } = await admin.auth.admin.updateUserById(alvo.id, { password: senha });
    if (error) return erro(400, 'Não foi possível redefinir: ' + error.message);
    await admin.from('perfis').update({ trocar_senha: true, atualizado_em: new Date().toISOString() }).eq('id', alvo.id);
    await admin.rpc('admin_encerrar_sessoes', { p_usuario: alvo.id });
    await auditar('usuario.redefinir_senha', alvo.id);
    return resposta(200, { senhaProvisoria: senha });
  }

  /* ---------------------------------------------------------------- alterar nome, cargo, papel, situação */
  if (corpo.acao === 'alterar') {
    const novo = {
      nome: corpo.nome != null ? String(corpo.nome).trim() : alvo.nome,
      cargo: corpo.cargo != null ? String(corpo.cargo).trim() : alvo.cargo,
      papel: corpo.papel != null ? String(corpo.papel) : alvo.papel,
      ativo: corpo.ativo != null ? Boolean(corpo.ativo) : alvo.ativo,
    };
    if (!novo.nome) return erro(400, 'Informe o nome.');
    if (!['colaborador', 'supervisor'].includes(novo.papel)) return erro(400, 'Papel inválido.');
    if (alvo.papel === 'supervisor' && (novo.papel !== 'supervisor' || !novo.ativo)) {
      const { count } = await admin.from('perfis').select('id', { count: 'exact', head: true })
        .eq('papel', 'supervisor').eq('ativo', true).neq('id', alvo.id);
      if (!count) return erro(400, 'É preciso manter pelo menos um supervisor ativo.');
    }
    const { data: perfil, error } = await admin.from('perfis')
      .update({ ...novo, atualizado_em: new Date().toISOString() }).eq('id', alvo.id).select('*').single();
    if (error) return erro(400, error.message);
    if (novo.ativo !== alvo.ativo) {
      // conta desativada não consegue entrar (bloqueio no Supabase Auth)
      await admin.auth.admin.updateUserById(alvo.id, { ban_duration: novo.ativo ? 'none' : '876000h' });
    }
    if (!novo.ativo || novo.papel !== alvo.papel) await admin.rpc('admin_encerrar_sessoes', { p_usuario: alvo.id });
    await auditar('usuario.alterar', alvo.id, { de: { papel: alvo.papel, ativo: alvo.ativo }, para: { papel: novo.papel, ativo: novo.ativo } });
    return resposta(200, { usuario: publico(perfil) });
  }

  return erro(400, 'Ação desconhecida.');
});
