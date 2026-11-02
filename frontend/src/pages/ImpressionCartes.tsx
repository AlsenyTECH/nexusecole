import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { initialesEcole } from "@/components/design";
import { QR } from "@/components/QR";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { date } from "@/lib/format";
import { usePhoto } from "@/lib/photo";
import type { Config } from "@/lib/types";
import type { CarteImprimable } from "./Cartes";

/** Planche de cartes au format carte bancaire (85,6 × 54 mm), à imprimer sur papier cartonné ou PVC. */
export function ImpressionCartes() {
  const [params] = useSearchParams();
  const { data: config } = useQuery({ queryKey: ["config"], queryFn: () => api<Config>("/api/ecole/config") });
  const { data } = useQuery({
    queryKey: ["cartes", "impression", params.toString()],
    queryFn: () => api<{ annee: string | null; cartes: CarteImprimable[] }>(`/api/cartes?${params}`),
  });
  if (!data || !config) return <p className="p-8 text-center text-muted-foreground">Chargement…</p>;
  return (
    <div className="clair min-h-dvh bg-background p-4 md:p-8">
      <div className="no-print mx-auto mb-4 flex max-w-[190mm] items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{data.cartes.length} carte{data.cartes.length > 1 ? "s" : ""} · format 85,6 × 54 mm · imprimez à 100 % (sans mise à l'échelle)</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => window.close()}>Fermer</Button>
          <Button onClick={() => window.print()}><Printer /> Imprimer</Button>
        </div>
      </div>
      <div className="mx-auto grid max-w-[190mm] grid-cols-[repeat(auto-fill,85.6mm)] justify-center gap-[4mm] print:gap-[3mm]">
        {data.cartes.map((c) => <CarteScolaire key={c.eleve.id} c={c} config={config} annee={data.annee} />)}
      </div>
    </div>
  );
}

function CarteScolaire({ c, config, annee }: { c: CarteImprimable; config: Config; annee: string | null }) {
  const photo = usePhoto(c.eleve.id, c.eleve.a_photo);
  return (
    <article className="relative flex flex-col overflow-hidden rounded-[3mm] border border-[#d5ddd9] bg-white text-[#14201c] [break-inside:avoid]"
      style={{ width: "85.6mm", height: "54mm" }}>
      <header className="flex items-center gap-[2mm] px-[3mm] py-[1.6mm] text-white" style={{ background: config.couleur_primaire }}>
        {config.logo_url ? <img src={config.logo_url} alt="" className="h-[6mm] w-[6mm] rounded bg-white object-contain" />
          : <span className="inline-flex h-[6mm] w-[6mm] items-center justify-center rounded bg-white/20 text-[2.6mm] font-bold">{initialesEcole(config.nom)}</span>}
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[3mm] font-semibold">{config.nom}</div>
          <div className="text-[2.2mm] opacity-85">Carte scolaire {annee ?? ""}</div>
        </div>
      </header>
      <div className="flex flex-1 gap-[2.5mm] px-[3mm] py-[2mm]">
        {photo ? <img src={photo} alt="" className="h-[26mm] w-[21mm] rounded-[1.5mm] object-cover" />
          : <div className="flex h-[26mm] w-[21mm] items-center justify-center rounded-[1.5mm] border border-dashed border-[#c5cfca] text-center text-[2.2mm] text-[#8a978f]">Photo</div>}
        <div className="min-w-0 flex-1 space-y-[0.8mm] text-[2.5mm] leading-snug">
          <div className="text-[3.3mm] font-semibold leading-tight">{c.eleve.prenom}<br />{c.eleve.nom.toUpperCase()}</div>
          <div><span className="text-[#5d6b66]">Classe </span><b>{c.eleve.classe}</b></div>
          <div><span className="text-[#5d6b66]">Matricule </span>{c.eleve.matricule}</div>
          {c.eleve.date_naissance ? <div><span className="text-[#5d6b66]">Né{c.eleve.sexe === "F" ? "e" : ""} le </span>{date(c.eleve.date_naissance)}</div> : null}
        </div>
        <div className="flex flex-col items-center">
          <QR texte={c.carte.qr} taille={76} className="h-[23mm] w-[23mm]" />
          <div className="mt-[0.6mm] font-mono text-[2.3mm] tracking-wider">{c.carte.numero}</div>
        </div>
      </div>
      <footer className="h-[1.6mm]" style={{ background: config.couleur_secondaire }} />
    </article>
  );
}
