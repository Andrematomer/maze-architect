import { Grid } from './grid.js';
import * as Algo from './algorithms/generator.js';

// --- CONFIG ---
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const ui = {
    cols: document.getElementById('inp-cols'),
    rows: document.getElementById('inp-rows'),
    algo: document.getElementById('sel-algo'),
    speed: document.getElementById('inp-speed'),
    loops: document.getElementById('inp-loops'),
    btnGen: document.getElementById('btn-generate'),
    btnPause: document.getElementById('btn-pause'),
    status: document.getElementById('status-text'),
    tools: {
        pencil: document.getElementById('btn-tool-pencil'),
        eraser: document.getElementById('btn-tool-eraser'),
        clear: document.getElementById('btn-tool-clear'),
        warning: document.getElementById('path-warning')
    },
    export: {
        svg: document.getElementById('btn-exp-svg'),
        png: document.getElementById('btn-exp-png'),
        join: document.getElementById('sel-join'),
        solve: document.getElementById('chk-solve')
    }
};

let grid;
let cellSize;
let isPaused = false;
let isGenerating = false;
let toolMode = null; // 'pencil' | 'eraser' | null
let customPathPoints = []; // List of cells in order
let lastDrawnCell = null;

// --- INITIALIZATION ---

function init() {
    resize();
    setupGrid();
    window.addEventListener('resize', () => { resize(); draw(); });
}

function resize() {
    const parent = document.getElementById('viewport');
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;
}

function setupGrid() {
    const cols = parseInt(ui.cols.value);
    const rows = parseInt(ui.rows.value);
    grid = new Grid(cols, rows);
    
    // Calculate cell size to fit nicely
    const maxW = canvas.width - 40;
    const maxH = canvas.height - 40;
    cellSize = Math.floor(Math.min(maxW/cols, maxH/rows));
    if(cellSize < 4) cellSize = 4; // Min size

    // Center grid
    const gridW = cols * cellSize;
    const gridH = rows * cellSize;
    ctx.translate(Math.floor((canvas.width - gridW)/2) + 0.5, Math.floor((canvas.height - gridH)/2) + 0.5);

    draw();
}

// --- DRAWING ---

function draw() {
    // Clear whole canvas (accounting for translate)
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.fillStyle = "#fff"; // Paper color
    ctx.fillRect(0,0,canvas.width, canvas.height);
    ctx.restore();

    if(!grid) return;

    // Draw Cells
    for(let c of grid.cells) {
        let x = c.i * cellSize;
        let y = c.j * cellSize;

        // Backgrounds
        if (c.visited) {
            ctx.fillStyle = "#fff";
        } else {
            ctx.fillStyle = "#e0e0e0"; // Unvisited gray
        }
        ctx.fillRect(x, y, cellSize, cellSize);

        // Custom Path Highlight
        if(c.isCustomPath) {
             ctx.fillStyle = "rgba(255, 0, 0, 0.1)";
             ctx.fillRect(x, y, cellSize, cellSize);
        }

        // Walls
        ctx.strokeStyle = "#000";
        ctx.lineWidth = Math.max(1, Math.floor(cellSize/10));
        ctx.beginPath();
        if(c.walls[0]) { ctx.moveTo(x,y); ctx.lineTo(x+cellSize, y); }
        if(c.walls[1]) { ctx.moveTo(x+cellSize,y); ctx.lineTo(x+cellSize, y+cellSize); }
        if(c.walls[2]) { ctx.moveTo(x+cellSize,y+cellSize); ctx.lineTo(x, y+cellSize); }
        if(c.walls[3]) { ctx.moveTo(x,y+cellSize); ctx.lineTo(x, y); }
        ctx.stroke();
    }

    // Draw Solution (Red Line) - Pixel Perfect Logic
    // If Custom Path exists or Solved
    if (customPathPoints.length > 1 || ui.export.solve.checked) {
        drawSolutionLine();
    }
}

function drawSolutionLine() {
    ctx.strokeStyle = "red";
    // Scale line width for viewing, but keep logic simple
    ctx.lineWidth = Math.max(2, cellSize / 4);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();

    // If visualizing custom path creation
    if (customPathPoints.length > 0) {
        let start = customPathPoints[0];
        ctx.moveTo(start.i*cellSize + cellSize/2, start.j*cellSize + cellSize/2);
        for(let i=1; i<customPathPoints.length; i++) {
            let p = customPathPoints[i];
            ctx.moveTo(customPathPoints[i-1].i*cellSize + cellSize/2, customPathPoints[i-1].j*cellSize + cellSize/2); // Gap fix
            ctx.lineTo(p.i*cellSize + cellSize/2, p.j*cellSize + cellSize/2);
        }
    }
    // TODO: Generic solver for generated mazes would go here
    ctx.stroke();
}

