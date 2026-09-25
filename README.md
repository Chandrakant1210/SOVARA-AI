# SOVARA AI — Sovereign AI Reasoning Assistant

**On-Premise, Air-Gap-Ready Multi-Model Agentic AI Workbench for Confidential Industrial Work**

**Smart India Hackathon 2026 · Problem Statement PS-26117 · Mangalore Refinery and Petrochemicals Limited (MRPL)**

> **Intelligence designed to stay within your controlled infrastructure.**

---

## Overview

SOVARA AI is an **on-premise AI reasoning workbench** designed for confidential industrial knowledge work such as inspection reports, Standard Operating Procedures (SOPs), engineering documents, maintenance records, and operational documentation.

Instead of functioning as a simple chatbot, SOVARA is designed as an **AI teammate with a structured reasoning workflow**. It can ingest private documents, retrieve relevant information, execute multi-step reasoning, validate outputs, and generate business-ready deliverables under human review.

The architecture is built around **local AI inference, private document retrieval, controlled execution, authentication, audit logging, and human-in-the-loop approval**.

### Core Workflow

```text
Login
  ↓
Upload Document
  ↓
OCR / Vision Extraction
  ↓
Document Indexing
  ↓
Ask SOVARA
  ↓
Understand
  ↓
Plan
  ↓
Retrieve
  ↓
Reason
  ↓
Validate
  ↓
Generate
  ↓
Human Review
  ↓
Approve / Modify / Reject
  ↓
DOCX Deliverable
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

SOVARA AI addresses this problem by providing a **local-first AI workbench** where document processing, retrieval, embeddings, AI inference, reasoning, and business-document generation can operate within the organization's controlled infrastructure.

---

# Solution

SOVARA combines several capabilities into one controlled AI workspace:

* Local LLM inference through **Ollama**
* Private document retrieval using **Qdrant**
* Multi-step agent orchestration using **LangGraph**
* OCR and document processing using **PaddleOCR and PyMuPDF**
* Local PostgreSQL persistence
* Network-isolated Docker sandbox execution
* JWT-based authentication
* Audit logging
* Human-in-the-loop review
* Automated DOCX document generation
* Runtime security and network visibility

The objective is not simply to provide an AI chatbot, but to create a **controlled reasoning environment for confidential industrial knowledge work**.

---

# Key Features

* 🔒 **Local-First AI Inference** — AI inference can run locally through Ollama.
* 📄 **Document Intelligence** — Process PDFs, scanned reports, and images.
* 🔎 **Private RAG** — Retrieve relevant information from locally indexed documents. Documents are automatically chunked and indexed at upload time, so newly uploaded material is searchable immediately.
* 🧠 **Six-Stage Agent Workflow** — Understand → Plan → Retrieve → Reason → Validate → Generate.
* 🤖 **Multi-Model Architecture** — Supports separate local models for reasoning, embeddings, and optional vision processing, selected via a config-driven model registry.
* 👁️ **OCR & Vision Processing** — Extract information from scanned and visual documents.
* 🛡️ **JWT Authentication** — Protected API routes with token-based authentication.
* 👥 **Role Control** — Self-registration creates engineer-level accounts without client-side admin privilege escalation.
* 🧪 **Network-Isolated Sandbox** — Docker-based Python execution with network isolation and resource limits.
* 👨‍💼 **Human-in-the-Loop Review** — Generated outputs can be approved, modified, or rejected.
* 📝 **DOCX Generation** — Generate structured business deliverables.
* 📊 **Security Center** — Provides live runtime network and security measurements, including the currently active reasoning model, read directly from the model registry rather than hardcoded.
* 📜 **Audit Logging** — Records relevant system activity for traceability.

---

# Architecture

```text
                         ┌─────────────────────────┐
                         │       SOVARA UI         │
                         │  Next.js + TypeScript   │
                         └────────────┬────────────┘
                                      │
                                      ▼
                         ┌─────────────────────────┐
                         │       FastAPI API       │
                         │ Authentication + APIs   │
                         └────────────┬────────────┘
                                      │
                                      ▼
                         ┌─────────────────────────┐
                         │     LangGraph Agent     │
                         │                         │
                         │ Understand               │
                         │ Plan                    │
                         │ Retrieve                │
                         │ Reason                  │
                         │ Validate                │
                         │ Generate                │
                         └──────┬─────────┬────────┘
                                │         │
                  ┌─────────────┘         └─────────────┐
                  ▼                                     ▼
        ┌──────────────────┐                   ┌──────────────────┐
        │      Qdrant      │                   │      Ollama      │
        │   Private RAG    │                   │   Local Models   │
        └────────┬─────────┘                   └──────────────────┘
                 │
                 ▼
        ┌──────────────────┐
        │  Private Docs    │
        │ PDFs / Images /  │
        │ SOPs / Reports   │
        └────────┬─────────┘
                 │
                 ▼
        ┌──────────────────┐
        │ OCR / Vision     │
        │ PaddleOCR /      │
        │ Local Vision     │
        └──────────────────┘


        ┌──────────────────┐       ┌──────────────────┐
        │   PostgreSQL     │       │ Docker Sandbox   │
        │ Users / Docs /   │       │ Network-Isolated │
        │ Audit Logs       │       │ Python Execution │
        └──────────────────┘       └──────────────────┘
