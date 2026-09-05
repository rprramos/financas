const fs = require('fs');

const raw = fs.readFileSync('D:\\Financas\\app.js', 'utf8');
const lines = raw.split('\n');

console.log('Total lines:', lines.length);

// Find the start and end of the orphan block we want to remove
// Lines 2748 to 2994 (0-indexed: 2747 to 2993)
// But first check if the new processBatchImport function starts at 2587
// and that we only have 1 copy of each function after cleanup

const funcLines = [];
lines.forEach((l, i) => {
  if (l.includes('function processBatchImport') || l.includes('function handleImportedFile') || l.includes('function formatImportDate')) {
    funcLines.push({ lineNum: i+1, content: l.trim() });
  }
});

console.log('Function occurrences:', JSON.stringify(funcLines, null, 2));
