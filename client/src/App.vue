<template>
  <!-- ── Chat App ──────────────────────────────────────────────────── -->
  <div class="app">

    <!-- ── Left Nav Sidebar ──────────────────────────────────────────── -->
    <nav class="nav-sidebar">
      <div class="nav-logo">
        <div class="nav-logo-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="url(#nav-lg)" stroke="none"/>
            <defs>
              <linearGradient id="nav-lg" x1="3" y1="2" x2="21" y2="22" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="#7ab8ff"/>
                <stop offset="100%" stop-color="#3d8eff"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
        <span class="nav-logo-text">DevAgent</span>
      </div>

      <div class="nav-items">
        <!-- Dashboard -->
        <button
          class="nav-item"
          :class="{ active: currentView === 'dashboard' }"
          @click="openDashboard"
          title="Dashboard"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="14" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/>
          </svg>
          <span>Dashboard</span>
        </button>

        <!-- Chat -->
        <button
          class="nav-item"
          :class="{ active: currentView === 'chat' }"
          @click="currentView = 'chat'"
          title="Chat"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span>Chat</span>
        </button>

        <!-- Settings -->
        <button
          class="nav-item"
          :class="{ active: currentView === 'settings' }"
          @click="currentView = 'settings'"
          title="Settings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          <span>Settings</span>
        </button>
      </div>

      <div class="nav-bottom">
        <div class="nav-status-dot" :class="running ? 'running' : 'idle'" :title="running ? 'Agent running' : 'Ready'"></div>
      </div>
    </nav>

    <!-- ── Workspace Sidebar ──────────────────────────────────────────── -->
    <aside class="sidebar" v-if="currentView === 'chat'">
      <div class="sidebar-header">
        <div class="sidebar-title-wrap">
          <span class="sidebar-title">Workspace</span>
          <span v-if="workspacePath" class="sidebar-ws-path" :title="workspacePath">{{ workspacePath.split(/[\\/]/).pop() || workspacePath }}</span>
        </div>
        <button class="icon-btn-sm" @click="loadFiles" :disabled="fbLoading" title="Refresh">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" :class="fbLoading ? 'spin-sm' : ''">
            <path v-if="!fbLoading" d="M23 4v6h-6M1 20v-6h6"/>
            <path v-if="!fbLoading" d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </button>
      </div>


      <!-- ── Workspace file browser ───────────────────────────── -->
      <div class="sidebar-workspace">

        <div class="fb-path-bar compact">
          <button class="fb-crumb home" @click="navigateTo('.')">🏠</button>
          <template v-for="(seg, i) in pathSegments" :key="i">
            <span class="fb-sep">›</span>
            <div class="fb-crumb-wrap" :class="{ pinned: targetFolder === pathSegments.slice(0, i+1).join('/') }">
              <button class="fb-crumb" @click="navigateTo(pathSegments.slice(0, i+1).join('/'))">{{ seg }}</button>
              <button class="fb-crumb-pin" @click.stop="setTargetFolder(pathSegments.slice(0, i+1).join('/'))" title="Pin this folder">📌</button>
            </div>
          </template>
          <button
            v-if="currentPath !== '.'"
            class="fb-pin-btn-top"
            :class="{ pinned: targetFolder === currentPath }"
            @click="setTargetFolder(currentPath)"
            :title="targetFolder === currentPath ? 'Unpin current folder' : 'Pin current folder'"
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

        <div class="fb-list sidebar-fb-list" v-if="!fbLoading">
          <div v-if="currentPath !== '.'" class="fb-item fb-back" @click="goUp">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            ..
          </div>
          <div
            v-for="item in fbFolders" :key="item.name"
            class="fb-item fb-dir"
            :class="{ pinned: targetFolder === item.path }"
            @click="navigateTo(item.path)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            <span class="fb-name">{{ item.name }}</span>
            <button 
              class="fb-item-pin" 
              :class="{ active: targetFolder === item.path }"
              @click.stop="setTargetFolder(item.path)" 
              :title="targetFolder === item.path ? 'Unpin folder' : 'Pin folder'"
            >
              📌
            </button>
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
          <div v-if="!fbFolders.length && !fbFiles.length && currentPath === '.'" class="fb-empty">
            Workspace is empty
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
      </div>

      <div class="sidebar-footer">
        <div class="status-pill" :class="running ? 'running' : 'idle'">
          <span class="status-dot"></span>
          <span>{{ running ? 'Agent running' : 'Ready' }}</span>
        </div>

        <button class="clear-btn" :disabled="running" @click="clearChat">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          New Chat
        </button>
      </div>
    </aside>

    <!-- ── Main Area ──────────────────────────────────────────────────── -->
    <main :class="currentView === 'dashboard' ? 'dashboard-main' : currentView === 'settings' ? 'settings-main' : 'chat'">

      <!-- ── Dashboard View ───────────────────────────────────────── -->
      <template v-if="currentView === 'dashboard'">

        <!-- Header -->
        <header class="db-header">
          <div class="db-header-left">
            <div class="db-brand">
              <div class="db-brand-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
              </div>
              <div>
                <h1 class="db-title">Agent Dashboard</h1>
                <p class="db-subtitle">Real-time task · workflow · log monitor</p>
              </div>
            </div>
            <div class="db-live-pill" :class="dashConnected ? 'live' : 'offline'">
              <span class="db-live-dot"></span>
              {{ dashConnected ? 'Live' : 'Offline' }}
            </div>
          </div>
          <div class="db-header-right">
            <div class="db-uptime-group">
              <span class="db-meta-chip">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                {{ fmtUptime(dashStats.uptime) }}
              </span>
              <span class="db-meta-chip">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                {{ dashStats.activeConnections ?? 0 }} conn
              </span>
            </div>
            <button class="db-btn" @click="loadDashboard" :disabled="dashLoading">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" :class="dashLoading ? 'spin-sm' : ''">
                <path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
              Refresh
            </button>
            <button class="db-btn db-btn-danger" @click="clearDashboard">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
              Clear
            </button>
          </div>
        </header>

        <!-- KPI row -->
        <div class="db-kpi-row">
          <div class="db-kpi">
            <div class="db-kpi-icon db-kpi-icon-total">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
            </div>
            <div class="db-kpi-body">
              <div class="db-kpi-value">{{ dashStats.totalTasks ?? 0 }}</div>
              <div class="db-kpi-label">Total Tasks</div>
            </div>
          </div>
          <div class="db-kpi db-kpi-green">
            <div class="db-kpi-icon db-kpi-icon-active">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            </div>
            <div class="db-kpi-body">
              <div class="db-kpi-value">{{ dashStats.activeTasks ?? 0 }}</div>
              <div class="db-kpi-label">Running</div>
            </div>
            <div class="db-kpi-pulse" v-if="dashStats.activeTasks > 0"></div>
          </div>
          <div class="db-kpi db-kpi-blue">
            <div class="db-kpi-icon db-kpi-icon-done">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div class="db-kpi-body">
              <div class="db-kpi-value">{{ dashStats.completedTasks ?? 0 }}</div>
              <div class="db-kpi-label">Completed</div>
            </div>
          </div>
          <div class="db-kpi db-kpi-red">
            <div class="db-kpi-icon db-kpi-icon-fail">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            </div>
            <div class="db-kpi-body">
              <div class="db-kpi-value">{{ dashStats.failedTasks ?? 0 }}</div>
              <div class="db-kpi-label">Failed</div>
            </div>
          </div>
          <div class="db-kpi db-kpi-purple">
            <div class="db-kpi-icon db-kpi-icon-wf">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/></svg>
            </div>
            <div class="db-kpi-body">
              <div class="db-kpi-value">{{ dashStats.activeWorkflows ?? dashWorkflows.length }}</div>
              <div class="db-kpi-label">Workflows</div>
            </div>
          </div>
          <div class="db-kpi db-kpi-yellow">
            <div class="db-kpi-icon db-kpi-icon-logs">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </div>
            <div class="db-kpi-body">
              <div class="db-kpi-value">{{ dashStats.bufferedLogs ?? dashLogs.length }}</div>
              <div class="db-kpi-label">Log Entries</div>
            </div>
          </div>
        </div>

        <!-- 3-column body -->
        <div class="db-body">

          <!-- ── Tasks column ── -->
          <div class="db-col">
            <div class="db-col-header">
              <div class="db-col-title-row">
                <span class="db-col-title">Tasks</span>
                <span class="db-badge-running" v-if="dashActiveTasks.length">{{ dashActiveTasks.length }} running</span>
              </div>
              <div class="db-tabs">
                <button class="db-tab" :class="{ active: dashTaskTab === 'active' }" @click="dashTaskTab = 'active'">Active</button>
                <button class="db-tab" :class="{ active: dashTaskTab === 'history' }" @click="dashTaskTab = 'history'">History</button>
              </div>
            </div>
            <div class="db-col-body">

              <!-- Active tasks -->
              <template v-if="dashTaskTab === 'active'">
                <div v-if="!dashActiveTasks.length" class="db-empty-state">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".3"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                  <div class="db-empty-title">No active tasks</div>
                  <div class="db-empty-sub">Waiting for agent activity…</div>
                </div>
                <div
                  v-for="task in dashActiveTasks" :key="task.id"
                  class="db-task-card"
                  :class="['st-' + task.status, { expanded: dbExpandedTask === task.id }]"
                  @click="dbExpandedTask = dbExpandedTask === task.id ? null : task.id"
                >
                  <div class="db-task-top-row">
                    <span class="db-status-dot" :class="task.status"></span>
                    <span class="db-task-id">{{ task.id?.slice(-8) }}</span>
                    <span class="db-status-badge" :class="task.status">{{ task.status }}</span>
                    <span class="db-task-elapsed" v-if="task.startTime">{{ fmtDuration(Date.now() - task.startTime) }}</span>
                  </div>
                  <div class="db-task-prompt" v-if="task.metadata?.prompt">
                    {{ task.metadata.prompt.slice(0, 90) }}{{ task.metadata.prompt.length > 90 ? '…' : '' }}
                  </div>
                  <div class="db-task-chips">
                    <span class="db-chip chip-model">{{ task.metadata?.model || 'unknown' }}</span>
                    <span class="db-chip chip-stack">{{ task.metadata?.stack || 'default' }}</span>
                    <span class="db-chip chip-steps" v-if="task.steps?.length">{{ task.steps.length }} steps</span>
                  </div>
                  <!-- Expanded step trace -->
                  <div v-if="dbExpandedTask === task.id" class="db-steps-trace">
                    <div class="db-steps-title">Step trace</div>
                    <div v-if="!task.steps?.length" class="db-steps-empty">No steps recorded yet</div>
                    <div v-for="step in (task.steps || []).slice(-8)" :key="step.id" class="db-step-row">
                      <span class="db-step-dot" :class="step.status || 'pending'"></span>
                      <span class="db-step-action">{{ step.action }}</span>
                      <span v-if="step.detail" class="db-step-detail">{{ step.detail.split(/[\\/]/).pop() }}</span>
                      <span class="db-step-time">{{ fmtTime(step.timestamp) }}</span>
                    </div>
                    <div v-if="task.error" class="db-task-error-line">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      {{ task.error }}
                    </div>
                  </div>
                </div>
              </template>

              <!-- History -->
              <template v-else>
                <div v-if="!dashHistory.length && !dashRecentTasks.length" class="db-empty-state">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".3"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  <div class="db-empty-title">No history yet</div>
                </div>
                <div
                  v-for="task in [...dashHistory, ...dashRecentTasks.filter(t => t.status !== 'running')].slice(0, 30)"
                  :key="'h' + task.id"
                  class="db-task-card db-task-past"
                  :class="'st-' + task.status"
                >
                  <div class="db-task-top-row">
                    <span class="db-status-dot" :class="task.status"></span>
                    <span class="db-task-id">{{ task.id?.slice(-8) }}</span>
                    <span class="db-status-badge" :class="task.status">{{ task.status }}</span>
                    <span class="db-task-elapsed" v-if="task.duration">{{ fmtDuration(task.duration) }}</span>
                  </div>
                  <div class="db-task-prompt" v-if="task.metadata?.prompt">
                    {{ task.metadata.prompt.slice(0, 70) }}{{ task.metadata.prompt.length > 70 ? '…' : '' }}
                  </div>
                  <div class="db-task-chips">
                    <span class="db-chip chip-model" v-if="task.metadata?.model">{{ task.metadata.model }}</span>
                    <span class="db-chip chip-stack" v-if="task.metadata?.stack">{{ task.metadata.stack }}</span>
                  </div>
                  <div class="db-task-error-line" v-if="task.error">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    {{ task.error }}
                  </div>
                </div>
              </template>

            </div>
          </div>

          <!-- ── Workflows column ── -->
          <div class="db-col">
            <div class="db-col-header">
              <div class="db-col-title-row">
                <span class="db-col-title">Workflows</span>
                <span class="db-badge-running" v-if="dashActiveWorkflows.length">{{ dashActiveWorkflows.length }} active</span>
              </div>
            </div>
            <div class="db-col-body">
              <div v-if="!allWorkflows.length" class="db-empty-state">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".3"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/></svg>
                <div class="db-empty-title">No workflows</div>
                <div class="db-empty-sub">Pipelines will appear here</div>
              </div>
              <div v-for="wf in allWorkflows" :key="wf.id" class="db-wf-card" :class="'st-' + wf.status">
                <div class="db-wf-top">
                  <div class="db-wf-name">{{ wf.metadata?.name || wf.id?.slice(-10) }}</div>
                  <span class="db-status-badge" :class="wf.status">{{ wf.status }}</span>
                </div>
                <div class="db-wf-desc" v-if="wf.metadata?.description">{{ wf.metadata.description }}</div>
                <!-- Progress bar -->
                <div class="db-wf-progress" v-if="wf.totalSteps || wf.progress">
                  <div class="db-wf-track">
                    <div class="db-wf-fill" :class="wf.status" :style="{ width: Math.min(wf.progress || 0, 100) + '%' }"></div>
                  </div>
                  <span class="db-wf-pct">{{ wf.progress || 0 }}%</span>
                </div>
                <!-- Step pills -->
                <div class="db-wf-steps-row" v-if="wf.totalSteps">
                  <span class="db-wf-step-lbl">Step {{ wf.currentStep || 0 }} / {{ wf.totalSteps }}</span>
                  <div class="db-wf-step-dots">
                    <span v-for="n in Math.min(wf.totalSteps, 10)" :key="n"
                      class="db-wf-dot"
                      :class="n <= (wf.currentStep || 0) ? 'done' : n === (wf.currentStep || 0) + 1 ? 'current' : ''">
                    </span>
                  </div>
                </div>
                <div class="db-wf-footer">
                  <span class="db-task-elapsed" v-if="wf.startTime">{{ fmtDuration((wf.endTime || Date.now()) - wf.startTime) }}</span>
                  <span class="db-chip chip-steps" v-if="wf.tasks?.length">{{ wf.tasks.length }} tasks</span>
                </div>
              </div>
            </div>
          </div>

          <!-- ── Live Log column ── -->
          <div class="db-col db-col-logs">
            <div class="db-col-header">
              <span class="db-col-title">Live Logs</span>
              <div class="db-log-filters">
                <button
                  v-for="lvl in ['all','roadmap','debug','info','warn','error']" :key="lvl"
                  class="db-log-filter-btn" :class="[lvl !== 'all' ? 'lf-' + lvl : '', { active: dashLogFilter === lvl }]"
                  @click="dashLogFilter = lvl"
                >
                  {{ lvl }}
                  <span class="db-filter-cnt" v-if="lvl !== 'all'">{{ dashLogs.filter(l => l.level === lvl).length }}</span>
                </button>
              </div>
            </div>
            <div class="db-log-stream" ref="dashLogEl">
              <div v-if="!filteredLogs.length" class="db-empty-state">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".3"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.31 2 2 0 0 1 3.62 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.93a16 16 0 0 0 6.06 6.06l1.01-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                <div class="db-empty-title">No logs yet</div>
                <div class="db-empty-sub">Events stream here in real-time</div>
              </div>
              <!-- Roadmap block header -->
              <template v-for="(log, i) in filteredLogs.slice(0, 300)" :key="log.id || i">
                <div v-if="log.level === 'roadmap'" class="db-roadmap-entry">
                  <span class="db-roadmap-line">{{ log.message }}</span>
                </div>
                <div v-else class="db-log-entry" :class="'ll-' + log.level">
                  <span class="db-log-ts">{{ fmtTime(log.timestamp) }}</span>
                  <span class="db-log-lvl">{{ (log.level || 'info').toUpperCase().slice(0,4) }}</span>
                  <span class="db-log-svc" v-if="log.metadata?.service">{{ log.metadata.service }}</span>
                  <span class="db-log-msg">
                    {{ log.message }}
                    <span v-if="log.detail" class="db-log-detail">{{ log.detail }}</span>
                  </span>
                </div>
              </template>
            </div>
          </div>

        </div><!-- end db-body -->
      </template>

      <!-- ── Settings View ─────────────────────────────────────────── -->
      <template v-else-if="currentView === 'settings'">
        <header class="stg-header">
          <div class="stg-header-left">
            <div class="stg-brand-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </div>
            <div>
              <h1 class="stg-title">Settings</h1>
              <p class="stg-subtitle">Persistent agent configuration</p>
            </div>
          </div>
          <div class="stg-header-right">
            <span class="stg-save-indicator stg-saved" :class="{ visible: settingsSaved }">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              Saved
            </span>
            <button class="stg-reset-btn" @click="resetSettings" title="Restore defaults">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
              Reset
            </button>
            <button class="stg-save-btn" @click="saveSettings" :disabled="settingsSaving">
              <svg v-if="settingsSaving" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="spin-sm"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              {{ settingsSaving ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </header>

        <div class="stg-body">

          <!-- Workspace Path section -->
          <section class="stg-section">
            <div class="stg-section-header">
              <div class="stg-section-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              </div>
              <div>
                <div class="stg-section-title">Workspace Path</div>
                <div class="stg-section-desc">Directory where the agent reads and writes project files</div>
              </div>
            </div>
            <div class="stg-input-wrap">
              <input
                class="stg-input"
                type="text"
                v-model="workspacePathSetting"
                placeholder="Leave empty to use default (./workspace)"
                spellcheck="false"
              />
            </div>
            <p class="stg-select-desc" v-if="workspacePath">
              Current: <span class="stg-path-display">{{ workspacePath }}</span>
            </p>
          </section>

          <!-- Agent Type section -->
          <section class="stg-section">
            <div class="stg-section-header">
              <div class="stg-section-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
              </div>
              <div>
                <div class="stg-section-title">Agent Type</div>
                <div class="stg-section-desc">Select the active agent profile and technology stack</div>
              </div>
            </div>

            <div class="stg-select-wrap">
              <select class="stg-select" v-model="selectedStack">
                <template v-for="(meta, id) in stacksMetadata" :key="id">
                  <option v-if="meta && meta.name" :value="id">{{ meta.name }}</option>
                </template>
              </select>
              <svg class="stg-select-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <p class="stg-select-desc" v-if="stacksMetadata[selectedStack]">{{ stacksMetadata[selectedStack].description }}</p>
          </section>

          <!-- Orchestrator section -->
          <section class="stg-section">
            <div class="stg-section-header">
              <div class="stg-section-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/></svg>
              </div>
              <div>
                <div class="stg-section-title">Orchestrator</div>
                <div class="stg-section-desc">Choose the execution engine for agent runs</div>
              </div>
            </div>

            <div class="stg-option-cards">
              <div class="stg-option-card" :class="{ selected: orchestrator === 'classic' }" @click="orchestrator = 'classic'">
                <div class="stg-card-check"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>
                <div class="stg-card-icon">⚡</div>
                <div class="stg-card-body">
                  <div class="stg-card-title">Classic</div>
                  <div class="stg-card-desc">Direct loop execution — fast and reliable for most tasks</div>
                </div>
              </div>
              <div class="stg-option-card" :class="{ selected: orchestrator === 'langgraph' }" @click="orchestrator = 'langgraph'">
                <div class="stg-card-check"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>
                <div class="stg-card-icon">🔗</div>
                <div class="stg-card-body">
                  <div class="stg-card-title">LangGraph</div>
                  <div class="stg-card-desc">Graph-based workflow — advanced state management and branching</div>
                </div>
              </div>
            </div>
          </section>

          <!-- Review Workflow section -->
          <section class="stg-section">
            <div class="stg-section-header">
              <div class="stg-section-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </div>
              <div>
                <div class="stg-section-title">Review Workflow</div>
                <div class="stg-section-desc">Automate the develop → review → improve cycle</div>
              </div>
            </div>

            <div class="stg-toggles">
              <div class="stg-toggle-row">
                <div class="stg-toggle-info">
                  <div class="stg-toggle-label">Auto Review &amp; Feedback</div>
                  <div class="stg-toggle-desc">Automatically trigger a code review after each developer run completes</div>
                </div>
                <label class="stg-switch">
                  <input type="checkbox" v-model="autoRequestReview">
                  <span class="stg-thumb"></span>
                </label>
              </div>

              <div class="stg-toggle-row">
                <div class="stg-toggle-info">
                  <div class="stg-toggle-label">Follow Review</div>
                  <div class="stg-toggle-desc">When a review finishes, automatically apply its suggestions in a new developer run</div>
                </div>
                <label class="stg-switch">
                  <input type="checkbox" v-model="followReview">
                  <span class="stg-thumb"></span>
                </label>
              </div>

              <div class="stg-toggle-row">
                <div class="stg-toggle-info">
                  <div class="stg-toggle-label">Follow Analysis</div>
                  <div class="stg-toggle-desc">When a system analysis finishes, automatically act on its recommendations</div>
                </div>
                <label class="stg-switch">
                  <input type="checkbox" v-model="followAnalysis">
                  <span class="stg-thumb"></span>
                </label>
              </div>
            </div>
          </section>

          <!-- Execution section -->
          <section class="stg-section">
            <div class="stg-section-header">
              <div class="stg-section-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              </div>
              <div>
                <div class="stg-section-title">Execution</div>
                <div class="stg-section-desc">Performance and safety limits for agent runs</div>
              </div>
            </div>

            <div class="stg-toggles">
              <div class="stg-toggle-row">
                <div class="stg-toggle-info">
                  <div class="stg-toggle-label">Fast Mode</div>
                  <div class="stg-toggle-desc">Skip the THOUGHT step for faster generation (recommended for most tasks)</div>
                </div>
                <label class="stg-switch">
                  <input type="checkbox" v-model="fastMode">
                  <span class="stg-thumb stg-thumb-fast"></span>
                </label>
              </div>

              <div class="stg-toggle-row">
                <div class="stg-toggle-info">
                  <div class="stg-toggle-label">Unlimited Steps</div>
                  <div class="stg-toggle-desc">
                    Remove the step safety limit — agent can run up to 10,000 steps
                    <span class="stg-tag stg-tag-warn">Use with caution</span>
                  </div>
                </div>
                <label class="stg-switch">
                  <input type="checkbox" v-model="unlimitedSteps">
                  <span class="stg-thumb stg-thumb-danger"></span>
                </label>
              </div>
            </div>
          </section>

        </div>
      </template>

      <!-- ── Chat View ─────────────────────────────────────────────── -->
      <template v-else>
      <header class="chat-header">
        <!-- Left: Agent info -->
        <div class="chat-header-left">
          <h1 class="chat-title">{{ stacksMetadata[selectedStack]?.name || 'DevAgent' }}</h1>
          <div class="chat-badge" :class="agentMode">
            <span class="badge-dot"></span>
            <span>{{ agentMode === 'generate' ? 'Developer' : agentMode === 'review' ? 'Reviewer' : 'Analysis' }} · {{ lmModel }}</span>
          </div>
        </div>

        <!-- Right: Controls -->
        <div class="chat-header-right">
          <!-- Mode + Workflow pill group -->
          <div class="header-pill-group">
            <button class="pill-btn" :class="{ active: agentMode === 'analysis' }" @click="agentMode = 'analysis'" title="System Analysis Mode">📊 System Analysis</button>
            <button class="pill-btn" :class="{ active: agentMode === 'generate' }" @click="agentMode = 'generate'" title="Develop Mode">🛠 Developer</button>
            <button class="pill-btn" :class="{ active: agentMode === 'review' }" @click="agentMode = 'review'" title="Audit Mode">⚖️ Audit</button>
          </div>

          <!-- Stop (visible only while running) -->
          <button v-if="running" class="btn-stop" @click="stop">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
            Stop
          </button>


        </div>
      </header>

      <!-- Messages -->
      <div class="messages" ref="msgEl">

        <!-- Welcome screen -->
        <div v-if="!messages.length" class="welcome">
          <div class="welcome-glow"></div>
          <div class="welcome-orb">
            <span v-if="agentMode === 'analysis'">📊</span>
            <span v-else-if="agentMode === 'review'">🔍</span>
            <span v-else>⚡</span>
          </div>
          <h2 class="welcome-title">
            {{ 
              agentMode === 'analysis' ? 'System Architectural Analysis' : 
              agentMode === 'review' ? 'Code Quality Audit' : 
              'What do you want to build?' 
            }}
          </h2>
          <p class="welcome-sub">
            {{ 
              agentMode === 'analysis' ? 'I will deep-scan your codebase, identify the tech stack, and map out the system architecture.' : 
              agentMode === 'review' ? 'I will audit your implementation, check for bugs, and verify architectural adherence.' : 
              'Describe your application and I\'ll generate every file directly into your workspace.' 
            }}
          </p>
          <div class="examples-panel">
            <button
              v-for="ex in currentExamples" :key="ex.label"
              class="example-card" :disabled="running"
              @click="send(ex.prompt)"
            >
              <div class="example-main">
                <span class="example-icon">{{ ex.icon }}</span>
                <div class="example-info">
                  <span class="example-label">{{ ex.label }}</span>
                  <span class="example-sub">{{ ex.sub }}</span>
                </div>
              </div>
              <div class="example-arrow">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>
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
                <button 
                  v-if="agentMode === 'analysis' || (msg.text && msg.text.includes('system_analysis_walkthrough.md'))" 
                  class="msg-action-btn export-btn" 
                  @click="exportAnalysis" 
                  title="Export to HTML"
                >
                  Export HTML
                </button>
                <button class="msg-action-btn copy-btn" title="Copy Message">Copy</button>
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
          <!-- Fast Mode Toggle -->
          <div class="fast-mode-toggle input-fast-mode" v-if="agentMode === 'generate' || agentMode === 'analysis'" title="Skip THOUGHT step for faster generation">
            <label class="switch">
              <input type="checkbox" v-model="fastMode">
              <span class="slider round slider-fast"></span>
            </label>
            <span class="follow-label">Fast Mode</span>
          </div>
          <!-- Unlimited Steps Toggle -->
          <div class="fast-mode-toggle input-fast-mode" title="Disable the safety step limit (max 10,000 steps)">
            <label class="switch">
              <input type="checkbox" v-model="unlimitedSteps">
              <span class="slider round slider-unlimited"></span>
            </label>
            <span class="follow-label">Unlimited Steps</span>
          </div>
          <button class="continue-btn" :disabled="running" @click="handleContinue" title="Continue Generating">
            Continue
          </button>
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

      </template><!-- end chat view -->

    </main>

  </div>
</template>

<script setup>
import { ref, nextTick, computed, onMounted, watch } from 'vue'
import { marked } from 'marked'

// ── Config ────────────────────────────────────────────────────────────────────
const lmEndpoint       = ref('Loading...')
const lmModel          = ref('...')
// ── Dynamic Model List ────────────────────────────────────────────────────────
const availableModels  = ref([])
const selectedModel    = ref('')
const modelConfig      = ref({})

// ── State ─────────────────────────────────────────────────────────────────────
const messages = ref([])
const input    = ref('')
const running  = ref(false)
const showBrowser = ref(true)
const msgEl    = ref(null)
const inputEl  = ref(null)
let   abort    = null

// ── Handoff Loop Guard ──
const handoffCount = ref(0)
const maxAgentLoops = ref(5)

// ── Workspace State ──
const workspacePath        = ref('')   // display only — resolved path from server
const workspacePathSetting = ref('')   // editable in Settings
const fbLoading    = ref(false)
const fbError      = ref('')
const targetFolder = ref(null)

const agentMode    = ref('generate') // 'generate' or 'review'
const fbItems      = ref([])
const currentPath  = ref('.')
const selectedFile = ref(null)
const fileContent  = ref('')
const sessionId    = ref(localStorage.getItem('devagent_session_id') || uid())

// Ensure we have a session ID
if (!localStorage.getItem('devagent_session_id')) {
  localStorage.setItem('devagent_session_id', sessionId.value)
}

function setTargetFolder(path) {
  targetFolder.value = path === targetFolder.value ? null : path
  if (targetFolder.value) {
    localStorage.setItem('devagent_target_folder', targetFolder.value)
  } else {
    localStorage.removeItem('devagent_target_folder')
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
    const payload = data.data || data
    if (!data.success && data.error) throw new Error(data.error)
    if (payload.error) throw new Error(payload.error)
    fbItems.value = (payload.items || []).sort((a, b) => {
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
    const payload = data.data || data
    fileContent.value = payload.content || payload.error || ''
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
const followReview    = ref(false)
const followAnalysis  = ref(false)
const fastMode        = ref(true)
const unlimitedSteps  = ref(false)
const autoRequestReview = ref(false)
const orchestrator    = ref('classic') // 'classic' or 'langgraph'
const settingsSaving  = ref(false)
const settingsSaved   = ref(false)
let _savedTimer = null

// ── Agent Stacks ─────────────────────────────────────────────────────────────
const FALLBACK_STACKS = {
  "default":    { "name": "Default Agent",       "description": "General-purpose AI developer for any project.",         "prompts": ["Create a new Node.js project", "Fix all bugs in the current folder", "Explain this codebase"] },
  "mean_stack": { "name": "MEAN Stack",           "description": "Expert in MongoDB, Express.js, Angular, and Node.",    "prompts": ["Create a Mongoose model for User with JWT auth", "Build an Express REST API", "Implement signup and login service"] },
  "html_css":   { "name": "HTML/CSS/Bootstrap",   "description": "Senior UI/UX Developer with Bootstrap 5 expertise.",  "prompts": ["Build a modern landing page with Bootstrap 5", "Create a responsive navbar and footer", "Create a dark-mode glassmorphism theme"] }
}
const selectedStack   = ref(localStorage.getItem('devagent_selected_stack') || 'default')
const stacksMetadata  = ref({ ...FALLBACK_STACKS })
// Ensure a valid stack is always selected after stacks load from server
watch(stacksMetadata, (meta) => {
  if (!meta[selectedStack.value]) selectedStack.value = 'default'
}, { immediate: false })
const currentView = ref('chat') // 'chat' | 'dashboard'

// ── Dashboard State ───────────────────────────────────────────────────────────
const dashStats        = ref({})
const dashActiveTasks  = ref([])
const dashRecentTasks  = ref([])
const dashHistory      = ref([])
const dashActiveWorkflows = ref([])
const dashRecentWorkflows = ref([])
const dashLogs         = ref([])
const dashLoading      = ref(false)
const dashConnected    = ref(false)
const dashLogFilter    = ref('all')
const dashLogEl        = ref(null)
const dashTaskTab      = ref('active')
const dbExpandedTask   = ref(null)

// Backwards-compat alias used by SSE & old api path
const dashTasks     = dashActiveTasks
const dashWorkflows = dashActiveWorkflows

const allWorkflows = computed(() => {
  const seen = new Set()
  return [...dashActiveWorkflows.value, ...dashRecentWorkflows.value].filter(w => {
    if (seen.has(w.id)) return false; seen.add(w.id); return true
  })
})

const filteredLogs = computed(() => {
  if (dashLogFilter.value === 'all') return dashLogs.value
  return dashLogs.value.filter(l => l.level === dashLogFilter.value)
})

function fmtDuration(ms) {
  if (!ms || ms < 0) return '—'
  if (ms < 1000) return ms + 'ms'
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's'
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000)
  return m + 'm ' + s + 's'
}

function fmtTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function fmtUptime(ms) {
  if (!ms) return '—'
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? h + 'h ' + m + 'm' : m + 'm'
}

function upsertTask(task) {
  const arr = dashActiveTasks.value
  const i = arr.findIndex(t => t.id === task.id)
  if (i >= 0) arr.splice(i, 1, task); else arr.unshift(task)
}
function upsertWorkflow(wf) {
  const arr = dashActiveWorkflows.value
  const i = arr.findIndex(w => w.id === wf.id)
  if (i >= 0) arr.splice(i, 1, wf); else arr.unshift(wf)
}

async function loadDashboard() {
  dashLoading.value = true
  try {
    const res  = await fetch('/api/dashboard')
    const data = await res.json()
    dashStats.value           = data.stats || {}
    dashActiveTasks.value     = data.activeTasks || []
    dashRecentTasks.value     = data.recentTasks || []
    dashHistory.value         = data.taskHistory || []
    dashActiveWorkflows.value = data.activeWorkflows || []
    dashRecentWorkflows.value = data.recentWorkflows || []
    dashLogs.value            = (data.recentLogs || data.logs || []).slice().reverse()
    dashConnected.value = true
  } catch {
    dashConnected.value = false
  } finally {
    dashLoading.value = false
  }
}

async function clearDashboard() {
  try { await fetch('/api/dashboard/clear', { method: 'POST' }) } catch {}
  dashActiveTasks.value = []; dashHistory.value = []; dashActiveWorkflows.value = []
  dashRecentWorkflows.value = []; dashLogs.value = []; dashStats.value = {}
}

let dashSSE = null
function connectDashSSE() {
  if (dashSSE) return
  dashSSE = new EventSource('/api/dashboard/stream')
  dashSSE.onopen = () => { dashConnected.value = true }
  dashSSE.onerror = () => { dashConnected.value = false }

  // Named SSE events from the server
  const onTask = (e) => { try { upsertTask(JSON.parse(e.data)) } catch {} }
  dashSSE.addEventListener('task:created',   onTask)
  dashSSE.addEventListener('task:started',   onTask)
  dashSSE.addEventListener('task:completed', onTask)
  dashSSE.addEventListener('task:failed',    onTask)
  dashSSE.addEventListener('task:step', (e) => {
    try {
      const { taskId, step } = JSON.parse(e.data)
      const t = dashActiveTasks.value.find(t => t.id === taskId)
      if (t) { if (!t.steps) t.steps = []; t.steps.push(step) }
    } catch {}
  })
  dashSSE.addEventListener('workflow:created',  (e) => { try { upsertWorkflow(JSON.parse(e.data)) } catch {} })
  dashSSE.addEventListener('workflow:started',  (e) => { try { upsertWorkflow(JSON.parse(e.data)) } catch {} })
  dashSSE.addEventListener('workflow:progress', (e) => { try { const d = JSON.parse(e.data); upsertWorkflow(d) } catch {} })
  dashSSE.addEventListener('workflow:completed',(e) => { try { upsertWorkflow(JSON.parse(e.data)) } catch {} })
  dashSSE.addEventListener('log:entry', (e) => { try { dashLogs.value.unshift(JSON.parse(e.data)) } catch {} })
  dashSSE.addEventListener('init', (e) => {
    try {
      const d = JSON.parse(e.data)
      if (d.stats)             dashStats.value           = d.stats
      if (d.activeTasks)       dashActiveTasks.value     = d.activeTasks
      if (d.recentTasks)       dashRecentTasks.value     = d.recentTasks
      if (d.taskHistory)       dashHistory.value         = d.taskHistory
      if (d.activeWorkflows)   dashActiveWorkflows.value = d.activeWorkflows
      if (d.recentWorkflows)   dashRecentWorkflows.value = d.recentWorkflows
      if (d.recentLogs)        dashLogs.value            = d.recentLogs.slice().reverse()
      dashConnected.value = true
    } catch {}
  })
  dashSSE.addEventListener('dashboard:cleared', () => {
    dashActiveTasks.value = []; dashHistory.value = []
    dashActiveWorkflows.value = []; dashLogs.value = []; dashStats.value = {}
  })
}

async function fetchStacks() {
  try {
    const res = await fetch('/api/agent/stacks')
    if (!res.ok) throw new Error('API error')
    const data = await res.json()
    // Merge server data with fallback (server data takes priority)
    Object.keys(data).forEach(id => {
      stacksMetadata.value[id] = { ...FALLBACK_STACKS[id], ...data[id] }
    })
  } catch (e) {
    console.warn('[DevAgent] Using fallback stacks data:', e.message)
  }
}
fetchStacks()

// selectStack — navigate to chat after picking from nav (legacy use)
function selectStack(id) {
  selectedStack.value = id
  localStorage.setItem('devagent_selected_stack', id)
  currentView.value = 'chat'
}


function openDashboard() {
  currentView.value = 'dashboard'
  loadDashboard()
  connectDashSSE()
}

// ── Settings ─────────────────────────────────────────────────────────────────

async function loadSettings() {
  try {
    const res  = await fetch('/api/settings')
    const data = await res.json()
    if (data.success && data.data) {
      const s = data.data
      selectedStack.value        = s.agentType         ?? 'default'
      orchestrator.value         = s.orchestrator      ?? 'classic'
      followReview.value         = s.followReview      ?? false
      followAnalysis.value       = s.followAnalysis     ?? false
      autoRequestReview.value    = s.autoRequestReview ?? false
      fastMode.value             = s.fastMode          ?? true
      unlimitedSteps.value       = s.unlimitedSteps     ?? false
      workspacePathSetting.value = s.workspacePath      ?? ''
    }
  } catch (e) {
    console.warn('[Settings] Failed to load settings:', e)
  }
}

async function saveSettings() {
  clearTimeout(_savedTimer)
  settingsSaving.value = true
  settingsSaved.value  = false
  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentType:         selectedStack.value,
        orchestrator:      orchestrator.value,
        followReview:      followReview.value,
        followAnalysis:    followAnalysis.value,
        autoRequestReview: autoRequestReview.value,
        fastMode:          fastMode.value,
        unlimitedSteps:    unlimitedSteps.value,
        workspacePath:     workspacePathSetting.value,
      })
    })
    settingsSaved.value = true
    _savedTimer = setTimeout(() => { settingsSaved.value = false }, 2500)
    // Refresh health & file browser to reflect new workspace
    try {
      const hr = await fetch('/api/agent/health')
      const hd = await hr.json()
      workspacePath.value = hd.workspace
    } catch (_) {}
    currentPath.value = '.'
    loadFiles()
  } catch (e) {
    console.error('[Settings] Failed to save:', e)
  } finally {
    settingsSaving.value = false
  }
}

async function resetSettings() {
  try {
    const res  = await fetch('/api/settings/reset', { method: 'POST' })
    const data = await res.json()
    if (data.success && data.data) {
      const s = data.data
      selectedStack.value        = s.agentType         ?? 'default'
      orchestrator.value         = s.orchestrator      ?? 'classic'
      followReview.value         = s.followReview      ?? false
      followAnalysis.value       = s.followAnalysis     ?? false
      autoRequestReview.value    = s.autoRequestReview ?? false
      fastMode.value             = s.fastMode          ?? true
      unlimitedSteps.value       = s.unlimitedSteps     ?? false
      workspacePathSetting.value = s.workspacePath      ?? ''
    }
  } catch (e) {
    console.error('[Settings] Failed to reset:', e)
  }
}

const currentPresets = computed(() => {
  const meta = stacksMetadata.value[selectedStack.value]
  if (!meta || !meta.prompts) return presets // Fallback to hardcoded presets
  
  const icons = { 'default': '🏗', 'mean_stack': '🍃', 'html_css': '🎨' }
  return meta.prompts.map(p => ({
    icon: icons[selectedStack.value] || '✨',
    label: p.length > 20 ? p.slice(0, 20) + '...' : p,
    prompt: p
  }))
})

const analysisExamples = [
  { icon: '📊', label: 'Analyze Architecture', sub: 'Tech stack & structure audit', prompt: 'Perform a deep scan of the project and analyze its core architecture and technology stack.' },
  { icon: '🗺️', label: 'Map Modules', sub: 'Identify features & responsibilities', prompt: 'Map out all major modules and components in this workspace and document their responsibilities.' },
  { icon: '⚖️', label: 'Audit Quality', sub: 'Analyze best practices & modularity', prompt: 'Audit the code quality, modularity, and adherence to industry best practices for this stack.' },
  { icon: '🚀', label: 'Future Roadmap', sub: 'Recommendations for improvement', prompt: 'Analyze the current system and provide high-level architectural recommendations for future development.' },
]

const currentExamples = computed(() => {
  if (agentMode.value === 'analysis') {
    const icons = { 'default': '🔬', 'mean_stack': '📊', 'html_css': '🎨' }
    const icon = icons[selectedStack.value] || '📊'
    return analysisExamples.map(ex => ({
      ...ex,
      icon,
      sub: `System Analysis (${stacksMetadata.value[selectedStack.value]?.name || 'Standard'})`
    }))
  }

  const meta = stacksMetadata.value[selectedStack.value]
  const icons = { 'default': '🏗', 'mean_stack': '🍃', 'html_css': '🎨' }
  const stackIcon = icons[selectedStack.value] || '✨'
  if (!meta || !meta.prompts) return examples // Fallback to hardcoded examples
  return meta.prompts.map(p => ({
    icon: stackIcon,
    label: p,
    sub: meta.name,
    prompt: p
  }))
})

// ── Send message ──────────────────────────────────────────────────────────────
async function send(text, isAutoHandoff = false) {
  let msg = (text || input.value).trim()

  // Reset handoff count if this is a fresh user request
  if (!isAutoHandoff) {
    handoffCount.value = 0
  }

  const tags = []
  if (targetFolder.value) tags.push(`[TARGET FOLDER: ${targetFolder.value}]`)
  if (agentMode.value)    tags.push(`[MODE: ${agentMode.value.toUpperCase()}]`)
  if (followReview.value && agentMode.value === 'generate') tags.push(`[FOLLOW REVIEW]`)
  if (followAnalysis.value && agentMode.value === 'generate') tags.push(`[FOLLOW ANALYSIS]`)
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

  let wasReviewRequested = false
  let wasFixOrdered = false
  let wasReportSaved = false

  const history = []
  messages.value.slice(0, idx).forEach(m => {
    if (!m.text && (!m.activity || m.activity.length === 0)) return
    
    // Add the main message (Assistant thoughts/action or User prompt)
    history.push({ role: m.role, content: m.text || '' })
    
    // If it's an assistant message, append any tool results as subsequent 'user' messages
    if (m.role === 'assistant' && m.activity) {
      m.activity.forEach(act => {
        if (act.type === 'tool' && act.done && act.result) {
          history.push({ 
            role: 'user', 
            content: `Tool result (${act.tool}):\n${JSON.stringify(act.result, null, 2)}` 
          })
        } else if (act.type === 'error') {
          history.push({ role: 'user', content: `Error: ${act.text}` })
        }
      })
    }
  })

  try {
    const res = await fetch('/api/agent/run', {
      method  : 'POST',
      headers : { 'Content-Type': 'application/json' },
      body    : JSON.stringify({ 
        messages: history, 
        fastMode: fastMode.value, 
        unlimitedSteps: unlimitedSteps.value,
        autoRequestReview: autoRequestReview.value,
        sessionId: sessionId.value,
        stack: selectedStack.value,
        orchestrator: orchestrator.value
      }),
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
          try { 
            const ev = JSON.parse(line.slice(6));
            applyEvent(ev, idx); 
            
            if (ev.type === 'tool_result' && WRITE_TOOLS.has(ev.tool)) {
              console.log(`[DevAgent] Tool ${ev.tool} finished. Refreshing file list...`);
              loadFiles();
            }
            if (ev.type === 'tool_call' && ev.tool === 'request_review') {
              console.log('[DevAgent] 🛠 Review requested by agent.');
              wasReviewRequested = true;
            }
            if (ev.type === 'tool_call' && ev.tool === 'order_fix') {
              console.log('[DevAgent] 🛠 Fix ordered by reviewer.');
              wasFixOrdered = true;
            }
            if (ev.type === 'tool_call' && ev.tool === 'write_file') {
              const p = ev.parameters || {};
              const targetPath = String(p.path || p.file || '').toLowerCase();
              if (targetPath.endsWith('reviewer_walkthrough.md') || targetPath.endsWith('system_analysis_walkthrough.md')) {
                console.log('[DevAgent] 🛠 Report saving initiated:', targetPath);
                wasReportSaved = true;
              }
            }
          } catch { /* ignore */ }
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
    if (showBrowser.value) loadFiles()

    // 🔄 AUTOMATED WORKFLOW: Dev -> Review -> Dev cycle
    const isDevMode = agentMode.value === 'generate';
    const isReviewMode = agentMode.value === 'review';
    const isAnalysisMode = agentMode.value === 'analysis';
    
    // HISTORY-AWARE DETECTION: Look back through the whole chat for the report and fix orders
    // This ensures handoff works even if the report was saved in a previous turn!
    let sessionReportSaved = wasReportSaved;
    let sessionFixOrdered = wasFixOrdered;

    if (!sessionReportSaved || !sessionFixOrdered) {
      messages.value.forEach(m => {
        if (!m.activity) return;
        m.activity.forEach(act => {
          if (act.type === 'tool_call' || act.type === 'tool') {
            if (act.tool === 'order_fix') sessionFixOrdered = true;
            if (act.tool === 'write_file' || act.tool === 'bulk_write') {
              const p = act.parameters || {};
              const targetPath = String(p.path || p.file || '').toLowerCase();
              if (targetPath.endsWith('reviewer_walkthrough.md') || targetPath.endsWith('system_analysis_walkthrough.md')) sessionReportSaved = true;
            }
          }
        });
      });
    }

    const currentMsgText = messages.value[idx].text || '';
    const isOk = /\[CODE:\s*OK\]/i.test(currentMsgText);
    const isNotOk = /\[CODE:\s*NOT\s*OK\]/i.test(currentMsgText);
    const isAnalysisComplete = /\[ANALYSIS:\s*COMPLETE\]/i.test(currentMsgText);

    // AUTO-CONTINUE ANALYSIS HANGS:
    if (isAnalysisMode && !isAnalysisComplete && !currentMsgText.includes('❌') && !currentMsgText.includes('aborted:') && !currentMsgText.includes('MAX_STEPS')) {
      console.log('[DevAgent] 🔄 Analysis incomplete/hanging, auto-continuing...');
      messages.value[idx].status = `🔄 Analysis continuing...`;
      setTimeout(() => {
        handleContinue();
      }, 1000);
      return;
    }
    
    // Accepted only if report is saved, marked OK, and NO fixes were ordered, and NOT marked NOT OK
    const isAccepted = sessionReportSaved && isOk && !sessionFixOrdered && !isNotOk;

    console.log(`[DevAgent] Fin: mode=${agentMode.value} auto=${autoRequestReview.value} report=${sessionReportSaved} fix=${sessionFixOrdered} ok=${isOk} notOk=${isNotOk} accepted=${isAccepted}`);

    if (handoffCount.value >= maxAgentLoops.value && autoRequestReview.value) {
      console.warn(`[DevAgent] 🛑 Agent loop limit reached (${maxAgentLoops.value}). Stopping automatic handoff.`);
      messages.value[idx].status = `⚠️ Loop limit reached (${maxAgentLoops.value})`;
      setTimeout(() => { messages.value[idx].status = null; }, 5000);
      return;
    }

    if (isDevMode && wasReviewRequested && autoRequestReview.value) {
      console.log('[DevAgent] 🔄 Auto-triggering Review handoff...');
      handoffCount.value++;
      messages.value[idx].status = `🔄 Handoff to Reviewer (${handoffCount.value}/${maxAgentLoops.value})...`;
      agentMode.value = 'review';
      setTimeout(() => {
        messages.value[idx].status = null;
        // Log and then send — let send() inject the [MODE: REVIEW] tag automatically.
        appendHandoffLog('DEV → REVIEW', 'Developer finished implementation. Requesting review feedback/orders.');
        send('Developer has finished. Please analyze the code and send feedback/orders.', true);
      }, 1000);
    } else if (isReviewMode && (isOk || isNotOk || sessionFixOrdered)) {
      agentMode.value = 'generate';
      if (!isAccepted && (sessionReportSaved || sessionFixOrdered || isNotOk) && autoRequestReview.value) {
        console.log('[DevAgent] 🔄 Auto-triggering Developer return (Report:', sessionReportSaved, 'FixOrdered:', sessionFixOrdered, 'isNotOk:', isNotOk, ')');
        handoffCount.value++;
        messages.value[idx].status = `🔄 Returning to Developer (${handoffCount.value}/${maxAgentLoops.value})...`;
      setTimeout(() => {
        messages.value[idx].status = null;
        // Log and then send — let send() inject [MODE: GENERATE] + tags automatically.
        appendHandoffLog(
          'REVIEW → DEV',
          `Reviewer responded with ${isNotOk ? '[CODE: NOT OK]' : 'issues/fix orders'}. Returning to developer to apply fixes.`
        );
        send(`[WORKFLOW: UPDATE] [FOLLOW REVIEW] [CODE: NOT OK]
The reviewer has rejected the current implementation.
You are now in a HARD LOCK. You MUST:
1. Read "reviewer_walkthrough.md" immediately.
2. Fix the issues mentioned in the report.
3. Update "developer_walkthrough.md" with your changes.
4. MANDATORY: Call "request_review" to hand back to the reviewer.
5. ONLY then call "finish".`, true);
      }, 1000);
      } else if (isAccepted) {
        console.log('[DevAgent] ✅ Review accepted. Loop complete.');
        messages.value[idx].status = '✅ Code Accepted';
        setTimeout(() => { messages.value[idx].status = null; }, 4000);
      }
    } else if (isReviewMode && autoRequestReview.value) {
      console.log('[DevAgent] ⚠️ Auto-loop criteria NOT met. Ensure report is saved and [CODE: OK/NOT OK] verdict is present.');
    }
  }
}

// ── Handoff logging helper ─────────────────────────────────────────────────────
async function appendHandoffLog(direction, details) {
  try {
    const timestamp = new Date().toLocaleString()
    const entry =
      `\n[${timestamp}] HANDOFF: ${direction}\n` +
      `${details}\n` +
      `${'-'.repeat(40)}\n`

    // Read existing log (if any)
    let previous = ''
    try {
      const res = await fetch('/api/files/read?path=agent-handoff.log')
      if (res.ok) {
        const data = await res.json()
        if (data && typeof data.content === 'string') previous = data.content
      }
    } catch { /* ignore */ }

    // Write back with appended entry
    await fetch('/api/files/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: 'agent-handoff.log',
        content: previous + entry
      })
    })
  } catch {
    // Logging must never break the main flow
  }
}

