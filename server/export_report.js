const fs = require('fs');
const path = require('path');

const mdFile = 'd:\\Projects\\devagent\\workspace\\walkthrough_system_analysis_report.md';
const htmlFile = 'd:\\Projects\\devagent\\workspace\\walkthrough_system_analysis_report.html';

const mdContent = fs.readFileSync(mdFile, 'utf8');

const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Forensic Analysis Report - Centrix Smartcard API</title>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-primary: #0f172a;
            --bg-secondary: #1e293b;
            --accent: #38bdf8;
            --text-primary: #f1f5f9;
            --text-secondary: #94a3b8;
            --border: #334155;
            --success: #10b981;
            --warning: #f59e0b;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            background-color: var(--bg-primary);
            color: var(--text-primary);
            font-family: 'Inter', sans-serif;
            line-height: 1.6;
            padding: 2rem;
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        .header-actions {
            width: 100%;
            display: flex;
            justify-content: flex-end;
            margin-bottom: 1rem;
        }

        .download-btn {
            background: var(--accent);
            color: var(--bg-primary);
            border: none;
            padding: 0.6rem 1.2rem;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.2s;
        }

        .download-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(56, 189, 248, 0.3);
        }

        .container {
            max-width: 900px;
            width: 100%;
            background: var(--bg-secondary);
            border-radius: 16px;
            padding: 3rem;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            border: 1px solid var(--border);
            position: relative;
            overflow: hidden;
        }

        .container::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: linear-gradient(90deg, var(--accent), var(--success));
        }

        h1, h2, h3 { color: var(--text-primary); margin-top: 2.5rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 12px; }
        h1 { font-size: 2.5rem; margin-top: 0; }
        h2 { font-size: 1.8rem; border-bottom: 2px solid var(--border); padding-bottom: 0.5rem; }
        h3 { font-size: 1.4rem; color: var(--accent); }
        p { margin-bottom: 1.2rem; color: var(--text-secondary); }
        hr { border: 0; height: 1px; background: var(--border); margin: 3rem 0; }

        code { font-family: 'JetBrains Mono', monospace; background: #0f172a; padding: 0.2rem 0.4rem; border-radius: 4px; font-size: 0.9em; color: var(--accent); }
        pre { background: #000; padding: 1.5rem; border-radius: 12px; overflow-x: auto; border: 1px solid var(--border); margin: 1.5rem 0; }
        pre code { background: transparent; color: #d1d5db; padding: 0; }

        table { width: 100%; border-collapse: collapse; margin: 2rem 0; background: rgba(15, 23, 42, 0.5); border-radius: 8px; overflow: hidden; }
        th { background: var(--bg-primary); text-align: left; padding: 1rem; color: var(--accent); font-weight: 600; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; }
        td { padding: 1rem; border-top: 1px solid var(--border); font-size: 0.9rem; }

        blockquote { background: rgba(56, 189, 248, 0.1); border-left: 4px solid var(--accent); padding: 1.5rem; margin: 1.5rem 0; border-radius: 0 8px 8px 0; font-style: italic; }
        
        .alert { background: rgba(245, 158, 11, 0.1); border: 1px solid var(--warning); padding: 1rem; border-radius: 8px; margin: 1rem 0; color: var(--warning); font-size: 0.9rem; }
    </style>
</head>
<body>
    <div class="header-actions">
        <button class="download-btn" onclick="downloadPDF()">Export to PDF (Print)</button>
    </div>
    <div class="container">
        <div id="content"></div>
    </div>

    <script>
        const md = \`${mdContent.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`;
        
        const renderer = new marked.Renderer();
        const baseBlockquote = renderer.blockquote.bind(renderer);
        renderer.blockquote = (quote) => {
            if (quote.includes('[!IMPORTANT]')) {
                return '<div class="alert">' + quote.replace('[!IMPORTANT]', '<strong>⚠️ IMPORTANT:</strong>') + '</div>';
            }
            return baseBlockquote(quote);
        };

        marked.setOptions({ renderer, gfm: true, breaks: true });
        document.getElementById('content').innerHTML = marked.parse(md);

        function downloadPDF() {
            window.print();
        }
    </script>
</body>
</html>`;

fs.writeFileSync(htmlFile, htmlTemplate);
console.log('Exported to ' + htmlFile);
