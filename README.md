# ⚡ DevAgent

Agentic AI developer for **Node.js + Express.js + Vue.js**, powered by your local **LM Studio** instance.

## Quick Start (Windows)

1. Install [Node.js](https://nodejs.org) >= 18
2. Open **LM Studio** → load `openai/gpt-oss-20b` → enable **Local Server** on port 1234
3. Double-click **`start.bat`** — installs everything and opens the app
4. Next time use **`dev.bat`** to launch instantly

## Manual Start

```bash
# Install all dependencies
npm run install:all

# Start both servers
npm run dev

# Open browser
http://localhost:5173
```

## Configuration

Edit `server/.env` (auto-created from `.env.example` on first run):

```env
LM_STUDIO_BASE_URL=http://localhost:1234
LM_STUDIO_MODEL=openai/gpt-oss-20b
PORT=3000
CLIENT_URL=http://localhost:5173
WORKSPACE_DIR=./workspace
```

## API Endpoint Used

```
POST http://localhost:1234/api/v1/chat
{ "model": "...", "system_prompt": "...", "input": "..." }
```

## Agent Tools

| Tool | What it does |
|------|-------------|
| `read_file` | Read an existing file |
| `write_file` | Create or overwrite a file |
| `list_files` | Browse the workspace |
| `scaffold_project` | Generate express-api / vue-app / fullstack structure |

All files are written to `server/workspace/`.

## Project Structure

```
devagent/
├── start.bat                   ← First-time setup + launch
├── dev.bat                     ← Quick launch (after install)
├── package.json
├── server/
│   ├── .env.example
│   ├── package.json
│   ├── workspace/              ← Agent writes files here
│   └── src/
│       ├── index.js            ← Express entry point
│       ├── agent/
│       │   └── core.js         ← ReAct loop + LM Studio calls
│       ├── routes/
│       │   ├── agent.js        ← POST /api/agent/run  (SSE)
│       │   └── files.js        ← GET/POST /api/files
│       └── tools/
│           ├── filesystem.js   ← read / write / list
│           └── scaffolder.js   ← project templates
└── client/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── main.js
        ├── App.vue             ← Full chat UI
        └── assets/
            └── styles.css
```
