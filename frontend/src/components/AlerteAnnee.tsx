import { Link } from "react-router-dom";
import { CalendarRange } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useAnneeActive, useClasses } from "@/lib/requetes";

/**
 * Bandeau si l'année active n'a aucune classe (ou s'il n'y a pas d'année active) : sinon toutes les
 * listes de classes de l'application restent vides sans explication.
 */
export function AlerteAnnee() {
  const { peut } = useAuth();
  const { annee, annees } = useAnneeActive();
  const { data: classes } = useClasses(annee?.id);
  if (!peut("classes.toutes") || !annees?.length) return null;
  if (annee && (!classes || classes.length)) return null;
  const autre = annees.find((a) => !a.active);
  return (
    <div className="no-print border-b border-or/40 bg-or-soft px-4 py-2.5 text-center text-sm text-[#5c4100]">
      <CalendarRange className="mr-1.5 inline size-4 align-[-3px]" />
      {annee ? <>L'année active <b>{annee.libelle}</b> n'a encore aucune classe : les listes de classes sont vides. </> : <>Aucune année scolaire n'est active. </>}
      <Link to="/classes" className="font-semibold underline">
        {annee && autre ? `Créez ses classes, ou réactivez ${autre.libelle}` : "Ouvrir Classes et années"}
      </Link>
    </div>
  );
}
