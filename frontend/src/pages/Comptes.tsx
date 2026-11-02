import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Choix, EnTete, Liste, Pastille } from "@/components/design";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api, messageErreur, patch, type Page } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateHeure } from "@/lib/format";
import { useRafraichir } from "@/lib/requetes";
import { cn } from "@/lib/utils";

type Compte = { id: number; email: string; prenom: string; nom: string; telephone: string; role: string; role_nom: string; is_active: boolean; last_login: string | null };

const TYPES: Record<string, string> = { "": "Tous les comptes", enseignant: "Enseignants", parent: "Parents et tuteurs", bloques: "Comptes bloqués" };

/**
 * Tous les comptes de l'école, quel que soit leur rôle : bloquer coupe l'accès immédiatement
 * (même une session ouverte). Un compte ne se supprime pas : son historique (qui a encaissé, noté…) reste.
 */
export function Comptes() {
  const { moi } = useAuth();
  const rafraichir = useRafraichir();
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const params = new URLSearchParams({ page_size: "200", ...(q ? { q } : {}), ...(type === "bloques" ? { bloques: "1" } : type ? { role: type } : {}) });
  const { data } = useQuery({ queryKey: ["comptes", q, type], queryFn: () => api<Page<Compte>>(`/api/comptes?${params}`) });

  async function basculer(c: Compte, actif: boolean) {
    if (!actif && !confirm(`Bloquer l'accès de ${c.prenom} ${c.nom} ? Sa session en cours est coupée ; son historique est conservé.`)) return;
    try {
      await patch(`/api/comptes/${c.id}`, { is_active: actif });
      toast.success(actif ? "Accès rétabli" : "Accès bloqué");
      rafraichir("comptes", "personnel", "enseignants", "responsables");
    } catch (e) {
      toast.error(messageErreur(e));
    }
  }

  return (
    <div className="space-y-6">
      <EnTete titre="Comptes et accès" sousTitre="Personnel, enseignants, parents : bloquez ou rétablissez l'accès de n'importe quel compte. Les comptes ne sont pas supprimés, pour garder la trace de qui a fait quoi." />
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, e-mail ou téléphone" className="pl-9" />
        </div>
        <Choix value={type} onChange={(e) => setType(e.target.value)} className="sm:w-56" aria-label="Type de compte">
          {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Choix>
      </div>
      {data?.results.length ? (
        <Liste>
          {data.results.map((c) => (
            <div key={c.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3", !c.is_active && "bg-muted/40")}>
              <Avatar prenom={c.prenom} nom={c.nom || c.email} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate font-medium">{c.prenom} {c.nom}</span>
                  <Pastille ton={c.role === "parent" ? "or" : c.role === "enseignant" ? "bleu" : "gris"}>{c.role_nom}</Pastille>
                  {!c.is_active ? <Pastille ton="rouge"><Lock className="size-3" /> Bloqué</Pastille> : null}
                  {c.id === moi?.id ? <Pastille ton="vert">vous</Pastille> : null}
                </div>
                <div className="truncate text-xs text-muted-foreground">{c.email}{c.telephone ? ` · ${c.telephone}` : ""} · dernière connexion : {c.last_login ? dateHeure(c.last_login) : "jamais"}</div>
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Switch checked={c.is_active} disabled={c.id === moi?.id} onCheckedChange={(v) => basculer(c, v)} aria-label={`Accès de ${c.prenom} ${c.nom}`} /> Accès
              </label>
            </div>
          ))}
        </Liste>
      ) : data ? <EmptyState icon={ShieldCheck} title="Aucun compte" /> : null}
    </div>
  );
}
