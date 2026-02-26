import { Grid } from './grid.js';
import * as Algo from './algorithms/generator.js';

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
        round: document.getElementById('chk-round'),
        simplify: document.getElementById('chk-simplify')
    }
};

let grid, cellSize, offsetX = 0, offsetY = 0;
let isGenerating = false, currentGenId = 0, customPathPoints = []; 
let isRatioLocked = false, lockedRatio = 1, oldCols = 20, oldRows = 20;

let startCoords = {i: -1, j: 0}; 
let goalCoords = {i: 20, j: 19}; 
let draggingNode = null, isDrawingSnake = false, solutionPath = [];

let genHead = null, lastGenHead = null, genMonkeyFaceRight = true; 
let transientEmojis = []; 
let originalWalls = [], removableWallPool = [];

Grid.prototype.addWall = function(a, b) {
    if(a.isBoundary || b.isBoundary) return; 
    let x = a.i - b.i, y = a.j - b.j;
    if (x === 1) { a.walls[3] = true; b.walls[1] = true; }
    else if (x === -1) { a.walls[1] = true; b.walls[3] = true; }
    if (y === 1) { a.walls[0] = true; b.walls[2] = true; }
    else if (y === -1) { a.walls[2] = true; b.walls[0] = true; }
};

function init() {
    resize();
    setupGrid();
    window.addEventListener('resize', () => { resize(); draw(); });
}

function resize() {
    canvas.width = document.getElementById('viewport').clientWidth;
    canvas.height = document.getElementById('viewport').clientHeight;
}

function setupGrid() {
    let cols = parseInt(ui.cols.value) || 20;
    let rows = parseInt(ui.rows.value) || 20;

    grid = new Grid(cols, rows);
    startCoords = {i: -1, j: Math.floor(rows/2)};
    goalCoords = {i: cols, j: Math.floor(rows/2)};
    
    solutionPath = []; customPathPoints = []; originalWalls = []; removableWallPool = [];
    genHead = null; transientEmojis = [];
    draw();
}

function isBoundaryOpen(i, j, wallIndex) {
    const checkTarget = (ti, tj) => {
        if(ui.mode.value === 'auto') return (startCoords.i===ti && startCoords.j===tj) || (goalCoords.i===ti && goalCoords.j===tj);
        if(ui.mode.value === 'draw') return customPathPoints.some(p => p.i === ti && p.j === tj);
        return false;
    };
    if (wallIndex === 0 && j === 0) return checkTarget(i, -1); 
    if (wallIndex === 1 && i === grid.cols - 1) return checkTarget(grid.cols, j); 
    if (wallIndex === 2 && j === grid.rows - 1) return checkTarget(i, grid.rows); 
    if (wallIndex === 3 && i === 0) return checkTarget(-1, j); 
    return false;
}

