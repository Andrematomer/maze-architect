import { Grid } from './grid.js';
import * as Algo from './algorithms/generator.js';

// --- CONFIG ---
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Safely map UI elements
const ui = {
    cols: document.getElementById('inp-cols'),
    rows: document.getElementById('inp-rows'),
    lock: document.getElementById('btn-lock-ratio'),
    algo: document.getElementById('sel-algo'),
    speed: document.getElementById('inp-speed'),
    loops: document.getElementById('inp-loops'),
    btnGen: document.getElementById('btn-generate'),
    status: document.getElementById('status-text'),
    tools: {
        pencil: document.getElementById('btn-tool-pencil'),
        eraser: document.getElementById('btn-tool-eraser'),
        clear: document.getElementById('btn-tool-clear'),
        warning: document.getElementById('path-warning')
    },
    output: { // renamed from 'export' to avoid strict module conflicts
        svg: document.getElementById('btn-exp-svg'),
        png: document.getElementById('btn-exp-png'),
        join: document.getElementById('sel-join'),
        solve: document.getElementById('chk-solve')
    }
};

let grid;
let cellSize;
let offsetX = 0;
let offsetY = 0;

let isGenerating = false;
let currentGenId = 0; 
let toolMode = null; 
let customPathPoints = []; 

let isRatioLocked = false;
let lockedRatio = 1;

let startCoords = {i: 0, j: 0};
let goalCoords = {i: 1, j: 1}; 
let draggingNode = null; 
let solutionPath = [];

let originalWalls = [];
let removableWallPool = [];

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
    let cols = parseInt(ui.cols.value) || 20;
    let rows = parseInt(ui.rows.value) || 20;
    if(cols < 2) { cols = 2; ui.cols.value = 2; }
    if(rows < 2) { rows = 2; ui.rows.value = 2; }

    grid = new Grid(cols, rows);
    
    if(startCoords.i >= cols) startCoords.i = cols - 1;
    if(startCoords.j >= rows) startCoords.j = rows - 1;
    if(goalCoords.i >= cols) goalCoords.i = cols - 1;
    if(goalCoords.j >= rows) goalCoords.j = rows - 1;
    
    if(goalCoords.i === 1 && goalCoords.j === 1 && cols > 2) {
        goalCoords = {i: cols-1, j: rows-1};
    }

    solutionPath = [];
    originalWalls = [];
    removableWallPool = [];
    draw();
}

// --- DRAWING ---

