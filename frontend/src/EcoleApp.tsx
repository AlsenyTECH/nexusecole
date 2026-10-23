import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Banknote, BookOpen, BookOpenCheck, ClipboardList, FileText, GraduationCap, Home, Layers, ReceiptText, ShieldCheck, UserCheck, UsersRound } from "lucide-react";
import { Connexion } from "@/components/Connexion";
import { Layout, type Groupe } from "@/components/Layout";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { appliquerCouleurs } from "@/lib/couleurs";
import { ROLES } from "@/lib/format";
import type { Config } from "@/lib/types";
import { Accueil } from "@/pages/Accueil";
import { Appel } from "@/pages/Appel";
import { Bulletin } from "@/pages/Bulletin";
import { Caisse } from "@/pages/Caisse";
import { Classes } from "@/pages/Classes";
import { Cours } from "@/pages/Cours";
import { EleveDetail } from "@/pages/EleveDetail";
import { Eleves } from "@/pages/Eleves";
import { GrilleFrais } from "@/pages/GrilleFrais";
import { Impayes } from "@/pages/Impayes";
import { Notes } from "@/pages/Notes";
import { Personnel } from "@/pages/Personnel";
import { Recu } from "@/pages/Recu";
import { Resultats } from "@/pages/Resultats";
import { Roles } from "@/pages/Roles";
import { Verification } from "@/pages/Verification";
import { useLocation } from "react-router-dom";

export function EcoleApp() {
  const { moi, chargement, deconnecter, peut } = useAuth();
  const { pathname } = useLocation();
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

  // Vérification d'un bulletin par QR code : publique, sans connexion.
  if (pathname.startsWith("/verifier/")) return <Routes><Route path="/verifier/:code" element={<Verification />} /></Routes>;
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
          ["Suivre", "les notes, les absences et les bulletins signés de chaque élève"],
        ]}
        pied={`${config.nom}${config.ville ? ` — ${config.ville}` : ""} · avec NexusEcole`}
      />
    );
  }

  const frais = config.modules.includes("frais");
  const notes = config.modules.includes("notes");
  const absences = config.modules.includes("absences");
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
      titre: "Pédagogie",
      liens: [
        { vers: "/notes", libelle: "Notes", icone: ClipboardList, visible: notes && (peut("notes.saisir") || peut("notes.saisir_toutes")) },
        { vers: "/appel", libelle: "Appel", icone: UserCheck, visible: absences && peut("absences.saisir") },
        { vers: "/resultats", libelle: "Résultats et bulletins", icone: FileText, visible: notes && peut("notes.voir") },
        { vers: "/cours", libelle: "Matières et cours", icone: BookOpenCheck, visible: notes && peut("scolarite.parametrer") },
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
      <Route path="/bulletins/:id" element={<Bulletin />} />
      <Route
        element={
          <Layout
            groupes={groupes}
            bas={["/", "/notes", "/appel", "/eleves", "/caisse", "/impayes"]}
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
        <Route path="notes" element={<Notes />} />
        <Route path="appel" element={<Appel />} />
        <Route path="resultats" element={<Resultats />} />
        <Route path="cours" element={<Cours />} />
        <Route path="personnel" element={<Personnel />} />
        <Route path="roles" element={<Roles />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