```

---

# Agent Workflow

SOVARA uses a six-stage LangGraph workflow to structure AI reasoning.

| Stage          | Purpose                                                                          |
| -------------- | -------------------------------------------------------------------------------- |
| **Understand** | Interprets the user's request and identifies the task                            |
| **Plan**       | Determines the steps and information required                                    |
| **Retrieve**   | Searches the private document knowledge base                                     |
| **Reason**     | Performs evidence-based reasoning using retrieved context                        |
| **Validate**   | Checks the generated result against available evidence and workflow requirements |
| **Generate**   | Produces the final response or business deliverable                              |

This structured workflow is intended to make the AI process more controlled and traceable than a single unrestricted model call. In testing, the Validate stage has reliably flagged claims not explicitly supported by retrieved context (e.g. cited code references that weren't actually present in the source document), surfacing them for a human reviewer rather than presenting them as fact.

---

# Technology Stack

| Layer                   | Technology                                           |
| ----------------------- | ---------------------------------------------------- |
| **Frontend**            | Next.js 16, TypeScript, Tailwind CSS, IBM Plex fonts |
| **Backend**             | FastAPI, Python                                      |
| **Agent Orchestration** | LangGraph                                            |
| **LLM Serving**         | Ollama                                               |
| **Vector Database**     | Qdrant                                               |
| **Database**            | PostgreSQL                                           |
| **OCR**                 | PaddleOCR                                            |
| **PDF Processing**      | PyMuPDF                                              |
| **Vision Processing**   | Local vision model through Ollama                    |
| **Authentication**      | JWT, python-jose, passlib/bcrypt                     |
| **Sandbox**             | Docker                                               |
| **Document Generation** | python-docx                                          |

---

# Local Model Architecture

SOVARA separates model responsibilities according to the task.

| Model                     | Role                              |
| ------------------------- | --------------------------------- |
| **Qwen3:8B**              | Reasoning and response generation |
| **nomic-embed-text**      | Document embeddings               |
| **Optional vision model** | Visual document understanding     |

The current default configuration uses:

```bash
ollama pull qwen3:8b
ollama pull nomic-embed-text
```

Additional local models can be configured through the project's model registry (`backend/app/config/models.yaml`) according to available hardware and integration support. Each model's `available` flag reflects whether it has actually been pulled on the running machine — the registry deliberately fails loudly (rather than silently falling back) if a capability is requested with no available model, to avoid ever calling a model that isn't actually installed.

For example, higher-capacity reasoning or vision models can be added when the deployment environment provides sufficient resources.

---

# Security Architecture

SOVARA is designed around a local-first and controlled-execution architecture.

### Authentication

Protected API routes require a valid JWT:

```text
Authorization: Bearer <token>
```

Tokens expire after 60 minutes. The frontend automatically clears an expired/invalid token and returns the user to the login screen on a 401 response.

Self-registration creates an `engineer`-level account. There is no client-controllable registration path that grants administrator privileges.

### Network-Isolated Sandbox

The Docker sandbox:

* Executes Python code in an isolated container
* Has network access disabled
* Applies memory and CPU limits
* Uses a hard execution timeout
* Prevents unrestricted code execution from reaching external services

The project's security validation includes checking that DNS/network resolution fails inside the isolated sandbox — confirmed by attempting an outbound HTTP request from within the sandbox and observing a `socket.gaierror` (name resolution failure), not just a generic connection error.

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

The workflow is:

```text
AI Processing
     ↓
Evidence-Based Output
     ↓
Human Review
     ↓
┌───────────┬────────────┬──────────┐
│  Approve  │   Modify   │  Reject  │
└───────────┴────────────┴──────────┘
     ↓