function submit() { send(input.value) }

const WRITE_TOOLS = new Set(['write_file', 'replace_in_file', 'bulk_write', 'apply_blueprint', 'scaffold_project'])

// Intelligent continue: Extracts the last directory or file the agent was working in before stopping
function handleContinue() {
  let contextTarget = '';
  const isAnalysis = agentMode.value === 'analysis';
  const DISCOVERY_TOOLS = new Set(['read_file', 'list_files', 'bulk_read', ...WRITE_TOOLS]);
  
  // Backwards scan through messages to find the last assistant message with tool activity
  for (let i = messages.value.length - 1; i >= 0; i--) {
    const msg = messages.value[i];
    if (msg.role === 'assistant' && msg.activity && msg.activity.length > 0) {
      // Backwards scan through the activities to find the last relevant action
      for (let j = msg.activity.length - 1; j >= 0; j--) {
        const act = msg.activity[j];
        if (act.type === 'tool' && DISCOVERY_TOOLS.has(act.tool) && act.detail) {
          // act.detail is usually the file path or directory
          if (act.tool === 'list_files') {
            contextTarget = act.detail;
          } else {
            const pathParts = act.detail.split(/[\/\\]/);
            if (pathParts.length > 1) {
              pathParts.pop();
              contextTarget = pathParts.join('/');
            }
          }
          break;
        }
      }
    }
    if (contextTarget) break;
  }

  let prompt = 'Please continue exactly where you left off. Do not repeat what you already wrote, just continue the code/text immediately from the cutoff point.';
  
  if (isAnalysis) {
    prompt = `[CONTINUE ANALYSIS] Please continue your forensic audit exactly where you left off. 
If you were scanning a directory, finish it. 
If you were writing a section of the report, continue the next section. 
REMINDER: You MUST provide the Exhaustive Schemas, Coding Conventions, and Cloning Blueprint before finishing.`;
  }

  if (contextTarget) {
    prompt = `[LAST CONTEXT: ${contextTarget}/] ${prompt} Note: You were last active in or around the "${contextTarget}/" directory.`;
  }
  
  send(prompt);
}

