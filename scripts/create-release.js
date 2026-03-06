const fs = require('fs');
const { spawnSync } = require('child_process');

try {
    // 1. package.json からバージョンを取得
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const version = packageJson.version;
    const vVersion = `v${version}`;

    console.log(`=== Yarukoto ${vVersion} リリース自動作成 ===\n`);

    // 2. RELEASE_NOTES.md から該当バージョンの抽出
    let releaseNotes = '';
    try {
        releaseNotes = fs.readFileSync('RELEASE_NOTES.md', 'utf8');
    } catch (err) {
        console.warn('[警告] RELEASE_NOTES.md が見つかりません。');
    }

    const lines = releaseNotes.split('\n');
    let notes = [];
    let capture = false;

    for (const line of lines) {
        // 例: "## v1.5.0（2026-03-06）" を検出
        if (line.match(new RegExp(`^##\\s+v${version}`))) {
            capture = true;
            continue;
        }
        // 次のバージョンの見出しが来たら終了
        if (capture && line.match(/^##\s+v/)) {
            break;
        }
        if (capture) {
            notes.push(line);
        }
    }

    const notesText = notes.join('\n').trim() || `Automated release ${vVersion}`;

    // 3. 実行ファイルのパスを組み立て
    const setupExe = `releases/${vVersion}/Yarukoto_${version}_x64-setup.exe`;
    const portableExe = `releases/${vVersion}/Yarukoto_${version}-portable.exe`;

    if (!fs.existsSync(setupExe)) {
        console.warn(`[警告] インストーラー版が見つかりません:\n -> ${setupExe}\n (先に npm run tauri build を実行してコピーを済ませていますか？)\n`);
    }
    if (!fs.existsSync(portableExe)) {
        console.warn(`[警告] ポータブル版が見つかりません:\n -> ${portableExe}\n`);
    }

    console.log(`[抽出したリリースノート]\n---\n${notesText}\n---\n`);

    // 4. gh コマンドの組み立てと実行
    const args = [
        'release', 'create', vVersion,
        setupExe, portableExe,
        '--title', vVersion,
        '--notes', notesText
    ];

    console.log('GitHub CLI (gh) を実行中...\n');

    // shell: true を指定してWindows環境で正常にコマンドが通るようにする
    const result = spawnSync('gh', args, { stdio: 'inherit', shell: true });

    if (result.status !== 0) {
        throw new Error('ghコマンドが失敗しました。');
    }

    console.log('\n✅ GitHub Releases の作成が完了しました！');

} catch (error) {
    console.error('\n❌ エラーが発生しました:', error.message);
    process.exit(1);
}
