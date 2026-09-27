# SOVARA AI — Sovereign AI Reasoning Assistant

**On-Premise, Air-Gap-Ready Multi-Model Agentic AI Workbench for Confidential Industrial Work**

**Smart India Hackathon 2026 · Problem Statement PS-26117 · Mangalore Refinery and Petrochemicals Limited (MRPL)**

> **Intelligence designed to stay within your controlled infrastructure.**

---

## Overview

SOVARA AI is an **on-premise AI reasoning workbench** designed for confidential industrial knowledge work such as inspection reports, Standard Operating Procedures (SOPs), engineering documents, maintenance records, and operational documentation.

Instead of functioning as a simple chatbot, SOVARA is designed as an **AI teammate with a structured reasoning workflow**. It can ingest private documents, extract and validate engineering values, retrieve relevant information, execute multi-step reasoning, and generate business-ready deliverables — under human review and with a complete audit trail.

The architecture is built around **local AI inference, private access-controlled retrieval, controlled execution, authentication, role-based sign-off, audit logging, and human-in-the-loop approval**. The full workflow runs with **no outbound network connection**.

### Core Workflow (hero scenario)

```text
Login
  ↓
Upload scanned inspection report
  ↓
OCR with per-line confidence and source boxes
  ↓
Rule-based field extraction + engineering validation
  ↓
Human corrections (audited, re-validated)
  ↓
Send findings to the agent
  ↓
Understand → Plan → Retrieve (access-filtered) → Reason → Validate → Generate
  ↓
Approval note (DOCX)
  ↓
Manager sign-off (no self-approval)
  ↓
Activity Log + CSV export
```

---

# Problem

Industrial organizations work with sensitive information including:

* Standard Operating Procedures (SOPs)
* Inspection reports
* Maintenance records
* Engineering documentation
* Operational procedures
* Technical reports
* Safety and compliance documentation

Using external cloud-based AI services for confidential information can introduce concerns around **data governance, confidentiality, infrastructure control, and organizational compliance requirements**.

Traditional document search systems can also require users to manually locate information across large collections of technical documents.

SOVARA AI addresses this problem by providing a **local-first AI workbench** where document processing, retrieval, embeddings, AI inference, reasoning, code execution, and business-document generation operate within the organization's controlled infrastructure.

---

# Solution

SOVARA combines several capabilities into one controlled AI workspace:

* Local LLM inference through **Ollama**, with a task-based **model router**
* Private, **access-controlled** document retrieval using **Qdrant**
* Multi-step agent orchestration using **LangGraph**
* OCR and **rule-based engineering extraction** using **PaddleOCR and PyMuPDF**
* Local PostgreSQL persistence
* Hardened, network-disabled **Docker sandbox** with a pytest runner
* JWT-based authentication and role-based access
* **Segregation-of-duties sign-off** and a fail-closed **audit trail**
* Automated DOCX document generation
* Runtime security and network visibility

The objective is not simply to provide an AI chatbot, but to create a **controlled reasoning environment for confidential industrial knowledge work**.

---

# Key Features

