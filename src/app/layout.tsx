import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "پنل Onvioo", template: "%s | پنل Onvioo" },
  description: "مدیریت محتوا، مشتریان و تیم Onvioo",
  appleWebApp: { capable: true, title: "Onvioo", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1016" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fa" dir="rtl" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
