import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = fs.readdirSync(root);
const errors = [];

const required = [
  'appsscript.json',
  'Config.gs',
  'Code.gs',
  'Database.gs',
  'Health.gs',
  'Tarefas.gs',
  'Producoes.gs',
  'Perdas.gs',
  'index.html',
  'styles.html',
  'tarefas.html',
  'tarefas-js.html'
];

for (const name of required) {
  if (!fs.existsSync(path.join(root, name))) errors.push(`Arquivo obrigatório ausente: ${name}`);
}

function checkSyntax(name, source) {
  try {
    Function(source);
  } catch (error) {
    errors.push(`${name}: ${error.message}`);
  }
}

for (const name of files.filter(name => name.endsWith('.gs'))) {
  checkSyntax(name, fs.readFileSync(path.join(root, name), 'utf8'));
}

for (const name of files.filter(name => name.endsWith('-js.html'))) {
  const source = fs.readFileSync(path.join(root, name), 'utf8');
  const blocks = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  if (!blocks.length) {
    errors.push(`${name}: nenhum bloco <script> encontrado`);
    continue;
  }
  blocks.forEach((match, index) => checkSyntax(`${name}#script-${index + 1}`, match[1]));
}

const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const includes = [...indexSource.matchAll(/include\('([^']+)'\)/g)].map(match => match[1]);
for (const include of includes) {
  if (!fs.existsSync(path.join(root, `${include}.html`))) {
    errors.push(`index.html inclui arquivo inexistente: ${include}.html`);
  }
}

const composed = indexSource.replace(
  /<\?!= include\('([^']+)'\); \?>/g,
  (_, include) => fs.readFileSync(path.join(root, `${include}.html`), 'utf8')
);
const staticMarkup = composed.replace(/<script(?:\s[^>]*)?>[\s\S]*?<\/script>/gi, '');
const ids = [...staticMarkup.matchAll(/\sid=["']([^"']+)["']/g)].map(match => match[1]);
const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
if (duplicates.length) errors.push(`IDs HTML duplicados: ${duplicates.join(', ')}`);

try {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'appsscript.json'), 'utf8'));
  if (manifest.runtimeVersion !== 'V8') errors.push('appsscript.json deve usar runtimeVersion V8');
} catch (error) {
  errors.push(`appsscript.json inválido: ${error.message}`);
}

if (errors.length) {
  console.error(`Validação falhou com ${errors.length} erro(s):`);
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Projeto válido: ${files.filter(name => name.endsWith('.gs')).length} arquivos .gs, ${includes.length} componentes HTML e nenhum ID duplicado.`);
