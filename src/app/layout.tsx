import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "EFootLigue — Championnats eFootball",
  description: "Plateforme de championnats eFootball"
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, padding: 0, backgroundColor: "#0E1712", color: "#F3F1E7" }}>
        {children}
      </body>
    </html>
  );
}
