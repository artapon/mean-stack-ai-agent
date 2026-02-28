const fs = require('fs-extra');
const path = require('path');

// ── Templates ─────────────────────────────────────────────────────────────────
function expressApiSwaggerFiles(name) {
  return {
    ...expressApiFiles(name),
    [`${name}/package.json`]: JSON.stringify({
      name, version: '1.0.0',
      scripts: { dev: 'nodemon src/server.js', start: 'node src/server.js', lint: 'eslint src' },
      dependencies: {
        express: '^4.18.2', cors: '^2.8.5',
        dotenv: '^16.3.1', helmet: '^7.1.0',
        morgan: '^1.10.0',
        'swagger-ui-express': '^5.0.0',
        yamljs: '^0.3.0'
      },
      devDependencies: { nodemon: '^3.0.2', eslint: '^8.56.0' }
    }, null, 2),

    [`${name}/src/app.js`]: `const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');
const routes  = require('./routes');
const { errorHandler } = require('./middlewares/error.middleware');

const app = express();
const swaggerDocument = YAML.load(path.join(__dirname, '../swagger.yaml'));

// Security & Logging
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// API Docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Routes
app.use('/api', routes);

// Global error handler
app.use(errorHandler);

module.exports = app;
`,

    [`${name}/swagger.yaml`]: `openapi: 3.0.0
info:
  title: ${name} API
  description: Real-world Express.js API
  version: 1.0.0
paths:
  /api/health:
    get:
      summary: Health check
      responses:
        '200':
          description: OK
`,
    [`${name}/README.md`]: `# ${name}\n\nReal-world Express.js REST API with Swagger\n\n\`\`\`bash\nnpm install\ncp .env.example .env\nnpm run dev\n\`\`\`\n\nDocs available at \`/api-docs\`\n`
  };
}

function expressApiFiles(name) {
  return {
    [`${name}/package.json`]: JSON.stringify({
      name, version: '1.0.0',
      scripts: { dev: 'nodemon src/server.js', start: 'node src/server.js', lint: 'eslint src' },
      dependencies: {
        express: '^4.18.2', cors: '^2.8.5',
        dotenv: '^16.3.1', helmet: '^7.1.0',
        morgan: '^1.10.0'
      },
      devDependencies: { nodemon: '^3.0.2', eslint: '^8.56.0' }
    }, null, 2),

    [`${name}/.env.example`]: 'PORT=3000\nNODE_ENV=development\n',

    [`${name}/src/server.js`]: `require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(\`🚀 Server running → http://localhost:\${PORT}\`));
`,

    [`${name}/src/app.js`]: `const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const routes  = require('./routes');
const { errorHandler } = require('./middlewares/error.middleware');

const app = express();

// Security & Logging
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Routes
app.use('/api', routes);

// Global error handler
app.use(errorHandler);

module.exports = app;
`,

    [`${name}/src/middlewares/error.middleware.js`]: `function errorHandler(err, req, res, next) {
  console.error('[Error]', err.stack);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    error: err.message || 'Internal Server Error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
}
module.exports = { errorHandler };
`,

    [`${name}/src/routes/index.js`]: `const express = require('express');
const router  = express.Router();

router.get('/health', (_req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
`,
    [`${name}/implementation.md`]: `# ${name} - Implementation Plan\n\n## Objective\nInitial project scaffolding.\n\n## Features\n- Express.js API\n- Standard middleware (CORS, Helmet, Morgan)\n- Health check endpoint\n- Production-ready startup scripts\n`,
    [`${name}/install.bat`]: `@echo off\necho Installing dependencies for ${name}...\nnpm install\n`,
    [`${name}/start.bat`]: `@echo off\ntitle ${name}\nnpm run dev\n`,
    [`${name}/install.sh`]: `#!/bin/bash\necho "Installing dependencies for ${name}..."\nnpm install\n`,
    [`${name}/start.sh`]: `#!/bin/bash\nnpm run dev\n`,
    [`${name}/README.md`]: `# ${name}\n\nExpert Express.js REST API\n\n\`\`\`bash\nnpm install\ncp .env.example .env\nnpm run dev\n\`\`\`\n`
  };
}