async function stop() {
  if (abort) abort.abort()
  running.value = false
  try {
    await fetch('/api/agent/stop', { method: 'POST' })
  } catch (e) { console.warn('[Stop Error]', e) }
}

const exportAnalysis = async () => {
  try {
    const url = '/api/agent/export-analysis';
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'system_analysis_walkthrough.html');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.error('Export failed:', err);
    alert('Failed to export analysis report.');
  }
}

async function clearChat() {
  if (sessionId.value) {
    try {
      await fetch('/api/agent/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId.value })
      })
    } catch (e) {
      console.warn('[Session] Failed to clear server session:', e)
    }
  }
  messages.value = []
  sessionId.value = uid()
  localStorage.setItem('devagent_session_id', sessionId.value)
}


// ── SSE event handler ─────────────────────────────────────────────────────────

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
    if (last) {
      last.done = true
      // Store the result content for history persistence
      last.result = ev.result 
    }
  } else if (ev.type === 'tool_error') {
    // In review mode, suppress the "write tool is disabled" error cards — they're
    // an internal agent correction, not something the user needs to see.
    if (inReview && ev.tool && WRITE_TOOLS.has(ev.tool)) return
    msg.activity = [...msg.activity, { type: 'error', text: `${ev.tool}: ${ev.error}` }]
  } else if (ev.type === 'response') {
    const hasWrittenDoc = msg.activity?.some(a => a.type === 'tool' && a.tool === 'write_file' && (a.detail?.includes('developer_walkthrough.md') || a.detail?.includes('implementation.md') || a.detail?.includes('reviewer_walkthrough.md')));
    
    // Final sync
    let finalContent = ev.content || '';
    if (hasWrittenDoc && !finalContent.includes('✅')) {
       if (inReview) {
         finalContent += `\n\n---\n**✅ Code Audit Complete.** The \`reviewer_walkthrough.md\` has been successfully updated.`;
       } else if (msg.activity?.some(a => a.type === 'tool' && a.tool === 'write_file' && a.detail?.includes('developer_walkthrough.md'))) {
         finalContent += `\n\n---\n**✅ AI Generation Complete.** The \`developer_walkthrough.md\` report has been successfully updated at the project root.`;
       }
    }

    if (inReview && msg.text && !msg.text.includes(ev.content)) {
      msg.text += '\n\n---\n\n' + finalContent
    } else {
      msg.text = finalContent
    }
    msg.display = msg.text 
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

async function loadModels() {
  try {
    const res = await fetch('/api/models')
    const data = await res.json()
    if (data.models) availableModels.value = data.models
    if (data.config) modelConfig.value = data.config
    updateActiveModelDisplay()
  } catch (e) {
    console.error('[Models Load Error]', e)
  }
}

function updateActiveModelDisplay() {
  if (!modelConfig.value) return
  let mode = 'dev'
  if (agentMode.value === 'review') mode = 'review'
  else if (agentMode.value === 'analysis') mode = 'analysis'

  const modelId = modelConfig.value[mode] || modelConfig.value['global']
  if (modelId) {
    lmModel.value = modelId
  }
}

watch(agentMode, updateActiveModelDisplay)

onMounted(async () => {
  // Load persistence
  const savedFolder = localStorage.getItem('devagent_target_folder')
  if (savedFolder) targetFolder.value = savedFolder

  try {
    const res = await fetch('/api/agent/health')
    const data = await res.json()
    lmEndpoint.value = data.endpoint
    lmModel.value = data.model
    workspacePath.value = data.workspace
    if (data.maxAgentLoops) maxAgentLoops.value = data.maxAgentLoops
  } catch (e) {
    lmEndpoint.value = 'Offline'
  }
  loadModels()
  loadFiles()
  loadSettings()

  // Global Copy Logic: Handles both Thought callouts and Full Message bubbles
  window.addEventListener('click', async (e) => {
    // Handle Thought Toggling
    const toggle = e.target.closest('.thought-toggle');
    if (toggle) {
      const container = toggle.closest('.thought-container');
      const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', !isExpanded);
      container.classList.toggle('collapsed', isExpanded);
      container.classList.toggle('expanded', !isExpanded);
      return;
    }

    const btn = e.target.closest('.thought-copy, .copy-btn');
    if (!btn) return;
    
    let textToCopy = '';
    
    if (btn.classList.contains('thought-copy')) {
      const container = btn.closest('.thought-container');
      textToCopy = container?.querySelector('.thought-content')?.innerText || '';
    } else if (btn.classList.contains('copy-btn')) {
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

  // Load session history
  if (sessionId.value) {
    try {
      const res = await fetch(`/api/agent/session/${sessionId.value}`)
      const data = await res.json()
      if (data.history && data.history.length > 0) {
        messages.value = data.history.map(m => ({
          id: uid(),
          role: m.role,
          text: m.content,
          streaming: false,
          activity: []
        }))
        await nextTick()
        await scrollDown()
      }
    } catch (e) {
      console.warn('[Session] Failed to load history:', e)
    }
  }
})

// ── Markdown renderer ─────────────────────────────────────────────────────────
// ── Markdown renderer ─────────────────────────────────────────────────────────
function md(text) {
  if (!text) return '';
  
  // Extract and Handle Thought Callouts safely out of marked pipeline
  let thoughts = [];
  let processText = text.replace(/(?:^|\n)THOUGHT[:\s]*([\s\S]*?)(?=(?:\n(?:THOUGHT|ACTION):)|$)/gi, (match, content) => {
    if (!content.trim()) return '';
    const index = thoughts.length;
    // We parse the thought content with marked too, so it looks nice
    thoughts.push(`
      <div class="thought-container collapsed">
        <div class="thought-section-header">
          <div class="thought-header-left">
            <button class="thought-toggle" aria-expanded="false" title="Toggle Thought">
              <span class="thought-chevron">▶</span>
              <span class="thought-tag">THOUGHT</span>
            </button>
          </div>
          <button class="thought-copy" title="Copy Thought">Copy</button>
        </div>
        <div class="thought-wrapper">
          <div class="thought-ca">
            <div class="thought-content">${content.trim()}</div>
          </div>
        </div>
      </div>
    `.trim());
    return `\n\n__THOUGHT_MARKER_${index}__\n\n`;
  });

  // Render standard markdown
  let htmlResult = marked.parse(processText);

  // Re-inject thought HTML 
  thoughts.forEach((thoughtHtml, index) => {
    // marked wraps it in <p> because of the inline placeholder
    htmlResult = htmlResult.replace(`<p>__THOUGHT_MARKER_${index}__</p>`, thoughtHtml);
    htmlResult = htmlResult.replace(`__THOUGHT_MARKER_${index}__`, thoughtHtml); 
  });
  
  return htmlResult;
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
  --purple: #8b5cf6;
  --purple-dim: rgba(139, 92, 246, 0.1);
  
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
  background: #080a10;
}

/* ── Left Nav Sidebar ────────────────────────────────────────────────────── */
.nav-sidebar {
  width: 200px;
  min-width: 200px;
  background: #080a10;
  border-right: 1px solid rgba(255,255,255,0.05);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
}

.nav-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 16px 18px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  flex-shrink: 0;
}

.nav-logo-icon {
  width: 32px; height: 32px;
  background: linear-gradient(135deg, rgba(91,156,255,0.18), rgba(64,128,255,0.08));
  border: 1px solid rgba(91,156,255,0.22);
  border-radius: 9px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}

.nav-logo-text {
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  letter-spacing: -.02em;
}

.nav-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 10px;
  flex: 1;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 8px;
  width: 100%;
  text-align: left;
  color: rgba(255,255,255,0.45);
  font-size: 13px;
  font-weight: 500;
  transition: all .15s;
  cursor: pointer;
  border: 1px solid transparent;
}
.nav-item:hover {
  background: rgba(255,255,255,0.05);
  color: rgba(255,255,255,0.85);
  border-color: rgba(255,255,255,0.06);
}
.nav-item.active {
  background: rgba(59,130,246,0.1);
  color: var(--accent);
  border-color: rgba(59,130,246,0.2);
}
.nav-item svg { flex-shrink: 0; opacity: 0.8; }
.nav-item:hover svg, .nav-item.active svg { opacity: 1; }

.nav-chevron { transition: transform .2s; flex-shrink: 0; }
.nav-chevron.open { transform: rotate(180deg); }

.nav-submenu {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 3px 0 3px 10px;
}

.nav-subitem {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 10px;
  border-radius: 6px;
  width: 100%;
  text-align: left;
  color: rgba(255,255,255,0.4);
  font-size: 12px;
  font-weight: 500;
  transition: all .15s;
  cursor: pointer;
  border: 1px solid transparent;
  background: none;
}
.nav-subitem:hover {
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.75);
}
.nav-subitem.active {
  background: rgba(59,130,246,0.1);
  color: var(--accent);
  border-color: rgba(59,130,246,0.18);
}
.nav-subitem-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.nav-bottom {
  padding: 16px;
  border-top: 1px solid rgba(255,255,255,0.04);
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-status-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  transition: all .3s;
}
.nav-status-dot.idle {
  background: rgba(255,255,255,0.15);
}
.nav-status-dot.running {
  background: var(--green);
  box-shadow: 0 0 6px rgba(16,185,129,0.6);
  animation: glow-pulse 1.4s ease-in-out infinite;
}

/* ── Workspace Sidebar ───────────────────────────────────────────────────── */
.sidebar {
  width: 256px;
  min-width: 256px;
  background: #0b0d15;
  border-right: 1px solid rgba(255,255,255,0.04);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  flex-shrink: 0;
}

.sidebar-title-wrap { display: flex; flex-direction: column; gap: 2px; }
.sidebar-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .1em;
  color: rgba(255,255,255,0.3);
  text-transform: uppercase;
}
.sidebar-ws-path {
  font-size: 10px; font-family: 'JetBrains Mono', monospace;
  color: var(--green, #4ade80); opacity: 0.7;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;
}

.sidebar-section { padding: 16px 14px 0; }


/* ── Sidebar Workspace (inline file browser) ────────────────────────────── */
.sidebar-workspace {
  flex: 1; min-height: 0;
  display: flex; flex-direction: column;
  padding: 10px 12px 0;
  overflow-y: auto;
}
.sidebar-workspace .sidebar-label { margin-bottom: 6px; }
.fb-header-inline {
  display: flex; align-items: center; justify-content: flex-end;
  margin-bottom: 4px;
}
.icon-btn-sm {
  display: flex; align-items: center; justify-content: center;
  width: 24px; height: 24px;
  border-radius: 6px; color: var(--t2);
  transition: all .15s; cursor: pointer;
}
.icon-btn-sm:hover:not(:disabled) { background: rgba(255,255,255,0.06); color: var(--t0); }
.icon-btn-sm:disabled { opacity: .4; cursor: not-allowed; }
.fb-path-bar.compact { padding: 4px 0; font-size: 11px; }
.sidebar-fb-list { max-height: none; }
.sidebar-workspace .fb-preview-code { max-height: 200px; }

/* ── Sidebar Workspace header ───────────────────────────────────────────── */

.sidebar-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .12em;
  color: rgba(255,255,255,0.25);
  padding: 0 6px;
  margin-bottom: 10px;
  text-transform: uppercase;
}

