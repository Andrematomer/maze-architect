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
    speedLbl: document.getElementById('lbl-speed'),
    loops: document.getElementById('inp-loops'),
    btnGen: document.getElementById('btn-generate'),
    status: document.getElementById('status-text'),
    mode: document.getElementById('sel-mode'),
    uiDraw: document.getElementById('ui-draw'),
    btnClearPath: document.getElementById('btn-tool-clear'),
    hideEmoji: document.getElementById('chk-emoji'),
    wrapAlgo: document.getElementById('wrapper-algorithm'),
    colWall: document.getElementById('col-wall'),
    wrapColPath: document.getElementById('wrap-col-path'),
    colPath: document.getElementById('col-path'),
    arrowOverlay: document.getElementById('arrow-overlay'),
    arrows: {
        up: document.querySelector('.arrow-up'),
        down: document.querySelector('.arrow-down'),
        left: document.querySelector('.arrow-left'),
        right: document.querySelector('.arrow-right')
    },
    output: { 
        svg: document.getElementById('btn-exp-svg'),
        pngHighRes: document.getElementById('btn-exp-png-highres'),
        pngPixel: document.getElementById('btn-exp-png-pixel'),
        round: document.getElementById('chk-round'),
        simplify: document.getElementById('chk-simplify'),
        expPathWrap: document.getElementById('wrap-exp-path'),
        expPath: document.getElementById('chk-exp-path')
    }
};

let grid, cellSize, offsetX = 0, offsetY = 0;
let isGenerating = false, currentGenId = 0, customPathPoints = []; 
let isRatioLocked = false, lockedRatio = 1, oldCols = 20, oldRows = 20;

let startCoords = {i: -1, j: 0}; 
let goalCoords = {i: 20, j: 19}; 
let draggingNode = null; 
let isDrawingSnake = false; 
let solutionPath = [];

let genHead = null, genMonkeyFaceRight = true; 
let originalWalls = [], removableWallPool = [];

let hasDrawnSuccessfully = false;

Grid.prototype.addWall = function(a, b) {
    if(a.isBoundary || b.isBoundary) return; 
    let x = a.i - b.i, y = a.j - b.j;
    if (x === 1) { a.walls[3] = true; b.walls[1] = true; }
    else if (x === -1) { a.walls[1] = true; b.walls[3] = true; }
    if (y === 1) { a.walls[0] = true; b.walls[2] = true; }
    else if (y === -1) { a.walls[2] = true; b.walls[0] = true; }
};

function abortGeneration() {
    if(!isGenerating) return;
    currentGenId++; 
    isGenerating = false;
    ui.status.innerText = "Ready";
    ui.btnGen.innerText = "GENERATE MAZE";
    ui.btnGen.classList.remove('btn-danger'); 
    genHead = null;
    setupGrid();
    if (ui.mode.value === 'draw') generateRandomPathTemplate();
    draw();
}

function init() {
    resize();
    setupGrid();
    window.addEventListener('resize', () => { resize(); draw(); });
    updateSpeedLabel();
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
    genHead = null;
    
    updateExportPathVisibility();
    updateArrowOverlay();
    draw();
}

function updateExportPathVisibility() {
    let hasPath = (ui.mode.value === 'auto' && solutionPath.length > 0) || (ui.mode.value === 'draw' && customPathPoints.length > 0);
    if(hasPath) {
        ui.output.expPathWrap.classList.remove('hidden');
        ui.wrapColPath.classList.remove('hidden');
    } else {
        ui.output.expPathWrap.classList.add('hidden');
        ui.wrapColPath.classList.add('hidden');
    }
}

function calculateMonkeyDirection(prev, next, defaultRight) {
    if (!next) return defaultRight;
    if (prev) {
        if (next.i > prev.i) return true; 
        if (next.i < prev.i) return false; 
    }
    return defaultRight; 
}

