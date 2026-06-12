
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS preco_promocional numeric,
  ADD COLUMN IF NOT EXISTS promo_inicio date,
  ADD COLUMN IF NOT EXISTS promo_fim date;
