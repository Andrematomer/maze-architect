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
    mode: document.getElementById('sel-mode'),
    uiDraw: document.getElementById('ui-draw'),
    btnClearPath: document.getElementById('btn-tool-clear'),
    output: { 
        svg: document.getElementById('btn-exp-svg'),
        png: document.getElementById('btn-exp-png'),
        join: document.getElementById('sel-join'),
        simplify: document.getElementById('chk-simplify')
    }
};

let grid;
let cellSize;
let offsetX = 0;
let offsetY = 0;

let isGenerating = false;
let currentGenId = 0; 
let customPathPoints = []; 

let isRatioLocked = false;
let lockedRatio = 1;
let oldCols = 20;
let oldRows = 20;

let startCoords = {i: 0, j: 0};
let goalCoords = {i: 1, j: 1}; 
let draggingNode = null; 
let isDrawingSnake = false;
let solutionPath = [];

let originalWalls = [];
let removableWallPool = [];

// Grid Wall Adder (for Undo)
Grid.prototype.addWall = function(a, b) {
    if(a.isBoundary || b.isBoundary) return; 
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
    let cols = parseInt(ui.cols.value);
    let rows = parseInt(ui.rows.value);

    grid = new Grid(cols, rows);
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
    const checkTarget = (ti, tj) => {
        if(ui.mode.value === 'auto') {
            if(startCoords.i === ti && startCoords.j === tj) return true;
            if(goalCoords.i === ti && goalCoords.j === tj) return true;
        }
        if(ui.mode.value === 'draw') {
            if(customPathPoints.some(p => p.i === ti && p.j === tj)) return true;
        }
        return false;
    };

    if (wallIndex === 0 && j === 0) return checkTarget(i, -1); 
    if (wallIndex === 1 && i === grid.cols - 1) return checkTarget(grid.cols, j); 
    if (wallIndex === 2 && j === grid.rows - 1) return checkTarget(i, grid.rows); 
    if (wallIndex === 3 && i === 0) return checkTarget(-1, j); 
    
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

    customPathPoints.forEach(p => {
        if(p.isBoundary) {
            ctx.fillStyle = "rgba(255, 0, 0, 0.1)";
            ctx.fillRect(offsetX + p.i * cellSize, offsetY + p.j * cellSize, cellSize, cellSize);
        }
    });

    const joinStyle = ui.output.join.value;

    ctx.strokeStyle = "#000";
    ctx.lineCap = joinStyle === 'round' ? 'round' : 'square';
    ctx.lineJoin = joinStyle;
    ctx.lineWidth = Math.max(1, Math.floor(cellSize/10));
    ctx.beginPath();
    for(let c of grid.cells) {
        let x = offsetX + c.i * cellSize;
        let y = offsetY + c.j * cellSize;
        
        if(c.walls[0] && !isBoundaryOpen(c.i, c.j, 0)) { ctx.moveTo(x,y); ctx.lineTo(x+cellSize, y); }
        if(c.walls[1] && !isBoundaryOpen(c.i, c.j, 1)) { ctx.moveTo(x+cellSize,y); ctx.lineTo(x+cellSize, y+cellSize); }
        if(c.walls[2] && !isBoundaryOpen(c.i, c.j, 2)) { ctx.moveTo(x+cellSize,y+cellSize); ctx.lineTo(x, y+cellSize); }
        if(c.walls[3] && !isBoundaryOpen(c.i, c.j, 3)) { ctx.moveTo(x,y+cellSize); ctx.lineTo(x, y); }
    }
    ctx.stroke();

    let activePath = ui.mode.value === 'auto' ? solutionPath : (ui.mode.value === 'draw' ? customPathPoints : []);
    
    if (activePath.length > 0 && (!isGenerating || ui.mode.value === 'draw')) {
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

    if (ui.mode.value === 'auto' && !isGenerating) {
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
    if (ui.mode.value !== 'auto' || isGenerating) return;

    const getNeighbors = (node) => {
        let ns = [];
        if(node.isBoundary) {
            if(node.i === -1) ns.push(grid.getCell(0, node.j));
            else if(node.i === grid.cols) ns.push(grid.getCell(grid.cols-1, node.j));
            else if(node.j === -1) ns.push(grid.getCell(node.i, 0));
            else if(node.j === grid.rows) ns.push(grid.getCell(node.i, grid.rows-1));
            return ns;
        }

        if (!node.walls[0]) ns.push(grid.getCell(node.i, node.j - 1));
        if (!node.walls[1]) ns.push(grid.getCell(node.i + 1, node.j));
        if (!node.walls[2]) ns.push(grid.getCell(node.i, node.j + 1));
        if (!node.walls[3]) ns.push(grid.getCell(node.i - 1, node.j));
        
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
    solutionPath = []; 
    
    const algoKey = ui.algo.value;

    ui.status.innerText = "Generating...";
    ui.btnGen.innerText = "INTERRUPT & RESTART";
    ui.btnGen.classList.add('active'); 
    
    let oldPath = [...customPathPoints];
    grid.cells.forEach(c => {
        c.visited = false;
        c.walls = [true,true,true,true];
    });

    if(ui.mode.value === 'draw' && oldPath.length > 0) {
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
        if (speed >= 90) {
            // Remapped fast speeds (10 to 100 steps per frame)
            let stepsPerFrame = (speed - 89) * 10; 
            if(stepCount++ % stepsPerFrame === 0) await Algo.sleep(0); 
        } else {
            // Visible delay
            let delay = (90 - speed) * 2;
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

// --- INPUT VALIDATION & LOGIC ---

const validateAndApplySize = () => {
    let c = parseInt(ui.cols.value);
    let r = parseInt(ui.rows.value);
    
    if (isNaN(c) || c < 2) c = 2;
    if (isNaN(r) || r < 2) r = 2;

    if (c > 100 || r > 100) {
        if(!confirm("Are you sure? Grids larger than 100x100 may temporarily freeze your browser during logic generation.")) {
            c = oldCols; r = oldRows;
        }
    }
    // Hard Canvas Memory Cap
    if (c > 482) c = 482;
    if (r > 482) r = 482;

    ui.cols.value = c;
    ui.rows.value = r;
    oldCols = c; oldRows = r;

    setupGrid();
};

ui.cols.addEventListener('change', () => {
    if(isRatioLocked) ui.rows.value = Math.round(parseInt(ui.cols.value) / lockedRatio);
    validateAndApplySize();
});

ui.rows.addEventListener('change', () => {
    if(isRatioLocked) ui.cols.value = Math.round(parseInt(ui.rows.value) * lockedRatio);
    validateAndApplySize();
});

ui.lock.addEventListener('click', () => {
    isRatioLocked = !isRatioLocked;
    ui.lock.classList.toggle('active', isRatioLocked);
    if(isRatioLocked) lockedRatio = parseInt(ui.cols.value) / parseInt(ui.rows.value);
});

// Mutex Mode
const disableIncompatibleAlgos = (disable) => {
    const forbidden = ['division', 'eller', 'sidewinder', 'binary'];
    Array.from(ui.algo.options).forEach(opt => {
        if(forbidden.includes(opt.value)) {
            opt.disabled = disable;
            opt.hidden = disable; // Hides in modern dropdowns
        }
    });
    if(disable && forbidden.includes(ui.algo.value)) {
        ui.algo.value = 'dfs'; 
    }
};

ui.mode.addEventListener('change', () => {
    const val = ui.mode.value;
    
    // Reset States
    customPathPoints = [];
    solutionPath = [];
    ui.uiDraw.classList.add('hidden');
    disableIncompatibleAlgos(false);
    
    if (val === 'draw') {
        ui.uiDraw.classList.remove('hidden');
        disableIncompatibleAlgos(true);
    }
    
    setupGrid(); 
});

ui.btnClearPath.addEventListener('click', () => { 
    customPathPoints = []; 
    setupGrid(); 
});

ui.output.join.addEventListener('change', draw);
ui.loops.addEventListener('input', applyEraser);
ui.btnGen.addEventListener('click', generate);
ui.speed.addEventListener('input', (e) => { 
    document.getElementById('lbl-speed').innerText = e.target.value > 99 ? "Instant" : (e.target.value < 30 ? "Slow" : "Fast"); 
});

// --- POINTER INTERACTION (SNAKE DRAWING & DRAG) ---

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

    if(ui.mode.value === 'auto') {
        if(cell.i === startCoords.i && cell.j === startCoords.j) { draggingNode = 'start'; return; }
        if(cell.i === goalCoords.i && cell.j === goalCoords.j) { draggingNode = 'goal'; return; }
    }

    if(ui.mode.value === 'draw' && !isGenerating) {
        if(customPathPoints.length === 0) {
            isDrawingSnake = true;
            customPathPoints = [cell];
            if(!cell.isBoundary) cell.isCustomPath = true;
            draw();
        } else {
            // Check if clicked the head to continue drawing
            let head = customPathPoints[customPathPoints.length-1];
            if(cell.i === head.i && cell.j === head.j) {
                isDrawingSnake = true;
            } else {
                // Clicked elsewhere - start fresh
                customPathPoints = [cell];
                grid.cells.forEach(c => c.isCustomPath = false);
                if(!cell.isBoundary) cell.isCustomPath = true;
                draw();
                isDrawingSnake = true;
            }
        }
    }
});

canvas.addEventListener('pointermove', (e) => {
    // Prevent default touch scrolling
    if (e.pointerType === 'touch') e.preventDefault(); 
    
    const cell = getPointerCell(e);
    if(!cell) return;

    if(draggingNode && ui.mode.value === 'auto') {
        if(draggingNode === 'start') startCoords = {i: cell.i, j: cell.j};
        else goalCoords = {i: cell.i, j: cell.j};
        solveMaze();
        draw();
        return;
    }

    if(isDrawingSnake && ui.mode.value === 'draw' && !isGenerating) {
        let head = customPathPoints[customPathPoints.length-1];
        if(cell.i === head.i && cell.j === head.j) return; 

        // Enforce Manhattan Distance (1 block up/down/left/right)
        let dist = Math.abs(cell.i - head.i) + Math.abs(cell.j - head.j);
        if(dist === 1) {
            // Undo Check (Moving backwards)
            if(customPathPoints.length > 1) {
                let neck = customPathPoints[customPathPoints.length-2];
                if(cell.i === neck.i && cell.j === neck.j) {
                    let popped = customPathPoints.pop();
                    if(!popped.isBoundary) popped.isCustomPath = false;
                    if(!popped.isBoundary && !neck.isBoundary) grid.addWall(popped, neck);
                    draw();
                    return;
                }
            }
            
            // Self-intersection Check
            if(customPathPoints.some(p => p.i === cell.i && p.j === cell.j)) return;
            // Boundary-to-Boundary Check
            if(cell.isBoundary && head.isBoundary) return;

            // Draw Forward
            customPathPoints.push(cell);
            if(!cell.isBoundary) cell.isCustomPath = true;
            if(!cell.isBoundary && !head.isBoundary) grid.removeWall(head, cell);
            draw();
        }
    }
});

canvas.addEventListener('pointerup', () => { draggingNode = null; isDrawingSnake = false; });
canvas.addEventListener('pointercancel', () => { draggingNode = null; isDrawingSnake = false; });

// --- EXPORTS ---
function exportSVG() {
    const w = grid.cols * cellSize;
    const h = grid.rows * cellSize;
    const joinStyle = ui.output.join.value;
    const doSimplify = ui.output.simplify.checked;
    let lines = [];
    
    if (doSimplify) {
        for(let j=0; j<grid.rows; j++) {
            let start = -1;
            for(let i=0; i<grid.cols; i++) {
                if(grid.getCell(i,j).walls[0] && !isBoundaryOpen(i, j, 0)) { if(start === -1) start = i; } 
                else if(start !== -1) { lines.push(`<line x1="${start*cellSize}" y1="${j*cellSize}" x2="${i*cellSize}" y2="${j*cellSize}" />`); start = -1; }
            }
            if(start !== -1) lines.push(`<line x1="${start*cellSize}" y1="${j*cellSize}" x2="${grid.cols*cellSize}" y2="${j*cellSize}" />`);
        }
        
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
        
        let startR = -1;
        for(let j=0; j<grid.rows; j++) {
            if(!isBoundaryOpen(grid.cols-1, j, 1)) { if(startR === -1) startR = j; }
            else if(startR !== -1) { lines.push(`<line x1="${grid.cols*cellSize}" y1="${startR*cellSize}" x2="${grid.cols*cellSize}" y2="${j*cellSize}" />`); startR = -1; }
        }
        if(startR !== -1) lines.push(`<line x1="${grid.cols*cellSize}" y1="${startR*cellSize}" x2="${grid.cols*cellSize}" y2="${grid.rows*cellSize}" />`);
    } else {
        // Non-simplified: every cell writes its walls
        for(let c of grid.cells) {
            let x = c.i * cellSize, y = c.j * cellSize;
            if(c.walls[0] && !isBoundaryOpen(c.i, c.j, 0)) lines.push(`<line x1="${x}" y1="${y}" x2="${x+cellSize}" y2="${y}" />`);
            if(c.walls[1] && !isBoundaryOpen(c.i, c.j, 1)) lines.push(`<line x1="${x+cellSize}" y1="${y}" x2="${x+cellSize}" y2="${y+cellSize}" />`);
            if(c.walls[2] && !isBoundaryOpen(c.i, c.j, 2)) lines.push(`<line x1="${x+cellSize}" y1="${y+cellSize}" x2="${x}" y2="${y+cellSize}" />`);
            if(c.walls[3] && !isBoundaryOpen(c.i, c.j, 3)) lines.push(`<line x1="${x}" y1="${y+cellSize}" x2="${x}" y2="${y}" />`);
        }
    }

    let solutionPoly = "";
    let activePath = ui.mode.value === 'auto' ? solutionPath : (ui.mode.value === 'draw' ? customPathPoints : []);
    
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
        
        if(isBoundaryOpen(c.i, c.j, 0)) offCtx.fillRect(x, y-1, 3, 1);
        if(isBoundaryOpen(c.i, c.j, 3)) offCtx.fillRect(x-1, y, 1, 3);
    }

    let activePath = ui.mode.value === 'auto' ? solutionPath : (ui.mode.value === 'draw' ? customPathPoints : []);

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

ui.output.svg.addEventListener('click', exportSVG);
ui.output.png.addEventListener('click', exportPNG);

// Start
init();