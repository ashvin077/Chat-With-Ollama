import eventlet

eventlet.monkey_patch()

from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import os
from werkzeug.utils import secure_filename
from extensions import db, socketio
from models import User, Message
from ai import stream_ai_reply, summarize_text, question_answer

load_dotenv()

app = Flask(__name__)

app.config['SECRET_KEY'] = os.getenv("SECRET_KEY")
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv("DATABASE_URL")
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)
socketio.init_app(app)

stop_generation = False
user_sessions = {}
current_session_history = {}


@app.route("/")
def index():
    return render_template("index.html")


def save_message(user_id, role, content):
    msg = Message(user_id=user_id, role=role, content=content)
    db.session.add(msg)
    db.session.commit()


def get_default_user():
    user = User.query.first()
    if not user:
        user = User(username="guest", email="guest@example.com")
        db.session.add(user)
        db.session.commit()
    return user


def get_session_history(user_id, new_topic=False):
    if new_topic or user_id not in user_sessions:
        user_sessions[user_id] = []
    return user_sessions[user_id]


@socketio.on("connect")
def handle_connect():
    print("🟢 User connected")


@socketio.on("disconnect")
def handle_disconnect():
    print("🔴 User disconnected")


@socketio.on("stop_generation")
def handle_stop():
    global stop_generation
    stop_generation = True
    print("🛑 Generation stopped by user")


@socketio.on("user_message")
def handle_user_message(data):
    global stop_generation
    stop_generation = False

    user_msg = data["message"]
    user = get_default_user()

    # Reset session for this user if last generation was stopped
    if user.id not in current_session_history:
        current_session_history[user.id] = []

    # Clear previous unfinished generation
    current_session_history[user.id] = []

    # Add current user message
    current_session_history[user.id].append({"role": "user", "content": user_msg})

    # Save user message to DB
    save_message(user.id, "user", user_msg)

    # Notify frontend
    socketio.emit("bot_thinking")

    full_reply = ""
    for chunk in stream_ai_reply(current_session_history[user.id]):
        if stop_generation:
            socketio.emit("bot_done")
            return

        full_reply += chunk
        socketio.emit("bot_chunk", {"chunk": chunk})

    # Save AI reply to DB
    save_message(user.id, "assistant", full_reply)

    # Add AI reply to in-memory session
    current_session_history[user.id].append({"role": "assistant", "content": full_reply})

    # Clear session completely after generation done
    current_session_history[user.id] = []

    socketio.emit("bot_done")


UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


@app.route("/upload_file", methods=["POST"])
def upload_file():
    file = request.files.get("file")
    feature = request.form.get("feature")
    if not file:
        return jsonify({"error": "No file uploaded"}), 400

    filename = secure_filename(file.filename)
    path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(path)

    # Extract text
    if filename.endswith(".txt"):
        with open(path, "r", encoding="utf-8") as f:
            text = f.read()
    elif filename.endswith(".pdf"):
        from PyPDF2 import PdfReader
        reader = PdfReader(path)
        text = "\n".join([p.extract_text() for p in reader.pages])
    else:
        return jsonify({"error": "Unsupported file type"}), 400

    if feature == "summarize":
        summary = summarize_text(text)
        return jsonify({"summary": summary})
    elif feature == "qa":
        return jsonify({"text": text})  # store text for Q&A


@app.route("/ask-question", methods=["POST"])
def ask_question():
    data = request.json
    answer = question_answer(
        data["text"],
        data["question"]
    )
    return jsonify({"answer": answer})


if __name__ == "__main__":
    socketio.run(app, host="127.0.0.1", port=5001, debug=True)
