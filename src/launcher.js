import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 24 || (major === 24 && minor < 10)) {
  console.error('Instalá Node.js 24.10 o posterior.');
  process.exit(1);
}
const root = fileURLToPath(new URL('..', import.meta.url));
const child = spawn(process.execPath, ['--use-env-proxy', 'src/server.js'], {
  cwd: root, env: process.env, stdio: ['inherit', 'pipe', 'inherit']
});
let opened = false;
let output = '';
child.stdout.on('data', chunk => {
  process.stdout.write(chunk);
  output = (output + chunk).slice(-4096);
  const port = output.match(/iniciado en el puerto (\d+)/)?.[1];
  if (!opened && port) {
    opened = true;
    const host = process.env.HOST === '::1' ? '[::1]' : (process.env.HOST || '127.0.0.1');
    const url = `http://${host}:${port}`;
    console.log(`Abrí ${url} en este equipo. Cerrá esta ventana para detener el tablero.`);
    const command = process.platform === 'win32' ? ['cmd.exe', ['/d', '/c', 'start', '""', url]] :
      process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    const browser = spawn(command[0], command[1], { stdio: 'ignore' });
    browser.on('error', () => console.log('No se pudo abrir el navegador automáticamente. Usá la dirección indicada.'));
    browser.on('exit', code => { if (code) console.log('Abrí el navegador manualmente usando la dirección indicada.'); });
    browser.unref();
  }
});
child.on('error', () => { console.error('No se pudo iniciar Node.js.'); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
