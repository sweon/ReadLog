import React, { useState, useEffect } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';
import { exportDB, importDB } from '../db';
import { useLanguage } from '../contexts/LanguageContext';
import './SyncModal.css';

interface SyncModalProps {
    onClose: () => void;
}

// Security Helper: AES-GCM encryption
const encryptData = async (data: string, pin: string) => {
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(data);
    const encodedPin = encoder.encode(pin);

    const keyMaterial = await crypto.subtle.importKey("raw", encodedPin, "PBKDF2", false, ["deriveKey"]);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt"]
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encodedData);

    const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encrypted), salt.length + iv.length);

    return btoa(String.fromCharCode(...combined));
};

const decryptData = async (base64Data: string, pin: string) => {
    try {
        const combined = new Uint8Array(atob(base64Data).split("").map(c => c.charCodeAt(0)));
        const salt = combined.slice(0, 16);
        const iv = combined.slice(16, 28);
        const encrypted = combined.slice(28);

        const encoder = new TextEncoder();
        const encodedPin = encoder.encode(pin);
        const keyMaterial = await crypto.subtle.importKey("raw", encodedPin, "PBKDF2", false, ["deriveKey"]);
        const key = await crypto.subtle.deriveKey(
            { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            false,
            ["decrypt"]
        );

        const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
        return new TextDecoder().decode(decrypted);
    } catch (e) {
        throw new Error("INVALID_PIN");
    }
};

type Step = 'idle' | 'preparing' | 'ready' | 'joining' | 'merging' | 'success' | 'error';

export const SyncModal: React.FC<SyncModalProps> = ({ onClose }) => {
    const { t } = useLanguage();
    const [mode, setMode] = useState<'host' | 'join'>('host');
    const [step, setStep] = useState<Step>('idle');
    const [msg, setMsg] = useState('');
    const [syncKey, setSyncKey] = useState('');
    const [pin, setPin] = useState('');
    const [inputPin, setInputPin] = useState('');
    const [inputKey, setInputKey] = useState(''); // Separate state for manual entry
    const [syncStats, setSyncStats] = useState<{ books: number; logs: number } | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [isBidirectional, setIsBidirectional] = useState(false); // Track if we are sending back
    const html5QrCodeRef = React.useRef<Html5Qrcode | null>(null);

    // Host: Start sharing
    const startHosting = async (silent = false) => {
        if (!silent) {
            setStep('preparing');
            setMsg('Encrypting library data...');
        }

        try {
            const rawData = await exportDB();
            const newPin = Math.floor(1000 + Math.random() * 9000).toString();
            setPin(newPin);

            const encrypted = await encryptData(rawData, newPin);

            const formData = new FormData();
            const blob = new Blob([encrypted], { type: 'text/plain' });
            formData.append('file', blob, 'sync.txt');

            const res = await fetch('https://tmpfiles.org/api/v1/upload', {
                method: 'POST',
                body: formData
            });

            if (!res.ok) throw new Error("RELAY_SERVER_BUSY");
            const info = await res.json();

            const url = info.data.url;
            const parts = url.split('/');
            const id = parts[parts.length - 2];

            setSyncKey(id);
            if (!silent) {
                setStep('ready');
                setMsg('Connection Ready');
            }
            return { id, pin: newPin };
        } catch (e: any) {
            if (!silent) {
                setStep('error');
                setMsg('Failed to create sync session. Check your internet connection.');
            }
            throw e;
        }
    };

    // Join: Connect and merge
    const startJoining = async (targetId: string, targetPin: string) => {
        if (!targetId || targetPin.length < 4) return;
        setStep('joining');
        setMsg('Connecting to sender...');

        try {
            // RELIABILITY: Use 'raw' mode for direct content string retrieval
            const rawDlUrl = `https://tmpfiles.org/dl/${targetId}/sync.txt`;
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(rawDlUrl)}`;

            setMsg('Downloading sync package...');
            const res = await fetch(proxyUrl);
            if (!res.ok) throw new Error("DOWNLOAD_ERROR");

            const encrypted = await res.text();

            // Check if the payload looks like an actual encrypted string (long enough)
            if (!encrypted || encrypted.length < 50) {
                if (encrypted.includes("not found") || encrypted.includes("404")) {
                    throw new Error("NOT_FOUND");
                }
                throw new Error("EMPTY_PACKAGE");
            }

            setMsg('Merging into local library...');
            const rawData = await decryptData(encrypted, targetPin);

            const stats = await importDB(rawData);

            setSyncStats({ books: stats.booksImported, logs: stats.logsImported });
            setStep('success');
            setMsg('Library Synced!');
        } catch (e: any) {
            console.error("Sync Join Error:", e);
            setStep('error');
            if (e.message === 'INVALID_PIN') {
                setMsg('Incorrect Passcode. Please check the sending device.');
            } else if (e.message === 'NOT_FOUND') {
                setMsg('Session not found or expired. Host a new sync and try again.');
            } else if (e.message === 'DOWNLOAD_ERROR') {
                setMsg('Relay connection failed. Please try again in a moment.');
            } else {
                setMsg(`Sync failed: ${e.message || 'Unknown network error'}`);
            }
        }
    };

    const handleSendBack = async () => {
        setIsBidirectional(true);
        setMsg('Preparing response...');
        try {
            await startHosting(true); // Silent hosting
            setStep('success');
            setMsg('Union library is ready to be sent back!');
        } catch (e) {
            setIsBidirectional(false);
            setMsg('Failed to prepare response.');
        }
    };

    const stopScanner = async () => {
        if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
            try {
                await html5QrCodeRef.current.stop();
                setIsScanning(false);
            } catch (e) {
                console.error("Scanner Stop Error", e);
            }
        }
    };

    const startScanner = async () => {
        setIsScanning(true);
        setMsg("");

        setTimeout(async () => {
            try {
                const element = document.getElementById("reader");
                if (!element) throw new Error("SCANNER_DOM_NOT_READY");

                if (!html5QrCodeRef.current) {
                    html5QrCodeRef.current = new Html5Qrcode("reader");
                }

                if (html5QrCodeRef.current.isScanning) return;

                await html5QrCodeRef.current.start(
                    { facingMode: "environment" },
                    { fps: 10, qrbox: 250 },
                    (text) => {
                        if (text.includes('|')) {
                            const [key, p] = text.split('|');
                            stopScanner();
                            startJoining(key, p);
                        } else {
                            setMsg("Invalid QR code format.");
                        }
                    },
                    () => { /* quiet scan failure */ }
                );
            } catch (err) {
                console.error("Scanner Start Error", err);
                setIsScanning(false);
                setMsg("Camera access denied or failed.");
            }
        }, 500);
    };

    useEffect(() => {
        return () => {
            stopScanner();
        };
    }, []);

    const qrValue = `${syncKey}|${pin}`;

    return (
        <div className="sync-modal-overlay">
            <div className={`sync-modal step-${step}`}>
                <div className="sync-header">
                    <h2>{t('sync_devices')}</h2>
                    <button className="close-btn" onClick={() => { stopScanner(); onClose(); }}>×</button>
                </div>

                <div className="sync-tabs">
                    <button
                        className={`tab-btn ${mode === 'host' ? 'active' : ''}`}
                        onClick={() => { stopScanner(); setMode('host'); setStep('idle'); setMsg(''); setIsBidirectional(false); }}
                    >
                        📤 {t('sync_devices')} (Send)
                    </button>
                    <button
                        className={`tab-btn ${mode === 'join' ? 'active' : ''}`}
                        onClick={() => { stopScanner(); setMode('join'); setStep('idle'); setMsg(''); setIsBidirectional(false); }}
                    >
                        📥 {t('sync_devices')} (Receive)
                    </button>
                </div>

                <div className="sync-body">
                    {step === 'idle' && (
                        <div className="idle-view animate-in">
                            {mode === 'host' ? (
                                <div className="host-init">
                                    <div className="sync-illustration">🛰️</div>
                                    <p className="desc">{t('sync_data_desc')}</p>
                                    <button className="premium-btn" onClick={() => startHosting()}>Generate Sync Codes</button>
                                </div>
                            ) : (
                                <div className="join-init">
                                    <p className="instruction-text">{t('sync_how_to_join')}</p>
                                    <div className="manual-form">
                                        <div className="input-group">
                                            <div className="input-field">
                                                <label>{t('sync_room_id')}</label>
                                                <input
                                                    type="text"
                                                    placeholder="e.g. 17210191"
                                                    value={inputKey}
                                                    onChange={e => setInputKey(e.target.value.trim())}
                                                />
                                            </div>
                                            <div className="input-field">
                                                <label>{t('sync_passcode')}</label>
                                                <input
                                                    type="tel"
                                                    pattern="[0-9]*"
                                                    inputMode="numeric"
                                                    placeholder="4-digit code"
                                                    className="pin-input"
                                                    value={inputPin}
                                                    maxLength={4}
                                                    onChange={e => setInputPin(e.target.value.replace(/\D/g, ''))}
                                                />
                                            </div>
                                        </div>
                                        <button
                                            className="premium-btn"
                                            onClick={() => startJoining(inputKey, inputPin)}
                                            disabled={!inputKey || inputPin.length < 4}
                                        >
                                            Connect & Sync
                                        </button>
                                        {msg && mode === 'join' && <p className="error-hint" style={{ color: '#ff6b6b', fontSize: '0.85rem', marginTop: '1rem' }}>{msg}</p>}
                                    </div>
                                    <div className="divider"><span>OR SCAN QR CODE</span></div>
                                    <div className="scanner-container">
                                        {!isScanning ? (
                                            <button className="secondary-btn start-scan-btn" onClick={startScanner}>
                                                📷 Scan QR Code
                                            </button>
                                        ) : (
                                            <button className="secondary-btn stop-scan-btn" onClick={stopScanner}>
                                                ⏹️ Stop Camera
                                            </button>
                                        )}
                                        <div
                                            id="reader"
                                            className="scanner-box"
                                            style={{
                                                marginTop: '1.5rem',
                                                display: isScanning ? 'block' : 'none',
                                                border: isScanning ? '2px solid var(--primary-color)' : 'none'
                                            }}
                                        ></div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {(step === 'preparing' || step === 'joining' || step === 'merging') && (
                        <div className="loading-view">
                            <div className="sync-spinner"></div>
                            <p className="status-msg">{msg}</p>
                            <p className="pulsing-text">Please keep this window open...</p>
                        </div>
                    )}

                    {step === 'ready' && (
                        <div className="ready-view animate-in">
                            <p className="instruction-text" style={{ marginBottom: '1.5rem' }}>{t('sync_how_to_host')}</p>
                            <div className="qr-card">
                                <QRCodeCanvas value={qrValue} size={220} includeMargin={true} />
                                <div className="id-details">
                                    <div className="id-item">
                                        <span className="label">{t('sync_room_id')}</span>
                                        <code className="val">{syncKey}</code>
                                    </div>
                                    <div className="id-item">
                                        <span className="label">{t('sync_passcode')}</span>
                                        <code className="val pin">{pin}</code>
                                    </div>
                                </div>
                            </div>

                            <div className="bidirectional-section">
                                <div className="divider"><span>{t('sync_waiting_response')}</span></div>
                                <div className="manual-form compact">
                                    <div className="input-group">
                                        <div className="input-field">
                                            <input
                                                type="text"
                                                placeholder={t('sync_room_id')}
                                                value={inputKey}
                                                onChange={e => setInputKey(e.target.value.trim())}
                                            />
                                        </div>
                                        <div className="input-field">
                                            <input
                                                type="tel"
                                                placeholder={t('sync_passcode')}
                                                className="pin-input small"
                                                value={inputPin}
                                                maxLength={4}
                                                onChange={e => setInputPin(e.target.value.replace(/\D/g, ''))}
                                            />
                                        </div>
                                        <button
                                            className="secondary-btn"
                                            onClick={() => startJoining(inputKey, inputPin)}
                                            style={{ height: '48px', padding: '0 1rem' }}
                                        >
                                            📥
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="success-view animate-in">
                            <div className="success-icon">✨</div>
                            <h3>{msg}</h3>
                            {syncStats && (
                                <div className="stats-results">
                                    <div className="stat">
                                        <strong>{syncStats.books}</strong>
                                        <span>{t('books')}</span>
                                    </div>
                                    <div className="stat">
                                        <strong>{syncStats.logs}</strong>
                                        <span>{t('sessions')}</span>
                                    </div>
                                </div>
                            )}

                            {!isBidirectional ? (
                                <div className="union-actions">
                                    <p className="hint" style={{ marginBottom: '1.5rem' }}>Want both devices to have the exact same combined library?</p>
                                    <button className="premium-btn" onClick={handleSendBack} style={{ background: 'linear-gradient(135deg, #FF9800, #F44336)', marginBottom: '1rem' }}>
                                        🔄 {t('sync_send_response')}
                                    </button>
                                    <button className="secondary-btn" onClick={() => window.location.reload()}>No, just finish</button>
                                </div>
                            ) : (
                                <div className="ready-view">
                                    <div className="qr-card mini">
                                        <QRCodeCanvas value={qrValue} size={150} includeMargin={true} />
                                        <div className="id-details">
                                            <div className="id-item">
                                                <code className="val">{syncKey}</code>
                                            </div>
                                            <div className="id-item">
                                                <code className="val pin">{pin}</code>
                                            </div>
                                        </div>
                                    </div>
                                    <p className="hint">Enter these codes on the first device to complete the union.</p>
                                    <button className="premium-btn" onClick={() => window.location.reload()} style={{ marginTop: '1.5rem' }}>Finish & Reload</button>
                                </div>
                            )}
                        </div>
                    )}

                    {step === 'error' && (
                        <div className="error-view animate-in">
                            <div className="error-icon">⚠️</div>
                            <h3>Sync Failed</h3>
                            <p className="desc" style={{ marginBottom: '2rem' }}>{msg}</p>
                            <button className="secondary-btn" onClick={() => { stopScanner(); setStep('idle'); setIsBidirectional(false); }}>Go Back</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