// --- GENERATION LOOP ---

async function generate() {
    if(isGenerating) return;
    
    // Check Custom Path Compatibility
    const algoKey = ui.algo.value;
    if(customPathPoints.length > 0) {
        const forbidden = ['division', 'eller', 'sidewinder', 'binary'];
        if(forbidden.includes(algoKey)) {
            showToast(`Error: ${algoKey} cannot rely on custom paths. Clear path or change algo.`);
            return;
        }
    }

    isGenerating = true;
    ui.status.innerText = "Generating...";
    ui.btnGen.disabled = true;
    ui.btnPause.disabled = false;
    
    // Reset but keep custom path walls open
    let oldPath = [...customPathPoints];
    grid.cells.forEach(c => {
        c.visited = false;
        c.walls = [true,true,true,true];
    });

    // Re-carve custom path
    if(oldPath.length > 0) {
        for(let i=0; i<oldPath.length-1; i++) {
            let a = grid.getCell(oldPath[i].i, oldPath[i].j);
            let b = grid.getCell(oldPath[i+1].i, oldPath[i+1].j);
            a.isCustomPath = true;
            b.isCustomPath = true;
            grid.removeWall(a, b);
        }
    }

    // Select Algo
    const strategies = {
        'dfs': Algo.algoDFS,
        'prims': Algo.algoPrims,
        'kruskal': Algo.algoKruskal,
        'huntkill': Algo.algoHuntKill,
        'aldous': Algo.algoAldous,
        'wilson': Algo.algoWilson,
        'division': Algo.algoDivision,
        'eller': Algo.algoEller,
        'sidewinder': Algo.algoSidewinder,
        'binary': Algo.algoBinary
    };

    // Run Algo
    try {
        await strategies[algoKey](grid, () => {
             // Basic redraw throttling could go here
             draw(); 
        }, checkPause);
    } catch (e) {
        console.error(e);
        showToast("Error during generation");
    }

    // Post Process: Loop Eraser
    const loopP = parseInt(ui.loops.value);
    if(loopP > 0 && customPathPoints.length === 0) {
        // Randomly remove internal walls
        grid.cells.forEach(c => {
             if(Math.random() * 100 < loopP) {
                 // pick random wall that isn't border
                 let w = Math.floor(Math.random()*4);
                 // safety checks omitted for brevity, simple removal
                 if(c.i>0 && w===3) c.walls[3] = false;
                 if(c.i<grid.cols-1 && w===1) c.walls[1] = false;
                 if(c.j>0 && w===0) c.walls[0] = false;
                 if(c.j<grid.rows-1 && w===2) c.walls[2] = false;
             }
        });
        draw();
    }

    isGenerating = false;
    ui.status.innerText = "Done";
    ui.btnGen.disabled = false;
    ui.btnPause.disabled = true;
}

// Pause Logic
async function checkPause() {
    // 100 speed = 0 delay, 1 speed = 500ms
    let ms = (100 - parseInt(ui.speed.value)) * 5;
    if (ms > 0) await Algo.sleep(ms);
    
    while(isPaused) {
        await Algo.sleep(100);
    }
}

// --- CUSTOM PATH TOOL ---

function handleCanvasClick(e) {
    if(!toolMode || isGenerating) return;

    const rect = canvas.getBoundingClientRect();
    // Reverse Translate
    const startX = (canvas.width - (grid.cols * cellSize)) / 2;
    const startY = (canvas.height - (grid.rows * cellSize)) / 2;
    
    const x = e.clientX - rect.left - startX;
    const y = e.clientY - rect.top - startY;
    
    const i = Math.floor(x / cellSize);
    const j = Math.floor(y / cellSize);
    
    const cell = grid.getCell(i, j);
    if(!cell) return;

    if(toolMode === 'pencil') {
        addPathPoint(cell);
    } else if(toolMode === 'eraser') {
        // Logic to remove point and break path
        const idx = customPathPoints.indexOf(cell);
        if(idx > -1) {
            customPathPoints.splice(idx, 1);
            cell.isCustomPath = false;
            // Reset neighboring walls logic required, 
            // but for simple UI, we just rebuild visual on Generate
            draw();
        }
    }
}

