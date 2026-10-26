import { Navigate, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { GraduationCap, Home } from "lucide-react";
import { Layout, type Groupe } from "@/components/Layout";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Config } from "@/lib/types";
import { Bulletin } from "@/pages/Bulletin";
import { Recu } from "@/pages/Recu";
import { AccueilFamille, FicheEnfant, type Enfants } from "./pages";

/** Espace des parents et tuteurs : uniquement les élèves auxquels ils sont rattachés. */
export function FamilleApp({ config }: { config: Config }) {
  const { moi, deconnecter } = useAuth();
  const { data } = useQuery({ queryKey: ["famille", "enfants"], queryFn: () => api<Enfants>("/api/famille/enfants") });
  const enfants = data?.enfants ?? [];
  const groupes: Groupe[] = [
    { titre: "Famille", liens: [{ vers: "/", libelle: "Accueil", icone: Home }] },
    { titre: "Mes enfants", liens: enfants.map((e) => ({ vers: `/enfants/${e.id}`, libelle: e.prenom, icone: GraduationCap })) },
  ];

  return (
    <Routes>
      <Route path="/bulletins/:id" element={<Bulletin famille />} />
      <Route path="/recus/:id" element={<Recu famille />} />
      <Route element={
        <Layout groupes={groupes} bas={["/", ...enfants.map((e) => `/enfants/${e.id}`)]}
          marque={{ nom: config.nom, sousTitre: "Espace famille", logo: config.logo_url || undefined }}
          utilisateur={{ prenom: moi!.prenom, nom: moi!.nom || moi!.email, detail: "Parent / tuteur" }} deconnecter={deconnecter} />
      }>
        <Route index element={<AccueilFamille config={config} donnees={data} />} />
        <Route path="enfants/:id" element={<FicheEnfant donnees={data} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
