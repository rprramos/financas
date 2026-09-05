const fs = require('fs');

const raw = fs.readFileSync('D:\\Financas\\app.js', 'utf8');
const lines = raw.split('\n');

// Lines to replace: 2285 to 2747 (0-indexed: 2284 to 2746)
// This is the entire batch import module block

const newModule = `// --- BATCH IMPORT MODULE ---
function closeBatchImportModal() {
  document.getElementById('modal-batch-import').classList.add('hidden');
}

// ============================================================
// PARSER UNIVERSAL DE CSV BANCÁRIO BRASILEIRO
// Suporta: Nubank Crédito, Nubank Conta, Itaú, Bradesco,
//          Santander, Inter, Sicoob, BTG, C6, Mercado Pago
// ============================================================

/**
 * Remove BOM e normaliza fins de linha
 */
function cleanRawCSV(raw) {
  let text = raw.replace(/^\\uFEFF/, '');
  text = text.replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n');
  return text;
}

/**
 * Parser inteligente de linha CSV com suporte a campos entre aspas
 */
function parseCSVLine(line, sep) {
  if (sep === '\\t') return line.split('\\t').map(c => c.replace(/"/g, '').trim());
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === sep && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Detecta separador a partir da linha de cabeçalho
 */
function detectSeparator(line) {
  const semicolonCount = (line.match(/;/g) || []).length;
  const commaCount = (line.match(/,/g) || []).length;
  const tabCount = (line.match(/\\t/g) || []).length;
  if (tabCount > 0) return '\\t';
  if (semicolonCount >= commaCount) return ';';
  return ',';
}

/**
 * Converte valor BRL ou internacional para float
 * Suporta: "1.234,56" → 1234.56, "-40.35" → -40.35, "1,234.56" → 1234.56
 */
function parseBRLValue(str) {
  if (!str) return NaN;
  let s = str.replace(/"/g, '').replace(/R\\$\\s?/g, '').trim();
  if (!s) return NaN;
  // Detecta formato BRL: ponto como milhar, vírgula como decimal
  const hasBRLformat = /\\d+\\.\\d{3},\\d{1,2}$/.test(s) || /^-?\\d{1,3}(?\\.\\d{3})*,\\d{2}$/.test(s) || /^-?\\d+,\\d{2}$/.test(s);
  if (hasBRLformat) {
    s = s.replace(/\\./g, '').replace(',', '.');
  } else {
    // Internacional ou misto (40.35 ou 1,234.56)
    s = s.replace(/,/g, '');
  }
  return parseFloat(s);
}

/**
 * Normaliza qualquer formato de data para YYYY-MM-DD
 * Suporta: DD/MM/YYYY, DD/MM/YY, YYYY-MM-DD, DD-MM-YYYY
 */
function normalizeDate(raw) {
  if (!raw) return '';
  const s = raw.replace(/"/g, '').trim();
  if (/^\\d{4}-\\d{2}-\\d{2}/.test(s)) return s.substring(0, 10);
  const slashMatch = s.match(/^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{2,4})/);
  if (slashMatch) {
    let [, d, m, y] = slashMatch;
    if (y.length === 2) y = '20' + y;
    return \`\${y}-\${m.padStart(2,'0')}-\${d.padStart(2,'0')}\`;
  }
  const dashMatch = s.match(/^(\\d{1,2})-(\\d{1,2})-(\\d{4})/);
  if (dashMatch) {
    const [, d, m, y] = dashMatch;
    return \`\${y}-\${m.padStart(2,'0')}-\${d.padStart(2,'0')}\`;
  }
  return s;
}

/**
 * Detecta o banco pelo conteúdo do cabeçalho e primeiras linhas
 */
function detectBank(headerLine, allText) {
  const h = headerLine.toLowerCase();
  const full = allText.toLowerCase().substring(0, 500);
  if (full.includes('nubank') || h.includes('identificador')) return 'nubank';
  // Nubank Cartão: headers em inglês (date,category,title,amount)
  if (h.includes('date') && h.includes('title') && h.includes('amount')) return 'nubank_cartao';
  if (h.includes('lançamento') && h.includes('débito') && h.includes('crédito')) return 'itau';
  if (h.includes('lancamento') && h.includes('debito') && h.includes('credito')) return 'itau';
  if (h.includes('historico') && h.includes('data') && h.includes('valor')) return 'bradesco';
  if (h.includes('histrico') && h.includes('data') && h.includes('valor')) return 'bradesco';
  if (h.includes('data lan') && (h.includes('histrico') || h.includes('histórico'))) return 'santander';
  if (h.includes('data movimentao') || (h.includes('descricao') && h.includes('tipo'))) return 'inter';
  if (h.includes('data movimentação') || (h.includes('descrição') && h.includes('tipo'))) return 'inter';
  if (h.includes('sicoob') || full.includes('sicoob')) return 'sicoob';
  if (h.includes('ag ') && h.includes('cc ')) return 'caixa';
  return 'generic';
}

/**
 * Inferência automática de categoria a partir da descrição
 */
function guessCategory(desc, type) {
  const d = (desc || '').toLowerCase();
  if (type === 'entradas') {
    if (d.includes('foto') || d.includes('ensaio')) return 'Fotografia';
    if (d.includes('filmagem') || d.includes('video') || d.includes('gravacao') || d.includes('gravação')) return 'Filmagem';
    if (d.includes('edicao') || d.includes('edição') || d.includes('editar') || d.includes('cortes')) return 'Edição';
    if (d.includes('aluguel') || d.includes('locacao') || d.includes('locação')) return 'Aluguel';
    return 'Outros';
  }
  if (type === 'empresa') {
    if (d.includes('gasolina') || d.includes('combustivel') || d.includes('posto') || d.includes('estacionamento')) return 'Carro';
    if (d.includes('imposto') || d.includes('das ') || d.includes('inss') || d.includes('taxa') || d.includes('honorarios') || d.includes('contador')) return 'Impostos e Taxas';
    if (d.includes('internet') || d.includes('adobe') || d.includes('google') || d.includes('capcut') || d.includes('aluguel') || d.includes('coworking')) return 'Custos Fixos';
    return 'Custos Variáveis';
  }
  // Pessoal
  if (d.includes('mercado') || d.includes('supermercado') || d.includes('ifood') || d.includes('restaurante') || d.includes('lanche') || d.includes('padaria') || d.includes('feira')) return 'Alimentação';
  if (d.includes('uber') || d.includes('gasolina') || d.includes('posto') || d.includes('combustivel') || d.includes('estacionamento') || d.includes('rodizio')) return 'Carro';
  if (d.includes('aluguel') || d.includes('condominio') || d.includes('iptu') || d.includes('agua') || d.includes('luz') || d.includes('energia') || d.includes('moradia')) return 'Moradia';
  if (d.includes('netflix') || d.includes('spotify') || d.includes('youtube') || d.includes('amazon') || d.includes('disney') || d.includes('globo') || d.includes('cinema') || d.includes('lazer') || d.includes('show') || d.includes('ingresso') || d.includes('apple')) return 'Lazer & Assinaturas';
  if (d.includes('farmacia') || d.includes('remedio') || d.includes('medico') || d.includes('dentista') || d.includes('exame') || d.includes('saude') || d.includes('hospital') || d.includes('plano de saude')) return 'Saúde';
  if (d.includes('familia') || d.includes('filho') || d.includes('mae') || d.includes('pai')) return 'Família';
  if (d.includes('assinatura') || d.includes('seguro') || d.includes('servico') || d.includes('celular') || d.includes('internet') || d.includes('telefone')) return 'Serviços';
  return 'Aquisições Pessoais';
}

/**
 * Parser universal de CSV bancário - suporta qualquer banco brasileiro
 */
function parseUniversalBankCSV(text, importType) {
  const lines = text.split('\\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return { records: [], bankName: 'generic', errors: 0 };

  // Localiza a linha de cabeçalho (pula metadados no topo)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(15, lines.length); i++) {
    const l = lines[i].toLowerCase();
    if (
      (l.includes('data') && (l.includes('valor') || l.includes('lancamento') || l.includes('lançamento') || l.includes('descri') || l.includes('histor'))) ||
      l.includes('identificador') ||
      (l.includes('date') && l.includes('amount')) ||
      (l.includes('data') && l.includes('tipo'))
    ) {
      headerIdx = i;
      break;
    }
  }

  const sep = detectSeparator(lines[headerIdx]);
  const headers = parseCSVLine(lines[headerIdx], sep).map(h => h.toLowerCase().replace(/["']/g, '').trim());
  const bankName = detectBank(lines[headerIdx], text);

  const records = [];
  let errors = 0;

  // Mapeamento de colunas por nome
  const findCol = (...candidates) => {
    for (const c of candidates) {
      const idx = headers.findIndex(h => h.includes(c));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  // Suporte ao Nubank Cartão (inglês: date,category,title,amount)
  const isNubankCartao = bankName === 'nubank_cartao';

  let dateIdx = isNubankCartao 
    ? findCol('date')
    : findCol('data moviment', 'data lançam', 'data lan', 'data', 'dt.', 'date');
  let descIdx = isNubankCartao 
    ? findCol('title')
    : findCol('descri', 'histori', 'lancamento', 'lançamento', 'nome estabe', 'origem', 'memo', 'detalhe');
  let valIdx = isNubankCartao 
    ? findCol('amount')
    : findCol('valor (r', 'valor', 'amount', 'montante', 'quantia');
  let debitIdx = isNubankCartao ? -1 : findCol('valor do d', 'débito', 'debito', 'saída', 'saida');
  let creditIdx = isNubankCartao ? -1 : findCol('valor do c', 'crédito', 'credito', 'entrada', 'recebido');
  let typeIdx = findCol('tipo lanç', 'tipo', 'natureza');

  const hasHeaders = dateIdx !== -1 || descIdx !== -1 || valIdx !== -1;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;

    // Para em linhas de rodapé/resumo
    const ll = line.toLowerCase();
    if (ll.includes('saldo final') || ll.includes('total:') || ll.includes('saldo:') ||
        ll.startsWith('extrato') || ll.startsWith('agncia') || ll.startsWith('agência') ||
        ll.startsWith('conta:') || ll.startsWith('perodo') || ll.startsWith('período') ||
        ll.includes('saldo anterior')) continue;

    const cols = hasHeaders ? parseCSVLine(line, sep) : line.split(sep).map(c => c.trim());
    if (cols.length < 2) { errors++; continue; }

    // Data
    let rawDate = dateIdx !== -1 ? cols[dateIdx] : cols[0];
    const dateStr = normalizeDate(rawDate);
    if (!dateStr || !/^\\d{4}-\\d{2}-\\d{2}$/.test(dateStr)) { errors++; continue; }

    // Descrição
    let desc = descIdx !== -1 ? (cols[descIdx] || '') : cols[1] || '';
    desc = desc.replace(/"/g, '').trim();
    if (!desc) { errors++; continue; }

    // Valor
    let valorOriginal = NaN;
    let isExpense = null;

    if (valIdx !== -1 && cols[valIdx] !== undefined && cols[valIdx].trim()) {
      valorOriginal = parseBRLValue(cols[valIdx]);
      if (!isNaN(valorOriginal)) {
        isExpense = valorOriginal < 0;
        valorOriginal = Math.abs(valorOriginal);
      }
    }

    if (isNaN(valorOriginal) && debitIdx !== -1 && cols[debitIdx] && cols[debitIdx].trim()) {
      const v = parseBRLValue(cols[debitIdx]);
      if (!isNaN(v) && v > 0) { valorOriginal = v; isExpense = true; }
    }

    if (isNaN(valorOriginal) && creditIdx !== -1 && cols[creditIdx] && cols[creditIdx].trim()) {
      const v = parseBRLValue(cols[creditIdx]);
      if (!isNaN(v) && v > 0) { valorOriginal = v; isExpense = false; }
    }

    if (isNaN(valorOriginal) || valorOriginal === 0) { errors++; continue; }

    // Determina tipo (despesa/receita) com base no sinal e na seleção do usuário
    let type;
    if (isExpense === null) {
      type = importType;
    } else if (isExpense) {
      type = importType === 'entradas' ? 'pessoal' : importType;
    } else {
      type = 'entradas';
    }

    // Verifica coluna de tipo (Débito/Crédito)
    if (typeIdx !== -1 && cols[typeIdx]) {
      const t = cols[typeIdx].toLowerCase().trim();
      if (t.includes('debt') || t.includes('dbit') || t.includes('dbito') || t.includes('saida') || t.includes('sada')) {
        type = importType === 'entradas' ? 'pessoal' : importType;
      } else if (t.includes('crdit') || t.includes('crdito') || t.includes('entrada') || t.includes('recebido')) {
        type = 'entradas';
      }
    }

    // Mês a partir da data
    let mes = selectedMonth;
    const dp = dateStr.split('-');
    if (dp.length === 3) {
      const mIdx = parseInt(dp[1]) - 1;
      if (mIdx >= 0 && mIdx < 12) mes = MONTHS_PT[mIdx];
    }

    const categoria = guessCategory(desc, type);
    const bankLabel = bankName !== 'generic' ? bankName.charAt(0).toUpperCase() + bankName.slice(1) : 'Banco';

    const record = {
      id: \`\${type.substring(0,3)}_\${Date.now()}_\${Math.random().toString(36).substr(2,5)}\`,
      mes,
      data: dateStr,
      vencimento: dateStr,
      descricao: capitalizeFirstLetter(desc),
      categoria,
      valor: valorOriginal,
      status: type === 'entradas' ? 'Entregue' : '✅ Pago',
      observacao: \`Importado \${bankLabel}\`
    };

    if (type === 'entradas') delete record.vencimento;
    records.push({ record, type });
  }

  return { records, bankName, errors };
}

function processBatchImport() {
  const importType = document.getElementById('import-type').value;
  const text = document.getElementById('textarea-import-data').value.trim();

  if (!text) {
    showToast('Nenhum dado para importar. Carregue um arquivo ou cole os dados.', 'error');
    return;
  }

  // Tenta o parser universal primeiro
  const { records, bankName, errors } = parseUniversalBankCSV(text, importType);
  let successCount = 0;

  if (records.length > 0) {
    records.forEach(({ record, type }) => {
      db[type].push(record);
      successCount++;
    });
  } else {
    // Fallback: formato legado da planilha Excel (colunas por posição)
    const lines = text.split('\\n');
    const sep = detectSeparator(lines[0] || '');
    lines.forEach(line => {
      const cols = parseCSVLine(line, sep);
      if (cols.length < 4) return;
      const mes = cols[0].trim();
      if (!mes || mes.toLowerCase() === 'mês' || mes.toLowerCase() === 'ms' || mes.includes('Registre')) return;
      let datePg = '', venc = '', desc = '', cat = '', valStr = '', status = '', obs = '';
      if (importType === 'entradas') {
        datePg = normalizeDate(cols[1]); desc = cols[2] ? cols[2].trim() : ''; valStr = cols[3] || '';
        cat = cols[4] ? cols[4].trim() : 'Outros'; status = cols[5] ? cols[5].trim() : ''; obs = cols[6] ? cols[6].trim() : '';
      } else {
        venc = normalizeDate(cols[1]); datePg = normalizeDate(cols[2]) || venc; desc = cols[3] ? cols[3].trim() : '';
        cat = cols[4] ? cols[4].trim() : 'Outros'; valStr = cols[5] || ''; status = cols[6] ? cols[6].trim() : ''; obs = cols[7] ? cols[7].trim() : '';
      }
      const valor = parseBRLValue(valStr);
      if (isNaN(valor) || valor <= 0 || !desc) return;
      const record = {
        id: \`\${importType.substring(0,3)}_\${Date.now()}_\${Math.random().toString(36).substr(2,5)}\`,
        mes, data: datePg, descricao: desc,
        categoria: cat || guessCategory(desc, importType),
        valor, status, observacao: obs
      };
      if (importType !== 'entradas') record.vencimento = venc;
      db[importType].push(record);
      successCount++;
    });
  }

  if (successCount > 0) {
    saveDatabase();
    const bankLabel = bankName && bankName !== 'generic' ? \` do \${bankName.charAt(0).toUpperCase() + bankName.slice(1).replace('_cartao',' Cartão')}\` : '';
    const errMsg = errors > 0 ? \` (\${errors} linhas ignoradas)\` : '';
    showToast(\`✅ \${successCount} lançamentos\${bankLabel} importados!\${errMsg}\`, 'success', null);
    closeBatchImportModal();
    populateHistoryFilters();
    renderDashboard();
    setTimeout(() => switchTab('dashboard'), 400);
  } else {
    showToast('❌ Nenhuma linha reconhecida. Verifique se o arquivo está correto.', 'error');
  }
}

function handleImportedFile(file) {
  if (!file) return;
  const fileName = file.name;
  const fileExt = (fileName.split('.').pop() || '').toLowerCase();
  const blocked = ['exe', 'bat', 'sh', 'js', 'php', 'py'];
  if (blocked.includes(fileExt)) {
    showToast('Tipo de arquivo não suportado por segurança.', 'error');
    return;
  }

  const readFileAs = (enc) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = () => reject();
    reader.readAsText(file, enc);
  });

  // Tenta UTF-8; se tiver muitos caracteres de substituição, tenta ISO-8859-1 (Windows-1252)
  readFileAs('UTF-8').then(content => {
    const replacementCount = (content.match(/\\uFFFD/g) || []).length;
    if (replacementCount > 5) return readFileAs('ISO-8859-1');
    return content;
  }).then(content => {
    const cleaned = cleanRawCSV(content);
    document.getElementById('textarea-import-data').value = cleaned;

    // Detecta banco automaticamente
    const firstLines = cleaned.split('\\n').slice(0, 5).join('\\n').toLowerCase();
    let detectedBank = '';
    if (firstLines.includes('nubank') || firstLines.includes('identificador')) detectedBank = 'Nubank Conta';
    else if (firstLines.includes('date') && firstLines.includes('title') && firstLines.includes('amount')) detectedBank = 'Nubank Cartão';
    else if (firstLines.includes('itaú') || firstLines.includes('itau')) detectedBank = 'Itaú';
    else if (firstLines.includes('bradesco')) detectedBank = 'Bradesco';
    else if (firstLines.includes('santander')) detectedBank = 'Santander';
    else if (firstLines.includes('inter')) detectedBank = 'Banco Inter';
    else if (firstLines.includes('caixa')) detectedBank = 'Caixa';
    else if (firstLines.includes('sicoob')) detectedBank = 'Sicoob';
    else if (firstLines.includes('mercado pago')) detectedBank = 'Mercado Pago';

    const linesCount = cleaned.split('\\n').filter(l => l.trim()).length;
    const bankMsg = detectedBank ? \`[\${detectedBank}] \` : '';
    showToast(\`📂 \${bankMsg}\${fileName} — \${linesCount - 1} transações carregadas. Clique em "Processar".\`, 'success');
  }).catch(() => {
    showToast('❌ Erro ao ler o arquivo. Tente salvar como UTF-8 ou CSV separado por vírgulas.', 'error');
  });
}

function formatImportDate(val) {
  return normalizeDate(val);
}`;

// Find the batch import module boundaries
let startIdx = -1;
let endIdx = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim() === '// --- BATCH IMPORT MODULE ---' && startIdx === -1) {
    startIdx = i;
  }
  if (lines[i].trim().startsWith('// ==========================================================================') && 
      i > startIdx + 5 &&
      lines[i+1] && lines[i+1].includes('7. SETTINGS')) {
    endIdx = i - 1;
    break;
  }
}

console.log(`Found batch module: lines ${startIdx+1} to ${endIdx+1}`);

if (startIdx === -1 || endIdx === -1) {
  console.error('Could not find batch import module boundaries!');
  process.exit(1);
}

// Rebuild file
const newLines = [...lines.slice(0, startIdx), ...newModule.split('\n'), '', ...lines.slice(endIdx + 1)];

fs.writeFileSync('D:\\Financas\\app.js', newLines.join('\n'), 'utf8');
console.log('Done! New total lines:', newLines.length);