.nav { display: flex; flex-direction: column; gap: 2px; }

.preset {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 8px;
  width: 100%;
  text-align: left;
  color: rgba(255,255,255,0.55);
  font-size: 13px;
  transition: all .15s;
  border: 1px solid transparent;
}
.preset:hover:not(:disabled) {
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.85);
  border-color: rgba(255,255,255,0.06);
}
.preset:disabled { opacity: .3; cursor: default; }
.preset-icon { font-size: 14px; width: 20px; text-align: center; flex-shrink: 0; }
.preset-label { flex: 1; font-weight: 500; }

.sidebar-spacer { flex: 1; }

.sidebar-footer {
  padding: 16px;
  border-top: 1px solid rgba(255,255,255,0.04);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  align-self: flex-start;
  transition: all .3s;
}
.status-pill.idle {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.4);
}
.status-pill.running {
  background: rgba(61,220,132,0.08);
  border: 1px solid rgba(61,220,132,0.25);
  color: var(--green);
}

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
  color: rgba(255,255,255,0.25);
  font-family: var(--mono);
}

.clear-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 12px;
  width: 100%;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 8px;
  color: rgba(255,255,255,0.4);
  font-size: 12px; font-weight: 500;
  transition: all .15s;
}
.clear-btn:hover:not(:disabled) {
  background: rgba(255,107,107,.06);
  border-color: rgba(255,107,107,.2);
  color: var(--red);
}
.clear-btn:disabled { opacity: .25; cursor: default; }

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
.fb-crumb.home { font-size: 13px; color: var(--t2); }
.fb-sep { color: var(--t3); font-size: 11px; margin: 0 1px; }

