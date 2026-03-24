import urllib.request
import json
import traceback
import sys

def fetch_data(url):
    print(f"\n=================\nFetching {url}")
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            print(json.dumps(data, indent=2))
    except Exception as e:
        print(f"Error: {e}")
        if hasattr(e, 'read'):
            print(e.read().decode())

hospital_id = 9 # Let's assume some ID, wait I need to find the correct ID
fetch_data('http://localhost:8080/api/hospital/all')
