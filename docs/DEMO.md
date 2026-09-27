# SOVARA AI — SIH 2026 Demo Script (PS-26117, MRPL)

**Goal:** show one confidential inspection report travelling through SOVARA end to end —
scan → human-corrected findings → local agent → approval note → manager sign-off → audit trail —
**with the laptop's Wi-Fi switched off the whole time.**

Total time: about 7 minutes plus questions.

---

## 1. Setup (the day before, then again 30 minutes before judging)

### Machine
- Laptop: Victus 15 · RTX 5050 8 GB · 24 GB RAM (qwen3:8b measured at 100% GPU, ~47 tokens/s).
- Plug in the charger (GPU performance drops on battery).
- Windows: turn on **Do Not Disturb**; close other apps and browser tabs.
- Browser zoom 110% so judges can read the screen.

### Start the services (in this order)
1. **Docker Desktop** → PostgreSQL and Qdrant containers running.
2. **Ollama** running (`ollama list` shows `qwen3:8b`, `qwen2.5-coder:7b`, `nomic-embed-text`).
3. **Backend:** from `backend` with the venv active, start uvicorn as usual.
4. **Frontend:** use a production build for the demo (faster, no dev overlay, no double requests):
   ```powershell
   cd frontend
   npm run build
   npm run start
   ```
   Rehearse with this build at least once; if the build fails, fall back to `npm run dev`.

### Accounts (two browser windows side by side)
| Window | Account | Role | Used for |
|---|---|---|---|
| Normal window | `test@gmail.com` | engineer | scan, corrections, agent run |
| Incognito window | `aditi@gmail.com` | manager | review queue, sign-off, Activity Log |
| (only if asked) | `test3@gmail.com` | admin | Model Registry registration |

Log in to both windows **before** judging starts.

### Data state (check in Document Vault / Review)
- Document Vault (as test): exactly one `V-301_Inspection_Report_SAMPLE_scanned.pdf` (8 chunks, Indexed).
- Scan Analysis: design code already shows **corrected** (OCR read "ASME Sec.VIIDiv.1").
- Review queue (as Aditi): sign off or reject any old test runs so the queue is clean.

### Warm-up (last 10 minutes before judging) — order matters
Only one model fits in 8 GB VRAM; the last model used stays loaded for 30 minutes.
1. **Code Sandbox:** Load reviewed example → Run (warms the Docker sandbox).
2. **Scan Analysis:** open the V-301 report once (fills the OCR cache).
3. **AI Assistant:** run one short question (loads **qwen3:8b last**, so the agent never cold-starts on stage).
4. Check `ollama ps`: `qwen3:8b · 100% GPU · CONTEXT 8192 · UNTIL ~30 minutes`.

### Go offline
- **Turn Wi-Fi off (Airplane mode)** before the judges arrive. Everything above runs locally.

---

## 2. The demo (about 7 minutes)

### 0. Opening — 20 s
> "Refineries can't send P&IDs, inspection reports or vendor data to cloud AI. SOVARA is an AI workbench
> that runs entirely inside the plant: local models, private knowledge, human sign-off and a full audit trail.
> This laptop's Wi-Fi is off right now — everything you'll see is running on it."

Show the Airplane-mode icon.

### 1. Security Center — 30 s
Open **Security Center** (as test).
> "These are live measurements from the machine, not labels: outbound connections, external calls, sandbox network state."

### 2. Scan Analysis — 1 min 30 s
Open **Scan Analysis** → V-301 report.
- Hover a field → the source line lights up on the scan. "Every value shows where it came from and how sure OCR was."
- **Design code:** "OCR read *VII* instead of *VIII*. The confidence was still high — 0.86 — but a domain rule caught it
  because Section VII isn't a pressure-vessel code. A person corrected it; the original and the correction are both kept."
- **Validation checks:** "SOVARA recomputes the corrosion rate and remaining life from the raw readings and confirms the
  report's own figures: 0.33 mm per year, 1.8 years."
- **Live correction:** click ✎ on **CML-04**, set location `Shell course 2, 3 o'clock`, reason `checked against scan`, save.
  "The flag clears, and the correction is recorded with my name."
- CML-06 stays flagged: "Only 0.6 mm above t-min — that's a real finding, and corrections don't hide findings."

### 3. Send findings to the agent — 1 min 30 s
Click **Send findings to agent** → AI Assistant.
- Expand **"Show the exact text the agent will receive."** "Corrected values are marked with who corrected them;
  unconfirmed values are marked as such, so the model can't present them as facts."
- Press **Ask**. While it runs (~60 s), point at the **Agent Plan** panel:
  > "Six steps on the local GPU: understand, plan, retrieve from our private SOPs — filtered by my access rights —
  > reason, validate, and generate a Word approval note."

