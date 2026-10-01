import os
import csv
import io
import math
import heapq
import traceback
from flask import Flask, request, jsonify, Response, send_from_directory
from flask_cors import CORS
import h3

from load_real_sat_data import IceDataReader

STATIC_FOLDER = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist'))

app = Flask(__name__, static_folder=STATIC_FOLDER if os.path.exists(STATIC_FOLDER) else None)
CORS(app)

ice_reader = IceDataReader()

def latlng_to_h3_cell(lat, lng, res):
    if hasattr(h3, 'latlng_to_cell'):
        return h3.latlng_to_cell(lat, lng, res)
    return h3.geo_to_h3(lat, lng, res)

def h3_cell_to_latlng(cell):
    if hasattr(h3, 'cell_to_latlng'):
        return h3.cell_to_latlng(cell)
    return h3.h3_to_geo(cell)

def h3_cell_to_boundary(cell):
    if hasattr(h3, 'cell_to_boundary'):
        return h3.cell_to_boundary(cell)
    return h3.h3_to_geo_boundary(cell)

def haversine_nm(lat1, lon1, lat2, lon2):
    R = 3440.065
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2)**2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def get_bounding_cells(start_coords, goal_coords, res=4):
    start_hex = latlng_to_h3_cell(start_coords[0], start_coords[1], res)
    goal_hex = latlng_to_h3_cell(goal_coords[0], goal_coords[1], res)

    min_lat = min(start_coords[0], goal_coords[0]) - 2.5
    max_lat = max(start_coords[0], goal_coords[0]) + 2.5
    min_lon = min(start_coords[1], goal_coords[1]) - 3.5
    max_lon = max(start_coords[1], goal_coords[1]) + 3.5

    grid_cells = set()
    lat = min_lat
    while lat <= max_lat:
        lon = min_lon
        while lon <= max_lon:
            grid_cells.add(latlng_to_h3_cell(lat, lon, res))
            lon += 0.5
        lat += 0.3

    try:
        grid_cells.update(h3.grid_disk(start_hex, 10))
        grid_cells.update(h3.grid_disk(goal_hex, 10))
    except Exception:
        grid_cells.update(h3.k_ring(start_hex, 10))
        grid_cells.update(h3.k_ring(goal_hex, 10))

    return grid_cells, start_hex, goal_hex

def run_astar(start_hex, goal_hex, grid_cells, iceberg_hexes, vessel_ice_class, ice_severity, mode="fastest"):
    frontier = []
    heapq.heappush(frontier, (0, start_hex))
    came_from = {start_hex: None}
    cost_so_far = {start_hex: 0.0}

    while frontier:
        _, current = heapq.heappop(frontier)
        if current == goal_hex:
            break

        try:
            neighbors = h3.grid_ring(current, 1)
        except Exception:
            neighbors = h3.k_ring(current, 1) if hasattr(h3, 'k_ring') else []

        cur_lat, cur_lon = h3_cell_to_latlng(current)

        for next_hex in neighbors:
            if next_hex not in grid_cells:
                continue

            next_lat, next_lon = h3_cell_to_latlng(next_hex)
            segment_dist_nm = haversine_nm(cur_lat, cur_lon, next_lat, next_lon)
            
            real_sic = ice_reader.get_ice_concentration(next_lat, next_lon)
            raw_sic = (abs(hash(next_hex)) % 85) if real_sic is None else real_sic
            sic = min(100.0, raw_sic * ice_severity)
            
            hazard_penalty = 10000.0 if next_hex in iceberg_hexes else 0.0

            # Dynamic weight profile scaling
            if mode == "fastest":
                ice_weight = (sic / 10.0) ** 1.5 * vessel_ice_class
            elif mode == "eco":
                ice_weight = (sic / 10.0) ** 3.0 * (vessel_ice_class ** 2)
            else:  # safest
                ice_weight = (sic / 10.0) ** 4.5 * 10.0

            step_cost = segment_dist_nm * (1.0 + ice_weight) + hazard_penalty
            new_cost = cost_so_far[current] + step_cost

            if next_hex not in cost_so_far or new_cost < cost_so_far[next_hex]:
                cost_so_far[next_hex] = new_cost
                goal_lat, goal_lon = h3_cell_to_latlng(goal_hex)
                heuristic = haversine_nm(next_lat, next_lon, goal_lat, goal_lon)
                heapq.heappush(frontier, (new_cost + heuristic, next_hex))
                came_from[next_hex] = current

    hex_path = []
    curr = goal_hex
    if curr in came_from:
        while curr is not None:
            hex_path.append(curr)
            curr = came_from.get(curr)
        hex_path.reverse()
    else:
        hex_path = [start_hex, goal_hex]

    latlng_path = [list(h3_cell_to_latlng(cell)) for cell in hex_path]

    total_dist_nm, total_hours, total_fuel = 0.0, 0.0, 0.0
    base_speed = 14.0
    for i in range(len(latlng_path) - 1):
        p1, p2 = latlng_path[i], latlng_path[i+1]
        seg_dist = haversine_nm(p1[0], p1[1], p2[0], p2[1])
        total_dist_nm += seg_dist
        t_lat, t_lon = h3_cell_to_latlng(hex_path[min(i+1, len(hex_path)-1)])
        
        real_sic = ice_reader.get_ice_concentration(t_lat, t_lon)
        raw_sic = (abs(hash(hex_path[i])) % 85) if real_sic is None else real_sic
        sic = min(100.0, raw_sic * ice_severity)
        
        speed = max(1.5, base_speed * (1.0 - (sic / 100.0) * (vessel_ice_class * 0.5)))
        hours = seg_dist / speed
        total_hours += hours
        total_fuel += hours * (1.2 * (1.0 + (sic / 100.0) * vessel_ice_class))

    return {
        "path": latlng_path,
        "distance_nm": round(total_dist_nm, 1),
        "est_hours": round(total_hours, 1),
        "fuel_tons": round(total_fuel, 1)
    }

