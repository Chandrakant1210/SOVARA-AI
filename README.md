# SOVARA AI — Sovereign AI Reasoning Assistant

**Air-Gapped Multi-Model Agentic AI Workbench for Confidential Industrial Work**

Smart India Hackathon 2026 · Problem Statement PS-26117 · Mangalore Refinery and Petrochemicals Limited (MRPL)

> Intelligence that never leaves your walls.

---

## What this is

SOVARA AI is an on-premise AI workbench for confidential industrial knowledge work — inspection reports, SOPs, engineering documents — that never sends data to the cloud. It behaves as an AI teammate rather than a chatbot: it understands documents, plans multi-step work, retrieves private knowledge, reasons with evidence, and produces real business deliverables (DOCX approval notes), all under human review.

**Core flow:** Login → Upload a document (OCR/vision extraction, auto-indexed for retrieval) → Ask SOVARA a question → Watch the 6-node agent reason live (Understand → Plan → Retrieve → Reason → Validate → Generate) → Review the grounded, cited output → Approve / Modify / Reject → Real `.docx` deliverable, with a live Security Center proving zero data left the network.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, TypeScript, Tailwind CSS, IBM Plex fonts |
| Backend | FastAPI (Python) |
| Agent | LangGraph |
| LLM serving | Ollama (local) |
| Vector DB | Qdrant |
| Database | PostgreSQL |
| OCR | PaddleOCR |
| PDF/Vision fallback | PyMuPDF + vision model via Ollama |
| Auth | JWT (python-jose, passlib/bcrypt) |
| Sandbox | Docker (network-isolated code execution) |
| Docs | python-docx |

---

## Prerequisites

