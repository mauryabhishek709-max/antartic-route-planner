# backend/h3_loader.py
import h3

def latlon_to_h3(lat: float, lon: float, resolution: int = 4) -> str:
    """Converts standard Lat/Lng coordinates to an H3 Hexagon Index string."""
    return h3.latlng_to_cell(lat, lon, resolution)

def get_h3_neighbors(h3_index: str):
    """Returns adjacent hexagon cells with identical edge-to-edge distances."""
    return h3.grid_ring(h3_index, 1)

def get_h3_distance(h3_start: str, h3_goal: str) -> int:
    """Calculates hex-grid step distance without spatial polar distortion."""
    return h3.grid_distance(h3_start, h3_goal)

if __name__ == "__main__":
    # Test coordinate near Antarctic Peninsula
    test_hex = latlon_to_h3(-64.8, -63.5, resolution=4)
    print("Sample Antarctic H3 Hex Index:", test_hex)
    print("Adjacent Hex Neighbors:", list(get_h3_neighbors(test_hex))[:3])