/* ── Breadcrumb Pinning ── */
.fb-crumb-wrap {
  display: flex; align-items: center; background: var(--bg3); 
  border-radius: 4px; border: 1px solid var(--border);
  transition: all 0.2s;
}
.fb-crumb-wrap.pinned {
  background: rgba(255, 209, 102, .08);
  border-color: rgba(255, 209, 102, .4);
}
.fb-crumb-pin {
  background: transparent; border: none; padding: 2px 5px;
  cursor: pointer; opacity: 0.3; font-size: 10px;
  transition: opacity 0.2s;
}
.fb-crumb-wrap:hover .fb-crumb-pin, .fb-crumb-wrap.pinned .fb-crumb-pin { opacity: 1; }

.fb-pin-btn-top {
  margin-left: auto;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 10px; font-weight: 700;
  border: 1px solid var(--border2);
  color: var(--t2);
  transition: all .15s;
  cursor: pointer;
  background: var(--bg3);
}
.fb-pin-btn-top:hover, .fb-pin-btn-top.pinned {
  background: rgba(255, 209, 102, .12);
  border-color: rgba(255, 209, 102, .5);
  color: var(--yellow);
  box-shadow: 0 0 12px rgba(255, 209, 102, 0.1);
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
.fb-item.pinned {
  background: rgba(255, 209, 102, .06);
  border: 1px solid rgba(255, 209, 102, .15);
}

.fb-back { color: var(--t2); }
.fb-dir .fb-name { font-weight: 500; color: var(--t0); }
.fb-item-pin {
  background: transparent; border: none; padding: 4px;
  cursor: pointer; opacity: 0; font-size: 11px;
  transition: all 0.2s;
  border-radius: 4px;
}
.fb-item:hover .fb-item-pin { opacity: 0.4; }
.fb-item-pin:hover, .fb-item-pin.active { opacity: 1 !important; transform: scale(1.1); }
.fb-item-pin.active { color: var(--yellow); }

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
  background: #0a0c12;
}

/* ── Chat Header ─────────────────────────────────────────────────────────── */
.chat-header {
  display: flex; align-items: center; justify-content: space-between;
  height: auto; min-height: 54px; padding: 0 20px;
  background: rgba(8,10,16,0.85);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(255,255,255,0.05);
  flex-shrink: 0; gap: 12px;
}
.chat-header-left { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.chat-header-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; flex-wrap: wrap; }


/* Pill group for Mode+Workflow */
.header-pill-group {
  display: flex; align-items: center; gap: 2px;
  background: rgba(255,255,255,0.03); padding: 3px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.06);
}
.pill-btn {
  padding: 5px 12px; font-size: 11.5px; font-weight: 500;
  color: rgba(255,255,255,0.35); border-radius: 6px;
  transition: all 0.15s; cursor: pointer;
}
.pill-btn.active {
  background: rgba(255,255,255,0.06); color: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.3); font-weight: 600;
}
.pill-btn:hover:not(.active) { color: var(--t1); background: var(--bg3); }
.pill-sep { width: 1px; height: 14px; background: var(--border2); margin: 0 3px; }

/* Model select inline in badge */
.model-select-inline {
  background: none; border: none; color: inherit;
  font-size: 11px; font-weight: 500; font-family: var(--mono);
  cursor: pointer; outline: none; padding: 0; max-width: 160px;
}
.model-select-inline option { background: var(--bg1); color: var(--t1); }

/* Icon-only button */
.btn-icon {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px;
  border: 1px solid var(--border2);
  border-radius: var(--r-sm); color: var(--t2);
  transition: all .15s;
}
.btn-icon:hover:not(:disabled) { background: var(--bg3); color: var(--t0); border-color: var(--border3); }
.btn-icon:disabled { opacity: .4; cursor: not-allowed; }

.chat-title {
  font-size: 15px; font-weight: 700; color: #fff;
  letter-spacing: -.02em;
}
.chat-badge {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 12px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 20px;
  font-size: 11px; font-weight: 500; color: rgba(255,255,255,0.45);
  font-family: var(--mono);
  transition: all .3s;
}
.chat-badge.review { color: var(--accent); border-color: rgba(59, 130, 246, 0.2); background: rgba(59, 130, 246, 0.05); }
.chat-badge.analysis { color: var(--purple); border-color: rgba(139, 92, 246, 0.2); background: rgba(139, 92, 246, 0.05); }

.chat-badge.review .badge-dot { background: var(--accent); }
.chat-badge.analysis .badge-dot { background: var(--purple); }
.chat-header-right {
  display: flex; align-items: center; gap: 14px;
}

.model-selector {
  display: flex; align-items: center; gap: 8px;
  background: var(--bg3);
  border: 1px solid var(--border2);
  border-radius: var(--r-sm);
  padding: 4px 10px;
  color: var(--t2);
  transition: all .15s;
}
.model-selector:hover {
  border-color: var(--border3);
  color: var(--t1);
}

.model-select {
  background: none;
  border: none;
  color: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  outline: none;
  padding-right: 4px;
}
.model-select option {
  background: var(--bg1);
  color: var(--t1);
}

.header-sep {
  width: 1px; height: 16px;
  background: var(--border);
  opacity: .5;
}

.follow-review-toggle {
  display: flex; align-items: center; gap: 10px;
}
.follow-label { font-size: 11px; font-weight: 600; color: var(--t2); text-transform: uppercase; letter-spacing: 0.03em; }

/* Orchestrator Toggle */
.orchestrator-toggle {
  display: flex; align-items: center; gap: 8px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 20px;
  padding: 3px 12px 3px 3px;
  transition: all 0.3s;
}
.orchestrator-toggle.active {
  border-color: rgba(61, 220, 132, 0.3);
  background: rgba(61, 220, 132, 0.05);
}
.orchestrator-label {
  font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.3);
  text-transform: uppercase; letter-spacing: 0.05em;
}
.orchestrator-toggle.active .orchestrator-label {
  color: var(--green);
}
.orchestrator-toggle .slider-langgraph {
  background-color: rgba(61, 220, 132, 0.2);
  border-color: var(--green);
}
.orchestrator-toggle .slider-langgraph:before {
  background-color: var(--green);
}

