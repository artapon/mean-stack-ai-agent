<template>
  <div class="app">

    <!-- ── Sidebar ──────────────────────────────────────────────────── -->
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="url(#lightning)" stroke="none"/>
            <defs>
              <linearGradient id="lightning" x1="3" y1="2" x2="21" y2="22" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="#7ab8ff"/>
                <stop offset="100%" stop-color="#3d8eff"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div>
          <div class="brand-name">DevAgent</div>
          <div class="brand-sub">AI Code Generator</div>
        </div>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-label">QUICK START</div>
        <nav class="nav">
          <button
            v-for="p in presets" :key="p.label"
            class="preset" :disabled="running"
            @click="send(p.prompt)"
          >
            <span class="preset-icon">{{ p.icon }}</span>
            <span class="preset-label">{{ p.label }}</span>
          </button>
        </nav>
      </div>

      <div class="sidebar-spacer"/>

      <div class="sidebar-footer">
        <div class="status-pill" :class="running ? 'running' : 'idle'">
          <span class="status-dot"></span>
          <span>{{ running ? 'Agent running' : 'Ready' }}</span>
        </div>
        <div class="lm-chip">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <circle cx="5" cy="5" r="4" stroke="#5b9cff" stroke-width="1.5"/>
            <circle cx="5" cy="5" r="2" fill="#5b9cff"/>
          </svg>
          <span>{{ lmEndpoint }}</span>
        </div>
        <button class="clear-btn" :disabled="running" @click="clearChat">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6M14 11v6"/>
          </svg>
          Clear chat
        </button>
      </div>
    </aside>

    <!-- ── File Browser Panel ─────────────────────────────────────────── -->
    <aside class="file-browser" :class="{ open: showBrowser }">
      <div class="fb-header">
        <div class="fb-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1-2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          Project Files
        </div>
        <div class="fb-actions">
          <button class="icon-btn" @click="loadFiles" :disabled="fbLoading" title="Refresh">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" :class="fbLoading ? 'spin-sm' : ''">
              <path v-if="!fbLoading" d="M23 4v6h-6M1 20v-6h6"/>
              <path v-if="!fbLoading" d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="fb-path-bar">
        <button class="fb-crumb home" @click="navigateTo('.')">🏠</button>
        <template v-for="(seg, i) in pathSegments" :key="i">
          <span class="fb-sep">›</span>
          <button class="fb-crumb" @click="navigateTo(pathSegments.slice(0, i+1).join('/'))">{{ seg }}</button>
        </template>
        <button
          class="fb-pin-btn"
          :class="{ pinned: targetFolder === currentPath }"
          @click="setTargetFolder(currentPath)"
          :title="targetFolder === currentPath ? 'Unpin target folder' : 'Pin as target folder'"
        >
          {{ targetFolder === currentPath ? '📌 Pinned' : '📌 Pin' }}
        </button>
      </div>

      <div v-if="fbError" class="fb-error">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        {{ fbError }}
      </div>

      <div class="fb-list" v-if="!fbLoading">
        <div v-if="currentPath !== '.'" class="fb-item fb-back" @click="goUp">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          ..
        </div>
        <div
          v-for="item in fbFolders" :key="item.name"
          class="fb-item fb-dir"
          @click="navigateTo(item.path)"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <span class="fb-name">{{ item.name }}</span>
        </div>
        <div
          v-for="item in fbFiles" :key="item.name"
          class="fb-item fb-file"
          @click="openFile(item)"
          :class="{ active: selectedFile?.path === item.path }"
        >
          <span class="fb-file-icon">{{ fileIcon(item.name) }}</span>
          <span class="fb-name">{{ item.name }}</span>
          <span class="fb-size">{{ fmtSize(item.size) }}</span>
        </div>
        <div v-if="!fbFolders.length && !fbFiles.length && currentPath !== '.'" class="fb-empty">
          Empty folder
        </div>
      </div>

      <div v-if="fbLoading" class="fb-loading">
        <div class="spin-sm green"></div> Loading…
      </div>

      <div v-if="selectedFile" class="fb-preview">
        <div class="fb-preview-header">
          <span class="fb-file-icon">{{ fileIcon(selectedFile.name) }}</span>
          <span class="fb-preview-name">{{ selectedFile.name }}</span>
          <button class="icon-btn" @click="selectedFile = null">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <pre class="fb-preview-code"><code>{{ fileContent }}</code></pre>
      </div>
    </aside>

    <!-- ── Main Chat ──────────────────────────────────────────────────── -->
    <main class="chat">

      <header class="chat-header">
        <div class="chat-header-left">
          <h1 class="chat-title">MEAN Stack Developer Agent</h1>
          <div class="chat-badge">
            <span class="badge-dot"></span>
            {{ lmModel }}
          </div>
        </div>
        <div class="chat-header-right">
          <div class="mode-toggle">
            <button class="mode-btn" :class="{ active: agentMode === 'generate' }" @click="agentMode = 'generate'">
              🛠 Generate
            </button>
            <button class="mode-btn" :class="{ active: agentMode === 'review' }" @click="agentMode = 'review'">
              🔍 Review
            </button>
          </div>
          <div class="header-sep"></div>
          <button v-if="running" class="btn-stop" @click="stop">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
            </svg>
            Stop
          </button>
          <button class="btn-outline" :disabled="browsing" @click="browseFolder">
            <span v-if="browsing" class="spin-sm" style="margin-right:4px"></span>
            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            {{ browsing ? 'Opening…' : 'Browse Folder' }}
          </button>
        </div>
      </header>

      <!-- Target folder bar -->
      <div v-if="targetFolder" class="target-bar">
        <div class="target-info">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          <code>{{ targetFolder === '.' ? 'workspace root' : targetFolder }}</code>
          <button class="target-clear" @click="targetFolder = null">✕</button>
        </div>
        <div class="workflow-toggle">
          <button 
            class="workflow-btn" 
            :class="{ active: agentWorkflow === 'update' }" 
            @click="agentWorkflow = 'update'"
            title="Update Existing Files"
          >
            Update Project
          </button>
          <button 
            class="workflow-btn" 
            :class="{ active: agentWorkflow === 'create' }" 
            @click="agentWorkflow = 'create'"
            title="Create New Project Structure"
          >
             New Project
          </button>
        </div>
      </div>

      <!-- Messages -->
      <div class="messages" ref="msgEl">

        <!-- Welcome screen -->
        <div v-if="!messages.length" class="welcome">
          <div class="welcome-glow"></div>
          <div class="welcome-orb">⚡</div>
          <h2 class="welcome-title">What do you want to build?</h2>
          <p class="welcome-sub">Describe your application and I'll generate every file directly into your workspace.</p>
          <div class="examples-grid">
            <button
              v-for="ex in examples" :key="ex.label"
              class="example-card"
              @click="send(ex.prompt)"
            >
              <span class="example-icon">{{ ex.icon }}</span>
              <span class="example-label">{{ ex.label }}</span>
              <span class="example-sub">{{ ex.sub }}</span>
            </button>
          </div>
        </div>

        <!-- Message list -->
        <div
          v-for="msg in messages" :key="msg.id"
          class="msg-wrap" :class="msg.role"
        >
          <div class="avatar" :class="msg.role">
            <span v-if="msg.role === 'user'">U</span>
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="url(#lg2)" stroke="none"/>
              <defs>
                <linearGradient id="lg2" x1="3" y1="2" x2="21" y2="22" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stop-color="#7ab8ff"/><stop offset="100%" stop-color="#3d8eff"/>
                </linearGradient>
              </defs>
            </svg>
          </div>

          <div class="msg-body">

            <!-- Activity cards -->
            <div v-if="msg.activity && msg.activity.length" class="activity-list">
              <div
                v-for="(a, i) in msg.activity" :key="i"
                class="act-card" :class="a.type"
              >
                <span class="act-icon">{{ actIcon(a) }}</span>
                <template v-if="a.type === 'thought'">
                  <details class="act-thought-details">
                    <summary class="act-summary">
                      <span class="act-thought-label">Agent Reasoning</span>
                      <span class="act-chevron">›</span>
                    </summary>
                    <div class="act-thought-content">{{ a.text }}</div>
                  </details>
                </template>
                <template v-else-if="a.type === 'tool'">
                  <span class="act-tool-name">{{ a.tool }}</span>
                  <span class="act-detail">{{ a.detail }}</span>
                  <span v-if="a.done" class="act-done">✓</span>
                  <div v-else-if="msg.streaming" class="spin-sm green act-spinner"></div>
                </template>
                <template v-else-if="a.type === 'error'">
                  <span class="act-error-text">{{ a.text }}</span>
                </template>
              </div>
            </div>

            <!-- Token stream (raw chunks while model is generating) -->
            <div v-if="msg.streaming && !msg.text && !msg.activity?.length" class="typing-card">
              <div class="typing-dots">
                <span></span><span></span><span></span>
              </div>
            </div>

            <!-- Response text (Use throttled 'display' field during streaming to prevent hangs) -->
            <div v-if="msg.text" class="msg-bubble-container">
              <div v-if="msg.role === 'assistant' && !msg.streaming" class="msg-header-actions">
                <button class="msg-copy-btn" title="Copy Message">Copy</button>
              </div>
              <div class="msg-bubble" :class="msg.role" v-html="md(msg.display || msg.text)"></div>
            </div>

            <!-- Status Indicator (for hidden tool calls / thoughts) -->
            <div v-if="msg.streaming && msg.status" class="msg-status">
              <span class="spin-sm gray"></span>
              {{ msg.status }}
            </div>

          </div>
        </div>

      </div>

      <!-- Input area -->
      <div class="input-area">
        <div class="input-wrapper">
          <textarea
            ref="inputEl"
            v-model="input"
            :disabled="running"
            placeholder="Describe what to build… (Enter to send, Shift+Enter for newline)"
            rows="1"
            @keydown.enter.exact.prevent="submit"
            @keydown.enter.shift.exact="input += '\n'"
            @input="resize"
          ></textarea>
          <button class="send-btn" :disabled="!input.trim() || running" @click="submit">
            <span v-if="running" class="spin-sm light"></span>
            <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
        <div class="input-hint">
          <span>Enter to send</span>
          <span>·</span>
          <span>Shift+Enter for newline</span>
          <span v-if="targetFolder">·</span>
          <span v-if="targetFolder" class="input-hint-target">📌 {{ targetFolder }}</span>
        </div>
      </div>

    </main>

  </div>
