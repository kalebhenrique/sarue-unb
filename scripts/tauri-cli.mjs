#!/usr/bin/env node
/**
 * scripts/tauri-cli.mjs
 *
 * Wrapper inteligente para a CLI do Tauri:
 * 1. Se o comando for 'dev' e nenhuma flag --config tiver sido passada,
 *    adiciona automaticamente '--config src-tauri/tauri.dev.conf.json'
 *    para garantir que o ambiente dev use sempre 'br.unb.sarue.dev'
 *    e nunca encoste na pasta de produção pessoal 'br.unb.sarue'.
 * 2. Se for um comando para Android ('android'), detecta automaticamente
 *    o Android SDK e NDK instalados e configura os compiladores C e arquivadores
 *    (AR, RANLIB, CLANG) do target para compilações nativas de crates como
 *    libsodium-sys e Stronghold.
 */

import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const rawArgs = process.argv.slice(2);
const isPreview = rawArgs.includes('--preview') || process.env.SARUE_ANDROID_PREVIEW === '1';
const shouldInstall = rawArgs.includes('--install');
if (isPreview) {
  process.env.SARUE_ANDROID_PREVIEW = '1';
}
const args = rawArgs.filter((arg) => arg !== '--preview' && arg !== '--install');

const isDev = args[0] === 'dev';
const isAndroidDev = args[0] === 'android' && args[1] === 'dev';
const isAndroidStudioScript = args[0] === 'android' && args[1] === 'android-studio-script';
const hasConfig = args.includes('-c') || args.includes('--config');

if (isDev && !hasConfig) {
  const devConfigPath = path.join(rootDir, 'src-tauri', 'tauri.dev.conf.json');
  args.splice(1, 0, '--config', devConfigPath);
}

// Para desenvolvimento Android com USB-C / adb reverse (sem emulador / sem Android Studio),
// garante que o dev server responda em 127.0.0.1 e que as portas sejam reversas no adb.
if (isAndroidDev && !args.includes('--host')) {
  args.push('--host', '127.0.0.1');
}

