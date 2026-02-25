# ⚠️ WORK IN PROGRESS ⚠️

> **WARNING:** This project is currently under active construction. Features may be unstable, and the UI is subject to change. Please do not use this yet.

---

# Maze Architect

A powerful, browser-based maze generator built for efficiency and visual precision. 

**Maze Architect** allows you to generate mazes using 10+ different algorithms, draw custom solution paths before generation, and export pixel-perfect bitmaps or optimized vectors for plotters and laser cutters.

## 🚀 Live Demo

[Maze Architect](https://andrematomer.github.io/maze-architect)

## ✨ Features

*   **10+ Generation Algorithms:** From the river-like flows of Recursive Backtracking to the uniform spread of Wilson's Algorithm.
*   **Custom Path Editor:** Draw your own solution line first, and let the maze generate around it. Perfect for creating hidden messages or specific difficulty curves.
*   **Pixel-Perfect Raster Export:** Downloads PNGs with exactly 1px walls and 3px corridors. No anti-aliasing blur.
*   **Optimized SVG Export:** Includes a "Greedy Line Merger" that combines straight wall segments into single paths, drastically reducing file size.
*   **Post-Processing:** Randomly erode walls to create "braid" mazes (mazes with loops).
*   **Responsive:** Works on any screen size.

## 🧠 Included Algorithms

We provide a variety of mathematical approaches to maze generation, simplified:

1.  **Recursive Backtracker:** "River-like." Long, winding passages with few dead ends.
2.  **Hunt & Kill:** similar to Backtracker but creates twistier layouts and is safer for massive grids.
3.  **Randomized Prim’s:** "Lightning-like." Branches out quickly from the center with many short dead ends.
4.  **Randomized Kruskal’s:** "Puzzle-like." Randomly connects walls until a maze forms; produces a very uniform look.
5.  **Aldous-Broder:** "The Drunkard." A random walker stumbles around until it visits every cell. (Slow on large grids).
6.  **Wilson’s:** "The Loop Eraser." Unbiased and uniform like Aldous-Broder, but faster.
7.  **Recursive Division:** "The Chamber." Starts with an empty room and slices it into smaller sections. Distinct "blocky" look.
8.  **Eller’s:** "The Infinite Scroll." Generates row by row; memory efficient.
9.  **Sidewinder:** "The Wind." Generates row by row with a strong vertical wind bias.
10. **Binary Tree:** "The Slope." Extremely fast, but every corridor leads diagonally (North-West bias).

## 🛠️ How to Run Locally

Because this project uses ES6 Modules (`type="module"`), modern browsers block opening it directly via `file://` due to CORS security. 

To run it locally, use a simple local web server:
*   **VS Code:** Install the "Live Server" extension and click "Go Live".
*   **Python:** Open terminal in the folder and run `python -m http.server 8000`, then visit `http://localhost:8000`.
*   **Node.js:** Run `npx serve`.