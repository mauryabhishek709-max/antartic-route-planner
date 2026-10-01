# backend/engine.py
import json
import heapq

def generate_grid(rows=50, cols=50):
    """
    Generates a 2D matrix representing sea ice concentration (0% to 100%).
    """
    grid = []
    for r in range(rows):
        row = []
        for c in range(cols):
            # Synthetic pattern: ice density increases further south/east
            ice_density = min(100, int((r * 1.2 + c * 0.8) % 90))
            row.append({"r": r, "c": c, "ice": ice_density})
        grid.append(row)
    return grid

def astar(grid, start, goal, icebergs, buffer_radius=1):
    """
    Runs A* pathfinding considering sea-ice friction and iceberg collision buffers.
    """
    rows, cols = len(grid), len(grid[0])
    
    # Define danger/buffer zones around icebergs (Cost = Infinity)
    danger_zones = set()
    for ib in icebergs:
        ir, ic = ib['r'], ib['c']
        for dr in range(-buffer_radius, buffer_radius + 1):
            for dc in range(-buffer_radius, buffer_radius + 1):
                br, bc = ir + dr, ic + dc
                if 0 <= br < rows and 0 <= bc < cols:
                    danger_zones.add((br, bc))

    open_set = []
    start_tuple = tuple(start)
    goal_tuple = tuple(goal)
    
    heapq.heappush(open_set, (0, start_tuple))
    came_from = {}
    g_score = {start_tuple: 0}

    def heuristic(p1, p2):
        return abs(p1[0] - p2[0]) + abs(p1[1] - p2[1])

    while open_set:
        _, current = heapq.heappop(open_set)

        if current == goal_tuple:
            path = []
            while current in came_from:
                path.append(current)
                current = came_from[current]
            path.append(start_tuple)
            return path[::-1]

        r, c = current
        neighbors = [(r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)]

        for nr, nc in neighbors:
            if 0 <= nr < rows and 0 <= nc < cols:
                if (nr, nc) in danger_zones:
                    continue
                
                ice_penalty = grid[nr][nc]["ice"] / 10.0
                step_cost = 1.0 + ice_penalty
                tentative_g = g_score[current] + step_cost

                neighbor = (nr, nc)
                if neighbor not in g_score or tentative_g < g_score[neighbor]:
                    came_from[neighbor] = current
                    g_score[neighbor] = tentative_g
                    f_score = tentative_g + heuristic(neighbor, goal_tuple)
                    heapq.heappush(open_set, (f_score, neighbor))

    return []

if __name__ == "__main__":
    grid = generate_grid(50, 50)
    
    sample_icebergs = [
        {"r": 10, "c": 12},
        {"r": 25, "c": 25},
        {"r": 30, "c": 31}
    ]
    
    start_point = [0, 0]
    goal_point = [49, 49]

    path = astar(grid, start_point, goal_point, sample_icebergs)
    
    output = {
        "status": "success" if path else "failed",
        "path": path,
        "path_length": len(path)
    }
    print(json.dumps(output))