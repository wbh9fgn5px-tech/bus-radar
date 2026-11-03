import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Clock,
  Database,
  Filter,
  Map as MapIcon,
  Navigation,
  Radio,
  Route,
  Search,
  ShieldCheck,
  Signpost,
  Workflow,
} from "lucide-react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LiveNetworks, LivePreview, LiveStats } from "@/components/landing/live";

function CTA({ children = "Ouvrir la carte en direct" }: { children?: React.ReactNode }) {
  return (
    <Link
      href="/carte"
      className="group inline-flex h-12 items-center gap-2 rounded-2xl bg-electric px-6 text-[15px] font-semibold text-white shadow-float transition-all hover:bg-electric/90 hover:shadow-pop active:scale-[0.98]"
    >
      {children}
      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.16em] text-electric dark:text-turquoise">{children}</p>;
}

const FEATURES = [
  {
    icon: MapIcon,
    title: "Une carte radar de toute la France",
    text: "Zoomez de la France entière jusqu’à la rue. Les véhicules se regroupent en vue large, puis apparaissent un par un, orientés dans leur sens de circulation.",
  },
  {
    icon: Building2,
    title: "Filtrez par réseau ou exploitant",
    text: "Choisissez les réseaux à afficher, par groupe (Keolis, Transdev…), région, département ou catégorie : urbain, interurbain, régional.",
  },
  {
    icon: Navigation,
    title: "La fiche de chaque bus",
    text: "Ligne, destination, prochain arrêt, progression sur le parcours, vitesse, cap, retard annoncé et heure exacte de la dernière position GPS.",
  },
  {
    icon: Route,
    title: "Lignes et tracés",
    text: "Affichez les tracés officiels des lignes, leurs terminus et les véhicules qui y circulent en ce moment.",
  },
  {
    icon: Signpost,
    title: "Arrêts et prochains passages",
    text: "Recherchez un arrêt et consultez les prochains départs, en distinguant clairement le temps réel de l’horaire théorique.",
  },
  {
    icon: Search,
    title: "Recherche instantanée",
    text: "Une ville, un arrêt, une ligne, un réseau, un numéro de véhicule ou une destination : un seul champ pour tout retrouver.",
  },
];

const PRINCIPLES = [
  { icon: ShieldCheck, title: "Aucun bus inventé", text: "Chaque icône correspond à une position GPS publiée par un réseau. Pas de simulation, pas de remplissage." },
  { icon: Radio, title: "Pas d’extrapolation", text: "Le déplacement est animé entre deux positions réellement reçues — jamais au-delà de la dernière." },
  { icon: Clock, title: "Fraîcheur affichée", text: "Chaque véhicule et chaque source indiquent l’âge de leurs données. Une position ancienne apparaît en gris." },
  { icon: BadgeCheck, title: "Réel ≠ théorique", text: "Un horaire théorique n’est jamais présenté comme une position ou un passage en temps réel." },
  { icon: Database, title: "Source et licence visibles", text: "Chaque réseau affiche son éditeur, sa licence et un lien vers le jeu de données officiel." },
  { icon: Filter, title: "Connecté veut dire connecté", text: "Un réseau sans flux de positions fonctionnel n’est jamais présenté comme disponible." },
];

const STATUSES = [
  { dot: "bg-live", label: "En direct", text: "positions de moins de 3 minutes" },
  { dot: "bg-alert", label: "Retard de mise à jour", text: "flux joignable, positions anciennes" },
  { dot: "bg-danger", label: "Hors ligne", text: "flux indisponible : véhicules non affichés" },
  { dot: "bg-fg-subtle", label: "Statique", text: "horaires théoriques uniquement" },
];

