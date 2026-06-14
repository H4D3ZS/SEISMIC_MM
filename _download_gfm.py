import sys
try:
    from huggingface_hub import snapshot_download
    snapshot_download('thinkonward/geophysical-foundation-model', local_dir=r'C:/Users/HADES/Desktop/seismologicalgraph/gfm-weights')
    print("Download OK")
except Exception as e:
    print(f"Download failed: {e}", file=sys.stderr)
    sys.exit(1)