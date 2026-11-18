import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, type PluginOption } from "vite";

export default defineConfig(({ command }) => {
  const plugins: PluginOption[] = [
    tailwindcss(),
    // src/server.ts is the SSR entry that renders the 500 error page.
    tanstackStart({ server: { entry: "server" } }),
  ];

  // Production builds emit a self-contained Node server in .output/.
  // Set NITRO_PRESET (vercel, netlify, cloudflare-module…) to target another host.
  if (command === "build") plugins.push(nitro({ defaultPreset: "node-server" }));

  plugins.push(viteReact());

  return {
    resolve: { tsconfigPaths: true },
    plugins,
    server: { host: "0.0.0.0", port: 3000 },
  };
});