/* Switch design */
.switch {
  position: relative;
  display: inline-block;
  width: 32px;
  height: 18px;
}
.switch input { opacity: 0; width: 0; height: 0; }
.slider {
  position: absolute;
  cursor: pointer;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: var(--bg3);
  border: 1px solid var(--border2);
  transition: .4s;
}
.slider:before {
  position: absolute;
  content: "";
  height: 12px; width: 12px;
  left: 3px; bottom: 2px;
  background-color: var(--t3);
  transition: .4s;
}
input:checked + .slider {
  background-color: var(--green-dim);
  border-color: var(--green);
}
input:checked + .slider:before {
  transform: translateX(14px);
  background-color: var(--green);
}
input:checked + .slider.slider-fast {
  background-color: rgba(255, 209, 102, 0.2);
  border-color: var(--yellow);
}
input:checked + .slider.slider-fast:before {
  background-color: var(--yellow);
}

/* Review Slider (Blue) */
input:checked + .slider.slider-review {
  background-color: var(--accent-glow2);
  border-color: var(--accent);
}
input:checked + .slider.slider-review:before {
  background-color: var(--accent);
}

/* Analysis Slider (Purple) */
input:checked + .slider.slider-analysis {
  background-color: var(--purple-dim);
  border-color: var(--purple);
}
input:checked + .slider.slider-analysis:before {
  background-color: var(--purple);
}

/* Unlimited Slider (Cyan) */
input:checked + .slider.slider-unlimited {
  background-color: rgba(0, 212, 212, 0.2);
  border-color: #00d4d4;
}
input:checked + .slider.slider-unlimited:before {
  background-color: #00d4d4;
}
.slider.round {
  border-radius: 34px;
}
.slider.round:before {
  border-radius: 50%;
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
  padding: 32px 28px;
  display: flex; flex-direction: column; gap: 28px;
}


/* ── Welcome screen ──────────────────────────────────────────────────── */
.welcome {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  text-align: center; padding: 48px 24px;
  position: relative;
  animation: fadeIn .5s ease;
}
.welcome-glow {
  position: absolute; top: 35%; left: 50%; transform: translate(-50%,-50%);
  width: 400px; height: 400px;
  background: radial-gradient(circle, rgba(91,156,255,.04) 0%, transparent 70%);
  pointer-events: none;
}
.welcome-orb {
  font-size: 48px; margin-bottom: 24px;
  filter: drop-shadow(0 0 20px rgba(91,156,255,.35));
}
.welcome-title {
  font-size: 26px; font-weight: 800; letter-spacing: -.03em;
  color: #fff; margin-bottom: 12px;
  line-height: 1.2;
}
.welcome-sub {
  color: rgba(255,255,255,0.35); font-size: 14px; line-height: 1.7;
  max-width: 440px; margin-bottom: 40px;
}
.examples-panel {
  display: flex; flex-direction: column; gap: 4px;
  max-width: 480px; width: 100%;
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 16px;
  padding: 8px;
}
.example-card {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 16px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  text-align: left; cursor: pointer;
  transition: all .15s;
}
.example-card:hover:not(:disabled) {
  background: rgba(255,255,255,0.04);
  border-color: rgba(91,156,255,0.1);
}
.example-card:disabled { opacity: .4; cursor: default; }
.example-main { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; }
.example-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.example-icon { font-size: 18px; flex-shrink: 0; }
.example-label { font-size: 13px; font-weight: 600; color: #fff; line-height: 1.4; }
.example-sub   { font-size: 11px; color: rgba(255,255,255,0.3); }
.example-arrow { color: rgba(255,255,255,0.1); transition: all .15s; }
.example-card:hover:not(:disabled) .example-arrow { color: var(--accent); transform: translateX(2px); }

/* ── Message bubbles ─────────────────────────────────────────────────── */
.msg-wrap {
  display: flex; gap: 14px;
  animation: fadeUp .3s ease;
}
.msg-wrap.user { flex-direction: row-reverse; }
.msg-wrap.user .msg-body { align-items: flex-end; }

.avatar {
  width: 32px; height: 32px;
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700;
  flex-shrink: 0; margin-top: 2px;
}
.avatar.user {
  background: linear-gradient(135deg, rgba(91,156,255,0.2), rgba(64,128,255,0.1));
  border: 1px solid rgba(91,156,255,0.25);
  color: #5b9cff;
}
.avatar.assistant {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
}

.msg-body {
  display: flex; flex-direction: column; gap: 8px;
  max-width: 72%; min-width: 0;
}

.msg-bubble {
  border-radius: 14px;
  padding: 14px 18px;
  line-height: 1.7; font-size: 14px;
  word-break: break-all;
  overflow-wrap: anywhere;
}
.msg-bubble.user {
  background: linear-gradient(135deg, rgba(91,156,255,0.12), rgba(64,128,255,0.08));
  border: 1px solid rgba(91,156,255,0.15);
  border-radius: 14px 4px 14px 14px;
}
.msg-bubble.assistant {
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.05);
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
  margin: 16px 0;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.02);
  overflow: hidden;
  transition: all 0.2s ease;
}
.msg-bubble :deep(.thought-container.expanded) {
  background: rgba(255, 255, 255, 0.04);
  border-color: var(--border2);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}
.msg-bubble :deep(.thought-section-header) {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px;
  background: rgba(0,0,0,0.1);
}
.msg-bubble :deep(.thought-header-left) {
  display: flex; align-items: center; gap: 8px;
}
.msg-bubble :deep(.thought-toggle) {
  display: flex; align-items: center; gap: 8px;
  background: none; border: none; padding: 4px 8px;
  cursor: pointer; border-radius: 4px;
  transition: background 0.15s;
}
.msg-bubble :deep(.thought-toggle:hover) {
  background: rgba(255,255,255,0.05);
}
.msg-bubble :deep(.thought-toggle .thought-chevron) {
  font-size: 10px; color: var(--t3);
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.msg-bubble :deep(.thought-container.expanded .thought-chevron) {
  transform: rotate(90deg);
  color: var(--accent);
}
.msg-bubble :deep(.thought-wrapper) {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.msg-bubble :deep(.thought-container.expanded .thought-wrapper) {
  grid-template-rows: 1fr;
}
.msg-bubble :deep(.thought-ca) {
  min-height: 0;
  border-left: 3px solid var(--accent);
  margin: 0 12px 12px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 0 4px 4px 0;
}
.msg-bubble :deep(.thought-content),
.msg-bubble :deep(.thought-content *) {
  color: #ffffff !important; /* Sharp white for maximum readability */
  font-size: 14.5px;
  opacity: 1;
  word-break: break-all;
  overflow-wrap: anywhere;
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
  display: flex; justify-content: flex-end; gap: 6px;
  padding: 0 4px;
}
.msg-action-btn {
  background: transparent;
  border: none;
  color: var(--t3);
  font-size: 10px; font-weight: 700;
  padding: 3px 8px; border-radius: 4px;
  cursor: pointer; transition: all 0.2s;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.6;
}
.msg-action-btn:hover {
  background: var(--bg3);
  color: var(--t1);
  opacity: 1;
}
.msg-action-btn.active {
  background: var(--green-dim);
  color: var(--green);
  opacity: 1;
}
.msg-action-btn.export-btn {
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.4);
  background: rgba(16, 185, 129, 0.08);
  font-weight: 800;
  opacity: 1;
}
.msg-action-btn.export-btn:hover {
  background: rgba(16, 185, 129, 0.12);
  border-color: rgba(16, 185, 129, 0.4);
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
  word-break: break-all;
  overflow-wrap: anywhere;
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

/* ── Input Area ────────────────────────────────────────────────────────── */
.input-area {
  display: flex; flex-direction: column; gap: 6px;
  padding: 16px 28px 22px;
  border-top: 1px solid rgba(255,255,255,0.04);
  background: rgba(10,12,18,0.6);
  backdrop-filter: blur(12px);
  flex-shrink: 0;
}
.input-wrapper { display: flex; align-items: flex-end; gap: 10px; }

.input-fast-mode {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 4px; height: 50px; padding: 0 10px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; flex-shrink: 0;
}
.input-fast-mode .follow-label { font-size: 10px; margin-top: -2px; }

.input-area textarea {
  flex: 1;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  color: #fff;
  padding: 14px 18px;
  font-size: 14px; line-height: 1.65;
  resize: none; min-height: 50px; max-height: 160px;
  transition: border-color .2s, box-shadow .2s;
}
.input-area textarea:focus {
  outline: none;
  border-color: rgba(91,156,255,.35);
  box-shadow: 0 0 0 3px rgba(91,156,255,.06);
}
.input-area textarea::placeholder { color: rgba(255,255,255,0.2); }
.input-area textarea:disabled { opacity: .4; }

.continue-btn {
  height: 50px;
  padding: 0 18px;
  border-radius: 12px;
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.6);
  font-size: 13px; font-weight: 600; flex-shrink: 0;
  border: 1px solid rgba(255,255,255,0.08);
  display: flex; align-items: center; justify-content: center;
  transition: all .15s;
}
.continue-btn:hover:not(:disabled) {
  background: rgba(91,156,255,0.1);
  color: #5b9cff;
  border-color: rgba(91,156,255,.3);
}
.continue-btn:active:not(:disabled) { transform: translateY(1px); }
.continue-btn:disabled { opacity: .3; cursor: not-allowed; }

.send-btn {
  width: 50px; height: 50px;
  border-radius: 12px;
  background: #5b9cff;
  color: #fff; font-size: 16px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  transition: background .15s, box-shadow .15s, transform .1s;
  box-shadow: 0 2px 10px rgba(91,156,255,.25);
}
.send-btn:hover:not(:disabled) {
  background: #7ab4ff;
  box-shadow: 0 4px 18px rgba(91,156,255,.4);
  transform: translateY(-1px);
}
.send-btn:active:not(:disabled) { transform: translateY(0); }
.send-btn:disabled { opacity: .3; cursor: not-allowed; box-shadow: none; }

.input-hint {
  display: flex; align-items: center; gap: 8px;
  font-size: 11px; color: rgba(255,255,255,0.15); padding: 0 2px;
}
.input-hint-target {
  font-family: var(--mono);
  color: var(--yellow);
  opacity: .6;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 250px;
}

/* ── Workspace Status Banner ── */
.workspace-status-banner {
  display: flex; align-items: center; gap: 10px;
  padding: 4px 14px; margin-left: 12px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 30px;
  transition: all 0.3s ease;
  max-width: 480px;
}
.wcb-icon {
  display: flex; align-items: center; justify-content: center;
  width: 20px; height: 20px;
  border-radius: 50%;
  background: var(--bg3);
  color: var(--accent);
}
.wcb-content {
  display: flex; align-items: center; gap: 8px;
  overflow: hidden;
}
.wcb-label {
  font-size: 8px; font-weight: 800; color: var(--t3);
  text-transform: uppercase; letter-spacing: 0.06em; 
  white-space: nowrap;
}
.wcb-path {
  font-size: 11px; font-family: var(--mono); color: var(--t1);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: 320px;
}
.wcb-clear {
  background: transparent; border: none; padding: 2px 6px;
  color: var(--t3); cursor: pointer; font-size: 10px;
  transition: color 0.15s;
}
.wcb-clear:hover { color: var(--red); }

/* ── Selection Screen ────────────────────────────────────────────────────── */
.selection-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(10, 11, 14, 0.85); backdrop-filter: blur(20px);
  z-index: 1000; display: flex; align-items: center; justify-content: center;
  animation: fadeIn .4s cubic-bezier(0.4, 0, 0.2, 1);
}
.selection-card {
  width: 100%; max-width: 800px; padding: 48px; border-radius: 24px;
  background: linear-gradient(145deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%);
  border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 32px 64px rgba(0,0,0,0.5);
}
.selection-header { text-align: center; margin-bottom: 40px; }
.selection-title { 
  font-size: 32px; font-weight: 800; color: #fff; margin-bottom: 12px;
  letter-spacing: -0.02em; 
}
.selection-subtitle { font-size: 16px; color: var(--t3); }

.stack-grid { 
  display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); 
  gap: 20px; 
}
.stack-item {
  padding: 24px; border-radius: 16px; cursor: pointer;
  transition: all .25s cubic-bezier(0.4, 0, 0.2, 1);
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.05);
  display: flex; flex-direction: column; align-items: center; text-align: center;
}
/* ── Selection Screen Fixes (legacy overlay kept for compat) ─────────────── */
.selection-card { position: relative; }

/* ── Sidebar Badge ───────────────────────────────────────────────────────── */
.stack-badge {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; margin-bottom: 12px;
  background: var(--bg3); border: 1px solid var(--border);
  border-radius: var(--r-sm); cursor: pointer;
  transition: all .2s;
}
.stack-badge:hover { background: var(--bg4); border-color: var(--accent); }
.stack-badge-icon { font-size: 16px; }
.stack-badge-name { 
  font-size: 12px; font-weight: 700; color: var(--t1); 
  text-transform: uppercase; letter-spacing: 0.05em;
}

/* ════════════════════════════════════════════════════════════════════════════
   PROFESSIONAL AGENT SELECTION PAGE
   ════════════════════════════════════════════════════════════════════════════ */

@keyframes orb-pulse {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50% { opacity: 0.8; transform: scale(1.08); }
}
@keyframes sp-card-in {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}

.selection-page {
  min-height: 100vh;
  background: #07090f;
  display: flex; flex-direction: column;
  position: relative; overflow: hidden;
  font-family: var(--sans);
}

/* Background glow orbs */
.sp-orb {
  position: absolute; border-radius: 50%;
  pointer-events: none; filter: blur(80px);
}
.sp-orb-1 {
  width: 600px; height: 600px; top: -200px; left: -100px;
  background: radial-gradient(circle, rgba(64,128,255,0.18) 0%, transparent 70%);
  animation: orb-pulse 8s ease-in-out infinite;
}
.sp-orb-2 {
  width: 400px; height: 400px; bottom: -100px; right: -60px;
  background: radial-gradient(circle, rgba(100,60,200,0.15) 0%, transparent 70%);
  animation: orb-pulse 10s ease-in-out infinite 2s;
}
.sp-orb-3 {
  width: 300px; height: 300px; top: 50%; left: 50%; transform: translate(-50%, -50%);
  background: radial-gradient(circle, rgba(91,156,255,0.07) 0%, transparent 70%);
  animation: orb-pulse 6s ease-in-out infinite 1s;
}

/* Dot grid */
.sp-dots-grid {
  position: absolute; inset: 0; pointer-events: none;
  background-image: radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px);
  background-size: 28px 28px;
  mask-image: radial-gradient(ellipse 70% 70% at 50% 50%, black 40%, transparent 100%);
}

