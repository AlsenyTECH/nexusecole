import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { espace } from "@/lib/ecole";
import { date } from "@/lib/format";
import { note, rang } from "@/lib/requetes";
import type { Bulletin as TBulletin } from "@/lib/types";

/** Bulletin imprimable (A4), avec QR code de vérification publique. Toujours en clair. */
export function Bulletin() {
  const { id } = useParams();
  const { data: b, isError } = useQuery({ queryKey: ["bulletin", id], queryFn: () => api<TBulletin>(`/api/bulletins/${id}`) });
  const [qr, setQr] = useState("");
  const lien = b ? `${location.origin}${espace.base}/verifier/${b.code}` : "";
  useEffect(() => { if (lien) QRCode.toDataURL(lien, { margin: 1, width: 220 }).then(setQr); }, [lien]);

  if (isError) return <p className="p-8 text-center text-muted-foreground">Bulletin introuvable ou accès refusé.</p>;
  if (!b) return <p className="p-8 text-center text-muted-foreground">Chargement…</p>;
  const c = b.contenu;
  const totalCoef = c.matieres.reduce((t, m) => t + (m.moyenne != null ? m.coefficient : 0), 0);
  const totalPoints = c.matieres.reduce((t, m) => t + (m.points ?? 0), 0);

  return (
    <div className="clair bulletin-racine min-h-dvh bg-background p-4 md:p-10">
      <div className="no-print mx-auto mb-4 flex max-w-3xl justify-end gap-2">
        <Button variant="secondary" onClick={() => window.close()}>Fermer</Button>
        <Button onClick={() => window.print()}><Printer /> Imprimer</Button>
      </div>
      <article className="document mx-auto max-w-3xl rounded-2xl border border-border bg-card p-8 text-[#14201c] shadow-carte">
        <header className="flex items-start justify-between gap-4 border-b-2 border-primary pb-4">
          <div>
            <div className="font-heading text-2xl font-semibold">{c.ecole}</div>
            <div className="text-sm text-[#5d6b66]">Année scolaire {c.annee}</div>
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold uppercase tracking-wider text-primary">Bulletin de notes</div>
            <div className="font-heading text-lg font-semibold">{c.periode}</div>
          </div>
        </header>

        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
          <div><div className="text-[#5d6b66]">Élève</div><div className="font-semibold">{c.eleve.replace(/\s*\(.*\)$/, "")}</div></div>
          <div><div className="text-[#5d6b66]">Matricule</div><div className="font-semibold">{c.matricule}</div></div>
          <div><div className="text-[#5d6b66]">Classe</div><div className="font-semibold">{c.classe}</div></div>
          <div><div className="text-[#5d6b66]">Effectif</div><div className="font-semibold">{c.effectif} élèves</div></div>
        </div>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b-2 border-[#14201c]/20 text-left text-xs uppercase tracking-wide text-[#5d6b66]">
              <th className="py-2">Matière</th><th className="py-2 text-center">Coef.</th><th className="py-2 text-center">Devoirs</th>
              <th className="py-2 text-center">Compo.</th><th className="py-2 text-center">Moyenne</th><th className="py-2 text-center">Points</th>
              <th className="py-2 text-center">Rang</th><th className="py-2">Professeur</th>
            </tr>
          </thead>
          <tbody>
            {c.matieres.map((m) => (
              <tr key={m.cours} className="border-b border-[#14201c]/10">
                <td className="py-2 font-medium">{m.matiere}</td>
                <td className="py-2 text-center chiffres">{m.coefficient}</td>
                <td className="py-2 text-center chiffres">{note(m.devoirs)}</td>
                <td className="py-2 text-center chiffres">{note(m.composition)}</td>
                <td className="py-2 text-center font-semibold chiffres">{note(m.moyenne)}</td>
                <td className="py-2 text-center chiffres">{note(m.points)}</td>
                <td className="py-2 text-center">{rang(m.rang)}</td>
                <td className="py-2 text-xs text-[#5d6b66]">{m.enseignant}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold"><td className="pt-3">Totaux</td><td className="pt-3 text-center chiffres">{totalCoef}</td><td /><td /><td /><td className="pt-3 text-center chiffres">{note(totalPoints)}</td><td /><td /></tr>
          </tfoot>
        </table>

        <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto]">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Moyenne", `${note(c.moyenne)} / ${c.bareme}`], ["Rang", `${rang(c.rang)} / ${c.effectif}`],
              ["Mention", c.mention || "—"], ["Moyenne de la classe", note(c.statistiques.moyenne_classe)],
            ].map(([l, v]) => (
              <div key={l} className="rounded-xl bg-[#eef1ef] p-3"><div className="text-xs text-[#5d6b66]">{l}</div><div className="font-heading text-lg font-semibold">{v}</div></div>
            ))}
            <div className="col-span-2 rounded-xl border border-[#14201c]/10 p-3 text-sm sm:col-span-4">
              Absences : <b>{c.absences}</b> demi-journée(s) dont {c.absences_justifiees} justifiée(s) · Retards : <b>{c.retards}</b>
              <span className="text-[#5d6b66]"> · plus forte moyenne {note(c.statistiques.plus_forte)}, plus faible {note(c.statistiques.plus_faible)}</span>
            </div>
          </div>
          <div className="flex flex-col items-center text-center">
            {qr ? <img src={qr} alt="QR code de vérification" className="size-28" /> : null}
            <div className="mt-1 max-w-32 text-[10px] leading-tight text-[#5d6b66]">Scannez pour vérifier l'authenticité · code {b.code}</div>
          </div>
        </div>

        <footer className="mt-10 grid grid-cols-2 gap-8 text-sm">
          <div className="border-t border-dashed border-[#5d6b66] pt-1 text-center text-xs text-[#5d6b66]">Le professeur principal</div>
          <div className="border-t border-dashed border-[#5d6b66] pt-1 text-center text-xs text-[#5d6b66]">Le chef d'établissement</div>
        </footer>
        <p className="mt-6 text-center text-[10px] text-[#5d6b66]">
          Émis le {date(b.emis_le)} · signé électroniquement (Ed25519) · empreinte {b.empreinte.slice(0, 16)}…
        </p>
      </article>
    </div>
  );
}
