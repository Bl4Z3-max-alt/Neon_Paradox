from flask import Flask, render_template, request, jsonify
import json, os

app = Flask(__name__)
DB_FILE = 'leaderboard.json'

def get_data():
    if not os.path.exists(DB_FILE):
        with open(DB_FILE, 'w') as f: json.dump([], f)
    with open(DB_FILE, 'r') as f:
        try: return json.load(f)
        except: return []

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/leaderboard', methods=['GET'])
def leaderboard():
    scores = sorted(get_data(), key=lambda x: x['score'], reverse=True)
    return jsonify(scores[:10])

@app.route('/api/score', methods=['POST'])
def save_score():
    data = request.json
    db = get_data()
    db.append({"name": data['name'][:10].upper(), "score": int(data['score'])})
    db = sorted(db, key=lambda x: x['score'], reverse=True)[:10]
    with open(DB_FILE, 'w') as f: json.dump(db, f)
    return jsonify({"status": "success"})

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)