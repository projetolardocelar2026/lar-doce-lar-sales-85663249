
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'atendente');
CREATE TYPE public.forma_pagamento AS ENUM ('dinheiro', 'pix', 'cartao_debito', 'cartao_credito', 'caderneta');
CREATE TYPE public.status_venda AS ENUM ('paga', 'pendente', 'cancelada');
CREATE TYPE public.tipo_movimento AS ENUM ('entrada_venda', 'entrada_pagamento_caderneta', 'saida_fornecedor', 'saida_despesa', 'entrada_outras', 'saida_outras');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_completo TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

-- ============ CATEGORIAS ============
CREATE TABLE public.categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  icone TEXT DEFAULT 'package',
  ordem INTEGER NOT NULL DEFAULT 0,
  ativa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;

-- ============ PRODUTOS ============
CREATE TABLE public.produtos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id UUID REFERENCES public.categorias(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  preco NUMERIC(10,2) NOT NULL DEFAULT 0,
  preco_custo NUMERIC(10,2) DEFAULT 0,
  estoque INTEGER NOT NULL DEFAULT 0,
  estoque_minimo INTEGER DEFAULT 0,
  codigo_barras TEXT,
  imagem_url TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  destaque BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_produtos_categoria ON public.produtos(categoria_id);
CREATE INDEX idx_produtos_nome ON public.produtos(nome);
CREATE INDEX idx_produtos_ativo ON public.produtos(ativo);

-- ============ CLIENTES ============
CREATE TABLE public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  telefone TEXT,
  email TEXT,
  endereco TEXT,
  documento TEXT,
  limite_caderneta NUMERIC(10,2) NOT NULL DEFAULT 0,
  saldo_devedor NUMERIC(10,2) NOT NULL DEFAULT 0,
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_clientes_nome ON public.clientes(nome);

-- ============ VENDAS ============
CREATE TABLE public.vendas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  atendente_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  forma_pagamento forma_pagamento NOT NULL,
  status status_venda NOT NULL DEFAULT 'paga',
  observacoes TEXT,
  data_venda TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_vendas_data ON public.vendas(data_venda DESC);
CREATE INDEX idx_vendas_cliente ON public.vendas(cliente_id);
CREATE INDEX idx_vendas_forma ON public.vendas(forma_pagamento);

-- ============ ITENS VENDA ============
CREATE TABLE public.itens_venda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id UUID NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
  produto_id UUID REFERENCES public.produtos(id) ON DELETE SET NULL,
  produto_nome TEXT NOT NULL,
  categoria_id UUID REFERENCES public.categorias(id) ON DELETE SET NULL,
  quantidade NUMERIC(10,2) NOT NULL DEFAULT 1,
  preco_unitario NUMERIC(10,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.itens_venda ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_itens_venda ON public.itens_venda(venda_id);
CREATE INDEX idx_itens_produto ON public.itens_venda(produto_id);

-- ============ PAGAMENTOS CADERNETA ============
CREATE TABLE public.pagamentos_caderneta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  atendente_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  valor NUMERIC(10,2) NOT NULL,
  forma_pagamento forma_pagamento NOT NULL,
  observacoes TEXT,
  data_pagamento TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pagamentos_caderneta ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_pagamentos_data ON public.pagamentos_caderneta(data_pagamento DESC);
CREATE INDEX idx_pagamentos_cliente ON public.pagamentos_caderneta(cliente_id);

-- ============ FLUXO CAIXA ============
CREATE TABLE public.fluxo_caixa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo tipo_movimento NOT NULL,
  valor NUMERIC(10,2) NOT NULL,
  descricao TEXT NOT NULL,
  venda_id UUID REFERENCES public.vendas(id) ON DELETE SET NULL,
  pagamento_id UUID REFERENCES public.pagamentos_caderneta(id) ON DELETE SET NULL,
  usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  data_movimento TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.fluxo_caixa ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_fluxo_data ON public.fluxo_caixa(data_movimento DESC);
CREATE INDEX idx_fluxo_tipo ON public.fluxo_caixa(tipo);

-- ============ TRIGGERS ============

-- updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_produtos_updated BEFORE UPDATE ON public.produtos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_clientes_updated BEFORE UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, nome_completo)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome_completo', NEW.email));
  -- First user becomes admin, others atendente
  IF (SELECT COUNT(*) FROM public.user_roles) = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'atendente');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Atualiza saldo devedor do cliente em venda na caderneta