function vueAppFiles(name) {
  return {
    [`${name}/package.json`]: JSON.stringify({
      name, version: '0.0.0', private: true,
      scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
      dependencies: { vue: '^3.4.0', 'vue-router': '^4.2.5', pinia: '^2.1.7', axios: '^1.6.2' },
      devDependencies: { '@vitejs/plugin-vue': '^4.5.2', vite: '^5.0.0' }
    }, null, 2),

    [`${name}/index.html`]: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>`,

    [`${name}/vite.config.js`]: `import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
export default defineConfig({ plugins: [vue()] })
`,
    [`${name}/src/main.js`]: `import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import './assets/main.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
`,
    [`${name}/src/App.vue`]: `<script setup>
import { RouterView } from 'vue-router'
</script>

<template>
  <div class="app-container">
    <header>
      <nav>
        <RouterLink to="/">Home</RouterLink>
      </nav>
    </header>
    <main>
      <RouterView />
    </main>
  </div>
</template>

<style>
.app-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
  font-family: sans-serif;
}
nav {
  margin-bottom: 2rem;
  display: flex;
  gap: 1rem;
}
</style>
`,

    [`${name}/src/assets/main.css`]: `body {
  margin: 0;
  background-color: #f4f4f9;
  color: #333;
}
`,

    [`${name}/src/router/index.js`]: `import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
export default createRouter({
  history: createWebHistory(),
  routes: [{ path: '/', component: HomeView }]
})
`,
    [`${name}/src/views/HomeView.vue`]: `<script setup>
import { useAppStore } from '../stores/app'
const store = useAppStore()
</script>

<template>
  <main>
    <h1>Welcome to ${name}</h1>
    <p>Expert Vue 3 Template with Pinia</p>
    <div class="counter">
      <button @click="store.increment">Count: {{ store.count }}</button>
    </div>
  </main>
</template>

<style scoped>
.counter {
  margin-top: 1rem;
}
button {
  padding: 0.5rem 1rem;
  cursor: pointer;
}
</style>
`,
    [`${name}/src/stores/app.js`]: `import { defineStore } from 'pinia'
import { ref } from 'vue'
export const useAppStore = defineStore('app', () => {
  const count = ref(0)
  function increment() { count.value++ }
  return { count, increment }
})
`,
    [`${name}/implementation.md`]: `# ${name} - Implementation Plan\n\n## Objective\nInitial project scaffolding.\n\n## Features\n- Vue.js 3 App\n- Pinia state management\n- Vue Router\n- Production-ready startup scripts\n`,
    [`${name}/install.bat`]: `@echo off\necho Installing dependencies for ${name}...\nnpm install\n`,
    [`${name}/start.bat`]: `@echo off\ntitle ${name}\nnpm run dev\n`,
    [`${name}/install.sh`]: `#!/bin/bash\necho "Installing dependencies for ${name}..."\nnpm install\n`,
    [`${name}/start.sh`]: `#!/bin/bash\nnpm run dev\n`
  };
}

function fullstackFiles(name) {
  const api = `${name}-api`;
  const ui = `${name}-ui`;

  const apiFiles = expressApiFiles(api);
  const uiFiles = vueAppFiles(ui);

  // Add proxy to vite config so /api calls reach the Express server
  uiFiles[`${ui}/vite.config.js`] = `import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } }
  }
})
`;

  return {
    [`${name}/package.json`]: JSON.stringify({
      name, version: '1.0.0',
      scripts: {
        dev: 'concurrently "npm run dev:api" "npm run dev:ui"',
        'dev:api': `npm --prefix \${api} run dev`,
        'dev:ui': `npm --prefix \${ui} run dev`,
        'install:all': `npm install && npm --prefix \${api} install && npm --prefix \${ui} install`
      },
      devDependencies: { concurrently: '^8.2.2' }
    }, null, 2),

    [`${name}/README.md`]: `# ${name}\n\nFullstack Node.js + Express.js + Vue.js\n\n\`\`\`bash\nnpm run install:all\nnpm run dev\n\`\`\`\n`,

    // Prefix sub-project files with the root name
    ...Object.fromEntries(Object.entries(apiFiles).map(([k, v]) => [`\${name}/\${k}`, v])),
    ...Object.fromEntries(Object.entries(uiFiles).map(([k, v]) => [`\${name}/\${k}`, v]))
  };
}