function drawEmoji(emoji, x, y, size, faceRight = true, alpha = 1.0) {
    ctx.globalAlpha = alpha;
    ctx.font = `${size}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.save();
    ctx.translate(x, y);
    if (!faceRight) ctx.scale(-1, 1);
    ctx.fillText(emoji, 0, 2);
    ctx.restore();
    ctx.globalAlpha = 1.0;
}

function draw() {
    if(!grid) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0,0,canvas.width, canvas.height);

    cellSize = Math.max(4, Math.floor(Math.min((canvas.width-40)/grid.cols, (canvas.height-40)/grid.rows)));
    offsetX = Math.floor((canvas.width - grid.cols*cellSize)/2);
    offsetY = Math.floor((canvas.height - grid.rows*cellSize)/2);

    for(let c of grid.cells) {
        let x = offsetX + c.i * cellSize, y = offsetY + c.j * cellSize;
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

    const isRound = ui.output.round.checked;
    ctx.strokeStyle = "#000";
    ctx.lineCap = isRound ? 'round' : 'square';
    ctx.lineJoin = isRound ? 'round' : 'miter';
    ctx.lineWidth = Math.max(1, Math.floor(cellSize/10));
    ctx.beginPath();
    for(let c of grid.cells) {
        let x = offsetX + c.i * cellSize, y = offsetY + c.j * cellSize;
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
        ctx.lineJoin = isRound ? 'round' : 'miter';
        ctx.lineCap = isRound ? 'round' : 'square';
        ctx.beginPath();
        let start = activePath[0];
        ctx.moveTo(offsetX + start.i*cellSize + cellSize/2, offsetY + start.j*cellSize + cellSize/2);
        for(let i=1; i<activePath.length; i++) {
            let p = activePath[i];
            ctx.lineTo(offsetX + p.i*cellSize + cellSize/2, offsetY + p.j*cellSize + cellSize/2);
        }
        ctx.stroke();

        if (ui.mode.value === 'draw' && customPathPoints.length > 0) {
            let last = customPathPoints[customPathPoints.length - 1];
            ctx.fillStyle = "red";
            ctx.beginPath();
            ctx.arc(offsetX + last.i*cellSize + cellSize/2, offsetY + last.j*cellSize + cellSize/2, cellSize/2, 0, Math.PI*2);
            ctx.fill();
        }
    }

    let eSize = Math.max(12, cellSize * 0.7);

    if (ui.mode.value === 'auto' && !isGenerating) {
        let monkeyFaceRight = true;
        if(solutionPath.length > 1) {
            let firstHoriz = solutionPath.find((p, idx) => idx > 0 && p.i !== solutionPath[idx-1].i);
            if(firstHoriz) {
                let prev = solutionPath[solutionPath.indexOf(firstHoriz) - 1];
                monkeyFaceRight = firstHoriz.i > prev.i;
            } else monkeyFaceRight = false; 
        }
        drawEmoji("🐒", offsetX + startCoords.i * cellSize + cellSize/2, offsetY + startCoords.j * cellSize + cellSize/2, eSize, monkeyFaceRight);
        drawEmoji("🍌", offsetX + goalCoords.i * cellSize + cellSize/2, offsetY + goalCoords.j * cellSize + cellSize/2, eSize, true);
    }

    if (isGenerating && parseInt(ui.speed.value) < 100) {
        transientEmojis.forEach(e => {
            let x = offsetX + e.i * cellSize + cellSize/2;
            let y = offsetY + e.j * cellSize + cellSize/2;
            let faceRight = (e.type === '🛬' || e.type === '✨') ? genMonkeyFaceRight : !genMonkeyFaceRight; 
            drawEmoji(e.type, x, y, eSize, faceRight, e.life / 5.0);
        });
        const algo = ui.algo.value;
        if (genHead && !genHead.isBoundary && !['prims', 'kruskal', 'division', 'eller'].includes(algo)) {
            drawEmoji("🐒", offsetX + genHead.i * cellSize + cellSize/2, offsetY + genHead.j * cellSize + cellSize/2, eSize, genMonkeyFaceRight);
        }
    }
}

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
        
        if(node.i===0 && startCoords.i===-1 && startCoords.j===node.j) ns.push({i: -1, j: node.j, isBoundary:true});
        if(node.i===0 && goalCoords.i===-1 && goalCoords.j===node.j) ns.push({i: -1, j: node.j, isBoundary:true});
        if(node.i===grid.cols-1 && startCoords.i===grid.cols && startCoords.j===node.j) ns.push({i: grid.cols, j: node.j, isBoundary:true});
        if(node.i===grid.cols-1 && goalCoords.i===grid.cols && goalCoords.j===node.j) ns.push({i: grid.cols, j: node.j, isBoundary:true});
        if(node.j===0 && startCoords.j===-1 && startCoords.i===node.i) ns.push({i: node.i, j: -1, isBoundary:true});
        if(node.j===0 && goalCoords.j===-1 && goalCoords.i===node.i) ns.push({i: node.i, j: -1, isBoundary:true});
        if(node.j===grid.rows-1 && startCoords.j===grid.rows && startCoords.i===node.i) ns.push({i: node.i, j: grid.rows, isBoundary:true});
        if(node.j===grid.rows-1 && goalCoords.j===grid.rows && goalCoords.i===node.i) ns.push({i: node.i, j: grid.rows, isBoundary:true});

        return ns.filter(n => n !== null);
    };

    let startNode = startCoords.i < 0 || startCoords.i >= grid.cols || startCoords.j < 0 || startCoords.j >= grid.rows 
        ? {i: startCoords.i, j: startCoords.j, isBoundary: true} 
        : grid.getCell(startCoords.i, startCoords.j);

    let queue = [[startNode]], visited = new Set();
    visited.add(`${startNode.i},${startNode.j}`);

    while (queue.length > 0) {
        let path = queue.shift(), current = path[path.length - 1];
        if (current.i === goalCoords.i && current.j === goalCoords.j) { solutionPath = path; return; }
        for (let n of getNeighbors(current)) {
            if (n && !visited.has(`${n.i},${n.j}`)) {
                visited.add(`${n.i},${n.j}`);
                queue.push([...path, n]);
            }
        }
    }
}

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
    grid.cells.forEach(c => { c.visited = false; c.walls = [true,true,true,true]; });

    if(ui.mode.value === 'draw' && oldPath.length > 0) {
        let mappedPath = [];
        oldPath.forEach(p => mappedPath.push(p.isBoundary ? p : grid.getCell(p.i, p.j)));
        customPathPoints = mappedPath;

        for(let i=0; i<mappedPath.length-1; i++) {
            let a = mappedPath[i], b = mappedPath[i+1];
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
    const checkPause = async (headCell) => {
        if(myGenId !== currentGenId) throw "ABORT";
        let speed = parseInt(ui.speed.value);
        if (speed === 100) return; 
        
        transientEmojis.forEach(e => e.life--);
        transientEmojis = transientEmojis.filter(e => e.life > 0);

        if(headCell) {
            if (['prims', 'kruskal'].includes(algoKey)) {
                transientEmojis.push({type: '✨', i: headCell.i, j: headCell.j, life: 5});
            } else if (!['division', 'eller'].includes(algoKey)) {
                if(lastGenHead && (Math.abs(headCell.i - lastGenHead.i) > 1 || Math.abs(headCell.j - lastGenHead.j) > 1)) {
                    transientEmojis.push({type: '🛫', i: lastGenHead.i, j: lastGenHead.j, life: 5});
                    transientEmojis.push({type: '🛬', i: headCell.i, j: headCell.j, life: 5});
                } else if(lastGenHead) {
                    if(headCell.i > lastGenHead.i) genMonkeyFaceRight = true;
                    else if(headCell.i < lastGenHead.i) genMonkeyFaceRight = false;
                }
                genHead = headCell;
                lastGenHead = headCell;
            }
        }

        if (speed >= 90) {
            if(stepCount++ % ((speed - 89) * 10) === 0) await Algo.sleep(0); 
        } else {
            await Algo.sleep((90 - speed) * 2);
        }
    };

    try {
        await strategies[algoKey](grid, () => {
            if(parseInt(ui.speed.value) < 100 || Math.random() < 0.05) draw();
        }, checkPause);
    } catch (e) {
        if(e === "ABORT") return; 
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
    genHead = null; transientEmojis = [];
    applyEraser(); 
    
    ui.status.innerText = "Done";
    ui.btnGen.innerText = "GENERATE MAZE";
    ui.btnGen.classList.remove('active');
}

function getVertexDegree(vx, vy) {
    if (vx <= 0 || vx >= grid.cols || vy <= 0 || vy >= grid.rows) return 99; 
    let d = 0;
    if (grid.getCell(vx - 1, vy - 1).walls[1]) d++; 
    if (grid.getCell(vx - 1, vy).walls[1]) d++;     
    if (grid.getCell(vx - 1, vy - 1).walls[2]) d++; 
    if (grid.getCell(vx, vy - 1).walls[2]) d++;     
    return d;
}

function applyEraser() {
    if(originalWalls.length === 0) return;
    grid.cells.forEach((c, idx) => c.walls = [...originalWalls[idx]]);
    let limit = Math.floor(removableWallPool.length * (parseInt(ui.loops.value) / 100));
    let removed = 0;

    for(let i = 0; i < removableWallPool.length && removed < limit; i++) {
        let p = removableWallPool[i], safe = false;
        if(p.w1 === 1) safe = (getVertexDegree(p.c1.i + 1, p.c1.j) > 1 && getVertexDegree(p.c1.i + 1, p.c1.j + 1) > 1);
        else if (p.w1 === 2) safe = (getVertexDegree(p.c1.i, p.c1.j + 1) > 1 && getVertexDegree(p.c1.i + 1, p.c1.j + 1) > 1);

        if (safe) { p.c1.walls[p.w1] = false; p.c2.walls[p.w2] = false; removed++; }
    }
    if(!isGenerating) solveMaze();
    draw();
}

const validateAndApplySize = () => {
    let c = parseInt(ui.cols.value), r = parseInt(ui.rows.value);
    if (isNaN(c) || c < 2) c = 2;
    if (isNaN(r) || r < 2) r = 2;
    if ((c > 100 || r > 100) && !confirm("Are you sure? Grids larger than 100x100 may temporarily freeze your browser.")) {
        c = oldCols; r = oldRows;
    }
    c = Math.min(c, 482); r = Math.min(r, 482);
    ui.cols.value = c; ui.rows.value = r; oldCols = c; oldRows = r;

    setupGrid();
    if(ui.mode.value === 'draw') generateRandomPathTemplate();
    draw();
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

const disableIncompatibleAlgos = (mode) => {
    Array.from(ui.algo.options).forEach(opt => {
        if(mode === 'draw') {
            opt.disabled = (opt.value !== 'kruskal');
            opt.hidden = opt.disabled;
        } else {
            opt.disabled = false; opt.hidden = false;
        }
    });
    if(mode === 'draw') ui.algo.value = 'kruskal'; 
};

function generateRandomPathTemplate() {
    customPathPoints = [];
    let r = Math.floor(grid.rows / 2);
    customPathPoints.push({i: -1, j: r, isBoundary: true});
    
    let curr = grid.getCell(0, r);
    let visited = new Set([`0,${r}`]);
    
    while(curr && curr.i < grid.cols - 1) {
        customPathPoints.push(curr);
        let moves = [];
        if(curr.j > 0 && !visited.has(`${curr.i},${curr.j-1}`)) moves.push({c: grid.getCell(curr.i, curr.j-1), w: 3});
        if(curr.j < grid.rows - 1 && !visited.has(`${curr.i},${curr.j+1}`)) moves.push({c: grid.getCell(curr.i, curr.j+1), w: 3});
        if(!visited.has(`${curr.i+1},${curr.j}`)) moves.push({c: grid.getCell(curr.i+1, curr.j), w: 1});

        if(moves.length === 0) curr = grid.getCell(curr.i+1, curr.j);
        else {
            let rnd = Math.random() * moves.reduce((s, m) => s + m.w, 0);
            for(let m of moves) { if(rnd < m.w) { curr = m.c; break; } rnd -= m.w; }
        }
        if(!curr) break;
        visited.add(`${curr.i},${curr.j}`);
    }
    if(curr) customPathPoints.push(curr);
    customPathPoints.push({i: grid.cols, j: curr ? curr.j : r, isBoundary: true});
}

let lastMode = 'none';
ui.mode.addEventListener('change', () => {
    const val = ui.mode.value;
    if (val === 'draw') {
        ui.uiDraw.classList.remove('hidden');
        disableIncompatibleAlgos('draw');
        setupGrid(); 
        generateRandomPathTemplate();
        ui.btnClearPath.innerText = "🗑️ Clear Sample Path";
        ui.btnClearPath.classList.add('btn-primary');
        draw();
    } else {
        ui.uiDraw.classList.add('hidden');
        disableIncompatibleAlgos('none');
        if (lastMode === 'draw') setupGrid(); 
        else { solveMaze(); draw(); }
    }
    lastMode = val;
});

ui.btnClearPath.addEventListener('click', () => { 
    ui.btnClearPath.innerText = "🗑️ Clear Custom Path";
    ui.btnClearPath.classList.remove('btn-primary');
    customPathPoints = []; 
    setupGrid(); 
});

ui.output.round.addEventListener('change', draw);
ui.output.simplify.addEventListener('change', draw);
ui.loops.addEventListener('input', applyEraser);
ui.btnGen.addEventListener('click', generate);
ui.speed.addEventListener('input', (e) => { document.getElementById('lbl-speed').innerText = e.target.value > 99 ? "Instant" : (e.target.value < 30 ? "Slow" : "Fast"); });

function getPointerCell(e) {
    const r = canvas.getBoundingClientRect();
    const i = Math.floor((e.clientX - r.left - offsetX) / cellSize), j = Math.floor((e.clientY - r.top - offsetY) / cellSize);
    if (i >= 0 && i < grid.cols && j >= 0 && j < grid.rows) return grid.getCell(i, j);
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
            let head = customPathPoints[customPathPoints.length-1];
            if(cell.i === head.i && cell.j === head.j) isDrawingSnake = true;
        }
    }
});

canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') e.preventDefault(); 
    const cell = getPointerCell(e);
    if(!cell) return;

    if(draggingNode && ui.mode.value === 'auto') {
        if(draggingNode === 'start' && (cell.i !== goalCoords.i || cell.j !== goalCoords.j)) startCoords = {i: cell.i, j: cell.j};
        else if(draggingNode === 'goal' && (cell.i !== startCoords.i || cell.j !== startCoords.j)) goalCoords = {i: cell.i, j: cell.j};
        solveMaze(); draw(); return;
    }

    if(isDrawingSnake && ui.mode.value === 'draw' && !isGenerating) {
        let head = customPathPoints[customPathPoints.length-1];
        if(cell.i === head.i && cell.j === head.j) return; 

        if((Math.abs(cell.i - head.i) + Math.abs(cell.j - head.j)) === 1) {
            if(customPathPoints.length > 1 && cell.i === customPathPoints[customPathPoints.length-2].i && cell.j === customPathPoints[customPathPoints.length-2].j) {
                let p = customPathPoints.pop(), n = customPathPoints[customPathPoints.length-1];
                if(!p.isBoundary) p.isCustomPath = false;
                if(!p.isBoundary && !n.isBoundary) grid.addWall(p, n);
                draw(); return;
            }
            if(customPathPoints.some(p => p.i === cell.i && p.j === cell.j) || (cell.isBoundary && head.isBoundary)) return;

            customPathPoints.push(cell);
            if(!cell.isBoundary) cell.isCustomPath = true;
            if(!cell.isBoundary && !head.isBoundary) grid.removeWall(head, cell);
            
            ui.btnClearPath.innerText = "🗑️ Clear Custom Path";
            ui.btnClearPath.classList.remove('btn-primary');
            draw();
        }
    }
});

canvas.addEventListener('pointerup', () => { draggingNode = null; isDrawingSnake = false; });
canvas.addEventListener('pointercancel', () => { draggingNode = null; isDrawingSnake = false; });

function exportSVG() {
    const isRound = ui.output.round.checked, joinStyle = isRound ? 'round' : 'miter', capStyle = isRound ? 'round' : 'square';
    let lines = [];
    
    if (ui.output.simplify.checked) {
        const addL = (x1, y1, x2, y2) => lines.push(`<line x1="${x1*cellSize}" y1="${y1*cellSize}" x2="${x2*cellSize}" y2="${y2*cellSize}" />`);
        for(let j=0; j<grid.rows; j++) {
            let s = -1;
            for(let i=0; i<grid.cols; i++) {
                if(grid.getCell(i,j).walls[0] && !isBoundaryOpen(i, j, 0)) { if(s === -1) s = i; } 
                else if(s !== -1) { addL(s, j, i, j); s = -1; }
            }
            if(s !== -1) addL(s, j, grid.cols, j);
        }
        let sb = -1;
        for(let i=0; i<grid.cols; i++) {
            if(!isBoundaryOpen(i, grid.rows-1, 2)) { if(sb === -1) sb = i; }
            else if(sb !== -1) { addL(sb, grid.rows, i, grid.rows); sb = -1; }
        }
        if(sb !== -1) addL(sb, grid.rows, grid.cols, grid.rows);

        for(let i=0; i<grid.cols; i++) {
            let s = -1;
            for(let j=0; j<grid.rows; j++) {
                if(grid.getCell(i,j).walls[3] && !isBoundaryOpen(i, j, 3)) { if(s === -1) s = j; } 
                else if(s !== -1) { addL(i, s, i, j); s = -1; }
            }
            if(s !== -1) addL(i, s, i, grid.rows);
        }
        let sr = -1;
        for(let j=0; j<grid.rows; j++) {
            if(!isBoundaryOpen(grid.cols-1, j, 1)) { if(sr === -1) sr = j; }
            else if(sr !== -1) { addL(grid.cols, sr, grid.cols, j); sr = -1; }
        }
        if(sr !== -1) addL(grid.cols, sr, grid.cols, grid.rows);
    } else {
        for(let c of grid.cells) {
            let x = c.i * cellSize, y = c.j * cellSize;
            if(c.walls[0] && !isBoundaryOpen(c.i, c.j, 0)) lines.push(`<line x1="${x}" y1="${y}" x2="${x+cellSize}" y2="${y}" />`);
            if(c.walls[1] && !isBoundaryOpen(c.i, c.j, 1)) lines.push(`<line x1="${x+cellSize}" y1="${y}" x2="${x+cellSize}" y2="${y+cellSize}" />`);
            if(c.walls[2] && !isBoundaryOpen(c.i, c.j, 2)) lines.push(`<line x1="${x+cellSize}" y1="${y+cellSize}" x2="${x}" y2="${y+cellSize}" />`);
            if(c.walls[3] && !isBoundaryOpen(c.i, c.j, 3)) lines.push(`<line x1="${x}" y1="${y+cellSize}" x2="${x}" y2="${y}" />`);
        }
    }

    let activePath = ui.mode.value === 'auto' ? solutionPath : (ui.mode.value === 'draw' ? customPathPoints : []);
    let poly = activePath.length > 0 ? `<polyline points="${activePath.map(p => `${p.i*cellSize + cellSize/2},${p.j*cellSize + cellSize/2}`).join(" ")}" stroke="red" stroke-width="${Math.max(2, cellSize/4)}" fill="none" stroke-linejoin="${joinStyle}" stroke-linecap="${capStyle}" opacity="0.8"/>` : "";

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${grid.cols*cellSize} ${grid.rows*cellSize}"><rect width="100%" height="100%" fill="white"/><g stroke="black" stroke-width="${Math.max(2, cellSize/10)}" stroke-linecap="${capStyle}" stroke-linejoin="${joinStyle}">${lines.join('\n')}</g>${poly}</svg>`;
    download(`maze_${grid.cols}x${grid.rows}.svg`, svg, "image/svg+xml");
}

