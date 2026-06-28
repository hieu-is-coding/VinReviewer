r"""End-to-end integration test for PDF submission evaluation.

This test:
1. Seeds Supabase with the minimum required data (user, class, student,
   rubric, criteria, assignment, submission).
2. Uploads a research-paper PDF via POST /evaluate-pdf.
3. Polls /job/{job_id} until the job completes (or times out at 10 min).
4. Verifies evaluation rows were written to Supabase.
5. Cleans up all seeded data on teardown.

Run:
    .venv/Scripts/python.exe -m pytest tests/test_e2e_pdf_evaluation.py -v -s

Note: GROBID is NOT required. PDF parsing uses pypdf + GPT-4o-mini.
"""

from __future__ import annotations

import os
import time
import uuid
from pathlib import Path

# Load real .env BEFORE conftest.py's os.environ.setdefault() calls can
# override SUPABASE_URL, SUPABASE_SERVICE_KEY, and API_KEY with test stubs.
_env_file = Path(__file__).parent.parent / ".env"
if _env_file.exists():
    from dotenv import load_dotenv
    load_dotenv(_env_file, override=True)

import httpx
import pytest

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
# Use E2E_API_KEY if set; otherwise use the live key directly (not the
# conftest.py default "test-api-key" which only works with the TestClient).
API_KEY = os.getenv("E2E_API_KEY") or os.getenv("BACKEND_API_KEY", "capstone-22-06-2026")
HEADERS = {"X-API-Key": API_KEY}

# Minimal valid single-page PDF bytes (hand-crafted, no library needed)
_MINIMAL_PDF = (
    b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
    b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
    b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
    b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n"
    b"4 0 obj\n<< /Length 44 >>\nstream\n"
    b"BT /F1 12 Tf 100 700 Td (Hello PDF World) Tj ET\n"
    b"endstream\nendobj\n"
    b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
    b"xref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n"
    b"0000000062 00000 n \n0000000119 00000 n \n"
    b"0000000274 00000 n \n0000000370 00000 n \n"
    b"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n456\n%%EOF\n"
)

# Research-paper text for a richer PDF that pypdf can extract
_RESEARCH_TEXT = """\
Abstract: This paper presents a novel approach to neural machine translation using
attention-based transformer architectures. We demonstrate significant improvements
in BLEU scores on WMT14 English-German benchmarks compared to previous methods.

1. Introduction
Neural machine translation has revolutionized language processing tasks. Our method
builds upon the foundational work of Vaswani et al. (2017) and extends it with
multi-head cross-attention layers.

2. Methodology
We train our model on 4.5M sentence pairs using the Adam optimizer with a learning
rate of 0.0001 and batch size of 32. The model architecture consists of 6 encoder
and 6 decoder layers with 8 attention heads.

3. Results
Our model achieves a BLEU score of 28.4 on WMT14 En-De, surpassing the baseline
by 2.1 points. Ablation studies confirm the importance of each component.

4. Conclusion
We have demonstrated a new state-of-the-art result for neural machine translation.
Future work will explore larger datasets and multilingual transfer learning.

References
[1] Vaswani, A. et al. (2017). Attention is all you need. NeurIPS 2017.
[2] Bahdanau, D. et al. (2015). Neural machine translation by jointly
    learning to align and translate. ICLR 2015.
"""


def _make_research_pdf() -> bytes:
    """Return a minimal PDF with extractable research paper text (pypdf-compatible)."""
    lines = []
    y = 720
    for raw in _RESEARCH_TEXT.splitlines():
        stripped = raw.strip()
        if not stripped:
            y -= 10
            continue
        safe = stripped.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        lines.append(f"BT /F1 9 Tf 50 {y} Td ({safe}) Tj ET")
        y -= 12
        if y < 50:
            break
    content = "\n".join(lines).encode("latin-1", errors="replace")
    clen = len(content)
    header = (
        f"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
        f"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
        f"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        f"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n"
        f"4 0 obj\n<< /Length {clen} >>\nstream\n"
    ).encode()
    footer = (
        b"\nendstream\nendobj\n"
        b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
        b"xref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n"
        b"0000000062 00000 n \n0000000119 00000 n \n"
        b"0000000274 00000 n \n0000000370 00000 n \n"
        b"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n456\n%%EOF\n"
    )
    return header + content + footer


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def supabase_client():
    # Read directly from env (already loaded from real .env at module import time)
    from supabase import create_client
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    return create_client(url, key)


