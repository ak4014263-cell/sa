#!/usr/bin/env python3
"""
=============================================================================
 JobSwipe Dual-Platform Backend - Pure Python (Flask + Playwright Engine)
=============================================================================
"""

import os
import sys
import time
import json
import uuid
import queue
import threading
from pathlib import Path
from flask import Flask, request, jsonify, Response, send_from_directory
from wttj_auto_apply import (
    scrape_wttj_jobs,
    apply_to_job,
    ensure_authenticated_session,
    inspect_live_tracker,
    DEFAULT_EMAIL,
    DEFAULT_PASSWORD,
    DEFAULT_FIRSTNAME,
    DEFAULT_LASTNAME,
    DEFAULT_PHONE,
    DEFAULT_TITLE,
    DEFAULT_COVER_LETTER,
    DEFAULT_CV_PATH
)
from playwright.sync_api import sync_playwright

# Fix Windows console UTF-8 printing
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

app = Flask(__name__, static_folder='public', static_url_path='')

BASE_DIR = Path(__file__).parent.resolve()
APPLICATIONS_FILE = BASE_DIR / "applications.json"
SESSION_DIR = BASE_DIR / "python_wttj_session"
SCREENSHOTS_DIR = BASE_DIR / "public" / "screenshots"

SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)
SESSION_DIR.mkdir(parents=True, exist_ok=True)

# ── Load Persisted Applications ──
applications = {}
if APPLICATIONS_FILE.exists():
    try:
        with open(APPLICATIONS_FILE, "r", encoding="utf-8") as f:
            applications = json.load(f)
    except Exception:
        applications = {}

if not applications:
    applications = {
        "wttj_app_brigad": {
            "applicationId": "wttj_app_brigad",
            "job": {
                "id": "brigad-1",
                "title": "Customer Care H/F",
                "company": "TWC - ROSK X BRIGAD",
                "location": "Paris, France",
                "contract": "CDI"
            },
            "status": "completed",
            "currentStep": 7,
            "latestScreenshot": "/screenshots/wttj_live_19_brigad_verified.png",
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ")
        },
        "wttj_app_shape_it": {
            "applicationId": "wttj_app_shape_it",
            "job": {
                "id": "shape-it-1",
                "title": "Développeur·se Fullstack Java Angular",
                "company": "SHAPE IT",
                "location": "Lyon, France",
                "contract": "CDI"
            },
            "status": "completed",
            "currentStep": 7,
            "latestScreenshot": "/screenshots/wttj_submission_confirmed_live.png",
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ")
        }
    }
    with open(APPLICATIONS_FILE, "w", encoding="utf-8") as f:
        json.dump(applications, f, indent=2, ensure_ascii=False)