/* Nav */
.sp-nav {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 32px; position: relative; z-index: 10;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  background: rgba(7,9,15,0.6); backdrop-filter: blur(10px);
}
.sp-logo { display: flex; align-items: center; gap: 10px; }
.sp-logo-icon {
  width: 34px; height: 34px; border-radius: 10px;
  background: linear-gradient(135deg, rgba(91,156,255,0.2), rgba(64,128,255,0.1));
  border: 1px solid rgba(91,156,255,0.25);
  display: flex; align-items: center; justify-content: center;
}
.sp-logo-name {
  font-size: 17px; font-weight: 800; color: #fff; letter-spacing: -0.02em;
}
.sp-nav-badge {
  display: flex; align-items: center; gap: 7px;
  font-size: 12px; color: rgba(255,255,255,0.45);
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  padding: 5px 12px; border-radius: 100px;
}
.sp-badge-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: #5b9cff;
  box-shadow: 0 0 6px #5b9cff;
  animation: pulse 2s infinite;
}

/* Hero */
.sp-hero {
  text-align: center; padding: 60px 24px 44px;
  position: relative; z-index: 10;
}
.sp-hero-label {
  display: inline-block;
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.15em; color: #5b9cff;
  background: rgba(91,156,255,0.1); border: 1px solid rgba(91,156,255,0.2);
  padding: 4px 14px; border-radius: 100px; margin-bottom: 18px;
}
.sp-hero-title {
  font-size: clamp(32px, 5vw, 52px); font-weight: 900;
  letter-spacing: -0.04em; margin: 0 0 16px;
  background: linear-gradient(160deg, #ffffff 40%, rgba(91,156,255,0.85) 100%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
}
.sp-hero-sub {
  font-size: 16px; color: rgba(255,255,255,0.4);
  line-height: 1.7; margin: 0;
}

/* Cards Grid */
.sp-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px; max-width: 1100px;
  width: 100%; margin: 0 auto;
  padding: 0 24px 48px;
  position: relative; z-index: 10;
}
.sp-agent-card {
  border-radius: 20px; cursor: pointer;
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.06);
  padding: 28px; position: relative; overflow: hidden;
  display: flex; flex-direction: column; gap: 0;
  transition: border-color .3s, transform .3s, box-shadow .3s;
  animation: sp-card-in .5s ease both;
}
.sp-agent-card:nth-child(2) { animation-delay: .1s; }
.sp-agent-card:nth-child(3) { animation-delay: .2s; }
.sp-agent-card:hover {
  border-color: rgba(91,156,255,0.35);
  transform: translateY(-4px);
  box-shadow: 0 20px 50px rgba(0,0,0,0.4);
}
.sp-agent-card--active {
  border-color: rgba(91,156,255,0.5);
  box-shadow: 0 0 0 1px rgba(91,156,255,0.3), 0 12px 30px rgba(0,0,0,0.3);
}