Final Deliverable
```

This provides a review checkpoint before generated documents are treated as finalized business deliverables. "Modify" lets a reviewer directly edit the generated text before it's finalized as a DOCX, without re-running the agent.

---

# Document Intelligence

Users can upload documents such as:

* PDF files
* Scanned reports
* Images
* SOPs
* Technical documents

The processing workflow is:

```text
Document Upload
      ↓
PDF / Image Processing
      ↓
OCR / Vision Extraction
      ↓
Text Chunking
      ↓
Embedding Generation
      ↓
Qdrant Indexing
      ↓
Retrieval During Agent Execution
```

Indexing happens automatically at upload time — there is no separate manual step required. Once indexed, the document's content can immediately be retrieved when answering user questions, including questions asked in the same session right after upload.

---

# DOCX Deliverables

SOVARA can generate real `.docx` business deliverables using `python-docx`.

The generated output is intended to transform AI-assisted reasoning into a structured document that can be reviewed by a human before approval.

---

# Screenshots

> Add real screenshots to `docs/screenshots/` and update the filenames below before submission — the paths below are placeholders and will not render until the images exist in the repo.

### Agent Workspace

![SOVARA Agent Workspace](docs/screenshots/chat.png)

### Document Intelligence

![SOVARA Document Processing](docs/screenshots/documents.png)

### Agent Workflow

![SOVARA Agent Workflow](docs/screenshots/agent.png)

### Human Review

![SOVARA Review Panel](docs/screenshots/review.png)

### Security Center

![SOVARA Security Center](docs/screenshots/security.png)

---

# Demo

The recommended demonstration flow is:

```text
1. Login
      ↓
2. Upload confidential document
      ↓
3. OCR / Vision extraction
      ↓
4. Document indexing
      ↓
5. Ask a question
      ↓
6. Watch the six-stage agent workflow
      ↓
7. Retrieve supporting information
      ↓
8. Generate grounded response
      ↓
9. Review output
      ↓
10. Approve / Modify / Reject
      ↓
11. Generate DOCX deliverable
      ↓
12. Inspect Security Center
```

---

# Prerequisites

Before running SOVARA locally, install:

* **Python 3.11**
* **Node.js**
* **Docker Desktop**
* **Ollama**
* **Git**

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

Create a `.env` file at the repository root:

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

# 3. Start Infrastructure

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

# 4. Pull Local Models

Install the default reasoning and embedding models:

```bash
ollama pull qwen3:8b
ollama pull nomic-embed-text
```

Verify:

```bash
ollama list
```

---

# 5. Backend Setup

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

# 6. Index Sample Documents

SOVARA includes sample SOP documents for testing the retrieval pipeline.

Run:

```bash
python ingest_sop_docs.py
```

This indexes the sample documents into Qdrant.

This step is optional if you plan to upload your own documents — uploaded documents are indexed automatically as part of the upload process.

---

# 7. Start the Backend

Run:

```bash
uvicorn app.main:app --port 8000
```

The API will be available at:

```text
http://localhost:8000
```

FastAPI documentation:

```text
http://localhost:8000/docs
```

The API documentation exposes the available backend endpoints, including authentication, chat, documents, retrieval, agent execution, security, sandbox, and review functionality.

---

# 8. Start the Frontend

Open a separate terminal.

Navigate to the frontend:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

---

# First Run

After starting the backend and frontend:

### 1. Create an account

On the login screen, select:

```text
New here? Create an account
```

Register with an email and password.

New self-registered accounts are created with the `engineer` role.

---

### 2. Open Chat

After authentication, navigate to the Chat interface.

You can use one of the example prompts or ask a question related to the indexed sample SOP documents.

Example:

> What is the bearing temperature limit for pump maintenance?

---

### 3. Upload a Document

Open the **Documents** section.

Upload:

* PDF
* scanned report
* image
* technical document

The document is processed (OCR/vision extraction) and automatically indexed for retrieval — no separate indexing step is needed.

---

### 4. Run an Agent Task

Ask SOVARA a question related to the uploaded or indexed documents.

The agent executes the six-stage workflow, with live progress shown in the UI as each stage completes:

```text
Understand
    ↓
Plan
    ↓
Retrieve
    ↓
Reason
    ↓
Validate
    ↓
