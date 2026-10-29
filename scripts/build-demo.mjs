// Збирає демо-версію (без бази і Telegram) в один HTML-файл: dist-demo/stolovka-demo.html.
// Запуск: npm run build:demo
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const out = 'dist-demo'
execSync(`npx vite build --outDir ${out} --emptyOutDir`, { stdio: 'inherit', env: { ...process.env, VITE_DEMO: '1' } })

const html = readFileSync(join(out, 'index.html'), 'utf8')
const read = (re) => {
  const m = html.match(re)
  if (!m) throw new Error(`not found: ${re}`)
  return readFileSync(join(out, m[1]), 'utf8')
}
const js = read(/<script type="module" crossorigin src="\/([^"]+)"/).replaceAll('</script', '<\\/script')
const css = read(/<link rel="stylesheet" crossorigin href="\/([^"]+)"/)

const page = `<title>Столовка (демо)</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="Демо маркетплейсу домашньої їжі: меню, кошик, кабінет кухаря і адмінка на тестових даних.">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`
writeFileSync(join(out, 'stolovka-demo.html'), page)
console.log(`demo: ${join(out, 'stolovka-demo.html')} (${Math.round(page.length / 1024)} KB)`)
