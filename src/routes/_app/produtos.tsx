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
import { Plus, Pencil, Trash2, Package, Search, Upload, ImageOff, Video, Image as ImageIcon, X } from "lucide-react";
import { brl } from "@/lib/format";

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
};

function ProdutosPage() {
  const { isAdmin } = useAuth();
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
  const [uploadingMidia, setUploadingMidia] = useState(false);

  async function loadMidias(produtoId: string) {
    const { data } = await supabase
      .from("produto_midias")
      .select("id,url,tipo,ordem")
      .eq("produto_id", produtoId)
      .order("ordem");
    setMidias((data ?? []) as any);
  }

  async function addMidia(file: File, tipo: "foto"|"arte"|"video") {
    if (!editing) return toast.error("Salve o produto primeiro");
    if (file.size > 25 * 1024 * 1024) return toast.error("Arquivo muito grande (máx 25MB)");
    setUploadingMidia(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
      const path = `${editing.id}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("produtos").upload(path, file, { contentType: file.type });
      if (up.error) throw up.error;
      const { data: pub } = supabase.storage.from("produtos").getPublicUrl(path);
      const { error } = await supabase.from("produto_midias").insert({
        produto_id: editing.id, url: pub.publicUrl, tipo, ordem: midias.length,
      });
      if (error) throw error;
      toast.success("Mídia adicionada");
      loadMidias(editing.id);
    } catch (e: any) { toast.error(e.message); }
    finally { setUploadingMidia(false); if (midiaRef.current) midiaRef.current.value = ""; }
  }

  async function removeMidia(id: string) {
    if (!confirm("Remover esta mídia?")) return;
    await supabase.from("produto_midias").delete().eq("id", id);
    if (editing) loadMidias(editing.id);
  }


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
      };
      const { error } = editing
        ? await supabase.from("produtos").update(payload).eq("id", editing.id)
        : await supabase.from("produtos").insert(payload);
      if (error) throw error;
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

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Produtos" />
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          Acesso restrito ao administrador.
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
                        {baixo && <Badge variant="destructive">Estoque baixo</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {catNome(p.categoria_id)} · Estoque {p.estoque}
                      </div>
                    </div>
                    <div className="text-right hidden sm:block">
                      <div className="font-semibold text-primary">{brl(p.preco)}</div>
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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={save} variant="hero" disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
