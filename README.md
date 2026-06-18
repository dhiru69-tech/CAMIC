# FaceShape — Professional Local Tester

This repository provides a polished local-first FaceShape testing app. It runs a Flask backend (local-only) and a modern frontend that performs client-side face detection and symmetry scoring using face-api.js.

Key points:
- Runs on localhost by default. Use `--local-only` to bind to 127.0.0.1.
- Client-side detection: models (tiny face detector + 68-landmark) run in the browser. Place model weights in `static/models/` for offline use.
- UI: polished Bootstrap-based interface. Clean consent flow and results presentation.
- Data handling: by default only aggregated metrics (symmetry score, face shape label, timestamp, minimal device info) are sent to the server when you click "Save Results". No raw images or audio are saved unless you explicitly modify the code to do so.
- Server logs: each saved result prints a concise log line to the terminal so you can monitor activity.

Quick start:

1. Clone and create venv

```bash
git clone https://github.com/dhiru69-tech/CAMIC
cd CAMIC
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

2. (Optional) Download models locally for offline operation

```bash
# If you have git and internet:
# git clone https://github.com/justadudewhohacks/face-api.js temp_models
# mkdir -p static/models && cp -r temp_models/weights/* static/models/ && rm -rf temp_models
```

3. Run the server

```bash
python3 app.py --local-only --port 5000 --results-dir wl_results
```

4. Open http://127.0.0.1:5000 in a modern browser (Chrome, Edge, Firefox). Click Start (consent) and allow camera & mic when prompted. Click Capture & Analyze then Save Results to write metrics to the local server.

Privacy & safety
- Explicit consent: the browser will show permission prompts. These cannot/should not be bypassed. Always test on devices you own or have permission to use.
- Local-only by default: do not publish this server publicly.
- Saved metrics are local JSON files under `wl_results/` and a summary line is printed to the terminal when a result is saved.

If you want additional features (improved scoring with alignment, charts, packaging into an executable, or stricter retention policies), tell me which feature to add next.
