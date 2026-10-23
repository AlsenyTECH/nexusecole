import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Banknote, BookOpen, GraduationCap, Home, Layers, ReceiptText, ShieldCheck, UsersRound } from "lucide-react";
import { Connexion } from "@/components/Connexion";
import { Layout, type Groupe } from "@/components/Layout";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { appliquerCouleurs } from "@/lib/couleurs";
import { ROLES } from "@/lib/format";
import type { Config } from "@/lib/types";
import { Accueil } from "@/pages/Accueil";
import { Caisse } from "@/pages/Caisse";
import { Classes } from "@/pages/Classes";
import { EleveDetail } from "@/pages/EleveDetail";
import { Eleves } from "@/pages/Eleves";
import { GrilleFrais } from "@/pages/GrilleFrais";
import { Impayes } from "@/pages/Impayes";
import { Personnel } from "@/pages/Personnel";
import { Recu } from "@/pages/Recu";
import { Roles } from "@/pages/Roles";

export function EcoleApp() {
  const { moi, chargement, deconnecter, peut } = useAuth();
  const { data: config, isError } = useQuery({
    queryKey: ["config"],
    queryFn: () => api<Config>("/api/ecole/config"),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!config) return;
    appliquerCouleurs(config.couleur_primaire, config.couleur_secondaire);
    document.title = config.nom;
  }, [config]);

  if (isError) return <div className="grid min-h-dvh place-items-center p-6 text-center text-muted-foreground">Établissement introuvable.</div>;
  if (!config || chargement) return <div className="grid min-h-dvh place-items-center text-muted-foreground">Chargement…</div>;

  if (!moi) {
    return (
      <Connexion
        nom={config.nom}
        logo={config.logo_url || undefined}
        accroche="Toute la vie de l'école, au même endroit."
        points={[
          ["Inscrire", "les élèves et suivre leurs frais de scolarité"],
          ["Encaisser", "en espèces, Wave ou Orange Money, avec un reçu à chaque paiement"],
          ["Suivre", "les impayés, la caisse du jour et bientôt les notes et bulletins"],
        ]}
        pied={`${config.nom}${config.ville ? ` — ${config.ville}` : ""} · avec NexusEcole`}
      />
    );
  }

  const frais = config.modules.includes("frais");
  const groupes: Groupe[] = [
    {
      titre: "Pilotage",
      liens: [
        { vers: "/", libelle: "Accueil", icone: Home },
        { vers: "/caisse", libelle: "Caisse", icone: Banknote, visible: frais && peut("frais.encaisser") },
        { vers: "/impayes", libelle: "Impayés", icone: AlertTriangle, visible: frais && peut("frais.rapports") },
      ],
    },
    {
      titre: "Scolarité",
      liens: [
        { vers: "/eleves", libelle: "Élèves", icone: GraduationCap, visible: peut("eleves.voir") },
        { vers: "/classes", libelle: "Classes et années", icone: Layers, visible: peut("eleves.voir") },
      ],
    },
    {
      titre: "Finances",
      liens: [{ vers: "/frais", libelle: "Grille des frais", icone: ReceiptText, visible: frais && peut("frais.voir") }],
    },
    {
      titre: "Réglages",
      liens: [
        { vers: "/personnel", libelle: "Personnel", icone: UsersRound, visible: peut("utilisateurs.gerer") },
        { vers: "/roles", libelle: "Rôles et droits", icone: ShieldCheck, visible: peut("roles.gerer") },
      ],
    },
  ];

  const lectureSeule = config.lecture_seule ? (
    <div className="no-print border-b border-or/40 bg-or-soft px-4 py-2.5 text-center text-sm text-[#5c4100]">
      <BookOpen className="mr-1.5 inline size-4 align-[-3px]" />
      Abonnement suspendu : vos données restent consultables, mais les modifications sont bloquées jusqu'au règlement.
    </div>
  ) : undefined;

  return (
    <Routes>
      <Route path="/recus/:id" element={<Recu />} />
      <Route
        element={
          <Layout
            groupes={groupes}
            bas={["/", "/eleves", "/caisse", "/impayes"]}
            marque={{ nom: config.nom, sousTitre: config.ville || "Espace établissement", logo: config.logo_url || undefined }}
            utilisateur={{ prenom: moi.prenom, nom: moi.nom || moi.email, detail: ROLES[moi.role] ?? moi.role }}
            deconnecter={deconnecter}
            bandeau={lectureSeule}
          />
        }
      >
        <Route index element={<Accueil config={config} />} />
        <Route path="caisse" element={<Caisse />} />
        <Route path="impayes" element={<Impayes />} />
        <Route path="eleves" element={<Eleves />} />
        <Route path="eleves/:id" element={<EleveDetail />} />
        <Route path="classes" element={<Classes />} />
        <Route path="frais" element={<GrilleFrais />} />
        <Route path="personnel" element={<Personnel />} />
        <Route path="roles" element={<Roles />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
