import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "پنل Onvioo",
    short_name: "Onvioo",
    description: "مدیریت محتوا، مشتریان و تیم Onvioo",
    lang: "fa",
    dir: "rtl",
    start_url: "/",
    display: "standalone",
    background_color: "#0c1124",
    theme_color: "#0c1124",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
