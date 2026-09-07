CREATE OR REPLACE FUNCTION public.registrar_pagamento_e_quitar_caderneta(
  _cliente uuid,
  _partes jsonb,
  _compras uuid[],
  _data_pagamento timestamptz,
  _observacoes text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _parte jsonb;
  _forma public.forma_pagamento;
  _valor numeric;
  _total numeric := 0;
  _total_compras numeric := 0;
  _n integer := 0;
  _esperadas integer := COALESCE(array_length(_compras, 1), 0);
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;

  IF _cliente IS NULL OR jsonb_typeof(_partes) <> 'array' OR jsonb_array_length(_partes) = 0 THEN
    RAISE EXCEPTION 'Pagamento inválido';
  END IF;

  FOR _parte IN SELECT value FROM jsonb_array_elements(_partes)
  LOOP
    _forma := (_parte->>'forma')::public.forma_pagamento;
    _valor := (_parte->>'valor')::numeric;
    IF _forma = 'caderneta' OR _valor IS NULL OR _valor <= 0 THEN
      RAISE EXCEPTION 'Forma ou valor de pagamento inválido';
    END IF;
    _total := _total + _valor;
  END LOOP;

  IF _esperadas > 0 THEN
    SELECT COALESCE(SUM(b.total), 0), COUNT(*)
      INTO _total_compras, _n
      FROM (
        SELECT total
          FROM public.vendas
         WHERE id = ANY(_compras)
           AND cliente_id = _cliente
           AND forma_pagamento = 'caderneta'
           AND status <> 'cancelada'
           AND status <> 'paga'
           AND cobranca_status IS DISTINCT FROM 'paga'
         FOR UPDATE
      ) AS b;

    IF _n <> _esperadas THEN
      RAISE EXCEPTION 'Uma ou mais compras não estão abertas para quitação';
    END IF;
    IF ABS(_total - _total_compras) > 0.009 THEN
      RAISE EXCEPTION 'O valor pago deve corresponder exatamente às compras selecionadas';
    END IF;

    UPDATE public.vendas
       SET cobranca_status = 'paga',
           status = 'paga',
           quitada_em = COALESCE(_data_pagamento, now()),
           quitacao_valor = total,
           quitacao_formas = _partes
     WHERE id = ANY(_compras)
       AND cliente_id = _cliente
       AND forma_pagamento = 'caderneta'
       AND status <> 'cancelada'
       AND status <> 'paga'
       AND cobranca_status IS DISTINCT FROM 'paga';

    GET DIAGNOSTICS _n = ROW_COUNT;
    IF _n <> _esperadas THEN
      RAISE EXCEPTION 'Uma ou mais compras não puderam ser quitadas';
    END IF;
  END IF;

  FOR _parte IN SELECT value FROM jsonb_array_elements(_partes)
  LOOP
    _forma := (_parte->>'forma')::public.forma_pagamento;
    _valor := (_parte->>'valor')::numeric;
    INSERT INTO public.pagamentos_caderneta (
      cliente_id, atendente_id, valor, forma_pagamento, observacoes, data_pagamento
    ) VALUES (
      _cliente, auth.uid(), _valor, _forma,
      NULLIF(BTRIM(_observacoes), ''), COALESCE(_data_pagamento, now())
    );
  END LOOP;

  RETURN _n;
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_pagamento_e_quitar_caderneta(uuid, jsonb, uuid[], timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_pagamento_e_quitar_caderneta(uuid, jsonb, uuid[], timestamptz, text) TO authenticated;