function addPathPoint(cell) {
    // If first point
    if(customPathPoints.length === 0) {
        customPathPoints.push(cell);
        cell.isCustomPath = true;
        draw();
        return;
    }

    // Get last point
    const last = customPathPoints[customPathPoints.length-1];
    
    // Validate: Manhattan connection (no diagonals)
    // We auto-route using simple Manhattan steps
    let curr = last;
    let target = cell;
    
    // Prevent loops/intersection
    if(cell.isCustomPath) {
        showToast("Path cannot intersect itself!");
        return;
    }

    // Draw steps
    let dx = Math.sign(target.i - curr.i);
    let dy = Math.sign(target.j - curr.j);

    // Simple routing: Move X then Y
    // TODO: Improve to ZigZag if needed
    let tempPoints = [];
    let cx = curr.i, cy = curr.j;
    
    while(cx !== target.i) {
        cx += dx;
        let c = grid.getCell(cx, cy);
        if(c.isCustomPath) { showToast("Path intersects!"); return; }
        tempPoints.push(c);
    }
    while(cy !== target.j) {
        cy += dy;
        let c = grid.getCell(cx, cy);
        if(c.isCustomPath) { showToast("Path intersects!"); return; }
        tempPoints.push(c);
    }

    // Apply
    tempPoints.forEach(p => {
        p.isCustomPath = true;
        customPathPoints.push(p);
    });
    
    draw();
}

