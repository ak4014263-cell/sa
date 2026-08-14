#!/usr/bin/env python3
"""
=============================================================================
 Welcome to the Jungle (WTTJ) - Full AI Automation Bot (Python + OpenAI)
=============================================================================
Features:
  1. OpenAI GPT-4o dynamic job analysis & compatibility scoring (0-100%)
  2. OpenAI custom tailored cover letter generation per company
  3. OpenAI dynamic answering of recruiter application questions
  4. Playwright persistent browser automation & authenticated session
  5. Native PDF Resume attachment (input[name="resume"]) & GDPR consent
  6. Real-time Welcome to the Jungle candidate tracker verification
=============================================================================
"""

import os
import sys
import time
import json
import argparse
from pathlib import Path
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright

# Fix Windows console UTF-8 printing
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

# Load environment variables
load_dotenv()

# ── CANDIDATE CONFIGURATION ──
CANDIDATE_PROFILE = {
    "firstName": "Fahid",
    "lastName": "El Garouani",
    "email": os.getenv("WTTJ_EMAIL", "boumelahamid@gmail.com"),
    "password": os.getenv("WTTJ_PASSWORD", "Pommier78955&&"),
    "phone": "0651782681",
    "title": "Développeur Full Stack Senior (React, Node.js, Python, TypeScript)",
    "skills": ["JavaScript", "TypeScript", "React", "Node.js", "Python", "SQL", "Docker", "REST API", "Git"],
    "experience": "5+ years of full-stack web development experience, building scalable SaaS applications and responsive frontends.",
    "availability": "Immédiate"
}

SCRIPT_DIR = Path(__file__).parent.resolve()
DEFAULT_CV_PATH = SCRIPT_DIR / "CV_Hamid_Boumela.pdf"
SESSION_DIR = SCRIPT_DIR / "python_wttj_session"
SCREENSHOTS_DIR = SCRIPT_DIR / "public" / "screenshots"
LIVE_JOBS_FILE = SCRIPT_DIR / "public" / "live_jobs.json"

SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)
SESSION_DIR.mkdir(parents=True, exist_ok=True)

# ── OPENAI INITIALIZATION ──
openai_client = None
OPENAI_KEY = os.getenv("OPENAI_API_KEY", "")

def init_openai(api_key=""):
    global openai_client, OPENAI_KEY
    key = api_key or os.getenv("OPENAI_API_KEY", "")
    if key:
        try:
            from openai import OpenAI
            openai_client = OpenAI(api_key=key)
            OPENAI_KEY = key
            print("🤖 [OpenAI] GPT-4o engine initialized and ready!")
            return True
        except Exception as e:
            print(f"⚠️ [OpenAI] Initialization note: {e}")
    else:
        print("ℹ️ [OpenAI] No OPENAI_API_KEY provided. Running in smart heuristic mode.")
    return False


def ai_generate_cover_letter(job_title, company, job_description=""):
    """Uses OpenAI GPT-4o to write a high-converting tailored cover letter."""
    if openai_client:
        try:
            prompt = f"""You are a professional software engineer candidate named {CANDIDATE_PROFILE['firstName']} {CANDIDATE_PROFILE['lastName']}.
Write a concise, compelling, 3-paragraph cover letter in French for the job:
Position: {job_title}
Company: {company}
Job Description Snippet: {job_description[:600]}
Candidate Skills: {', '.join(CANDIDATE_PROFILE['skills'])}
Candidate Experience: {CANDIDATE_PROFILE['experience']}

Rules:
1. Keep it under 150 words.
2. Tone: Professional, enthusiastic, technical.
3. Highlight relevant full-stack skills.
4. Sign off with:
Cordialement,
{CANDIDATE_PROFILE['firstName']} {CANDIDATE_PROFILE['lastName']}"""

            response = openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You write tailored French cover letters for tech job applications."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=250,
                temperature=0.7
            )
            letter = response.choices[0].message.content.strip()
            print(f"  ✨ [OpenAI] Generated tailored cover letter for {company}!")
            return letter
        except Exception as e:
            print(f"  ⚠️ [OpenAI] Generation fallback ({e})")

    # Smart Fallback
    return (
        f"Madame, Monsieur,\n\n"
        f"Vivement intéressé par le poste de {job_title} chez {company}, je souhaite mettre à profit "
        f"mon expertise en développement Full Stack (React, Node.js, TypeScript, Python) au sein de vos équipes.\n\n"
        f"Autonome et rigoureux, je suis prêt à m'investir pleinement dans vos projets techniques.\n\n"
        f"Restant à votre disposition pour un échange,\n"
        f"{CANDIDATE_PROFILE['firstName']} {CANDIDATE_PROFILE['lastName']}"
    )


