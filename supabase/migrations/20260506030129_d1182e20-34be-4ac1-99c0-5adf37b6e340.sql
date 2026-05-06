
-- Tabela de mídias de produtos
CREATE TABLE public.produto_midias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  url text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('foto','arte','video')),
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_produto_midias_produto ON public.produto_midias(produto_id, ordem);
ALTER TABLE public.produto_midias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Público lê mídias de produtos ativos"
ON public.produto_midias FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.produtos p WHERE p.id = produto_id AND (p.ativo = true OR public.is_staff(auth.uid())))
);

CREATE POLICY "Admin gerencia mídias"
ON public.produto_midias FOR ALL
USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Tabela de banners promocionais
CREATE TABLE public.banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  imagem_url text NOT NULL,
  link_url text,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  inicio date,
  fim date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Público lê banners ativos"
ON public.banners FOR SELECT
USING (
  ativo = true
  AND (inicio IS NULL OR inicio <= CURRENT_DATE)
  AND (fim IS NULL OR fim >= CURRENT_DATE)
  OR public.is_staff(auth.uid())
);

CREATE POLICY "Admin gerencia banners"
ON public.banners FOR ALL
USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_banners_updated
BEFORE UPDATE ON public.banners
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Bucket público para banners
INSERT INTO storage.buckets (id, name, public) VALUES ('banners','banners', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Banners públicos leitura"
ON storage.objects FOR SELECT
USING (bucket_id = 'banners');

CREATE POLICY "Staff faz upload banners"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'banners' AND public.is_staff(auth.uid()));

CREATE POLICY "Staff atualiza banners"
ON storage.objects FOR UPDATE
USING (bucket_id = 'banners' AND public.is_staff(auth.uid()));

CREATE POLICY "Staff remove banners"
ON storage.objects FOR DELETE
USING (bucket_id = 'banners' AND public.is_staff(auth.uid()));
