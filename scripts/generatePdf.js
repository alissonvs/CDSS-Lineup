import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { marked } from 'marked';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const docsDir = path.join(rootDir, 'docs');

function findChromePath() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error('Nenhum navegador Chrome ou Edge compatível foi localizado no sistema.');
}

function embedImagesAsBase64(html, baseDir) {
  return html.replace(/<img\s+([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi, (match, before, src, after) => {
    try {
      let imagePath = src;
      if (src.startsWith('assets/')) {
        imagePath = path.join(baseDir, src);
      } else if (src.startsWith('docs/assets/')) {
        imagePath = path.join(rootDir, src);
      } else if (!path.isAbsolute(src)) {
        imagePath = path.resolve(baseDir, src);
      }

      if (fs.existsSync(imagePath)) {
        const ext = path.extname(imagePath).toLowerCase().replace('.', '');
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : 'image/png';
        const base64Data = fs.readFileSync(imagePath).toString('base64');
        return `<img ${before}src="data:${mime};base64,${base64Data}"${after}>`;
      }
    } catch (err) {
      console.warn(`[PDF Builder] Falha ao embutir imagem ${src}:`, err.message);
    }
    return match;
  });
}

function buildHtmlDocument(title, bodyHtml, options = {}) {
  const { includeMermaid = false } = options;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  ${includeMermaid ? `
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <script>
    mermaid.initialize({
      startOnLoad: true,
      theme: 'default',
      securityLevel: 'loose',
      flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
      er: { useMaxWidth: true }
    });
  </script>` : ''}
  <style>
    @page {
      size: A4;
      margin: 18mm 14mm 18mm 14mm;
      @bottom-right {
        content: counter(page);
      }
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 0;
    }

    h1, h2, h3, h4, h5, h6 {
      color: #0284c7;
      font-weight: 700;
      line-height: 1.3;
      margin-top: 1.4em;
      margin-bottom: 0.5em;
      page-break-after: avoid;
    }

    h1 {
      font-size: 20pt;
      color: #0369a1;
      border-bottom: 2px solid #e0f2fe;
      padding-bottom: 8px;
      margin-top: 0;
    }

    h2 {
      font-size: 14pt;
      color: #0284c7;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
      margin-top: 1.8em;
    }

    h3 {
      font-size: 12pt;
      color: #0369a1;
    }

    p {
      margin: 0.6em 0;
    }

    a {
      color: #0284c7;
      text-decoration: none;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1.2em 0;
      font-size: 9pt;
      page-break-inside: avoid;
    }

    th, td {
      border: 1px solid #cbd5e1;
      padding: 6px 10px;
      text-align: left;
    }

    th {
      background-color: #f1f5f9;
      color: #1e293b;
      font-weight: 700;
    }

    tr:nth-child(even) {
      background-color: #f8fafc;
    }

    blockquote {
      margin: 1em 0;
      padding: 8px 16px;
      background: #f0f9ff;
      border-left: 4px solid #0284c7;
      color: #0369a1;
      font-size: 10pt;
      page-break-inside: avoid;
    }

    code {
      font-family: Consolas, "Courier New", monospace;
      font-size: 9pt;
      background: #f1f5f9;
      padding: 2px 5px;
      border-radius: 4px;
      color: #0f172a;
    }

    pre {
      background: #0f172a;
      color: #f8fafc;
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
      font-size: 8.5pt;
      line-height: 1.4;
      page-break-inside: avoid;
      margin: 1em 0;
    }

    pre code {
      background: transparent;
      color: inherit;
      padding: 0;
    }

    pre.mermaid {
      background: #f8fafc;
      color: #0f172a;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      text-align: center;
      page-break-inside: avoid;
      margin: 1.5em 0;
    }

    img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 16px auto;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
      page-break-inside: avoid;
    }

    hr {
      border: 0;
      border-top: 1px solid #e2e8f0;
      margin: 2em 0;
    }

    ul, ol {
      margin: 0.6em 0;
      padding-left: 24px;
    }

    li {
      margin-bottom: 0.3em;
    }
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;
}

export async function convertMarkdownToPdf(mdRelativePath, pdfRelativePath, options = {}) {
  const mdPath = path.join(rootDir, mdRelativePath);
  const pdfPath = path.join(rootDir, pdfRelativePath);
  const tempHtmlPath = path.join(rootDir, `${pdfRelativePath}.temp.html`);

  console.log(`\n======================================================`);
  console.log(`[PDF] Processando: ${mdRelativePath}`);
  console.log(`======================================================`);

  if (!fs.existsSync(mdPath)) {
    throw new Error(`Arquivo Markdown não encontrado: ${mdPath}`);
  }

  const mdContent = fs.readFileSync(mdPath, 'utf-8');

  // Configura renderer personalizado para blocos Mermaid
  const renderer = new marked.Renderer();
  const originalCodeRenderer = renderer.code.bind(renderer);

  renderer.code = function({ text, lang }) {
    if (lang === 'mermaid') {
      return `<pre class="mermaid">\n${text}\n</pre>`;
    }
    return originalCodeRenderer({ text, lang });
  };

  marked.setOptions({
    renderer,
    gfm: true,
    breaks: false
  });

  let rawHtml = marked.parse(mdContent);

  // Embutir todas as imagens locais em Base64 para garantir carregamento autônomo
  const baseDir = path.dirname(mdPath);
  rawHtml = embedImagesAsBase64(rawHtml, baseDir);

  const titleMatch = mdContent.match(/^#\s+(.+)$/m);
  const docTitle = titleMatch ? titleMatch[1].trim() : path.basename(mdRelativePath, '.md');

  const fullHtml = buildHtmlDocument(docTitle, rawHtml, options);
  fs.writeFileSync(tempHtmlPath, fullHtml, 'utf-8');

  console.log(`[PDF] HTML intermediário compilado em: ${path.basename(tempHtmlPath)}`);

  const chromePath = findChromePath();
  console.log(`[PDF] Utilizando navegador: ${chromePath}`);

  const args = [
    '--headless=new',
    '--disable-gpu',
    '--allow-file-access-from-files',
    '--run-all-compositor-stages-before-draw',
    options.includeMermaid ? '--virtual-time-budget=4000' : '--virtual-time-budget=1000',
    '--no-pdf-header-footer',
    `--print-to-pdf=${pdfPath}`,
    tempHtmlPath
  ];

  try {
    execFileSync(chromePath, args, { stdio: 'pipe', timeout: 30000 });

    if (fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 0) {
      const sizeKb = (fs.statSync(pdfPath).size / 1024).toFixed(1);
      console.log(`[PDF] ✓ Sucesso! PDF gerado em: ${pdfRelativePath} (${sizeKb} KB)`);
    } else {
      throw new Error(`Falha: Arquivo PDF não foi gerado ou está vazio.`);
    }
  } finally {
    // Remove o arquivo HTML temporário
    if (fs.existsSync(tempHtmlPath)) {
      fs.unlinkSync(tempHtmlPath);
    }
  }
}

async function run() {
  try {
    // 1. Converter Manual do Usuário (contém imagens em docs/assets/)
    await convertMarkdownToPdf(
      'docs/MANUAL_DO_USUARIO.md',
      'docs/MANUAL_DO_USUARIO.pdf',
      { includeMermaid: false }
    );

    // 2. Converter Documentação de Arquitetura (contém diagramas Mermaid e tabelas)
    await convertMarkdownToPdf(
      'docs/ARQUITETURA.md',
      'docs/ARQUITETURA.pdf',
      { includeMermaid: true }
    );

    console.log(`\n======================================================`);
    console.log(`✓ Todos os PDFs foram gerados com sucesso na pasta docs/!`);
    console.log(`======================================================`);
  } catch (err) {
    console.error(`\n[PDF] ERRO CRÍTICO NA GERAÇÃO:`, err.message);
    process.exit(1);
  }
}

run();