CREATE OR REPLACE FUNCTION public.atualiza_saldo_caderneta_venda()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.forma_pagamento = 'caderneta' AND NEW.cliente_id IS NOT NULL THEN
    UPDATE public.clientes SET saldo_devedor = saldo_devedor + NEW.total WHERE id = NEW.cliente_id;
  END IF;
  -- Vendas à vista entram automaticamente no fluxo de caixa
  IF NEW.forma_pagamento != 'caderneta' THEN
    INSERT INTO public.fluxo_caixa (tipo, valor, descricao, venda_id, usuario_id, data_movimento)
    VALUES ('entrada_venda', NEW.total, 'Venda #' || substr(NEW.id::text, 1, 8) || ' (' || NEW.forma_pagamento || ')', NEW.id, NEW.atendente_id, NEW.data_venda);
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_venda_caderneta AFTER INSERT ON public.vendas
  FOR EACH ROW EXECUTE FUNCTION public.atualiza_saldo_caderneta_venda();

-- Pagamento da caderneta
CREATE OR REPLACE FUNCTION public.processa_pagamento_caderneta()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.clientes SET saldo_devedor = GREATEST(0, saldo_devedor - NEW.valor) WHERE id = NEW.cliente_id;
  INSERT INTO public.fluxo_caixa (tipo, valor, descricao, pagamento_id, usuario_id, data_movimento)
  VALUES ('entrada_pagamento_caderneta', NEW.valor, 'Pagamento caderneta (' || NEW.forma_pagamento || ')', NEW.id, NEW.atendente_id, NEW.data_pagamento);
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_pagamento_caderneta AFTER INSERT ON public.pagamentos_caderneta
  FOR EACH ROW EXECUTE FUNCTION public.processa_pagamento_caderneta();

-- Baixa de estoque ao inserir item de venda
CREATE OR REPLACE FUNCTION public.baixa_estoque()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.produto_id IS NOT NULL THEN
    UPDATE public.produtos SET estoque = estoque - NEW.quantidade WHERE id = NEW.produto_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_baixa_estoque AFTER INSERT ON public.itens_venda
  FOR EACH ROW EXECUTE FUNCTION public.baixa_estoque();

-- ============ RLS POLICIES ============

-- profiles: usuário vê o próprio; staff vê todos
CREATE POLICY "Próprio perfil select" ON public.profiles FOR SELECT USING (auth.uid() = id OR public.is_staff(auth.uid()));
CREATE POLICY "Próprio perfil update" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Insert profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- user_roles: staff vê todos; admin gerencia
CREATE POLICY "Staff vê papéis" ON public.user_roles FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Admin gerencia papéis" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- categorias: público lê ativas; admin gerencia
CREATE POLICY "Público lê categorias" ON public.categorias FOR SELECT USING (ativa = true OR public.is_staff(auth.uid()));
CREATE POLICY "Admin gerencia categorias" ON public.categorias FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- produtos: público lê ativos; staff lê todos; admin gerencia
CREATE POLICY "Público lê produtos ativos" ON public.produtos FOR SELECT USING (ativo = true OR public.is_staff(auth.uid()));
CREATE POLICY "Admin gerencia produtos" ON public.produtos FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- clientes: só staff
CREATE POLICY "Staff vê clientes" ON public.clientes FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff gerencia clientes" ON public.clientes FOR ALL USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- vendas: staff
CREATE POLICY "Staff vê vendas" ON public.vendas FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff cria vendas" ON public.vendas FOR INSERT WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Admin atualiza vendas" ON public.vendas FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- itens_venda: staff
CREATE POLICY "Staff vê itens" ON public.itens_venda FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff cria itens" ON public.itens_venda FOR INSERT WITH CHECK (public.is_staff(auth.uid()));

-- pagamentos: staff
CREATE POLICY "Staff vê pagamentos" ON public.pagamentos_caderneta FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff cria pagamentos" ON public.pagamentos_caderneta FOR INSERT WITH CHECK (public.is_staff(auth.uid()));

-- fluxo_caixa: admin vê tudo, staff só vê entradas; admin gerencia
CREATE POLICY "Admin vê fluxo completo" ON public.fluxo_caixa FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin gerencia fluxo" ON public.fluxo_caixa FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ SEED CATEGORIAS ============
INSERT INTO public.categorias (nome, icone, ordem) VALUES
  ('Limpeza', 'spray-can', 1),
  ('Utilidades Domésticas', 'home', 2),
  ('Higiene', 'sparkles', 3),
  ('Automotivo', 'car', 4),
  ('Mercearia', 'candy', 5);
