#!/usr/bin/env -S deno run -A --watch=static/,routes/

import { Builder } from "fresh/dev";
import { openTunnel } from "@hongminhee/localtunnel";

const builder = new Builder();

if (Deno.args.includes("build")) {
  await builder.build();
} else {
  // Start Fresh dev server
  const controller = new AbortController();
  const { signal } = controller;
  
  const serverPromise = builder.listen(() => import("./main.ts"), {
    port: 8000,
    signal,
  }).catch(err => {
    if (err.name !== "AbortError") throw err;
  });
  
  // Wait for server to be ready
  console.log("Starting Fresh dev server...");
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Open tunnel
  try {
    const tunnel = await openTunnel({ port: 8000 });
    console.log("\n🌐 Tunnel URL: %c%s", "color: blue; font-weight: bold;", tunnel.url.href);
    Deno.env.set("TUNNEL_URL", tunnel.url.href);
    
    // Graceful shutdown
    for (const sig of ["SIGINT", "SIGTERM"]) {
      Deno.addSignalListener(sig as any, async () => {
        console.log(`\n${sig} received, closing tunnel...`);
        await tunnel.close();
        controller.abort();
        Deno.exit(0);
      });
    }
    
    await serverPromise;
  } catch (error) {
    console.error("Failed to create tunnel:", error);
    controller.abort();
    Deno.exit(1);
  }
}