</template>

<script setup>
import { ref, nextTick, computed, onMounted, watch } from 'vue'

// ── Config ────────────────────────────────────────────────────────────────────
const lmEndpoint = ref('Loading...')
const lmModel    = ref('...')

// ── State ─────────────────────────────────────────────────────────────────────
const messages = ref([])
const input    = ref('')
const running  = ref(false)
const showBrowser = ref(true)
const msgEl    = ref(null)
const inputEl  = ref(null)
let   abort    = null

// ── File Browser State ────────────────────────────────────────────────────────
const fbLoading    = ref(false)
const fbError      = ref('')
const targetFolder = ref(null)
const browsing     = ref(false)
const agentMode    = ref('generate') // 'generate' or 'review'
const agentWorkflow = ref('update')  // 'update' or 'create'
const fbItems      = ref([])
const currentPath  = ref('.')
const selectedFile = ref(null)
const fileContent  = ref('')

function setTargetFolder(path) {
  targetFolder.value = path === targetFolder.value ? null : path
}

async function browseFolder() {
  browsing.value = true
  try {
    const res  = await fetch('/api/files/browse')
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      throw new Error(errBody.error || `Server Error: ${res.statusText} (${res.status})`)
    }
    const data = await res.json()
    if (data.path) {
      targetFolder.value = data.path
      currentPath.value  = data.path
      if (showBrowser.value) loadFiles()
    } else if (data.cancelled) {
      console.log('[Browse] Cancelled by user')
    }
  } catch (e) {
    console.error('[Browse Error]', e)
    alert('Failed to trigger folder picker: ' + e.message)
  } finally {
    browsing.value = false
  }
}

const fbFolders    = computed(() => fbItems.value.filter(i => i.type === 'directory'))
const fbFiles      = computed(() => fbItems.value.filter(i => i.type === 'file'))
const pathSegments = computed(() => currentPath.value === '.' ? [] : currentPath.value.split('/'))

