import { Grid } from './grid.js';
import * as Algo from './algorithms/generator.js';

// --- UI MAPPING ---
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

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
        clear: document.getElementById('btn-tool-clear'),
        warning: document.getElementById('path-warning')
    },
    output: { 
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
let isDrawingPath = false;

let isRatioLocked = false;
let lockedRatio = 1;

let startCoords = {i: 0, j: 0};
let goalCoords = {i: 1, j: 1}; 
let draggingNode = null; 
let solutionPath = [];

let originalWalls = [];
let removableWallPool = [];

// Expand Grid logic to add walls back (for erase/undo)
Grid.prototype.addWall = function(a, b) {
    if(a.isBoundary || b.isBoundary) return; // Ignore external walls
    let x = a.i - b.i;
    let y = a.j - b.j;
    if (x === 1) { a.walls[3] = true; b.walls[1] = true; }
    else if (x === -1) { a.walls[1] = true; b.walls[3] = true; }
    if (y === 1) { a.walls[0] = true; b.walls[2] = true; }
    else if (y === -1) { a.walls[2] = true; b.walls[0] = true; }
};

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

    grid = new Grid(cols, rows);
    
    // Reset Emojis to corners when size changes
    startCoords = {i: 0, j: 0};
    goalCoords = {i: cols-1, j: rows-1};

    solutionPath = [];
    customPathPoints = [];
    originalWalls = [];
    removableWallPool = [];
    draw();
}

