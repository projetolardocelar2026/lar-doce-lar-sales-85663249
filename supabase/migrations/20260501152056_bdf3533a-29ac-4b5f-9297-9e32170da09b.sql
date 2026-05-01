-- Enums
DO $$ BEGIN
  CREATE TYPE public.status_orcamento AS ENUM ('rascunho','enviado','convertido','cancelado','expirado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.status_conta_pagar AS ENUM ('pendente','paga','atrasada','cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Adiciona tipo no fluxo_caixa para saída de contas a pagar
DO $$ BEGIN
  ALTER TYPE public.tipo_movimento_fluxo ADD VALUE IF NOT EXISTS 'saida_conta_pagar';
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- ORCAMENTOS
CREATE TABLE IF NOT EXISTS public.orcamentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  numero SERIAL,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nome TEXT,
  atendente_id UUID,
  total NUMERIC NOT NULL DEFAULT 0,
  status public.status_orcamento NOT NULL DEFAULT 'rascunho',
  validade DATE,
  observacoes TEXT,
  venda_convertida_id UUID REFERENCES public.vendas(id) ON DELETE SET NULL,
  data_orcamento TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.itens_orcamento (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  orcamento_id UUID NOT NULL REFERENCES public.orcamentos(id) ON DELETE CASCADE,
  produto_id UUID REFERENCES public.produtos(id) ON DELETE SET NULL,
  produto_nome TEXT NOT NULL,
  categoria_id UUID,
  quantidade NUMERIC NOT NULL DEFAULT 1,
  preco_unitario NUMERIC NOT NULL DEFAULT 0,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_orcamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff vê orçamentos" ON public.orcamentos FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff cria orçamentos" ON public.orcamentos FOR INSERT WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff atualiza orçamentos" ON public.orcamentos FOR UPDATE USING (public.is_staff(auth.uid()));
CREATE POLICY "Admin remove orçamentos" ON public.orcamentos FOR DELETE USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Staff vê itens orçamento" ON public.itens_orcamento FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff cria itens orçamento" ON public.itens_orcamento FOR INSERT WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff atualiza itens orçamento" ON public.itens_orcamento FOR UPDATE USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff remove itens orçamento" ON public.itens_orcamento FOR DELETE USING (public.is_staff(auth.uid()));

CREATE TRIGGER trg_orcamentos_updated BEFORE UPDATE ON public.orcamentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- CONTAS A PAGAR
CREATE TABLE IF NOT EXISTS public.contas_pagar (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  descricao TEXT NOT NULL,
  fornecedor TEXT,
  categoria TEXT,
  valor NUMERIC NOT NULL DEFAULT 0,
  vencimento DATE NOT NULL,
  status public.status_conta_pagar NOT NULL DEFAULT 'pendente',
  data_pagamento TIMESTAMPTZ,
  forma_pagamento TEXT,
  observacoes TEXT,
  recorrente BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contas_pagar ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gerencia contas pagar" ON public.contas_pagar
  FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Staff vê contas pagar" ON public.contas_pagar
  FOR SELECT USING (public.is_staff(auth.uid()));

CREATE TRIGGER trg_contas_pagar_updated BEFORE UPDATE ON public.contas_pagar
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger: ao marcar conta como paga, lança saída no fluxo de caixa
CREATE OR REPLACE FUNCTION public.processa_pagamento_conta()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'paga' AND (OLD.status IS DISTINCT FROM 'paga') THEN
    IF NEW.data_pagamento IS NULL THEN
      NEW.data_pagamento := now();
    END IF;
    INSERT INTO public.fluxo_caixa (tipo, valor, descricao, usuario_id, data_movimento)
    VALUES (
      'saida_conta_pagar',
      NEW.valor,
      'Conta paga: ' || NEW.descricao || COALESCE(' — ' || NEW.fornecedor, ''),
      auth.uid(),
      NEW.data_pagamento
    );
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_conta_paga
  BEFORE UPDATE ON public.contas_pagar
  FOR EACH ROW EXECUTE FUNCTION public.processa_pagamento_conta();