async function loadFiles() {
  fbLoading.value    = true
  fbError.value      = ''
  selectedFile.value = null
  try {
    const res  = await fetch(`/api/files/list?path=${encodeURIComponent(currentPath.value)}`)
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    fbItems.value = (data.items || []).sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  } catch (e) {
    fbError.value = e.message
  } finally {
    fbLoading.value = false
  }
}

function navigateTo(p) {
  currentPath.value = p || '.'
  loadFiles()
}

function goUp() {
  const parts = currentPath.value.split('/')
  parts.pop()
  currentPath.value = parts.length ? parts.join('/') : '.'
  loadFiles()
}

async function openFile(item) {
  selectedFile.value = item
  fileContent.value  = 'Loading…'
  try {
    const res  = await fetch(`/api/files/read?path=${encodeURIComponent(item.path)}`)
    const data = await res.json()
    fileContent.value = data.content || data.error || ''
  } catch (e) {
    fileContent.value = `Error: ${e.message}`
  }
}

watch(showBrowser, (v) => { if (v && !fbItems.value.length) loadFiles() })

// ── Static data ───────────────────────────────────────────────────────────────
const presets = [
  { icon: '🏗', label: 'Fullstack app',   prompt: 'Scaffold a fullstack auth project called "my-app" with Express API and Vue frontend' },
  { icon: '🍃', label: 'Express + Mongo', prompt: 'Create an Express.js + MongoDB REST API with JWT auth called "api-service"' },
  { icon: '💚', label: 'Vue SPA',         prompt: 'Create a Vue 3 SPA with Pinia, Vue Router and Home, About, Dashboard pages' },
  { icon: '🔐', label: 'JWT Auth',        prompt: 'Add JWT authentication to my Express app — register, login and a protect middleware' },
  { icon: '🏥', label: 'Healthcare API',  prompt: 'Create a healthcare REST API with patient CRUD, JWT auth and Swagger docs' },
  { icon: '🛒', label: 'E-commerce API',  prompt: 'Build an e-commerce API with products, cart, and orders using Express + MongoDB' },
]

const examples = [
  { icon: '📦', label: 'Fullstack App',   sub: 'Express + Vue monorepo with auth',  prompt: 'Scaffold a fullstack project called "my-app" with Express API and Vue 3 frontend' },
  { icon: '🍃', label: 'REST API',        sub: 'Express + MongoDB + JWT',           prompt: 'Create an Express.js + MongoDB REST API with JWT authentication and Swagger docs' },
  { icon: '🎨', label: 'Vue Dashboard',   sub: 'Pinia + Router + Components',       prompt: 'Create a Vue 3 dashboard app with Pinia state management, routing and a metrics page' },
  { icon: '🏥', label: 'Healthcare API',  sub: 'Patients, visits, reports',         prompt: 'Create a healthcare REST API with patient CRUD, JWT auth and Swagger docs' },
]

// ── Send message ──────────────────────────────────────────────────────────────
async function send(text) {
  let msg = (text || input.value).trim()

  const tags = []
  if (targetFolder.value) tags.push(`[TARGET FOLDER: ${targetFolder.value}]`)
  if (agentMode.value)    tags.push(`[MODE: ${agentMode.value.toUpperCase()}]`)
  if (agentWorkflow.value) tags.push(`[WORKFLOW: ${agentWorkflow.value.toUpperCase()}]`)
  if (tags.length > 0 && msg) msg = `${tags.join(' ')} ${msg}`

  if (!msg || running.value) return
  input.value = ''
  await nextTick(); resize()

  messages.value.push({ id: uid(), role: 'user', text: msg })

  const assistant = { id: uid(), role: 'assistant', text: '', activity: [], streaming: true }
  messages.value.push(assistant)
  const idx = messages.value.length - 1

  running.value = true
  abort = new AbortController()
  await scrollDown()

  const history = messages.value
    .slice(0, idx)
    .filter(m => m.text)
    .map(m => ({ role: m.role, content: m.text }))

  try {
    const res = await fetch('/api/agent/run', {
      method  : 'POST',
      headers : { 'Content-Type': 'application/json' },
      body    : JSON.stringify({ messages: history }),
      signal  : abort.signal
    })

    const reader = res.body.getReader()
    const dec    = new TextDecoder()
    let   buf    = ''

      let lastScroll = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try { applyEvent(JSON.parse(line.slice(6)), idx); } catch { /* ignore */ }
        }
        
        // Optimize scrolling: update at most 10 times per second
        const now = Date.now();
        if (now - lastScroll > 100) {
          await scrollDown();
          lastScroll = now;
        }
      }
  } catch (err) {
    if (err.name !== 'AbortError') {
      messages.value[idx].text = `❌ ${err.message}`
    }
  } finally {
    messages.value[idx].streaming = false
    running.value = false
    abort = null
    await scrollDown()
    if (showBrowser.value) loadFiles()
  }
}

function submit() { send(input.value) }

async function stop() {
  if (abort) abort.abort()
  running.value = false
  try {
    await fetch('/api/agent/stop', { method: 'POST' })
  } catch (e) { console.warn('[Stop Error]', e) }
}

function clearChat() { messages.value = [] }

// ── SSE event handler ─────────────────────────────────────────────────────────
const WRITE_TOOLS = new Set(['write_file', 'replace_in_file', 'bulk_write', 'apply_blueprint', 'scaffold_project'])

