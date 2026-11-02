import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ScanLine, Ticket, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Choix, EnTete, Liste, Pastille, Section } from "@/components/design";
import { Scanner } from "@/components/Scanner";
import { api, messageErreur, post, type Page } from "@/lib/api";
import { date, fcfa } from "@/lib/format";
import { useRafraichir } from "@/lib/requetes";
import { cn } from "@/lib/utils";

type Verdict = {
  autorise: boolean; motifs: string[]; lieu: string; a_jour: boolean | null; en_retard: number | null; le: string;
  eleve: { id: number; prenom: string; nom: string; matricule: string; classe: string | null; photo: string | null } | null;
  ticket: { code: string; beneficiaire: string; statut: string } | null;
};
type Passage = { id: number; eleve_nom: string | null; classe: string | null; lieu: string; autorise: boolean; motifs: string[]; le: string };
type Activite = { id: number; titre: string; date: string };

/** Contrôle des cartes : entrée de l'école (droit d'accès, paiements à jour) ou entrée d'une activité (ticket). */
export function Controle() {
  const rafraichir = useRafraichir();
  const [lieu, setLieu] = useState(() => { try { return localStorage.getItem("nexus.controle.lieu") ?? ""; } catch { return ""; } });
  useEffect(() => { try { localStorage.setItem("nexus.controle.lieu", lieu); } catch { /* navigation privée */ } }, [lieu]);
  const { data: activites = [] } = useQuery({
    queryKey: ["activites", "a-venir"],
    queryFn: async () => (await api<Page<Activite>>("/api/activites?a_venir=1&page_size=50")).results,
    retry: false,
  });
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [envoi, setEnvoi] = useState(false);
  useEffect(() => {
    if (!verdict) return;
    const t = setTimeout(() => setVerdict(null), 8000);
    return () => clearTimeout(t);
  }, [verdict]);
  const { data: passages } = useQuery({
    queryKey: ["passages", lieu],
    queryFn: () => api<Page<Passage>>(`/api/passages?page_size=30${lieu ? "" : "&lieu=Portail"}`),
    refetchInterval: 15_000,
  });

  async function lire(qr: string) {
    setEnvoi(true);
    try {
      setVerdict(await post<Verdict>("/api/controle", { qr, ...(lieu ? { activite: Number(lieu) } : {}) }));
      rafraichir("passages");
    } catch (e) {
      toast.error(messageErreur(e));
    } finally {
      setEnvoi(false);
    }
  }

  const liste = passages?.results ?? [];
  return (
    <div className="space-y-6">
      <EnTete titre="Contrôle des cartes" sousTitre="Scannez la carte de l'élève : le verdict s'affiche avec sa photo." />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <Choix value={lieu} onChange={(e) => { setLieu(e.target.value); setVerdict(null); }} aria-label="Lieu contrôlé">
            <option value="">Entrée de l'école (portail)</option>
            {activites.map((a) => <option key={a.id} value={a.id}>Activité : {a.titre} ({date(a.date)})</option>)}
          </Choix>
          <Scanner onLecture={lire} occupe={envoi} />
        </div>
        <div aria-live="assertive">
          {verdict ? <AfficheVerdict v={verdict} /> : (
            <div className="flex h-full min-h-56 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border p-6 text-center text-muted-foreground">
              <ScanLine className="size-10" />
              <p>En attente d'une carte…</p>
            </div>
          )}
        </div>
      </div>
      <Section titre="Passages du jour" action={<span className="text-sm text-muted-foreground">
        {liste.filter((p) => p.autorise).length} autorisé(s) · {liste.filter((p) => !p.autorise).length} refusé(s)</span>}>
        {liste.length ? (
          <Liste>
            {liste.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                {p.autorise ? <CheckCircle2 className="size-5 text-primary" /> : <XCircle className="size-5 text-destructive" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.eleve_nom ?? "Ticket invité"}{p.classe ? ` · ${p.classe}` : ""}</div>
                  {p.motifs.length ? <div className="truncate text-xs text-muted-foreground">{p.motifs.join(" ")}</div> : null}
                </div>
                <span className="text-xs text-muted-foreground">{p.lieu} · {new Date(p.le).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            ))}
          </Liste>
        ) : <p className="text-sm text-muted-foreground">Aucun passage pour l'instant.</p>}
      </Section>
    </div>
  );
}

function AfficheVerdict({ v }: { v: Verdict }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl text-white shadow-haute", v.autorise ? "bg-[#0b7a3e]" : "bg-[#b42323]")}>
      <div className="flex items-center gap-3 px-5 py-4">
        {v.autorise ? <CheckCircle2 className="size-10" /> : <XCircle className="size-10" />}
        <div>
          <div className="font-heading text-2xl font-bold tracking-wide">{v.autorise ? "ACCÈS AUTORISÉ" : "ACCÈS REFUSÉ"}</div>
          <div className="text-sm text-white/80">{v.lieu}</div>
        </div>
      </div>
      <div className="flex gap-4 bg-card p-5 text-foreground">
        {v.eleve ? (
          <>
            {v.eleve.photo ? <img src={v.eleve.photo} alt="" className="h-32 w-28 rounded-xl object-cover" />
              : <Avatar prenom={v.eleve.prenom} nom={v.eleve.nom} taille="lg" className="h-32 w-28 rounded-xl text-3xl" />}
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="text-xl font-semibold leading-tight">{v.eleve.prenom} {v.eleve.nom}</div>
              <div className="text-sm text-muted-foreground">{v.eleve.classe ?? "non inscrit"} · {v.eleve.matricule}</div>
              {v.a_jour !== null ? (v.a_jour ? <Pastille ton="vert">À jour des paiements</Pastille>
                : <Pastille ton="or">Retard : {fcfa(v.en_retard)}</Pastille>) : null}
              {v.ticket ? <div className="flex items-center gap-1.5 text-sm"><Ticket className="size-4" /> Ticket {v.ticket.code}</div> : null}
            </div>
          </>
        ) : v.ticket ? (
          <div className="flex items-center gap-3"><Ticket className="size-8" /><div><div className="font-semibold">Invité : {v.ticket.beneficiaire}</div><div className="text-sm text-muted-foreground">Ticket {v.ticket.code}</div></div></div>
        ) : null}
      </div>
      {v.motifs.length ? (
        <ul className="space-y-1 bg-card px-5 pb-5 text-sm font-medium text-destructive">
          {v.motifs.map((m) => <li key={m}>• {m}</li>)}
        </ul>
      ) : null}
    </div>
  );
}