function exportPNG() {
    const oc = document.createElement('canvas'), s = 4, w = grid.cols * s + 1, h = grid.rows * s + 1;
    oc.width = w; oc.height = h;
    const ctx = oc.getContext('2d');
    
    ctx.fillStyle = "black"; ctx.fillRect(0,0,w,h);
    ctx.fillStyle = "white";
    for(let c of grid.cells) {
        let x = c.i * s + 1, y = c.j * s + 1;
        ctx.fillRect(x, y, 3, 3);
        if(!c.walls[1] || isBoundaryOpen(c.i, c.j, 1)) ctx.fillRect(x+3, y, 1, 3);
        if(!c.walls[2] || isBoundaryOpen(c.i, c.j, 2)) ctx.fillRect(x, y+3, 3, 1);
        if(isBoundaryOpen(c.i, c.j, 0)) ctx.fillRect(x, y-1, 3, 1);
        if(isBoundaryOpen(c.i, c.j, 3)) ctx.fillRect(x-1, y, 1, 3);
    }

    let pth = ui.mode.value === 'auto' ? solutionPath : (ui.mode.value === 'draw' ? customPathPoints : []);
    if(pth.length > 0) {
        ctx.fillStyle = "red";
        for(let i=0; i<pth.length; i++) {
            let cx = pth[i].i * s + 2, cy = pth[i].j * s + 2;
            if(pth[i].isBoundary) {
                if(pth[i].i === -1) cx = 0; else if(pth[i].i === grid.cols) cx = w - 1;
                else if(pth[i].j === -1) cy = 0; else if(pth[i].j === grid.rows) cy = h - 1;
            }
            ctx.fillRect(cx, cy, 1, 1);
            if(i < pth.length-1) {
                let nx = pth[i+1].i * s + 2, ny = pth[i+1].j * s + 2;
                if(pth[i+1].isBoundary) {
                    if(pth[i+1].i === -1) nx = 0; else if(pth[i+1].i === grid.cols) nx = w - 1;
                    else if(pth[i+1].j === -1) ny = 0; else if(pth[i+1].j === grid.rows) ny = h - 1;
                }
                if(cx < nx) ctx.fillRect(cx, cy, (nx-cx)+1, 1); else if(cx > nx) ctx.fillRect(nx, ny, (cx-nx)+1, 1);
                else if(cy < ny) ctx.fillRect(cx, cy, 1, (ny-cy)+1); else if(cy > ny) ctx.fillRect(cx, ny, 1, (cy-ny)+1);
            }
        }
    }
    download(`maze_${grid.cols}x${grid.rows}.png`, oc.toDataURL("image/png"), "image/png");
}

function download(name, url, type) {
    if(!url.startsWith('data:')) url = URL.createObjectURL(new Blob([url], {type: type}));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
}

function showToast(msg) {
    const d = document.createElement('div'); d.className = 'toast'; d.innerText = msg;
    document.getElementById('toast-container').appendChild(d); setTimeout(()=>d.remove(), 3000);
}

ui.output.svg.addEventListener('click', exportSVG);
ui.output.png.addEventListener('click', exportPNG);
init();