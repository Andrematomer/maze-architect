export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function algoDFS(grid, updateFn, checkPause) {
    let stack = [];
    let start = grid.cells.find(c => c.isCustomPath) || grid.cells[0];
    grid.cells.forEach(c => { if(c.isCustomPath) { c.visited = true; stack.push(c); }});
    if(stack.length === 0) { start.visited = true; stack.push(start); }

    while (stack.length > 0) {
        let current = stack[stack.length - 1];
        let neighbors = grid.getUnvisitedNeighbors(current);

        if (neighbors.length > 0) {
            let next = neighbors[Math.floor(Math.random() * neighbors.length)];
            await checkPause(next); 
            grid.removeWall(current, next);
            next.visited = true;
            stack.push(next);
            updateFn();
        } else {
            stack.pop();
            await checkPause(current);
            updateFn();
        }
    }
}

export async function algoPrims(grid, updateFn, checkPause) {
    let frontier = [];
    grid.cells.forEach(c => {
        if(c.isCustomPath) {
            c.visited = true;
            let ns = [ grid.getCell(c.i, c.j-1), grid.getCell(c.i+1, c.j), grid.getCell(c.i, c.j+1), grid.getCell(c.i-1, c.j) ];
            ns.forEach(n => { if(n && !n.visited && !frontier.includes(n)) frontier.push(n); });
        }
    });

    if(!frontier.length && !grid.cells[0].isCustomPath) {
        let start = grid.cells[Math.floor(Math.random() * grid.cells.length)];
        start.visited = true;
        let ns = grid.getUnvisitedNeighbors(start);
        ns.forEach(n => frontier.push(n));
    }

    while (frontier.length > 0) {
        let randIdx = Math.floor(Math.random() * frontier.length);
        let cell = frontier[randIdx];
        frontier.splice(randIdx, 1);

        let ns = [ grid.getCell(cell.i, cell.j-1), grid.getCell(cell.i+1, cell.j), grid.getCell(cell.i, cell.j+1), grid.getCell(cell.i-1, cell.j) ];
        let visitedNs = ns.filter(n => n && n.visited);
        
        if (visitedNs.length > 0) {
            let neighbor = visitedNs[Math.floor(Math.random() * visitedNs.length)];
            await checkPause(cell); // Only pause when actually carving
            grid.removeWall(cell, neighbor);
            cell.visited = true;
            let unvisited = grid.getUnvisitedNeighbors(cell);
            unvisited.forEach(n => { if(!frontier.includes(n)) frontier.push(n); });
            updateFn();
        }
    }
}

export async function algoHuntKill(grid, updateFn, checkPause) {
    let current = grid.cells.find(c => c.isCustomPath) || grid.cells[0];
    grid.cells.forEach(c => { if(c.isCustomPath) c.visited = true; });
    current.visited = true;

    while (current) {
        let neighbors = grid.getUnvisitedNeighbors(current);
        if (neighbors.length > 0) {
            let next = neighbors[Math.floor(Math.random() * neighbors.length)];
            await checkPause(next);
            grid.removeWall(current, next);
            next.visited = true;
            current = next;
            updateFn();
        } else {
            current = null;
            for (let i = 0; i < grid.cells.length; i++) {
                let cell = grid.cells[i];
                let ns = [ grid.getCell(cell.i, cell.j-1), grid.getCell(cell.i+1, cell.j), grid.getCell(cell.i, cell.j+1), grid.getCell(cell.i-1, cell.j) ];
                let visitedNs = ns.filter(n => n && n.visited);
                if (!cell.visited && visitedNs.length > 0) {
                    current = cell;
                    await checkPause(current);
                    let neighbor = visitedNs[Math.floor(Math.random() * visitedNs.length)];
                    grid.removeWall(current, neighbor);
                    current.visited = true;
                    updateFn();
                    break;
                }
            }
        }
    }
}

export async function algoBinary(grid, updateFn, checkPause) {
    for (let c of grid.cells) {
        await checkPause(c);
        let neighbors = [];
        let top = grid.getCell(c.i, c.j - 1);
        let right = grid.getCell(c.i + 1, c.j);
        if (top) neighbors.push(top);
        if (right) neighbors.push(right);

        if (neighbors.length > 0) {
            let next = neighbors[Math.floor(Math.random() * neighbors.length)];
            grid.removeWall(c, next);
        }
        c.visited = true; 
        updateFn();
    }
}