Generate
```

---

### 5. Review the Result

Open the **Review** section.

The generated result can be:

* Approved
* Modified
* Rejected

---

### 6. Generate the Deliverable

After review, SOVARA produces the final `.docx` deliverable.

---

### 7. Inspect Security Center

The Security Center provides live runtime security information, including observed network measurements from the backend process and the currently active reasoning model.

---

# Project Structure

```text
SOVARA-AI/
│
├── backend/
│   ├── app/
│   │   ├── agent/
│   │   │   └── # LangGraph state and six-node agent graph
│   │   │
│   │   ├── api/
│   │   │   └── # FastAPI routers
│   │   │      ├── auth
│   │   │      ├── chat
│   │   │      ├── documents
│   │   │      ├── retrieve
│   │   │      ├── agent
│   │   │      ├── security
│   │   │      ├── sandbox
│   │   │      └── review
│   │   │
│   │   ├── core/
│   │   │   └── # Configuration, database, JWT security and dependencies
│   │   │
│   │   ├── config/
│   │   │   └── # Model registry and configuration
│   │   │
│   │   ├── models/
│   │   │   └── # SQLAlchemy database models
│   │   │
│   │   └── services/
│   │       └── # OCR, embeddings, Qdrant, sandbox and DOCX services
│   │
│   ├── sample_docs/
│   │   └── # Sample SOP documents
│   │
│   ├── requirements.txt
│   ├── init_db.py
│   └── ingest_sop_docs.py
│
├── frontend/
│   └── src/
│       ├── app/
│       │   └── # Next.js application routes
│       │
│       ├── components/
│       │   └── # Chat, Documents, Review, Security and UI components
│       │
│       └── lib/
│           ├── api.ts
│           └── AuthContext.tsx
│
├── docker-compose.yml
└── README.md
```

> Note: a real `.env` file (never committed) is required at the repository root — see [Configure Environment Variables](#2-configure-environment-variables) above.

---

# Testing

The project can be tested through the FastAPI documentation:

```text
http://localhost:8000/docs
```

Important areas to validate include:

### Authentication

* User registration
* Login
* JWT authentication
* Expired token handling
* Unauthorized route protection

### Document Processing

* PDF upload
* Image/scanned document processing
* OCR extraction
* Document indexing
* Retrieval

### Agent Workflow

* Understand
* Plan
* Retrieve
* Reason
* Validate
* Generate

### Sandbox

* Python execution
* Network isolation
* Resource limits
* Execution timeout

### Review Workflow

* Approve
* Modify
* Reject

### Security Center

* Runtime network measurements
* Backend connection visibility
* Active model reflects the real registry state

---

# Implementation Status

## Implemented

The current project includes:

* Local Ollama-based AI inference
* Qdrant-based document retrieval, with automatic indexing on upload
* PostgreSQL persistence
* OCR-based document ingestion
* LangGraph agent workflow (all six stages)
* JWT authentication with auto-redirect on token expiry
* Engineer-level self-registration with no client-side privilege escalation path
* Docker-based sandbox with verified network isolation
* Human review workflow (Approve / Modify / Reject)
* DOCX generation
* Security Center with live network measurements and dynamic active-model display
* Audit logging

## Planned / Extendable

Potential future extensions include:

* Additional local LLM providers
* More advanced vision models
* Per-document RAG management (viewing/removing individual indexed documents)
* Document deletion and re-indexing controls
* Additional sandbox runtimes (beyond Python)
* Expanded enterprise authentication
* Production-grade deployment and infrastructure hardening

---

# Known Limitations

* OCR and vision accuracy depends on document/image quality.
* The Docker sandbox currently supports Python execution only.
* There is currently no complete per-document management/deletion interface for the RAG index — uploaded documents remain indexed indefinitely.
* The included Docker configuration is intended for local development rather than production deployment.
* Hardware requirements vary depending on the selected local AI models.

---

# Development Notes

For local development, it is recommended to run the project from a normal local directory rather than a cloud-synchronized folder.

For example:

```text
C:\Projects\SOVARA-AI
```

rather than a continuously synchronized directory (e.g. inside OneDrive/Dropbox). Cloud sync can interfere with the Python virtual environment, cause files to be silently evicted from local disk, and trigger unstable reload loops in development servers.

If port `5432` is already occupied by another PostgreSQL installation, Docker PostgreSQL may fail to start, or connections may silently route to the wrong server.

On Windows, the following command can help identify the process using the port:

```bash
netstat -ano | findstr :5432
```

---

# Security Considerations

SOVARA is designed with security and data control as first-class architectural concerns.

The current implementation includes:

```text
Local AI inference
       +
Private vector retrieval
       +
JWT authentication
       +
Role restrictions
       +
Network-isolated sandbox
       +
Resource limits
       +
Audit logging
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
