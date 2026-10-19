import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "پنل Onvioo", template: "%s | پنل Onvioo" },
  description: "مدیریت محتوا، مشتریان و تیم Onvioo",
  appleWebApp: { capable: true, title: "Onvioo", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0c1124",
};

// Applies the saved theme before first paint so the page never flashes the wrong one
const THEME_SCRIPT = `try{if(localStorage.getItem("theme")==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fa" dir="rtl" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