function applyEvent(ev, idx) {
  const msg = messages.value[idx]
  if (!msg) return

  const inReview = agentMode.value === 'review'

  if (ev.type === 'thought') {
    msg.activity = [...msg.activity, { type: 'thought', text: ev.content }]
  } else if (ev.type === 'chunk') {
    msg.text = (msg.text || '') + ev.content
    msg.status = null 
    
    // THROTTLE UI UPDATES: Update display text at most every 150ms 
    // to prevent browser "hanging" on expensive Markdown re-renders.
    const now = Date.now()
    if (!msg._lastUpdate || now - msg._lastUpdate > 150) {
      msg.display = msg.text
      msg._lastUpdate = now
    }
  } else if (ev.type === 'status') {
    msg.status = ev.text
  } else if (ev.type === 'tool_call') {
    // In review mode, hide write-tool action cards — they're blocked server-side
    // and just create noise in the UI.
    if (inReview && WRITE_TOOLS.has(ev.tool)) return
    msg.activity = [...msg.activity, {
      type  : 'tool',
      tool  : ev.tool,
      detail: ev.parameters?.path || ev.parameters?.name || ev.parameters?.command || '',
      done  : false
    }]
  } else if (ev.type === 'tool_result') {
    const last = [...msg.activity].reverse().find(a => a.type === 'tool' && !a.done)
    if (last) last.done = true
  } else if (ev.type === 'tool_error') {
    // In review mode, suppress the "write tool is disabled" error cards — they're
    // an internal agent correction, not something the user needs to see.
    if (inReview && ev.tool && WRITE_TOOLS.has(ev.tool)) return
    msg.activity = [...msg.activity, { type: 'error', text: `${ev.tool}: ${ev.error}` }]
  } else if (ev.type === 'response') {
    // In review mode, append the summary instead of overwriting the detailed analysis
    if (inReview && msg.text && !msg.text.includes(ev.content)) {
      msg.text += '\n\n---\n\n' + ev.content
    } else {
      msg.text = ev.content
    }
    msg.display = msg.text // Final sync
    msg.status = null
  } else if (ev.type === 'error') {
    // Non-destructive error: Append the error to the message instead of wiping it.
    // This preserves thoughts/history that happened before the error.
    const errText = `\n\n❌ **API Error**: ${ev.message}`
    if (msg.text && !msg.text.includes(ev.message)) {
      msg.text += errText
    } else if (!msg.text) {
      msg.text = errText
    }
    msg.display = msg.text
    msg.status = null
  }

  messages.value[idx] = { ...msg }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2) }

function actIcon(a) {
  if (a.type === 'thought') return '💭'
  if (a.type === 'error')   return '⚠️'
  const icons = {
    read_file: '📖', write_file: '✍️', replace_in_file: '✂️', list_files: '📂',
    bulk_write: '📦', apply_blueprint: '🗂', scaffold_project: '🏗', bulk_read: '📚'
  }
  return icons[a.tool] || '🔧'
}

function fileIcon(name) {
  const ext = name.split('.').pop().toLowerCase()
  const icons = { js: '📜', ts: '📘', vue: '💚', json: '📋', md: '📝', css: '🎨', html: '🌐', sh: '⚙️', bat: '⚙️', env: '🔒', sql: '🗃' }
  return icons[ext] || '📄'
}

function fmtSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

function resize() {
  if (!inputEl.value) return
  inputEl.value.style.height = 'auto'
  inputEl.value.style.height = Math.min(inputEl.value.scrollHeight, 160) + 'px'
}

async function scrollDown() {
  await nextTick()
  if (msgEl.value) msgEl.value.scrollTop = msgEl.value.scrollHeight
}

async function loadHealth() {
  try {
    const res = await fetch('/api/health')
    const data = await res.json()
    if (data.model) lmModel.value = data.model.split('/').pop()
    if (data.endpoint) {
      const url = new URL(data.endpoint)
      lmEndpoint.value = url.host
    }
  } catch (e) {
    console.error('[Health Check Error]', e)
    lmEndpoint.value = 'localhost:1234'
    lmModel.value = 'gpt-oss-20b'
  }
}

