'use client';

import { useEffect, useState } from 'react';

export default function GlobalError({ error, reset }) {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        console.error('Global Application Error:', error);
    }, [error]);

    const errorText = `${error?.message || 'Unknown error'}\n\n${error?.stack || ''}`;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(errorText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* clipboard not available */ }
    };

    return (
        <div style={{ padding: '3rem', textAlign: 'center', fontFamily: 'var(--font-sans, sans-serif)', color: 'var(--color-text)', backgroundColor: 'var(--color-background)' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: 'var(--color-danger)' }}>
                システムエラーが発生しました
            </h2>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '2rem', lineHeight: 1.5 }}>
                データベースのロードに失敗したか、予期せぬエラーが発生しました。<br />
                アプリを再起動するか、以下のボタンからもう一度お試しください。
            </p>
            <button
                onClick={() => reset()}
                className="btn-primary"
                style={{ padding: '0.75rem 1.5rem', fontSize: '0.9rem' }}
            >
                再読み込み
            </button>

            <details style={{ marginTop: '2rem', textAlign: 'left', maxWidth: '600px', marginInline: 'auto' }}>
                <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: 'var(--color-text-muted)', padding: '0.5rem 0' }}>
                    エラー詳細
                </summary>
                <pre style={{
                    marginTop: '0.5rem', padding: '1rem', fontSize: '0.75rem', lineHeight: 1.5,
                    background: 'var(--color-surface-hover)', border: '1px solid var(--border-color)',
                    borderRadius: '8px', color: 'var(--color-text-secondary)',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflow: 'auto', maxHeight: '300px',
                }}>{errorText}</pre>
                <button
                    onClick={handleCopy}
                    style={{
                        marginTop: '0.5rem', padding: '0.4rem 0.8rem', fontSize: '0.78rem',
                        background: 'transparent', border: '1px solid var(--border-color)',
                        borderRadius: '6px', color: 'var(--color-text-secondary)',
                        cursor: 'pointer', fontFamily: 'inherit',
                    }}
                >
                    {copied ? 'コピーしました' : 'エラー内容をコピー'}
                </button>
            </details>
        </div>
    );
}
