CREATE OR REPLACE FUNCTION public.abrir_caixa(_troco numeric)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _id uuid;
BEGIN
  IF NOT is_staff(auth.uid()) THEN RAISE EXCEPTION 'Permissão negada'; END IF;
  INSERT INTO caixa_sessoes (operador_id, troco_inicial)
  VALUES (auth.uid(), COALESCE(_troco,0)) RETURNING id INTO _id;
  RETURN _id;
END;
$$;
REVOKE ALL ON FUNCTION public.abrir_caixa(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.abrir_caixa(numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.fechar_caixa(_sessao uuid, _valor_contado numeric, _obs text DEFAULT NULL)
RETURNS public.caixa_sessoes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.caixa_sessoes%ROWTYPE;
  v_vendas numeric := 0;
  v_legacy numeric := 0;
  v_supr numeric := 0;
  v_sang numeric := 0;
  v_esperado numeric;
BEGIN
  SELECT * INTO s FROM caixa_sessoes WHERE id = _sessao FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sessão não encontrada'; END IF;
  IF s.status='fechada' THEN RAISE EXCEPTION 'Caixa já fechado'; END IF;
  IF s.operador_id <> auth.uid() AND NOT has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;

  SELECT COALESCE(SUM(pv.valor),0) INTO v_vendas
    FROM pagamentos_venda pv
    JOIN vendas v ON v.id = pv.venda_id
   WHERE v.sessao_caixa_id = _sessao
     AND pv.forma_pagamento = 'dinheiro'
     AND v.status <> 'cancelada';

  SELECT COALESCE(SUM(v.total),0) INTO v_legacy
    FROM vendas v
   WHERE v.sessao_caixa_id = _sessao
     AND v.forma_pagamento = 'dinheiro'
     AND v.status <> 'cancelada'
     AND NOT EXISTS (SELECT 1 FROM pagamentos_venda pv WHERE pv.venda_id = v.id);

  SELECT COALESCE(SUM(valor),0) INTO v_supr
    FROM caixa_movimentos
   WHERE sessao_id = _sessao AND tipo = 'suprimento';

  SELECT COALESCE(SUM(valor),0) INTO v_sang
    FROM caixa_movimentos
   WHERE sessao_id = _sessao AND tipo = 'sangria';

  v_esperado := COALESCE(s.troco_inicial,0) + v_vendas + v_legacy + v_supr - v_sang;

  UPDATE caixa_sessoes
     SET fechado_em = now(),
         valor_contado = COALESCE(_valor_contado,0),
         valor_esperado = v_esperado,
         diferenca = COALESCE(_valor_contado,0) - v_esperado,
         observacoes = _obs,
         status = 'fechada'
   WHERE id = _sessao
   RETURNING * INTO s;
  RETURN s;
END;
$$;
REVOKE ALL ON FUNCTION public.fechar_caixa(uuid,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fechar_caixa(uuid,numeric,text) TO authenticated;

DELETE FROM public.fluxo_caixa
 WHERE tipo = 'entrada_troco_inicial'
   AND venda_id IS NULL
   AND pagamento_id IS NULL;