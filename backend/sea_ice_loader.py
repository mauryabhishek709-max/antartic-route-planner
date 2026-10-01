# backend/sea_ice_loader.py
import numpy as np

def generate_mock_nsidc_raster(grid_size=50):
    """
    Simulates a NetCDF raster matrix for Antarctic Sea Ice Concentration (0 to 100%).
    In production, this reads directly from an NSIDC .nc file using xarray:
    ds = xr.open_dataset('antarctic_seaice_2026.nc')
    """
    np.random.seed(42)  # Consistent environmental baseline
    base_ice = np.random.randint(0, 30, size=(grid_size, grid_size))
    
    # Simulate a dense ice shelf corridor across middle latitudes
    base_ice[15:25, 10:40] += 60
    
    # Clip values between 0% (open water) and 100% (pack ice)
    return np.clip(base_ice, 0, 100)

if __name__ == "__main__":
    ice_matrix = generate_mock_nsidc_raster()
    print("NSIDC Sea Ice Raster Loaded (50x50 Matrix Sample):")
    print(ice_matrix[:5, :5])