@pytest.fixture(scope="module")
def seeded_data(supabase_client):
    """Seed a minimal working dataset; teardown removes all rows afterwards."""
    sb = supabase_client
    sub_id = str(uuid.uuid4())

    # Fetch a real user from auth.users (FK constraint requires it)
    import httpx as _httpx
    _url = os.environ["SUPABASE_URL"]
    _key = os.environ["SUPABASE_SERVICE_KEY"]
    _r = _httpx.get(
        _url + "/auth/v1/admin/users",
        headers={"apikey": _key, "Authorization": "Bearer " + _key},
        timeout=10,
    )
    _r.raise_for_status()
    _users = _r.json().get("users", [])
    assert _users, "No users in auth.users — sign up at least one user via the FrontEnd first"
    user_id = _users[0]["id"]

    cls_row = sb.table("classes").insert({
        "user_id": user_id, "name": "E2E Test Class",
        "description": "Created by e2e test",
    }).execute()
    class_id = cls_row.data[0]["id"]

    stu_row = sb.table("students").insert({
        "user_id": user_id, "name": "E2E Test Student",
        "email": "e2e-test@example.com",
    }).execute()
    student_id = stu_row.data[0]["id"]

    rub_row = sb.table("rubrics").insert({
        "user_id": user_id, "class_id": class_id,
        "name": "E2E Test Rubric", "description": "e2e rubric",
    }).execute()
    rubric_id = rub_row.data[0]["id"]

    criteria_ids = []
    for i, (name, desc) in enumerate([
        ("Clarity",     "Is the paper clearly written and well-structured?"),
        ("Novelty",     "Does the paper present novel contributions?"),
        ("Methodology", "Is the methodology sound and reproducible?"),
    ]):
        cr = sb.table("criteria").insert({
            "user_id": user_id, "rubric_id": rubric_id,
            "name": name, "description": desc,
            "weight": 1.0, "max_score": 10, "sort_order": i,
        }).execute()
        criteria_ids.append(cr.data[0]["id"])

    asgn_row = sb.table("assignments").insert({
        "user_id": user_id, "class_id": class_id, "rubric_id": rubric_id,
        "title": "E2E Test Assignment",
        "description": "Review a machine translation paper for clarity, novelty, and methodology.",
        "status": "active", "submission_type": "pdf",
        "target_venue": "ACL", "use_agentic_evaluation": True,
    }).execute()
    assignment_id = asgn_row.data[0]["id"]

    sb.table("class_students").insert({
        "user_id": user_id, "class_id": class_id, "student_id": student_id,
    }).execute()

    sub_row = sb.table("submissions").insert({
        "id": sub_id,
        "user_id": user_id, "class_id": class_id, "student_id": student_id,
        "assignment_id": assignment_id, "rubric_id": rubric_id,
        "title": "E2E PDF Submission",
        "content": "Placeholder - will be updated by pipeline after PDF parsing",
        "source": "manual", "status": "pending",
    }).execute()
    submission_id = sub_row.data[0]["id"]

    print(f"\n[seed] user_id={user_id}")
    print(f"[seed] submission_id={submission_id}")
    print(f"[seed] rubric_id={rubric_id} criteria={criteria_ids}")

    yield {
        "user_id": user_id,
        "class_id": class_id,
        "student_id": student_id,
        "rubric_id": rubric_id,
        "criteria_ids": criteria_ids,
        "assignment_id": assignment_id,
        "submission_id": submission_id,
    }

    # Teardown - delete in FK-safe order
    print("\n[teardown] Removing e2e test data...")
    evals = sb.table("evaluations").select("id").eq("submission_id", submission_id).execute()
    for ev in evals.data:
        sb.table("evaluations").delete().eq("id", ev["id"]).execute()
    sb.table("submissions").delete().eq("id", submission_id).execute()
    sb.table("class_students").delete().eq("class_id", class_id).eq("student_id", student_id).execute()
    sb.table("assignments").delete().eq("id", assignment_id).execute()
    sb.table("criteria").delete().eq("rubric_id", rubric_id).execute()
    sb.table("rubrics").delete().eq("id", rubric_id).execute()
    sb.table("students").delete().eq("id", student_id).execute()
    sb.table("classes").delete().eq("id", class_id).execute()
    print("[teardown] Done.")


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_backend_is_reachable():
    """Backend health endpoint must return 200 with status ok."""
    resp = httpx.get(f"{BACKEND_URL}/health", timeout=10)
    assert resp.status_code == 200, f"Backend not reachable: {resp.text}"
    data = resp.json()
    assert data["status"] == "ok", f"Unexpected health: {data}"
    print(f"\n[health] {data}")