ui.speed.oninput = function() {
    const raw = this.valueAsNumber;
    let result;
    if (raw > 0 && raw < 10) result = 10;
    else if (raw < 100 && raw > 90) result = 90;
    else result = Math.round(raw);
    this.value = result;
    updateSpeedLabel();
};

function updateSpeedLabel() {
    let raw = parseInt(ui.speed.value);
    let mappedVal = Math.round((raw - 10) * (100 - 1) / (90 - 10) + 1);

    if(raw === 0) ui.speedLbl.innerText = "Paused ⏸️";
    else if(raw === 100) ui.speedLbl.innerText = "Instant ✨";
    else ui.speedLbl.innerText = mappedVal;
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

function drawEmoji(emoji, x, y, size, faceRight = true) {
    ctx.font = `${size}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.save();
    ctx.translate(x, y);
    if (faceRight) ctx.scale(-1, 1);
    ctx.fillText(emoji, 0, 2);
    ctx.restore();
}

let colorDebounce;
const handleColorChange = () => {
    clearTimeout(colorDebounce);
    colorDebounce = setTimeout(draw, 10);
};
ui.colWall.addEventListener('input', handleColorChange);
ui.colPath.addEventListener('input', handleColorChange);

function draw() {
    if(!grid) return;
    ctx.fillStyle = "transparent";
    ctx.clearRect(0,0,canvas.width, canvas.height);

    cellSize = Math.max(4, Math.floor(Math.min((canvas.width-40)/(grid.cols+2), (canvas.height-40)/(grid.rows+2))));
    const trueGridW = grid.cols * cellSize;
    const trueGridH = grid.rows * cellSize;
    
    offsetX = Math.floor((canvas.width - trueGridW)/2);
    offsetY = Math.floor((canvas.height - trueGridH)/2);

    ctx.fillStyle = "#fff";
    ctx.fillRect(offsetX - cellSize, offsetY - cellSize, trueGridW + (cellSize*2), trueGridH + (cellSize*2));

    for(let c of grid.cells) {
        let x = offsetX + c.i * cellSize, y = offsetY + c.j * cellSize;
        ctx.fillStyle = c.visited ? "#fff" : "#e0e0e0";
        ctx.fillRect(x, y, cellSize, cellSize);
    }

    const isRound = ui.output.round.checked;
    ctx.strokeStyle = ui.colWall.value;
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
        ctx.strokeStyle = ui.colPath.value;
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
            ctx.fillStyle = "#0056b3"; // Canvas safe blueprint blue hex
            let last = customPathPoints[customPathPoints.length - 1];
            ctx.beginPath();
            ctx.arc(offsetX + last.i*cellSize + cellSize/2, offsetY + last.j*cellSize + cellSize/2, cellSize/4, 0, Math.PI*2);
            ctx.fill();
        }
    }

    updateArrowOverlay();

    let eSize = Math.max(12, cellSize * 0.7);

    if (ui.mode.value === 'auto' && !isGenerating) {
        let monkeyFaceRight = true;
        if(solutionPath.length > 1) {
            let firstHoriz = solutionPath.find((p, idx) => idx > 0 && p.i !== solutionPath[idx-1].i);
            if(firstHoriz) {
                let prev = solutionPath[solutionPath.indexOf(firstHoriz) - 1];
                monkeyFaceRight = firstHoriz.i > prev.i; 
            } else monkeyFaceRight = true; 
        }
        drawEmoji("🐒", offsetX + startCoords.i * cellSize + cellSize/2, offsetY + startCoords.j * cellSize + cellSize/2, eSize, monkeyFaceRight);
        drawEmoji("🍌", offsetX + goalCoords.i * cellSize + cellSize/2, offsetY + goalCoords.j * cellSize + cellSize/2, eSize, true);
    }

    if (isGenerating && ui.hideEmoji.checked && parseInt(ui.speed.value) < 100) {
        if (genHead && !genHead.isBoundary) {
            drawEmoji("🐒", offsetX + genHead.i * cellSize + cellSize/2, offsetY + genHead.j * cellSize + cellSize/2, eSize, genMonkeyFaceRight);
        }
    }
}

function updateArrowOverlay() {
    if (ui.mode.value !== 'draw' || isGenerating || customPathPoints.length === 0 || hasDrawnSuccessfully || isDrawingSnake) {
        ui.arrowOverlay.classList.add('hidden');
        return;
    }

    let last = customPathPoints[customPathPoints.length - 1];
    let cx = offsetX + last.i * cellSize + cellSize/2;
    let cy = offsetY + last.j * cellSize + cellSize/2;

    ui.arrows.up.style.left = `${cx}px`; ui.arrows.up.style.top = `${cy - cellSize}px`;
    ui.arrows.down.style.left = `${cx}px`; ui.arrows.down.style.top = `${cy + cellSize}px`;
    ui.arrows.left.style.left = `${cx - cellSize}px`; ui.arrows.left.style.top = `${cy}px`;
    ui.arrows.right.style.left = `${cx + cellSize}px`; ui.arrows.right.style.top = `${cy}px`;

    ui.arrowOverlay.classList.remove('hidden');
}


function solveMaze() {
    solutionPath = [];
    if (ui.mode.value !== 'auto' || isGenerating) {
        updateExportPathVisibility();
        return;
    }

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
        if (current.i === goalCoords.i && current.j === goalCoords.j) { 
            solutionPath = path; 
            updateExportPathVisibility();
            return; 
        }
        for (let n of getNeighbors(current)) {
            if (n && !visited.has(`${n.i},${n.j}`)) {
                visited.add(`${n.i},${n.j}`);
                queue.push([...path, n]);
            }
        }
    }
    updateExportPathVisibility();
}

async function generate() {
    currentGenId++;
    const myGenId = currentGenId;
    isGenerating = true;
    solutionPath = []; 
    updateExportPathVisibility();
    updateArrowOverlay();
    
    const algoKey = ui.algo.value;

    ui.status.innerText = "Generating...";
    ui.btnGen.innerText = "ABORT";
    ui.btnGen.classList.add('btn-danger'); 
    
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
    
    const checkPause = async (curr, next, isFadeEvent) => {
        if(myGenId !== currentGenId) throw "ABORT";
        
        while(parseInt(ui.speed.value) === 0) {
            if(myGenId !== currentGenId) throw "ABORT";
            ui.status.innerText = "Paused";
            await Algo.sleep(100);
        }
        if(ui.status.innerText === "Paused") ui.status.innerText = "Generating...";

        let speed = parseInt(ui.speed.value);
        if (speed === 100) {
            if(stepCount++ % 1000 === 0) await Algo.sleep(0); 
            return;
        }
        
        if(ui.hideEmoji.checked) {
            if (!isFadeEvent && next && !Array.isArray(next)) { 
                genMonkeyFaceRight = calculateMonkeyDirection(curr, next, genMonkeyFaceRight);
                genHead = next;
            } else if (isFadeEvent && next) {
                genHead = next;
            }
        } else {
            genHead = null;
        }

        if (speed >= 90) {
            if(stepCount++ % 10 === 0) await Algo.sleep(0); 
        } else {
            let delay = Math.floor(Math.pow((90 - speed) / 10, 2) * 12) + 1;
            await Algo.sleep(delay);
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
    genHead = null; 
    applyEraser(); 
    
    ui.status.innerText = "Done";
    ui.btnGen.innerText = "GENERATE MAZE";
    ui.btnGen.classList.remove('btn-danger');
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

    if(isGenerating) abortGeneration();
    else {
        setupGrid();
        if(ui.mode.value === 'draw') generateRandomPathTemplate();
        draw();
    }
};

ui.cols.addEventListener('change', () => {
    if(isRatioLocked) ui.rows.value = Math.max(2, Math.round(parseInt(ui.cols.value) / lockedRatio));
    validateAndApplySize();
});

ui.rows.addEventListener('change', () => {
    if(isRatioLocked) ui.cols.value = Math.max(2, Math.round(parseInt(ui.rows.value) * lockedRatio));
    validateAndApplySize();
});

ui.lock.addEventListener('click', () => {
    isRatioLocked = !isRatioLocked;
    ui.lock.classList.toggle('active', isRatioLocked);
    if(isRatioLocked) lockedRatio = parseInt(ui.cols.value) / parseInt(ui.rows.value);
});

ui.algo.addEventListener('change', () => { if (isGenerating) abortGeneration(); });
ui.output.expPath.addEventListener('change', draw); 

const disableIncompatibleAlgos = (mode) => {
    if(mode === 'draw') {
        ui.wrapAlgo.classList.add('hidden');
        ui.loops.value = 0; 
    } else {
        ui.wrapAlgo.classList.remove('hidden');
    }
    if(mode === 'draw') ui.algo.value = 'kruskal'; 
};

// Generates valid path and removes grid walls as it goes
function generateRandomPathTemplate() {
    customPathPoints = [];
    hasDrawnSuccessfully = false; 
    let r = Math.floor(grid.rows / 2);
    
    let startBound = {i: -1, j: r, isBoundary: true};
    customPathPoints.push(startBound);
    
    let curr = grid.getCell(0, r);
    customPathPoints.push(curr);
    curr.isCustomPath = true;
    
    let visited = new Set([`0,${r}`]);
    let lastDir = null; 
    let midpoint = Math.floor(grid.cols / 2);

    while(curr && curr.i < midpoint) {
        let dist = Math.floor(Math.random() * 5) + 1; 
        let possibleDirs = ['up', 'down', 'right'].filter(d => d !== lastDir);
        let chosenDir = possibleDirs[Math.floor(Math.random() * possibleDirs.length)];
        lastDir = chosenDir;

        for(let step=0; step<dist; step++) {
            let nextI = curr.i, nextJ = curr.j;
            if(chosenDir === 'up') nextJ--;
            if(chosenDir === 'down') nextJ++;
            if(chosenDir === 'right') nextI++;

            if(nextI >= grid.cols || nextJ < 0 || nextJ >= grid.rows) break; 
            if(visited.has(`${nextI},${nextJ}`)) break; 

            let nextCell = grid.getCell(nextI, nextJ);
            grid.removeWall(curr, nextCell); 
            nextCell.isCustomPath = true;
            
            curr = nextCell;
            customPathPoints.push(curr);
            visited.add(`${curr.i},${curr.j}`);
            
            if(curr.i >= midpoint) break; 
        }
    }
    
    updateExportPathVisibility();
}

let lastMode = 'none';
ui.mode.addEventListener('change', () => {
    const val = ui.mode.value;
    if (isGenerating) abortGeneration();

    if (val === 'draw') {
        ui.uiDraw.classList.remove('hidden');
        disableIncompatibleAlgos('draw');
        setupGrid(); 
        generateRandomPathTemplate();
        ui.btnClearPath.innerText = "🗑️ Clear Sample Path";
        ui.btnClearPath.classList.add('btn-pulse'); 
        draw();
    } else {
        ui.uiDraw.classList.add('hidden');
        hasDrawnSuccessfully = false;
        disableIncompatibleAlgos('none');
        if (lastMode === 'draw') setupGrid(); 
        else { solveMaze(); draw(); }
    }
    lastMode = val;
});

ui.btnClearPath.addEventListener('click', () => { 
    ui.btnClearPath.innerText = "🗑️ Clear Custom Path";
    ui.btnClearPath.classList.remove('btn-pulse');
    customPathPoints = []; 
    hasDrawnSuccessfully = true; 
    updateExportPathVisibility();
    setupGrid(); 
});

ui.output.round.addEventListener('change', draw);
ui.output.simplify.addEventListener('change', draw);
ui.loops.addEventListener('input', applyEraser);
ui.btnGen.addEventListener('click', () => {
    if(isGenerating) abortGeneration();
    else generate();
});
ui.hideEmoji.addEventListener('change', draw); 

// --- POINTER INTERACTION (SINGLE HEAD) ---

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
        ui.arrowOverlay.classList.add('hidden'); 

        if(customPathPoints.length === 0) {
            isDrawingSnake = true;
            customPathPoints = [cell];
            if(!cell.isBoundary) cell.isCustomPath = true;
            hasDrawnSuccessfully = true; 
            updateExportPathVisibility();
            draw();
        } else {
            let head = customPathPoints[customPathPoints.length-1];
            if(cell.i === head.i && cell.j === head.j) {
                isDrawingSnake = true;
            }
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
            
            // Undo logic (dragged backward over the previous cell)
            if(customPathPoints.length > 1 && cell.i === customPathPoints[customPathPoints.length-2].i && cell.j === customPathPoints[customPathPoints.length-2].j) {
                let p = customPathPoints.pop(), n = customPathPoints[customPathPoints.length-1];
                if(!p.isBoundary) p.isCustomPath = false;
                if(!p.isBoundary && !n.isBoundary) grid.addWall(p, n); // Restore physical wall
                
                hasDrawnSuccessfully = true; 
                ui.btnClearPath.innerText = "🗑️ Clear Custom Path";
                ui.btnClearPath.classList.remove('btn-pulse');
                draw(); return;
            }
            
            if(customPathPoints.some(p => p.i === cell.i && p.j === cell.j) || (cell.isBoundary && head.isBoundary)) return;

            // Draw Forward
            customPathPoints.push(cell);
            if(!cell.isBoundary) cell.isCustomPath = true;
            if(!cell.isBoundary && !head.isBoundary) grid.removeWall(head, cell); // Erase physical wall
            
            hasDrawnSuccessfully = true; 
            ui.btnClearPath.innerText = "🗑️ Clear Custom Path";
            ui.btnClearPath.classList.remove('btn-pulse');
            draw();
        }
    }
});

canvas.addEventListener('pointerup', () => { 
    draggingNode = null; isDrawingSnake = false; 
    draw(); 
});
canvas.addEventListener('pointercancel', () => { 
    draggingNode = null; isDrawingSnake = false; 
    draw(); 
});

// --- EXPORTS ---

function getSVGString(isRound, doSimplify) {
    const w = (grid.cols + 2) * cellSize, h = (grid.rows + 2) * cellSize; 
    const joinStyle = isRound ? 'round' : 'miter', capStyle = isRound ? 'round' : 'square';
    let lines = [];
    const sx = (x) => (x+1) * cellSize, sy = (y) => (y+1) * cellSize;

    if (doSimplify) {
        const addL = (x1, y1, x2, y2) => lines.push(`<line x1="${sx(x1)}" y1="${sy(y1)}" x2="${sx(x2)}" y2="${sy(y2)}" />`);
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
            let i = c.i, j = c.j;
            if(c.walls[0] && !isBoundaryOpen(i, j, 0)) lines.push(`<line x1="${sx(i)}" y1="${sy(j)}" x2="${sx(i+1)}" y2="${sy(j)}" />`);
            if(c.walls[1] && !isBoundaryOpen(i, j, 1)) lines.push(`<line x1="${sx(i+1)}" y1="${sy(j)}" x2="${sx(i+1)}" y2="${sy(j+1)}" />`);
            if(c.walls[2] && !isBoundaryOpen(i, j, 2)) lines.push(`<line x1="${sx(i+1)}" y1="${sy(j+1)}" x2="${sx(i)}" y2="${sy(j+1)}" />`);
            if(c.walls[3] && !isBoundaryOpen(i, j, 3)) lines.push(`<line x1="${sx(i)}" y1="${sy(j+1)}" x2="${sx(i)}" y2="${sy(j)}" />`);
        }
    }

    let activePath = ui.mode.value === 'auto' ? solutionPath : (ui.mode.value === 'draw' ? customPathPoints : []);
    let poly = "";
    if (activePath.length > 0 && ui.output.expPath.checked) {
        poly = `<polyline points="${activePath.map(p => `${sx(p.i) + cellSize/2},${sy(p.j) + cellSize/2}`).join(" ")}" stroke="${ui.colPath.value}" stroke-width="${Math.max(2, cellSize/4)}" fill="none" stroke-linejoin="${joinStyle}" stroke-linecap="${capStyle}"/>`;
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="100%" height="100%" fill="white"/><g stroke="${ui.colWall.value}" stroke-width="${Math.max(2, cellSize/10)}" stroke-linecap="${capStyle}" stroke-linejoin="${joinStyle}">${lines.join('\n')}</g>${poly}</svg>`;
}

function exportSVG() { download(`maze_${grid.cols}x${grid.rows}.svg`, getSVGString(ui.output.round.checked, ui.output.simplify.checked), "image/svg+xml"); }

function exportPNGHighRes() {
    const svgString = getSVGString(ui.output.round.checked, ui.output.simplify.checked);
    const blob = new Blob([svgString], {type: 'image/svg+xml;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const img = new Image();
    
    img.onload = () => {
        const hc = document.createElement('canvas');
        hc.width = (grid.cols + 2) * cellSize * 4; 
        hc.height = (grid.rows + 2) * cellSize * 4;
        const hctx = hc.getContext('2d');
        hctx.drawImage(img, 0, 0, hc.width, hc.height);
        URL.revokeObjectURL(url);
        download(`maze_highres_${grid.cols}x${grid.rows}.png`, hc.toDataURL("image/png"), "image/png");
    };
    img.src = url;
}

function exportPNGPixel() {
    const s = 4, w = (grid.cols + 2) * s + 1, h = (grid.rows + 2) * s + 1;
    const oc = document.createElement('canvas'); oc.width = w; oc.height = h;
    const ctx = oc.getContext('2d');
    
    ctx.fillStyle = "white"; ctx.fillRect(0,0,w,h);
    ctx.fillStyle = ui.colWall.value;
    ctx.fillRect(s, s, grid.cols * s + 1, grid.rows * s + 1);

    ctx.fillStyle = "white";
    for(let c of grid.cells) {
        let x = (c.i+1) * s + 1, y = (c.j+1) * s + 1;
        ctx.fillRect(x, y, 3, 3);
        if(!c.walls[1] || isBoundaryOpen(c.i, c.j, 1)) ctx.fillRect(x+3, y, 1, 3);
        if(!c.walls[2] || isBoundaryOpen(c.i, c.j, 2)) ctx.fillRect(x, y+3, 3, 1);
        if(isBoundaryOpen(c.i, c.j, 0)) ctx.fillRect(x, y-1, 3, 1);
        if(isBoundaryOpen(c.i, c.j, 3)) ctx.fillRect(x-1, y, 1, 3);
    }

    let pth = ui.mode.value === 'auto' ? solutionPath : (ui.mode.value === 'draw' ? customPathPoints : []);
    if(pth.length > 0 && ui.output.expPath.checked) {
        ctx.fillStyle = ui.colPath.value;
        for(let i=0; i<pth.length; i++) {
            let cx = (pth[i].i+1) * s + 2, cy = (pth[i].j+1) * s + 2;
            ctx.fillRect(cx, cy, 1, 1);
            if(i < pth.length-1) {
                let nx = (pth[i+1].i+1) * s + 2, ny = (pth[i+1].j+1) * s + 2;
                if(cx < nx) ctx.fillRect(cx, cy, (nx-cx)+1, 1); else if(cx > nx) ctx.fillRect(nx, ny, (cx-nx)+1, 1);
                else if(cy < ny) ctx.fillRect(cx, cy, 1, (ny-cy)+1); else if(cy > ny) ctx.fillRect(cx, ny, 1, (cy-ny)+1);
            }
        }
    }
    download(`maze_pixel_${grid.cols}x${grid.rows}.png`, oc.toDataURL("image/png"), "image/png");
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
ui.output.pngHighRes.addEventListener('click', exportPNGHighRes);
ui.output.pngPixel.addEventListener('click', exportPNGPixel);

// DONE
init();