// ── express-api-mongo ─────────────────────────────────────────────────────────
function expressApiMongoFiles(name) {
  return {
    [`${name}/package.json`]: JSON.stringify({
      name, version: '1.0.0',
      scripts: { dev: 'nodemon src/server.js', start: 'node src/server.js' },
      dependencies: {
        express: '^4.18.2', cors: '^2.8.5', dotenv: '^16.3.1',
        helmet: '^7.1.0', morgan: '^1.10.0', mongoose: '^8.0.0',
        bcryptjs: '^2.4.3', jsonwebtoken: '^9.0.0',
        'express-rate-limit': '^7.1.0'
      },
      devDependencies: { nodemon: '^3.0.2' }
    }, null, 2),

    [`${name}/.env.example`]: `PORT=3000\nNODE_ENV=development\nMONGO_URI=mongodb://localhost:27017/${name}\nJWT_SECRET=changeme_use_a_long_random_string\nJWT_EXPIRES_IN=7d\nCORS_ORIGIN=*\n`,

    [`${name}/src/server.js`]: `require('dotenv').config();
const app = require('./app');
const { connectDB } = require('./config/database');

const PORT = process.env.PORT || 3000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log('━'.repeat(40));
    console.log(\`🚀 Server running → http://localhost:\${PORT}\`);
    console.log(\`📡 Environment    → \${process.env.NODE_ENV || 'development'}\`);
    console.log('━'.repeat(40));
  });
});
`,

    [`${name}/src/app.js`]: `const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const morgan  = require('morgan');
const rateLimit = require('express-rate-limit');
const { errorHandler } = require('./middlewares/error.middleware');
const routes = require('./modules/routes');

const app = express();

// Global Middlewares
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(morgan('dev'));
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 10000 }));

// API Routes
app.use('/api', routes);

// Global Error Handler
app.use(errorHandler);

module.exports = app;
`,

    [`${name}/src/config/database.js`]: `const mongoose = require('mongoose');
const connectDB = async () => {
  let retries = 5;
  while (retries) {
    try {
      await mongoose.connect(process.env.MONGO_URI);
      console.log('[DB] MongoDB connected');
      return;
    } catch (err) {
      retries -= 1;
      console.error(\`[DB] Connection failed, \${retries} retries left\`, err.message);
      if (!retries) throw err;
      await new Promise(r => setTimeout(r, 5000));
    }
  }
};
module.exports = { connectDB };
`,

    [`${name}/src/utils/AppError.js`]: `class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}
module.exports = AppError;
`,

    [`${name}/src/utils/response.js`]: `const success = (res, data, code = 200, meta = {}) =>
  res.status(code).json({ success: true, data, ...meta });
const fail = (res, message, code = 400) =>
  res.status(code).json({ success: false, error: message });
module.exports = { success, fail };
`,

    [`${name}/src/middlewares/error.middleware.js`]: `const errorHandler = (err, req, res, _next) => {
  const code = err.statusCode || 500;
  const msg  = err.isOperational ? err.message : 'Internal Server Error';
  console.error(\`[ERROR] \${req.method} \${req.path} \${code}:\`, err.message);
  res.status(code).json({ success: false, error: msg });
};
module.exports = { errorHandler };
`,

    [`${name}/src/middlewares/auth.middleware.js`]: `const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');

const protect = (req, _res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return next(new AppError('Unauthorized', 401));
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new AppError('Invalid or expired token', 401));
  }
};
module.exports = { protect };
`,

    [`${name}/src/modules/user/user.model.js`]: `const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 6, select: false },
  role:     { type: String, enum: ['user', 'admin'], default: 'user' }
}, { timestamps: true });

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

UserSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', UserSchema);
`,

    [`${name}/src/modules/routes.js`]: `const express = require('express');
const router  = express.Router();

router.use('/auth',  require('./auth/auth.routes'));
router.use('/users', require('./user/user.routes'));
router.get('/health', (_req, res) => res.json({ success: true, status: 'ok', ts: new Date() }));

module.exports = router;
`,

    [`${name}/src/modules/auth/auth.routes.js`]: `const express = require('express');
const router = express.Router();
const controller = require('./auth.controller');

router.post('/register', controller.register);
router.post('/login',    controller.login);

module.exports = router;
`,

    [`${name}/src/modules/user/user.routes.js`]: `const express  = require('express');
const router = express.Router();
const { protect } = require('../../middlewares/auth.middleware');
const controller = require('./user.controller');

router.use(protect);
router.get('/',    controller.getAll);
router.get('/:id', controller.getOne);

module.exports = router;
`,

    [`${name}/src/modules/auth/auth.controller.js`]: `const jwt  = require('jsonwebtoken');
const User = require('../user/user.model');
const AppError = require('../../utils/AppError');
const { success } = require('../../utils/response');

const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

exports.register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) throw new AppError('All fields required', 400);
    const exists = await User.findOne({ email });
    if (exists) throw new AppError('Email already registered', 409);
    const user  = await User.create({ name, email, password });
    const token = signToken(user._id);
    success(res, { token, user: { id: user._id, name: user.name, email: user.email } }, 201);
  } catch (err) { next(err); }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) throw new AppError('Email and password required', 400);
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) throw new AppError('Invalid credentials', 401);
    const token = signToken(user._id);
    success(res, { token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) { next(err); }
};
`,

    [`${name}/src/modules/user/user.controller.js`]: `const User = require('./user.model');
const { success } = require('../../utils/response');

exports.getAll = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([User.find().skip(+skip).limit(+limit), User.countDocuments()]);
    success(res, data, 200, { pagination: { total, page: +page, limit: +limit, pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
};

exports.getOne = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    success(res, user);
  } catch (err) { next(err); }
};
`,

    [`${name}/implementation.md`]: `# ${name} – Implementation\n\n## Stack\nExpress.js · MongoDB · JWT Auth · Modular Feature-based Architecture\n\n## Endpoints\n- POST /api/auth/register\n- POST /api/auth/login\n- GET  /api/users        (protected)\n- GET  /api/users/:id    (protected)\n- GET  /api/health\n\n## Env Required\n- MONGO_URI, JWT_SECRET, JWT_EXPIRES_IN, PORT\n`,
    [`${name}/.env.example`]: `PORT=3000\nNODE_ENV=development\nMONGO_URI=mongodb://localhost:27017/${name}\nJWT_SECRET=changeme\nJWT_EXPIRES_IN=7d\n`,
    [`${name}/install.bat`]: `@echo off\necho Installing ${name}...\nnpm install\npause\n`,
    [`${name}/start.bat`]: `@echo off\ntitle ${name}\nnpm run dev\npause\n`,
    [`${name}/install.sh`]: `#!/bin/bash\necho "Installing ${name}..."\nnpm install\n`,
    [`${name}/start.sh`]: `#!/bin/bash\nnpm run dev\n`
  };
}

