CREATE OR REPLACE FUNCTION public.quitar_compras_caderneta(_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _n integer;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Permissão negada'; END IF;
  UPDATE public.vendas
     SET cobranca_status = 'paga', status = 'paga'
   WHERE id = ANY(_ids)
     AND forma_pagamento = 'caderneta'
     AND status <> 'cancelada';
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.quitar_compras_caderneta(uuid[]) TO authenticated;