import { execSync } from 'child_process';
import fs from 'fs';

const tag = process.env.GITHUB_REF_NAME || process.argv[2];
if (!tag) {
  console.error('Erro: Tag da release não fornecida (defina GITHUB_REF_NAME ou passe como argumento).');
  process.exit(1);
}

console.log(`[consolidate-latest-json] Analisando release: ${tag}...`);

let releaseJson;
try {
  const raw = execSync(`gh release view "${tag}" --json assets,tagName,name,body,publishedAt`, {
    encoding: 'utf-8',
  });
  releaseJson = JSON.parse(raw);
} catch (err) {
  console.error(`[consolidate-latest-json] Falha ao obter dados da release ${tag}:`, err.message);
  process.exit(1);
}

const assets = releaseJson.assets || [];
console.log(`[consolidate-latest-json] Encontrados ${assets.length} assets na release.`);

let manifest = {
  version: tag.replace(/^v/, ''),
  notes: releaseJson.body || 'Veja os ativos para baixar o instalador ou utilize o auto-updater integrado no aplicativo.',
  pub_date: releaseJson.publishedAt || new Date().toISOString(),
  platforms: {},
};

try {
  const existingRaw = execSync(`gh release download "${tag}" --pattern "latest.json" -O -`, {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  const parsed = JSON.parse(existingRaw);
  if (parsed && typeof parsed === 'object') {
    manifest = {
      ...manifest,
      ...parsed,
      platforms: {
        ...(parsed.platforms || {}),
      },
    };
    console.log('[consolidate-latest-json] latest.json existente carregado. Plataformas atuais:', Object.keys(manifest.platforms));
  }
} catch {
  console.log('[consolidate-latest-json] Nenhum latest.json existente encontrado. Criando novo...');
}

function getSigContent(assetName) {
  try {
    return execSync(`gh release download "${tag}" --pattern "${assetName}" -O -`, {
      encoding: 'utf-8',
    }).trim();
  } catch (err) {
    console.warn(`[consolidate-latest-json] Aviso: Não foi possível baixar ${assetName}:`, err.message);
    return null;
  }
}

for (const asset of assets) {
  const { name, url } = asset;

  // macOS Apple Silicon (darwin-aarch64 & darwin-aarch64-app)
  if (name.includes('aarch64') && name.endsWith('.app.tar.gz')) {
    const sigAsset = assets.find((a) => a.name === `${name}.sig`);
    if (sigAsset) {
      const sig = getSigContent(sigAsset.name);
      if (sig) {
        manifest.platforms['darwin-aarch64'] = { signature: sig, url };
        manifest.platforms['darwin-aarch64-app'] = { signature: sig, url };
        console.log(`[consolidate-latest-json] Adicionado darwin-aarch64 & darwin-aarch64-app -> ${name}`);
      }
    }
  }

  // macOS Intel (darwin-x86_64 & darwin-x86_64-app)
  if ((name.includes('x64') || name.includes('x86_64')) && name.endsWith('.app.tar.gz') && !name.includes('aarch64')) {
    const sigAsset = assets.find((a) => a.name === `${name}.sig`);
    if (sigAsset) {
      const sig = getSigContent(sigAsset.name);
      if (sig) {
        manifest.platforms['darwin-x86_64'] = { signature: sig, url };
        manifest.platforms['darwin-x86_64-app'] = { signature: sig, url };
        console.log(`[consolidate-latest-json] Adicionado darwin-x86_64 & darwin-x86_64-app -> ${name}`);
      }
    }
  }

  // Linux x64 (linux-x86_64)
  if (name.endsWith('.AppImage.tar.gz')) {
    const sigAsset = assets.find((a) => a.name === `${name}.sig`);
    if (sigAsset) {
      const sig = getSigContent(sigAsset.name);
      if (sig) {
        manifest.platforms['linux-x86_64'] = { signature: sig, url };
        console.log(`[consolidate-latest-json] Adicionado linux-x86_64 -> ${name}`);
      }
    }
  }

  // Windows x64 (windows-x86_64)
  if (name.endsWith('.nsis.zip') || name.endsWith('-setup.nsis.zip') || (name.endsWith('-setup.exe') && !name.endsWith('.sig'))) {
    const sigAsset = assets.find((a) => a.name === `${name}.sig`);
    if (sigAsset && (!manifest.platforms['windows-x86_64'] || name.endsWith('.nsis.zip'))) {
      const sig = getSigContent(sigAsset.name);
      if (sig) {
        manifest.platforms['windows-x86_64'] = { signature: sig, url };
        console.log(`[consolidate-latest-json] Adicionado windows-x86_64 -> ${name}`);
      }
    }
  }
}

const finalPlatforms = Object.keys(manifest.platforms);
console.log(`[consolidate-latest-json] Total de plataformas consolidadas (${finalPlatforms.length}):`, finalPlatforms);

fs.writeFileSync('latest.json', JSON.stringify(manifest, null, 2) + '\n');

try {
  execSync(`gh release upload "${tag}" latest.json --clobber`);
  console.log('[consolidate-latest-json] latest.json enviado com sucesso com --clobber!');
} catch (err) {
  console.error('[consolidate-latest-json] Falha ao enviar latest.json para a release:', err.message);
  process.exit(1);
}
