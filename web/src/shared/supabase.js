/**
 * Cliente do Supabase (login, banco e função de gestão de contas).
 * A URL e a chave publicável vêm de variáveis de ambiente do build:
 *   VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (veja .env.example).
 * A chave publicável é feita para ficar no navegador: quem protege os dados são as
 * regras do banco (supabase/migrations). A chave de serviço NUNCA entra aqui.
 */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const chave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !chave) {
  console.error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (arquivo .env.local ou variáveis da hospedagem).');
}

export const supabase = createClient(url || 'http://configure-o-supabase.invalid', chave || 'sem-chave', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