function setupAndroidEnvironment() {
  const homeDir = os.homedir();
  const sdkDir =
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    path.join(homeDir, 'Library/Android/sdk');

  if (!fs.existsSync(sdkDir)) return;
  process.env.ANDROID_HOME = sdkDir;
  process.env.ANDROID_SDK_ROOT = sdkDir;

  const appendToPath = (dir) => {
    if (!fs.existsSync(dir)) return false;
    const entries = (process.env.PATH || '').split(path.delimiter);
    if (!entries.includes(dir)) {
      process.env.PATH = `${process.env.PATH || ''}${path.delimiter}${dir}`;
    }
    return true;
  };

  appendToPath(path.join(sdkDir, 'platform-tools'));

  let ndkDir = process.env.NDK_HOME || process.env.ANDROID_NDK_HOME;
  if (!ndkDir || !fs.existsSync(ndkDir)) {
    const ndkRoot = path.join(sdkDir, 'ndk');
    if (fs.existsSync(ndkRoot)) {
      const versions = fs.readdirSync(ndkRoot).filter((d) => !d.startsWith('.'));
      if (versions.length > 0) {
        versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
        ndkDir = path.join(ndkRoot, versions[0]);
      }
    }
  }

  if (ndkDir && fs.existsSync(ndkDir)) {
    process.env.NDK_HOME = ndkDir;
    process.env.ANDROID_NDK_HOME = ndkDir;

    let hostTag = 'darwin-x86_64';
    if (process.platform === 'linux') hostTag = 'linux-x86_64';
    else if (process.platform === 'win32') hostTag = 'windows-x86_64';

    const toolchainBin = path.join(ndkDir, 'toolchains/llvm/prebuilt', hostTag, 'bin');
    if (appendToPath(toolchainBin)) {

      const llvmAr = path.join(toolchainBin, 'llvm-ar');
      const llvmRanlib = path.join(toolchainBin, 'llvm-ranlib');

      // Necessário para Autotools / makefile do libsodium-sys-stable no Android
      process.env.AR = llvmAr;
      process.env.RANLIB = llvmRanlib;

      // Garante que proc-macros do host (ex.: sqlx-macros -> libsqlite3-sys em aarch64-apple-darwin)
      // usem o ar/ranlib nativo do macOS em vez do llvm-ar do NDK (evita mis-aligned LINKEDIT no dylib).
      if (process.platform === 'darwin') {
        for (const hostPrefix of ['aarch64_apple_darwin', 'AARCH64_APPLE_DARWIN', 'x86_64_apple_darwin', 'X86_64_APPLE_DARWIN']) {
          process.env[`AR_${hostPrefix}`] = '/usr/bin/ar';
          process.env[`RANLIB_${hostPrefix}`] = '/usr/bin/ranlib';
          process.env[`CC_${hostPrefix}`] = '/usr/bin/clang';
        }
      }

      const apiLevel = 24; // minSdk do projeto
      const targets = [
        {
          triple: 'aarch64-linux-android',
          envPrefix: 'AARCH64_LINUX_ANDROID',
          clang: `aarch64-linux-android${apiLevel}-clang`,
        },
        {
          triple: 'armv7-linux-androideabi',
          envPrefix: 'ARMV7_LINUX_ANDROIDEABI',
          clang: `armv7a-linux-androideabi${apiLevel}-clang`,
        },
        {
          triple: 'i686-linux-android',
          envPrefix: 'I686_LINUX_ANDROID',
          clang: `i686-linux-android${apiLevel}-clang`,
        },
        {
          triple: 'x86_64-linux-android',
          envPrefix: 'X86_64_LINUX_ANDROID',
          clang: `x86_64-linux-android${apiLevel}-clang`,
        },
      ];

      for (const t of targets) {
        const clangPath = path.join(toolchainBin, t.clang);
        const clangxxPath = `${clangPath}++`;
        const lowerPrefix = t.envPrefix.toLowerCase();
        process.env[`CC_${lowerPrefix}`] = clangPath;
        process.env[`CXX_${lowerPrefix}`] = clangxxPath;
        process.env[`AR_${lowerPrefix}`] = llvmAr;
        process.env[`CC_${t.envPrefix}`] = clangPath;
        process.env[`CXX_${t.envPrefix}`] = clangxxPath;
        process.env[`AR_${t.envPrefix}`] = llvmAr;
        process.env[`CARGO_TARGET_${t.envPrefix}_LINKER`] = clangPath;
        process.env[`CARGO_TARGET_${t.envPrefix}_AR`] = llvmAr;
      }
    }
  }
}

function ensureAndroidPortraitOrientation() {
  const manifestPath = path.join(
    rootDir,
    'src-tauri',
    'gen',
    'android',
    'app',
    'src',
    'main',
    'AndroidManifest.xml'
  );
  if (!fs.existsSync(manifestPath)) return;

  const current = fs.readFileSync(manifestPath, 'utf8');
  const activityRegex = /(<activity\b[^>]*android:name="\.MainActivity"[^>]*>)/;
  const match = current.match(activityRegex);
  if (!match) return;

  const activityTag = match[1];
  let updatedTag;
  if (/android:screenOrientation="[^"]*"/.test(activityTag)) {
    updatedTag = activityTag.replace(
      /android:screenOrientation="[^"]*"/,
      'android:screenOrientation="portrait"'
    );
  } else {
    updatedTag = activityTag.replace(
      'android:name=".MainActivity"',
      'android:name=".MainActivity"\n            android:screenOrientation="portrait"'
    );
  }

  if (updatedTag !== activityTag) {
    fs.writeFileSync(manifestPath, current.replace(activityTag, updatedTag), 'utf8');
  }
}