/* Per-card colored glow */
.sp-agent-glow {
  position: absolute; top: 0; left: 0; right: 0; height: 2px;
  border-radius: 20px 20px 0 0;
}
.sp-glow-default         { background: linear-gradient(90deg, #4080ff, #80b0ff); }
.sp-glow-mean_stack      { background: linear-gradient(90deg, #40c080, #80ffb0); }
.sp-glow-html_css        { background: linear-gradient(90deg, #c040a0, #ff80d0); }

/* Card Top */
.sp-agent-top {
  display: flex; align-items: center; gap: 16px; margin-bottom: 16px;
}
.sp-agent-emoji {
  width: 52px; height: 52px; flex-shrink: 0;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  font-size: 26px;
}
.sp-agent-name {
  font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 4px;
  letter-spacing: -0.01em;
}
.sp-agent-tech {
  font-size: 11px; font-weight: 600;
  color: rgba(255,255,255,0.35); text-transform: uppercase; letter-spacing: 0.05em;
}

.sp-agent-desc {
  font-size: 13.5px; color: rgba(255,255,255,0.45);
  line-height: 1.6; margin: 0 0 20px;
}

/* Prompt chips */
.sp-agent-prompts { margin-bottom: 24px; flex: 1; }
.sp-prompts-label {
  font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.25);
  text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px;
}
.sp-prompt-chip {
  display: flex; align-items: baseline; gap: 6px;
  font-size: 12px; color: rgba(255,255,255,0.45);
  padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.04);
  line-height: 1.4;
}
.sp-prompt-chip:last-child { border-bottom: none; }
.sp-chip-arrow {
  color: #5b9cff; font-size: 16px; flex-shrink: 0; line-height: 1;
}

/* CTA button */
.sp-agent-btn {
  width: 100%; padding: 11px 16px;
  border-radius: 10px; border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.7); font-size: 13px; font-weight: 600;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  cursor: pointer; transition: all .25s;
  font-family: var(--sans);
}
.sp-agent-btn:hover, .sp-agent-card:hover .sp-agent-btn {
  background: #5b9cff;
  border-color: #5b9cff;
  color: #fff;
  box-shadow: 0 4px 16px rgba(91,156,255,0.35);
}

/* ── Dashboard View ─────────────────────────────────────────────────────── */
.dashboard-main {
  flex: 1; min-width: 0;
  background: #07090f;
  display: flex; flex-direction: column;
  overflow: hidden;
}

/* ── Header ── */
.db-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid rgba(255,255,255,0.055);
  background: #07090f;
  flex-shrink: 0; gap: 16px;
}
.db-header-left  { display: flex; align-items: center; gap: 16px; min-width: 0; }
.db-header-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

.db-brand { display: flex; align-items: center; gap: 12px; }
.db-brand-icon {
  width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
  background: linear-gradient(135deg, rgba(91,156,255,.18), rgba(64,128,255,.08));
  border: 1px solid rgba(91,156,255,.22);
  display: flex; align-items: center; justify-content: center;
  color: #5b9cff;
}
.db-title  { font-size: 15px; font-weight: 700; color: #eef1f8; letter-spacing: -.02em; margin: 0; line-height: 1.2; }
.db-subtitle { font-size: 11px; color: rgba(255,255,255,0.3); margin: 0; margin-top: 1px; }

.db-live-pill {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 11px; border-radius: 20px;
  font-size: 11px; font-weight: 600; letter-spacing: .03em; flex-shrink: 0;
}
.db-live-pill.live    { background: rgba(61,220,132,.1); color: #3ddc84; border: 1px solid rgba(61,220,132,.2); }
.db-live-pill.offline { background: rgba(255,107,107,.1); color: #ff6b6b; border: 1px solid rgba(255,107,107,.2); }
.db-live-dot {
  width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex-shrink: 0;
  animation: pulse 1.8s ease-in-out infinite;
}

.db-uptime-group { display: flex; align-items: center; gap: 6px; }
.db-meta-chip {
  display: flex; align-items: center; gap: 5px;
  padding: 4px 10px; border-radius: 7px; font-size: 11px; color: rgba(255,255,255,0.4);
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07);
}
.db-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 14px; border-radius: 8px; cursor: pointer; transition: all .15s;
  font-size: 12px; font-weight: 500; border: 1px solid rgba(255,255,255,0.09);
  background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.6);
}
.db-btn:hover:not(:disabled) { background: rgba(255,255,255,0.09); color: #eef1f8; }
.db-btn:disabled { opacity: .45; cursor: not-allowed; }
.db-btn-danger { color: rgba(255,107,107,0.7); border-color: rgba(255,107,107,0.15); }
.db-btn-danger:hover:not(:disabled) { background: rgba(255,107,107,0.08); color: #ff6b6b; border-color: rgba(255,107,107,0.3); }

/* ── KPI row ── */
.db-kpi-row {
  display: grid; grid-template-columns: repeat(6, 1fr);
  gap: 1px; background: rgba(255,255,255,0.055);
  border-bottom: 1px solid rgba(255,255,255,0.055);
  flex-shrink: 0;
}
.db-kpi {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 18px; background: #07090f;
  position: relative; overflow: hidden;
}
.db-kpi:hover { background: rgba(255,255,255,0.015); }
.db-kpi-icon {
  width: 32px; height: 32px; border-radius: 9px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.4);
}
.db-kpi-icon-active { background: rgba(61,220,132,.12); color: #3ddc84; }
.db-kpi-icon-done   { background: rgba(91,156,255,.12); color: #5b9cff; }
.db-kpi-icon-fail   { background: rgba(255,107,107,.12); color: #ff6b6b; }
.db-kpi-icon-wf     { background: rgba(167,139,250,.12); color: #a78bfa; }
.db-kpi-icon-logs   { background: rgba(255,209,102,.1);  color: #ffd166; }
.db-kpi-body { min-width: 0; }
.db-kpi-value { font-size: 22px; font-weight: 700; color: #eef1f8; line-height: 1; }
.db-kpi-label { font-size: 10px; color: rgba(255,255,255,0.35); text-transform: uppercase; letter-spacing: .07em; margin-top: 3px; }
.db-kpi-green .db-kpi-value { color: #3ddc84; }
.db-kpi-blue  .db-kpi-value { color: #5b9cff; }
.db-kpi-red   .db-kpi-value { color: #ff6b6b; }
.db-kpi-purple .db-kpi-value { color: #a78bfa; }
.db-kpi-yellow .db-kpi-value { color: #ffd166; }
.db-kpi-pulse {
  position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
  width: 8px; height: 8px; border-radius: 50%; background: #3ddc84;
  animation: pulse 1.4s ease-in-out infinite;
}

/* ── 3-column body ── */
.db-body {
  display: grid; grid-template-columns: 1fr 1fr 1fr;
  gap: 1px; background: rgba(255,255,255,0.055);
  flex: 1; min-height: 0; overflow: hidden;
}
.db-col {
  background: #07090f; display: flex; flex-direction: column; min-height: 0; overflow: hidden;
}
.db-col-logs { background: #060810; }

.db-col-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,0.055);
  flex-shrink: 0; gap: 8px;
}
.db-col-title-row { display: flex; align-items: center; gap: 8px; }
.db-col-title {
  font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.55);
  text-transform: uppercase; letter-spacing: .07em;
}
.db-badge-running {
  font-size: 10px; font-weight: 600; padding: 1px 7px; border-radius: 10px;
  background: rgba(61,220,132,.12); color: #3ddc84; border: 1px solid rgba(61,220,132,.2);
}

.db-tabs { display: flex; gap: 2px; }
.db-tab {
  padding: 3px 10px; border-radius: 6px; font-size: 11px; font-weight: 500;
  color: rgba(255,255,255,0.35); cursor: pointer; border: 1px solid transparent; background: none; transition: all .12s;
}
.db-tab:hover  { color: rgba(255,255,255,0.65); }
.db-tab.active { background: rgba(91,156,255,.1); color: #5b9cff; border-color: rgba(91,156,255,.2); }

.db-col-body { flex: 1; min-height: 0; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 6px; }

/* ── Empty state ── */
.db-empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; padding: 36px 12px; flex: 1;
}
.db-empty-title { font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.25); }
.db-empty-sub   { font-size: 11px; color: rgba(255,255,255,0.15); }

/* ── Task cards ── */
.db-task-card {
  padding: 10px 12px; border-radius: 9px; cursor: pointer;
  background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06);
  display: flex; flex-direction: column; gap: 6px;
  transition: border-color .15s, background .15s;
}
.db-task-card:hover { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.1); }
.db-task-card.st-running  { border-color: rgba(61,220,132,0.22); background: rgba(61,220,132,0.035); }
.db-task-card.st-failed   { border-color: rgba(255,107,107,0.22); background: rgba(255,107,107,0.035); }
.db-task-card.st-completed { border-color: rgba(91,156,255,0.15); }
.db-task-card.expanded    { border-color: rgba(91,156,255,0.3); background: rgba(91,156,255,0.04); }
.db-task-past { opacity: 0.65; }
.db-task-past:hover { opacity: 1; }

.db-task-top-row { display: flex; align-items: center; gap: 7px; }
.db-status-dot {
  width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
  background: rgba(255,255,255,0.2);
}
.db-status-dot.running   { background: #3ddc84; animation: pulse 1.4s infinite; }
.db-status-dot.completed { background: #5b9cff; }
.db-status-dot.failed    { background: #ff6b6b; }
.db-status-dot.pending   { background: #ffd166; }

.db-task-id   { font-size: 10px; font-family: var(--mono, monospace); color: rgba(255,255,255,0.28); flex: 1; }
.db-task-elapsed { font-size: 10px; color: rgba(255,255,255,0.3); font-family: var(--mono, monospace); flex-shrink: 0; }

.db-status-badge {
  font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
  padding: 2px 7px; border-radius: 5px; flex-shrink: 0;
}
.db-status-badge.running   { background: rgba(61,220,132,.15); color: #3ddc84; }
.db-status-badge.completed { background: rgba(91,156,255,.15); color: #5b9cff; }
.db-status-badge.failed    { background: rgba(255,107,107,.15); color: #ff6b6b; }
.db-status-badge.pending   { background: rgba(255,209,102,.12); color: #ffd166; }

.db-task-prompt {
  font-size: 12px; color: rgba(255,255,255,0.72); line-height: 1.45;
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.db-task-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.db-chip {
  font-size: 10px; font-weight: 500; padding: 1px 7px; border-radius: 5px;
}
.chip-model { background: rgba(167,139,250,.1); color: #a78bfa; }
.chip-stack { background: rgba(91,156,255,.1);  color: #5b9cff; }
.chip-steps { background: rgba(255,255,255,.06); color: rgba(255,255,255,.45); }

/* Step trace (expanded) */
.db-steps-trace {
  border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px;
  display: flex; flex-direction: column; gap: 4px;
}
.db-steps-title { font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 2px; }
.db-steps-empty { font-size: 11px; color: rgba(255,255,255,0.2); font-style: italic; padding: 4px 0; }
.db-step-row { display: flex; align-items: center; gap: 7px; padding: 2px 0; }
.db-step-dot {
  width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0;
  background: rgba(255,255,255,0.2);
}
.db-step-dot.completed { background: #3ddc84; }
.db-step-dot.running   { background: #5b9cff; animation: pulse 1.4s infinite; }
.db-step-dot.failed    { background: #ff6b6b; }
.db-step-action { font-size: 11px; color: rgba(255,255,255,0.65); font-family: var(--mono, monospace); flex-shrink: 0; }
.db-step-detail { font-size: 11px; color: #4ade80; font-family: var(--mono, monospace); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.db-step-time   { font-size: 10px; color: rgba(255,255,255,0.25); font-family: var(--mono, monospace); flex-shrink: 0; }
.db-task-error-line {
  display: flex; align-items: flex-start; gap: 5px;
  font-size: 11px; color: #ff6b6b; background: rgba(255,107,107,0.06);
  padding: 5px 8px; border-radius: 6px; border-left: 2px solid rgba(255,107,107,0.4);
  word-break: break-word;
}

/* ── Workflow cards ── */
.db-wf-card {
  padding: 12px 14px; border-radius: 9px;
  background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06);
  display: flex; flex-direction: column; gap: 8px;
  transition: border-color .15s;
}
.db-wf-card.st-running   { border-color: rgba(167,139,250,.25); background: rgba(167,139,250,.04); }
.db-wf-card.st-completed { border-color: rgba(91,156,255,.15); }
.db-wf-card.st-failed    { border-color: rgba(255,107,107,.2); }
.db-wf-top  { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.db-wf-name { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.8); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.db-wf-desc { font-size: 11px; color: rgba(255,255,255,0.35); line-height: 1.4; }
.db-wf-progress { display: flex; align-items: center; gap: 8px; }
.db-wf-track {
  flex: 1; height: 5px; border-radius: 3px;
  background: rgba(255,255,255,0.07); overflow: hidden;
}
.db-wf-fill {
  height: 100%; border-radius: 3px; transition: width .4s ease;
  background: linear-gradient(90deg, #3d8eff, #a78bfa);
}
.db-wf-fill.completed { background: linear-gradient(90deg, #3ddc84, #5b9cff); }
.db-wf-fill.failed    { background: #ff6b6b; }
.db-wf-pct { font-size: 11px; font-family: var(--mono, monospace); color: rgba(255,255,255,0.45); flex-shrink: 0; }
.db-wf-steps-row { display: flex; align-items: center; gap: 8px; }
.db-wf-step-lbl { font-size: 10px; color: rgba(255,255,255,0.3); flex-shrink: 0; }
.db-wf-step-dots { display: flex; gap: 3px; flex-wrap: wrap; }
.db-wf-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: rgba(255,255,255,0.1); transition: background .2s;
}
.db-wf-dot.done    { background: #5b9cff; }
.db-wf-dot.current { background: #a78bfa; animation: pulse 1.2s infinite; }
.db-wf-footer { display: flex; align-items: center; justify-content: space-between; }

/* ── Log stream ── */
.db-log-filters { display: flex; gap: 3px; }
.db-log-filter-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 3px 9px; border-radius: 6px; font-size: 10px; font-weight: 600;
  text-transform: uppercase; letter-spacing: .05em;
  color: rgba(255,255,255,0.3); border: 1px solid rgba(255,255,255,0.07);
  background: none; cursor: pointer; transition: all .12s;
}
.db-log-filter-btn:hover { color: rgba(255,255,255,0.6); }
.db-log-filter-btn.active { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.8); border-color: rgba(255,255,255,0.15); }
.db-log-filter-btn.lf-roadmap.active { background: rgba(61,220,132,.1); color: #3ddc84; border-color: rgba(61,220,132,.25); }
.db-log-filter-btn.lf-debug.active { background: rgba(167,139,250,.1); color: #a78bfa; border-color: rgba(167,139,250,.25); }
.db-log-filter-btn.lf-info.active  { background: rgba(91,156,255,.1);  color: #5b9cff; border-color: rgba(91,156,255,.25); }
.db-log-filter-btn.lf-warn.active  { background: rgba(255,209,102,.1); color: #ffd166; border-color: rgba(255,209,102,.25); }
.db-log-filter-btn.lf-error.active { background: rgba(255,107,107,.1); color: #ff6b6b; border-color: rgba(255,107,107,.25); }
.db-filter-cnt {
  font-size: 9px; padding: 0 4px; border-radius: 4px;
  background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.4);
}

.db-log-stream {
  flex: 1; min-height: 0; overflow-y: auto; padding: 6px 0;
  font-family: var(--mono, 'JetBrains Mono', monospace); font-size: 11px;
  display: flex; flex-direction: column; gap: 0;
}
.db-log-entry {
  display: grid; grid-template-columns: 68px 38px 60px 1fr;
  gap: 6px; padding: 3px 14px; align-items: baseline;
  border-bottom: 1px solid rgba(255,255,255,0.03);
  transition: background .1s;
}
.db-log-entry:hover { background: rgba(255,255,255,0.025); }
.db-log-ts  { color: rgba(255,255,255,0.2); font-size: 10px; white-space: nowrap; }
.db-log-lvl { font-weight: 700; font-size: 9px; letter-spacing: .06em; }
.db-log-svc {
  color: rgba(255,255,255,0.25); font-size: 10px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.db-log-msg {
  color: rgba(255,255,255,0.65); font-size: 11px; line-height: 1.5;
  word-break: break-word; overflow-wrap: break-word; grid-column: 4;
}
.ll-info  .db-log-lvl { color: #5b9cff; }
.ll-warn  .db-log-lvl { color: #ffd166; }
.ll-error .db-log-lvl { color: #ff6b6b; }
.ll-debug .db-log-lvl { color: #a78bfa; }
.ll-error .db-log-msg { color: rgba(255,107,107,0.85); }
.ll-debug .db-log-msg { color: rgba(255,255,255,0.4); font-style: italic; }
.ll-error { background: rgba(255,107,107,0.04); }
.ll-warn  { background: rgba(255,209,102,0.025); }
.ll-debug { background: rgba(167,139,250,0.03); }
.db-log-detail {
  display: inline-block; margin-left: 6px;
  font-family: var(--mono); font-size: 10px;
  color: #3ddc84; opacity: 0.85;
}

/* Roadmap entries */
.db-roadmap-entry {
  padding: 2px 14px;
  background: rgba(61,220,132,0.04);
  border-left: 2px solid rgba(61,220,132,0.35);
  margin: 1px 0;
}
.db-roadmap-line {
  font-family: var(--mono); font-size: 11px;
  color: rgba(61,220,132,0.85); line-height: 1.6;
  white-space: pre-wrap; word-break: break-word;
}

@media (max-width: 1100px) {
  .db-kpi-row { grid-template-columns: repeat(3, 1fr); }
  .db-body    { grid-template-columns: 1fr 1fr; }
  .db-col-logs { grid-column: 1 / -1; max-height: 280px; }
}
@media (max-width: 700px) {
  .db-kpi-row { grid-template-columns: repeat(2, 1fr); }
  .db-body    { grid-template-columns: 1fr; }
}

/* ── Settings View ───────────────────────────────────────────────────────── */
.settings-main {
  flex: 1; min-width: 0;
  background: #07090f;
  display: flex; flex-direction: column;
  overflow: hidden;
}

/* Agent type select */
.stg-select-wrap {
  position: relative; display: flex; align-items: center;
}
.stg-select {
  width: 100%; padding: 10px 36px 10px 14px;
  background: rgba(255,255,255,0.04);
  border: 1.5px solid var(--border2);
  border-radius: 10px;
  color: var(--t0); font-size: 13px; font-weight: 600;
  font-family: var(--sans);
  appearance: none; cursor: pointer;
  transition: border-color .2s, box-shadow .2s;
}
.stg-select:focus {
  outline: none;
  border-color: rgba(91,156,255,0.5);
  box-shadow: 0 0 0 3px rgba(91,156,255,0.08);
}
.stg-select option { background: #12151f; color: var(--t0); }
.stg-select-arrow {
  position: absolute; right: 12px; pointer-events: none; color: var(--t3);
}
.stg-select-desc {
  margin: 8px 0 0; font-size: 12px; color: var(--t3); line-height: 1.5;
}
.stg-input-wrap { width: 100%; }
.stg-input {
  width: 100%; padding: 10px 14px;
  background: rgba(255,255,255,0.04);
  border: 1.5px solid var(--border2);
  border-radius: 10px;
  color: var(--t0); font-size: 13px; font-weight: 500;
  font-family: 'JetBrains Mono', monospace;
  transition: border-color .2s, box-shadow .2s;
  box-sizing: border-box;
}
.stg-input:focus {
  outline: none;
  border-color: rgba(91,156,255,0.5);
  box-shadow: 0 0 0 3px rgba(91,156,255,0.08);
}
.stg-input::placeholder { color: var(--t4, #4a5068); }
.stg-path-display {
  font-family: 'JetBrains Mono', monospace; font-size: 11px;
  color: var(--green, #4ade80);
}

.stg-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 32px; flex-shrink: 0;
  border-bottom: 1px solid var(--border);
  background: var(--bg2);
}
.stg-header-left { display: flex; align-items: center; gap: 14px; }
.stg-brand-icon {
  width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
  background: rgba(91,156,255,0.1); border: 1px solid rgba(91,156,255,0.2);
  display: flex; align-items: center; justify-content: center;
  color: var(--accent);
}
.stg-title { font-size: 18px; font-weight: 700; color: var(--t0); margin: 0 0 2px; }
.stg-subtitle { font-size: 12px; color: var(--t3); margin: 0; }
.stg-header-right { display: flex; align-items: center; gap: 10px; }

.stg-save-indicator {
  display: none; align-items: center; gap: 5px;
  font-size: 11px; font-weight: 600; color: var(--t2);
}
.stg-save-indicator.visible { display: flex; }
.stg-save-indicator.stg-saved { color: var(--green); }

.stg-reset-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 12px; font-size: 12px; font-weight: 600;
  border: 1px solid var(--border2); border-radius: var(--r-sm);
  color: var(--t2); background: transparent; cursor: pointer;
  transition: all .15s;
}
.stg-reset-btn:hover { border-color: var(--red); color: var(--red); background: rgba(255,107,107,.06); }

.stg-save-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 16px; font-size: 12px; font-weight: 700;
  border: 1px solid rgba(91,156,255,0.4); border-radius: var(--r-sm);
  color: #fff; background: rgba(91,156,255,0.15); cursor: pointer;
  transition: all .15s;
}
.stg-save-btn:hover:not(:disabled) {
  background: rgba(91,156,255,0.28); border-color: rgba(91,156,255,0.7);
  box-shadow: 0 0 10px rgba(91,156,255,0.2);
}
.stg-save-btn:disabled { opacity: .5; cursor: not-allowed; }

.stg-body {
  flex: 1; overflow-y: auto; padding: 28px 32px;
  display: flex; flex-direction: column; gap: 20px;
}

.stg-section {
  background: var(--bg2); border: 1px solid var(--border);
  border-radius: var(--r); padding: 22px 24px;
}

.stg-section-header {
  display: flex; align-items: flex-start; gap: 12px; margin-bottom: 18px;
}
.stg-section-icon {
  width: 32px; height: 32px; flex-shrink: 0; border-radius: 8px;
  background: rgba(255,255,255,0.04); border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  color: var(--t2); margin-top: 2px;
}
.stg-section-title { font-size: 14px; font-weight: 700; color: var(--t0); margin-bottom: 3px; }
.stg-section-desc  { font-size: 12px; color: var(--t3); line-height: 1.5; }

/* Orchestrator option cards */
.stg-option-cards { display: flex; gap: 12px; }
.stg-option-card {
  flex: 1; display: flex; align-items: center; gap: 14px;
  padding: 14px 16px; border-radius: 10px; cursor: pointer;
  border: 1.5px solid var(--border); background: rgba(255,255,255,0.02);
  transition: all .2s;
}
.stg-option-card:hover { border-color: var(--border2); background: rgba(255,255,255,0.04); }
.stg-option-card.selected {
  border-color: rgba(91,156,255,0.5); background: rgba(91,156,255,0.07);
}
.stg-card-check {
  width: 18px; height: 18px; flex-shrink: 0; border-radius: 50%;
  border: 1.5px solid var(--border2); display: flex; align-items: center; justify-content: center;
  color: transparent; transition: all .2s;
}
.stg-option-card.selected .stg-card-check {
  background: var(--accent); border-color: var(--accent); color: #fff;
}
.stg-card-icon { font-size: 20px; flex-shrink: 0; }
.stg-card-title { font-size: 13px; font-weight: 700; color: var(--t0); margin-bottom: 3px; }
.stg-card-desc  { font-size: 11px; color: var(--t3); line-height: 1.4; }

/* Toggle rows */
.stg-toggles { display: flex; flex-direction: column; gap: 0; }
.stg-toggle-row {
  display: flex; align-items: center; justify-content: space-between; gap: 20px;
  padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,0.04);
}
.stg-toggle-row:last-child { border-bottom: none; padding-bottom: 0; }
.stg-toggle-row:first-child { padding-top: 0; }
.stg-toggle-info { flex: 1; min-width: 0; }
.stg-toggle-label { font-size: 13px; font-weight: 600; color: var(--t0); margin-bottom: 3px; }
.stg-toggle-desc  { font-size: 12px; color: var(--t3); line-height: 1.5; }

.stg-tag {
  display: inline-block; font-size: 10px; font-weight: 700;
  padding: 2px 7px; border-radius: 5px; margin-left: 6px;
  text-transform: uppercase; letter-spacing: 0.04em; vertical-align: middle;
}
.stg-tag-warn {
  background: rgba(255,209,102,0.12); border: 1px solid rgba(255,209,102,0.3);
  color: var(--yellow);
}

/* Settings switch */
.stg-switch {
  position: relative; display: inline-block;
  width: 40px; height: 22px; flex-shrink: 0; cursor: pointer;
}
.stg-switch input { opacity: 0; width: 0; height: 0; }
.stg-thumb {
  position: absolute; inset: 0; border-radius: 22px;
  background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12);
  transition: all .25s;
}
.stg-thumb::before {
  content: ''; position: absolute; top: 3px; left: 3px;
  width: 14px; height: 14px; border-radius: 50%;
  background: rgba(255,255,255,0.4); transition: all .25s;
}
.stg-switch input:checked + .stg-thumb {
  background: rgba(91,156,255,0.25); border-color: rgba(91,156,255,0.5);
}
.stg-switch input:checked + .stg-thumb::before {
  transform: translateX(18px); background: var(--accent);
}
.stg-switch input:checked + .stg-thumb-fast {
  background: rgba(255,209,102,0.2); border-color: rgba(255,209,102,0.5);
}
.stg-switch input:checked + .stg-thumb-fast::before { background: var(--yellow); }
.stg-switch input:checked + .stg-thumb-danger {
  background: rgba(255,107,107,0.2); border-color: rgba(255,107,107,0.5);
}
.stg-switch input:checked + .stg-thumb-danger::before { background: var(--red); }
</style>
