import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Banknote, BookOpen, BookOpenCheck, CalendarDays, ClipboardList, CreditCard, FileText, GraduationCap, Home, KeyRound, Landmark, Layers, PartyPopper, Presentation, ReceiptText, Repeat, ScanLine, ShieldCheck, Store, UserCheck, UsersRound } from "lucide-react";
import { AlerteAnnee } from "@/components/AlerteAnnee";
import { Connexion } from "@/components/Connexion";
import { Layout, type Groupe } from "@/components/Layout";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { appliquerCouleurs } from "@/lib/couleurs";
import { definirPays, ROLES } from "@/lib/format";
import type { Config } from "@/lib/types";
import { FamilleApp } from "@/famille/FamilleApp";
import { Accueil } from "@/pages/Accueil";
import { Activites } from "@/pages/Activites";
import { Cartes } from "@/pages/Cartes";
import { Comptes } from "@/pages/Comptes";
import { FinAnnee } from "@/pages/FinAnnee";
import { Controle } from "@/pages/Controle";
import { ImpressionCartes } from "@/pages/ImpressionCartes";
import { PointsDeVente } from "@/pages/PointsDeVente";
import { RapportCaisses } from "@/pages/RapportCaisses";
import { PointVente } from "@/pages/Vente";
import { Appel } from "@/pages/Appel";
import { Bulletin } from "@/pages/Bulletin";
import { Caisse } from "@/pages/Caisse";
import { Classes } from "@/pages/Classes";
import { Cours } from "@/pages/Cours";
import { EleveDetail } from "@/pages/EleveDetail";
import { Eleves } from "@/pages/Eleves";
import { EmploiDuTemps } from "@/pages/EmploiDuTemps";
import { Enseignants } from "@/pages/Enseignants";
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
  // Monnaie et indicatif du pays : fixés avant le premier affichage des montants
  if (config) definirPays(config);
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

  // Parents et tuteurs : leur propre espace, limité aux élèves qui leur sont rattachés
  if (moi.role === "parent") return <FamilleApp config={config} />;

  const frais = config.modules.includes("frais");
  const notes = config.modules.includes("notes");
  const absences = config.modules.includes("absences");
  const carte = config.modules.includes("carte");
  const activites = config.modules.includes("activites");
  const groupes: Groupe[] = [
    {
      titre: "Pilotage",
      liens: [
        { vers: "/", libelle: "Accueil", icone: Home },
        { vers: "/caisse", libelle: "Caisse", icone: Banknote, visible: frais && peut("frais.encaisser") },
        { vers: "/impayes", libelle: "Impayés", icone: AlertTriangle, visible: frais && peut("frais.rapports") },
        { vers: "/controle", libelle: "Contrôle des cartes", icone: ScanLine, visible: carte && peut("acces.controler") },
        { vers: "/vente", libelle: "Point de vente", icone: Store, visible: carte && peut("ventes.encaisser") },
      ],
    },
    {
      titre: "Scolarité",
      liens: [
        { vers: "/eleves", libelle: "Élèves", icone: GraduationCap, visible: peut("eleves.voir") },
        { vers: "/classes", libelle: "Classes et années", icone: Layers, visible: peut("eleves.voir") },
        { vers: "/fin-annee", libelle: "Fin d'année et réinscriptions", icone: Repeat, visible: peut("notes.valider") || peut("inscriptions.gerer") },
        { vers: "/cartes", libelle: "Cartes scolaires", icone: CreditCard, visible: carte && peut("cartes.gerer") },
        { vers: "/activites", libelle: "Activités", icone: PartyPopper, visible: activites && peut("activites.gerer") },
      ],
    },
    {
      titre: "Pédagogie",
      liens: [
        { vers: "/notes", libelle: "Notes", icone: ClipboardList, visible: notes && (peut("notes.saisir") || peut("notes.saisir_toutes")) },
        { vers: "/appel", libelle: "Appel", icone: UserCheck, visible: absences && peut("absences.saisir") },
        { vers: "/emploi-du-temps", libelle: "Emploi du temps", icone: CalendarDays, visible: notes && peut("eleves.voir") },
        { vers: "/resultats", libelle: "Résultats et bulletins", icone: FileText, visible: notes && peut("notes.voir") },
        { vers: "/cours", libelle: "Matières et cours", icone: BookOpenCheck, visible: notes && peut("scolarite.parametrer") },
      ],
    },
    {
      titre: "Finances",
      liens: [
        { vers: "/frais", libelle: "Frais et services", icone: ReceiptText, visible: frais && peut("frais.voir") },
        { vers: "/recettes", libelle: "Recettes par caisse", icone: Landmark, visible: frais && peut("frais.rapports") },
      ],
    },
    {
      titre: "Réglages",
      liens: [
        { vers: "/enseignants", libelle: "Enseignants", icone: Presentation, visible: peut("utilisateurs.gerer") },
        { vers: "/personnel", libelle: "Personnel", icone: UsersRound, visible: peut("utilisateurs.gerer") },
        { vers: "/comptes", libelle: "Comptes et accès", icone: KeyRound, visible: peut("utilisateurs.gerer") },
        { vers: "/roles", libelle: "Rôles et droits", icone: ShieldCheck, visible: peut("roles.gerer") },
        { vers: "/caisses", libelle: "Caisses et points de vente", icone: Store, visible: carte && peut("ventes.parametrer") },
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
      <Route path="/cartes/impression" element={<ImpressionCartes />} />
      <Route
        element={
          <Layout
            groupes={groupes}
            bas={["/", "/controle", "/vente", "/notes", "/appel", "/eleves", "/caisse", "/impayes"]}
            marque={{ nom: config.nom, sousTitre: config.ville || "Espace établissement", logo: config.logo_url || undefined }}
            utilisateur={{ prenom: moi.prenom, nom: moi.nom || moi.email, detail: moi.role_nom || ROLES[moi.role] || moi.role }}
            deconnecter={deconnecter}
            bandeau={<>{lectureSeule}<AlerteAnnee /></>}
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
        <Route path="emploi-du-temps" element={<EmploiDuTemps />} />
        <Route path="enseignants" element={<Enseignants />} />
        <Route path="controle" element={<Controle />} />
        <Route path="fin-annee" element={<FinAnnee />} />
        <Route path="comptes" element={<Comptes />} />
        <Route path="vente" element={<PointVente />} />
        <Route path="cartes" element={<Cartes />} />
        <Route path="activites" element={<Activites />} />
        <Route path="caisses" element={<PointsDeVente />} />
        <Route path="recettes" element={<RapportCaisses />} />
        <Route path="personnel" element={<Personnel />} />
        <Route path="roles" element={<Roles />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
