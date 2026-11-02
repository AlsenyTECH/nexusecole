import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FlaskConical, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, messageErreur, post } from "@/lib/api";
import { fcfa } from "@/lib/format";

const COULEURS: Record<string, string> = { Wave: "#1dc4ff", "Orange Money": "#ff7900", "Free Money": "#cd1719" };

/**
 * Page jouant le rôle de l'opérateur (Wave, Orange Money…) en démonstration.
 * Les vrais opérateurs affichent leur propre page de paiement ; celle-ci n'existe que si
 * le mode simulation est activé sur le serveur.
 */
export function PaiementSimule() {
  const { reference } = useParams();
  const [params] = useSearchParams();
  const naviguer = useNavigate();
  const [envoi, setEnvoi] = useState(false);
  const { data, isError } = useQuery({
    queryKey: ["simulateur", reference], retry: false,
    queryFn: () => api<{ montant: number; operateur: string; statut: string; ecole: string; eleve: string }>(`/api/paiements-mobiles/simulateur/${reference}`),
  });
  const retour = params.get("retour") || "/";

  async function repondre(succes: boolean) {
    setEnvoi(true);
    try {
      const r = await post<{ statut: string }>(`/api/paiements-mobiles/simulateur/${reference}`, { succes });
      toast[r.statut === "payee" ? "success" : "error"](r.statut === "payee" ? "Paiement confirmé : le porte-monnaie est rechargé." : "Paiement annulé.");
      naviguer(retour);
    } catch (e) {
      toast.error(messageErreur(e));
      setEnvoi(false);
    }
  }

  if (isError) return <p className="p-8 text-center text-muted-foreground">Paiement introuvable (ou simulation désactivée).</p>;
  if (!data) return <p className="p-8 text-center text-muted-foreground">Chargement…</p>;
  const couleur = COULEURS[data.operateur] ?? "#0f766e";
  return (
    <div className="grid min-h-dvh place-items-center bg-background p-5">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card shadow-haute">
        <div className="flex items-center gap-2 px-5 py-4 text-white" style={{ background: couleur }}>
          <Smartphone className="size-6" /><span className="font-heading text-xl font-semibold">{data.operateur}</span>
        </div>
        <div className="space-y-4 p-5 text-center">
          <div className="flex items-center gap-2 rounded-lg bg-or-soft px-3 py-2 text-left text-xs text-[#5c4100]">
            <FlaskConical className="size-4 shrink-0" /> Démonstration : aucun argent réel n'est prélevé.
          </div>
          <div className="text-sm text-muted-foreground">Paiement à {data.ecole}</div>
          <div className="font-heading text-4xl font-semibold chiffres">{fcfa(data.montant)}</div>
          <div className="text-sm text-muted-foreground">Recharge du porte-monnaie de {data.eleve}</div>
          {data.statut === "en_attente" ? (
            <div className="grid gap-2">
              <Button disabled={envoi} onClick={() => repondre(true)} style={{ background: couleur }} className="text-white hover:opacity-90">Confirmer le paiement</Button>
              <Button variant="secondary" disabled={envoi} onClick={() => repondre(false)}>Annuler</Button>
            </div>
          ) : <Button variant="secondary" onClick={() => naviguer(retour)}>Paiement déjà traité · retour</Button>}
        </div>
      </div>
    </div>
  );
}