export async function algoSidewinder(grid, updateFn, checkPause) {
    for (let j = 0; j < grid.rows; j++) {
        let run = [];
        for (let i = 0; i < grid.cols; i++) {
            let cell = grid.getCell(i, j);
            await checkPause(cell);
            run.push(cell);
            
            let atEastBound = (i === grid.cols - 1);
            let atNorthBound = (j === 0);
            let shouldCloseOut = atEastBound || (!atNorthBound && Math.random() < 0.5);

            if (shouldCloseOut) {
                let member = run[Math.floor(Math.random() * run.length)];
                let top = grid.getCell(member.i, member.j - 1);
                if (top) grid.removeWall(member, top);
                run = [];
            } else {
                let right = grid.getCell(i + 1, j);
                grid.removeWall(cell, right);
            }
            cell.visited = true;
            updateFn();
        }
    }
}

export async function algoKruskal(grid, updateFn, checkPause) {
    let sets = new Array(grid.cells.length).fill(0).map((_, i) => i);
    let edges = [];

    let pathCells = grid.cells.filter(c => c.isCustomPath);
    if(pathCells.length > 1) {
        let root = grid.index(pathCells[0].i, pathCells[0].j);
        pathCells.forEach(c => sets[grid.index(c.i, c.j)] = root);
    }

    const find = (i) => { if (sets[i] === i) return i; sets[i] = find(sets[i]); return sets[i]; }
    const union = (i, j) => { let ri = find(i); let rj = find(j); if(ri !== rj) { sets[rj] = ri; return true; } return false; }

    grid.cells.forEach(c => {
        c.visited = true;
        let r = grid.getCell(c.i+1, c.j);
        let b = grid.getCell(c.i, c.j+1);
        if(r) edges.push({a: c, b: r});
        if(b) edges.push({a: c, b: b});
    });
    edges.sort(() => Math.random() - 0.5);

    let yieldCounter = 0;
    for (let e of edges) {
        let idxA = grid.index(e.a.i, e.a.j);
        let idxB = grid.index(e.b.i, e.b.j);
        if (union(idxA, idxB)) {
            await checkPause(e.a); // Only pause when actually carving
            grid.removeWall(e.a, e.b);
            updateFn();
        } else {
            // Keep browser responsive without spawning emojis
            if(yieldCounter++ % 100 === 0) await checkPause(null);
        }
    }
}

export async function algoAldous(grid, updateFn, checkPause) {
    let current = grid.cells[Math.floor(Math.random() * grid.cells.length)];
    let unvisitedCount = grid.cells.length - 1;
    current.visited = true;

    let pathCount = grid.cells.filter(c => c.isCustomPath).length;
    if(pathCount > 0) unvisitedCount -= pathCount; 

    while (unvisitedCount > 0) {
        let neighbors = [ grid.getCell(current.i, current.j-1), grid.getCell(current.i+1, current.j), grid.getCell(current.i, current.j+1), grid.getCell(current.i-1, current.j) ].filter(n => n !== null);
        let next = neighbors[Math.floor(Math.random() * neighbors.length)];
        
        await checkPause(next); // Pause on every step of the walk!
        
        if (!next.visited) {
            grid.removeWall(current, next);
            next.visited = true;
            unvisitedCount--;
            updateFn();
        }
        current = next;
    }
}

export async function algoWilson(grid, updateFn, checkPause) {
    let unvisited = grid.cells.slice();
    let visited = [];
    
    let start = unvisited.splice(Math.floor(Math.random() * unvisited.length), 1)[0];
    start.visited = true;
    visited.push(start);
    
    while(unvisited.length > 0) {
        let u = unvisited[Math.floor(Math.random() * unvisited.length)];
        let path = [u];
        let walking = true;
        
        while(walking) {
            let curr = path[path.length-1];
            let neighbors = [ grid.getCell(curr.i, curr.j-1), grid.getCell(curr.i+1, curr.j), grid.getCell(curr.i, curr.j+1), grid.getCell(curr.i-1, curr.j) ].filter(n => n !== null);
            let next = neighbors[Math.floor(Math.random() * neighbors.length)];
            
            await checkPause(next); // Show the monkey during the walk
            updateFn(); // Redraw to update monkey position

            let index = path.indexOf(next);
            if (index !== -1) path.splice(index + 1); 
            else { path.push(next); if (next.visited) walking = false; }
        }
        
        for(let i=0; i<path.length-1; i++) {
            let a = path[i];
            let b = path[i+1];
            await checkPause(a); // Carving path
            grid.removeWall(a, b);
            a.visited = true;
            if(unvisited.includes(a)) unvisited.splice(unvisited.indexOf(a), 1);
            visited.push(a);
            updateFn();
        }
    }
}

