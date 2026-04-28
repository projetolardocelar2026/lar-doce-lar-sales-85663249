
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.atualiza_saldo_caderneta_venda() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.processa_pagamento_caderneta() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.baixa_estoque() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
