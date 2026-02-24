// Utility for delay
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// --- ALGORITHMS ---

// 1. Recursive Backtracker (DFS)
export async function algoDFS(grid, updateFn, checkPause) {
    let stack = [];
    // If custom path exists, find the last point of it to start, otherwise 0,0
    let start = grid.cells.find(c => c.isCustomPath) || grid.cells[0];
    
    // Mark custom path as visited
    grid.cells.forEach(c => { if(c.isCustomPath) { c.visited = true; stack.push(c); }});
    if(stack.length === 0) { start.visited = true; stack.push(start); }

    while (stack.length > 0) {
        await checkPause();
        let current = stack[stack.length - 1];
        let neighbors = grid.getUnvisitedNeighbors(current);

        if (neighbors.length > 0) {
            let next = neighbors[Math.floor(Math.random() * neighbors.length)];
            grid.removeWall(current, next);
            next.visited = true;
            stack.push(next);
            updateFn(current); // Draw
        } else {
            stack.pop();
            updateFn(current);
        }
    }
}

// 2. Prim's
export async function algoPrims(grid, updateFn, checkPause) {
    let frontier = [];
    // Init existing path
    grid.cells.forEach(c => {
        if(c.isCustomPath) {
            c.visited = true;
            // Add neighbors of path to frontier
            let ns = [
                grid.getCell(c.i, c.j-1), grid.getCell(c.i+1, c.j),
                grid.getCell(c.i, c.j+1), grid.getCell(c.i-1, c.j)
            ];
            ns.forEach(n => { if(n && !n.visited && !frontier.includes(n)) frontier.push(n); });
        }
    });

    if(!frontier.length && !grid.cells[0].isCustomPath) {
        let start = grid.cells[Math.floor(Math.random() * grid.cells.length)];
        start.visited = true;
        let ns = grid.getUnvisitedNeighbors(start); // reusing this function to get valid neighbors
        ns.forEach(n => frontier.push(n));
    }

    while (frontier.length > 0) {
        await checkPause();
        let randIdx = Math.floor(Math.random() * frontier.length);
        let cell = frontier[randIdx];
        frontier.splice(randIdx, 1);

        // Find a visited neighbor to connect to
        let ns = [
            grid.getCell(cell.i, cell.j-1), grid.getCell(cell.i+1, cell.j),
            grid.getCell(cell.i, cell.j+1), grid.getCell(cell.i-1, cell.j)
        ];
        let visitedNs = ns.filter(n => n && n.visited);
        
        if (visitedNs.length > 0) {
            let neighbor = visitedNs[Math.floor(Math.random() * visitedNs.length)];
            grid.removeWall(cell, neighbor);
            cell.visited = true;
            
            // Add new neighbors
            let unvisited = grid.getUnvisitedNeighbors(cell);
            unvisited.forEach(n => {
                if(!frontier.includes(n)) frontier.push(n);
            });
            updateFn(cell);
        }
    }
}

// 3. Hunt and Kill
export async function algoHuntKill(grid, updateFn, checkPause) {
    let current = grid.cells.find(c => c.isCustomPath) || grid.cells[0];
    
    // Mark custom path
    grid.cells.forEach(c => { if(c.isCustomPath) c.visited = true; });
    current.visited = true;

    while (current) {
        await checkPause();
        let neighbors = grid.getUnvisitedNeighbors(current);
        
        if (neighbors.length > 0) {
            let next = neighbors[Math.floor(Math.random() * neighbors.length)];
            grid.removeWall(current, next);
            next.visited = true;
            current = next;
            updateFn(current);
        } else {
            // Hunt
            current = null;
            for (let i = 0; i < grid.cells.length; i++) {
                let cell = grid.cells[i];
                let ns = [
                    grid.getCell(cell.i, cell.j-1), grid.getCell(cell.i+1, cell.j),
                    grid.getCell(cell.i, cell.j+1), grid.getCell(cell.i-1, cell.j)
                ];
                let visitedNs = ns.filter(n => n && n.visited);
                
                if (!cell.visited && visitedNs.length > 0) {
                    current = cell;
                    let neighbor = visitedNs[Math.floor(Math.random() * visitedNs.length)];
                    grid.removeWall(current, neighbor);
                    current.visited = true;
                    updateFn(current);
                    break;
                }
            }
        }
    }
}

// 4. Binary Tree
export async function algoBinary(grid, updateFn, checkPause) {
    for (let c of grid.cells) {
        await checkPause();
        let neighbors = [];
        let top = grid.getCell(c.i, c.j - 1);
        let right = grid.getCell(c.i + 1, c.j); // North and East (or Top and Right)
        
        if (top) neighbors.push(top);
        if (right) neighbors.push(right);

        if (neighbors.length > 0) {
            let next = neighbors[Math.floor(Math.random() * neighbors.length)];
            grid.removeWall(c, next);
        }
        c.visited = true; // For color
        updateFn(c);
    }
}