export async function algoDivision(grid, updateFn, checkPause) {
    grid.cells.forEach(c => { c.walls = [false, false, false, false]; c.visited = true; });
    grid.cells.forEach(c => {
        if(c.i===0) c.walls[3]=true;
        if(c.i===grid.cols-1) c.walls[1]=true;
        if(c.j===0) c.walls[0]=true;
        if(c.j===grid.rows-1) c.walls[2]=true;
    });
    updateFn(); 

    async function divide(x, y, w, h) {
        await checkPause(null);
        if (w < 2 || h < 2) return;
        let horizontal = Math.random() < 0.5;
        if (w > h) horizontal = false;
        if (h > w) horizontal = true;

        if (horizontal) {
            let wallY = Math.floor(Math.random() * (h - 1)) + y;
            let holeX = Math.floor(Math.random() * w) + x;
            for (let i = x; i < x + w; i++) {
                if (i !== holeX) {
                    let top = grid.getCell(i, wallY);
                    let bot = grid.getCell(i, wallY + 1);
                    if(top && bot) { top.walls[2] = true; bot.walls[0] = true; updateFn(); }
                }
            }
            await divide(x, y, w, wallY - y + 1);
            await divide(x, wallY + 1, w, y + h - wallY - 1);
        } else {
            let wallX = Math.floor(Math.random() * (w - 1)) + x;
            let holeY = Math.floor(Math.random() * h) + y;
            for (let j = y; j < y + h; j++) {
                if (j !== holeY) {
                    let left = grid.getCell(wallX, j);
                    let right = grid.getCell(wallX + 1, j);
                    if(left && right) { left.walls[1] = true; right.walls[3] = true; updateFn(); }
                }
            }
            await divide(x, y, wallX - x + 1, h);
            await divide(wallX + 1, y, x + w - wallX - 1, h);
        }
    }
    await divide(0, 0, grid.cols, grid.rows);
}

export async function algoEller(grid, updateFn, checkPause) {
    let rowSet = new Array(grid.cols).fill(0);
    let nextSetId = 1;

    for (let j = 0; j < grid.rows; j++) {
        await checkPause(null);
        for(let i=0; i<grid.cols; i++) {
            if(rowSet[i] === 0) rowSet[i] = nextSetId++;
            grid.getCell(i, j).visited = true;
        }

        for(let i=0; i<grid.cols-1; i++) {
            let right = (Math.random() > 0.5) || (j === grid.rows - 1 && rowSet[i] !== rowSet[i+1]); 
            if(right && rowSet[i] !== rowSet[i+1]) {
                grid.removeWall(grid.getCell(i, j), grid.getCell(i+1, j));
                let oldSet = rowSet[i+1];
                let newSet = rowSet[i];
                for(let k=0; k<grid.cols; k++) { if(rowSet[k] === oldSet) rowSet[k] = newSet; }
            }
        }

        if (j < grid.rows - 1) {
             let nextRowSet = new Array(grid.cols).fill(0);
             let setsInRow = [...new Set(rowSet)];
             setsInRow.forEach(sid => {
                 let colsInSet = [];
                 rowSet.forEach((s, idx) => { if(s===sid) colsInSet.push(idx); });
                 
                 let count = Math.floor(Math.random() * colsInSet.length) + 1;
                 colsInSet.sort(() => Math.random() - 0.5);
                 for(let k=0; k<count; k++) {
                     let idx = colsInSet[k];
                     grid.removeWall(grid.getCell(idx, j), grid.getCell(idx, j+1));
                     nextRowSet[idx] = sid;
                 }
             });
             rowSet = nextRowSet;
        } else {
             for(let i=0; i<grid.cols-1; i++) {
                 if(rowSet[i] !== rowSet[i+1]) {
                     grid.removeWall(grid.getCell(i, j), grid.getCell(i+1, j));
                     let oldSet = rowSet[i+1];
                     let newSet = rowSet[i];
                     for(let k=0; k<grid.cols; k++) { if(rowSet[k] === oldSet) rowSet[k] = newSet; }
                 }
             }
        }
        updateFn();
    }
}