// --- DOORS / BOUNDARY LOGIC ---
function isBoundaryOpen(i, j, wallIndex) {
    // Check if an emoji or custom path sits exactly outside this wall
    const checkTarget = (ti, tj) => {
        if(ui.output.solve.checked) {
            if(startCoords.i === ti && startCoords.j === tj) return true;
            if(goalCoords.i === ti && goalCoords.j === tj) return true;
        }
        if(customPathPoints.some(p => p.i === ti && p.j === tj)) return true;
        return false;
    };

    if (wallIndex === 0 && j === 0) return checkTarget(i, -1); // Top
    if (wallIndex === 1 && i === grid.cols - 1) return checkTarget(grid.cols, j); // Right
    if (wallIndex === 2 && j === grid.rows - 1) return checkTarget(i, grid.rows); // Bottom
    if (wallIndex === 3 && i === 0) return checkTarget(-1, j); // Left
    
    return false;
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

    // Draw Backgrounds
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

    // Draw Custom path background for boundary nodes
    customPathPoints.forEach(p => {
        if(p.isBoundary) {
            ctx.fillStyle = "rgba(255, 0, 0, 0.1)";
            ctx.fillRect(offsetX + p.i * cellSize, offsetY + p.j * cellSize, cellSize, cellSize);
        }
    });

    const joinStyle = ui.output.join ? ui.output.join.value : 'round';

    // Draw Walls
    ctx.strokeStyle = "#000";
    ctx.lineCap = joinStyle === 'round' ? 'round' : 'square';
    ctx.lineJoin = joinStyle;
    ctx.lineWidth = Math.max(1, Math.floor(cellSize/10));
    ctx.beginPath();
    for(let c of grid.cells) {
        let x = offsetX + c.i * cellSize;
        let y = offsetY + c.j * cellSize;
        
        // Draw internal walls or external walls if not forced open
        if(c.walls[0] && !isBoundaryOpen(c.i, c.j, 0)) { ctx.moveTo(x,y); ctx.lineTo(x+cellSize, y); }
        if(c.walls[1] && !isBoundaryOpen(c.i, c.j, 1)) { ctx.moveTo(x+cellSize,y); ctx.lineTo(x+cellSize, y+cellSize); }
        if(c.walls[2] && !isBoundaryOpen(c.i, c.j, 2)) { ctx.moveTo(x+cellSize,y+cellSize); ctx.lineTo(x, y+cellSize); }
        if(c.walls[3] && !isBoundaryOpen(c.i, c.j, 3)) { ctx.moveTo(x,y+cellSize); ctx.lineTo(x, y); }
    }
    ctx.stroke();

    const solveEnabled = ui.output.solve && ui.output.solve.checked;

    // Draw Polyline (Red Path)
    let activePath = solveEnabled ? solutionPath : customPathPoints;
    
    if (activePath.length > 0 && (!isGenerating || toolMode)) {
        ctx.strokeStyle = "red";
        ctx.lineWidth = Math.max(2, cellSize / 4);
        ctx.lineJoin = joinStyle;
        ctx.lineCap = joinStyle === 'round' ? 'round' : 'square';
        ctx.beginPath();
        let start = activePath[0];
        ctx.moveTo(offsetX + start.i*cellSize + cellSize/2, offsetY + start.j*cellSize + cellSize/2);
        for(let i=1; i<activePath.length; i++) {
            let p = activePath[i];
            ctx.lineTo(offsetX + p.i*cellSize + cellSize/2, offsetY + p.j*cellSize + cellSize/2);
        }
        ctx.stroke();
    }

    // Draw Emojis
    if (solveEnabled && !isGenerating) {
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
    if (!ui.output.solve || !ui.output.solve.checked || isGenerating) return;

    // Helper to get open neighbors (including boundary transitions)
    const getNeighbors = (node) => {
        let ns = [];
        // If node is boundary, its only neighbor is the adjacent internal cell
        if(node.isBoundary) {
            if(node.i === -1) ns.push(grid.getCell(0, node.j));
            else if(node.i === grid.cols) ns.push(grid.getCell(grid.cols-1, node.j));
            else if(node.j === -1) ns.push(grid.getCell(node.i, 0));
            else if(node.j === grid.rows) ns.push(grid.getCell(node.i, grid.rows-1));
            return ns;
        }

        // Standard internal neighbors
        if (!node.walls[0]) ns.push(grid.getCell(node.i, node.j - 1));
        if (!node.walls[1]) ns.push(grid.getCell(node.i + 1, node.j));
        if (!node.walls[2]) ns.push(grid.getCell(node.i, node.j + 1));
        if (!node.walls[3]) ns.push(grid.getCell(node.i - 1, node.j));
        
        // Check if a boundary node exists right next to open wall (virtual path)
        if(node.i === 0 && startCoords.i === -1 && startCoords.j === node.j) ns.push({i: -1, j: node.j, isBoundary:true});
        if(node.i === 0 && goalCoords.i === -1 && goalCoords.j === node.j) ns.push({i: -1, j: node.j, isBoundary:true});
        
        if(node.i === grid.cols-1 && startCoords.i === grid.cols && startCoords.j === node.j) ns.push({i: grid.cols, j: node.j, isBoundary:true});
        if(node.i === grid.cols-1 && goalCoords.i === grid.cols && goalCoords.j === node.j) ns.push({i: grid.cols, j: node.j, isBoundary:true});

        if(node.j === 0 && startCoords.j === -1 && startCoords.i === node.i) ns.push({i: node.i, j: -1, isBoundary:true});
        if(node.j === 0 && goalCoords.j === -1 && goalCoords.i === node.i) ns.push({i: node.i, j: -1, isBoundary:true});

        if(node.j === grid.rows-1 && startCoords.j === grid.rows && startCoords.i === node.i) ns.push({i: node.i, j: grid.rows, isBoundary:true});
        if(node.j === grid.rows-1 && goalCoords.j === grid.rows && goalCoords.i === node.i) ns.push({i: node.i, j: grid.rows, isBoundary:true});

        return ns.filter(n => n !== null);
    };

    let startNode = startCoords.i < 0 || startCoords.i >= grid.cols || startCoords.j < 0 || startCoords.j >= grid.rows 
        ? {i: startCoords.i, j: startCoords.j, isBoundary: true} 
        : grid.getCell(startCoords.i, startCoords.j);

    let queue = [[startNode]];
    let visited = new Set();
    visited.add(`${startNode.i},${startNode.j}`);

    while (queue.length > 0) {
        let path = queue.shift();
        let current = path[path.length - 1];

        if (current.i === goalCoords.i && current.j === goalCoords.j) {
            solutionPath = path;
            return;
        }

        let ns = getNeighbors(current);
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
    solutionPath = []; // Hide solution during generation
    
    const algoKey = ui.algo.value;

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
            let a = oldPath[i];
            let b = oldPath[i+1];
            if(!a.isBoundary) a.isCustomPath = true; 
            if(!b.isBoundary) b.isCustomPath = true;
            if(!a.isBoundary && !b.isBoundary) grid.removeWall(a, b);
        }
    }

    const strategies = {
        'dfs': Algo.algoDFS, 'prims': Algo.algoPrims, 'kruskal': Algo.algoKruskal,
        'huntkill': Algo.algoHuntKill, 'aldous': Algo.algoAldous, 'wilson': Algo.algoWilson,
        'division': Algo.algoDivision, 'eller': Algo.algoEller, 'sidewinder': Algo.algoSidewinder,
        'binary': Algo.algoBinary
    };

    let stepCount = 0;
    const checkPause = async () => {
        if(myGenId !== currentGenId) throw "ABORT";
        let speed = parseInt(ui.speed.value);
        
        if (speed === 100) return; // Instant
        
        if (speed > 90) {
            // Very fast, yield occasionally
            if(stepCount++ % 20 === 0) await Algo.sleep(0); 
        } else {
            // Visible delay scaling up
            let delay = Math.floor((90 - speed) * 1.5) + 1;
            await Algo.sleep(delay);
        }
    };

    try {
        await strategies[algoKey](grid, () => {
            let speed = parseInt(ui.speed.value);
            if(speed < 100 || Math.random() < 0.05) draw();
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

    isGenerating = false;
    applyEraser(); 
    
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
    
    if(!isGenerating) solveMaze();
    draw();
}

// --- EVENT LISTENERS (Robust Registration) ---

// Input Validation on Change/Blur
const enforceLimits = () => {
    let c = parseInt(ui.cols.value);
    let r = parseInt(ui.rows.value);
    if(isNaN(c) || c < 2) ui.cols.value = 2;
    if(isNaN(r) || r < 2) ui.rows.value = 2;
    setupGrid();
};

if(ui.cols) ui.cols.addEventListener('change', () => {
    if(isRatioLocked) ui.rows.value = Math.max(2, Math.round(parseInt(ui.cols.value) / lockedRatio));
    enforceLimits();
});

if(ui.rows) ui.rows.addEventListener('change', () => {
    if(isRatioLocked) ui.cols.value = Math.max(2, Math.round(parseInt(ui.rows.value) * lockedRatio));
    enforceLimits();
});

if(ui.lock) {
    ui.lock.addEventListener('click', () => {
        isRatioLocked = !isRatioLocked;
        ui.lock.classList.toggle('active', isRatioLocked);
        if(isRatioLocked) lockedRatio = parseInt(ui.cols.value) / parseInt(ui.rows.value);
    });
}

// Mutex: Solve vs Draw Path
const disableIncompatibleAlgos = (disable) => {
    const opts = ui.algo.options;
    for(let i=0; i<opts.length; i++) {
        if(opts[i].classList.contains('incompatible')) {
            opts[i].disabled = disable;
            opts[i].style.display = disable ? 'none' : '';
        }
    }
    if(disable && ui.algo.options[ui.algo.selectedIndex].disabled) {
        ui.algo.value = 'dfs'; // Fallback
    }
};

if(ui.output.solve) ui.output.solve.addEventListener('change', () => { 
    if(ui.output.solve.checked) {
        setTool(null); // Turn off pencil
        customPathPoints = [];
        setupGrid(); // Rebuilds without custom path
        disableIncompatibleAlgos(false);
    }
    solveMaze(); 
    draw(); 
});

const setTool = (t) => {
    toolMode = toolMode === t ? null : t;
    if(ui.tools.pencil) ui.tools.pencil.classList.toggle('active', toolMode==='pencil');
    
    if(toolMode) {
        ui.output.solve.checked = false; // Turn off solver
        solutionPath = [];
        setupGrid(); 
        if(ui.tools.warning) ui.tools.warning.classList.remove('hidden');
        disableIncompatibleAlgos(true);
    } else {
        if(ui.tools.warning) ui.tools.warning.classList.add('hidden');
        if(customPathPoints.length === 0) disableIncompatibleAlgos(false);
    }
};

if(ui.tools.pencil) ui.tools.pencil.addEventListener('click', () => setTool('pencil'));
if(ui.tools.clear) ui.tools.clear.addEventListener('click', () => { 
    customPathPoints = []; 
    setupGrid(); 
    disableIncompatibleAlgos(false);
});

if(ui.output.join) ui.output.join.addEventListener('change', draw);
if(ui.loops) ui.loops.addEventListener('input', applyEraser);
if(ui.btnGen) ui.btnGen.addEventListener('click', generate);

if(ui.speed) {
    ui.speed.addEventListener('input', (e) => { 
        document.getElementById('lbl-speed').innerText = e.target.value > 95 ? "Instant" : (e.target.value < 20 ? "Slow" : "Fast"); 
    });
}

// --- POINTER INTERACTION (Mouse, Touch, Pen) ---

function getPointerCell(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - offsetX;
    const y = e.clientY - rect.top - offsetY;
    const i = Math.floor(x / cellSize);
    const j = Math.floor(y / cellSize);

    if (i >= 0 && i < grid.cols && j >= 0 && j < grid.rows) return grid.getCell(i, j);

    // 1 Step Outside Boundary
    if (i === -1 && j >= 0 && j < grid.rows) return {i, j, isBoundary: true};
    if (i === grid.cols && j >= 0 && j < grid.rows) return {i, j, isBoundary: true};
    if (j === -1 && i >= 0 && i < grid.cols) return {i, j, isBoundary: true};
    if (j === grid.rows && i >= 0 && i < grid.cols) return {i, j, isBoundary: true};

    return null;
}

canvas.addEventListener('pointerdown', (e) => {
    const cell = getPointerCell(e);
    if(!cell) return;
    canvas.setPointerCapture(e.pointerId);

    // 1. Emoji Dragging
    if(ui.output.solve && ui.output.solve.checked) {
        if(cell.i === startCoords.i && cell.j === startCoords.j) { draggingNode = 'start'; return; }
        if(cell.i === goalCoords.i && cell.j === goalCoords.j) { draggingNode = 'goal'; return; }
    }

    // 2. Pencil Tool Start
    if(toolMode === 'pencil' && !isGenerating) {
        isDrawingPath = true;
        customPathPoints = [cell];
        if(!cell.isBoundary) cell.isCustomPath = true;
        draw();
    }
});

canvas.addEventListener('pointermove', (e) => {
    const cell = getPointerCell(e);
    if(!cell) return;

    // 1. Drag Emoji
    if(draggingNode) {
        if(draggingNode === 'start') startCoords = {i: cell.i, j: cell.j};
        else goalCoords = {i: cell.i, j: cell.j};
        solveMaze();
        draw();
        return;
    }

    // 2. Draw Snake Path
    if(isDrawingPath && toolMode === 'pencil' && !isGenerating) {
        let last = customPathPoints[customPathPoints.length-1];
        if(cell.i === last.i && cell.j === last.j) return; // Didn't move

        // Enforce Manhattan Distance (Snake only moves 1 block at a time up/down/left/right)
        let dist = Math.abs(cell.i - last.i) + Math.abs(cell.j - last.j);
        if(dist === 1) {
            // Is it a step backward (undo)?
            if(customPathPoints.length > 1) {
                let prev = customPathPoints[customPathPoints.length-2];
                if(cell.i === prev.i && cell.j === prev.j) {
                    let popped = customPathPoints.pop();
                    if(!popped.isBoundary) popped.isCustomPath = false;
                    if(!popped.isBoundary && !prev.isBoundary) grid.addWall(popped, prev); // Restore wall
                    draw();
                    return;
                }
            }
            
            // Is it overlapping an existing point? (Disallow self-intersection)
            if(customPathPoints.some(p => p.i === cell.i && p.j === cell.j)) return;

            // Cannot traverse boundary to boundary
            if(cell.isBoundary && last.isBoundary) return;

            // Forward Draw
            customPathPoints.push(cell);
            if(!cell.isBoundary) cell.isCustomPath = true;
            if(!cell.isBoundary && !last.isBoundary) grid.removeWall(last, cell);
            draw();
        }
    }
});

canvas.addEventListener('pointerup', () => { draggingNode = null; isDrawingPath = false; });
canvas.addEventListener('pointercancel', () => { draggingNode = null; isDrawingPath = false; });

// --- EXPORTS ---
function exportSVG() {
    const w = grid.cols * cellSize;
    const h = grid.rows * cellSize;
    const joinStyle = ui.output.join ? ui.output.join.value : 'round';
    let lines = [];
    
    for(let j=0; j<grid.rows; j++) {
        let start = -1;
        for(let i=0; i<grid.cols; i++) {
            if(grid.getCell(i,j).walls[0] && !isBoundaryOpen(i, j, 0)) { if(start === -1) start = i; } 
            else if(start !== -1) { lines.push(`<line x1="${start*cellSize}" y1="${j*cellSize}" x2="${i*cellSize}" y2="${j*cellSize}" />`); start = -1; }
        }
        if(start !== -1) lines.push(`<line x1="${start*cellSize}" y1="${j*cellSize}" x2="${grid.cols*cellSize}" y2="${j*cellSize}" />`);
    }
    
    // Bottom Border
    let startB = -1;
    for(let i=0; i<grid.cols; i++) {
        if(!isBoundaryOpen(i, grid.rows-1, 2)) { if(startB === -1) startB = i; }
        else if(startB !== -1) { lines.push(`<line x1="${startB*cellSize}" y1="${grid.rows*cellSize}" x2="${i*cellSize}" y2="${grid.rows*cellSize}" />`); startB = -1; }
    }
    if(startB !== -1) lines.push(`<line x1="${startB*cellSize}" y1="${grid.rows*cellSize}" x2="${grid.cols*cellSize}" y2="${grid.rows*cellSize}" />`);

    for(let i=0; i<grid.cols; i++) {
        let start = -1;
        for(let j=0; j<grid.rows; j++) {
            if(grid.getCell(i,j).walls[3] && !isBoundaryOpen(i, j, 3)) { if(start === -1) start = j; } 
            else if(start !== -1) { lines.push(`<line x1="${i*cellSize}" y1="${start*cellSize}" x2="${i*cellSize}" y2="${j*cellSize}" />`); start = -1; }
        }
        if(start !== -1) lines.push(`<line x1="${i*cellSize}" y1="${start*cellSize}" x2="${i*cellSize}" y2="${grid.rows*cellSize}" />`);
    }
    
    // Right Border
    let startR = -1;
    for(let j=0; j<grid.rows; j++) {
        if(!isBoundaryOpen(grid.cols-1, j, 1)) { if(startR === -1) startR = j; }
        else if(startR !== -1) { lines.push(`<line x1="${grid.cols*cellSize}" y1="${startR*cellSize}" x2="${grid.cols*cellSize}" y2="${j*cellSize}" />`); startR = -1; }
    }
    if(startR !== -1) lines.push(`<line x1="${grid.cols*cellSize}" y1="${startR*cellSize}" x2="${grid.cols*cellSize}" y2="${grid.rows*cellSize}" />`);


    let solutionPoly = "";
    let activePath = ui.output.solve.checked ? solutionPath : customPathPoints;
    
    if(activePath.length > 0) {
        let points = activePath.map(p => `${p.i*cellSize + cellSize/2},${p.j*cellSize + cellSize/2}`).join(" ");
        solutionPoly = `<polyline points="${points}" stroke="red" stroke-width="${Math.max(2, cellSize/4)}" fill="none" stroke-linejoin="${joinStyle}" stroke-linecap="${joinStyle==='round'?'round':'square'}" opacity="0.8"/>`;
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="white"/><g stroke="black" stroke-width="${Math.max(2, cellSize/10)}" stroke-linecap="${joinStyle==='round'?'round':'square'}" stroke-linejoin="${joinStyle}">${lines.join('\n')}</g>${solutionPoly}</svg>`;
    download(`maze_${grid.cols}x${grid.rows}.svg`, svg, "image/svg+xml");
}

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
        if(!c.walls[1] || isBoundaryOpen(c.i, c.j, 1)) offCtx.fillRect(x+3, y, 1, 3);
        if(!c.walls[2] || isBoundaryOpen(c.i, c.j, 2)) offCtx.fillRect(x, y+3, 3, 1);
        
        // Check top/left for pixel carver (since walls belong to this cell logically)
        if(isBoundaryOpen(c.i, c.j, 0)) offCtx.fillRect(x, y-1, 3, 1);
        if(isBoundaryOpen(c.i, c.j, 3)) offCtx.fillRect(x-1, y, 1, 3);
    }

    let activePath = ui.output.solve.checked ? solutionPath : customPathPoints;

    if(activePath.length > 0) {
        offCtx.fillStyle = "red";
        for(let i=0; i<activePath.length; i++) {
            let c = activePath[i];
            let cx = c.i * scale + 2;
            let cy = c.j * scale + 2;
            if(c.isBoundary) {
                if(c.i === -1) cx = 0;
                else if(c.i === grid.cols) cx = w - 1;
                else if(c.j === -1) cy = 0;
                else if(c.j === grid.rows) cy = h - 1;
            }
            offCtx.fillRect(cx, cy, 1, 1);

            if(i < activePath.length-1) {
                let n = activePath[i+1];
                let nx = n.i * scale + 2;
                let ny = n.j * scale + 2;
                if(n.isBoundary) {
                    if(n.i === -1) nx = 0;
                    else if(n.i === grid.cols) nx = w - 1;
                    else if(n.j === -1) ny = 0;
                    else if(n.j === grid.rows) ny = h - 1;
                }
                
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