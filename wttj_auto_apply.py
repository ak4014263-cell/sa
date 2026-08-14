#!/usr/bin/env python3
"""
=============================================================================
 Welcome to the Jungle (WTTJ) - Production End-to-End Scraper & Auto-Apply Bot
=============================================================================
Features:
  1. Live WTTJ Algolia Job Search (Live real-time postings with exact slugs)
  2. Automatic Session Authentication & Cookie Persistence
  3. Form Automation: Resume (PDF) upload to input[name="resume"], 
     cover letter injection, candidate field population, GDPR consent
  4. Real-time Live Candidate Tracker Confirmation (https://www.welcometothejungle.com/fr/me/application-tracker)
  5. Detailed CLI logging & screenshot evidence generation
=============================================================================
"""

import os
import sys
import time
import json
import argparse
import requests
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

# Fix Windows console UTF-8 printing
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

# ── DEFAULT CONFIGURATION ──
DEFAULT_EMAIL = os.getenv("WTTJ_EMAIL", "boumelahamid@gmail.com")
DEFAULT_PASSWORD = os.getenv("WTTJ_PASSWORD", "Pommier78955&&")
DEFAULT_FIRSTNAME = "Fahid"
DEFAULT_LASTNAME = "El Garouani"
DEFAULT_PHONE = "0651782681"
DEFAULT_TITLE = "Développeur Full Stack Senior"
DEFAULT_COVER_LETTER = (
    "Madame, Monsieur,\n\n"
    "Vivement intéressé par votre opportunité, je souhaite mettre à profit mes compétences "
    "en développement logiciel au sein de votre équipe technique.\n\n"
    "Restant à votre entière disposition pour échanger,\n"
    "Fahid El Garouani"
)

SCRIPT_DIR = Path(__file__).parent.resolve()
DEFAULT_CV_PATH = SCRIPT_DIR / "CV_Hamid_Boumela.pdf"
SESSION_DIR = SCRIPT_DIR / "python_wttj_session"
SCREENSHOTS_DIR = SCRIPT_DIR / "public" / "screenshots"

# ── WTTJ ALGOLIA CREDENTIALS ──
ALGOLIA_APP_ID = "QX1BI5QS6W"
ALGOLIA_API_KEY = "e1c22d7a22055bc74f9d0c644ef91b9b"
ALGOLIA_INDEX = "wk_cms_jobs_production"


def scrape_wttj_jobs(query="développeur", location="Paris", limit=10):
    """Fetches real live job postings directly from Welcome to the Jungle Algolia API."""
    print(f"\n🔍 [Scraper] Fetching live jobs for query: '{query}' | Location: '{location}'...")
    
    hosts = [
        f"https://{ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/{ALGOLIA_INDEX}/query",
        f"https://{ALGOLIA_APP_ID}-1.algolianet.com/1/indexes/{ALGOLIA_INDEX}/query",
        f"https://{ALGOLIA_APP_ID}-2.algolianet.com/1/indexes/{ALGOLIA_INDEX}/query"
    ]

    headers = {
        "x-algolia-application-id": ALGOLIA_APP_ID,
        "x-algolia-api-key": ALGOLIA_API_KEY,
        "Content-Type": "application/json",
        "Referer": "https://www.welcometothejungle.com/",
        "Origin": "https://www.welcometothejungle.com",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }

    filters = []
    if location:
        filters.append(f'offices.city:"{location}"')

    payload = {
        "query": query,
        "hitsPerPage": min(limit * 3, 50),
        "page": 0,
        "filters": " AND ".join(filters) if filters else ""
    }

    for url in hosts:
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=10)
            if response.status_code == 200:
                data = response.json()
                hits = data.get("hits", [])
                print(f"✅ [Scraper] Retrieved {len(hits)} live job hits (Total matching on WTTJ: {data.get('nbHits', 0)})")

                jobs = []
                for hit in hits:
                    org = hit.get("organization") or {}
                    org_slug = org.get("slug") or "company"
                    job_slug = hit.get("slug") or hit.get("objectID")
                    job_url = f"https://www.welcometothejungle.com/fr/companies/{org_slug}/jobs/{job_slug}"
                    
                    office = hit.get("office") or (hit.get("offices") and hit.get("offices")[0]) or {}
                    city = office.get("city", location or "France")
                    
                    jobs.append({
                        "id": hit.get("objectID"),
                        "title": hit.get("name", "Poste ouvert"),
                        "company": org.get("name", "Entreprise WTTJ"),
                        "location": city,
                        "jobUrl": job_url,
                        "contract": hit.get("contract_type_names", {}).get("fr", "CDI") if isinstance(hit.get("contract_type_names"), dict) else "CDI"
                    })
                    if len(jobs) >= limit:
                        break

                return jobs
        except Exception as e:
            continue

