import type { Metadata } from "next";
import { RadarApp } from "@/components/radar/RadarApp";

export const metadata: Metadata = {
  title: "Carte en direct — Bus Radar France",
  description: "Carte en temps réel des bus et autocars en France, à partir des flux GTFS-Realtime open data.",
};

export default function CartePage() {
  return <RadarApp />;
}
