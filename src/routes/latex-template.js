// src/routes/latex-template.js
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

import ProductModel from '../models/Product.js';
import pricingFactory from '../logic/pricing.js';
import { mapOfferToDocxData } from '../logic/offerMapping.js';

export const router = express.Router();
const pricing = pricingFactory(ProductModel);

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- Helpers ----------

function getLatexTemplatePath(body) {
  // Reuse the same offer detection logic as in docx-template.js
  const findOffer = (src) => {
    if (!src || typeof src !== 'object') return null;
    return (
      src.activeOffer ||
      src.currentOfferKey ||
      src.offerType ||
      null
    );
  };

  const offer =
    findOffer(body) ||
    findOffer(body?.payload) ||
    findOffer(body?.pricePreview) ||
    'bu'; // default for BU

  let file;
  switch (offer) {
    case 'bwt':
      file = 'Angebot-BWT.tex';
      break;
    // case 'hl':
    //   file = 'Angebot-HL.tex';
    //   break;
    case 'bu':
    default:
      file = 'Angebot.tex';
      break;
  }

  // Adjust path if your templates live somewhere else
  return path.join(process.cwd(), 'src', 'templates', file);
}

function safeFileNameFromOffer(offerNumber = '', fallbackBase = 'Angebot') {
  const raw = typeof offerNumber === 'string' ? offerNumber : '';
  const base = raw || fallbackBase;
  const cleaned = base.replace(/[^a-zA-Z0-9_\-]/g, '_');
  return cleaned || fallbackBase;
}

// Very simple LaTeX escaping for user content
function latexEscape(value) {
  const s = String(value ?? '');
  return s
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}')
    .replace(/\^/g, '\\^{}')
    .replace(/~/g, '\\textasciitilde{}');
}

// Very small template engine: replace [[KEY]] tokens
function renderLatexTemplate(source, data) {
  let out = source;

  for (const [key, rawVal] of Object.entries(data)) {
    const value = latexEscape(rawVal);
    const re = new RegExp(`\\[\\[${key}\\]\\]`, 'g');
    out = out.replace(re, value);
  }

  return out;
}

// Helper to run pdflatex once
function runPdfLatex(tmpDir, baseName) {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'pdflatex',
      [
        '-interaction=nonstopmode',
        '-halt-on-error',
        `${baseName}.tex`,
      ],
      { cwd: tmpDir }
    );

    let stderr = '';
    let stdout = '';

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('pdflatex timeout after 60s'));
    }, 60_000);

    proc.on('exit', (code) => {
      clearTimeout(timeout);
      if (code === 0) return resolve({ stdout, stderr });

      const logCombined = (stdout + '\n' + stderr).slice(0, 8000);
      reject(
        new Error(
          `pdflatex exited with code ${code}. Log:\n${logCombined}`
        )
      );
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// Copy logo to temporary directory
async function copyLogoToTempDir(tmpDir) {
  try {
    // Try multiple possible logo locations
    const possibleLogoPaths = [
      path.join(process.cwd(), 'src', 'public', 'assets', 'logo.png'),
      path.join(process.cwd(), 'public', 'assets', 'logo.png'),
      path.join(__dirname, '..', 'public', 'assets', 'logo.png'),
      path.join(__dirname, '..', '..', 'public', 'assets', 'logo.png'),
    ];

    for (const logoPath of possibleLogoPaths) {
      try {
        await fs.access(logoPath);
        const destPath = path.join(tmpDir, 'logo.png');
        await fs.copyFile(logoPath, destPath);
        console.log(`[latex] Logo copied from: ${logoPath}`);
        return true;
      } catch {
        // Try next path
        continue;
      }
    }

    console.warn('[latex] Logo file not found in any expected location');
    return false;
  } catch (error) {
    console.warn('[latex] Failed to copy logo:', error.message);
    return false;
  }
}

// Compile LaTeX source to PDF via pdflatex (with double compilation)
async function compileLatexToPdf(texSource, baseName = 'Angebot') {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'latex2pdf-'));
  const texPath = path.join(tmpDir, `${baseName}.tex`);

  try {
    // Copy logo to temp directory BEFORE writing .tex file
    await copyLogoToTempDir(tmpDir);

    // Write the .tex file
    await fs.writeFile(texPath, texSource, 'utf8');

    // First compilation - generates .aux file with page references
    console.log('[latex] First pdflatex pass...');
    await runPdfLatex(tmpDir, baseName);

    // Second compilation - resolves page references from .aux file
    console.log('[latex] Second pdflatex pass...');
    await runPdfLatex(tmpDir, baseName);

    const pdfPath = path.join(tmpDir, `${baseName}.pdf`);
    const buf = await fs.readFile(pdfPath);
    return buf;
  } finally {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

// ---------- Route: POST /latex-template/pdf ----------

router.post('/pdf', async (req, res) => {
  try {
    // 1) compute prices (same payload as for /api/price and /docx-template)
    const computed = await pricing.computePrices(req.body || {});

    // 2) map data for placeholders (shared with DOCX)
    const data = mapOfferToDocxData(req.body || {}, computed);

    // 3) read .tex template (selected by offer type)
    const templatePath = getLatexTemplatePath(req.body);
    const templateSource = await fs.readFile(templatePath, 'utf8');

    // 4) fill placeholders [[KEY]]
    const filledTex = renderLatexTemplate(templateSource, data);

    // 5) compile with pdflatex (twice for page references)
    const baseName = safeFileNameFromOffer(
      data.Angebotsnummer,
      'Angebot'
    );
    const pdfBuffer = await compileLatexToPdf(filledTex, baseName);

    // 6) send PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${baseName}.pdf"`
    );
    res.send(pdfBuffer);
  } catch (e) {
    console.error('[latex-template] PDF generation failed:', e);
    res.status(500).json({
      error: 'LaTeX PDF generation failed',
      detail: e.message || String(e),
    });
  }
});

export default router;