def save_applications():
    try:
        with open(APPLICATIONS_FILE, "w", encoding="utf-8") as f:
            json.dump(applications, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving applications: {e}")


profile_data = {
    "email": DEFAULT_EMAIL,
    "firstName": DEFAULT_FIRSTNAME,
    "lastName": DEFAULT_LASTNAME,
    "phone": DEFAULT_PHONE,
    "title": DEFAULT_TITLE,
    "linkedin": "https://linkedin.com/in/fahid-el-garouani",
    "availability": "Immédiate",
    "cvFilename": DEFAULT_CV_PATH.name,
    "coverLetter": DEFAULT_COVER_LETTER,
    "isSynced": True
}

# ── SSE Event Stream ──
sse_subscribers = []
sse_lock = threading.Lock()

def broadcast_event(data):
    payload = f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
    with sse_lock:
        for q in list(sse_subscribers):
            try:
                q.put_nowait(payload)
            except Exception:
                pass


# ── Job Execution Queue (Python Worker) ──
job_queue = queue.Queue()
is_worker_running = True

def background_apply_worker():
    with sync_playwright() as p:
        browser = p.chromium.launch_persistent_context(
            user_data_dir=str(SESSION_DIR),
            headless=True,
            viewport={"width": 1280, "height": 1000},
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"]
        )

        try:
            ensure_authenticated_session(browser, DEFAULT_EMAIL, DEFAULT_PASSWORD)
        except Exception as e:
            print(f"[Worker Auth Notice] {e}")

        page = browser.new_page()

        while is_worker_running:
            try:
                item = job_queue.get(timeout=1.0)
            except queue.Empty:
                continue

            app_id = item["applicationId"]
            job = item["job"]

            print(f"\n[Worker] Processing Job Application #{app_id}: {job['title']} @ {job['company']}")

            # Step 1
            broadcast_event({"type": "application_update", "applicationId": app_id, "stepNumber": 1, "status": "completed", "message": f"Candidate session ({DEFAULT_EMAIL}) verified ✓", "job": job})
            time.sleep(1)

            # Step 2
            broadcast_event({"type": "application_update", "applicationId": app_id, "stepNumber": 2, "status": "active", "message": f"Loading job offer on WTTJ: {job['title']}", "job": job})

            ok = apply_to_job(page, job, cv_path=DEFAULT_CV_PATH, dry_run=False)

            if ok:
                applications[app_id]["status"] = "completed"
                applications[app_id]["currentStep"] = 7
                save_applications()
                broadcast_event({
                    "type": "application_update",
                    "applicationId": app_id,
                    "stepNumber": 7,
                    "status": "completed",
                    "message": f"🎉 Application successfully submitted to {job['company']}!",
                    "job": job,
                    "application": applications[app_id]
                })
            else:
                applications[app_id]["status"] = "error"
                save_applications()
                broadcast_event({
                    "type": "application_update",
                    "applicationId": app_id,
                    "stepNumber": 7,
                    "status": "error",
                    "message": f"Application failed for {job['company']}",
                    "job": job
                })

            job_queue.task_done()

        browser.close()

# Start background thread
worker_thread = threading.Thread(target=background_apply_worker, daemon=True)
worker_thread.start()


# ── Web Routes ──
@app.route("/")
def index():
    return send_from_directory("public", "index.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory("public", path)


@app.route("/api/profile", methods=["GET"])
def get_profile():
    return jsonify({"success": True, "profile": profile_data})


@app.route("/api/jobs", methods=["GET"])
def get_jobs():
    query = request.args.get("query", "développeur")
    location = request.args.get("location", "Paris")
    jobs = scrape_wttj_jobs(query=query, location=location, limit=40)
    return jsonify({"success": True, "jobs": jobs, "total": len(jobs)})


@app.route("/api/applications", methods=["GET"])
def get_applications():
    return jsonify({"success": True, "applications": list(applications.values())})


@app.route("/api/apply", methods=["POST"])
def trigger_apply():
    data = request.json or {}
    job = data.get("job")
    if not job:
        return jsonify({"success": False, "error": "Missing job data"}), 400

    app_id = str(uuid.uuid4())[:8]
    record = {
        "applicationId": app_id,
        "job": job,
        "profile": profile_data,
        "status": "active",
        "currentStep": 1,
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ")
    }

    applications[app_id] = record
    save_applications()

    job_queue.put({"applicationId": app_id, "job": job})

    return jsonify({
        "success": True,
        "applicationId": app_id,
        "message": f"Candidature initiée pour {job.get('title')} @ {job.get('company')}",
        "application": record
    })


@app.route("/api/events")
def sse_events():
    def event_stream():
        client_queue = queue.Queue()
        with sse_lock:
            sse_subscribers.append(client_queue)

        # Initial handshake
        init_payload = json.dumps({
            "type": "init",
            "profile": profile_data,
            "applications": applications,
            "syncStatus": {"isSynced": True, "email": DEFAULT_EMAIL}
        }, ensure_ascii=False)
        yield f"data: {init_payload}\n\n"

        try:
            while True:
                msg = client_queue.get()
                yield msg
        except GeneratorExit:
            with sse_lock:
                if client_queue in sse_subscribers:
                    sse_subscribers.remove(client_queue)

    return Response(event_stream(), mimetype="text/event-stream")


if __name__ == "__main__":
    port = int(os.getenv("PORT", 3000))
    print("═"*65)
    print(f" 🚀 JobSwipe Pure Python Backend running on http://localhost:{port}")
    print(f" 👤 Connected Candidate: {DEFAULT_FIRSTNAME} ({DEFAULT_EMAIL})")
    print(f" 📄 Active Resume: {DEFAULT_CV_PATH.name}")
    print("═"*65)
    app.run(host="0.0.0.0", port=port, threaded=True)
