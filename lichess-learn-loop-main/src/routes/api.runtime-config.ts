import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/runtime-config")({
  server: {
    handlers: {
      GET: async () => {
        const config = {
          supabaseUrl: process.env.VITE_SUPABASE_URL ?? "",
          supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY ?? "",
        };

        return Response.json(config, {
          headers: {
            "Cache-Control": "no-store, max-age=0",
          },
        });
      },
    },
  },
});
