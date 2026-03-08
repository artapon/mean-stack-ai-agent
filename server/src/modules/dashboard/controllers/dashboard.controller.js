const BaseController = require('../../../core/base.controller');
const dashboardService = require('../services/dashboard.service');

/**
 * DashboardController - HTTP handlers for dashboard API
 */
class DashboardController extends BaseController {
    constructor() {
        super({ moduleName: 'Dashboard' });
    }
    /**
     * Get dashboard data
     * GET /api/dashboard
     */
    async getDashboard(req, res) {
        const data = dashboardService.getDashboardData();
        return this.ok(res, data);
    }

    /**
     * Get stats only
     * GET /api/dashboard/stats
     */
    async getStats(req, res) {
        const stats = dashboardService.getStats();
        return this.ok(res, stats);
    }

    /**
     * Get active tasks
     * GET /api/dashboard/tasks/active
     */
    async getActiveTasks(req, res) {
        const tasks = dashboardService.getActiveTasks();
        return this.ok(res, tasks);
    }

    /**
     * Get all tasks
     * GET /api/dashboard/tasks
     */
    async getAllTasks(req, res) {
        const tasks = dashboardService.getAllTasks();
        return this.ok(res, tasks);
    }

    /**
     * Get task by ID
     * GET /api/dashboard/tasks/:id
     */
    async getTask(req, res) {
        const { id } = req.params;
        const task = dashboardService.getTask(id);

        if (!task) {
            return this.notFound(res, 'Task not found');
        }

        return this.ok(res, task);
    }

    /**
     * Get active workflows
     * GET /api/dashboard/workflows/active
     */
    async getActiveWorkflows(req, res) {
        const workflows = dashboardService.getActiveWorkflows();
        return this.ok(res, workflows);
    }

    /**
     * Get all workflows
     * GET /api/dashboard/workflows
     */
    async getAllWorkflows(req, res) {
        const workflows = dashboardService.getAllWorkflows();
        return this.ok(res, workflows);
    }

    /**
     * Get recent logs
     * GET /api/dashboard/logs
     */
    async getLogs(req, res) {
        const { count = 100, level = null } = req.query;
        const logs = dashboardService.getRecentLogs(parseInt(count), level);
        return this.ok(res, logs);
    }

    /**
     * SSE endpoint for real-time updates
     * GET /api/dashboard/stream
     */
    async stream(req, res) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        res.write('event: connected\n');
        res.write(`data: ${JSON.stringify({ message: 'Connected to dashboard stream' })}\n\n`);

        dashboardService.addConnection(res);