// --- EXPORT SVG (Optimized) ---
function exportSVG() {
    const w = grid.cols * cellSize;
    const h = grid.rows * cellSize;
    const join = ui.export.join.value;
    
    // Greedy Line Merger
    let lines = [];
    
    // Horizontal Pass (Top Walls)
    for(let j=0; j<grid.rows; j++) {
        let start = -1;
        for(let i=0; i<grid.cols; i++) {
            let c = grid.getCell(i,j);
            if(c.walls[0]) {
                if(start === -1) start = i;
            } else {
                if(start !== -1) {
                    lines.push(`<line x1="${start*cellSize}" y1="${j*cellSize}" x2="${i*cellSize}" y2="${j*cellSize}" />`);
                    start = -1;
                }
            }
        }
        if(start !== -1) lines.push(`<line x1="${start*cellSize}" y1="${j*cellSize}" x2="${grid.cols*cellSize}" y2="${j*cellSize}" />`);
    }
    // Bottom Border (Last Row)
    lines.push(`<line x1="0" y1="${grid.rows*cellSize}" x2="${grid.cols*cellSize}" y2="${grid.rows*cellSize}" />`);

    // Vertical Pass (Left Walls)
    for(let i=0; i<grid.cols; i++) {
        let start = -1;
        for(let j=0; j<grid.rows; j++) {
            let c = grid.getCell(i,j);
            if(c.walls[3]) {
                if(start === -1) start = j;
            } else {
                if(start !== -1) {
                    lines.push(`<line x1="${i*cellSize}" y1="${start*cellSize}" x2="${i*cellSize}" y2="${j*cellSize}" />`);
                    start = -1;
                }
            }
        }
        if(start !== -1) lines.push(`<line x1="${i*cellSize}" y1="${start*cellSize}" x2="${i*cellSize}" y2="${grid.rows*cellSize}" />`);
    }
    // Right Border
    lines.push(`<line x1="${grid.cols*cellSize}" y1="0" x2="${grid.cols*cellSize}" y2="${grid.rows*cellSize}" />`);

    // Add Solution if checked
    let solutionPoly = "";
    if(ui.export.solve.checked && customPathPoints.length > 0) {
        let points = customPathPoints.map(p => `${p.i*cellSize + cellSize/2},${p.j*cellSize + cellSize/2}`).join(" ");
        solutionPoly = `<polyline points="${points}" stroke="red" stroke-width="${cellSize/3}" fill="none" stroke-linejoin="${join}" stroke-linecap="round" opacity="0.7"/>`;
    }

    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">
        <rect width="100%" height="100%" fill="white"/>
        <g stroke="black" stroke-width="${Math.max(2, cellSize/10)}" stroke-linecap="square" stroke-linejoin="${join}">
            ${lines.join('\n')}
        </g>
        ${solutionPoly}
    </svg>`;
    
    download("maze.svg", svg, "image/svg+xml");
}

// --- EXPORT PNG (Pixel Perfect) ---
function exportPNG() {
    // 1px Wall, 3px Floor -> 4px Cell
    const scale = 4; 
    const w = grid.cols * scale + 1;
    const h = grid.rows * scale + 1;
    
    const oc = document.createElement('canvas');
    oc.width = w; oc.height = h;
    const ctx = oc.getContext('2d');
    
    // Fill Black (Walls)
    ctx.fillStyle = "black";
    ctx.fillRect(0,0,w,h);
    
    // Carve White (Floors)
    ctx.fillStyle = "white";
    for(let c of grid.cells) {
        let x = c.i * scale + 1; // 1px offset for left wall
        let y = c.j * scale + 1;
        
        // Floor center 3x3
        ctx.fillRect(x, y, 3, 3);
        
        // Open walls (Right and Bottom only needed if we iterate all)
        if(!c.walls[1]) ctx.fillRect(x+3, y, 1, 3); // Right
        if(!c.walls[2]) ctx.fillRect(x, y+3, 3, 1); // Bottom
    }

    // Draw Solution (Single red pixel in middle)
    if(ui.export.solve.checked && customPathPoints.length > 0) {
        ctx.fillStyle = "red";
        for(let i=0; i<customPathPoints.length; i++) {
            let c = customPathPoints[i];
            let cx = c.i * scale + 2; // Pixel 2 (0=wall, 1=floor, 2=mid, 3=floor)
            let cy = c.j * scale + 2;
            
            ctx.fillRect(cx, cy, 1, 1); // The point
            
            // Connect to next
            if(i < customPathPoints.length-1) {
                let n = customPathPoints[i+1];
                let nx = n.i * scale + 2;
                let ny = n.j * scale + 2;
                
                // Draw line between cx,cy and nx,ny (Manhattan only)
                if(cx < nx) ctx.fillRect(cx, cy, (nx-cx)+1, 1);
                else if(cx > nx) ctx.fillRect(nx, ny, (cx-nx)+1, 1);
                else if(cy < ny) ctx.fillRect(cx, cy, 1, (ny-cy)+1);
                else if(cy > ny) ctx.fillRect(cx, ny, 1, (cy-ny)+1);
            }
        }
    }

    const a = document.createElement('a');
    a.download = "maze_pixel.png";
    a.href = oc.toDataURL("image/png");
    a.click();
}

function download(name, content, type) {
    const blob = new Blob([content], {type: type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
}

function showToast(msg) {
    const d = document.createElement('div');
    d.className = 'toast';
    d.innerText = msg;
    document.getElementById('toast-container').appendChild(d);
    setTimeout(()=>d.remove(), 3000);
}

// --- EVENTS ---

ui.btnGen.onclick = generate;
ui.btnPause.onclick = () => { isPaused = !isPaused; };

// Inputs
ui.cols.onchange = setupGrid;
ui.rows.onchange = setupGrid;
ui.loops.oninput = (e) => document.getElementById('lbl-loops').innerText = e.target.value + "%";
ui.speed.oninput = (e) => {
    let v = e.target.value;
    document.getElementById('lbl-speed').innerText = v > 90 ? "Instant" : (v < 20 ? "Slow" : "Normal");
};

// Tools
const setTool = (t) => {
    toolMode = toolMode === t ? null : t;
    ui.tools.pencil.classList.toggle('active', toolMode==='pencil');
    ui.tools.eraser.classList.toggle('active', toolMode==='eraser');
    
    if(toolMode) {
        customPathPoints = []; // Reset on new start for simplicity or keep? Keep is better.
        setupGrid(); // Clear maze but keep custom path logic
        ui.tools.warning.classList.remove('hidden');
    } else {
        ui.tools.warning.classList.add('hidden');
    }
};

ui.tools.pencil.onclick = () => setTool('pencil');
ui.tools.eraser.onclick = () => setTool('eraser');
ui.tools.clear.onclick = () => { customPathPoints = []; setupGrid(); };

canvas.addEventListener('mousedown', handleCanvasClick);

// Export
ui.export.svg.onclick = exportSVG;
ui.export.png.onclick = exportPNG;

init();