function configureAndroidVariant(preview) {
  const androidAppDir = path.join(rootDir, 'src-tauri', 'gen', 'android', 'app');
  if (!fs.existsSync(androidAppDir)) return;

  const appId = preview ? 'br.unb.sarue.preview' : 'br.unb.sarue';
  const appName = preview ? 'Saruê UnB (Preview)' : 'Saruê UnB';
  const iconsSourceDir = path.join(
    rootDir,
    'src-tauri',
    'icons',
    preview ? 'android-preview' : 'android'
  );

  const gradlePath = path.join(androidAppDir, 'build.gradle.kts');
  if (fs.existsSync(gradlePath)) {
    let gradle = fs.readFileSync(gradlePath, 'utf8');
    gradle = gradle.replace(/applicationId\s*=\s*"[^"]*"/, `applicationId = "${appId}"`);
    if (!gradle.includes('signingConfigs.getByName("debug")')) {
      gradle = gradle.replace(
        'getByName("release") {',
        'getByName("release") {\n            signingConfig = signingConfigs.getByName("debug")'
      );
    }
    fs.writeFileSync(gradlePath, gradle, 'utf8');
  }

  const stringsPath = path.join(androidAppDir, 'src', 'main', 'res', 'values', 'strings.xml');
  if (fs.existsSync(stringsPath)) {
    const stringsXml = `<resources>\n    <string name="app_name">"${appName}"</string>\n    <string name="main_activity_title">"${appName}"</string>\n</resources>\n`;
    fs.writeFileSync(stringsPath, stringsXml, 'utf8');
  }

  const resDir = path.join(androidAppDir, 'src', 'main', 'res');
  if (fs.existsSync(iconsSourceDir) && fs.existsSync(resDir)) {
    fs.cpSync(iconsSourceDir, resDir, { recursive: true, force: true });
  }
}

function installAndroidApk() {
  const apkPath = path.join(
    rootDir,
    'src-tauri',
    'gen',
    'android',
    'app',
    'build',
    'outputs',
    'apk',
    'universal',
    'release',
    'app-universal-release.apk'
  );
  if (!fs.existsSync(apkPath)) {
    console.error(`❌ APK não encontrado em: ${apkPath}\nRode 'pnpm android:preview' antes.`);
    process.exit(1);
  }
  console.log('📲 Aguardando celular via USB (verifique se a Depuração USB está ativa e autorizada na tela do aparelho)...');
  try {
    execSync('adb wait-for-device', { stdio: 'inherit', timeout: 15000 });
    execSync(`adb install -r "${apkPath}"`, { stdio: 'inherit' });
    console.log('✅ APK instalado com sucesso no celular!');
  } catch {
    console.error(
      '\n❌ Nenhum celular Android detectado pelo ADB. Verifique no aparelho:\n' +
        '  1. Opções do desenvolvedor → Depuração USB ativada\n' +
        '  2. Notificação do USB → mudar de "Apenas carregar" para "Transferência de arquivos"\n' +
        '  3. Aceitar o popup "Permitir depuração USB?" na tela do celular'
    );
    process.exit(1);
  }
}

if (args.includes('android')) {
  setupAndroidEnvironment();
  ensureAndroidPortraitOrientation();
  if (!isAndroidStudioScript) {
    configureAndroidVariant(isPreview);
  }

  if (isAndroidDev) {
    try {
      execSync('adb reverse tcp:1420 tcp:1420', { stdio: 'ignore' });
      execSync('adb reverse tcp:1421 tcp:1421', { stdio: 'ignore' });
      console.log('📱 [USB-C Dev] Portas 1420 (Vite) e 1421 (HMR) mapeadas no dispositivo via adb reverse.');
    } catch (err) {
      console.warn(
        '⚠️ [USB-C Dev] adb reverse falhou (conecte o aparelho com Depuração USB se precisar de HMR):',
        err instanceof Error ? err.message : String(err)
      );
    }
  }
}

let command;
let spawnArgs;
const spawnOptions = {
  cwd: rootDir,
  stdio: 'inherit',
  env: process.env,
};

try {
  const require = createRequire(import.meta.url);
  const tauriPkgPath = require.resolve('@tauri-apps/cli/package.json');
  const tauriEntry = path.join(path.dirname(tauriPkgPath), 'tauri.js');
  command = process.execPath;
  spawnArgs = [tauriEntry, ...args];
} catch {
  const binName = process.platform === 'win32' ? 'tauri.cmd' : 'tauri';
  command = path.join(rootDir, 'node_modules', '.bin', binName);
  spawnArgs = args;
  if (process.platform === 'win32') {
    spawnOptions.shell = true;
  }
}

const child = spawn(command, spawnArgs, spawnOptions);

child.on('error', (err) => {
  console.error('❌ Falha ao iniciar a CLI do Tauri:', err.message);
  process.exit(1);
});

child.on('exit', (code) => {
  if ((code ?? 0) === 0 && args.includes('android')) {
    ensureAndroidPortraitOrientation();
    if (shouldInstall && !isAndroidStudioScript) {
      installAndroidApk();
    }
  }
  process.exit(code ?? 0);
});
