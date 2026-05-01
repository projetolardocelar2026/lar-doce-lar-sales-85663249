CREATE TABLE IF NOT EXISTS public.cupons_enviados (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  venda_id UUID REFERENCES public.vendas(id) ON DELETE SET NULL,
  conteudo TEXT NOT NULL,
  enviado_via TEXT NOT NULL DEFAULT 'whatsapp',
  atendente_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.cupons_enviados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff vê cupons" ON public.cupons_enviados
  FOR SELECT USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff cria cupons" ON public.cupons_enviados
  FOR INSERT WITH CHECK (public.is_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_cupons_cliente ON public.cupons_enviados(cliente_id, created_at DESC);