onMounted(() => {
  loadHealth()
  loadFiles()

  // Global Copy Logic: Handles both Thought callouts and Full Message bubbles
  window.addEventListener('click', async (e) => {
    const btn = e.target.closest('.thought-copy, .msg-copy-btn');
    if (!btn) return;
    
    let textToCopy = '';
    
    if (btn.classList.contains('thought-copy')) {
      const container = btn.closest('.thought-container');
      textToCopy = container?.querySelector('.thought-content')?.innerText || '';
    } else if (btn.classList.contains('msg-copy-btn')) {
      const container = btn.closest('.msg-bubble-container');
      textToCopy = container?.querySelector('.msg-bubble')?.innerText || '';
    }

    if (!textToCopy) return;

    try {
      await navigator.clipboard.writeText(textToCopy);
      const original = btn.innerText;
      btn.innerText = 'Copied!';
      btn.classList.add('active');
      setTimeout(() => {
        btn.innerText = original;
        btn.classList.remove('active');
      }, 1500);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  });
})

// ── Markdown renderer ─────────────────────────────────────────────────────────
// ── Markdown renderer ─────────────────────────────────────────────────────────
function md(text) {
  if (!text) return '';
  
  // Handle Thought Callouts: wrap THOUGHT: ... blocks in a container
  let t = text.replace(/THOUGHT:\s*([\s\S]*?)(?=ACTION:|$)/gi, (match, content) => {
    if (!content.trim()) return '';
    return `
      <div class="thought-container">
        <div class="thought-section-header">
          <span class="thought-tag">THOUGHT</span>
          <button class="thought-copy" title="Copy Thought">Copy</button>
        </div>
        <div class="thought-ca">
          <div class="thought-content">${content.trim()}</div>
        </div>
      </div>
    `.trim();
  });

  // Escape HTML but preserve our newly added tags and valid markdown characters
  // We only escape < if it's not followed by / or one of our allowed tags
  t = t.replace(/&/g, '&amp;').replace(/<(?!(\/?(div|span|button|pre|code|h[1-6]|ul|li|p|br|strong|em|hr|table|tr|td|thead|tbody|blockquote)))/g, '&lt;');

  // Pre-process: Ensure block elements have double newlines for isolation
  t = t.replace(/([^\n])\n(#{1,6} |[-*] |\|)/g, '$1\n\n$2');

  // Code blocks: ```lang ... ```
  t = t.replace(/```(\w*)\n?([\s\S]*?)```/g,
    (_, lang, code) => `<pre class="code-block" data-lang="${lang || 'code'}"><code>${code.trim()}</code></pre>`);
  
  // Inline code: `code`
  t = t.replace(/`([^`]+)`/g, '<code class="ic">$1</code>');
  
  // Headers: # H1 to ###### H6
  t = t.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
  t = t.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
  t = t.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  t = t.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  t = t.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
  t = t.replace(/^# (.+)$/gm,   '<h1>$1</h1>');
  
  // Bold / Italic
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*(.+?)\*/g,    '<em>$1</em>');
  
  // Horizontal Rule
  t = t.replace(/^---$/gm, '<hr>');

  // List Items
  t = t.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  t = t.replace(/(<li>[\s\S]+?<\/li>)/g, (match) => {
    return `<ul class="md-list">${match}</ul>`.replace(/<\/ul>\s*<ul class="md-list">/g, '');
  });

  // Tables
  t = t.replace(/^\|(.+)\|$/gm, (row) => {
    if (row.includes('---')) return '';
    const cells = row.split('|').slice(1, -1).map(c => c.trim());
    return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
  });
  t = t.replace(/(<tr>[\s\S]+?<\/tr>)/g, (match) => {
    return `<div class="table-wrap"><table>${match}</table></div>`.replace(/<\/table><\/div>\s*<div class="table-wrap"><table>/g, '');
  });

  // Paragraph wrapping: split by double newlines and wrap non-block sections
  const sections = t.split(/\n\n+/);
  return sections.map(s => {
    const trimmed = s.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('<h') || trimmed.startsWith('<ul') || trimmed.startsWith('<pre') || 
        trimmed.startsWith('<div') || trimmed.startsWith('<hr')) {
      return trimmed;
    }
    return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
  }).join('');
}
</script>

<style>
:root {
  --bg: #0b0e14;
  --bg1: #11141b;
  --bg2: #161a23;
  --bg3: #1e232e;
  --bg4: #262c3a;
  
  --t0: #ffffff;
  --t1: #e2e8f0;
  --t2: #94a3b8;
  --t3: #64748b;
  
  --accent: #3b82f6;
  --accent-glow: rgba(59, 130, 246, 0.15);
  --accent-glow2: rgba(59, 130, 246, 0.08);
  
  --green: #10b981;
  --green-dim: rgba(16, 185, 129, 0.1);
  --red: #ef4444;
  --red-glow: rgba(239, 68, 68, 0.2);
  --yellow: #f59e0b;
  
  --border: #1e293b;
  --border2: #334155;
  --border3: #475569;
  
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.1);
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);
  --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05);
  
  --r: 12px;
  --r-sm: 8px;
  --mono: 'JetBrains Mono', monospace;
  --sans: 'Inter', sans-serif;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--sans);
  background: var(--bg);
  color: var(--t1);
  -webkit-font-smoothing: antialiased;
}

button {
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
  color: inherit;
}

textarea {
  font-family: inherit;
}

/* Animations */
@keyframes glow-pulse {
  0% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.1); }
  100% { opacity: 1; transform: scale(1); }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes slideIn {
  from { opacity: 0; transform: translateX(-4px); }
  to { opacity: 1; transform: translateX(0); }
}

.spin-sm {
  width: 12px; height: 12px;
  border: 2px solid rgba(255,255,255,.2);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>

<style scoped>
/* ── Layout ─────────────────────────────────────────────────────────────── */
.app {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--bg);
}

/* ── Sidebar ─────────────────────────────────────────────────────────────── */
.sidebar {
  width: 230px;
  min-width: 230px;
  background: var(--bg1);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 18px 16px;
  border-bottom: 1px solid var(--border);
}

.brand-icon {
  width: 38px; height: 38px;
  background: linear-gradient(135deg, #162a5e, #0e1d45);
  border: 1px solid #1e3574;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 0 12px rgba(91,156,255,.15);
}

.brand-name {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -.02em;
  color: var(--t0);
}
.brand-sub {
  font-size: 11px;
  color: var(--t2);
  margin-top: 1px;
  letter-spacing: .02em;
}

.sidebar-section { padding: 16px 12px 0; }

.sidebar-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .1em;
  color: var(--t3);
  padding: 0 6px;
  margin-bottom: 8px;
  text-transform: uppercase;
}

.nav { display: flex; flex-direction: column; gap: 2px; }

.preset {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--r-sm);
  width: 100%;
  text-align: left;
  color: var(--t1);
  font-size: 13px;
  transition: background .15s, color .15s;
  border: 1px solid transparent;
}
.preset:hover:not(:disabled) {
  background: var(--bg3);
  color: var(--t0);
  border-color: var(--border);
}
.preset:disabled { opacity: .35; cursor: default; }
.preset-icon { font-size: 14px; width: 20px; text-align: center; flex-shrink: 0; }
.preset-label { flex: 1; font-weight: 500; }

.sidebar-spacer { flex: 1; }

.sidebar-footer {
  padding: 16px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  align-self: flex-start;
  transition: all .3s;
}
.status-pill.idle    { background: var(--bg3);       border: 1px solid var(--border2); color: var(--t1); }
.status-pill.running { background: var(--green-dim); border: 1px solid var(--green);   color: var(--green); }

.status-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.status-pill.running .status-dot { animation: glow-pulse 1.4s ease-in-out infinite; }

.lm-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--t2);
  font-family: var(--mono);
}

.clear-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 10px;
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  color: var(--t2);
  font-size: 12px;
  transition: all .15s;
}
.clear-btn:hover:not(:disabled) {
  background: rgba(255,107,107,.07);
  border-color: rgba(255,107,107,.3);
  color: var(--red);
}
.clear-btn:disabled { opacity: .3; cursor: default; }

/* ── File Browser ─────────────────────────────────────────────────────────── */
.file-browser {
  width: 270px; min-width: 270px;
  background: var(--bg1);
  border-left: 1px solid var(--border);
  display: flex; flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
  order: 3;
}

.fb-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 14px 10px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.fb-title {
  display: flex; align-items: center; gap: 7px;
  font-size: 12px; font-weight: 600; color: var(--t1);
}
.fb-actions { display: flex; gap: 4px; }

.icon-btn {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  color: var(--t2);
  transition: all .15s;
}
.icon-btn:hover { background: var(--bg3); color: var(--t0); border-color: var(--border2); }
.icon-btn:disabled { opacity: .35; cursor: default; }

.fb-path-bar {
  display: flex; align-items: center; flex-wrap: wrap; gap: 2px;
  padding: 8px 12px;
  background: var(--bg2);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.fb-crumb {
  font-size: 11px; font-family: var(--mono);
  color: var(--accent); padding: 1px 4px; border-radius: 3px;
}
.fb-crumb:hover { background: var(--accent-glow2); }
.fb-crumb.home { font-size: 13px; }
.fb-sep { color: var(--t3); font-size: 11px; }

.fb-pin-btn {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 20px;
  font-size: 10px; font-weight: 600;
  border: 1px solid var(--border2);
  color: var(--t2);
  transition: all .15s;
}
.fb-pin-btn:hover, .fb-pin-btn.pinned {
  background: rgba(255, 209, 102, .08);
  border-color: rgba(255, 209, 102, .4);
  color: var(--yellow);
}

.fb-error {
  display: flex; align-items: center; gap: 7px;
  padding: 10px 14px;
  background: rgba(255,107,107,.06);
  border-bottom: 1px solid rgba(255,107,107,.15);
  font-size: 12px; color: var(--red);
}

.fb-list { flex: 1; overflow-y: auto; padding: 6px; }

.fb-item {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 10px; border-radius: var(--r-sm); cursor: pointer;
  font-size: 12px; color: var(--t1);
  transition: background .12s, color .12s;
}
.fb-item:hover { background: var(--bg3); color: var(--t0); }

.fb-back { color: var(--t2); }
.fb-dir .fb-name { font-weight: 500; color: var(--t0); }
.fb-file.active { background: var(--accent-glow2); border: 1px solid var(--border2); }

.fb-file-icon { font-size: 13px; flex-shrink: 0; }
.fb-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fb-size { color: var(--t3); font-family: var(--mono); font-size: 10px; }
.fb-empty { text-align: center; color: var(--t3); padding: 20px 10px; font-size: 12px; }

.fb-loading {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 20px; color: var(--t2); font-size: 12px;
}

.fb-preview {
  border-top: 1px solid var(--border);
  background: var(--bg);
  flex-shrink: 0;
  max-height: 280px;
  display: flex; flex-direction: column;
}
.fb-preview-header {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.fb-preview-name { flex: 1; font-size: 11px; font-weight: 500; color: var(--t1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fb-preview-code {
  overflow: auto; font-family: var(--mono); font-size: 11px;
  color: var(--t1); padding: 12px; line-height: 1.6;
  white-space: pre; flex: 1;
}

/* ── Main Chat Layout ─────────────────────────────────────────────────────── */
.chat {
  flex: 1; display: flex; flex-direction: column;
  overflow: hidden; min-width: 0; order: 2;
}

/* ── Chat Header ─────────────────────────────────────────────────────────── */
.chat-header {
  display: flex; align-items: center; justify-content: space-between;
  height: 56px; padding: 0 24px;
  background: var(--bg1);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.chat-header-left { display: flex; align-items: center; gap: 12px; }
.chat-header-right { display: flex; align-items: center; gap: 8px; }
.header-sep { width: 1px; height: 18px; background: var(--border2); margin: 0 4px; }

.chat-title {
  font-size: 15px; font-weight: 700; color: var(--t0);
  letter-spacing: -.02em;
}
.chat-badge {
  display: flex; align-items: center; gap: 6px;
  padding: 3px 10px;
  background: var(--bg3);
  border: 1px solid var(--border2);
  border-radius: 20px;
  font-size: 11px; font-weight: 500; color: var(--t1);
  font-family: var(--mono);
}
.badge-dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: var(--green);
  animation: glow-pulse 2s ease-in-out infinite;
}

.btn-stop {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 14px;
  background: rgba(255,107,107,.1);
  border: 1px solid rgba(255,107,107,.35);
  border-radius: var(--r-sm);
  color: var(--red); font-size: 12px; font-weight: 600;
  transition: all .15s;
}
.btn-stop:hover {
  background: rgba(255,107,107,.18);
  border-color: var(--red);
  box-shadow: 0 0 12px var(--red-glow);
}

.btn-outline {
  display: flex; align-items: center; gap: 7px;
  padding: 6px 13px;
  border: 1px solid var(--border2);
  border-radius: var(--r-sm);
  color: var(--t1); font-size: 12px; font-weight: 500;
  transition: all .15s;
}
.btn-outline:hover:not(:disabled), .btn-outline.active {
  background: var(--bg3); border-color: var(--border3); color: var(--t0);
}
.btn-outline:disabled { opacity: .4; cursor: not-allowed; }

/* ── Target bar ──────────────────────────────────────────────────────────── */
.target-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 24px;
  background: var(--bg2);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  gap: 16px;
  animation: fadeIn .2s ease;
}
.target-info {
  display: flex; align-items: center; gap: 8px;
  font-size: 12px; color: var(--t1); flex: 1; min-width: 0;
}
.target-info code {
  font-family: var(--mono); font-size: 11px; color: var(--yellow);
  background: rgba(255,209,102,.06); padding: 2px 8px;
  border-radius: 4px; border: 1px solid rgba(255,209,102,.15);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 300px;
}
.target-clear {
  color: var(--t3); font-size: 12px; padding: 2px 5px;
  border-radius: 3px; transition: color .15s;
}
.target-clear:hover { color: var(--red); }

.mode-toggle { display: flex; gap: 4px; flex-shrink: 0; }
.mode-btn {
  padding: 5px 12px;
  border: 1px solid var(--border2);
  border-radius: var(--r-sm);
  font-size: 12px; color: var(--t2);
  transition: all .15s;
}
.mode-btn.active {
  background: var(--accent-glow);
  border-color: rgba(91,156,255,.4);
  color: var(--accent);
  font-weight: 600;
}
.mode-btn:hover:not(.active) { background: var(--bg3); color: var(--t1); }

/* ── Workflow Toggle ─────────────────────────────────────────────────────── */
.workflow-toggle {
  display: flex; gap: 4px; background: var(--bg2);
  padding: 3px; border-radius: var(--r-sm);
  border: 1px solid var(--border);
}
.workflow-btn {
  padding: 4px 10px; font-size: 11px; font-weight: 600;
  color: var(--t2); border-radius: 6px;
  transition: all 0.15s;
}
.workflow-btn.active {
  background: var(--bg4);
  color: var(--t0);
  box-shadow: var(--shadow-sm);
}
.workflow-btn:hover:not(.active) { color: var(--t1); }

/* ── Messages Area ───────────────────────────────────────────────────────── */
.messages {
  flex: 1; overflow-y: auto;
  padding: 28px 24px;
  display: flex; flex-direction: column; gap: 24px;
}

/* ── Welcome screen ──────────────────────────────────────────────────────── */
.welcome {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  text-align: center; padding: 48px 24px;
  position: relative;
  animation: fadeIn .4s ease;
}
.welcome-glow {
  position: absolute; top: 40%; left: 50%; transform: translate(-50%,-50%);
  width: 500px; height: 500px;
  background: radial-gradient(circle, rgba(91,156,255,.06) 0%, transparent 70%);
  pointer-events: none;
}
.welcome-orb {
  font-size: 52px; margin-bottom: 20px;
  filter: drop-shadow(0 0 18px rgba(91,156,255,.5));
}
.welcome-title {
  font-size: 28px; font-weight: 700; letter-spacing: -.04em;
  color: var(--t0); margin-bottom: 12px;
  line-height: 1.2;
}
.welcome-sub {
  color: var(--t2); font-size: 14px; line-height: 1.7;
  max-width: 480px; margin-bottom: 36px;
}
.examples-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
  max-width: 580px; width: 100%;
}
.example-card {
  display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
  padding: 16px 18px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--r);
  text-align: left; cursor: pointer;
  transition: all .2s;
}
.example-card:hover {
  background: var(--bg3);
  border-color: var(--border3);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}
.example-icon { font-size: 22px; margin-bottom: 4px; }
.example-label { font-size: 13px; font-weight: 600; color: var(--t0); }
.example-sub   { font-size: 11px; color: var(--t2); }

/* ── Message bubbles ─────────────────────────────────────────────────────── */
.msg-wrap {
  display: flex; gap: 14px;
  animation: fadeUp .25s ease;
}
.msg-wrap.user { flex-direction: row-reverse; }
.msg-wrap.user .msg-body { align-items: flex-end; }

.avatar {
  width: 34px; height: 34px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700;
  flex-shrink: 0; margin-top: 2px;
}
.avatar.user {
  background: linear-gradient(135deg, #1a3a80, #0d2055);
  border: 1px solid #1e3a7a;
  color: var(--accent);
}
.avatar.assistant {
  background: linear-gradient(135deg, #111827, #0d1220);
  border: 1px solid var(--border2);
}

.msg-body {
  display: flex; flex-direction: column; gap: 8px;
  max-width: 76%; min-width: 0;
}

.msg-bubble {
  border-radius: var(--r);
  padding: 14px 18px;
  line-height: 1.7; font-size: 14px;
}
.msg-bubble.user {
  background: linear-gradient(135deg, #162560, #0e1a45);
  border: 1px solid #1e3070;
  border-radius: 14px 4px 14px 14px;
}
.msg-bubble.assistant {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 4px 14px 14px 14px;
}

/* Markdown inside messages */
.msg-bubble :deep(h1) { font-size: 20px; font-weight: 700; margin: 24px 0 12px; color: var(--t0); line-height: 1.3; }
.msg-bubble :deep(h2) { font-size: 18px; font-weight: 700; margin: 20px 0 10px; color: var(--t0); line-height: 1.3; }
.msg-bubble :deep(h3) { font-size: 16px; font-weight: 600; margin: 18px 0 8px; color: var(--t0); }
.msg-bubble :deep(h4) { font-size: 15px; font-weight: 600; margin: 16px 0 8px; color: var(--t1); }
.msg-bubble :deep(h5) { font-size: 14px; font-weight: 600; margin: 14px 0 6px; color: var(--t1); }
.msg-bubble :deep(h6) { font-size: 13px; font-weight: 600; margin: 12px 0 6px; color: var(--t2); text-transform: uppercase; letter-spacing: 0.05em; }
.msg-bubble :deep(strong) { color: var(--t0); font-weight: 600; }
.msg-bubble :deep(p) { margin-bottom: 14px; line-height: 1.8; }
.msg-bubble :deep(p:last-child) { margin-bottom: 0; }
.msg-bubble :deep(.md-list) { padding-left: 20px; margin: 14px 0; }
.msg-bubble :deep(li) { margin: 6px 0; color: var(--t1); line-height: 1.6; }
.msg-bubble :deep(hr) { border: none; border-top: 1px solid var(--border); margin: 24px 0; opacity: 0.3; }
.msg-bubble :deep(.ic) {
  background: var(--bg4); padding: 2px 6px;
  border-radius: 4px; font-family: var(--mono); font-size: 12px; color: #ffca3a;
  border: 1px solid rgba(255,202,58,0.2);
}
.msg-bubble :deep(.code-block) {
  background: #0d1117; border: 1px solid var(--border2);
  border-radius: var(--r-sm); padding: 16px;
  overflow-x: auto; margin: 18px 0;
  font-family: var(--mono); font-size: 13px;
  line-height: 1.6; color: #e6edf3;
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
}

/* Thought Callouts */
.msg-bubble :deep(.thought-container) {
  margin: 20px 0;
}
.msg-bubble :deep(.thought-section-header) {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 10px;
  padding: 0 4px;
}
.msg-bubble :deep(.thought-ca) {
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(4px);
  border-left: 3px solid var(--accent);
  padding: 16px 20px;
  border-radius: 4px 10px 10px 4px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
}
.msg-bubble :deep(.thought-content),
.msg-bubble :deep(.thought-content *) {
  color: #ffffff !important; /* Sharp white for maximum readability */
  font-size: 14.5px;
  line-height: 1.7;
  font-style: normal !important; /* Non-italic for authoritative look */
  opacity: 1;
}
.msg-bubble :deep(.thought-tag) {
  font-size: 10px;
  font-weight: 800;
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  opacity: 1;
}
.msg-bubble :deep(.thought-copy) {
  background: var(--bg4);
  border: 1px solid var(--border2);
  color: #ffffff !important; /* Ensure text is clean white */
  font-size: 10px; font-weight: 700;
  padding: 4px 10px; border-radius: 5px;
  cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.msg-bubble :deep(.thought-copy:hover) {
  background: var(--accent);
  border-color: var(--accent);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px var(--accent-glow);
}
.msg-bubble :deep(.thought-copy.active) {
  background: var(--green);
  border-color: var(--green);
  transform: scale(0.95);
}

/* Base Message Copy Button */
.msg-bubble-container {
  position: relative;
  display: flex; flex-direction: column; gap: 4px;
}
.msg-header-actions {
  display: flex; justify-content: flex-end;
  padding: 0 4px;
}
.msg-copy-btn {
  background: transparent;
  border: none;
  color: var(--t3);
  font-size: 10px; font-weight: 700;
  padding: 2px 6px; border-radius: 4px;
  cursor: pointer; transition: all 0.2s;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.6;
}
.msg-copy-btn:hover {
  background: var(--bg3);
  color: var(--t1);
  opacity: 1;
}
.msg-copy-btn.active {
  background: var(--green-dim);
  color: var(--green);
  opacity: 1;
}

.msg-bubble :deep(.code-block)::before {
  content: attr(data-lang);
  position: absolute; top: 10px; right: 12px;
  font-size: 10px; color: var(--t3); text-transform: uppercase; letter-spacing: .08em; font-weight: 700;
}
.msg-bubble :deep(.table-wrap) { 
  overflow-x: auto; margin: 20px 0; border-radius: 8px; 
  border: 1px solid var(--border); background: var(--bg);
}
.msg-bubble :deep(table) { border-collapse: collapse; width: 100%; font-size: 13px; }
.msg-bubble :deep(td) { padding: 10px 14px; border-bottom: 1px solid var(--border); color: var(--t1); line-height: 1.5; }
.msg-bubble :deep(tr:last-child td) { border-bottom: none; }
.msg-bubble :deep(tr:first-child td) { background: var(--bg3); font-weight: 600; color: var(--t0); border-bottom: 2px solid var(--border2); }

/* ── Activity Cards ──────────────────────────────────────────────────────── */
.activity-list { display: flex; flex-direction: column; gap: 6px; }

.act-card {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 14px; border-radius: var(--r-sm);
  font-size: 12.5px; font-family: var(--mono);
  transition: all .15s;
  animation: slideIn .2s ease;
}
.act-card.thought {
  background: rgba(91,156,255,.03);
  border: 1px solid rgba(91,156,255,.12);
  padding: 0; /* Let details handle inward padding */
  display: block;
}
.act-thought-details { width: 100%; }
.act-summary {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 14px; cursor: pointer; list-style: none;
  user-select: none;
}
.act-summary::-webkit-details-marker { display: none; }
.act-thought-label { 
  font-size: 11px; font-weight: 700; color: var(--accent); 
  text-transform: uppercase; letter-spacing: 0.05em; 
}
.act-chevron { 
  font-size: 14px; color: var(--t3); transition: transform 0.2s; 
}
.act-thought-details[open] .act-chevron { transform: rotate(90deg); }

.act-thought-content {
  padding: 4px 14px 12px;
  color: var(--t1); font-family: var(--sans); font-size: 13px;
  line-height: 1.6; border-top: 1px solid rgba(91,156,255,.08);
  white-space: pre-wrap;
}
.act-card.tool {
  background: rgba(61,220,132,.04);
  border: 1px solid rgba(61,220,132,.15);
}
.act-card.error  {
  background: rgba(255,107,107,.06);
  border: 1px solid rgba(255,107,107,.2);
}

.act-icon { font-size: 14px; flex-shrink: 0; }
.act-tool-name { color: var(--green); font-weight: 600; flex-shrink: 0; }
.act-detail {
  color: var(--t2); flex: 1; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap;
}
.act-done { color: var(--green); margin-left: auto; flex-shrink: 0; font-size: 13px; }
.act-spinner { margin-left: auto; flex-shrink: 0; }
.act-error-text { color: var(--red); font-family: var(--sans); flex: 1; }

/* ── Typing indicator ────────────────────────────────────────────────────── */
.typing-card {
  display: inline-flex;
  padding: 12px 16px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 4px 14px 14px 14px;
}
.typing-dots { display: flex; align-items: center; gap: 5px; }
.typing-dots span {
  width: 6px; height: 6px;
  background: var(--t3); border-radius: 50%;
  animation: pulse 1.4s ease-in-out infinite;
}
.typing-dots span:nth-child(2) { animation-delay: .2s; }
.typing-dots span:nth-child(3) { animation-delay: .4s; }

.msg-status {
  display: flex; align-items: center; gap: 8px;
  padding: 4px 10px; margin-top: 4px;
  font-size: 11px; color: var(--t3); font-style: italic;
  animation: fadeIn .3s ease;
}
.spin-sm.gray { border-left-color: var(--t3); }

/* ── Input Area ──────────────────────────────────────────────────────────── */
.input-area {
  display: flex; flex-direction: column; gap: 6px;
  padding: 16px 24px 20px;
  border-top: 1px solid var(--border);
  background: var(--bg1);
  flex-shrink: 0;
}
.input-wrapper { display: flex; align-items: flex-end; gap: 10px; }

.input-area textarea {
  flex: 1;
  background: var(--bg2);
  border: 1px solid var(--border2);
  border-radius: var(--r);
  color: var(--t0);
  padding: 13px 18px;
  font-size: 14px; line-height: 1.65;
  resize: none; min-height: 50px; max-height: 160px;
  transition: border-color .2s, box-shadow .2s;
}
.input-area textarea:focus {
  outline: none;
  border-color: rgba(91,156,255,.5);
  box-shadow: 0 0 0 3px rgba(91,156,255,.08);
}
.input-area textarea::placeholder { color: var(--t3); }
.input-area textarea:disabled { opacity: .45; }

.send-btn {
  width: 50px; height: 50px;
  border-radius: var(--r);
  background: var(--accent);
  color: #fff; font-size: 16px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  transition: background .15s, box-shadow .15s, transform .1s;
  box-shadow: 0 2px 8px rgba(91,156,255,.3);
}
.send-btn:hover:not(:disabled) {
  background: #7ab4ff;
  box-shadow: 0 4px 16px rgba(91,156,255,.5);
  transform: translateY(-1px);
}
.send-btn:active:not(:disabled) { transform: translateY(0); }
.send-btn:disabled { opacity: .35; cursor: not-allowed; box-shadow: none; }

.input-hint {
  display: flex; align-items: center; gap: 8px;
  font-size: 11px; color: var(--t3); padding: 0 2px;
}
.input-hint-target {
  font-family: var(--mono);
  color: var(--yellow);
  opacity: .7;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 250px;
}
</style>
