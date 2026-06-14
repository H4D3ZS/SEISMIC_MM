import urllib.request
import sys

url = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/7/59/107"
headers = {"User-Agent": "Mozilla/5.0"}

try:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=10) as response:
        print(f"HTTP Status: {response.status}")
        data = response.read()
        print(f"Read {len(data)} bytes successfully.")
except Exception as e:
    print(f"Error fetching tile: {e}")
    sys.exit(1)
sys.exit(0)
