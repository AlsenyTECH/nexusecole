import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { api, ErreurApi } from "@/lib/api";
import { date } from "@/lib/format";
import { note, rang } from "@/lib/requetes";

type Reponse = {
  authentique: boolean; detail?: string; ecole: string; eleve: string; classe: string; periode: string; annee: string;
  moyenne: number | null; bareme: number; rang: number | null; effectif: number; mention: string; emis_le: string; empreinte: string;
};

/** Page publique ouverte par le QR code d'un bulletin (aucune connexion nécessaire). */
export function Verification() {
  const { code } = useParams();
  const { data, error } = useQuery({ queryKey: ["verifier", code], retry: false, queryFn: () => api<Reponse>(`/api/verifier/${code}`) });
  const introuvable = error instanceof ErreurApi && error.status === 404;

  return (
    <div className="grid min-h-dvh place-items-center bg-background p-5">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-haute">
        {data || introuvable ? (
          <>
            <div className={`flex items-center gap-3 p-5 text-white ${data?.authentique ? "bg-[#0b7a3e]" : "bg-[#b42323]"}`}>
              {data?.authentique ? <ShieldCheck className="size-9" /> : <ShieldAlert className="size-9" />}
              <div>
                <div className="font-heading text-xl font-semibold">{data?.authentique ? "Bulletin authentique" : "Bulletin non valide"}</div>
                <div className="text-sm text-white/80">
                  {data?.authentique ? "Émis par l'établissement et non modifié depuis." : introuvable ? "Aucun bulletin ne correspond à ce code." : "Le contenu ne correspond pas à la signature de l'établissement."}
                </div>
              </div>
            </div>
            {data ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 p-5 text-sm">
                <dt className="text-muted-foreground">Établissement</dt><dd className="font-medium">{data.ecole}</dd>
                <dt className="text-muted-foreground">Élève</dt><dd className="font-medium">{data.eleve}</dd>
                <dt className="text-muted-foreground">Classe</dt><dd>{data.classe} · {data.annee}</dd>
                <dt className="text-muted-foreground">Période</dt><dd>{data.periode}</dd>
                <dt className="text-muted-foreground">Moyenne</dt><dd className="font-semibold">{note(data.moyenne)} / {data.bareme}</dd>
                <dt className="text-muted-foreground">Rang</dt><dd>{rang(data.rang)} sur {data.effectif}</dd>
                <dt className="text-muted-foreground">Mention</dt><dd>{data.mention || "—"}</dd>
                <dt className="text-muted-foreground">Émis le</dt><dd>{date(data.emis_le)}</dd>
              </dl>
            ) : null}
            <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
              Vérifiez que ces informations correspondent au bulletin papier présenté. Signature Ed25519 · NexusEcole
            </p>
          </>
        ) : <p className="p-8 text-center text-muted-foreground">Vérification…</p>}
      </div>
    </div>
  );
}