function draw() {
    if(!grid) return;
    
    ctx.fillStyle = "#fff";
    ctx.fillRect(0,0,canvas.width, canvas.height);

    const maxW = canvas.width - 40;
    const maxH = canvas.height - 40;
    cellSize = Math.floor(Math.min(maxW/grid.cols, maxH/grid.rows));
    if(cellSize < 4) cellSize = 4;

    const gridW = grid.cols * cellSize;
    const gridH = grid.rows * cellSize;
    offsetX = Math.floor((canvas.width - gridW)/2);
    offsetY = Math.floor((canvas.height - gridH)/2);

    for(let c of grid.cells) {
        let x = offsetX + c.i * cellSize;
        let y = offsetY + c.j * cellSize;
        ctx.fillStyle = c.visited ? "#fff" : "#e0e0e0";
        ctx.fillRect(x, y, cellSize, cellSize);

        if(c.isCustomPath) {
             ctx.fillStyle = "rgba(255, 0, 0, 0.1)";
             ctx.fillRect(x, y, cellSize, cellSize);
        }
    }

    ctx.strokeStyle = "#000";
    ctx.lineCap = "square"; 
    ctx.lineWidth = Math.max(1, Math.floor(cellSize/10));
    ctx.beginPath();
    for(let c of grid.cells) {
        let x = offsetX + c.i * cellSize;
        let y = offsetY + c.j * cellSize;
        if(c.walls[0]) { ctx.moveTo(x,y); ctx.lineTo(x+cellSize, y); }
        if(c.walls[1]) { ctx.moveTo(x+cellSize,y); ctx.lineTo(x+cellSize, y+cellSize); }
        if(c.walls[2]) { ctx.moveTo(x+cellSize,y+cellSize); ctx.lineTo(x, y+cellSize); }
        if(c.walls[3]) { ctx.moveTo(x,y+cellSize); ctx.lineTo(x, y); }
    }
    ctx.stroke();

    const solveEnabled = ui.output.solve && ui.output.solve.checked;
    const joinStyle = ui.output.join ? ui.output.join.value : 'round';

    if (solveEnabled && solutionPath.length > 0) {
        ctx.strokeStyle = "red";
        ctx.lineWidth = Math.max(2, cellSize / 4);
        ctx.lineJoin = joinStyle;
        ctx.lineCap = joinStyle === 'round' ? 'round' : 'square';
        ctx.beginPath();
        let start = solutionPath[0];
        ctx.moveTo(offsetX + start.i*cellSize + cellSize/2, offsetY + start.j*cellSize + cellSize/2);
        for(let i=1; i<solutionPath.length; i++) {
            let p = solutionPath[i];
            ctx.lineTo(offsetX + p.i*cellSize + cellSize/2, offsetY + p.j*cellSize + cellSize/2);
        }
        ctx.stroke();
    } else if (customPathPoints.length > 0) {
        ctx.strokeStyle = "red";
        ctx.lineWidth = Math.max(2, cellSize / 4);
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();
        let start = customPathPoints[0];
        ctx.moveTo(offsetX + start.i*cellSize + cellSize/2, offsetY + start.j*cellSize + cellSize/2);
        for(let i=1; i<customPathPoints.length; i++) {
            let p = customPathPoints[i];
            ctx.lineTo(offsetX + p.i*cellSize + cellSize/2, offsetY + p.j*cellSize + cellSize/2);
        }
        ctx.stroke();
    }

    if (solveEnabled) {
        ctx.font = `${Math.max(12, cellSize * 0.7)}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🐒", offsetX + startCoords.i * cellSize + cellSize/2, offsetY + startCoords.j * cellSize + cellSize/2 + 2);
        ctx.fillText("🍌", offsetX + goalCoords.i * cellSize + cellSize/2, offsetY + goalCoords.j * cellSize + cellSize/2 + 2);
    }
}

// --- SOLVER (BFS) ---

function solveMaze() {
    solutionPath = [];
    if (!ui.output.solve || !ui.output.solve.checked) return;

    let queue = [[grid.getCell(startCoords.i, startCoords.j)]];
    let visited = new Set();
    visited.add(`${startCoords.i},${startCoords.j}`);

    while (queue.length > 0) {
        let path = queue.shift();
        let current = path[path.length - 1];

        if (current.i === goalCoords.i && current.j === goalCoords.j) {
            solutionPath = path;
            return;
        }

        let ns = [];
        if (!current.walls[0]) ns.push(grid.getCell(current.i, current.j - 1));
        if (!current.walls[1]) ns.push(grid.getCell(current.i + 1, current.j));
        if (!current.walls[2]) ns.push(grid.getCell(current.i, current.j + 1));
        if (!current.walls[3]) ns.push(grid.getCell(current.i - 1, current.j));

        for (let n of ns) {
            if (n && !visited.has(`${n.i},${n.j}`)) {
                visited.add(`${n.i},${n.j}`);
                queue.push([...path, n]);
            }
        }
    }
}

// --- GENERATION LOOP ---

async function generate() {
    currentGenId++;
    const myGenId = currentGenId;
    isGenerating = true;
    
    const algoKey = ui.algo.value;
    if(customPathPoints.length > 0) {
        const forbidden = ['division', 'eller', 'sidewinder', 'binary'];
        if(forbidden.includes(algoKey)) {
            showToast(`Error: ${algoKey} cannot rely on custom paths.`);
            isGenerating = false;
            return;
        }
    }

    ui.status.innerText = "Generating...";
    ui.btnGen.innerText = "INTERRUPT & RESTART";
    ui.btnGen.classList.add('active'); 
    
    let oldPath = [...customPathPoints];
    grid.cells.forEach(c => {
        c.visited = false;
        c.walls = [true,true,true,true];
    });

    if(oldPath.length > 0) {
        for(let i=0; i<oldPath.length-1; i++) {
            let a = grid.getCell(oldPath[i].i, oldPath[i].j);
            let b = grid.getCell(oldPath[i+1].i, oldPath[i+1].j);
            if(a && b) {
                a.isCustomPath = true; b.isCustomPath = true;
                grid.removeWall(a, b);
            }
        }
    }

    const strategies = {
        'dfs': Algo.algoDFS, 'prims': Algo.algoPrims, 'kruskal': Algo.algoKruskal,
        'huntkill': Algo.algoHuntKill, 'aldous': Algo.algoAldous, 'wilson': Algo.algoWilson,
        'division': Algo.algoDivision, 'eller': Algo.algoEller, 'sidewinder': Algo.algoSidewinder,
        'binary': Algo.algoBinary
    };

    const checkPause = async () => {
        if(myGenId !== currentGenId) throw "ABORT";
        let speed = parseInt(ui.speed.value);
        if (speed < 100) await Algo.sleep((100 - speed) * 5);
    };

    try {
        await strategies[algoKey](grid, () => {
             if(parseInt(ui.speed.value) < 100 || Math.random() < 0.05) draw();
        }, checkPause);
    } catch (e) {
        if(e === "ABORT") return; 
        console.error(e);
        showToast("Error during generation");
    }

    originalWalls = grid.cells.map(c => [...c.walls]);
    removableWallPool = [];
    for(let c of grid.cells) {
        if(c.i < grid.cols-1 && c.walls[1]) removableWallPool.push({c1: c, w1: 1, c2: grid.getCell(c.i+1, c.j), w2: 3});
        if(c.j < grid.rows-1 && c.walls[2]) removableWallPool.push({c1: c, w1: 2, c2: grid.getCell(c.i, c.j+1), w2: 0});
    }
    removableWallPool.sort(() => Math.random() - 0.5); 

    applyEraser(); 
    
    isGenerating = false;
    ui.status.innerText = "Done";
    ui.btnGen.innerText = "GENERATE MAZE";
    ui.btnGen.classList.remove('active');
}

function applyEraser() {
    if(originalWalls.length === 0) return;

    grid.cells.forEach((c, idx) => c.walls = [...originalWalls[idx]]);
    
    let percent = parseInt(ui.loops.value);
    document.getElementById('lbl-loops').innerText = percent + "%";
    
    let limit = Math.floor(removableWallPool.length * (percent / 100));
    for(let i=0; i<limit; i++) {
        let p = removableWallPool[i];
        p.c1.walls[p.w1] = false;
        p.c2.walls[p.w2] = false;
    }
    
    solveMaze();
    draw();
}

// --- EVENT LISTENERS (Robust Registration) ---

if(ui.lock) {
    ui.lock.addEventListener('click', () => {
        isRatioLocked = !isRatioLocked;
        ui.lock.classList.toggle('active', isRatioLocked);
        if(isRatioLocked) lockedRatio = parseInt(ui.cols.value) / parseInt(ui.rows.value);
    });
}

if(ui.cols) {
    ui.cols.addEventListener('input', () => {
        if(parseInt(ui.cols.value) < 2) ui.cols.value = 2;
        if(isRatioLocked) ui.rows.value = Math.max(2, Math.round(parseInt(ui.cols.value) / lockedRatio));
        setupGrid();
    });
}

if(ui.rows) {
    ui.rows.addEventListener('input', () => {
        if(parseInt(ui.rows.value) < 2) ui.rows.value = 2;
        if(isRatioLocked) ui.cols.value = Math.max(2, Math.round(parseInt(ui.rows.value) * lockedRatio));
        setupGrid();
    });
}

if(ui.output.solve) ui.output.solve.addEventListener('change', () => { solveMaze(); draw(); });
if(ui.output.join) ui.output.join.addEventListener('change', draw);
if(ui.loops) ui.loops.addEventListener('input', applyEraser);
if(ui.btnGen) ui.btnGen.addEventListener('click', generate);

if(ui.speed) {
    ui.speed.addEventListener('input', (e) => { 
        document.getElementById('lbl-speed').innerText = e.target.value > 90 ? "Instant" : (e.target.value < 20 ? "Slow" : "Normal"); 
    });
}

// --- MOUSE & TOOL INTERACTION ---

function getCellFromMouse(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - offsetX;
    const y = e.clientY - rect.top - offsetY;
    const i = Math.floor(x / cellSize);
    const j = Math.floor(y / cellSize);
    return grid.getCell(i, j);
}

canvas.addEventListener('mousedown', (e) => {
    const cell = getCellFromMouse(e);
    if(!cell) return;

    if(ui.output.solve && ui.output.solve.checked) {
        if(cell.i === startCoords.i && cell.j === startCoords.j) { draggingNode = 'start'; return; }
        if(cell.i === goalCoords.i && cell.j === goalCoords.j) { draggingNode = 'goal'; return; }
    }

    if(!toolMode || isGenerating) return;
    
    if(toolMode === 'pencil') {
        if(customPathPoints.length > 0) {
            let last = customPathPoints[customPathPoints.length-1];
            if(cell.isCustomPath) { showToast("Cannot intersect path!"); return; }
            
            let dx = Math.sign(cell.i - last.i);
            let dy = Math.sign(cell.j - last.j);
            let cx = last.i, cy = last.j;
            
            while(cx !== cell.i) {
                cx += dx;
                let c = grid.getCell(cx, cy);
                if(c.isCustomPath) { showToast("Intersection!"); return; }
                c.isCustomPath = true; customPathPoints.push(c);
            }
            while(cy !== cell.j) {
                cy += dy;
                let c = grid.getCell(cx, cy);
                if(c.isCustomPath) { showToast("Intersection!"); return; }
                c.isCustomPath = true; customPathPoints.push(c);
            }
        } else {
            cell.isCustomPath = true; customPathPoints.push(cell);
        }
        draw();
    } else if(toolMode === 'eraser') {
        const idx = customPathPoints.indexOf(cell);
        if(idx > -1) {
            customPathPoints.splice(idx, 1);
            cell.isCustomPath = false;
            
            if(idx > 0 && idx < customPathPoints.length) {
                let prev = customPathPoints[idx-1];
                let next = customPathPoints[idx];
                let cX = prev.i, cY = prev.j;
                let dx = Math.sign(next.i - cX);
                let dy = Math.sign(next.j - cY);
                let fillers = [];
                while(cX !== next.i) { cX += dx; if(cX !== next.i || cY !== next.j) fillers.push(grid.getCell(cX, cY)); }
                while(cY !== next.j) { cY += dy; if(cX !== next.i || cY !== next.j) fillers.push(grid.getCell(cX, cY)); }
                fillers.forEach(f => { f.isCustomPath = true; customPathPoints.splice(idx, 0, f); });
            }
            draw();
        }
    }
});

window.addEventListener('mousemove', (e) => {
    if(!draggingNode) return;
    const cell = getCellFromMouse(e);
    if(cell) {
        if(draggingNode === 'start') { startCoords = {i: cell.i, j: cell.j}; }
        else { goalCoords = {i: cell.i, j: cell.j}; }
        solveMaze();
        draw();
    }
});

window.addEventListener('mouseup', () => { draggingNode = null; });

const setTool = (t) => {
    toolMode = toolMode === t ? null : t;
    if(ui.tools.pencil) ui.tools.pencil.classList.toggle('active', toolMode==='pencil');
    if(ui.tools.eraser) ui.tools.eraser.classList.toggle('active', toolMode==='eraser');
    
    if(toolMode) {
        setupGrid(); 
        if(ui.tools.warning) ui.tools.warning.classList.remove('hidden');
    } else {
        if(ui.tools.warning) ui.tools.warning.classList.add('hidden');
    }
};

if(ui.tools.pencil) ui.tools.pencil.addEventListener('click', () => setTool('pencil'));
if(ui.tools.eraser) ui.tools.eraser.addEventListener('click', () => setTool('eraser'));
if(ui.tools.clear) ui.tools.clear.addEventListener('click', () => { customPathPoints = []; setupGrid(); });

// --- EXPORT SVG (Optimized) ---
function exportSVG() {
    const w = grid.cols * cellSize;
    const h = grid.rows * cellSize;
    let lines = [];
    
    for(let j=0; j<grid.rows; j++) {
        let start = -1;
        for(let i=0; i<grid.cols; i++) {
            if(grid.getCell(i,j).walls[0]) { if(start === -1) start = i; } 
            else if(start !== -1) { lines.push(`<line x1="${start*cellSize}" y1="${j*cellSize}" x2="${i*cellSize}" y2="${j*cellSize}" />`); start = -1; }
        }
        if(start !== -1) lines.push(`<line x1="${start*cellSize}" y1="${j*cellSize}" x2="${grid.cols*cellSize}" y2="${j*cellSize}" />`);
    }
    lines.push(`<line x1="0" y1="${grid.rows*cellSize}" x2="${grid.cols*cellSize}" y2="${grid.rows*cellSize}" />`);

    for(let i=0; i<grid.cols; i++) {
        let start = -1;
        for(let j=0; j<grid.rows; j++) {
            if(grid.getCell(i,j).walls[3]) { if(start === -1) start = j; } 
            else if(start !== -1) { lines.push(`<line x1="${i*cellSize}" y1="${start*cellSize}" x2="${i*cellSize}" y2="${j*cellSize}" />`); start = -1; }
        }
        if(start !== -1) lines.push(`<line x1="${i*cellSize}" y1="${start*cellSize}" x2="${i*cellSize}" y2="${grid.rows*cellSize}" />`);
    }
    lines.push(`<line x1="${grid.cols*cellSize}" y1="0" x2="${grid.cols*cellSize}" y2="${grid.rows*cellSize}" />`);

    let solutionPoly = "";
    if(ui.output.solve && ui.output.solve.checked && solutionPath.length > 0) {
        const joinStyle = ui.output.join ? ui.output.join.value : 'round';
        let points = solutionPath.map(p => `${p.i*cellSize + cellSize/2},${p.j*cellSize + cellSize/2}`).join(" ");
        solutionPoly = `<polyline points="${points}" stroke="red" stroke-width="${Math.max(2, cellSize/4)}" fill="none" stroke-linejoin="${joinStyle}" stroke-linecap="${joinStyle==='round'?'round':'square'}" opacity="0.8"/>`;
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="white"/><g stroke="black" stroke-width="${Math.max(2, cellSize/10)}" stroke-linecap="square">${lines.join('\n')}</g>${solutionPoly}</svg>`;
    download(`maze_${grid.cols}x${grid.rows}.svg`, svg, "image/svg+xml");
}

// --- EXPORT PNG (Pixel Perfect) ---
function exportPNG() {
    const scale = 4;
    const w = grid.cols * scale + 1;
    const h = grid.rows * scale + 1;
    
    const oc = document.createElement('canvas');
    oc.width = w; oc.height = h;
    const offCtx = oc.getContext('2d');
    
    offCtx.fillStyle = "black";
    offCtx.fillRect(0,0,w,h);
    
    offCtx.fillStyle = "white";
    for(let c of grid.cells) {
        let x = c.i * scale + 1;
        let y = c.j * scale + 1;
        offCtx.fillRect(x, y, 3, 3);
        if(!c.walls[1]) offCtx.fillRect(x+3, y, 1, 3);
        if(!c.walls[2]) offCtx.fillRect(x, y+3, 3, 1);
    }

    if(ui.output.solve && ui.output.solve.checked && solutionPath.length > 0) {
        offCtx.fillStyle = "red";
        for(let i=0; i<solutionPath.length; i++) {
            let c = solutionPath[i];
            let cx = c.i * scale + 2;
            let cy = c.j * scale + 2;
            offCtx.fillRect(cx, cy, 1, 1);
            if(i < solutionPath.length-1) {
                let n = solutionPath[i+1];
                let nx = n.i * scale + 2;
                let ny = n.j * scale + 2;
                if(cx < nx) offCtx.fillRect(cx, cy, (nx-cx)+1, 1);
                else if(cx > nx) offCtx.fillRect(nx, ny, (cx-nx)+1, 1);
                else if(cy < ny) offCtx.fillRect(cx, cy, 1, (ny-cy)+1);
                else if(cy > ny) offCtx.fillRect(cx, ny, 1, (cy-ny)+1);
            }
        }
    }

    const a = document.createElement('a');
    a.download = `maze_${grid.cols}x${grid.rows}.png`;
    a.href = oc.toDataURL("image/png");
    a.click();
}

function download(name, content, type) {
    const blob = new Blob([content], {type: type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
}

function showToast(msg) {
    const d = document.createElement('div');
    d.className = 'toast'; d.innerText = msg;
    document.getElementById('toast-container').appendChild(d);
    setTimeout(()=>d.remove(), 3000);
}

if(ui.output.svg) ui.output.svg.addEventListener('click', exportSVG);
if(ui.output.png) ui.output.png.addEventListener('click', exportPNG);

// Start
init();