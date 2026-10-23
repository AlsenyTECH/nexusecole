import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { Champ } from "@/components/design";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, messageErreur, post } from "@/lib/api";
import { date, fcfa, MOYENS } from "@/lib/format";
import { useRafraichir } from "@/lib/requetes";
import type { Paiement, Situation } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Encaisser un paiement pour une inscription ; propose ensuite d'imprimer le reçu. */
export function Encaissement({ inscription, ouvert, fermer }: { inscription: number | null; ouvert: boolean; fermer: () => void }) {
  const rafraichir = useRafraichir();
  const { data: s } = useQuery({
    queryKey: ["situation", inscription],
    enabled: ouvert && !!inscription,
    queryFn: () => api<Situation>(`/api/inscriptions/${inscription}/situation`),
  });
  const [montant, setMontant] = useState("");
  const [moyen, setMoyen] = useState("especes");
  const [reference, setReference] = useState("");
  const [choisies, setChoisies] = useState<number[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const [recu, setRecu] = useState<Paiement | null>(null);

  useEffect(() => {
    if (!ouvert) return;
    setRecu(null); setReference(""); setMoyen("especes"); setChoisies([]);
  }, [ouvert]);
  useEffect(() => {
    if (s && ouvert) setMontant(String(s.en_retard || s.echeances.find((e) => e.reste > 0)?.reste || ""));
  }, [s, ouvert]);

  const ouvertes = s?.echeances.filter((e) => e.reste > 0) ?? [];
  const basculer = (id: number) => {
    const suivantes = choisies.includes(id) ? choisies.filter((x) => x !== id) : [...choisies, id];
    setChoisies(suivantes);
    if (suivantes.length) setMontant(String(ouvertes.filter((e) => suivantes.includes(e.id)).reduce((t, e) => t + e.reste, 0)));
  };

  async function valider(e: FormEvent) {
    e.preventDefault();
    if (!inscription) return;
    setEnvoi(true);
    try {
      const p = await post<Paiement>("/api/paiements", {
        inscription, montant: Number(montant), moyen, reference: reference.trim(),
        ...(choisies.length ? { echeances: choisies } : {}),
      });
      setRecu(p);
      toast.success(`Paiement enregistré — reçu ${p.numero_recu}`);
      rafraichir("situation", "paiements", "tableau-de-bord", "impayes", "caisse");
    } catch (err) {
      toast.error(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{recu ? "Paiement enregistré" : "Encaisser un paiement"}</DialogTitle>
          <DialogDescription>{s ? `${s.eleve} · ${s.classe}` : "…"}</DialogDescription>
        </DialogHeader>

        {recu ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-primary-soft p-4 text-center">
              <div className="text-sm text-accent-foreground">Reçu n° {recu.numero_recu}</div>
              <div className="font-heading text-3xl font-semibold chiffres">{fcfa(recu.montant)}</div>
              <div className="text-sm text-muted-foreground">{MOYENS[recu.moyen]}{recu.reference ? ` · ${recu.reference}` : ""}</div>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={fermer}>Terminer</Button>
              <Button onClick={() => window.open(`/recus/${recu.id}`, "_blank")}><Printer /> Imprimer le reçu</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={valider} className="space-y-4">
            {s ? (
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-lg bg-muted p-2"><div className="text-muted-foreground">Reste dû</div><div className="font-semibold chiffres">{fcfa(s.reste)}</div></div>
                <div className="rounded-lg bg-[#fbe6e6] p-2 text-[#a32b2b]"><div>En retard</div><div className="font-semibold chiffres">{fcfa(s.en_retard)}</div></div>
                <div className="rounded-lg bg-[#e2f4e2] p-2 text-[#0b6b0b]"><div>Déjà payé</div><div className="font-semibold chiffres">{fcfa(s.paye)}</div></div>
              </div>
            ) : null}

            {ouvertes.length ? (
              <Champ label="Échéances à régler" aide="Sans sélection, le paiement règle les plus anciennes en premier.">
                <div className="defilement-fin max-h-44 space-y-1 overflow-y-auto rounded-lg border border-border p-1.5">
                  {ouvertes.map((e) => (
                    <label key={e.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                      <Checkbox checked={choisies.includes(e.id)} onCheckedChange={() => basculer(e.id)} />
                      <span className="flex-1">{e.libelle}<span className="ml-2 text-xs text-muted-foreground">avant le {date(e.date_limite)}</span></span>
                      <span className="font-medium chiffres">{fcfa(e.reste)}</span>
                    </label>
                  ))}
                </div>
              </Champ>
            ) : s ? <p className="rounded-lg bg-[#e2f4e2] p-3 text-sm text-[#0b6b0b]">Tout est réglé pour cet élève.</p> : null}

            <Champ label="Moyen de paiement">
              <div className="flex flex-wrap gap-2">
                {Object.entries(MOYENS).map(([code, nom]) => (
                  <button type="button" key={code} onClick={() => setMoyen(code)}
                    className={cn("rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                      moyen === code ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted")}>
                    {nom}
                  </button>
                ))}
              </div>
            </Champ>
            <div className="grid gap-4 sm:grid-cols-2">
              <Champ label="Montant (FCFA)">
                <Input type="number" min={1} required inputMode="numeric" value={montant} onChange={(e) => setMontant(e.target.value)} className="chiffres text-lg font-semibold" />
              </Champ>
              {moyen !== "especes" ? (
                <Champ label="Référence de la transaction">
                  <Input required value={reference} onChange={(e) => setReference(e.target.value)} placeholder={moyen === "wave" ? "ex. T_ABC123" : "n° de transaction"} />
                </Champ>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={fermer}>Annuler</Button>
              <Button type="submit" disabled={envoi || !ouvertes.length}>{envoi ? "Enregistrement…" : `Encaisser ${montant ? fcfa(Number(montant)) : ""}`}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
