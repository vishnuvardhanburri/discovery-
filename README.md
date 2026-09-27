# XAVIRA — Technical Intelligence Pipeline

XAVIRA is a high-precision engineering intelligence engine designed to identify critical technical opportunities and the specific owners responsible for them. Unlike generic lead generation, XAVIRA operates as a **Technical Research Tool**, moving from public signal discovery to evidence-backed human outreach.

## 🚀 Core Architecture

The system follows a strict, evidence-bound pipeline to eliminate hallucinations and pseudo-signals:

`PUBLIC SOURCE` $\rightarrow$ `EVIDENCE` $\rightarrow$ `QUALIFIED SIGNAL` $\rightarrow$ `CORRELATION` $\rightarrow$ `OPPORTUNITY` $\rightarrow$ `VERIFIED OWNER` $\rightarrow$ `CONTACTABILITY` $\rightarrow$ `OUTREACH PACKAGE` $\rightarrow$ `MANUAL OUTREACH CARD`

### Key Intelligence Engines

- **Owner Intelligence Engine**: A target-driven "hunt" process that differentiates between nominal owners (e.g., VPs) and actual technical owners (e.g., Staff Infrastructure Engineers) using a multi-source fallback chain.
- **Outreach Intelligence Engine**: Transforms research into a validated communication package. 
  - **ClaimLedger**: Maps every sentence in an email to a specific `SOURCE_FACT`.
  - **OutreachClaimValidator**: A hard gate that blocks any output containing unsupported factual assertions.
  - **EvidencePackBuilder**: Prunes research to the "Smallest Defensible Set" for high-signal, low-noise communication.

## 🛠 Human Outreach Mode

XAVIRA is designed for **Human-in-the-Loop** operation. It does not send emails automatically. Instead, it generates a **Manual Outreach Card**:

- **Target Intelligence**: Verified role, company, and technical alignment.
- **Validated Drafts**: A primary high-precision email and a low-friction backup variant.
- **Briefing Notes**: A summary of the evidence and the specific "angle" for the outreach.
- **Reply Evidence Pack**: A pre-constructed technical payload ready to be sent if the prospect asks, "Can you send me what you found?".

## 🧪 Technical Invariants

1. **Evidence-Bound Generation**: Generation creates language, not facts. All technical claims must map to a `SOURCE_FACT` or `XAVIRA_OBSERVATION`.
2. **Zero-Guessing Policy**: Contacts are only marked as "Verified" if evidence exists; no guessed emails are promoted.
3. **Engineer-to-Engineer Tone**: Strict ban on marketing fluff ("revolutionary", "game-changing", "10x").

## 💻 Getting Started

### Installation
```bash
npm install
```

### Running the Intelligence Pipeline
```bash
npm run dev
```

### Running Tests
```bash
npm test
```
