# ⚡ DevAgent: Local Agentic AI Developer

> **Powered by Langchain + LM Studio.** A high-performance, local-first agentic developer that plans, scaffolds, and implements full-stack applications with architectural integrity.

---

## 🚀 Key Features

*   **🧠 Langchain-Powered Brain**: Advanced orchestration using the Langchain framework for complex reasoning and state management.
*   **🗺️ Action Roadmaps**: Before writing code, the agent generates a high-level architectural plan (Roadmap) using a specialized Planner system.
*   **🔄 Multi-Agent Workflow**: Autonomous transition between **Developer Mode** (Implementation) and **Reviewer Mode** (Rigorous Audit).
*   **📦 Dynamic Scaffolding**: Support for multiple stacks: `Express API`, `Vue App`, `MEAN Stack`, and `Healthcare APIs`.
*   **🛠️ Robust Toolset**: Surgical file editing with `replace_in_file`, `bulk_write`, and `blueprint` application.
*   **💻 100% Local**: Optimized for **LM Studio**. No API keys required, no data leaves your machine.

---

## 🛠️ Quick Start (Recommended)

1.  **Prerequisites**:
    *   [Node.js](https://nodejs.org) (v20 or v22 Recommended)
    *   [LM Studio](https://lmstudio.ai) (Load `openai/gpt-oss-20b` or similar)
2.  **Initialize**:
    *   Open LM Studio → **Local Server** (Port 1234)
    *   Double-click **`start.bat`** (Installs dependencies and launches the app)
3.  **Future Starts**:
    *   Use **`dev.bat`** for instant launch.

---

## 🏗️ Architecture

DevAgent uses a specialized **ReAct (Reasoning + Acting)** loop enhanced by Langchain.

### 1. Planning Layer
Every new task starts with the **Langchain Planner**. It analyzes your objective and injects an `[ACTION ROADMAP]` into the conversation to ensure consistent file naming and modularity.

### 2. Implementation Layer (Developer)
The Developer agent follows the Roadmap using surgical file tools to implement logic, styling, and tests.

### 3. Audit Layer (Reviewer)
The Reviewer agent performs a **file-by-file audit**, cross-matching the code against the original `walkthrough.md` plan. It looks for security holes, architectural flaws, and incomplete functions.

---

## 🧰 Agent Toolset

| Category | Tools | Purpose |
| :--- | :--- | :--- |
| **Project** | `scaffold_project` | Generate complex boilerplates (Express, Vue, MEAN). |
| **Surgical** | `replace_in_file` | Precise code updates using regex/text blocks. |
| **Filesystem**| `read_file`, `write_file`, `list_files`, `bulk_read` | Standard I/O operations. |
| **Advanced** | `apply_blueprint`, `bulk_write` | Massive structural changes in a single step. |
| **Workflow** | `request_review`, `order_fix` | Autonomous handoff between Dev and Review agents. |

---

## ⚙️ Configuration

Located in `server/.env`:

```env
LM_STUDIO_BASE_URL=http://localhost:1234
LM_STUDIO_MODEL=openai/gpt-oss-20b  # Or your loaded model
WORKSPACE_DIR=./workspace           # Main directory for agent projects
PORT=3000                           # Express Server Port
```

---

## 📂 Project Structure

```bash
devagent/
├── server/
│   ├── src/
│   │   ├── agent/
│   │   │   ├── core.js        # The ReAct Loop & Agent State
│   │   │   ├── langchain.js   # Langchain Orchestration Layer
│   │   │   └── agents/        # Specialized Multi-Agent Personas
│   │   └── tools/             # Low-level Filesystem & Scaffolding logic
├── client/
│   └── src/
│       └── App.vue            # Modern SSE-powered Chat Interface
└── workspace/                 # Your generated projects live here
```

---

## 📄 License
MIT