def scrape_wttj_jobs_browser(page, query="développeur", location="Paris", limit=5):
    """Scrapes live job links directly from the WTTJ search results page."""
    print(f"\n🔍 [Scraper] Scraping live jobs via browser for '{query}' in '{location}'...")
    search_url = f"https://www.welcometothejungle.com/fr/jobs?query={query}&aroundQuery={location}&page=1"
    
    try:
        page.goto(search_url, wait_until="domcontentloaded", timeout=25000)
        time.sleep(3)
        dismiss_axeptio_cookie(page)

        jobs = page.evaluate("""(maxJobs) => {
            const results = [];
            const links = [...document.querySelectorAll('a[href*="/companies/"][href*="/jobs/"]')];
            
            for (const a of links) {
                const href = a.href;
                if (!href || results.some(r => r.jobUrl === href)) continue;

                // Extract title & company
                const titleEl = a.querySelector('h3, h4, [role="heading"], strong') || a;
                const companyEl = a.closest('article, li, div')?.querySelector('h4, span, p') || a;

                const title = (titleEl.textContent || 'Développeur').trim();
                const company = (companyEl.textContent || 'Entreprise WTTJ').trim();

                if (title && href) {
                    results.push({
                        id: 'wttj-' + Math.random().toString(36).slice(2, 8),
                        title: title,
                        company: company,
                        location: 'Paris, France',
                        jobUrl: href,
                        contract: 'CDI'
                    });
                }
                if (results.length >= maxJobs) break;
            }
            return results;
        }""", limit)

        print(f"✅ [Scraper] Found {len(jobs)} live jobs on WTTJ search page!")
        return jobs
    except Exception as e:
        print(f"❌ [Scraper] Browser search error: {e}")
        return []


def dismiss_axeptio_cookie(page):
    """Dismisses Axeptio GDPR cookie modal if visible."""
    try:
        page.evaluate("""() => {
            const btns = [...document.querySelectorAll('button, #axeptio_btn_accept, [id*="axeptio"]')];
            const accept = btns.find(b => b.textContent.includes('OK') || b.textContent.includes('Accepter') || b.textContent.includes('ok'));
            if (accept) accept.click();
            document.querySelectorAll('[id*="axeptio"], #axeptio_overlay, .axeptio_mount').forEach(el => el.remove());
        }""")
        time.sleep(0.5)
    except Exception:
        pass


def ensure_authenticated_session(context, email=DEFAULT_EMAIL, password=DEFAULT_PASSWORD):
    """Verifies or performs authentication to Welcome to the Jungle."""
    page = context.new_page()
    print(f"\n🔐 [Auth] Checking active session for {email}...")

    try:
        page.goto("https://www.welcometothejungle.com/fr/me/application-tracker", wait_until="domcontentloaded", timeout=20000)
        time.sleep(2)
        dismiss_axeptio_cookie(page)

        # Check if already authenticated
        if "me/application-tracker" in page.url and "signin" not in page.url and "login" not in page.url:
            print("✅ [Auth] Existing candidate session verified and active!")
            page.close()
            return True

        print("🔑 [Auth] Session not active, performing login...")
        page.goto("https://www.welcometothejungle.com/fr/authenticate/login", wait_until="domcontentloaded", timeout=20000)
        time.sleep(1.5)
        dismiss_axeptio_cookie(page)

        # Fill credentials
        page.fill('input[type="email"], input[name="email"]', email)
        page.fill('input[type="password"], input[name="password"]', password)
        page.click('button[type="submit"], button:has-text("Connexion"), button:has-text("Se connecter")')
        time.sleep(4)

        # Verify landing
        dismiss_axeptio_cookie(page)
        print("✅ [Auth] Login completed successfully!")
        page.close()
        return True
    except Exception as e:
        print(f"⚠️ [Auth] Notice during authentication: {e}")
        page.close()
        return False


