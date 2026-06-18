from flask import Flask, send_from_directory, request, jsonify, render_template
import argparse
import os
import json
import datetime
from pathlib import Path

app = Flask(__name__, static_folder='static', template_folder='templates')
DEFAULT_KEY = "localkey"

def ensure_results_dir(path):
    Path(path).mkdir(parents=True, exist_ok=True)

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/dashboard')
def dashboard():
    key = request.args.get('key', '')
    if key != DEFAULT_KEY:
        return "Unauthorized - provide ?key=" + DEFAULT_KEY, 403
    results = []
    results_dir = Path(app.config.get('RESULTS_DIR', 'wl_results'))
    if results_dir.exists():
        for p in sorted(results_dir.glob('*.json'), reverse=True):
            with open(p, 'r') as f:
                try:
                    results.append(json.load(f))
                except:
                    pass
    return render_template('dashboard.html', results=results)

@app.route('/save_results', methods=['POST'])
def save_results():
    data = request.get_json()
    if not data or 'session_id' not in data:
        return jsonify({'status': 'error', 'message': 'missing session_id'}), 400
    results_dir = Path(app.config.get('RESULTS_DIR', 'wl_results'))
    ensure_results_dir(results_dir)
    ts = datetime.datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')
    fname = results_dir / f"{data['session_id']}_{ts}.json"
    with open(fname, 'w') as f:
        json.dump(data, f, indent=2)
    return jsonify({'status': 'ok', 'path': str(fname)}), 200

@app.route('/static/<path:path>')
def static_proxy(path):
    return send_from_directory('static', path)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Local face-shape tester')
    parser.add_argument('--port', type=int, default=5000)
    parser.add_argument('--local-only', action='store_true', default=True,
                        help='Bind to 127.0.0.1 only (recommended for local testing)')
    parser.add_argument('--key', type=str, default=DEFAULT_KEY, help='Dashboard key')
    parser.add_argument('--results-dir', type=str, default='wl_results', help='Where to save results')
    args = parser.parse_args()

    bind = '127.0.0.1' if args.local_only else '0.0.0.0'
    app.config['RESULTS_DIR'] = args.results_dir
    ensure_results_dir(app.config['RESULTS_DIR'])
    print(f"Starting server on http://{bind}:{args.port}  (results -> {app.config['RESULTS_DIR']})")
    app.run(host=bind, port=args.port, debug=True)
