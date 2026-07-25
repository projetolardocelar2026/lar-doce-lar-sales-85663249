import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "../_app";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Package, Search, Upload, ImageOff, Video, Image as ImageIcon, X, Star, ArrowLeft, ArrowRight, Eye } from "lucide-react";
import { brl } from "@/lib/format";
import { precoVigente } from "@/lib/preco";

export const Route = createFileRoute("/_app/produtos")({
  component: ProdutosPage,
});

type Categoria = { id: string; nome: string };
type Produto = {
  id: string;
  nome: string;
  descricao: string | null;
  preco: number;
  preco_custo: number | null;
  estoque: number;
  estoque_minimo: number | null;
  categoria_id: string | null;
  imagem_url: string | null;
  codigo_barras: string | null;
  destaque: boolean;
  ativo: boolean;
  preco_promocional: number | null;
  promo_inicio: string | null;
  promo_fim: string | null;
};

const empty = {
  nome: "",
  descricao: "",
  preco: "",
  preco_custo: "",
  estoque: "",
  estoque_minimo: "",
  categoria_id: "",
  codigo_barras: "",
  destaque: false,
  ativo: true,
  preco_promocional: "",
  promo_inicio: "",
  promo_fim: "",
};

function ProdutosPage() {
  const { isStaff } = useAuth();
  const [items, setItems] = useState<Produto[]>([]);
  const [cats, setCats] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroCat, setFiltroCat] = useState<string>("todas");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Produto | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const midiaRef = useRef<HTMLInputElement>(null);
  const [midias, setMidias] = useState<{ id: string; url: string; tipo: "foto"|"arte"|"video"; ordem: number }[]>([]);
  const [pendingMidias, setPendingMidias] = useState<{ id: string; file: File; preview: string; tipo: "foto"|"arte"|"video" }[]>([]);
  const [uploadingMidia, setUploadingMidia] = useState(false);

  async function loadMidias(produtoId: string) {
    const { data } = await supabase
      .from("produto_midias")
      .select("id,url,tipo,ordem")
      .eq("produto_id", produtoId)
      .order("ordem");
    setMidias((data ?? []) as any);
  }

  async function uploadMidia(produtoId: string, file: File, tipo: "foto"|"arte"|"video", ordem: number) {
    if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name}: arquivo muito grande (máx 25MB)`);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const path = `${produtoId}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from("produtos").upload(path, file, { contentType: file.type });
    if (up.error) throw up.error;
    const { data: pub } = supabase.storage.from("produtos").getPublicUrl(path);
    const { error } = await supabase.from("produto_midias").insert({
      produto_id: produtoId, url: pub.publicUrl, tipo, ordem,
    });
    if (error) throw error;
    return pub.publicUrl;
  }

  async function addMidias(files: FileList | File[], tipo: "foto"|"arte"|"video") {
    const list = Array.from(files);
    if (list.length === 0) return;
    const oversized = list.find((file) => file.size > 25 * 1024 * 1024);
    if (oversized) return toast.error(`${oversized.name}: arquivo muito grande (máx 25MB)`);
    if (!editing) {
      setPendingMidias((cur) => [
        ...cur,
        ...list.map((file) => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file), tipo })),
      ]);
      toast.success(list.length > 1 ? `${list.length} mídias prontas para salvar` : "Mídia pronta para salvar");
      return;
    }
    setUploadingMidia(true);
    try {
      await Promise.all(list.map((file, index) => uploadMidia(editing.id, file, tipo, midias.length + index)));
      toast.success(list.length > 1 ? `${list.length} mídias adicionadas` : "Mídia adicionada");
      loadMidias(editing.id);
    } catch (e: any) { toast.error(e.message); }
    finally { setUploadingMidia(false); if (midiaRef.current) midiaRef.current.value = ""; }
  }

  function removePendingMidia(id: string) {
    setPendingMidias((cur) => {
      const item = cur.find((m) => m.id === id);
      if (item) URL.revokeObjectURL(item.preview);
      return cur.filter((m) => m.id !== id);
    });
  }

  async function removeMidia(id: string) {
    if (!confirm("Remover esta mídia?")) return;
    await supabase.from("produto_midias").delete().eq("id", id);
    if (editing) loadMidias(editing.id);
  }

  async function definirComoPrincipal(url: string) {
    if (!editing) return;
    const { error } = await supabase.from("produtos").update({ imagem_url: url }).eq("id", editing.id);
    if (error) return toast.error(error.message);
    setImgPreview(url);
    setEditing({ ...editing, imagem_url: url });
    toast.success("Foto principal definida");
    load();
  }

  async function moverMidia(id: string, dir: -1 | 1) {
    const idx = midias.findIndex((m) => m.id === id);
    const novo = idx + dir;
    if (idx < 0 || novo < 0 || novo >= midias.length) return;
    const a = midias[idx], b = midias[novo];
    await Promise.all([
      supabase.from("produto_midias").update({ ordem: b.ordem }).eq("id", a.id),
      supabase.from("produto_midias").update({ ordem: a.ordem }).eq("id", b.id),
    ]);
    if (editing) loadMidias(editing.id);
  }

  const [lightbox, setLightbox] = useState<string | null>(null);


  async function load() {
    setLoading(true);
    const [p, c] = await Promise.all([
      supabase.from("produtos").select("*").order("nome"),
      supabase.from("categorias").select("id,nome").order("ordem").order("nome"),
    ]);
    if (p.error) toast.error(p.error.message);
    setItems(p.data ?? []);
    setCats(c.data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return items.filter((p) => {
      if (filtroCat !== "todas" && p.categoria_id !== filtroCat) return false;
      if (busca && !p.nome.toLowerCase().includes(busca.toLowerCase())
          && !(p.codigo_barras ?? "").includes(busca)) return false;
      return true;
    });
  }, [items, busca, filtroCat]);

  function reset() {
    setEditing(null);
    setForm({ ...empty });
    setImgFile(null);
    setImgPreview(null);
    setMidias([]);
    pendingMidias.forEach((m) => URL.revokeObjectURL(m.preview));
    setPendingMidias([]);
    if (fileRef.current) fileRef.current.value = "";
  }
  function openNew() { reset(); setOpen(true); }
  function openEdit(p: Produto) {
    setEditing(p);
    setForm({
      nome: p.nome,
      descricao: p.descricao ?? "",
      preco: String(p.preco ?? ""),
      preco_custo: p.preco_custo != null ? String(p.preco_custo) : "",
      estoque: String(p.estoque ?? ""),
      estoque_minimo: p.estoque_minimo != null ? String(p.estoque_minimo) : "",
      categoria_id: p.categoria_id ?? "",
      codigo_barras: p.codigo_barras ?? "",
      destaque: p.destaque,
      ativo: p.ativo,
      preco_promocional: p.preco_promocional != null ? String(p.preco_promocional) : "",
      promo_inicio: p.promo_inicio ?? "",
      promo_fim: p.promo_fim ?? "",
    });
    setImgFile(null);
    setImgPreview(p.imagem_url);
    loadMidias(p.id);
    setOpen(true);
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) return toast.error("Imagem deve ter até 5MB");
    setImgFile(f);
    setImgPreview(URL.createObjectURL(f));
  }

  async function uploadImage(): Promise<string | null> {
    if (!imgFile) return editing?.imagem_url ?? null;
    const ext = imgFile.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("produtos").upload(path, imgFile, {
      cacheControl: "3600", upsert: false, contentType: imgFile.type,
    });
    if (error) { toast.error("Falha no upload: " + error.message); return null; }
    const { data } = supabase.storage.from("produtos").getPublicUrl(path);
    return data.publicUrl;
  }

  async function save() {
    if (!form.nome.trim()) return toast.error("Informe o nome");
    const preco = parseFloat(form.preco.replace(",", "."));
    if (isNaN(preco) || preco < 0) return toast.error("Preço inválido");
    setSaving(true);
    try {
      const imagem_url = await uploadImage();
      const promoVal = form.preco_promocional ? parseFloat(form.preco_promocional.replace(",", ".")) : null;
      const payload = {
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
        preco,
        preco_custo: form.preco_custo ? parseFloat(form.preco_custo.replace(",", ".")) : null,
        estoque: parseInt(form.estoque) || 0,
        estoque_minimo: form.estoque_minimo ? parseInt(form.estoque_minimo) : 0,
        categoria_id: form.categoria_id || null,
        codigo_barras: form.codigo_barras.trim() || null,
        destaque: form.destaque,
        ativo: form.ativo,
        imagem_url,
        preco_promocional: promoVal && promoVal > 0 ? promoVal : null,
        promo_inicio: form.promo_inicio || null,
        promo_fim: form.promo_fim || null,
      };
      let produtoId = editing?.id ?? null;
      if (editing) {
        const { error } = await supabase.from("produtos").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("produtos").insert(payload).select("id,imagem_url").single();
        if (error || !data) throw error ?? new Error("Falha ao criar produto");
        produtoId = data.id;
      }
      if (produtoId && pendingMidias.length > 0) {
        setUploadingMidia(true);
        const urls = await Promise.all(
          pendingMidias.map((m, index) => uploadMidia(produtoId, m.file, m.tipo, index)),
        );
        const primeiraFoto = urls[pendingMidias.findIndex((m) => m.tipo !== "video")];
        if (!imagem_url && primeiraFoto) {
          await supabase.from("produtos").update({ imagem_url: primeiraFoto }).eq("id", produtoId);
        }
      }
      toast.success(editing ? "Produto atualizado" : "Produto criado");
      setOpen(false);
      reset();
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: Produto) {
    if (!confirm(`Excluir "${p.nome}"? Vendas anteriores serão preservadas.`)) return;
    const { error } = await supabase.from("produtos").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Produto excluído");
    load();
  }

  if (!isStaff) {
    return (
      <div>
        <PageHeader title="Produtos" />
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          Acesso restrito à equipe autorizada.
        </CardContent></Card>
      </div>
    );
  }

  const catNome = (id: string | null) => cats.find((c) => c.id === id)?.nome ?? "Sem categoria";

  return (
    <div>
      <PageHeader
        title="Produtos"
        description="Cadastro, estoque e imagens"
        actions={
          <Button onClick={openNew} variant="hero"><Plus className="h-4 w-4" /> Novo produto</Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="p-3 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou código de barras"
              className="pl-9"
            />
          </div>
          <Select value={filtroCat} onValueChange={setFiltroCat}>
            <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as categorias</SelectItem>
              {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-2 opacity-40" />
              Nenhum produto encontrado.
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((p) => {
                const baixo = p.estoque <= (p.estoque_minimo ?? 0);
                const vig = precoVigente(p);
                return (
                  <div key={p.id} className="flex items-center gap-3 p-3 sm:p-4 hover:bg-muted/40 transition-colors">
                    <div className="h-14 w-14 rounded-lg bg-muted overflow-hidden flex items-center justify-center shrink-0">
                      {p.imagem_url ? (
                        <img src={p.imagem_url} alt={p.nome} className="h-full w-full object-cover" />
                      ) : (
                        <ImageOff className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{p.nome}</span>
                        {!p.ativo && <Badge variant="secondary">Inativo</Badge>}
                        {p.destaque && <Badge>Destaque</Badge>}
                        {vig.emPromocao && <Badge className="bg-accent text-accent-foreground">PROMOÇÃO</Badge>}
                        {baixo && <Badge variant="destructive">Estoque baixo</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {catNome(p.categoria_id)} · Estoque {p.estoque}
                      </div>
                    </div>
                    <div className="text-right hidden sm:block">
                      {vig.emPromocao ? (
                        <>
                          <div className="text-xs text-muted-foreground line-through">{brl(vig.precoOriginal)}</div>
                          <div className="font-semibold text-accent">{brl(vig.preco)}</div>
                        </>
                      ) : (
                        <div className="font-semibold text-primary">{brl(p.preco)}</div>
                      )}
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => openEdit(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(p)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar produto" : "Novo produto"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <div className="w-full sm:w-40 shrink-0">
                <div className="aspect-square w-full rounded-lg bg-muted overflow-hidden flex items-center justify-center border">
                  {imgPreview ? (
                    <img src={imgPreview} alt="preview" className="h-full w-full object-cover" />
                  ) : (
                    <ImageOff className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onPickFile}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full mt-2"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="h-4 w-4" /> {imgPreview ? "Trocar imagem" : "Enviar imagem"}
                </Button>
              </div>

              <div className="flex-1 w-full space-y-3">
                <div>
                  <Label>Nome *</Label>
                  <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                </div>
                <div>
                  <Label>Categoria</Label>
                  <Select
                    value={form.categoria_id || "none"}
                    onValueChange={(v) => setForm({ ...form, categoria_id: v === "none" ? "" : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem categoria</SelectItem>
                      {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Descrição</Label>
                  <Textarea
                    rows={2}
                    value={form.descricao}
                    onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <Label>Preço venda *</Label>
                <Input
                  inputMode="decimal"
                  value={form.preco}
                  onChange={(e) => setForm({ ...form, preco: e.target.value })}
                  placeholder="0,00"
                />
              </div>
              <div>
                <Label>Preço custo</Label>
                <Input
                  inputMode="decimal"
                  value={form.preco_custo}
                  onChange={(e) => setForm({ ...form, preco_custo: e.target.value })}
                  placeholder="0,00"
                />
              </div>
              <div>
                <Label>Estoque</Label>
                <Input
                  type="number"
                  value={form.estoque}
                  onChange={(e) => setForm({ ...form, estoque: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div>
                <Label>Estoque mín.</Label>
                <Input
                  type="number"
                  value={form.estoque_minimo}
                  onChange={(e) => setForm({ ...form, estoque_minimo: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <Label>Código de barras</Label>
              <Input
                value={form.codigo_barras}
                onChange={(e) => setForm({ ...form, codigo_barras: e.target.value })}
                placeholder="Opcional"
              />
            </div>

            <div className="rounded-xl border-2 border-accent/30 p-3 space-y-3 bg-accent/5">
              <div>
                <div className="font-semibold text-sm flex items-center gap-2">🏷️ Promoção (opcional)</div>
                <div className="text-xs text-muted-foreground">
                  Quando preenchida, o preço promocional é usado automaticamente dentro do período definido. Fora do período, volta ao preço normal.
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label>Preço promocional</Label>
                  <Input
                    inputMode="decimal"
                    value={form.preco_promocional}
                    onChange={(e) => setForm({ ...form, preco_promocional: e.target.value })}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <Label>Início</Label>
                  <Input
                    type="date"
                    value={form.promo_inicio}
                    onChange={(e) => setForm({ ...form, promo_inicio: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Término</Label>
                  <Input
                    type="date"
                    value={form.promo_fim}
                    onChange={(e) => setForm({ ...form, promo_fim: e.target.value })}
                  />
                </div>
              </div>
              {form.preco_promocional && form.preco && (
                <div className="text-xs text-muted-foreground">
                  Economia: <strong className="text-success">
                    {brl(Math.max(0, parseFloat(form.preco.replace(",", ".") || "0") - parseFloat(form.preco_promocional.replace(",", ".") || "0")))}
                  </strong>
                  {form.promo_inicio && form.promo_fim && ` · de ${form.promo_inicio} até ${form.promo_fim}`}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="font-medium text-sm">Ativo</div>
                  <div className="text-xs text-muted-foreground">Disponível para venda</div>
                </div>
                <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="font-medium text-sm">Destaque</div>
                  <div className="text-xs text-muted-foreground">Aparece na vitrine</div>
                </div>
                <Switch checked={form.destaque} onCheckedChange={(v) => setForm({ ...form, destaque: v })} />
              </div>
            </div>

            {/* Vitrine interativa: galeria de mídias */}
            <div className="rounded-xl border-2 border-primary/20 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm">Vitrine interativa</div>
                  <div className="text-xs text-muted-foreground">Fotos, artes e vídeos exibidos no carrossel do cliente</div>
                </div>
              </div>
              {!editing ? (
                <div className="text-xs text-muted-foreground">Salve o produto primeiro para enviar mídias.</div>
              ) : (
                <>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {midias.map((m, i) => {
                      const isPrincipal = editing?.imagem_url === m.url;
                      return (
                        <div key={m.id} className={`relative aspect-square rounded-lg overflow-hidden border-2 bg-muted group ${isPrincipal ? "border-primary ring-2 ring-primary/30" : "border-transparent"}`}>
                          {m.tipo === "video" ? (
                            <video src={m.url} className="w-full h-full object-cover" muted />
                          ) : (
                            <img src={m.url} alt="" className="w-full h-full object-cover" />
                          )}
                          <span className="absolute top-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                            {m.tipo}
                          </span>
                          {isPrincipal && (
                            <span className="absolute bottom-1 left-1 text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded flex items-center gap-1">
                              <Star className="h-2.5 w-2.5 fill-current" /> Principal
                            </span>
                          )}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-wrap items-center justify-center gap-1 p-1">
                            <button type="button" title="Ampliar" onClick={() => setLightbox(m.url)}
                              className="h-7 w-7 rounded-full bg-white/90 text-foreground flex items-center justify-center">
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            {m.tipo !== "video" && !isPrincipal && (
                              <button type="button" title="Definir como principal" onClick={() => definirComoPrincipal(m.url)}
                                className="h-7 w-7 rounded-full bg-white/90 text-primary flex items-center justify-center">
                                <Star className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button type="button" title="Mover para esquerda" disabled={i === 0} onClick={() => moverMidia(m.id, -1)}
                              className="h-7 w-7 rounded-full bg-white/90 text-foreground flex items-center justify-center disabled:opacity-30">
                              <ArrowLeft className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" title="Mover para direita" disabled={i === midias.length - 1} onClick={() => moverMidia(m.id, 1)}
                              className="h-7 w-7 rounded-full bg-white/90 text-foreground flex items-center justify-center disabled:opacity-30">
                              <ArrowRight className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" title="Remover" onClick={() => removeMidia(m.id)}
                              className="h-7 w-7 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {midias.length === 0 && (
                      <div className="col-span-full text-xs text-muted-foreground text-center py-4">
                        Nenhuma mídia adicionada ainda.
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Passe o mouse sobre uma mídia para ampliar, definir como principal, reordenar ou remover.
                  </p>
                  <input
                    ref={midiaRef} type="file" hidden
                    accept="image/*,video/mp4,video/webm,video/quicktime"
                    onChange={(e) => {
                      const f = e.target.files?.[0]; if (!f) return;
                      const tipo: "foto"|"video" = f.type.startsWith("video/") ? "video" : "foto";
                      addMidia(f, tipo);
                    }}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={uploadingMidia}
                      onClick={() => { if (midiaRef.current) { midiaRef.current.accept = "image/*"; midiaRef.current.click(); } }}>
                      <ImageIcon className="h-4 w-4" /> Foto
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={uploadingMidia}
                      onClick={() => {
                        const inp = document.createElement("input");
                        inp.type = "file"; inp.accept = "image/*";
                        inp.onchange = () => { const f = inp.files?.[0]; if (f) addMidia(f, "arte"); };
                        inp.click();
                      }}>
                      <Upload className="h-4 w-4" /> Arte com preço
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={uploadingMidia}
                      onClick={() => {
                        const inp = document.createElement("input");
                        inp.type = "file"; inp.accept = "video/mp4,video/webm,video/quicktime";
                        inp.onchange = () => { const f = inp.files?.[0]; if (f) addMidia(f, "video"); };
                        inp.click();
                      }}>
                      <Video className="h-4 w-4" /> Vídeo
                    </Button>
                    {uploadingMidia && <span className="text-xs text-muted-foreground self-center">Enviando…</span>}
                  </div>
                </>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={save} variant="hero" disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-3xl p-2 bg-black/95 border-0">
          {lightbox && (
            lightbox.match(/\.(mp4|webm|mov)$/i)
              ? <video src={lightbox} controls autoPlay className="w-full max-h-[80vh] rounded" />
              : <img src={lightbox} alt="" className="w-full max-h-[80vh] object-contain rounded" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
