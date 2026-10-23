import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Page } from "./api";
import type { Annee, Classe } from "./types";

export function useAnnees() {
  return useQuery({ queryKey: ["annees"], queryFn: async () => (await api<Page<Annee>>("/api/annees")).results });
}

export function useAnneeActive() {
  const { data, ...reste } = useAnnees();
  return { annee: data?.find((a) => a.active) ?? null, annees: data, ...reste };
}

export function useClasses(annee?: number | null) {
  return useQuery({
    queryKey: ["classes", annee],
    enabled: !!annee,
    queryFn: async () => (await api<Page<Classe>>("/api/classes?page_size=200")).results.filter((c) => c.annee === annee),
  });
}

/** Rafraîchit les données touchées par une opération (paiement, inscription…). */
export function useRafraichir() {
  const client = useQueryClient();
  return (...cles: string[]) => cles.forEach((c) => client.invalidateQueries({ queryKey: [c] }));
}

/** Numéro sénégalais → lien WhatsApp (221 ajouté si besoin). */
export function lienWhatsApp(telephone: string, message: string) {
  let n = telephone.replace(/\D/g, "");
  if (n.length === 9) n = `221${n}`;
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(message)}` : null;
}

export function usePeriodes(annee?: number | null) {
  return useQuery({
    queryKey: ["periodes", annee],
    enabled: !!annee,
    queryFn: async () => (await api<Page<import("./types").Periode>>(`/api/periodes?annee=${annee}`)).results,
  });
}

/** Période en cours (celle qui contient aujourd'hui), sinon la première. */
export function periodeCourante(periodes: import("./types").Periode[] | undefined) {
  const jour = new Date().toLocaleDateString("sv-SE");
  return periodes?.find((p) => p.debut <= jour && jour <= p.fin) ?? periodes?.[0] ?? null;
}

/** « 1er », « 2e »… */
export const rang = (r: number | null | undefined) => (r == null ? "—" : r === 1 ? "1er" : `${r}e`);

export const note = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("fr-FR", { maximumFractionDigits: 2 }));
