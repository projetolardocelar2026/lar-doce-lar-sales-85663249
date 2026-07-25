import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { brl, WHATSAPP_NUMBER, STORE_NAME } from "@/lib/format";
import { precoVigente } from "@/lib/preco";
import { Search, Package, MessageCircle } from "lucide-react";
import { BannerSlider } from "@/components/BannerSlider";
import { MediaCarousel, type Midia } from "@/components/MediaCarousel";

export const Route = createFileRoute("/catalogo")({
  component: CatalogoPage,
  head: () => ({
    meta: [
      { title: `${STORE_NAME} — Catálogo Digital` },
      { name: "description", content: "Confira as artes, vídeos e ofertas dos produtos da Lar Doce Lar." },
      { property: "og:title", content: `${STORE_NAME} — Catálogo Digital` },
      { property: "og:description", content: "Confira as artes, vídeos e ofertas dos produtos da Lar Doce Lar." },
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

function CatalogoPage() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [cats, setCats] = useState<Categoria[]>([]);
  const [midias, setMidias] = useState<Record<string, Midia[]>>({});
  const [busca, setBusca] = useState("");
  const [catSel, setCatSel] = useState<string | null>(null);

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

  function pedir(p: Produto) {
    const vig = precoVigente(p);
    const linha = vig.emPromocao
      ? `${brl(vig.preco)} (oferta! antes ${brl(vig.precoOriginal)})`
      : brl(vig.preco);
    const msg = `Olá! Tenho interesse em *${p.nome}* — ${linha}.`;
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-gradient-brand text-white shadow-elevated">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <Logo size={40} />
          <div>
            <div className="font-bold leading-tight">{STORE_NAME}</div>
            <div className="text-[11px] opacity-80">Catálogo digital</div>
          </div>
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

      <main className="max-w-7xl mx-auto px-4 pb-16">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto opacity-40" />
            <p className="mt-3">Nenhum produto encontrado.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((p) => {
              const vig = precoVigente(p);
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
                      <Button variant="hero" onClick={() => pedir(p)}>
                        <MessageCircle className="h-4 w-4" /> Pedir
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
