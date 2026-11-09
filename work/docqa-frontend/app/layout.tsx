import "./globals.css";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Providers } from "./providers";
import { IntroProvider } from "../components/intro";

export const metadata = {
  title: "QueryQP | Academic Previous Year Question System",
  description: "Search and retrieve previous-year university exam questions with verifiable source provenance.",
};

export const viewport = {
  themeColor: "#0D0D0D",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen bg-ground font-sans text-ink antialiased">
        <IntroProvider>
          <Providers>{children}</Providers>
        </IntroProvider>
      </body>
    </html>
  );
}