// 5. Sidewinder
export async function algoSidewinder(grid, updateFn, checkPause) {
    for (let j = 0; j < grid.rows; j++) {
        let run = [];
        for (let i = 0; i < grid.cols; i++) {
            await checkPause();
            let cell = grid.getCell(i, j);
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
            updateFn(cell);
        }
    }
}

// 6. Kruskal's
export async function algoKruskal(grid, updateFn, checkPause) {
    let sets = new Array(grid.cells.length).fill(0).map((_, i) => i);
    let edges = [];

    // Pre-process custom path: Union them all
    let pathCells = grid.cells.filter(c => c.isCustomPath);
    if(pathCells.length > 1) {
        let root = grid.index(pathCells[0].i, pathCells[0].j);
        pathCells.forEach(c => sets[grid.index(c.i, c.j)] = root);
    }

    const find = (i) => {
        if (sets[i] === i) return i;
        sets[i] = find(sets[i]);
        return sets[i];
    }
    const union = (i, j) => {
        let ri = find(i); 
        let rj = find(j);
        if(ri !== rj) { sets[rj] = ri; return true; }
        return false;
    }

    // Build Edges
    grid.cells.forEach(c => {
        c.visited = true; // Mark visited for visual
        let r = grid.getCell(c.i+1, c.j);
        let b = grid.getCell(c.i, c.j+1);
        if(r) edges.push({a: c, b: r});
        if(b) edges.push({a: c, b: b});
    });
    
    // Shuffle Edges
    edges.sort(() => Math.random() - 0.5);

    for (let e of edges) {
        await checkPause();
        // If edge connects two path cells, it's already open, skip logic but draw
        let idxA = grid.index(e.a.i, e.a.j);
        let idxB = grid.index(e.b.i, e.b.j);

        if (union(idxA, idxB)) {
            grid.removeWall(e.a, e.b);
            updateFn(e.a);
        }
    }
}

// 7. Aldous-Broder (Slow)
export async function algoAldous(grid, updateFn, checkPause) {
    let current = grid.cells[Math.floor(Math.random() * grid.cells.length)];
    let unvisitedCount = grid.cells.length - 1;
    current.visited = true;

    // Handle pre-visited custom path
    let pathCount = grid.cells.filter(c => c.isCustomPath).length;
    if(pathCount > 0) unvisitedCount -= pathCount; 

    while (unvisitedCount > 0) {
        await checkPause();
        let neighbors = [
            grid.getCell(current.i, current.j-1), grid.getCell(current.i+1, current.j),
            grid.getCell(current.i, current.j+1), grid.getCell(current.i-1, current.j)
        ].filter(n => n !== null);

        let next = neighbors[Math.floor(Math.random() * neighbors.length)];
        
        if (!next.visited) {
            grid.removeWall(current, next);
            next.visited = true;
            unvisitedCount--;
            updateFn(next);
        }
        current = next;
    }
}

// 8. Recursive Division
export async function algoDivision(grid, updateFn, checkPause) {
    // Reset walls: Start with empty room
    grid.cells.forEach(c => {
        c.walls = [false, false, false, false];
        c.visited = true;
    });
    // Add Border walls
    grid.cells.forEach(c => {
        if(c.i===0) c.walls[3]=true;
        if(c.i===grid.cols-1) c.walls[1]=true;
        if(c.j===0) c.walls[0]=true;
        if(c.j===grid.rows-1) c.walls[2]=true;
    });
    
    updateFn(null); // Draw clear

    async function divide(x, y, w, h) {
        await checkPause();
        if (w < 2 || h < 2) return;

        let horizontal = Math.random() < 0.5;
        if (w > h) horizontal = false;
        if (h > w) horizontal = true;

        if (horizontal) {
            // Split Horizontally
            let wallY = Math.floor(Math.random() * (h - 1)) + y;
            let holeX = Math.floor(Math.random() * w) + x;
            
            for (let i = x; i < x + w; i++) {
                if (i !== holeX) {
                    let top = grid.getCell(i, wallY);
                    let bot = grid.getCell(i, wallY + 1);
                    if(top && bot) {
                        top.walls[2] = true;
                        bot.walls[0] = true;
                        updateFn(top);
                    }
                }
            }
            await divide(x, y, w, wallY - y + 1);
            await divide(x, wallY + 1, w, y + h - wallY - 1);
        } else {
            // Split Vertically
            let wallX = Math.floor(Math.random() * (w - 1)) + x;
            let holeY = Math.floor(Math.random() * h) + y;

            for (let j = y; j < y + h; j++) {
                if (j !== holeY) {
                    let left = grid.getCell(wallX, j);
                    let right = grid.getCell(wallX + 1, j);
                    if(left && right) {
                        left.walls[1] = true;
                        right.walls[3] = true;
                        updateFn(left);
                    }
                }
            }
            await divide(x, y, wallX - x + 1, h);
            await divide(wallX + 1, y, x + w - wallX - 1, h);
        }
    }

    await divide(0, 0, grid.cols, grid.rows);
}