const STEPS = [
  { n: "01", title: "Catalogue national", text: "Le Point d’Accès National transport.data.gouv.fr recense les données de mobilité publiées par les collectivités et opérateurs." },
  { n: "02", title: "Connecteurs temps réel", text: "Les flux GTFS-Realtime de positions sont interrogés toutes les 20 secondes, en respectant les producteurs (cache, requêtes conditionnelles)." },
  { n: "03", title: "Normalisation", text: "Les positions sont vérifiées, dédoublonnées et enrichies avec les horaires officiels GTFS : ligne, couleur, destination, arrêts." },
  { n: "04", title: "Diffusion en direct", text: "Le serveur pousse les mises à jour vers votre navigateur en continu. La carte se met à jour sans recharger la page." },
];

const MISSING = [
  ["Île-de-France (RATP, IDFM)", "prochains passages uniquement, via compte et clé API"],
  ["Lyon (TCL)", "horaires temps réel sur compte, sans positions publiques"],
  ["Toulouse, Lille", "horaires temps réel (TripUpdates), sans positions"],
  ["Strasbourg (CTS)", "API SIRI à jeton, sans positions"],
  ["FlixBus, BlaBlaCar Bus, SNCF", "horaires temps réel, sans positions"],
];

export default function Home() {
  return (
    <div className="min-h-screen bg-bg text-fg">
      <LandingHeader />

      <main>
        {/* ─────── Héro ─────── */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,rgb(52_120_246/0.12),transparent)] dark:bg-[radial-gradient(60%_60%_at_50%_0%,rgb(41_199_201/0.14),transparent)]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
            <div className="animate-slide-up">
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-solid px-3 py-1 text-xs font-medium text-fg-muted">
                <span className="size-1.5 rounded-full bg-live animate-pulse-ring" />
                Données ouvertes · mises à jour toutes les 20 s
              </span>
              <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight text-fg sm:text-5xl lg:text-6xl">
                Les bus de France,
                <br />
                <span className="bg-gradient-to-r from-electric to-turquoise bg-clip-text text-transparent">en temps réel.</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-fg-muted">
                Bus Radar affiche sur une seule carte les bus et autocars qui circulent en ce moment en France, à partir des positions GPS
                publiées par les réseaux eux-mêmes. Comme un radar aérien, mais pour les transports du quotidien.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <CTA />
                <a href="#concept" className="inline-flex h-12 items-center rounded-2xl px-5 text-[15px] font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg">
                  Découvrir le concept
                </a>
              </div>
              <LiveStats className="mt-10" />
            </div>
            <div className="animate-fade-in">
              <LivePreview />
            </div>
          </div>
        </section>

        {/* ─────── Concept ─────── */}
        <section id="concept" className="border-t border-line bg-surface-solid/50 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Eyebrow>Le concept</Eyebrow>
            <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">Où est mon bus ? Et tous les autres ?</h2>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-fg-muted">
              Chaque réseau a son application. Bus Radar rassemble leurs données publiques dans une seule interface, pensée pour être
              lisible d’un coup d’œil — sur ordinateur comme sur mobile.
            </p>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <article key={title} className="group rounded-2xl border border-line bg-surface-solid p-6 transition-shadow hover:shadow-float">
                  <span className="grid size-10 place-items-center rounded-xl bg-electric/10 text-electric transition-transform group-hover:scale-105 dark:bg-turquoise/10 dark:text-turquoise">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-4 font-semibold text-fg">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ─────── Données réelles ─────── */}
        <section id="donnees" className="py-20">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.3fr]">
            <div>
              <Eyebrow>Des données réelles</Eyebrow>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Rien d’inventé. Tout est sourcé.</h2>
              <p className="mt-4 text-lg leading-relaxed text-fg-muted">
                Un radar n’a de valeur que s’il dit vrai. Quand une information n’est pas publiée par le réseau, Bus Radar l’indique au
                lieu de la deviner.
              </p>
              <div className="mt-8 rounded-2xl border border-line bg-surface-solid p-5">
                <p className="text-sm font-semibold text-fg">L’état de chaque source</p>
                <ul className="mt-3 space-y-2.5">
                  {STATUSES.map((s) => (
                    <li key={s.label} className="flex items-center gap-3 text-sm">
                      <span className={`size-2.5 shrink-0 rounded-full ${s.dot}`} />
                      <span className="font-medium text-fg">{s.label}</span>
                      <span className="text-fg-muted">— {s.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {PRINCIPLES.map(({ icon: Icon, title, text }) => (
                <div key={title} className="rounded-2xl border border-line p-5">
                  <Icon className="size-5 text-live" />
                  <h3 className="mt-3 font-semibold text-fg">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─────── Fonctionnement ─────── */}
        <section id="fonctionnement" className="border-y border-line bg-night py-20 text-offwhite dark:bg-deep/40">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-turquoise">Comment ça marche</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">Des flux publics à votre écran, en quelques secondes.</h2>
            <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl bg-white/10 md:grid-cols-4">
              {STEPS.map((s) => (
                <li key={s.n} className="bg-night p-6 dark:bg-[#0e1626]">
                  <span className="font-mono text-sm text-turquoise">{s.n}</span>
                  <h3 className="mt-3 font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-offwhite/65">{s.text}</p>
                </li>
              ))}
            </ol>
            <p className="mt-6 flex items-center gap-2 text-sm text-offwhite/60">
              <Workflow className="size-4" /> Formats ouverts : GTFS (horaires théoriques) et GTFS-Realtime (positions, prévisions).
            </p>
          </div>
        </section>

        {/* ─────── Couverture ─────── */}
        <section id="couverture" className="py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Eyebrow>Couverture</Eyebrow>
            <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">Les réseaux en direct, maintenant.</h2>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-fg-muted">
              Cette liste est calculée à l’instant à partir des flux reçus : elle évolue au fil de la journée, et la nuit, la plupart des
              réseaux sont à l’arrêt.
            </p>
            <div className="mt-8">
              <LiveNetworks />
            </div>

            <div className="mt-12 rounded-2xl border border-alert/30 bg-alert/5 p-6">
              <h3 className="font-semibold text-fg">Pourquoi certaines grandes villes n’apparaissent pas</h3>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-fg-muted">
                Bus Radar ne peut afficher que ce qui est publié. Plusieurs grands réseaux diffusent des horaires en temps réel, mais pas la
                position de leurs véhicules en open data. Ils sont listés comme « Statique » dans l’application, jamais comme connectés.
              </p>
              <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                {MISSING.map(([name, why]) => (
                  <li key={name} className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-alert" />
                    <span>
                      <span className="font-medium text-fg">{name}</span> <span className="text-fg-muted">— {why}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ─────── Appel final ─────── */}
        <section className="px-4 pb-20 sm:px-6">
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-gradient-to-br from-deep to-night px-6 py-16 text-center text-offwhite sm:px-12">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_80%_at_50%_100%,rgb(41_199_201/0.25),transparent)]" />
            <h2 className="relative text-3xl font-semibold tracking-tight sm:text-4xl">Prêt à suivre les bus en direct ?</h2>
            <p className="relative mx-auto mt-4 max-w-xl text-offwhite/70">
              Ouvrez la carte, zoomez sur votre ville et cliquez sur un bus pour voir où il va.
            </p>
            <div className="relative mt-8 flex justify-center">
              <CTA>Ouvrir la carte</CTA>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 text-xs leading-relaxed text-fg-subtle sm:px-6 md:flex-row md:justify-between">
          <p>
            Données : <a className="underline decoration-dotted hover:text-fg" href="https://transport.data.gouv.fr" target="_blank" rel="noreferrer">transport.data.gouv.fr</a>{" "}
            (licences des producteurs : Licence Ouverte, ODbL, Licence Mobilités). Géocodage : Géoplateforme IGN.
          </p>
          <p>
            Fond de carte : <a className="underline decoration-dotted hover:text-fg" href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> ©{" "}
            <a className="underline decoration-dotted hover:text-fg" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">contributeurs OpenStreetMap</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
