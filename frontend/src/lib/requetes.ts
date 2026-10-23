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