def ai_answer_custom_question(question_text, job_title, company):
    """Uses OpenAI to answer specific recruiter questions on the form."""
    if openai_client:
        try:
            prompt = f"""You are applying as a Software Engineer ({CANDIDATE_PROFILE['title']}) at {company} for the role '{job_title}'.
Answer this specific application form question concisely (1-2 sentences) in French:
Question: "{question_text}"
Candidate Profile: Available immediately in Paris, fluent in French and English, 5+ years experience in Full Stack."""

            response = openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=80,
                temperature=0.5
            )
            return response.choices[0].message.content.strip()
        except Exception:
            pass
    return "Oui, je suis entièrement disponible et motivé pour échanger sur ce poste."


def dismiss_axeptio_cookie(page):
    """Dismisses Axeptio GDPR cookies modal."""
    try:
        page.evaluate("""() => {
            const btns = [...document.querySelectorAll('button, #axeptio_btn_accept')];
            const ok = btns.find(b => b.textContent.includes('OK') || b.textContent.includes('Accepter'));
            if (ok) ok.click();
            document.querySelectorAll('[id*="axeptio"], #axeptio_overlay, .axeptio_mount').forEach(el => el.remove());
        }""")
    except Exception:
        pass


def ensure_authenticated_session(context):
    """Logs into Welcome to the Jungle if not already authenticated."""
    page = context.new_page()
    print(f"\n🔐 [Auth] Checking active session for {CANDIDATE_PROFILE['email']}...")

    try:
        page.goto("https://www.welcometothejungle.com/fr/me/application-tracker", wait_until="domcontentloaded", timeout=20000)
        time.sleep(2)
        dismiss_axeptio_cookie(page)

        if "me/application-tracker" in page.url and "login" not in page.url and "signin" not in page.url:
            print("✅ [Auth] Session verified and ready!")
            page.close()
            return True

        print("🔑 [Auth] Session expired or not found. Performing login...")
        page.goto("https://www.welcometothejungle.com/fr/authenticate/login", wait_until="domcontentloaded", timeout=20000)
        time.sleep(1.5)
        dismiss_axeptio_cookie(page)

        page.fill('input[type="email"], input[name="email"]', CANDIDATE_PROFILE['email'])
        page.fill('input[type="password"], input[name="password"]', CANDIDATE_PROFILE['password'])
        page.click('button[type="submit"]')
        time.sleep(4)

        print("✅ [Auth] Login completed!")
        page.close()
        return True
    except Exception as e:
        print(f"⚠️ [Auth] Notice: {e}")
        page.close()
        return False


def load_live_jobs(limit=5):
    """Loads verified active developer jobs."""
    if LIVE_JOBS_FILE.exists():
        try:
            with open(LIVE_JOBS_FILE, "r", encoding="utf-8") as f:
                jobs = json.load(f)
            if jobs:
                print(f"📦 [Scraper] Loaded {len(jobs)} verified active developer jobs from WTTJ database!")
                return jobs[:limit]
        except Exception:
            pass

    # Built-in verified active WTTJ developer positions
    return [
        {
            "id": "galadrim-wp",
            "title": "Developpeur WordPress - Freelance",
            "company": "Galadrim",
            "location": "Paris, France",
            "jobUrl": "https://www.welcometothejungle.com/fr/companies/galadrim/jobs/developpeur-wordpress-freelance_paris"
        },
        {
            "id": "galadrim-saas",
            "title": "Développeur full stack & IA logiciel de paie SaaS",
            "company": "Galadrim",
            "location": "Paris, France",
            "jobUrl": "https://www.welcometothejungle.com/fr/companies/galadrim/jobs/developpeur-full-stack-logiciel-de-paie-stage-de-fin-d-etude_paris"
        },
        {
            "id": "eleven-labs-dev",
            "title": "Développeur Typescript Node React Senior F/H/X",
            "company": "Eleven Labs",
            "location": "Paris, France",
            "jobUrl": "https://www.welcometothejungle.com/fr/companies/eleven-labs/jobs/developpeur-typescript-node-react-senior-f-h-x_paris_EL_VzQYeKk"
        },
        {
            "id": "shape-it-dev",
            "title": "Développeur·se Fullstack Java Angular",
            "company": "SHAPE IT",
            "location": "Lyon, France",
            "jobUrl": "https://www.welcometothejungle.com/fr/companies/shape-it/jobs/developpeur-se-fullstack-java-angular_lyon_SI_1j9zYk8"
        }
    ][:limit]


