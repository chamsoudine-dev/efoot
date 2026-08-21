export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48) || "coupe";
}

export function fcfa(n: number) {
  return `${Number(n || 0).toLocaleString("fr-FR")} FCFA`;
}

export function digits(s: string) {
  return String(s || "").replace(/\D/g, "");
}
