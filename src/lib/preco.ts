// Promotional pricing helper. A promotion is active when today is within [promo_inicio, promo_fim]
// and preco_promocional is a positive number.
export type ProdutoPromo = {
  preco: number | string | null | undefined;
  preco_promocional?: number | string | null;
  promo_inicio?: string | null;
  promo_fim?: string | null;
};

export function precoVigente(p: ProdutoPromo): {
  preco: number;
  precoOriginal: number;
  emPromocao: boolean;
  inicio: string | null;
  fim: string | null;
} {
  const base = Number(p.preco ?? 0) || 0;
  const promo = p.preco_promocional != null ? Number(p.preco_promocional) : NaN;
  const hoje = new Date().toISOString().slice(0, 10);
  const ini = p.promo_inicio ?? null;
  const fim = p.promo_fim ?? null;
  const dentroIni = !ini || ini <= hoje;
  const dentroFim = !fim || fim >= hoje;
  const ativa = Number.isFinite(promo) && promo > 0 && promo < base && dentroIni && dentroFim;
  return {
    preco: ativa ? promo : base,
    precoOriginal: base,
    emPromocao: ativa,
    inicio: ini,
    fim: fim,
  };
}
