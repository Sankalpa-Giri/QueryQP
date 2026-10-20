import "./globals.css";
import { Providers } from "./providers";

export const metadata = {
  title: "PYQ Recommender | Academic Previous Year Question System",
  description: "Search and retrieve previous-year university exam questions with verifiable source provenance.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

