
CREATE OR REPLACE FUNCTION public.cancelar_venda(_venda_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record public.vendas%ROWTYPE;
  v_item RECORD;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;

  SELECT * INTO v_record FROM public.vendas WHERE id = _venda_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venda não encontrada';
  END IF;
  IF v_record.status = 'cancelada' THEN
    RAISE EXCEPTION 'Venda já cancelada';
  END IF;

  -- Devolve estoque
  FOR v_item IN
    SELECT produto_id, quantidade FROM public.itens_venda WHERE venda_id = _venda_id AND produto_id IS NOT NULL
  LOOP
    UPDATE public.produtos
       SET estoque = estoque + v_item.quantidade
     WHERE id = v_item.produto_id;
  END LOOP;

  -- Estorna saldo devedor caso caderneta
  IF v_record.forma_pagamento = 'caderneta' AND v_record.cliente_id IS NOT NULL THEN
    UPDATE public.clientes
       SET saldo_devedor = GREATEST(0, saldo_devedor - v_record.total)
     WHERE id = v_record.cliente_id;
  ELSE
    -- Lança saída no fluxo de caixa para anular a entrada original
    INSERT INTO public.fluxo_caixa (tipo, valor, descricao, venda_id, usuario_id, data_movimento)
    VALUES ('saida_outras', v_record.total,
            'Cancelamento da venda #' || substr(_venda_id::text, 1, 8),
            _venda_id, auth.uid(), now());
  END IF;

  UPDATE public.vendas SET status = 'cancelada' WHERE id = _venda_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancelar_venda(uuid) TO authenticated;
