
CREATE TABLE IF NOT EXISTS public.caixa_sessoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operador_id uuid NOT NULL,
  aberto_em timestamptz NOT NULL DEFAULT now(),
  fechado_em timestamptz,
  troco_inicial numeric NOT NULL DEFAULT 0,
  valor_contado numeric,
  valor_esperado numeric,
  diferenca numeric,
  observacoes text,
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','fechada')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS caixa_sessoes_um_aberto_por_operador
  ON public.caixa_sessoes(operador_id) WHERE status = 'aberta';
ALTER TABLE public.caixa_sessoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff vê suas sessões" ON public.caixa_sessoes FOR SELECT
  USING (operador_id = auth.uid() OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Staff cria sessão" ON public.caixa_sessoes FOR INSERT
  WITH CHECK (is_staff(auth.uid()) AND operador_id = auth.uid());
CREATE POLICY "Staff atualiza sua sessão" ON public.caixa_sessoes FOR UPDATE
  USING (operador_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.caixa_movimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sessao_id uuid NOT NULL REFERENCES public.caixa_sessoes(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('sangria','suprimento')),
  valor numeric NOT NULL CHECK (valor > 0),
  motivo text,
  operador_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.caixa_movimentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff vê movimentos" ON public.caixa_movimentos FOR SELECT USING (is_staff(auth.uid()));
CREATE POLICY "Staff cria movimento" ON public.caixa_movimentos FOR INSERT
  WITH CHECK (is_staff(auth.uid()) AND operador_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.pagamentos_venda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL,
  forma_pagamento public.forma_pagamento NOT NULL,
  valor numeric NOT NULL CHECK (valor > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pag_venda ON public.pagamentos_venda(venda_id);
ALTER TABLE public.pagamentos_venda ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff vê pagamentos venda" ON public.pagamentos_venda FOR SELECT USING (is_staff(auth.uid()));
CREATE POLICY "Staff cria pagamento venda" ON public.pagamentos_venda FOR INSERT WITH CHECK (is_staff(auth.uid()));

ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS saldo_credito numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.garrafas_retornadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  quantidade integer NOT NULL CHECK (quantidade > 0),
  valor_unitario numeric NOT NULL DEFAULT 0.20,
  valor_credito numeric NOT NULL,
  observacoes text,
  operador_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.garrafas_retornadas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff vê garrafas" ON public.garrafas_retornadas FOR SELECT USING (is_staff(auth.uid()));
CREATE POLICY "Staff cria garrafas" ON public.garrafas_retornadas FOR INSERT WITH CHECK (is_staff(auth.uid()));

ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS desconto numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxa numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credito_usado numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sessao_caixa_id uuid;

CREATE OR REPLACE FUNCTION public.abrir_caixa(_troco numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF NOT is_staff(auth.uid()) THEN RAISE EXCEPTION 'Permissão negada'; END IF;
  INSERT INTO caixa_sessoes (operador_id, troco_inicial)
  VALUES (auth.uid(), COALESCE(_troco,0)) RETURNING id INTO _id;
  IF COALESCE(_troco,0) > 0 THEN
    INSERT INTO fluxo_caixa (tipo, valor, descricao, usuario_id)
    VALUES ('entrada_troco_inicial', _troco, 'Troco inicial do caixa', auth.uid());
  END IF;
  RETURN _id;
END; $$;
REVOKE ALL ON FUNCTION public.abrir_caixa(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.abrir_caixa(numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.registrar_caixa_movimento(_sessao uuid, _tipo text, _valor numeric, _motivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF NOT is_staff(auth.uid()) THEN RAISE EXCEPTION 'Permissão negada'; END IF;
  IF _tipo NOT IN ('sangria','suprimento') THEN RAISE EXCEPTION 'Tipo inválido'; END IF;
  INSERT INTO caixa_movimentos (sessao_id, tipo, valor, motivo, operador_id)
  VALUES (_sessao, _tipo, _valor, _motivo, auth.uid()) RETURNING id INTO _id;
  INSERT INTO fluxo_caixa (tipo, valor, descricao, usuario_id)
  VALUES (
    CASE WHEN _tipo='sangria' THEN 'saida_sangria'::tipo_movimento ELSE 'entrada_suprimento'::tipo_movimento END,
    _valor,
    COALESCE(_motivo, CASE WHEN _tipo='sangria' THEN 'Sangria de caixa' ELSE 'Suprimento de caixa' END),
    auth.uid()
  );
  RETURN _id;
END; $$;
REVOKE ALL ON FUNCTION public.registrar_caixa_movimento(uuid,text,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_caixa_movimento(uuid,text,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fechar_caixa(_sessao uuid, _valor_contado numeric, _obs text DEFAULT NULL)
RETURNS public.caixa_sessoes LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    FROM pagamentos_venda pv JOIN vendas v ON v.id=pv.venda_id
   WHERE v.sessao_caixa_id=_sessao AND pv.forma_pagamento='dinheiro' AND v.status<>'cancelada';

  SELECT COALESCE(SUM(v.total),0) INTO v_legacy
    FROM vendas v
   WHERE v.sessao_caixa_id=_sessao AND v.forma_pagamento='dinheiro' AND v.status<>'cancelada'
     AND NOT EXISTS (SELECT 1 FROM pagamentos_venda pv WHERE pv.venda_id=v.id);

  SELECT COALESCE(SUM(valor),0) INTO v_supr FROM caixa_movimentos WHERE sessao_id=_sessao AND tipo='suprimento';
  SELECT COALESCE(SUM(valor),0) INTO v_sang FROM caixa_movimentos WHERE sessao_id=_sessao AND tipo='sangria';

  v_esperado := s.troco_inicial + v_vendas + v_legacy + v_supr - v_sang;

  UPDATE caixa_sessoes
     SET fechado_em=now(), valor_contado=_valor_contado, valor_esperado=v_esperado,
         diferenca=COALESCE(_valor_contado,0)-v_esperado, observacoes=_obs, status='fechada'
   WHERE id=_sessao RETURNING * INTO s;
  RETURN s;
END; $$;
REVOKE ALL ON FUNCTION public.fechar_caixa(uuid,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fechar_caixa(uuid,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.registrar_garrafas(_cliente uuid, _qtd integer, _valor_unit numeric DEFAULT 0.20, _obs text DEFAULT NULL)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _credito numeric;
BEGIN
  IF NOT is_staff(auth.uid()) THEN RAISE EXCEPTION 'Permissão negada'; END IF;
  _credito := _qtd * COALESCE(_valor_unit,0.20);
  INSERT INTO garrafas_retornadas (cliente_id, quantidade, valor_unitario, valor_credito, observacoes, operador_id)
  VALUES (_cliente, _qtd, COALESCE(_valor_unit,0.20), _credito, _obs, auth.uid());
  UPDATE clientes SET saldo_credito = saldo_credito + _credito WHERE id=_cliente;
  RETURN _credito;
END; $$;
REVOKE ALL ON FUNCTION public.registrar_garrafas(uuid,integer,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_garrafas(uuid,integer,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.usar_credito_cliente(_cliente uuid, _valor numeric)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _saldo numeric;
BEGIN
  IF NOT is_staff(auth.uid()) THEN RAISE EXCEPTION 'Permissão negada'; END IF;
  SELECT saldo_credito INTO _saldo FROM clientes WHERE id=_cliente FOR UPDATE;
  IF _saldo < _valor THEN RAISE EXCEPTION 'Saldo insuficiente'; END IF;
  UPDATE clientes SET saldo_credito = saldo_credito - _valor WHERE id=_cliente;
  INSERT INTO fluxo_caixa (tipo, valor, descricao, usuario_id)
  VALUES ('saida_credito_garrafas', _valor, 'Abatimento por crédito do cliente', auth.uid());
  RETURN _saldo - _valor;
END; $$;
REVOKE ALL ON FUNCTION public.usar_credito_cliente(uuid,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.usar_credito_cliente(uuid,numeric) TO authenticated;
