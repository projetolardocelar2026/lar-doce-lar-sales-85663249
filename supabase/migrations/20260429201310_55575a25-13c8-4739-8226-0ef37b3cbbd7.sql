
INSERT INTO storage.buckets (id, name, public)
VALUES ('produtos', 'produtos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Público lê imagens produtos"
ON storage.objects FOR SELECT
USING (bucket_id = 'produtos');

CREATE POLICY "Admin envia imagens produtos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'produtos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin atualiza imagens produtos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'produtos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin remove imagens produtos"
ON storage.objects FOR DELETE
USING (bucket_id = 'produtos' AND public.has_role(auth.uid(), 'admin'));