@app.route('/calculate-h3-route', methods=['POST'])
@app.route('/api/route/calculate', methods=['POST'])
def calculate_route():
    try:
        data = request.get_json() or {}
        vessel_ice_class = float(data.get('vessel_ice_class', 1.0))
        ice_severity = float(data.get('ice_severity', 1.0))
        icebergs = data.get('icebergs', [])
        start_coords = data.get('start_coords') or [-64.77, -64.05]
        goal_coords = data.get('goal_coords') or [-62.22, -58.78]

        iceberg_hexes = set()
        for berg in icebergs:
            b_hex = latlng_to_h3_cell(berg[0], berg[1], 4)
            iceberg_hexes.add(b_hex)
            try:
                iceberg_hexes.update(h3.grid_disk(b_hex, 1))
            except Exception:
                iceberg_hexes.update(h3.k_ring(b_hex, 1))

        grid_cells, start_hex, goal_hex = get_bounding_cells(start_coords, goal_coords)

        routes = {
            "fastest": run_astar(start_hex, goal_hex, grid_cells, iceberg_hexes, vessel_ice_class, ice_severity, "fastest"),
            "eco": run_astar(start_hex, goal_hex, grid_cells, iceberg_hexes, vessel_ice_class, ice_severity, "eco"),
            "safest": run_astar(start_hex, goal_hex, grid_cells, iceberg_hexes, vessel_ice_class, ice_severity, "safest")
        }

        grid_polygons = []
        for cell in grid_cells:
            boundary = [list(pt) for pt in h3_cell_to_boundary(cell)]
            c_lat, c_lon = h3_cell_to_latlng(cell)
            real_sic = ice_reader.get_ice_concentration(c_lat, c_lon)
            raw_sic = (abs(hash(cell)) % 85) if real_sic is None else real_sic
            sic = min(100.0, raw_sic * ice_severity)

            grid_polygons.append({
                "hex_id": str(cell),
                "lat": round(c_lat, 4),
                "lng": round(c_lon, 4),
                "boundary": boundary,
                "ice_density": round(sic, 1),
                "fuel_burn_rate": round(1.2 * (1.0 + (sic / 100.0) * vessel_ice_class), 2),
                "is_hazard": cell in iceberg_hexes
            })

        return jsonify({
            "status": "success",
            "routes": routes,
            "grid_polygons": grid_polygons
        })
    except Exception as e:
        print("Error encountered:", traceback.format_exc())
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/voyage/export-csv', methods=['POST'])
def export_voyage_csv():
    try:
        data = request.get_json() or {}
        output = io.StringIO()
        writer = csv.writer(output)
        
        writer.writerow(["=== ANTARCTIC NAVIGATION VOYAGE LOG ==="])
        writer.writerow(["Timestamp", data.get("timestamp")])
        writer.writerow(["Origin", data.get("origin")])
        writer.writerow(["Destination", data.get("destination")])
        writer.writerow(["Profile Mode", data.get("profile")])
        writer.writerow(["Ice Severity Factor", data.get("ice_severity")])
        writer.writerow(["Total Distance (NM)", data.get("distance_nm")])
        writer.writerow(["Est. Transit Time (Hrs)", data.get("est_hours")])
        writer.writerow(["Est. Fuel Consumed (Tons)", data.get("fuel_tons")])
        writer.writerow([])
        
        writer.writerow(["Waypoint Step", "Latitude", "Longitude"])
        path = data.get("path", [])
        for step, coords in enumerate(path, start=1):
            writer.writerow([step, coords[0], coords[1]])
            
        output.seek(0)
        return Response(
            output.getvalue(),
            mimetype="text/csv",
            headers={"Content-Disposition": "attachment;filename=voyage_log.csv"}
        )
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    if path and os.path.exists(os.path.join(STATIC_FOLDER, path)):
        return send_from_directory(STATIC_FOLDER, path)
    if os.path.exists(os.path.join(STATIC_FOLDER, 'index.html')):
        return send_from_directory(STATIC_FOLDER, 'index.html')
    return jsonify({
        "status": "online",
        "service": "Antarctic Route Planner API",
        "endpoints": ["/calculate-h3-route", "/api/voyage/export-csv"]
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    debug = os.environ.get('FLASK_DEBUG', 'False').lower() in ('true', '1')
    app.run(host='0.0.0.0', port=port, debug=debug)