        // Keep connection alive
        const keepAlive = setInterval(() => {
            if (res.writableEnded) {
                clearInterval(keepAlive);
                return;
            }
            res.write('event: ping\n');
            res.write(`data: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);
        }, 30000);

        req.on('close', () => {
            clearInterval(keepAlive);
            dashboardService.removeConnection(res);
        });
    }

    /**
     * Clear all dashboard data
     * POST /api/dashboard/clear
     */
    async clear(req, res) {
        dashboardService.clearAll();
        return this.ok(res, { message: 'Dashboard data cleared' });
    }

    /**
     * Get dashboard HTML page
     * GET /dashboard
     */
    async getPage(req, res) {
        res.setHeader('Content-Type', 'text/html');
        res.send(DASHBOARD_HTML);
    }
}

// Dashboard HTML page with real-time updates
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DevAgent Dashboard</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg:  #0b0e14;
            --bg1: #11141b;
            --bg2: #161a23;
            --bg3: #1e232e;
            --bg4: #262c3a;
            --t0:  #ffffff;
            --t1:  #e2e8f0;
            --t2:  #94a3b8;
            --t3:  #64748b;
            --accent:       #3b82f6;
            --accent-dim:   rgba(59,130,246,0.12);
            --accent-border:rgba(59,130,246,0.25);
            --green:        #10b981;
            --green-dim:    rgba(16,185,129,0.1);
            --red:          #ef4444;
            --red-dim:      rgba(239,68,68,0.1);
            --yellow:       #f59e0b;
            --yellow-dim:   rgba(245,158,11,0.1);
            --purple:       #8b5cf6;
            --purple-dim:   rgba(139,92,246,0.1);
            --border:  rgba(255,255,255,0.05);
            --border2: rgba(255,255,255,0.08);
            --mono: 'JetBrains Mono', monospace;
            --sans: 'Inter', sans-serif;
            --r: 10px;
        }
        * { margin:0; padding:0; box-sizing:border-box; }
        html, body { height: 100%; }
        body {
            font-family: var(--sans);
            background: var(--bg);
            color: var(--t1);
            -webkit-font-smoothing: antialiased;
            display: flex;
            height: 100vh;
            overflow: hidden;
        }
        button { font-family: inherit; cursor: pointer; border: none; background: none; color: inherit; }

        /* ── Scrollbar ── */
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.14); }

        /* ── Animations ── */
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.15)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ══════════════════════════════════════════════
           NAV SIDEBAR
        ══════════════════════════════════════════════ */
        .nav-sidebar {
            width: 200px;
            min-width: 200px;
            background: #080a10;
            border-right: 1px solid var(--border);
            display: flex;
            flex-direction: column;
            flex-shrink: 0;
        }
        .nav-logo {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 20px 16px 18px;
            border-bottom: 1px solid var(--border);
        }
        .nav-logo-icon {
            width: 32px; height: 32px;
            background: linear-gradient(135deg,rgba(91,156,255,.18),rgba(64,128,255,.08));
            border: 1px solid rgba(91,156,255,.22);
            border-radius: 9px;
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0;
        }
        .nav-logo-text { font-size: 14px; font-weight: 700; color: #fff; letter-spacing: -.02em; }
        .nav-items { display: flex; flex-direction: column; gap: 2px; padding: 12px 10px; flex: 1; }
        .nav-item {
            display: flex; align-items: center; gap: 10px;
            padding: 9px 12px; border-radius: 8px; width: 100%;
            text-align: left; color: rgba(255,255,255,.45);
            font-size: 13px; font-weight: 500;
            transition: all .15s; border: 1px solid transparent;
            text-decoration: none;
        }
        .nav-item:hover { background: rgba(255,255,255,.05); color: rgba(255,255,255,.85); border-color: var(--border2); }
        .nav-item.active { background: var(--accent-dim); color: var(--accent); border-color: var(--accent-border); }
        .nav-item svg { flex-shrink: 0; opacity: .75; }
        .nav-item:hover svg, .nav-item.active svg { opacity: 1; }
        .nav-bottom {
            padding: 16px; border-top: 1px solid var(--border);
            display: flex; flex-direction: column; gap: 8px;
        }
        .nav-conn {
            display: flex; align-items: center; gap: 8px;
            font-size: 11px; color: var(--t3);
        }
        .conn-dot {
            width: 6px; height: 6px; border-radius: 50%;
            background: var(--red); transition: background .3s;
            flex-shrink: 0;
        }
        .conn-dot.connected { background: var(--green); box-shadow: 0 0 6px rgba(16,185,129,.5); animation: pulse 2s infinite; }

        /* ══════════════════════════════════════════════
           MAIN CONTENT
        ══════════════════════════════════════════════ */
        .main {
            flex: 1; min-width: 0;
            display: flex; flex-direction: column;
            overflow: hidden;
        }

        /* ── Top Header ── */
        .topbar {
            display: flex; align-items: center; justify-content: space-between;
            padding: 0 24px; height: 54px; flex-shrink: 0;
            background: rgba(8,10,16,.9);
            backdrop-filter: blur(16px);
            border-bottom: 1px solid var(--border);
        }
        .topbar-left { display: flex; align-items: center; gap: 12px; }
        .topbar-title { font-size: 15px; font-weight: 700; color: var(--t0); letter-spacing: -.02em; }
        .topbar-badge {
            display: flex; align-items: center; gap: 6px;
            padding: 3px 10px; border-radius: 20px;
            background: var(--bg3); border: 1px solid var(--border2);
            font-size: 11px; font-weight: 500; color: var(--t2);
        }
        .live-dot {
            width: 6px; height: 6px; border-radius: 50%;
            background: var(--green);
            animation: pulse 1.8s ease-in-out infinite;
        }
        .topbar-right { display: flex; align-items: center; gap: 8px; }
        .btn {
            display: inline-flex; align-items: center; gap: 6px;
            padding: 6px 12px;
            border: 1px solid var(--border2);
            border-radius: 7px;
            background: rgba(255,255,255,.03);
            color: var(--t2);
            font-size: 12px; font-weight: 500;
            transition: all .15s; cursor: pointer;
        }
        .btn:hover { background: rgba(255,255,255,.06); color: var(--t1); border-color: rgba(255,255,255,.12); }
        .btn-danger { color: var(--red); border-color: rgba(239,68,68,.2); background: var(--red-dim); }
        .btn-danger:hover { background: rgba(239,68,68,.18); border-color: var(--red); }
        .btn-accent { color: var(--accent); border-color: var(--accent-border); background: var(--accent-dim); }
        .btn-accent:hover { background: rgba(59,130,246,.2); }

        /* ── Scrollable body ── */
        .content { flex: 1; overflow-y: auto; padding: 20px 24px 32px; }

        /* ── Stats grid ── */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(6, 1fr);
            gap: 12px;
            margin-bottom: 20px;
        }
        @media (max-width: 1400px) { .stats-grid { grid-template-columns: repeat(3,1fr); } }
        @media (max-width: 900px)  { .stats-grid { grid-template-columns: repeat(2,1fr); } }

        .stat-card {
            background: var(--bg1);
            border: 1px solid var(--border);
            border-radius: var(--r);
            padding: 16px 18px;
            transition: border-color .2s;
        }
        .stat-card:hover { border-color: var(--border2); }
        .stat-value {
            font-size: 28px; font-weight: 700;
            color: var(--t0); letter-spacing: -.03em;
            line-height: 1; margin-bottom: 6px;
            font-family: var(--mono);
        }
        .stat-label {
            font-size: 10px; font-weight: 700;
            color: var(--t3); text-transform: uppercase; letter-spacing: .1em;
        }
        .stat-card.accent  .stat-value { color: var(--accent); }
        .stat-card.green   .stat-value { color: var(--green); }
        .stat-card.red     .stat-value { color: var(--red); }
        .stat-card.yellow  .stat-value { color: var(--yellow); }
        .stat-card.purple  .stat-value { color: var(--purple); }

        /* ── Panels grid ── */
        .panels-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            margin-bottom: 16px;
        }
        @media (max-width: 1000px) { .panels-grid { grid-template-columns: 1fr; } }

        .panel {
            background: var(--bg1);
            border: 1px solid var(--border);
            border-radius: var(--r);
            overflow: hidden;
            display: flex; flex-direction: column;
        }
        .panel-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 12px 16px;
            border-bottom: 1px solid var(--border);
            flex-shrink: 0;
        }
        .panel-title {
            font-size: 12px; font-weight: 700;
            color: var(--t2); text-transform: uppercase; letter-spacing: .08em;
            display: flex; align-items: center; gap: 7px;
        }
        .panel-title-dot {
            width: 6px; height: 6px; border-radius: 50%; background: var(--accent);
        }
        .panel-actions { display: flex; gap: 6px; }
        .panel-content { padding: 12px; overflow-y: auto; max-height: 420px; }

        /* ── Task / Workflow cards ── */
        .task-card, .wf-card {
            background: var(--bg2);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 12px 14px;
            margin-bottom: 8px;
            transition: border-color .15s;
            animation: fadeUp .25s ease;
        }
        .task-card:last-child, .wf-card:last-child { margin-bottom: 0; }
        .task-card:hover, .wf-card:hover { border-color: var(--border2); }

        .card-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
        .card-id { font-family: var(--mono); font-size: 11px; color: var(--accent); font-weight: 500; }
        .card-meta { display: flex; gap: 12px; flex-wrap: wrap; }
        .card-meta-item {
            display: flex; align-items: center; gap: 4px;
            font-size: 11px; color: var(--t3); font-family: var(--mono);
        }
        .card-steps {
            margin-top: 6px; font-size: 10px; color: var(--t3);
            font-family: var(--mono);
        }

        /* Status badge */
        .badge {
            display: inline-flex; align-items: center; gap: 5px;
            padding: 2px 9px; border-radius: 20px;
            font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
        }
        .badge::before { content:''; width:5px; height:5px; border-radius:50%; background:currentColor; }
        .badge-pending  { background: var(--yellow-dim); color: var(--yellow); border: 1px solid rgba(245,158,11,.2); }
        .badge-running  { background: var(--accent-dim); color: var(--accent); border: 1px solid var(--accent-border); }
        .badge-running::before { animation: pulse 1.4s ease-in-out infinite; }
        .badge-completed{ background: var(--green-dim);  color: var(--green);  border: 1px solid rgba(16,185,129,.2); }
        .badge-failed   { background: var(--red-dim);    color: var(--red);    border: 1px solid rgba(239,68,68,.2); }

        /* Progress bar */
        .prog-bar { width:100%; height:3px; background:rgba(255,255,255,.06); border-radius:2px; overflow:hidden; margin-top:8px; }
        .prog-fill { height:100%; background:linear-gradient(90deg,var(--accent),var(--green)); border-radius:2px; transition:width .4s ease; }

        /* ── Logs panel ── */
        .log-panel { background: var(--bg1); border: 1px solid var(--border); border-radius: var(--r); overflow: hidden; }
        .log-scroll {
            padding: 8px 0;
            font-family: var(--mono); font-size: 12px;
            max-height: 360px; overflow-y: auto;
        }
        .log-row {
            display: flex; align-items: baseline; gap: 8px;
            padding: 4px 14px;
            border-left: 2px solid transparent;
            transition: background .1s;
            animation: fadeUp .2s ease;
        }
        .log-row:hover { background: rgba(255,255,255,.02); }
        .log-row.level-info  { border-left-color: var(--accent); }
        .log-row.level-warn  { border-left-color: var(--yellow); }
        .log-row.level-error { border-left-color: var(--red); }
        .log-row.level-debug { border-left-color: var(--t3); }
        .log-time { color: var(--t3); font-size: 10px; white-space: nowrap; flex-shrink:0; }
        .log-lvl {
            font-size: 9px; font-weight: 700; text-transform: uppercase;
            padding: 1px 5px; border-radius: 3px; flex-shrink:0;
        }
        .lvl-info  { background: var(--accent-dim);  color: var(--accent); }
        .lvl-warn  { background: var(--yellow-dim);  color: var(--yellow); }
        .lvl-error { background: var(--red-dim);     color: var(--red); }
        .lvl-debug { background: rgba(255,255,255,.04); color: var(--t3); }
        .log-msg  { color: var(--t1); flex:1; word-break:break-all; line-height:1.45; }
        .log-svc  { color: var(--t3); font-size: 10px; flex-shrink:0; }

        /* ── Empty state ── */
        .empty {
            display: flex; flex-direction: column; align-items: center;
            justify-content: center; padding: 40px 20px; gap: 8px;
            color: var(--t3); text-align: center;
        }
        .empty-icon { font-size: 28px; opacity: .4; margin-bottom: 4px; }
        .empty-text { font-size: 12px; }
    </style>
</head>
<body>

    <!-- ── Left Nav Sidebar ── -->
    <nav class="nav-sidebar">
        <div class="nav-logo">
            <div class="nav-logo-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="url(#nlg)"/>
                    <defs>
                        <linearGradient id="nlg" x1="3" y1="2" x2="21" y2="22" gradientUnits="userSpaceOnUse">
                            <stop offset="0%" stop-color="#7ab8ff"/>
                            <stop offset="100%" stop-color="#3d8eff"/>
                        </linearGradient>
                    </defs>
                </svg>
            </div>
            <span class="nav-logo-text">DevAgent</span>
        </div>

        <div class="nav-items">
            <a class="nav-item" href="/" title="Back to Chat">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                    <polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
                <span>Home</span>
            </a>
            <a class="nav-item active" href="/dashboard" title="Dashboard">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1"/>
                    <rect x="14" y="3" width="7" height="7" rx="1"/>
                    <rect x="14" y="14" width="7" height="7" rx="1"/>
                    <rect x="3" y="14" width="7" height="7" rx="1"/>
                </svg>
                <span>Dashboard</span>
            </a>
        </div>

        <div class="nav-bottom">
            <div class="nav-conn">
                <div class="conn-dot" id="connDot"></div>
                <span id="connText">Connecting…</span>
            </div>
        </div>
    </nav>

    <!-- ── Main ── -->
    <div class="main">

        <!-- Top bar -->
        <div class="topbar">
            <div class="topbar-left">
                <span class="topbar-title">Dashboard</span>
                <div class="topbar-badge">
                    <div class="live-dot"></div>
                    <span>Live</span>
                </div>
            </div>
            <div class="topbar-right">
                <button class="btn btn-accent" onclick="refreshData()">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M23 4v6h-6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M1 20v-6h6"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg>
                    Refresh
                </button>
                <button class="btn btn-danger" onclick="clearAll()">
                    Clear All
                </button>
            </div>
        </div>

        <!-- Scrollable content -->
        <div class="content">

            <!-- Stats -->
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value" id="totalTasks">0</div>
                    <div class="stat-label">Total Tasks</div>
                </div>
                <div class="stat-card accent">
                    <div class="stat-value" id="activeTasks">0</div>
                    <div class="stat-label">Active</div>
                </div>
                <div class="stat-card green">
                    <div class="stat-value" id="completedTasks">0</div>
                    <div class="stat-label">Completed</div>
                </div>
                <div class="stat-card red">
                    <div class="stat-value" id="failedTasks">0</div>
                    <div class="stat-label">Failed</div>
                </div>
                <div class="stat-card purple">
                    <div class="stat-value" id="activeWorkflows">0</div>
                    <div class="stat-label">Workflows</div>
                </div>
                <div class="stat-card yellow">
                    <div class="stat-value" id="uptime">00:00</div>
                    <div class="stat-label">Uptime</div>
                </div>
            </div>

            <!-- Tasks + Workflows -->
            <div class="panels-grid">
                <div class="panel">
                    <div class="panel-header">
                        <div class="panel-title">
                            <div class="panel-title-dot"></div>
                            Active Tasks
                        </div>
                        <div class="panel-actions">
                            <button class="btn" onclick="refreshData()">Refresh</button>
                        </div>
                    </div>
                    <div class="panel-content" id="tasksContainer">
                        <div class="empty"><div class="empty-icon">📭</div><div class="empty-text">No active tasks</div></div>
                    </div>
                </div>

                <div class="panel">
                    <div class="panel-header">
                        <div class="panel-title">
                            <div class="panel-title-dot" style="background:var(--purple)"></div>
                            Active Workflows
                        </div>
                        <div class="panel-actions">
                            <button class="btn" onclick="refreshData()">Refresh</button>
                        </div>
                    </div>
                    <div class="panel-content" id="workflowsContainer">
                        <div class="empty"><div class="empty-icon">📭</div><div class="empty-text">No active workflows</div></div>
                    </div>
                </div>
            </div>

            <!-- Logs -->
            <div class="log-panel">
                <div class="panel-header">
                    <div class="panel-title">
                        <div class="panel-title-dot" style="background:var(--green)"></div>
                        Real-time Logs
                    </div>
                    <div class="panel-actions">
                        <button class="btn" id="autoScrollBtn" onclick="toggleAutoScroll()">Auto-scroll: ON</button>
                        <button class="btn" onclick="clearLogs()">Clear</button>
                    </div>
                </div>
                <div class="log-scroll" id="logContainer">
                    <div class="empty"><div class="empty-icon">📝</div><div class="empty-text">Waiting for logs…</div></div>
                </div>
            </div>

        </div><!-- /content -->
    </div><!-- /main -->

    <script>
        let eventSource = null;
        let autoScroll = true;
        let logEntries = [];

        function connect() {
            eventSource = new EventSource('/api/dashboard/stream');

            eventSource.onopen = () => {
                document.getElementById('connDot').classList.add('connected');
                document.getElementById('connText').textContent = 'Connected';
            };
            eventSource.onerror = () => {
                document.getElementById('connDot').classList.remove('connected');
                document.getElementById('connText').textContent = 'Reconnecting…';
                setTimeout(connect, 3000);
            };

            eventSource.addEventListener('init', (e) => {
                const data = JSON.parse(e.data);
                updateStats(data.stats);
                updateTasks(data.activeTasks);
                updateWorkflows(data.activeWorkflows);
                data.recentLogs.forEach(log => addLogEntry(log));
            });
            eventSource.addEventListener('stats',          (e) => updateStats(JSON.parse(e.data)));
            eventSource.addEventListener('task:created',   (e) => addTaskToList(JSON.parse(e.data)));
            eventSource.addEventListener('task:started',   (e) => updateTask(JSON.parse(e.data)));
            eventSource.addEventListener('task:completed', (e) => { const t=JSON.parse(e.data); updateTask(t); addLogEntry({level:'info',message:\`Task completed: \${t.id} (\${t.duration}ms)\`,timestamp:Date.now(),service:'dashboard'}); });
            eventSource.addEventListener('task:failed',    (e) => { const t=JSON.parse(e.data); updateTask(t);  addLogEntry({level:'error',message:\`Task failed: \${t.id} — \${t.error}\`,timestamp:Date.now(),service:'dashboard'}); });
            eventSource.addEventListener('log:entry',      (e) => addLogEntry(JSON.parse(e.data)));
            eventSource.addEventListener('dashboard:cleared', () => {
                document.getElementById('logContainer').innerHTML = '<div class="empty"><div class="empty-icon">📝</div><div class="empty-text">Waiting for logs…</div></div>';
                document.getElementById('tasksContainer').innerHTML = '<div class="empty"><div class="empty-icon">📭</div><div class="empty-text">No active tasks</div></div>';
                logEntries = [];
            });
        }

        function updateStats(stats) {
            document.getElementById('totalTasks').textContent     = stats.totalTasks     || 0;
            document.getElementById('activeTasks').textContent    = stats.activeTasks    || 0;
            document.getElementById('completedTasks').textContent = stats.completedTasks || 0;
            document.getElementById('failedTasks').textContent    = stats.failedTasks    || 0;
            document.getElementById('activeWorkflows').textContent= stats.activeWorkflows|| 0;
            const s = Math.floor((stats.uptime || 0) / 1000);
            document.getElementById('uptime').textContent =
                String(Math.floor(s/3600)).padStart(2,'0') + ':' + String(Math.floor((s%3600)/60)).padStart(2,'0');
        }

        function updateTasks(tasks) {
            const el = document.getElementById('tasksContainer');
            el.innerHTML = (!tasks || !tasks.length)
                ? '<div class="empty"><div class="empty-icon">📭</div><div class="empty-text">No active tasks</div></div>'
                : tasks.map(renderTask).join('');
        }

        function updateWorkflows(wfs) {
            const el = document.getElementById('workflowsContainer');
            el.innerHTML = (!wfs || !wfs.length)
                ? '<div class="empty"><div class="empty-icon">📭</div><div class="empty-text">No active workflows</div></div>'
                : wfs.map(renderWorkflow).join('');
        }

        function renderTask(t) {
            const dur = t.duration ? t.duration+'ms' : (t.startTime ? 'Running…' : 'Pending');
            return \`<div class="task-card" id="task-\${t.id}">
                <div class="card-row">
                    <span class="card-id">\${t.id}</span>
                    <span class="badge badge-\${t.status}">\${t.status}</span>
                </div>
                <div class="card-meta">
                    <span class="card-meta-item">\${t.metadata?.model || 'unknown'}</span>
                    <span class="card-meta-item">\${t.metadata?.stack || 'default'}</span>
                    <span class="card-meta-item">\${dur}</span>
                </div>
                \${t.steps?.length ? \`<div class="card-steps">\${t.steps.length} steps</div>\` : ''}
            </div>\`;
        }

        function renderWorkflow(w) {
            const prog = w.progress || 0;
            return \`<div class="wf-card" id="workflow-\${w.id}">
                <div class="card-row">
                    <span class="card-id">\${w.metadata?.name || w.id}</span>
                    <span class="badge badge-\${w.status}">\${w.status}</span>
                </div>
                <div class="card-meta">
                    <span class="card-meta-item">\${w.currentStep||0}/\${w.totalSteps||0} steps</span>
                    <span class="card-meta-item">\${prog}%</span>
                </div>
                <div class="prog-bar"><div class="prog-fill" style="width:\${prog}%"></div></div>
            </div>\`;
        }

        function addTaskToList(task) {
            const el = document.getElementById('tasksContainer');
            const empty = el.querySelector('.empty');
            if (empty) empty.remove();
            el.insertAdjacentHTML('afterbegin', renderTask(task));
        }

        function updateTask(task) {
            const ex = document.getElementById(\`task-\${task.id}\`);
            if (ex) ex.outerHTML = renderTask(task); else addTaskToList(task);
        }

        function addLogEntry(entry) {
            logEntries.push(entry);
            if (logEntries.length > 500) logEntries.shift();

            const el = document.getElementById('logContainer');
            const empty = el.querySelector('.empty');
            if (empty) empty.remove();

            const time = new Date(entry.timestamp).toLocaleTimeString();
            const div = document.createElement('div');
            div.className = \`log-row level-\${entry.level}\`;
            div.innerHTML = \`
                <span class="log-time">\${time}</span>
                <span class="log-lvl lvl-\${entry.level}">\${entry.level}</span>
                <span class="log-msg">\${escapeHtml(entry.message)}</span>
                <span class="log-svc">[\${entry.metadata?.service || entry.service || 'system'}]</span>
            \`;
            el.appendChild(div);
            if (autoScroll) el.scrollTop = el.scrollHeight;
        }

        function escapeHtml(t) {
            const d = document.createElement('div');
            d.textContent = t;
            return d.innerHTML;
        }

        function toggleAutoScroll() {
            autoScroll = !autoScroll;
            document.getElementById('autoScrollBtn').textContent = \`Auto-scroll: \${autoScroll ? 'ON' : 'OFF'}\`;
        }

        function clearLogs() {
            document.getElementById('logContainer').innerHTML = '<div class="empty"><div class="empty-icon">📝</div><div class="empty-text">Waiting for logs…</div></div>';
            logEntries = [];
        }

        async function clearAll() {
            if (!confirm('Clear all dashboard data?')) return;
            await fetch('/api/dashboard/clear', { method: 'POST' });
        }

        async function refreshData() {
            const res = await fetch('/api/dashboard');
            const data = await res.json();
            if (data.success) {
                updateStats(data.data.stats);
                updateTasks(data.data.activeTasks);
                updateWorkflows(data.data.activeWorkflows);
            }
        }

        connect();
        refreshData();
        setInterval(refreshData, 5000);
    </script>
</body>
</html>`;

module.exports = new DashboardController();