// ── fullstack-auth ────────────────────────────────────────────────────────────
function fullstackAuthFiles(name) {
  const api = `${name}-api`;
  const ui = `${name}-ui`;
  const apiFiles = expressApiMongoFiles(api);

  return {
    [`${name}/package.json`]: JSON.stringify({
      name, version: '1.0.0',
      scripts: {
        'dev:api': `npm --prefix ${api} run dev`,
        'dev:ui': `npm --prefix ${ui}  run dev`,
        'install:all': `npm install && npm --prefix ${api} install && npm --prefix ${ui} install`
      },
      devDependencies: { concurrently: '^8.2.2' }
    }, null, 2),

    [`${name}/${ui}/package.json`]: JSON.stringify({
      name: ui, version: '0.0.0', private: true,
      scripts: { dev: 'vite', build: 'vite build' },
      dependencies: { vue: '^3.4.0', 'vue-router': '^4.2.5', pinia: '^2.1.7', axios: '^1.6.2' },
      devDependencies: { '@vitejs/plugin-vue': '^4.5.2', vite: '^5.0.0' }
    }, null, 2),

    [`${name}/${ui}/vite.config.js`]: `import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server:  { proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } } }
})
`,

    [`${name}/${ui}/index.html`]: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>${name}</title></head><body><div id="app"></div><script type="module" src="/src/main.js"></script></body></html>`,

    [`${name}/${ui}/src/main.js`]: `import { createApp }    from 'vue'
import { createPinia }  from 'pinia'
import router from './router'
import App    from './App.vue'
createApp(App).use(createPinia()).use(router).mount('#app')
`,

    [`${name}/${ui}/src/App.vue`]: `<script setup>\nimport { RouterView } from 'vue-router'\n</script>\n<template><RouterView /></template>`,

    [`${name}/${ui}/src/api/axios.js`]: `import axios from 'axios'
const api = axios.create({ baseURL: '/api' })
api.interceptors.request.use(c => {
  const t = localStorage.getItem('token')
  if (t) c.headers.Authorization = \`Bearer \${t}\`
  return c
})
api.interceptors.response.use(r => r, err => {
  if (err.response?.status === 401) { localStorage.removeItem('token'); window.location.href = '/login' }
  return Promise.reject(err)
})
export default api
`,

    [`${name}/${ui}/src/stores/auth.js`]: `import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/api/axios'
import router from '@/router'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || null)
  const user  = ref(null)
  const isAuthenticated = computed(() => !!token.value)

  async function login(credentials) {
    const { data } = await api.post('/auth/login', credentials)
    token.value = data.data.token
    user.value  = data.data.user
    localStorage.setItem('token', token.value)
    router.push('/dashboard')
  }

  async function register(payload) {
    const { data } = await api.post('/auth/register', payload)
    token.value = data.data.token
    user.value  = data.data.user
    localStorage.setItem('token', token.value)
    router.push('/dashboard')
  }

  function logout() {
    token.value = null; user.value = null
    localStorage.removeItem('token')
    router.push('/login')
  }

  return { token, user, isAuthenticated, login, register, logout }
})
`,

    [`${name}/${ui}/src/router/index.js`]: `import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  { path: '/', redirect: '/dashboard' },
  { path: '/login',     component: () => import('@/views/LoginView.vue') },
  { path: '/register',  component: () => import('@/views/RegisterView.vue') },
  { path: '/dashboard', component: () => import('@/views/DashboardView.vue'), meta: { requiresAuth: true } }
]

const router = createRouter({ history: createWebHistory(), routes })

router.beforeEach((to, _from, next) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isAuthenticated) return next('/login')
  next()
})

export default router
`,

    [`${name}/${ui}/src/views/LoginView.vue`]: `<script setup>
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
const auth = useAuthStore()
const form = ref({ email: '', password: '' })
const error = ref('')
async function submit() {
  try { await auth.login(form.value) } catch (e) { error.value = e.response?.data?.error || 'Login failed' }
}
</script>
<template>
  <div class="auth-page">
    <form @submit.prevent="submit">
      <h1>Sign In</h1>
      <p class="error" v-if="error">{{ error }}</p>
      <input v-model="form.email"    type="email"    placeholder="Email"    required />
      <input v-model="form.password" type="password" placeholder="Password" required />
      <button type="submit">Login</button>
      <p>No account? <RouterLink to="/register">Register</RouterLink></p>
    </form>
  </div>
</template>
<style scoped>
.auth-page{display:flex;justify-content:center;padding:4rem}
form{display:flex;flex-direction:column;gap:.8rem;width:100%;max-width:380px}
input{padding:.6rem;border-radius:6px;border:1px solid #ccc}
button{padding:.7rem;background:#4f46e5;color:#fff;border:none;border-radius:6px;cursor:pointer}
.error{color:red;font-size:.85rem}
</style>
`,

    [`${name}/${ui}/src/views/RegisterView.vue`]: `<script setup>
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
const auth = useAuthStore()
const form = ref({ name: '', email: '', password: '' })
const error = ref('')
async function submit() {
  try { await auth.register(form.value) } catch (e) { error.value = e.response?.data?.error || 'Registration failed' }
}
</script>
<template>
  <div class="auth-page">
    <form @submit.prevent="submit">
      <h1>Create Account</h1>
      <p class="error" v-if="error">{{ error }}</p>
      <input v-model="form.name"     type="text"     placeholder="Full Name" required />
      <input v-model="form.email"    type="email"    placeholder="Email"     required />
      <input v-model="form.password" type="password" placeholder="Password"  required />
      <button type="submit">Register</button>
      <p>Have account? <RouterLink to="/login">Login</RouterLink></p>
    </form>
  </div>
</template>
<style scoped>
.auth-page{display:flex;justify-content:center;padding:4rem}
form{display:flex;flex-direction:column;gap:.8rem;width:100%;max-width:380px}
input{padding:.6rem;border-radius:6px;border:1px solid #ccc}
button{padding:.7rem;background:#4f46e5;color:#fff;border:none;border-radius:6px;cursor:pointer}
.error{color:red;font-size:.85rem}
</style>
`,

    [`${name}/${ui}/src/views/DashboardView.vue`]: `<script setup>
import { useAuthStore } from '@/stores/auth'
const auth = useAuthStore()
</script>
<template>
  <div style="padding:2rem">
    <h1>Dashboard</h1>
    <p>Welcome, <strong>{{ auth.user?.name || 'User' }}</strong>!</p>
    <button @click="auth.logout">Logout</button>
  </div>
</template>
`,

    [`${name}/implementation.md`]: `# ${name} – Fullstack Auth App\n\n## Stack\n- Frontend: Vue 3 + Pinia + Vue Router\n- Backend: Express.js + MongoDB + JWT\n\n## Install & Run\n\`\`\`bash\nnpm run install:all\nnpm run dev:api   # backend on :3000\nnpm run dev:ui    # frontend on :5173\n\`\`\`\n`,
    [`${name}/install.bat`]: `@echo off\necho Installing all dependencies for ${name}...\ncall npm install\ncall npm --prefix ${api} install\ncall npm --prefix ${ui} install\npause\n`,
    [`${name}/start.bat`]: `@echo off\ntitle ${name}\nstart cmd /k "cd ${api} && npm run dev"\nstart cmd /k "cd ${ui} && npm run dev"\n`,
    [`${name}/install.sh`]: `#!/bin/bash\nnpm install && npm --prefix ${api} install && npm --prefix ${ui} install\n`,
    [`${name}/start.sh`]: `#!/bin/bash\nnpm --prefix ${api} run dev &\nnpm --prefix ${ui} run dev\n`,

    // Include all backend files
    ...Object.fromEntries(Object.entries(apiFiles).map(([k, v]) => [`${name}/${k}`, v]))
  };
}

const TEMPLATES = {
  'express-api': expressApiFiles,
  'express-api-swagger': expressApiSwaggerFiles,
  'express-api-mongo': expressApiMongoFiles,
  'vue-app': vueAppFiles,
  'fullstack': fullstackFiles,
  'fullstack-auth': fullstackAuthFiles
};

// ── scaffoldProject tool ──────────────────────────────────────────────────────
async function scaffoldProject({ type, name, flat = false } = {}, workspaceDir) {
  if (!type || !TEMPLATES[type]) {
    return { error: `Unknown type "${type}". Use: ${Object.keys(TEMPLATES).join(', ')}` };
  }
  if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
    return { error: 'Invalid project name. Use letters, numbers, hyphens, underscores.' };
  }

  const files = TEMPLATES[type](name);
  const created = [];

  for (let [relPath, content] of Object.entries(files)) {
    // FLAT MODE: If flat is true, strip the top-level directory (the project name)
    // e.g., "my-app/package.json" becomes "package.json"
    if (flat) {
      const parts = relPath.split(/[/\\]/);
      if (parts.length > 1 && parts[0] === name) {
        relPath = parts.slice(1).join('/');
      }
    }

    const abs = path.join(workspaceDir, relPath);
    await fs.ensureDir(path.dirname(abs));
    await fs.writeFile(abs, content, 'utf-8');
    console.log(`[DevAgent] Scaffold (${flat ? 'FLAT' : 'NESTED'}): ${abs}`);
    created.push(relPath);
  }

  const nextSteps = {
    'express-api': [`cd ${name}`, 'npm install', 'npm run dev'],
    'express-api-swagger': [`cd ${name}`, 'npm install', 'npm run dev'],
    'vue-app': [`cd ${name}`, 'npm install', 'npm run dev'],
    'fullstack': [`cd ${name}`, 'npm run install:all', 'npm run dev']
  };

  return { success: true, type, name, filesCreated: created, nextSteps: nextSteps[type] };
}

module.exports = { scaffoldProject };