def test_pypdf_available():
    """pypdf must be installed (replaces GROBID for PDF text extraction)."""
    data = httpx.get(f"{BACKEND_URL}/health", timeout=10).json()
    # health.grobid field now checks for pypdf availability
    assert data.get("grobid") is True, (
        "pypdf is not available in the backend venv. "
        "Install it: uv add pypdf"
    )
    print(f"[pypdf] available (health.grobid={data.get('grobid')})")


def test_evaluate_pdf_unauthorized():
    """Uploading without API key must return 401."""
    resp = httpx.post(
        f"{BACKEND_URL}/evaluate-pdf",
        files={"file": ("test.pdf", _MINIMAL_PDF, "application/pdf")},
        data={"submission_id": "fake-id"},
        timeout=10,
    )
    assert resp.status_code == 401


def test_evaluate_pdf_rejects_non_pdf():
    """Uploading a non-PDF (with valid auth) must return 400."""
    resp = httpx.post(
        f"{BACKEND_URL}/evaluate-pdf",
        headers=HEADERS,  # auth must pass first before content-type is checked
        files={"file": ("test.txt", b"plain text", "text/plain")},
        data={"submission_id": "fake-id"},
        timeout=10,
    )
    assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
    assert resp.json()["detail"] == "Only PDF files are accepted"