- **Python 3.11** (not 3.14 — PaddleOCR/PaddlePaddle do not yet support it)
- **Node.js** (for the Next.js frontend)
- **Docker Desktop** (running, for PostgreSQL, Qdrant, and the code sandbox)
- **Ollama** installed locally ([ollama.com](https://ollama.com))
- **Git**

> ⚠️ **Windows note:** if you have any older/orphaned PostgreSQL installation on your machine (e.g. from a past project), it may silently occupy port `5432` and cause confusing "password authentication failed" errors even with correct credentials. Check with `netstat -ano | findstr :5432` and stop any process that isn't Docker before proceeding.

> ⚠️ **OneDrive / cloud-synced folders:** avoid running this project from inside a OneDrive-synced directory. Background syncing can interfere with `venv`, cause files to silently disappear (Files On-Demand), and produce endless `uvicorn --reload` loops. Clone to a plain local path (e.g. `C:\Projects\SOVARA-AI`) instead.

---

## 1. Clone and set up the environment file

```bash
git clone https://github.com/Chandrakant1210/SOVARA-AI.git
cd SOVARA-AI
```

Create a `.env` file at the repo root:

```env
POSTGRES_USER=sovara
POSTGRES_PASSWORD=sovara_dev_password
POSTGRES_DB=sovara_db
DATABASE_URL=postgresql://sovara:sovara_dev_password@localhost:5432/sovara_db
SECRET_KEY=change-this-to-a-random-secret-in-production
```

> The backend will **refuse to start** without `DATABASE_URL` and `SECRET_KEY` set — this is intentional, so it never silently runs with a known/public secret.

---

## 2. Start the infrastructure containers

```bash
docker compose up -d postgres qdrant
```

Wait ~10 seconds for both to initialize. Verify:

```bash
docker ps
```

You should see `postgres:16` and `qdrant/qdrant` both running.

---

## 3. Pull the required local models

```bash
ollama pull qwen3:8b
ollama pull nomic-embed-text
```

`qwen3:8b` is the reasoning model actually used by this build. If you have the hardware for `qwen3:14b` or a vision model like `qwen2.5vl:7b`, you can pull those too and flip their `available: true` in `backend/app/config/models.yaml` — but the defaults are already correct for an 8B-class setup.

---

## 4. Backend setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate      # Windows
# source venv/bin/activate  # macOS/Linux

pip install -r requirements.txt
```

> Always run `pip freeze > requirements.txt` **with the venv activated**. Running it from a global/inactive environment produces a broken, near-empty requirements file — this has happened before in this project's history.

Initialize the database tables:

```bash
python init_db.py
```

Expected output: `Done. Tables created: ['users', 'documents', 'audit_log']`

Index the sample SOP documents into Qdrant (optional but recommended, gives the agent something real to retrieve from immediately):

```bash
python ingest_sop_docs.py
```

Start the backend:

```bash
uvicorn app.main:app --port 8000
```

Verify: open `http://localhost:8000/docs` — you should see the full API listed (auth, chat, documents, retrieve, agent, security, sandbox).

---

## 5. Frontend setup

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

---

## 6. First run

1. On the login screen, click **"New here? Create an account"** and register (email/password — all self-registered accounts are created as `engineer` role; there is no way to self-grant admin).
2. You'll land on the **Chat** tab. Try one of the example prompts, or ask something related to the pre-indexed SOPs (e.g. *"What is the bearing temperature limit for pump maintenance?"*).
3. Go to **Documents** to upload a scanned report, image, or PDF — it's OCR'd/vision-extracted and automatically indexed, so you can immediately ask SOVARA about it in Chat.
4. Go to **Review** after an agent run to Approve, Modify, or Reject the generated deliverable.
5. The **Security Center** panel (always visible on the right) shows live, real network measurements — not placeholder data.

---

## Project structure

```
SOVARA-AI/
├── backend/
│   ├── app/
│   │   ├── agent/          # LangGraph state + graph (6 nodes)
│   │   ├── api/             # FastAPI routers (auth, chat, documents, retrieve, agent, security, sandbox, review)
│   │   ├── core/            # config, database, security (JWT), deps (auth dependency)
│   │   ├── config/          # models.yaml + model registry
│   │   ├── models/          # SQLAlchemy models (user, document, audit_log)
│   │   └── services/        # OCR, embeddings, Qdrant, sandbox, DOCX generation
│   ├── sample_docs/          # sample SOPs for initial RAG indexing
│   ├── requirements.txt
│   └── init_db.py / ingest_sop_docs.py
├── frontend/
│   └── src/
│       ├── app/              # Next.js app router (single-page, tab-based UI)
│       ├── components/       # ChatPanel, DocumentsPanel, ReviewPanel, SecurityPanel, etc.
│       └── lib/              # api.ts (authFetch), AuthContext.tsx
└── docker-compose.yml
```

---

## Security notes

- Every protected route requires a valid JWT (`Authorization: Bearer <token>`); tokens expire after 60 minutes and expired/invalid tokens auto-redirect to login.
- Self-registration always creates `engineer`-level accounts; there is no client-controllable path to `admin`.
- The Docker sandbox (`/api/sandbox/run`) executes code with **no network access**, memory/CPU limits, and a hard timeout — verified by confirming DNS resolution itself fails inside the container.
- `POSTGRES_HOST_AUTH_METHOD=trust` in `docker-compose.yml` is **local-development-only** — never deploy this configuration as-is.
- The Security Center's numbers come from real `netstat` measurement of the backend process's own connections — not hardcoded.

---

## Known limitations

- OCR/vision accuracy varies with image quality — not claimed to be perfect, consistent with the project's own design principles.
- The Docker sandbox currently supports Python execution only.
- No per-document management/deletion UI for the RAG index yet (everything uploaded stays indexed).
- "Active model" label in the Security Center is currently static text, not dynamically read from the model registry.

---

## Team

- **Chandrakant Kumar** — Architecture, Backend & AI, RAG, Security, Frontend
- **Aditi Sharma** — Backend & AI, Agent, Frontend
- **Aman Kumar Yadav** — Documentation & PPT
- **Khushi Kumari** — Documentation, PPT & Presentation Lead