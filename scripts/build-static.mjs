import { cp, mkdir } from "node:fs/promises";

await mkdir("static", { recursive: true });
await cp("public", "static", { recursive: true });
// GitHub Pages serves static/index.html at the project root. Keep that entry
// point identical to the current game instead of leaving an old hand-written
// copy there after the public assets have been refreshed.
await cp("public/game/index.html", "static/index.html");
console.log("Static PITCHIT site is ready in static/");