* 🔒 **Local-First AI Inference** — All inference runs locally through Ollama; no cloud APIs.
* 🔬 **Scan Analysis** — PaddleOCR with per-line confidence and bounding boxes; fields, thickness readings and sign-off extracted by layout rules (**no LLM-generated values**); click any value to see its source on the page.
* ✅ **Engineering Validation** — Recomputes corrosion rate, remaining life and margin to t-min from the raw readings, flags implausible values and domain errors (e.g. a design code OCR'd as "Sec. VII" instead of "VIII"), even when OCR confidence is high.
* ✍️ **Audited Corrections** — Engineers correct OCR mistakes; each correction stores who, the original value, the new value and why, and is re-validated. Nothing is overwritten.
* 📤 **Scan → Agent Hand-off** — Validated findings are sent to the agent with corrected and unconfirmed values clearly marked; the exact agent input is visible to the user.
* 🧠 **Six-Stage Agent Workflow** — Understand → Plan → Retrieve → Reason → Validate → Generate, streamed live.
* 🔎 **Access-Controlled RAG** — Every indexed chunk carries its owner and visibility; the filter runs inside Qdrant, so text a user may not read never reaches the model. Results are diversified so duplicates can't crowd out SOPs.
* 👨‍💼 **Review & Sign-Off** — Review queue; approve, reject, or edit-then-sign; **managers and admins only**, and **nobody signs off a run they started**.
* 📜 **Activity Log** — Role-scoped audit events, per-run traces (model/tool and measured duration per step), CSV export for compliance.
* 🗂️ **Document Vault** — Server-backed document list with live index counts and audited deletion (file, index chunks and record).
* 🧪 **Code Sandbox** — Hardened Docker execution with pytest; AI code generation with a dedicated coding model, grounded in private references and repaired until its tests pass; engineer-reviewed calculation examples.
* 🤖 **Model Registry & Router** — Live model status from the GPU (loaded, VRAM, quantisation), routing per task with honest fallback reasons, admin registration of installed models.
* 📝 **DOCX Generation** — Approval notes with readable file names and a system-written run-details table.
* 📊 **Security Center** — Live runtime network and security measurements, including the currently active reasoning model read from the model registry.

---

# Architecture

```text
                         ┌─────────────────────────┐
                         │       SOVARA UI         │
                         │  Next.js + TypeScript   │
                         └────────────┬────────────┘
                                      │ JWT
                                      ▼
                         ┌─────────────────────────┐
                         │       FastAPI API       │
                         │ Auth · RBAC · Sign-off  │
                         └──┬─────────┬─────────┬──┘
                            │         │         │
             ┌──────────────┘         │         └──────────────┐
             ▼                        ▼                        ▼
   ┌──────────────────┐    ┌─────────────────────┐   ┌──────────────────┐
   │  Scan Analysis   │    │   LangGraph Agent   │   │  Docker Sandbox  │
   │ PaddleOCR +      │    │ Understand · Plan   │   │ No network ·     │
   │ rule extraction +│───▶│ Retrieve · Reason   │   │ non-root · pytest│
   │ validation       │    │ Validate · Generate │   └──────────────────┘
   └──────────────────┘    └───┬─────────────┬───┘
                               │             │
                               ▼             ▼
                 ┌──────────────────┐   ┌──────────────────────────┐
                 │      Qdrant      │   │ Model Router + Registry  │
                 │ Access-filtered  │   │ (models.yaml + live      │
                 │ private RAG      │   │  Ollama status)          │
                 └──────────────────┘   └────────────┬─────────────┘
                                                     ▼
                                        ┌──────────────────────────┐
                                        │   Ollama (local GPU)     │
                                        │ qwen3:8b · qwen2.5-coder │
                                        │ :7b · nomic-embed-text   │
                                        └──────────────────────────┘

        ┌──────────────────────────┐     ┌──────────────────────────┐
        │       PostgreSQL         │     │      python-docx         │
        │ Users · Documents ·      │     │  Approval notes (DOCX)   │
        │ Audit log                │     └──────────────────────────┘
        └──────────────────────────┘
```

More detail: [`docs/architecture.md`](docs/architecture.md).

---

# Agent Workflow

SOVARA uses a six-stage LangGraph workflow to structure AI reasoning.

| Stage          | Purpose                                                                          |
| -------------- | -------------------------------------------------------------------------------- |
| **Understand** | Interprets the user's request and identifies the task                            |
| **Plan**       | Determines the steps and information required                                    |
| **Retrieve**   | Searches the private knowledge base — only documents the requesting user may read |
| **Reason**     | Performs evidence-based reasoning using retrieved context                        |
| **Validate**   | Checks the generated result against available evidence and workflow requirements |
| **Generate**   | Produces the approval note and a DOCX deliverable                                |

This structured workflow is intended to make the AI process more controlled and traceable than a single unrestricted model call. In testing, the Validate stage has reliably flagged claims not explicitly supported by retrieved context (e.g. cited code references that weren't actually present in the source document), surfacing them for a human reviewer rather than presenting them as fact.

Every run is traced: each step records its model or tool, a detail (e.g. "3 chunks", the generated file name) and its measured duration. If retrieval fails, the failure is recorded in the trace instead of the run silently continuing without context. The model's hidden "thinking" is only enabled for the Reason step, which roughly halved run time.

---

# Technology Stack

| Layer                   | Technology                                                         |
| ----------------------- | ------------------------------------------------------------------ |
| **Frontend**            | Next.js 16, React 19, TypeScript, Tailwind CSS, IBM Plex fonts, CodeMirror 6 (bundled, no CDN) |
| **Backend**             | FastAPI, Python 3.11, SQLAlchemy                                    |
| **Agent Orchestration** | LangGraph                                                          |
| **LLM Serving**         | Ollama (vLLM is the planned production server)                     |
| **Vector Database**     | Qdrant                                                             |
| **Database**            | PostgreSQL                                                         |
| **OCR**                 | PaddleOCR                                                          |
| **PDF Processing**      | PyMuPDF                                                            |
| **Authentication**      | JWT, python-jose, passlib/bcrypt                                   |
| **Sandbox**             | Docker, custom offline image (`python:3.11-slim` + pinned pytest)  |
| **Document Generation** | python-docx                                                        |

---

# Local Model Architecture

SOVARA separates model responsibilities according to the task.

| Model                  | Role                                          |
| ---------------------- | --------------------------------------------- |
| **qwen3:8b**           | Reasoning, analysis, approval notes (agent)   |
| **qwen2.5-coder:7b**   | Code generation in the Code Sandbox           |
| **nomic-embed-text**   | Document embeddings                           |
| *Vision model (optional)* | Visual document understanding — supported by the registry, not demonstrated |

```bash
ollama pull qwen3:8b
ollama pull qwen2.5-coder:7b
ollama pull nomic-embed-text
```

Models are declared in the registry (`backend/app/config/models.yaml`). A model counts as available only if it is **enabled in the registry and actually installed** in the local Ollama server (checked live). If no model for a task is available, the router falls back along an explicit chain (e.g. coding → reasoning) and **states the reason** in the UI; a capability with no usable model at all (e.g. vision today) is reported as unavailable rather than silently served by the wrong model. Admins can register installed models from the Model Registry page; models that can't chat (embedding models) or lack image input for vision are refused.

### Tested hardware and performance

| Component | Spec |
| --- | --- |
| Laptop | HP Victus 15 |
| GPU | NVIDIA RTX 5050 Laptop GPU, 8 GB VRAM |
| CPU / RAM | AMD Ryzen 7 260 · 24 GB |

* qwen3:8b runs at **100% GPU, ~47 tokens/s**, 8k context, ~6.2 GB VRAM.
* A full six-step agent run takes **~70 s** (down from 126 s after runtime tuning).
* 14B models exceed 8 GB VRAM and are disabled in the registry; only one 7–8B model is resident at a time.

Runtime settings (environment overrides): `SOVARA_NUM_CTX` (default 8192 — Ollama's own default of 4096 silently truncated long prompts), `SOVARA_KEEP_ALIVE` (default `30m`).

---

# Security Architecture

SOVARA is designed around a local-first and controlled-execution architecture.

### Authentication

Protected API routes require a valid JWT:

```text
Authorization: Bearer <token>
```

Tokens expire after 60 minutes. The frontend automatically clears an expired/invalid token and returns the user to the login screen on a 401 response.

### Roles and Access

Roles: **admin, manager, engineer, employee**. Self-registration creates an `engineer`-level account; there is no client-controllable path to higher privileges. Roles are changed only by the server operator (`manage_users.py`), and every change is audited; the last admin can't be demoted.

| Action | Who |
| --- | --- |
| See all documents and activity | managers, admins |
| Run / generate code, correct scan values | engineers, managers, admins |
| Sign off approval notes | managers, admins — never on a run they started |
| Reload / register models | managers (reload), admins (register) |

### Access-Controlled Retrieval

Every indexed chunk stores `owner_id`, `document_id` and `visibility`. Uploads are **private** by default (owner, managers, admins); reference SOPs are **shared**. The access filter is applied **inside Qdrant**, so restricted chunks never reach the backend or the model. Search requires the requesting user's identity — a caller that doesn't provide it fails instead of searching everything.

### Fail-Closed Audit

Agent runs, sandbox runs, corrections, sign-offs, deletions, registry changes and exports are **refused if the audit record can't be written**. Prompts, code and document text are stored as SHA-256 hashes, not copied into the audit log. Audit rows are never modified; older events are displayed with derived values instead of being rewritten.

### Network-Isolated Sandbox

The Docker sandbox:

* Executes Python code in an isolated container with **network disabled**
* Runs as a **non-root** user with **all Linux capabilities dropped** and `no-new-privileges`
* Uses a **read-only root filesystem** (small `/tmp` only)
* Applies memory, CPU, process (64) and output limits and a hard **15-second timeout**
* Allows at most 2 concurrent runs
* **Never pulls images at run time** — the sandbox image must already be loaded locally

The project's security validation checks that outbound access fails inside the sandbox (DNS resolution and direct-IP connections), that the process runs as uid 65534, and that the root filesystem is read-only.

### Input and Output Safety

Size limits on all inputs; path traversal blocked for uploads and generated notes (only server-issued file names resolve); YAML written with safe serialisation; CSV exports neutralise spreadsheet formulas (`=`, `+`, `-`, `@`).

### Runtime Network Visibility

The Security Center obtains network information from runtime measurements of the backend process (via `netstat`) rather than displaying hardcoded placeholder values. This includes the currently active reasoning model, read live from the model registry.

These measurements provide visibility into the application's observed network connections; they should not be interpreted as a formal proof of every packet leaving an entire organizational network.

### Development Database Configuration

The included Docker configuration contains development-oriented PostgreSQL settings.

For example:

```text
POSTGRES_HOST_AUTH_METHOD=trust
```

This configuration is intended for local development and **must not be deployed unchanged to production**.

Production deployment should use:

* Strong database authentication
* Strong secrets
* Appropriate network controls
* Restricted container permissions
* Proper secret management
* Organization-approved infrastructure policies

---

# Human-in-the-Loop Governance

SOVARA is designed so that AI-generated work does not automatically become the final business output.

```text
AI Processing
     ↓
Evidence-Based Output (DRAFT)
     ↓
Review queue (managers / admins)
     ↓
┌───────────┬────────────────────┬──────────┐
│  Approve  │ Edit, then sign off│  Reject  │
└───────────┴────────────────────┴──────────┘
     ↓
Decision recorded in the audit trail
```

* **Segregation of duties:** whoever started a run can't sign it off; the starter is taken from the audit trail, not from the browser.
* **One decision per run**, never overwritten; concurrent reviewers can't both sign.
* Reviewers see the note, its citations and the run's trace; the decision (with an optional comment) appears in the Activity Log.

---

# Document Intelligence

Users can upload documents such as PDF files, scanned reports, images, SOPs and technical documents.

```text
Document Upload
      ↓
PDF / Image Processing
      ↓
OCR (PaddleOCR) — vision model fallback when available
      ↓
Text Chunking
      ↓
Embedding Generation
      ↓
Qdrant Indexing (private to the uploader)
      ↓
Retrieval During Agent Execution (access-filtered)
```

Indexing happens automatically at upload time. Documents can be deleted from the Document Vault by their owner, managers or admins; deletion removes the file, its index chunks and its record, and is audited.

For **inspection reports**, Scan Analysis adds structured extraction on top of OCR: report fields, the thickness-reading table and sign-off are paired by layout, each value linked to its source line with its OCR confidence, then checked by engineering rules. The current extraction schema covers pressure-vessel visual and UT thickness inspection reports.

---

# DOCX Deliverables

SOVARA generates real `.docx` approval notes using `python-docx`. Each note has a readable file name (e.g. `Approval_Note_V-301-Inspection-Report_20260927-150408_92552a60.docx`) and a **run-details table written by SOVARA, not by the model**: status (draft pending sign-off), run ID, requested by, generation time, model and source document. The model is instructed not to write signature or date placeholders.

---

# Screenshots

> Add real screenshots to `docs/screenshots/` and update the filenames below before submission — the paths below are placeholders and will not render until the images exist in the repo.

### Scan Analysis

![SOVARA Scan Analysis](docs/screenshots/scan.png)

### Agent Workspace

![SOVARA Agent Workspace](docs/screenshots/chat.png)

### Review & Sign-Off

![SOVARA Review Panel](docs/screenshots/review.png)

### Activity Log

![SOVARA Activity Log](docs/screenshots/activity.png)

### Security Center

![SOVARA Security Center](docs/screenshots/security.png)

---

# Demo

The full SIH demo script — setup, warm-up order, a 7-minute click path, fallbacks and honest answers to likely judge questions — is in [`docs/DEMO.md`](docs/DEMO.md).

```text
1. Wi-Fi off → Security Center
      ↓
2. Scan Analysis: V-301 report, source highlighting, domain check, live correction
      ↓
3. Send findings to the agent → six-stage run on the local GPU
      ↓
4. Approval note with citations → engineer can't sign own run
      ↓
5. Manager signs off from the review queue
      ↓
6. Activity Log: full chain + trace + CSV export
      ↓
7. Code Sandbox: reviewed remaining-life calculation → Verified
      ↓
8. Model Registry → Security Center: zero outbound connections
```

The sample inspection report used in the demo is synthetic and marked as such.

---

# Prerequisites

Before running SOVARA locally, install:

* **Python 3.11**
* **Node.js**
* **Docker Desktop**
* **Ollama**
* **Git**

An NVIDIA GPU with **8 GB+ VRAM** is recommended.

> **Python version:** Python 3.11 is recommended for the current PaddleOCR/PaddlePaddle environment used by the project. Newer Python versions (e.g. 3.14) do not yet have compatible PaddlePaddle wheels available.

You can verify your installations:

```bash
python --version
node --version
docker --version
ollama --version
git --version
```

---

# Installation

## 1. Clone the Repository

```bash
git clone https://github.com/Chandrakant1210/SOVARA-AI.git
cd SOVARA-AI
```

---

## 2. Configure Environment Variables

Create a `.env` file at the repository root (see `.env.example`):

```env
POSTGRES_USER=sovara
POSTGRES_PASSWORD=change_this_password
POSTGRES_DB=sovara_db
DATABASE_URL=postgresql://sovara:change_this_password@localhost:5432/sovara_db
SECRET_KEY=generate_a_strong_random_secret
```

### Important

Never commit a real `.env` file containing production credentials or secrets — it is already excluded via `.gitignore`.

The backend requires:

```text
DATABASE_URL
SECRET_KEY
```

before startup. It will fail to start (rather than silently using an insecure default) if either is missing — this is intentional.

---

## 3. Start Infrastructure

Start PostgreSQL and Qdrant:

```bash
docker compose up -d postgres qdrant
```

Verify the containers:

```bash
docker ps
```

You should see the PostgreSQL and Qdrant services running.

> **Windows note:** if a pre-existing PostgreSQL installation on your machine is already using port `5432`, the Docker container will start but every connection will silently route to the wrong server, producing confusing "password authentication failed" errors even with correct credentials. Run `netstat -ano | findstr :5432` to check for a conflicting process before troubleshooting further.

---

## 4. Pull Local Models (one-time, while online)

```bash
ollama pull qwen3:8b
ollama pull qwen2.5-coder:7b
ollama pull nomic-embed-text
```

Verify:

```bash
ollama list
```

---

## 5. Build the Sandbox Image (one-time, while online)

```bash
docker build -t sovara-sandbox:py311 backend/sandbox
```

The sandbox never downloads images at run time. For an air-gapped server, transfer the image as a file: `docker save sovara-sandbox:py311 -o sovara-sandbox.tar` on a connected machine, then `docker load -i sovara-sandbox.tar` on the server.

---

## 6. Backend Setup

Navigate to the backend:

```bash
cd backend
```

Create a virtual environment:

### Windows

```bash
python -m venv venv
venv\Scripts\activate
```

### macOS / Linux

```bash
python3 -m venv venv
source venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

> Always run `pip freeze > requirements.txt` **with the virtual environment activated**. Running it against a global/inactive Python environment produces a broken, near-empty requirements file that silently omits most dependencies.

Initialize the database:

```bash
python init_db.py
```

The initialization script creates the required application tables.

---

## 7. Index the Knowledge Base

SOVARA includes sample SOP documents for testing the retrieval pipeline. Index them as **shared** reference material:

```bash
python ingest_sop_docs.py
```

This is safe to re-run (each SOP's previous chunks are replaced, not duplicated). Uploaded documents are indexed automatically, privately to their uploader.

To rebuild the whole index with correct ownership (e.g. after upgrading from a version without access control):

```bash
python reindex_rag.py --yes
```

---

## 8. Start the Backend

```bash
uvicorn app.main:app --port 8000
```

The API will be available at `http://localhost:8000`; FastAPI documentation at `http://localhost:8000/docs`.

---

## 9. Start the Frontend

Open a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. For demos, a production build is faster: `npm run build` then `npm run start`.

---

## 10. Users and Roles

New self-registered accounts are engineers. Assign other roles from the server (with the backend venv active):

```bash
python manage_users.py list
python manage_users.py set-role someone@example.com manager
python manage_users.py set-role admin@example.com admin
```

A sign-off demo needs at least one **engineer** (who runs the agent) and one **manager** (who signs off).

---

# First Run

### 1. Create an account

On the login screen, select **New here? Create an account** and register. New accounts are engineers.

### 2. Analyse a scan

Open **Scan Analysis**, upload a scanned inspection report, and review the extracted fields, readings and validation checks. Correct any OCR mistakes with ✎.

### 3. Send findings to the agent

Click **Send findings to agent**, review the task in **AI Assistant**, and press **Ask**. The six stages show live progress.

### 4. Sign off

As a **manager** (a different account), open **Review & Sign-Off**, open the run from the review queue, and approve, edit-then-sign, or reject.

### 5. Check the trail

Open **Activity Log** to see the whole chain, click the run for its trace, and export CSV.

### 6. Other tools

* **Document Vault** — manage uploads and their index state.
* **Code Sandbox** — run code in the isolated container; load a reviewed example or generate code with the coding model.
* **Model Registry** — see which model serves which task and what's loaded on the GPU.
* **Security Center** — live runtime network measurements.

---

# Operator Tools

| Command (from `backend/`, venv active) | Purpose |
| --- | --- |
| `python manage_users.py list` / `set-role EMAIL ROLE` | Manage roles (audited; the last admin can't be demoted) |
| `python ingest_sop_docs.py` | Load shared SOPs without duplicates |
| `python reindex_rag.py --yes` | Rebuild the vector index with ownership and visibility (audited) |

Environment overrides: `SOVARA_NUM_CTX` (default `8192`), `SOVARA_KEEP_ALIVE` (default `30m`), `SANDBOX_IMAGE` (default `sovara-sandbox:py311`).

---

# Project Structure

```text
SOVARA-AI/
│
├── backend/
│   ├── app/
│   │   ├── agent/            # LangGraph state and six-node agent graph
│   │   ├── api/              # FastAPI routers
│   │   │                     #   auth, chat, documents, retrieve, agent, security,
│   │   │                     #   sandbox, review, registry, audit
│   │   ├── core/             # Configuration, database, JWT security and dependencies
│   │   ├── config/           # Model registry (models.yaml)
│   │   ├── models/           # SQLAlchemy models (users, documents, audit log)
│   │   └── services/         # OCR, scan extraction, embeddings, Qdrant, model router,
│   │                         #   sandbox, audit and DOCX services
│   │
│   ├── sandbox/Dockerfile    # Offline sandbox image (python:3.11-slim + pytest)
│   ├── sample_docs/          # Sample SOP documents (shared knowledge base)
│   ├── requirements.txt
│   ├── init_db.py
│   ├── ingest_sop_docs.py
│   ├── reindex_rag.py        # Operator: rebuild index with access control
│   └── manage_users.py       # Operator: audited role changes
│
├── frontend/
│   └── src/
│       ├── app/              # Next.js routes (landing page, console)
│       ├── components/       # Chat, Scan Analysis, Documents, Review, Code Sandbox,
│       │                     #   Model Registry, Activity Log, Security and UI components
│       └── lib/              # api.ts, AuthContext.tsx, ThemeContext.tsx
│
├── docs/
│   ├── architecture.md
│   └── DEMO.md               # SIH demo script
│
├── docker-compose.yml
├── .env.example
└── README.md
```

> Note: a real `.env` file (never committed) is required at the repository root — see [Configure Environment Variables](#2-configure-environment-variables) above.

---

# Testing

The project can be tested through the FastAPI documentation at `http://localhost:8000/docs`. Important areas to validate:

### Authentication and Roles

* Registration, login, JWT expiry handling, unauthorized route protection
* Engineers can't sign off; nobody can sign off their own run
* Role changes only via `manage_users.py`, and audited

### Scan Analysis

* OCR confidence and source boxes; extracted fields and readings
* Validation checks (recomputed rate and remaining life, t-min margin, implausible readings)
* Corrections are audited, re-validated, and never overwrite the original

### Retrieval

* An engineer retrieves shared SOPs and only their own uploads
* Managers and admins retrieve all documents
* Duplicate uploads don't crowd out SOP chunks

### Agent Workflow

* Six stages, per-step trace with measured durations
* Retrieval failures appear in the trace
* Findings hand-off links the run to its source document

### Sandbox

* Network isolation, non-root user, read-only filesystem, resource limits, timeout
* pytest summaries; generation repair loop stops after 3 attempts and never claims "verified" on failure

### Review and Audit

* Review queue, approve / edit-then-sign / reject, one decision per run
* Activity Log scope by role, run traces, CSV export (formula-safe)

### Security Center

* Runtime network measurements and the active model from the registry

---

# Implementation Status

## Implemented

* Local Ollama-based AI inference with a live, task-based model router and registry UI
* Access-controlled Qdrant retrieval, automatic indexing on upload, audited document deletion
* PostgreSQL persistence
* OCR-based ingestion and rule-based Scan Analysis with engineering validation and audited corrections
* Scan → agent findings hand-off
* LangGraph agent workflow (all six stages) with per-step audit traces
* JWT authentication with auto-redirect on token expiry; role-based access; operator role management
* Review queue and sign-off with segregation of duties
* Activity Log with run traces and CSV export
* Hardened Docker sandbox with pytest, grounded code generation with a repair loop, reviewed examples
* DOCX approval notes with system-written run details
* Security Center with live network measurements and dynamic active-model display
* Fail-closed audit logging

## Planned / Extendable

* Encryption of stored uploads and generated notes at rest
* Security Center event history and per-run network measurement
* vLLM serving and larger models on server GPUs
* Vision-model analysis of drawings and P&IDs (the registry supports it; not demonstrated)
* Sharing a private document with specific colleagues
* Additional sandbox runtimes (beyond Python)
* Automated test suite and CI
* Expanded enterprise authentication and production deployment hardening

---

# Known Limitations

* OCR accuracy depends on document/image quality; Scan Analysis currently has one extraction schema (pressure-vessel inspection reports).
* A 7–8B local model can produce weak engineering logic; AI-generated code is only marked "Verified" when its own tests pass in the sandbox, which doesn't prove the engineering is correct (stated in the UI).
* The Docker sandbox currently supports Python execution only.
* Signatures on scanned reports can't be verified by OCR and are always marked for visual check.
* The scan-audit de-duplication and OCR page cache are in memory and reset when the backend restarts.
* The included Docker configuration is intended for local development rather than production deployment.
* Hardware requirements vary depending on the selected local AI models; 14B models need more than 8 GB VRAM.

---

# Development Notes

For local development, it is recommended to run the project from a normal local directory rather than a cloud-synchronized folder, for example `C:\Projects\SOVARA-AI`, rather than a continuously synchronized directory (e.g. inside OneDrive/Dropbox). Cloud sync can interfere with the Python virtual environment, cause files to be silently evicted from local disk, and trigger unstable reload loops in development servers.

If port `5432` is already occupied by another PostgreSQL installation, Docker PostgreSQL may fail to start, or connections may silently route to the wrong server. On Windows:

```bash
netstat -ano | findstr :5432
```

After merging a pull request, start new work on a fresh branch from `main`; commits pushed to an already-merged branch don't reach `main`.

---

# Security Considerations

SOVARA is designed with security and data control as first-class architectural concerns.

```text
Local AI inference
       +
Access-controlled private retrieval
       +
JWT authentication + role-based access
       +
Segregation-of-duties sign-off
       +
Hardened, network-disabled sandbox
       +
Fail-closed audit trail
       +
Human approval
```

The system is intended to provide a foundation for controlled AI-assisted industrial knowledge work.

A production deployment would still require organization-specific security review, infrastructure hardening, network policies, access controls, monitoring, backup policies, and compliance validation.

---

# Why SOVARA?

SOVARA is designed around a simple principle:

> **Confidential industrial knowledge should be processed in an environment where the organization maintains control over its data, models, and execution infrastructure.**

Instead of treating AI as a remote chatbot, SOVARA approaches AI as a **controlled reasoning workbench**.

```text
Private Knowledge
       ↓
Local AI
       ↓
Structured Reasoning
       ↓
Evidence
       ↓
Human Review
       ↓
Business Deliverable
```

---

# Smart India Hackathon 2026

**Competition:** Smart India Hackathon 2026

**Organization:** Mangalore Refinery and Petrochemicals Limited (MRPL)

**Problem Statement:** PS-26117

**Solution:** SOVARA AI — Sovereign AI Reasoning Assistant

The project focuses on enabling AI-assisted confidential industrial knowledge work using a local-first, controlled, and human-reviewed architecture.

---

# Team

### Chandrakant Kumar

**Architecture, Backend & AI, RAG, Security, Frontend**

### Aditi Sharma

**Backend & AI, Agent, Frontend**

### Aman Kumar Yadav

**Documentation & Presentation**

### Khushi Kumari

**Documentation & Presentation Lead**

---

# License

This project is licensed under the **MIT License** — see the [`LICENSE`](LICENSE) file for full terms.

---

# Final Vision

**SOVARA AI**

> **Sovereign Intelligence for Confidential Industry.**

A local-first AI reasoning workbench designed to bring modern agentic AI capabilities into environments where **data control, security, evidence, and human oversight matter.**