"""Pure grid geometry functions shared across all solver modules."""

DIRS = [(-1, 0), (1, 0), (0, -1), (0, 1)]


def neighbours(r: int, c: int, rows: int, cols: int) -> list[tuple[int, int]]:
    """Return the list of in-bounds orthogonal neighbours of (r, c)."""
    return [(r + dr, c + dc) for dr, dc in DIRS
            if 0 <= r + dr < rows and 0 <= c + dc < cols]


def compute_perimeter(cells: set, rows: int, cols: int) -> int:
    """Count exposed edges (toward different cells or grid boundary) for a set of cells."""
    p = 0
    for (r, c) in cells:
        for (nr, nc) in neighbours(r, c, rows, cols):
            if (nr, nc) not in cells:
                p += 1
        p += 4 - len(neighbours(r, c, rows, cols))
    return p


def is_connected(cells: set, rows: int, cols: int) -> bool:
    """Return True if all cells in the set are orthogonally connected."""
    if not cells:
        return True
    start = next(iter(cells))
    visited = {start}
    queue = [start]
    while queue:
        r, c = queue.pop()
        for nb in neighbours(r, c, rows, cols):
            if nb in cells and nb not in visited:
                visited.add(nb)
                queue.append(nb)
    return visited == cells


def count_2x2_blocks(grid: list, rows: int, cols: int) -> int:
    """Count same-region 2×2 blocks across the entire grid."""
    count = 0
    for r in range(rows - 1):
        for c in range(cols - 1):
            v = grid[r][c]
            if v >= 0 and v == grid[r][c + 1] and v == grid[r + 1][c] and v == grid[r + 1][c + 1]:
                count += 1
    return count


def compute_region_stats(grid: list, rows: int, cols: int) -> dict:
    """Return {region_id: {'cells': int, 'perim': int}} for all regions in grid."""
    ids = sorted({v for row in grid for v in row if v >= 0})
    stats = {i: {'cells': 0, 'perim': 0} for i in ids}
    for r in range(rows):
        for c in range(cols):
            v = grid[r][c]
            if v < 0:
                continue
            stats[v]['cells'] += 1
            for (nr, nc) in neighbours(r, c, rows, cols):
                if grid[nr][nc] != v:
                    stats[v]['perim'] += 1
            stats[v]['perim'] += 4 - len(neighbours(r, c, rows, cols))
    return stats
