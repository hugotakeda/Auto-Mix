/**
 * Processo filho que faz o parse pesado.
 *
 * Rodar isso fora do processo do bot importa: o parse e sincrono e segura o
 * event loop por varios segundos numa demo grande — o bot ficaria mudo no
 * Discord enquanto isso.
 *
 * Uso: node worker.js <caminho-da-demo>
 * Saida: uma linha de JSON em stdout, { ok: true, data } ou { ok: false, code, message }.
 */

import { parseDemo, DemoParseError } from './parser.js';

const filePath = process.argv[2];

if (!filePath) {
    process.stdout.write(JSON.stringify({ ok: false, code: 'NO_INPUT', message: 'Caminho da demo nao informado.' }));
    process.exit(1);
}

try {
    const result = parseDemo(filePath);
    process.stdout.write(JSON.stringify({ ok: true, data: result }));
    process.exit(0);
} catch (error) {
    const code = error instanceof DemoParseError ? error.code : 'PARSE_FAILED';
    const message = error instanceof Error ? error.message : String(error);

    process.stdout.write(JSON.stringify({ ok: false, code, message }));
    process.exit(1);
}