def test_evaluate_pdf_full_pipeline(seeded_data, supabase_client):
    """
    Full end-to-end: upload a research PDF, wait for the agentic pipeline to
    complete (max 10 min), then assert all Supabase rows are correct.
    """
    submission_id = seeded_data["submission_id"]
    sb = supabase_client

    pdf_bytes = _make_research_pdf()
    print(f"\n[e2e] Uploading PDF ({len(pdf_bytes)} bytes) for submission={submission_id}")

    with httpx.Client(timeout=30) as client:
        resp = client.post(
            f"{BACKEND_URL}/evaluate-pdf",
            headers=HEADERS,
            files={"file": ("research_paper.pdf", pdf_bytes, "application/pdf")},
            data={"submission_id": submission_id},
        )

    print(f"[e2e] POST /evaluate-pdf -> {resp.status_code}: {resp.text}")
    assert resp.status_code == 202, f"Expected 202, got {resp.status_code}: {resp.text}"

    body = resp.json()
    job_id = body["job_id"]
    print(f"[e2e] Job queued: job_id={job_id}  initial_status={body['status']}")

    # Poll until completed or failed (10-minute max)
    deadline = time.time() + 600
    final_status = None
    with httpx.Client(timeout=15) as client:
        while time.time() < deadline:
            r = client.get(f"{BACKEND_URL}/jobs/{job_id}", headers=HEADERS)
            if r.status_code == 200:
                j = r.json()
                final_status = j.get("status")
                print(f"[e2e] poll -> status={final_status}  detail={j}")
                if final_status in ("completed", "failed"):
                    if final_status == "failed":
                        pytest.fail(f"Pipeline failed: {j.get('error')}")
                    break
            elif r.status_code == 404:
                print(f"[e2e] poll -> 404 job not found (job may have completed and been evicted)")
                break
            else:
                print(f"[e2e] poll -> {r.status_code}: {r.text[:200]}")
            time.sleep(10)

    assert final_status == "completed", (
        f"Pipeline did not complete within 10 min — final status: {final_status}"
    )

    # --- Verify: submission status updated ---
    sub_row = sb.table("submissions").select("status").eq("id", submission_id).execute()
    assert sub_row.data, "Submission row missing in Supabase"
    sub_status = sub_row.data[0]["status"]
    assert sub_status in ("ai_graded", "flagged"), f"Unexpected submission status: {sub_status}"
    print(f"[e2e] Submission final status: {sub_status}")

    # --- Verify: evaluations row ---
    eval_rows = sb.table("evaluations").select("*").eq("submission_id", submission_id).execute()
    assert eval_rows.data, "No evaluations row in Supabase"
    ev = eval_rows.data[0]
    eval_id = ev["id"]
    print(f"[e2e] Evaluation: id={eval_id} total_score={ev.get('total_score')} confidence={ev.get('confidence')}")
    assert ev.get("total_score") is not None, "total_score missing from evaluation"

    # --- Verify: criteria_scores rows ---
    cs_rows = sb.table("criteria_scores").select("*").eq("evaluation_id", eval_id).execute()
    print(f"[e2e] criteria_scores: {len(cs_rows.data)} rows")
    assert len(cs_rows.data) >= 1, "No criteria_scores rows written"
    for cs in cs_rows.data:
        assert cs.get("score") is not None, f"criteria_score missing score: {cs}"

    # --- Verify: evaluation_details row ---
    det_rows = sb.table("evaluation_details").select("*").eq("evaluation_id", eval_id).execute()
    print(f"[e2e] evaluation_details: {len(det_rows.data)} rows")
    assert len(det_rows.data) >= 1, "No evaluation_details row written"
    d = det_rows.data[0]
    print(
        f"[e2e] Details: novelty_score={d.get('novelty_score')} "
        f"overall_percentile={d.get('overall_percentile')} "
        f"venue_tier={d.get('venue_tier')}"
    )

    print("\n[e2e] All assertions passed. Pipeline evaluation complete.")


def test_duplicate_submission_returns_same_job(seeded_data):
    """
    Posting the same submission_id while a job is already active must
    return the same job_id rather than creating a new one.
    """
    submission_id = seeded_data["submission_id"]

    with httpx.Client(timeout=30) as client:
        r1 = client.post(
            f"{BACKEND_URL}/evaluate-pdf",
            headers=HEADERS,
            files={"file": ("p1.pdf", _MINIMAL_PDF, "application/pdf")},
            data={"submission_id": submission_id},
        )
        print(f"\n[dup] first POST -> {r1.status_code}: {r1.text}")
        assert r1.status_code == 202
        jid1 = r1.json()["job_id"]

        r2 = client.post(
            f"{BACKEND_URL}/evaluate-pdf",
            headers=HEADERS,
            files={"file": ("p2.pdf", _MINIMAL_PDF, "application/pdf")},
            data={"submission_id": submission_id},
        )
        print(f"[dup] second POST -> {r2.status_code}: {r2.text}")
        assert r2.status_code == 202
        jid2 = r2.json()["job_id"]

    assert jid1 == jid2, f"Expected same job_id, got {jid1} vs {jid2}"
    print(f"[dup] Same job returned: {jid1}")
