import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { dateHeure, fcfa } from "@/lib/format";

type DonneesRecu = {
  ecole: { nom: string; ville: string; telephone: string; logo_url: string };
  numero: string; date: string; eleve: string; classe: string; annee: string; montant: number; moyen: string; reference: string;
  detail: { libelle: string; montant: number }[]; encaisse_par: string; annule: boolean; motif_annulation: string; reste_du: number;
};

/** Reçu imprimable (A5), toujours en clair même en mode sombre. */
export function Recu() {
  const { id } = useParams();
  const { data: r, isError } = useQuery({ queryKey: ["recu", id], queryFn: () => api<DonneesRecu>(`/api/paiements/${id}/recu`) });
  if (isError) return <p className="p-8 text-center text-muted-foreground">Reçu introuvable ou accès refusé.</p>;
  if (!r) return <p className="p-8 text-center text-muted-foreground">Chargement…</p>;

  return (
    <div className="clair min-h-dvh bg-background p-4 md:p-10">
      <div className="no-print mx-auto mb-4 flex max-w-xl justify-end gap-2">
        <Button variant="secondary" onClick={() => window.close()}>Fermer</Button>
        <Button onClick={() => window.print()}><Printer /> Imprimer</Button>
      </div>
      <article className="document relative mx-auto max-w-xl overflow-hidden rounded-2xl border border-border bg-card p-7 text-[#14201c] shadow-carte">
        {r.annule ? (
          <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="-rotate-[20deg] rounded-xl border-4 border-[#d03b3b] px-6 py-2 font-heading text-6xl font-bold text-[#d03b3b] opacity-25">ANNULÉ</span>
          </div>
        ) : null}
        <header className="flex items-start justify-between gap-4 border-b-2 border-primary pb-4">
          <div className="flex items-center gap-3">
            {r.ecole.logo_url ? <img src={r.ecole.logo_url} alt="" className="size-14 object-contain" /> : null}
            <div>
              <div className="font-heading text-xl font-semibold">{r.ecole.nom}</div>
              <div className="text-sm text-[#5d6b66]">{[r.ecole.ville, r.ecole.telephone].filter(Boolean).join(" · ")}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold uppercase tracking-wider text-primary">Reçu de paiement</div>
            <div className="font-heading text-lg font-semibold chiffres">{r.numero}</div>
            <div className="text-xs text-[#5d6b66]">{dateHeure(r.date)}</div>
          </div>
        </header>

        <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
          <dt className="text-[#5d6b66]">Élève</dt><dd className="font-semibold">{r.eleve}</dd>
          <dt className="text-[#5d6b66]">Classe</dt><dd>{r.classe} · {r.annee}</dd>
          <dt className="text-[#5d6b66]">Mode de paiement</dt><dd>{r.moyen}{r.reference ? ` · réf. ${r.reference}` : ""}</dd>
        </dl>

        <table className="mt-5 w-full text-sm">
          <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-[#5d6b66]"><th className="py-2">Désignation</th><th className="py-2 text-right">Montant</th></tr></thead>
          <tbody>
            {r.detail.map((d, i) => <tr key={i} className="border-b border-border/60"><td className="py-2">{d.libelle}</td><td className="py-2 text-right chiffres">{fcfa(d.montant)}</td></tr>)}
          </tbody>
          <tfoot><tr><td className="pt-3 font-semibold">Total payé</td><td className="pt-3 text-right font-heading text-xl font-semibold chiffres">{fcfa(r.montant)}</td></tr></tfoot>
        </table>

        <div className="mt-5 flex justify-between rounded-lg bg-[#eef1ef] px-4 py-2.5 text-sm">
          <span>Reste dû après ce paiement</span><span className="font-semibold chiffres">{fcfa(r.reste_du)}</span>
        </div>
        {r.annule ? <p className="mt-3 text-sm font-medium text-[#a32b2b]">Paiement annulé : {r.motif_annulation}</p> : null}

        <footer className="mt-8 flex items-end justify-between text-sm">
          <div className="text-[#5d6b66]">Encaissé par<br /><span className="font-medium text-[#14201c]">{r.encaisse_par}</span></div>
          <div className="w-40 border-t border-dashed border-[#5d6b66] pt-1 text-center text-xs text-[#5d6b66]">Cachet et signature</div>
        </footer>
        <p className="mt-6 text-center text-[11px] text-[#5d6b66]">Reçu émis avec NexusEcole · conservez-le comme preuve de paiement</p>
      </article>
    </div>
  );
}
