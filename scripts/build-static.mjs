import { cp, mkdir } from "node:fs/promises";

await mkdir("static", { recursive: true });
await cp("public", "static", { recursive: true });
console.log("Static PITCHIT site is ready in static/");
