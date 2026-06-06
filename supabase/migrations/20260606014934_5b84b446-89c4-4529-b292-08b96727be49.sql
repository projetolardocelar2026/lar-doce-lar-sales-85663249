
-- 1. Vendas: vencimento + status cobrança
ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS vencimento_caderneta date,
  ADD COLUMN IF NOT EXISTS cobranca_status text NOT NULL DEFAULT 'aberta';

-- 2. Histórico de alterações de vencimento
CREATE TABLE IF NOT EXISTS public.caderneta_vencimento_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL,
  vencimento_anterior date,
  vencimento_novo date NOT NULL,
  motivo text,
  usuario_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.caderneta_vencimento_historico TO authenticated;
GRANT ALL ON public.caderneta_vencimento_historico TO service_role;
ALTER TABLE public.caderneta_vencimento_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff vê histórico vencimento" ON public.caderneta_vencimento_historico
  FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff cria histórico vencimento" ON public.caderneta_vencimento_historico
  FOR INSERT WITH CHECK (public.is_staff(auth.uid()));

-- 3. Função para editar vencimento com histórico
CREATE OR REPLACE FUNCTION public.editar_vencimento_caderneta(
  _venda uuid, _novo date, _motivo text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ant date;
BEGIN
  IF NOT is_staff(auth.uid()) THEN RAISE EXCEPTION 'Permissão negada'; END IF;
  SELECT vencimento_caderneta INTO _ant FROM vendas WHERE id = _venda;
  UPDATE vendas SET vencimento_caderneta = _novo WHERE id = _venda;
  INSERT INTO caderneta_vencimento_historico (venda_id, vencimento_anterior, vencimento_novo, motivo, usuario_id)
  VALUES (_venda, _ant, _novo, _motivo, auth.uid());
END; $$;

-- 4. Permissões: produtos e mídias para staff (não só admin)
DROP POLICY IF EXISTS "Admin gerencia produtos" ON public.produtos;
CREATE POLICY "Admin remove produtos" ON public.produtos
  FOR DELETE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Staff cria produtos" ON public.produtos
  FOR INSERT WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff atualiza produtos" ON public.produtos
  FOR UPDATE USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Admin gerencia mídias" ON public.produto_midias;
CREATE POLICY "Staff gerencia mídias produtos" ON public.produto_midias
  FOR ALL USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- 5. Storage: bucket produtos liberado para equipe
DROP POLICY IF EXISTS "Admin envia imagens produtos" ON storage.objects;
DROP POLICY IF EXISTS "Admin atualiza imagens produtos" ON storage.objects;
DROP POLICY IF EXISTS "Admin remove imagens produtos" ON storage.objects;
CREATE POLICY "Staff envia imagens produtos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'produtos' AND public.is_staff(auth.uid()));
CREATE POLICY "Staff atualiza imagens produtos" ON storage.objects
  FOR UPDATE USING (bucket_id = 'produtos' AND public.is_staff(auth.uid()));
CREATE POLICY "Staff remove imagens produtos" ON storage.objects
  FOR DELETE USING (bucket_id = 'produtos' AND public.is_staff(auth.uid()));

-- 6. Promover todos os usuários existentes a admin (mantém atendente para histórico)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users
ON CONFLICT (user_id, role) DO NOTHING;