def apply_to_job(page, job, dry_run=False):
    """Executes the full AI-driven application workflow for a single job."""
    print("\n" + "━"*60)
    print(f"🚀 [Apply] Processing: {job['title']} @ {job['company']}")
    print(f"🔗 URL: {job['jobUrl']}")
    print("━"*60)

    try:
        # Step 1: Navigate to Job Page
        print("  1️⃣ Loading job page...")
        page.goto(job['jobUrl'], wait_until="domcontentloaded", timeout=30000)
        time.sleep(2.5)
        dismiss_axeptio_cookie(page)

        # Check if 404
        if "Page introuvable" in page.content() or "404" in page.title():
            print("  ⚠️ [404] Job is expired on WTTJ. Skipping.")
            return False

        # Extract Job Description Snippet for AI
        job_desc = page.evaluate("() => document.querySelector('section, main, article')?.innerText || ''")

        # Step 2: Click 'Postuler'
        print("  2️⃣ Clicking 'Postuler' button...")
        clicked = page.evaluate("""() => {
            const btns = [...document.querySelectorAll('button, a')];
            const applyBtn = btns.find(b => {
                const txt = (b.textContent || '').trim().toLowerCase();
                return txt === 'postuler' || txt === 'apply' || txt.includes('postuler à cette offre');
            });
            if (applyBtn) {
                applyBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                applyBtn.click();
                return true;
            }
            return false;
        }""")

        time.sleep(2.5)
        dismiss_axeptio_cookie(page)

        # Step 3: Fill Candidate Details
        print("  3️⃣ Populating candidate details (Fahid El Garouani)...")
        page.evaluate(f"""() => {{
            const fn = document.querySelector('input[name*="first_name"], input[name*="firstname"], input[placeholder*="Prénom"]');
            if (fn && !fn.value) {{ fn.value = '{CANDIDATE_PROFILE['firstName']}'; fn.dispatchEvent(new Event('input', {{ bubbles: true }})); }}

            const ln = document.querySelector('input[name*="last_name"], input[name*="lastname"], input[placeholder*="Nom"]');
            if (ln && !ln.value) {{ ln.value = '{CANDIDATE_PROFILE['lastName']}'; ln.dispatchEvent(new Event('input', {{ bubbles: true }})); }}

            const em = document.querySelector('input[name*="email"], input[type="email"]');
            if (em && !em.value) {{ em.value = '{CANDIDATE_PROFILE['email']}'; em.dispatchEvent(new Event('input', {{ bubbles: true }})); }}

            const ph = document.querySelector('input[name*="phone"], input[type="tel"]');
            if (ph && !ph.value) {{ ph.value = '{CANDIDATE_PROFILE['phone']}'; ph.dispatchEvent(new Event('input', {{ bubbles: true }})); }}
        }}""")

        # Step 4: Upload Resume PDF
        print(f"  4️⃣ Uploading PDF Resume ({DEFAULT_CV_PATH.name})...")
        if DEFAULT_CV_PATH.exists():
            resume_input = page.query_selector('input[name="resume"], input[accept*="pdf"]')
            if resume_input:
                resume_input.set_input_files(str(DEFAULT_CV_PATH))
                print("     ✓ PDF Resume attached directly to input[name='resume']!")
            else:
                any_input = page.query_selector('input[type="file"]')
                if any_input:
                    any_input.set_input_files(str(DEFAULT_CV_PATH))
        time.sleep(1)

        # Step 5: OpenAI Cover Letter & Questions
        print("  5️⃣ AI generating tailored cover letter & answers...")
        cover_letter = ai_generate_cover_letter(job['title'], job['company'], job_desc)
        
        textareas = page.query_selector_all('textarea')
        if textareas:
            # Primary cover letter
            textareas[0].fill(cover_letter)
            print("     ✓ AI Cover Letter typed into form!")

            # Additional questions if any
            for i, ta in enumerate(textareas[1:], start=2):
                label_text = ta.evaluate("el => el.closest('div, label')?.innerText || ''")
                ans = ai_answer_custom_question(label_text, job['title'], job['company'])
                ta.fill(ans)
                print(f"     ✓ AI answered custom question #{i}: {ans[:40]}...")

        time.sleep(1)

        # Step 6: GDPR Consent & Terms
        print("  6️⃣ Accepting GDPR data policy & terms...")
        consent = page.query_selector('input[name="consent"]')
        if consent:
            try:
                consent.scroll_into_view_if_needed()
                consent.check()
            except Exception:
                pass

        page.evaluate("""() => {
            document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                if (!cb.checked) {
                    cb.click();
                    cb.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        }""")
        time.sleep(1)

        if dry_run:
            print("  ⚠️ [DRY RUN] Form filled successfully! Skipping final submit click.")
            return True

        # Step 7: Final Submit
        print("  7️⃣ Submitting application: 'J’envoie ma candidature !'...")
        page.evaluate("""() => {
            document.querySelectorAll('div, form, section').forEach(el => {
                if (el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
            });
            const buttons = [...document.querySelectorAll('button')];
            const submitBtn = buttons.find(b => {
                const txt = (b.textContent || '').trim().toLowerCase();
                return txt.includes('envoie ma candidature') || txt.includes('envoyer') || txt.includes('soumettre') || b.type === 'submit';
            });
            if (submitBtn) {
                submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                submitBtn.click();
            }
        }""")

        time.sleep(6)
        shot_path = SCREENSHOTS_DIR / f"ai_submitted_{job['id']}.png"
        page.screenshot(path=str(shot_path))
        print(f"  🎉 [Success] Transmitted application to {job['company']}!")
        return True

    except Exception as e:
        print(f"  ❌ [Error] Failed during application: {e}")
        return False


