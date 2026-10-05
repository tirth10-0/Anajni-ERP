const fs = require('fs');
const path = require('path');

const newTs = Date.now();

function updateHtmlFiles(dir) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (item !== 'node_modules' && item !== '.git' && item !== 'dist' && item !== 'apps') {
        updateHtmlFiles(full);
      }
    } else if (item.endsWith('.html')) {
      let content = fs.readFileSync(full, 'utf8');
      const updated = content.replace(/(\.(?:css|js))\?v=\d+/g, (match, p1) => `${p1}?v=${newTs}`);
      if (content !== updated) {
        fs.writeFileSync(full, updated, 'utf8');
        console.log(`Updated cache timestamp in ${path.relative(process.cwd(), full)}`);
      }
    }
  }
}

updateHtmlFiles(process.cwd());
console.log(`Cache buster finished successfully with timestamp: ${newTs}`);
