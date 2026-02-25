export class Cell {
    constructor(i, j) {
        this.i = i;
        this.j = j;
        // Top, Right, Bottom, Left
        this.walls = [true, true, true, true];
        this.visited = false;
        this.isCustomPath = false; 
    }
}

export class Grid {
    constructor(cols, rows) {
        this.cols = cols;
        this.rows = rows;
        this.cells = [];
        this.reset();
    }

    reset() {
        this.cells = [];
        for (let j = 0; j < this.rows; j++) {
            for (let i = 0; i < this.cols; i++) {
                this.cells.push(new Cell(i, j));
            }
        }
    }

    index(i, j) {
        if (i < 0 || j < 0 || i > this.cols - 1 || j > this.rows - 1) return -1;
        return i + j * this.cols;
    }

    getCell(i, j) {
        let idx = this.index(i, j);
        return idx === -1 ? null : this.cells[idx];
    }

    removeWall(a, b) {
        let x = a.i - b.i;
        let y = a.j - b.j;
        if (x === 1) { a.walls[3] = false; b.walls[1] = false; }
        else if (x === -1) { a.walls[1] = false; b.walls[3] = false; }
        if (y === 1) { a.walls[0] = false; b.walls[2] = false; }
        else if (y === -1) { a.walls[2] = false; b.walls[0] = false; }
    }

    getUnvisitedNeighbors(cell) {
        let neighbors = [];
        let top = this.getCell(cell.i, cell.j - 1);
        let right = this.getCell(cell.i + 1, cell.j);
        let bottom = this.getCell(cell.i, cell.j + 1);
        let left = this.getCell(cell.i - 1, cell.j);

        if (top && !top.visited) neighbors.push(top);
        if (right && !right.visited) neighbors.push(right);
        if (bottom && !bottom.visited) neighbors.push(bottom);
        if (left && !left.visited) neighbors.push(left);
        return neighbors;
    }
}