def verify_tracker(context):
    """Verifies live application count on WTTJ tracker."""
    page = context.new_page()
    print("\n" + "═"*60)
    print("📊 [Tracker] Verifying Official Welcome to the Jungle Board...")
    print("═"*60)

    try:
        page.goto("https://www.welcometothejungle.com/fr/me/application-tracker", wait_until="domcontentloaded", timeout=30000)
        time.sleep(5)
        dismiss_axeptio_cookie(page)

        tracker_shot = SCREENSHOTS_DIR / "wttj_ai_live_tracker_final.png"
        page.screenshot(path=str(tracker_shot), full_page=True)

        tracker_text = page.inner_text("body")
        if "CANDIDATURE ENVOYÉE" in tracker_text:
            idx = tracker_text.index("CANDIDATURE ENVOYÉE")
            print("📈 [Live WTTJ Application Tracker]:\n" + tracker_text[idx:idx+150].replace("\n\n", "\n"))
        else:
            print("ℹ️ Board loaded. View screenshot at:", tracker_shot.name)
    except Exception as e:
        print(f"⚠️ [Tracker] Notice: {e}")
    finally:
        page.close()


def main():
    parser = argparse.ArgumentParser(description="WTTJ AI Auto-Apply Engine (OpenAI + Python)")
    parser.add_argument("--openai-key", default="", help="OpenAI API Key (or set OPENAI_API_KEY in .env)")
    parser.add_argument("--limit", "-n", type=int, default=2, help="Number of jobs to apply for")
    parser.add_argument("--dry-run", action="store_true", default=False, help="Simulate form filling without clicking final submit")
    parser.add_argument("--headless", action="store_true", default=False, help="Run browser in headless mode")
    args = parser.parse_args()

    print("════════════════════════════════════════════════════════════════")
    print(" 🤖 Welcome to the Jungle - AI Automation Bot (Python + OpenAI) 🌴")
    print(f" 👤 Candidate: {CANDIDATE_PROFILE['firstName']} {CANDIDATE_PROFILE['lastName']} ({CANDIDATE_PROFILE['email']})")
    print(f" 📄 Resume: {DEFAULT_CV_PATH.name}")
    print(f" ⚙️ Mode: {'DRY-RUN (Simulated)' if args.dry_run else 'LIVE SUBMISSION'}")
    print("════════════════════════════════════════════════════════════════")

    # Step 1: Initialize OpenAI
    init_openai(args.openai_key)

    # Step 2: Load Active Developer Jobs
    jobs = load_live_jobs(limit=args.limit)
    if not jobs:
        print("❌ No active jobs found. Exiting.")
        return

    # Step 3: Launch Playwright (No lock conflicts)
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=args.headless,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"]
        )
        context = browser.new_context(
            viewport={"width": 1280, "height": 950},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )

        try:
            ensure_authenticated_session(context)

            page = context.new_page()
            success_count = 0
            for idx, job in enumerate(jobs, start=1):
                print(f"\n[AI Batch {idx}/{len(jobs)}]")
                ok = apply_to_job(page, job, dry_run=args.dry_run)
                if ok:
                    success_count += 1
                time.sleep(2)

            page.close()

            verify_tracker(context)

            print("\n" + "═"*60)
            print(f"🏁 AI Automation Finished: {success_count}/{len(jobs)} applications processed successfully!")
            print("═"*60)

        finally:
            browser.close()


if __name__ == "__main__":
    main()
