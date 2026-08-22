import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { brl, WHATSAPP_NUMBER, STORE_NAME } from "@/lib/format";
import { precoVigente } from "@/lib/preco";
import { gerarTextoPedidoCatalogo } from "@/lib/whatsapp";
import { Search, Package, MessageCircle, ShoppingCart, Plus, Minus, Trash2 } from "lucide-react";
import { BannerSlider } from "@/components/BannerSlider";
import { MediaCarousel, type Midia } from "@/components/MediaCarousel";

export const Route = createFileRoute("/catalogo")({
  component: CatalogoPage,
  head: () => ({
    meta: [
      { title: `${STORE_NAME} — Catálogo Digital` },
      { name: "description", content: "Monte seu carrinho e envie o pedido pelo WhatsApp: artes, vídeos e ofertas da Lar Doce Lar." },
      { property: "og:title", content: `${STORE_NAME} — Catálogo Digital` },
      { property: "og:description", content: "Monte seu carrinho e envie o pedido pelo WhatsApp: artes, vídeos e ofertas da Lar Doce Lar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type Produto = {
  id: string; nome: string; descricao: string | null; preco: number;
  estoque: number; imagem_url: string | null; categoria_id: string | null; destaque: boolean;
  preco_promocional: number | null; promo_inicio: string | null; promo_fim: string | null;
};
type Categoria = { id: string; nome: string };
type CartItem = { id: string; nome: string; preco: number; quantidade: number };

function CatalogoPage() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [cats, setCats] = useState<Categoria[]>([]);
  const [midias, setMidias] = useState<Record<string, Midia[]>>({});
  const [busca, setBusca] = useState("");
  const [catSel, setCatSel] = useState<string | null>(null);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [entrega, setEntrega] = useState<"retirada" | "entrega">("retirada");
  const [nome, setNome] = useState("");
  const [endereco, setEndereco] = useState("");
  const [obs, setObs] = useState("");

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: c }, { data: m }] = await Promise.all([
        supabase.from("produtos").select("*").eq("ativo", true).order("destaque", { ascending: false }).order("nome"),
        supabase.from("categorias").select("id,nome").eq("ativa", true).order("ordem"),
        supabase.from("produto_midias").select("id,produto_id,url,tipo,ordem").order("ordem"),
      ]);
      setProdutos((p ?? []) as Produto[]);
      setCats((c ?? []) as Categoria[]);
      const map: Record<string, Midia[]> = {};
      (m ?? []).forEach((x: any) => {
        (map[x.produto_id] ||= []).push({ id: x.id, url: x.url, tipo: x.tipo });
      });
      setMidias(map);
    })();
  }, []);

  const filtered = produtos.filter((p) =>
    (!busca || p.nome.toLowerCase().includes(busca.toLowerCase()))
    && (!catSel || p.categoria_id === catSel)
  );

  const totalItens = useMemo(() => cart.reduce((s, i) => s + i.quantidade, 0), [cart]);
  const totalValor = useMemo(() => cart.reduce((s, i) => s + i.quantidade * i.preco, 0), [cart]);
  const qtdNoCarrinho = (id: string) => cart.find((i) => i.id === id)?.quantidade ?? 0;

  function addAoCarrinho(p: Produto) {
    const vig = precoVigente(p);
    setCart((prev) => {
      const ex = prev.find((i) => i.id === p.id);
      if (ex) return prev.map((i) => (i.id === p.id ? { ...i, quantidade: i.quantidade + 1, preco: vig.preco } : i));
      return [...prev, { id: p.id, nome: p.nome, preco: vig.preco, quantidade: 1 }];
    });
  }

  function alterarQtd(id: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, quantidade: i.quantidade + delta } : i))
        .filter((i) => i.quantidade > 0)
    );
  }

  function removerItem(id: string) {
    setCart((prev) => prev.filter((i) => i.id !== id));
  }

  function perguntar(p: Produto) {
    const vig = precoVigente(p);
    const linha = vig.emPromocao
      ? `${brl(vig.preco)} (oferta! antes ${brl(vig.precoOriginal)})`
      : brl(vig.preco);
    const msg = `Olá! Tenho uma dúvida sobre *${p.nome}* — ${linha}.`;
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
  }

  function enviarPedido() {
    if (cart.length === 0) return;
    const msg = gerarTextoPedidoCatalogo({
      itens: cart.map((i) => ({ nome: i.nome, quantidade: i.quantidade, preco: i.preco })),
      total: totalValor,
      entrega,
      nome: nome.trim() || undefined,
      endereco: endereco.trim() || undefined,
      observacao: obs.trim() || undefined,
    });
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-gradient-brand text-white shadow-elevated">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <Logo size={40} />
          <div className="flex-1 min-w-0">
            <div className="font-bold leading-tight truncate">{STORE_NAME}</div>
            <div className="text-[11px] opacity-80">Catálogo digital</div>
          </div>

          <Sheet open={cartOpen} onOpenChange={setCartOpen}>
            <SheetTrigger asChild>
              <Button variant="secondary" className="relative shrink-0" aria-label="Abrir carrinho">
                <ShoppingCart className="h-5 w-5" />
                <span className="hidden sm:inline">Carrinho</span>
                {totalItens > 0 && (
                  <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 rounded-full bg-accent text-accent-foreground text-[11px] font-bold flex items-center justify-center">
                    {totalItens}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
              <SheetHeader className="p-4 border-b">
                <SheetTitle>Meu carrinho</SheetTitle>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {cart.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <ShoppingCart className="h-10 w-10 mx-auto opacity-40" />
                    <p className="mt-3 text-sm">Seu carrinho está vazio.</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      {cart.map((i) => (
                        <div key={i.id} className="flex items-center gap-3 border rounded-xl p-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm leading-tight">{i.nome}</div>
                            <div className="text-xs text-muted-foreground">{brl(i.preco)} cada</div>
                            <div className="text-sm font-bold text-primary">{brl(i.preco * i.quantidade)}</div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => alterarQtd(i.id, -1)} aria-label="Diminuir">
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-6 text-center text-sm font-semibold">{i.quantidade}</span>
                            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => alterarQtd(i.id, 1)} aria-label="Aumentar">
                              <Plus className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removerItem(i.id)} aria-label="Remover">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-3 pt-2">
                      <Label>Como prefere receber?</Label>
                      <RadioGroup value={entrega} onValueChange={(v) => setEntrega(v as "retirada" | "entrega")} className="grid grid-cols-2 gap-2">
                        <label className="flex items-center gap-2 border rounded-xl p-3 cursor-pointer">
                          <RadioGroupItem value="retirada" id="retirada" />
                          <span className="text-sm">Retirar na loja</span>
                        </label>
                        <label className="flex items-center gap-2 border rounded-xl p-3 cursor-pointer">
                          <RadioGroupItem value="entrega" id="entrega" />
                          <span className="text-sm">Entrega</span>
                        </label>
                      </RadioGroup>

                      <div className="space-y-1">
                        <Label htmlFor="cli-nome">Seu nome</Label>
                        <Input id="cli-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como devemos te chamar?" />
                      </div>

                      {entrega === "entrega" && (
                        <div className="space-y-1">
                          <Label htmlFor="cli-end">Endereço de entrega</Label>
                          <Textarea id="cli-end" value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Rua, número, bairro, referência" />
                        </div>
                      )}

                      <div className="space-y-1">
                        <Label htmlFor="cli-obs">Observações (opcional)</Label>
                        <Textarea id="cli-obs" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Alguma preferência?" />
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="border-t p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total do pedido</span>
                  <span className="text-2xl font-bold text-primary">{brl(totalValor)}</span>
                </div>
                <Button variant="hero" className="w-full h-12" disabled={cart.length === 0} onClick={enviarPedido}>
                  <MessageCircle className="h-4 w-4" /> Enviar pedido no WhatsApp
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <BannerSlider />

      <div className="max-w-7xl mx-auto px-4 py-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto…" className="pl-10 h-12" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => setCatSel(null)} className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${!catSel ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>Todos</button>
          {cats.map((c) => (
            <button key={c.id} onClick={() => setCatSel(c.id)} className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${catSel === c.id ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{c.nome}</button>
          ))}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 pb-28">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto opacity-40" />
            <p className="mt-3">Nenhum produto encontrado.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((p) => {
              const vig = precoVigente(p);
              const qtd = qtdNoCarrinho(p.id);
              const fmtDate = (s: string | null) => s ? new Date(s + "T00:00:00").toLocaleDateString("pt-BR") : "";
              return (
                <Card key={p.id} className="overflow-hidden bg-gradient-card hover:shadow-elevated transition-smooth rounded-2xl relative">
                  {vig.emPromocao && (
                    <div className="absolute top-3 left-3 z-10 px-3 py-1 rounded-full bg-accent text-accent-foreground text-xs font-bold shadow-lg">
                      🏷️ PROMOÇÃO
                    </div>
                  )}
                  <MediaCarousel midias={midias[p.id] ?? []} fallback={p.imagem_url} alt={p.nome} rounded="rounded-none" />
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold leading-tight">{p.nome}</h3>
                      {p.destaque && <Badge className="bg-accent text-accent-foreground shrink-0">Destaque</Badge>}
                    </div>
                    {p.descricao && <p className="text-sm text-muted-foreground line-clamp-2">{p.descricao}</p>}
                    {vig.emPromocao && (vig.inicio || vig.fim) && (
                      <p className="text-[11px] text-accent font-medium">
                        Oferta {vig.inicio ? `de ${fmtDate(vig.inicio)}` : ""} {vig.fim ? `até ${fmtDate(vig.fim)}` : ""}
                      </p>
                    )}
                    <div className="flex items-center justify-between pt-1">
                      <div>
                        {vig.emPromocao && (
                          <div className="text-sm text-muted-foreground line-through leading-none">{brl(vig.precoOriginal)}</div>
                        )}
                        <div className={"text-2xl font-bold " + (vig.emPromocao ? "text-accent" : "text-primary")}>{brl(vig.preco)}</div>
                      </div>
                      {qtd > 0 ? (
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => alterarQtd(p.id, -1)} aria-label="Diminuir quantidade">
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="w-7 text-center font-bold">{qtd}</span>
                          <Button size="icon" variant="hero" className="h-9 w-9" onClick={() => addAoCarrinho(p)} aria-label="Aumentar quantidade">
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button variant="hero" onClick={() => addAoCarrinho(p)}>
                          <ShoppingCart className="h-4 w-4" /> Adicionar
                        </Button>
                      )}
                    </div>
                    <button
                      onClick={() => perguntar(p)}
                      className="text-xs text-muted-foreground hover:text-primary underline underline-offset-2 inline-flex items-center gap-1"
                    >
                      <MessageCircle className="h-3 w-3" /> Perguntar sobre este produto
                    </button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {totalItens > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 p-3 bg-background/95 backdrop-blur border-t sm:hidden">
          <Button variant="hero" className="w-full h-12" onClick={() => setCartOpen(true)}>
            <ShoppingCart className="h-4 w-4" /> Ver carrinho ({totalItens}) — {brl(totalValor)}
          </Button>
        </div>
      )}
    </div>
  );
}
