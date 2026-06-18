# FaceShape Local Tester

This repository contains a local-first FaceShape tester: a small Flask backend and a static frontend that requests camera & microphone permissions, runs face landmark detection in the browser (face-api.js), computes a symmetry score and a simple face-shape heuristic, and optionally saves metrics to a local results directory.

Important:
- This project is intended for local testing on your own devices only. Do NOT use it to collect biometric data from others without explicit, informed consent.
- For fully offline usage, download face-api.js model weights into static/models/ (see instructions below).

Quick start:
1. Clone the repo and create a venv:
   python3 -m venv .venv && source .venv/bin/activate
2. Install dependencies:
   pip install -r requirements.txt
3. (Optional but recommended) Download face-api.js model weights into static/models/ so the frontend can load models locally. Example:
   git clone https://github.com/justadudewhohacks/face-api.js temp_models && mkdir -p static/models && cp -r temp_models/weights/* static/models/ && rm -rf temp_models
4. Run the server:
   python3 app.py --local-only --port 5000 --results-dir wl_results
5. Open http://127.0.0.1:5000 in your browser, click Consent, allow camera & mic, then Capture & Analyze.

Files added:
- app.py — Flask backend, /save_results endpoint, /dashboard (local key: localkey)
- static/ — frontend files (index.html, app.js, styles.css)
- templates/dashboard.html — simple dashboard to view saved JSON
- requirements.txt

Privacy notes:
- Face detection and landmark extraction run entirely in the browser. Images do not leave your machine unless you explicitly click "Save Results" which only posts computed metrics (not full-resolution photos) to the local server.
- Do not publish this server publicly.