// 9. Eller's Algorithm
export async function algoEller(grid, updateFn, checkPause) {
    // Row State
    let rowSet = new Array(grid.cols).fill(0);
    let nextSetId = 1;

    for (let j = 0; j < grid.rows; j++) {
        await checkPause();
        
        // 1. Assign sets to empty cells
        for(let i=0; i<grid.cols; i++) {
            if(rowSet[i] === 0) rowSet[i] = nextSetId++;
            grid.getCell(i, j).visited = true;
        }

        // 2. Randomly merge adjacent sets (Right walls)
        for(let i=0; i<grid.cols-1; i++) {
            let right = (Math.random() > 0.5) || (j === grid.rows - 1 && rowSet[i] !== rowSet[i+1]); 
            if(right && rowSet[i] !== rowSet[i+1]) {
                grid.removeWall(grid.getCell(i, j), grid.getCell(i+1, j));
                let oldSet = rowSet[i+1];
                let newSet = rowSet[i];
                // Merge sets in row array
                for(let k=0; k<grid.cols; k++) {
                    if(rowSet[k] === oldSet) rowSet[k] = newSet;
                }
            }
        }

        // 3. Create vertical connections (Down walls)
        if (j < grid.rows - 1) {
            // Track which sets have valid vertical connection
            let setHasVertical = {}; 
            
            // Randomly create vertical connections
            // Must have at least one vertical per set
            let verticalMap = new Array(grid.cols).fill(false);
            
            // Shuffle indices to ensure randomness
            let indices = Array.from({length: grid.cols}, (_, i) => i).sort(()=>Math.random() - 0.5);
            
            // First pass: ensure at least one
            // (Simplified Eller's for visualizer: just random vertical)
             for(let i=0; i<grid.cols; i++) {
                 if(Math.random() > 0.5) {
                     grid.removeWall(grid.getCell(i, j), grid.getCell(i, j+1));
                     // Keep set ID for next row
                 } else {
                     // Wall blocks, next row gets 0
                     // But we must fix this in logic below for next row
                 }
             }
             // Correct Eller logic is complex for animation, using simplified row generation here
             // Re-implementing simplified row logic for visual flair:
             
             // True logic:
             // For next row, if vertical connection exists, copy set ID. If not, 0.
             let nextRowSet = new Array(grid.cols).fill(0);
             // Ensure at least one vertical per set
             let setsInRow = [...new Set(rowSet)];
             setsInRow.forEach(sid => {
                 let colsInSet = [];
                 rowSet.forEach((s, idx) => { if(s===sid) colsInSet.push(idx); });
                 
                 // Pick random amount of verticals (at least 1)
                 let count = Math.floor(Math.random() * colsInSet.length) + 1;
                 // Pick random columns to drop down
                 colsInSet.sort(() => Math.random() - 0.5);
                 for(let k=0; k<count; k++) {
                     let idx = colsInSet[k];
                     grid.removeWall(grid.getCell(idx, j), grid.getCell(idx, j+1));
                     nextRowSet[idx] = sid; // Propagate set
                 }
             });
             rowSet = nextRowSet;
        } else {
            // Last row: connect disjoint sets
             for(let i=0; i<grid.cols-1; i++) {
                 if(rowSet[i] !== rowSet[i+1]) {
                     grid.removeWall(grid.getCell(i, j), grid.getCell(i+1, j));
                     let oldSet = rowSet[i+1];
                     let newSet = rowSet[i];
                     for(let k=0; k<grid.cols; k++) {
                        if(rowSet[k] === oldSet) rowSet[k] = newSet;
                    }
                 }
             }
        }
        updateFn(grid.getCell(0,j));
    }
}

// 10. Wilson's (Simplified: Loop-Erased Random Walk)
// Note: True Wilson's picks unvisited, walks until hits visited. 
export async function algoWilson(grid, updateFn, checkPause) {
    let unvisited = grid.cells.slice();
    let visited = [];
    
    // Pick random start
    let start = unvisited.splice(Math.floor(Math.random() * unvisited.length), 1)[0];
    start.visited = true;
    visited.push(start);
    
    while(unvisited.length > 0) {
        await checkPause();
        // Pick random unvisited
        let u = unvisited[Math.floor(Math.random() * unvisited.length)];
        let path = [u];
        let walking = true;
        
        // Random walk until we hit 'visited'
        while(walking) {
            let curr = path[path.length-1];
            let neighbors = [
                grid.getCell(curr.i, curr.j-1), grid.getCell(curr.i+1, curr.j),
                grid.getCell(curr.i, curr.j+1), grid.getCell(curr.i-1, curr.j)
            ].filter(n => n !== null);
            
            let next = neighbors[Math.floor(Math.random() * neighbors.length)];
            
            // Loop erasure
            let index = path.indexOf(next);
            if (index !== -1) {
                path.splice(index + 1); // Cut loop
            } else {
                path.push(next);
                if (next.visited) walking = false;
            }
        }
        
        // Carve path
        for(let i=0; i<path.length-1; i++) {
            let a = path[i];
            let b = path[i+1];
            grid.removeWall(a, b);
            a.visited = true;
            if(unvisited.includes(a)) unvisited.splice(unvisited.indexOf(a), 1);
            visited.push(a);
            updateFn(a);
            await checkPause();
        }
    }
}