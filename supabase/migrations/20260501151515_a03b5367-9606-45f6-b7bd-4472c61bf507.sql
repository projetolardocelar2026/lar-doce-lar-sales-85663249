-- Fase 1: Clientes 360 - novos campos sociais e realtime
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS instagram text,
  ADD COLUMN IF NOT EXISTS facebook text,
  ADD COLUMN IF NOT EXISTS observacao_relacionamento text;

-- Habilitar replica identity full para realtime capturar UPDATE/DELETE com payload completo
ALTER TABLE public.clientes REPLICA IDENTITY FULL;

-- Adicionar à publicação realtime (idempotente via DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'clientes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.clientes;
  END IF;
END $$;