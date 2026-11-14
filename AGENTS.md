# AGENTS.md — PixelFix

## Project Purpose & Why
**PixelFix** is a client-side web application built to repair AI-generated and degraded pixel art for game engines (Godot), editors (Aseprite), game modding, and digital publishing.
AI-generated pixel art suffers from structural defects: **mixels** (inconsistent pixel sizes), **grid drift** (misaligned pixel cells), **sub-pixel blurring/anti-aliasing**, and **palette noise** (thousands of unintended color variations). PixelFix reconstructs a true, mathematically aligned 1:1 pixel grid and clean color palette directly in the browser.

## Core Engineering Principles
- **KISS, DRY, SOLID:**
  - **Single Responsibility:** Isolate image processing algorithms (`grid`, `sampler`, `quantizer`, `alpha`) into pure, stateless functions decoupled from DOM/UI logic.
  - **DRY (Don't Repeat Yourself):** Centralize pixel buffer (`Uint8ClampedArray`) iteration, coordinate math, and UI control bindings. Never duplicate transformation pipelines.
  - **Minimalism:** Write the smallest complete code that solves the problem. Zero unnecessary dependencies.
- **UI & Visual Standards:**
  - **SVG Icons Only:** Strictly use inline SVG icons for all UI controls and indicators. **Never use emojis** anywhere in the UI, code, or logs.
- **Platform & Deployment:**
  - **Target:** Static SPA deployed on **Vercel** (Vite + Vanilla TypeScript).
  - **100% Client-Side:** All image manipulation runs locally via HTML5 Canvas (`ImageData`) with `image-rendering: pixelated`.
- **Code Hygiene:**
  - Comment only the *why* behind non-obvious algorithmic decisions, in one concise line.
  - Validate trust boundaries (file uploads, image dimensions, grid bounds) to prevent browser crashes or memory exhaustion.