### 4. The result — 30 s
- Pills: **Local model – qwen3:8b**, **Based on V-301…**, **sources cited**.
- The note cites the report, the corrected design code, CML-06's 0.6 mm margin, and recommends next actions.
- Click **Open draft in Sign-Off** → the Decision box is **locked**:
  > "I'm an engineer and I started this run. SOVARA enforces segregation of duties: I can't approve my own note."

### 5. Manager sign-off — 45 s
Switch to the **Aditi (manager)** window → **Review & Sign-Off**.
- Queue shows the new run **pending** · "1 awaiting you". Open it; the citations are shown.
- Comment: `Approved; schedule UT grid scan at N3` → **Approve and sign**.
- "Approved and signed · by aditi · time."

### 6. Activity Log — 45 s
Still as Aditi → **Activity Log**.
- The chain: *Analysed V-301 → Corrected … CML-04 → Generated Approval_Note_V-301… → Signed off*.
- Click the run → trace with per-step model, chunk count and measured durations, ending **Sign-off · approved · aditi**.
- **Export CSV:** "Exportable for compliance — and the export itself is logged."

### 7. Code Sandbox — 45 s
As test → **Code Sandbox**.
- **Load reviewed example → Corrosion rate & remaining life (V-301 CML-06)** → **Run** → **5 passed · Verified**.
  > "Calculations run in a locked container: no network, non-root, read-only filesystem, 15-second limit.
  > This re-checks the report's remaining life independently."
- If time allows: "AI-generated code goes through the same sandbox, and SOVARA refuses to call it verified unless its tests pass."

### 8. Model Registry — 20 s
> "Which local model does which task, measured live from the GPU. Adding a model is one registry entry —
> the coding model here was added that way, with no code change."

### 9. Close — 15 s
Back to **Security Center**:
> "Scan, correction, AI analysis, sign-off and audit — with zero outbound connections, on one laptop, Wi-Fi off the whole time.
> Intelligence that never leaves your walls."

---

## 3. If something goes wrong

| Problem | What to do |
|---|---|
| Agent run is slow or fails | Show the previous approved run in **Review** and its trace in **Activity Log**; say the run is still processing. |
| A page shows an error | Refresh once. If it persists, switch to the **backup video** at the matching point. |
| Scan page is slow | It's OCR on first open; the warm-up normally prevents this. Talk through the fields while it loads. |
| Laptop problem | Play the backup video from the start. |

Record the backup video during the final rehearsal (full screen, Wi-Fi off, same script).

---

## 4. Likely judge questions — honest answers

**Why not use a cloud API with a contract?**
Because the documents themselves (P&IDs, inspection data, vendor terms) must not leave the plant. SOVARA runs models,
retrieval, OCR and code execution locally; Wi-Fi was off during this demo.

**How do you know nothing leaves the machine?**
Security Center shows live connection measurements from the operating system, and the demo ran with Wi-Fi off.
In deployment, the host firewall blocks outbound traffic and the code sandbox has no network at all.

**What if the model hallucinates?**
Four layers: values come from OCR with confidence and domain checks, not from the model; the agent only gets
validated findings plus access-filtered SOP chunks and cites them; generated code must pass tests in the sandbox;
and nothing is final until a manager signs it off.

**Can an employee see a manager's confidential documents through the AI?**
No. Every indexed chunk carries its owner and visibility; the search filter runs inside the vector database,
so restricted text never reaches the model.

**Why a small 8B model?**
It runs fully on this laptop's 8 GB GPU at ~47 tokens/s. The model registry is pluggable: on plant servers with
larger GPUs, bigger models are one registry entry, and the router picks them up.

**Can it read P&IDs and drawings?**
The architecture supports a vision model (Qwen2.5-VL) through the same registry; it fits this GPU but isn't part of
today's demo. We don't claim reliable P&ID understanding yet.

**Is the AI-generated code trustworthy?**
Only after it passes in the sandbox — and even then we state that tests written by the model don't prove the
engineering. Reviewed calculation scripts, like the one shown, are the trusted path.

**What isn't finished?**
Encryption of stored files at rest, Security Center event history, and a larger automated test suite. We've kept
those out of scope for the prototype rather than show them half-done.

---

## 5. One-minute explanation (for the opening or a quick judge)

> "SOVARA AI is a sovereign AI workbench for confidential industrial work. Instead of sending inspection reports or
> drawings to cloud AI, it runs open-weight models on the organisation's own hardware. It reads scanned reports with
> OCR, checks every value against engineering rules, and lets engineers correct what OCR got wrong. An agent then
> drafts an approval note grounded in the plant's own SOPs — searching only documents the user may see. A manager
> signs it off; the engineer can't approve their own work. Every step is recorded in an exportable audit trail, and
> the whole workflow runs with no network connection."