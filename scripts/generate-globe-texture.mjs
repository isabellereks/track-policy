#!/usr/bin/env node
// Generates equirectangular world map PNGs for the cobe globe texture.
// Usage: node scripts/generate-globe-texture.mjs

import { writeFileSync } from "fs";
import { createCanvas } from "canvas";
import { geoEquirectangular, geoPath } from "d3-geo";
import * as topojson from "topojson-client";

const WIDTH = 2048;
const HEIGHT = 1024;

const THEMES = {
  dark: {
    ocean: "#0a1832",
    border: "#123a1e",
    countries: [
      "#38a845", "#42b84e", "#30a03c", "#3db448",
      "#3aac47", "#46be52", "#34a440", "#40b64c",
      "#39aa46", "#44bc50", "#32a23e", "#3eb24a",
      "#38a845", "#42b84e", "#30a03c", "#3db448",
      "#3aac47", "#46be52", "#34a440", "#40b64c",
    ],
    output: "public/globe-map.png",
  },
  light: {
    ocean: "#7ec8e3",
    border: "#72b8d4",
    countries: [
      "#7ed67e", "#8ae08a", "#72ce72", "#84da84",
      "#7cd47c", "#8ee48e", "#76d076", "#88de88",
      "#7ad27a", "#8ce28c", "#70cc70", "#82d882",
      "#7ed67e", "#8ae08a", "#72ce72", "#84da84",
      "#7cd47c", "#8ee48e", "#76d076", "#88de88",
    ],
    output: "public/globe-map-light.png",
  },
};

async function main() {
  const res = await fetch(
    "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"
  );
  const world = await res.json();
  const countries = topojson.feature(world, world.objects.countries);

  for (const [name, theme] of Object.entries(THEMES)) {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext("2d");

    const projection = geoEquirectangular()
      .fitSize([WIDTH, HEIGHT], { type: "Sphere" });
    const path = geoPath(projection, ctx);

    ctx.fillStyle = theme.ocean;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    for (let i = 0; i < countries.features.length; i++) {
      const feature = countries.features[i];
      ctx.beginPath();
      path(feature);
      ctx.fillStyle = theme.countries[i % theme.countries.length];
      ctx.fill();
      ctx.strokeStyle = theme.border;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    const buffer = canvas.toBuffer("image/png");
    writeFileSync(theme.output, buffer);
    console.log(`Generated ${theme.output} (${name}, ${WIDTH}x${HEIGHT})`);
  }
}

main().catch(console.error);
