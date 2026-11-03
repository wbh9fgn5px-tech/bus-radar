"use client";
/**
 * Icônes de véhicules générées à la demande (événement `styleimagemissing`).
 * Nom : v|<couleur hex>|<dir|nodir>|<0|1 (position ancienne)>
 *  - "dir"   : silhouette de bus vue de dessus avec nez pointé, orientée selon le cap.
 *  - "nodir" : pastille ronde — utilisée quand le cap est inconnu (aucune direction inventée).
 */
import { readableOn } from "./format";

export const DEFAULT_COLOR = "3478F6";
const STALE_COLOR = "8A94A6";

export function iconName(color: string | undefined, hasBearing: boolean, stale: boolean) {
  const c = stale ? STALE_COLOR : color && /^[0-9A-F]{6}$/i.test(color) ? color.toUpperCase() : DEFAULT_COLOR;
  return `v|${c}|${hasBearing ? "dir" : "nodir"}|${stale ? 1 : 0}`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawVehicleIcon(name: string, pixelRatio = 2): { width: number; height: number; data: Uint8ClampedArray } | null {
  const [, hex, kind, staleFlag] = name.split("|");
  if (!hex) return null;
  const S = 40 * pixelRatio;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(pixelRatio, pixelRatio);
  const fill = `#${hex}`;
  const fg = readableOn(hex);
  const stale = staleFlag === "1";
  ctx.globalAlpha = stale ? 0.75 : 1;
  ctx.shadowColor = "rgba(16,24,39,0.35)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;

  if (kind === "dir") {
    // Corps du bus (vue de dessus) + nez directionnel, orienté vers le haut (cap 0°).
    ctx.beginPath();
    ctx.moveTo(20, 4); // pointe
    ctx.lineTo(28, 12);
    ctx.lineTo(28, 33);
    ctx.quadraticCurveTo(28, 36, 25, 36);
    ctx.lineTo(15, 36);
    ctx.quadraticCurveTo(12, 36, 12, 33);
    ctx.lineTo(12, 12);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    // Pare-brise
    ctx.fillStyle = fg;
    ctx.globalAlpha = (stale ? 0.75 : 1) * 0.9;
    ctx.beginPath();
    ctx.moveTo(20, 9.5);
    ctx.lineTo(24.5, 14);
    ctx.lineTo(15.5, 14);
    ctx.closePath();
    ctx.fill();
    // Toit
    ctx.globalAlpha = (stale ? 0.75 : 1) * 0.35;
    roundRect(ctx, 16, 18, 8, 13, 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(20, 20, 9, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(20, 20, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return { width: S, height: S, data: ctx.getImageData(0, 0, S, S).data };
}
