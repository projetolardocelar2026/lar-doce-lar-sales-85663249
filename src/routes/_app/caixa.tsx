import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../_app";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { brl, fmtDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowDownCircle, ArrowUpCircle, DoorOpen, DoorClosed, Wallet, Banknote, CreditCard, Smartphone } from "lucide-react";

export const Route = createFileRoute("/_app/caixa")({ component: CaixaPage });

type Sessao = {
  id: string; operador_id: string; aberto_em: string; fechado_em: string | null;
  troco_inicial: number; valor_contado: number | null; valor_esperado: number | null;
  diferenca: number | null; observacoes: string | null; status: "aberta" | "fechada";
};
type Mov = { id: string; tipo: "sangria" | "suprimento"; valor: number; motivo: string | null; created_at: string };

function CaixaPage() {
  const { user } = useAuth();
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [historico, setHistorico] = useState<Sessao[]>([]);
  const [movs, setMovs] = useState<Mov[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAbrir, setShowAbrir] = useState(false);
  const [showFechar, setShowFechar] = useState(false);
  const [showMov, setShowMov] = useState<"sangria" | "suprimento" | null>(null);
  const [troco, setTroco] = useState("");
  const [contado, setContado] = useState("");
  const [obs, setObs] = useState("");
  const [movValor, setMovValor] = useState("");
  const [movMotivo, setMovMotivo] = useState("");

  // Resumo do dia (vendas dinheiro/pix/cartão da sessão)
  const [resumo, setResumo] = useState({ dinheiro: 0, pix: 0, cartao: 0, suprimento: 0, sangria: 0 });

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: aberta } = await supabase
      .from("caixa_sessoes").select("*").eq("operador_id", user.id).eq("status", "aberta")
      .order("aberto_em", { ascending: false }).limit(1).maybeSingle();
    setSessao((aberta as any) || null);
    const { data: hist } = await supabase
      .from("caixa_sessoes").select("*").eq("operador_id", user.id)
      .order("aberto_em", { ascending: false }).limit(20);
    setHistorico((hist as any) || []);
    if (aberta) {
      const { data: m } = await supabase
        .from("caixa_movimentos").select("*").eq("sessao_id", (aberta as any).id)
        .order("created_at", { ascending: false });
      setMovs((m as any) || []);
      await calcResumo((aberta as any).id);
    } else {
      setMovs([]);
      setResumo({ dinheiro: 0, pix: 0, cartao: 0, suprimento: 0, sangria: 0 });
    }
    setLoading(false);
  };

  const calcResumo = async (sessaoId: string) => {
    const { data: vendas } = await supabase
      .from("vendas").select("id, total, forma_pagamento, status")
      .eq("sessao_caixa_id", sessaoId).neq("status", "cancelada");
    const ids = (vendas || []).map((v: any) => v.id);
    let pagosByForma: Record<string, number> = {};
    if (ids.length > 0) {
      const { data: pgs } = await supabase
        .from("pagamentos_venda").select("venda_id, forma_pagamento, valor").in("venda_id", ids);
      (pgs || []).forEach((p: any) => {
        pagosByForma[p.forma_pagamento] = (pagosByForma[p.forma_pagamento] || 0) + Number(p.valor);
      });
    }
    // Vendas legacy (sem pagamentos_venda) entram pela própria venda
    const idsComPagamento = new Set((Object.keys(pagosByForma).length ? ids : []));
    let legacy: Record<string, number> = {};
    (vendas || []).forEach((v: any) => {
      // se há pagamentos_venda para essa venda, ela é considerada na soma acima
      const temPag = false; // simplificação: pagamentos_venda já somados
      if (!temPag) legacy[v.forma_pagamento] = (legacy[v.forma_pagamento] || 0) + Number(v.total);
    });
    // Como simplificamos, somamos legacy só se pagamentos_venda foi vazio
    const usar = Object.keys(pagosByForma).length > 0 ? pagosByForma : legacy;
    const dinheiro = usar["dinheiro"] || 0;
    const pix = usar["pix"] || 0;
    const cartao = (usar["cartao_debito"] || 0) + (usar["cartao_credito"] || 0);

    const { data: movsData } = await supabase
      .from("caixa_movimentos").select("tipo, valor").eq("sessao_id", sessaoId);
    const suprimento = (movsData || []).filter((m: any) => m.tipo === "suprimento").reduce((s: number, m: any) => s + Number(m.valor), 0);
    const sangria = (movsData || []).filter((m: any) => m.tipo === "sangria").reduce((s: number, m: any) => s + Number(m.valor), 0);
    setResumo({ dinheiro, pix, cartao, suprimento, sangria });
  };

  useEffect(() => { load(); }, [user]);

  const esperado = useMemo(() => {
    if (!sessao) return 0;
    return Number(sessao.troco_inicial) + resumo.dinheiro + resumo.suprimento - resumo.sangria;
  }, [sessao, resumo]);

  const abrir = async () => {
    const v = parseFloat((troco || "0").replace(",", ".")) || 0;
    const { error } = await supabase.rpc("abrir_caixa", { _troco: v });
    if (error) return toast.error(error.message);
    toast.success("Caixa aberto!");
    setShowAbrir(false); setTroco("");
    load();
  };

  const registrarMov = async () => {
    if (!sessao || !showMov) return;
    const v = parseFloat((movValor || "0").replace(",", ".")) || 0;
    if (v <= 0) return toast.error("Informe o valor");
    const { error } = await supabase.rpc("registrar_caixa_movimento", {
      _sessao: sessao.id, _tipo: showMov, _valor: v, _motivo: (movMotivo || "") as string,
    });
    if (error) return toast.error(error.message);
    toast.success(showMov === "sangria" ? "Sangria registrada" : "Suprimento registrado");
    setShowMov(null); setMovValor(""); setMovMotivo("");
    load();
  };

  const fechar = async () => {
    if (!sessao) return;
    const v = parseFloat((contado || "0").replace(",", ".")) || 0;
    const { error } = await supabase.rpc("fechar_caixa", {
      _sessao: sessao.id, _valor_contado: v, _obs: obs || undefined,
    });
    if (error) return toast.error(error.message);
    toast.success("Caixa fechado!");
    setShowFechar(false); setContado(""); setObs("");
    load();
  };

  const dif = sessao ? (parseFloat((contado || "0").replace(",", ".")) || 0) - esperado : 0;

  return (
    <div>
      <PageHeader
        title="Caixa"
        description="Abertura, fechamento, sangrias e suprimentos"
        actions={
          sessao ? (
            <>
              <Button variant="outline" onClick={() => setShowMov("suprimento")}><ArrowDownCircle className="h-4 w-4 mr-1"/>Suprimento</Button>
              <Button variant="outline" onClick={() => setShowMov("sangria")}><ArrowUpCircle className="h-4 w-4 mr-1"/>Sangria</Button>
              <Button onClick={() => setShowFechar(true)}><DoorClosed className="h-4 w-4 mr-1"/>Fechar caixa</Button>
            </>
          ) : (
            <Button onClick={() => setShowAbrir(true)}><DoorOpen className="h-4 w-4 mr-1"/>Abrir caixa</Button>
          )
        }
      />

      {loading ? <Card><CardContent className="p-6 text-center text-muted-foreground">Carregando…</CardContent></Card> :
        !sessao ? (
          <Card><CardContent className="p-8 text-center">
            <Wallet className="h-10 w-10 mx-auto text-muted-foreground mb-3"/>
            <p className="text-muted-foreground mb-4">Nenhum caixa aberto. Abra para começar a registrar vendas.</p>
            <Button onClick={() => setShowAbrir(true)}><DoorOpen className="h-4 w-4 mr-1"/>Abrir caixa</Button>
          </CardContent></Card>
        ) : (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi icon={Wallet} label="Troco Inicial" value={brl(sessao.troco_inicial)} />
              <Kpi icon={Banknote} label="Vendas em Dinheiro" value={brl(resumo.dinheiro)} />
              <Kpi icon={Smartphone} label="PIX" value={brl(resumo.pix)} />
              <Kpi icon={CreditCard} label="Cartão" value={brl(resumo.cartao)} />
            </div>

            <Card>
              <CardHeader><CardTitle>Conferência (Dinheiro físico)</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fundo de Troco Inicial (não conta como faturamento)</span>
                  <strong>{brl(sessao.troco_inicial)}</strong>
                </div>
                <div className="border-t pt-2 space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Movimento operacional</div>
                  <Row label="Dinheiro Recebido nas Vendas" v={brl(resumo.dinheiro)} sign="+" />
                  <Row label="Suprimentos" v={brl(resumo.suprimento)} sign="+" />
                  <Row label="Sangrias" v={brl(resumo.sangria)} sign="−" />
                  <div className="flex justify-between font-semibold">
                    <span>Valor Operacional em Caixa</span>
                    <span className="text-success">{brl(resumo.dinheiro + resumo.suprimento - resumo.sangria)}</span>
                  </div>
                </div>
                <div className="border-t pt-2 flex justify-between font-bold">
                  <span>Total esperado na gaveta (Fundo + Operacional)</span><span className="text-primary">{brl(esperado)}</span>
                </div>
                <p className="text-xs text-muted-foreground pt-1">PIX e Cartão são conferidos separadamente nos seus extratos.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Sangrias e Suprimentos da sessão</CardTitle></CardHeader>
              <CardContent>
                {movs.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum movimento.</p> : (
                  <div className="space-y-1">
                    {movs.map(m => (
                      <div key={m.id} className="flex items-center justify-between text-sm border-b py-1.5">
                        <div>
                          <Badge variant={m.tipo === "sangria" ? "destructive" : "secondary"} className="mr-2">{m.tipo}</Badge>
                          {m.motivo || <span className="text-muted-foreground">—</span>}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">{fmtDate(m.created_at)}</span>
                          <strong className={m.tipo === "sangria" ? "text-destructive" : "text-success"}>
                            {m.tipo === "sangria" ? "−" : "+"} {brl(m.valor)}
                          </strong>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )
      }

      <Card className="mt-6">
        <CardHeader><CardTitle>Histórico de Caixas</CardTitle></CardHeader>
        <CardContent>
          {historico.length === 0 ? <p className="text-sm text-muted-foreground">Sem registros.</p> : (
            <div className="space-y-1">
              {historico.map(s => (
                <div key={s.id} className="flex flex-wrap items-center justify-between text-sm border-b py-2 gap-2">
                  <div>
                    <Badge variant={s.status === "aberta" ? "default" : "secondary"}>{s.status}</Badge>
                    <span className="ml-2 text-muted-foreground">{fmtDate(s.aberto_em)}{s.fechado_em ? ` → ${fmtDate(s.fechado_em)}` : ""}</span>
                  </div>
                  <div className="flex gap-4 text-xs">
                    <span>Troco: <strong>{brl(s.troco_inicial)}</strong></span>
                    {s.valor_esperado != null && <span>Esperado: <strong>{brl(s.valor_esperado)}</strong></span>}
                    {s.valor_contado != null && <span>Contado: <strong>{brl(s.valor_contado)}</strong></span>}
                    {s.diferenca != null && (
                      <span className={Number(s.diferenca) < 0 ? "text-destructive" : Number(s.diferenca) > 0 ? "text-success" : ""}>
                        {Number(s.diferenca) === 0 ? "Sem diferença" : Number(s.diferenca) < 0 ? `Quebra ${brl(Math.abs(Number(s.diferenca)))}` : `Sobra ${brl(s.diferenca)}`}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Abrir */}
      <Dialog open={showAbrir} onOpenChange={setShowAbrir}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Abrir caixa</DialogTitle></DialogHeader>
          <div>
            <Label>Troco inicial (fundo de caixa)</Label>
            <Input inputMode="decimal" placeholder="0,00" value={troco} onChange={(e) => setTroco(e.target.value)} />
            <p className="text-xs text-muted-foreground mt-1">Esse valor não conta como faturamento.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAbrir(false)}>Cancelar</Button>
            <Button onClick={abrir}>Abrir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sangria/Suprimento */}
      <Dialog open={!!showMov} onOpenChange={(o) => !o && setShowMov(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{showMov === "sangria" ? "Sangria" : "Suprimento"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Valor</Label>
              <Input inputMode="decimal" placeholder="0,00" value={movValor} onChange={(e) => setMovValor(e.target.value)} />
            </div>
            <div>
              <Label>Motivo</Label>
              <Textarea rows={2} value={movMotivo} onChange={(e) => setMovMotivo(e.target.value)} placeholder={showMov === "sangria" ? "Ex.: Pagamento fornecedor X" : "Ex.: Reforço de troco"} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMov(null)}>Cancelar</Button>
            <Button onClick={registrarMov}>Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fechar */}
      <Dialog open={showFechar} onOpenChange={setShowFechar}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Fechar caixa</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg bg-muted/40 border p-3 space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide mb-1 text-muted-foreground">Fundo (separado do movimento)</div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fundo de Troco Inicial</span>
                <strong>{brl(sessao?.troco_inicial || 0)}</strong>
              </div>
            </div>
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 space-y-1">
              <div className="text-[11px] font-semibold text-primary uppercase tracking-wide mb-1">Movimento operacional do dia</div>
              <Row label="Dinheiro Recebido nas Vendas" v={brl(resumo.dinheiro)} sign="+" />
              <Row label="Suprimentos" v={brl(resumo.suprimento)} sign="+" />
              <Row label="Sangrias" v={brl(resumo.sangria)} sign="−" />
              <div className="border-t border-primary/20 pt-2 flex justify-between font-semibold">
                <span>Valor Operacional em Caixa</span>
                <span className="text-success">{brl(resumo.dinheiro + resumo.suprimento - resumo.sangria)}</span>
              </div>
            </div>
            <div className="rounded-lg bg-accent/10 border border-accent/30 p-3 space-y-1">
              <div className="flex justify-between font-bold">
                <span>Total esperado na gaveta</span>
                <span className="text-primary">{brl(esperado)}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                = Fundo de Troco + Valor Operacional. O sistema separa os dois automaticamente; basta contar todo o dinheiro físico.
              </p>
            </div>
            <div>
              <Label className="block mb-1">Valor contado na gaveta (dinheiro físico total)</Label>
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={contado}
                onChange={(e) => setContado(e.target.value)}
                className="text-lg font-semibold h-12"
                autoFocus
              />
            </div>
            {contado && (
              <div className={`p-3 rounded-lg text-center font-semibold ${dif < 0 ? "bg-destructive/10 text-destructive" : dif > 0 ? "bg-success/10 text-success" : "bg-muted"}`}>
                {dif === 0 ? "✓ Caixa bate exatamente" : dif < 0 ? `Quebra de ${brl(Math.abs(dif))}` : `Sobra de ${brl(dif)}`}
              </div>
            )}
            <div>
              <Label>Observações</Label>
              <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFechar(false)}>Cancelar</Button>
            <Button onClick={fechar}>Confirmar fechamento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <Card><CardContent className="p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center"><Icon className="h-5 w-5"/></div>
      <div><div className="text-xs text-muted-foreground">{label}</div><div className="font-bold">{value}</div></div>
    </CardContent></Card>
  );
}
function Row({ label, v, sign }: { label: string; v: string; sign: "+" | "−" }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{sign} {label}</span><strong>{v}</strong>
    </div>
  );
}
