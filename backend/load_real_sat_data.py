import os
import xarray as xr
import numpy as np

class IceDataReader:
    """Satellite sea-ice data reader accessing antarctic_ice.nc NetCDF datasets."""
    def __init__(self, nc_path=None):
        if nc_path is None:
            nc_path = os.path.join(os.path.dirname(__file__), "antarctic_ice.nc")
        self.nc_path = nc_path
        self.ds = None
        self._load_dataset()

    def _load_dataset(self):
        try:
            self.ds = xr.open_dataset(self.nc_path)
            print(f"Loaded NetCDF dataset: {self.nc_path}")
        except Exception as e:
            print(f"Notice: Could not load NetCDF file ({e}). Using fallback calculations.")
            self.ds = None

    def get_ice_concentration(self, lat, lon):
        """Extract sea ice concentration percentage (0-100%) for given lat/lon."""
        if self.ds is None:
            return None

        try:
            lat_key = 'latitude' if 'latitude' in self.ds.coords else 'lat'
            lon_key = 'longitude' if 'longitude' in self.ds.coords else 'lon'

            val = self.ds.sel({lat_key: lat, lon_key: lon}, method='nearest')
            var_name = list(self.ds.data_vars.keys())[0]
            ice_val = float(val[var_name].values)

            if np.isnan(ice_val):
                return 0.0
            
            return ice_val * 100.0 if ice_val <= 1.0 else ice_val
        except Exception:
            return None