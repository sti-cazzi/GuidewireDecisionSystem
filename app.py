from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from simulator import generate_data
from engine import analyze_events
import os

app = Flask(__name__, static_folder='static')
CORS(app)

@app.route('/')
def serve_index():
    return app.send_static_file('index.html')

@app.route('/api/intelligence')
def get_intelligence():
    events = generate_data()
    analysis_result = analyze_events(events)
    return jsonify(analysis_result)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=True)

