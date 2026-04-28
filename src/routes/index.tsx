import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, ShoppingCart, Sparkles, LogIn } from "lucide-react";
import { brl, WHATSAPP_NUMBER, STORE_NAME } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  component: VitrinePage,
  head: () => ({
    meta: [
      { title: "Lar Doce Lar — Limpeza, Utilidades e Praticidade" },
      { name: "description", content: "Vitrine online da Lar Doce Lar: produtos de limpeza, utilidades domésticas, higiene, automotivos e mercearia. Peça pelo WhatsApp." },
    ],
  }),
});

type Produto = {
  id: string; nome: string; descricao: string | null; preco: number;
  estoque: number; imagem_url: string | null; categoria_id: string | null;
  destaque: boolean;
};
type Categoria = { id: string; nome: string; icone: string | null };

function VitrinePage() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [carrinho, setCarrinho] = useState<Record<string, number>>({});
  const [busca, setBusca] = useState("");
  const [catSel, setCatSel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: c }] = await Promise.all([
        supabase.from("produtos").select("*").eq("ativo", true).order("destaque", { ascending: false }).order("nome"),
        supabase.from("categorias").select("id,nome,icone").eq("ativa", true).order("ordem"),
      ]);
      setProdutos((p ?? []) as Produto[]);
      setCategorias((c ?? []) as Categoria[]);
      setLoading(false);
    })();
  }, []);

  const filtered = produtos.filter((p) => {
    const matchBusca = !busca || p.nome.toLowerCase().includes(busca.toLowerCase()) || (p.descricao ?? "").toLowerCase().includes(busca.toLowerCase());
    const matchCat = !catSel || p.categoria_id === catSel;
    return matchBusca && matchCat;
  });

  const totalCarrinho = Object.entries(carrinho).reduce((acc, [id, qtd]) => {
    const prod = produtos.find((p) => p.id === id);
    return acc + (prod ? prod.preco * qtd : 0);
  }, 0);
  const totalItens = Object.values(carrinho).reduce((a, b) => a + b, 0);

  function add(id: string) {
    setCarrinho((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
    toast.success("Adicionado ao carrinho");
  }
  function remove(id: string) {
    setCarrinho((c) => {
      const novo = { ...c };
      if (novo[id] > 1) novo[id]--; else delete novo[id];
      return novo;
    });
  }

  function finalizarWhatsApp() {
    if (totalItens === 0) { toast.error("Adicione produtos ao carrinho"); return; }
    const linhas = Object.entries(carrinho).map(([id, qtd]) => {
      const p = produtos.find((x) => x.id === id)!;
      return `• ${qtd}x ${p.nome} — ${brl(p.preco * qtd)}`;
    });
    const msg = [
      `*Pedido — ${STORE_NAME}*`, "",
      ...linhas, "",
      `*Total: ${brl(totalCarrinho)}*`, "",
      "Olá! Gostaria de fechar este pedido. 🙂",
    ].join("\n");
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-gradient-brand text-white shadow-elevated">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-3">
            <Logo size={44} />
            <div className="hidden sm:block">
              <div className="font-bold leading-tight">Lar Doce Lar</div>
              <div className="text-[11px] opacity-80">Limpeza e Praticidade</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/login">
              <Button variant="ghost" size="sm" className="text-white hover:bg-white/10">
                <LogIn className="h-4 w-4" /> <span className="hidden sm:inline">Funcionário</span>
              </Button>
            </Link>
            <Button variant="sky" size="sm" onClick={finalizarWhatsApp} className="relative">
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">Carrinho</span>
              {totalItens > 0 && (
                <Badge className="absolute -top-2 -right-2 h-5 min-w-5 px-1.5 bg-destructive text-destructive-foreground">
                  {totalItens}
                </Badge>
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-hero text-white">
        <div className="max-w-7xl mx-auto px-4 py-10 md:py-16 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-xs mb-4">
            <Sparkles className="h-3.5 w-3.5" /> Produtos selecionados pra sua casa
          </div>
          <h1 className="text-3xl md:text-5xl font-bold mb-3">Tudo o que sua casa precisa</h1>
          <p className="text-white/80 max-w-xl mx-auto">
            Limpeza, utilidades, higiene, automotivos e mercearia. Monte seu pedido e finalize pelo WhatsApp.
          </p>
        </div>
      </section>

      {/* Search + categorias */}
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto…"
            className="pl-10 h-12 text-base"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          <button
            onClick={() => setCatSel(null)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-smooth ${!catSel ? "bg-primary text-primary-foreground shadow-soft" : "bg-secondary text-secondary-foreground hover:bg-secondary/70"}`}
          >Todos</button>
          {categorias.map((c) => (
            <button
              key={c.id} onClick={() => setCatSel(c.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-smooth ${catSel === c.id ? "bg-primary text-primary-foreground shadow-soft" : "bg-secondary text-secondary-foreground hover:bg-secondary/70"}`}
            >{c.nome}</button>
          ))}
        </div>
      </div>

      {/* Grid produtos */}
      <main className="max-w-7xl mx-auto px-4 pb-32">
        {loading ? (
          <div className="text-center py-16 text-muted-foreground">Carregando produtos…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Package className="h-12 w-12 mx-auto text-muted-foreground/40" />
            <p className="mt-3 text-muted-foreground">
              {produtos.length === 0
                ? "Ainda não há produtos cadastrados. Faça login como funcionário para adicionar."
                : "Nenhum produto encontrado."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {filtered.map((p) => (
              <Card key={p.id} className="overflow-hidden bg-gradient-card hover:shadow-elevated transition-smooth">
                <div className="aspect-square bg-secondary relative overflow-hidden">
                  {p.imagem_url ? (
                    <img src={p.imagem_url} alt={p.nome} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-brand/10">
                      <Package className="h-12 w-12 text-primary/30" />
                    </div>
                  )}
                  {p.destaque && (
                    <Badge className="absolute top-2 left-2 bg-accent text-accent-foreground">Destaque</Badge>
                  )}
                </div>
                <CardContent className="p-3 space-y-2">
                  <h3 className="font-semibold text-sm line-clamp-2 min-h-[2.5rem]">{p.nome}</h3>
                  <div className="text-lg font-bold text-primary">{brl(p.preco)}</div>
                  {carrinho[p.id] ? (
                    <div className="flex items-center justify-between gap-2">
                      <Button size="sm" variant="outline" onClick={() => remove(p.id)}>−</Button>
                      <span className="font-semibold">{carrinho[p.id]}</span>
                      <Button size="sm" variant="sky" onClick={() => add(p.id)}>+</Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="hero" className="w-full" onClick={() => add(p.id)} disabled={p.estoque <= 0}>
                      {p.estoque <= 0 ? "Esgotado" : "Adicionar"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Carrinho fixo */}
      {totalItens > 0 && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:bottom-6 md:max-w-sm z-40">
          <Card className="shadow-elevated bg-gradient-brand text-white border-0">
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs opacity-80">{totalItens} {totalItens === 1 ? "item" : "itens"}</div>
                <div className="text-xl font-bold">{brl(totalCarrinho)}</div>
              </div>
              <Button variant="sky" size="lg" onClick={finalizarWhatsApp}>
                Finalizar no WhatsApp
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Package({ className }: { className?: string }) {
  // import Package as a fallback icon — re-exported lazily to avoid cluttering imports
  const { Package: P } = require("lucide-react");
  return <P className={className} />;
}