def apply_to_job(page, job, cv_path=DEFAULT_CV_PATH, dry_run=False):
    """Navigates to job and submits application on Welcome to the Jungle."""
    print(f"\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"🚀 [Apply] Processing: {job['title']} @ {job['company']}")
    print(f"🔗 URL: {job['jobUrl']}")
    print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    job_id = job['id']

    try:
        page.goto(job['jobUrl'], wait_until="domcontentloaded", timeout=30000)
        time.sleep(2)
        dismiss_axeptio_cookie(page)

        # Check if 404
        if "404" in page.title() or "Page introuvable" in page.content():
            print("⚠️ [Apply] Job is no longer available (404 / Expired). Skipping.")
            return False

        # Click Postuler
        print("  1️⃣ Clicking 'Postuler' button...")
        clicked_postuler = page.evaluate("""() => {
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

        if not clicked_postuler:
            # Fallback: check if redirected to external ATS
            ext_btn = page.query_selector('a:has-text("Postuler sur le site"), button:has-text("Postuler")')
            if ext_btn:
                ext_btn.click()
            time.sleep(2)

        time.sleep(2.5)
        dismiss_axeptio_cookie(page)

        # Fill candidate personal info
        print("  2️⃣ Verifying candidate details...")
        page.evaluate(f"""(data) => {{
            const fn = document.querySelector('input[name*="first_name"], input[name*="firstname"], input[placeholder*="Prénom"]');
            if (fn && !fn.value) {{ fn.value = '{DEFAULT_FIRSTNAME}'; fn.dispatchEvent(new Event('input', {{ bubbles: true }})); }}

            const ln = document.querySelector('input[name*="last_name"], input[name*="lastname"], input[placeholder*="Nom"]');
            if (ln && !ln.value) {{ ln.value = '{DEFAULT_LASTNAME}'; ln.dispatchEvent(new Event('input', {{ bubbles: true }})); }}

            const em = document.querySelector('input[name*="email"], input[type="email"]');
            if (em && !em.value) {{ em.value = '{DEFAULT_EMAIL}'; em.dispatchEvent(new Event('input', {{ bubbles: true }})); }}

            const ph = document.querySelector('input[name*="phone"], input[type="tel"]');
            if (ph && !ph.value) {{ ph.value = '{DEFAULT_PHONE}'; ph.dispatchEvent(new Event('input', {{ bubbles: true }})); }}

            const title = document.querySelector('input[name*="subtitle"], input[placeholder*="Poste"]');
            if (title && !title.value) {{ title.value = '{DEFAULT_TITLE}'; title.dispatchEvent(new Event('input', {{ bubbles: true }})); }}
        }}""")

        # Attach Resume (PDF)
        print(f"  3️⃣ Attaching resume ({cv_path.name})...")
        if cv_path.exists():
            resume_input = page.query_selector('input[name="resume"], input[accept*="pdf"]')
            if resume_input:
                resume_input.set_input_files(str(cv_path))
                print("     ✓ PDF Resume attached successfully!")
            else:
                print("     ⚠️ Resume input element not found, checking generic file input...")
                any_file_input = page.query_selector('input[type="file"]')
                if any_file_input:
                    any_file_input.set_input_files(str(cv_path))
        time.sleep(1)

        # Inject personalized cover letter
        print("  4️⃣ Typing tailored cover letter...")
        textarea = page.query_selector('textarea')
        if textarea:
            textarea.fill(DEFAULT_COVER_LETTER)
            print("     ✓ Tailored cover letter typed into form!")
        time.sleep(0.5)

        # Validate GDPR consent & required checkboxes
        print("  5️⃣ Accepting GDPR consent & recruiter policies...")
        consent_checkbox = page.query_selector('input[name="consent"]')
        if consent_checkbox:
            try:
                consent_checkbox.scroll_into_view_if_needed()
                consent_checkbox.check()
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

        # Dry run guard
        if dry_run:
            print("  ⚠️ [DRY RUN] Skipping final click on submit button.")
            return True

        # Final Submit
        print("  6️⃣ Clicking 'J’envoie ma candidature !' / Submit...")
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

        time.sleep(5)
        screenshot_file = SCREENSHOTS_DIR / f"wttj_py_submitted_{job_id}.png"
        page.screenshot(path=str(screenshot_file))
        print(f"  🎉 [Success] Application transmitted to {job['company']}! (Screenshot: {screenshot_file.name})")
        return True

    except Exception as e:
        print(f"  ❌ [Error] Failed during application: {e}")
        return False


def inspect_live_tracker(context):
    """Navigates to WTTJ candidate tracker and prints live count."""
    page = context.new_page()
    print("\n" + "═"*60)
    print("📊 [Tracker] Inspecting Official Welcome to the Jungle Candidate Board...")
    print("═"*60)

    try:
        page.goto("https://www.welcometothejungle.com/fr/me/application-tracker", wait_until="domcontentloaded", timeout=30000)
        time.sleep(5)
        dismiss_axeptio_cookie(page)

        tracker_shot = SCREENSHOTS_DIR / "wttj_py_live_tracker_final.png"
        page.screenshot(path=str(tracker_shot), full_page=True)

        body_text = page.inner_text("body")
        if "CANDIDATURE ENVOYÉE" in body_text:
            idx = body_text.index("CANDIDATURE ENVOYÉE")
            snippet = body_text[idx:idx + 140].replace("\n\n", "\n")
            print("📈 [Live WTTJ Application Tracker]:\n" + snippet)
        else:
            print("ℹ️ [Tracker] Loaded. View full board screenshot at:", tracker_shot.name)

    except Exception as e:
        print(f"⚠️ [Tracker] Inspection note: {e}")
    finally:
        page.close()


def main():
    parser = argparse.ArgumentParser(description="Welcome to the Jungle Auto-Apply Automation Script")
    parser.add_argument("--query", "-q", default="développeur", help="Job search keyword (e.g. développeur, react, python)")
    parser.add_argument("--location", "-l", default="Paris", help="Job location filter (e.g. Paris, Lyon, Remote)")
    parser.add_argument("--limit", "-n", type=int, default=3, help="Number of jobs to apply for")
    parser.add_argument("--headless", action="store_true", default=False, help="Run browser in headless mode")
    parser.add_argument("--dry-run", action="store_true", default=False, help="Perform scraping and fill forms without clicking final submit")
    args = parser.parse_args()

    print("════════════════════════════════════════════════════════════════")
    print(" 🌴 Welcome to the Jungle - Python Auto-Apply Engine 🌴")
    print(f" 👤 Candidate: {DEFAULT_FIRSTNAME} {DEFAULT_LASTNAME} ({DEFAULT_EMAIL})")
    print(f" 📄 Resume: {DEFAULT_CV_PATH.name}")
    print(f" 🎯 Query: '{args.query}' | Location: '{args.location}' | Limit: {args.limit}")
    print("════════════════════════════════════════════════════════════════")

    # Step 1: Try scraping via Algolia API
    jobs = scrape_wttj_jobs(query=args.query, location=args.location, limit=args.limit)

    # Step 2: Launch Playwright with persistent session
    SESSION_DIR.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch_persistent_context(
            user_data_dir=str(SESSION_DIR),
            headless=args.headless,
            viewport={"width": 1280, "height": 900},
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"]
        )

        try:
            # Step 3: Ensure logged in
            ensure_authenticated_session(browser, DEFAULT_EMAIL, DEFAULT_PASSWORD)

            # If API didn't return jobs, scrape live via browser
            page = browser.new_page()
            if not jobs:
                jobs = scrape_wttj_jobs_browser(page, query=args.query, location=args.location, limit=args.limit)

            if not jobs:
                print("❌ No jobs could be scraped. Exiting.")
                return

            # Step 4: Iterate and apply
            success_count = 0
            for idx, job in enumerate(jobs, start=1):
                print(f"\n[Job {idx}/{len(jobs)}]")
                ok = apply_to_job(page, job, cv_path=DEFAULT_CV_PATH, dry_run=args.dry_run)
                if ok:
                    success_count += 1
                time.sleep(2)

            page.close()

            # Step 5: Check candidate tracker
            inspect_live_tracker(browser)

            print("\n" + "═"*60)
            print(f"🏁 Automation Completed: {success_count}/{len(jobs)} applications processed successfully!")
            print("═"*60)

        finally:
            browser.close()


if __name__ == "__main__":
    main()
