import fs from 'fs';
import path from 'path';

const { ZipArchive } = await import('archiver');

const output = fs.createWriteStream('bot-discloud.zip');
const archive = new ZipArchive({ zlib: { level: 9 } });

output.on('close', () => {
    console.log(`\n✅ Zip criado com sucesso! Tamanho: ${(archive.pointer() / 1024).toFixed(2)} KB`);
    console.log(`Pronto para fazer o upload do bot-discloud.zip no Discloud.`);
});

archive.on('error', err => { throw err; });
archive.pipe(output);

const ignore = ['node_modules', '.git', 'data.db', 'bot-discloud.zip', 'bot_host.zip', 'zip-bot.js'];

function addDirectory(dir, zipPath) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (ignore.includes(file) && dir === '.') continue;
        
        const fullPath = path.join(dir, file);
        // Replace windows backslashes with forward slashes for the zip
        const relativePath = zipPath ? `${zipPath}/${file}` : file;
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            addDirectory(fullPath, relativePath);
        } else {
            // Force 0644 for files
            archive.file(fullPath, { name: relativePath, mode: 0o644 });
        }
    }
}

console.log('Empacotando arquivos com permissões corrigidas para Linux...');
addDirectory('.', '');
archive.finalize();
