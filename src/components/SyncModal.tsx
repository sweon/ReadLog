import React, { useState, useEffect, useRef } from 'react';
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
    const [roomId, setRoomId] = useState('');

    // Inputs for manual/scanned joining
    const [inputPin, setInputPin] = useState('');
    const [inputKey, setInputKey] = useState('');
    const [inputRoomId, setInputRoomId] = useState('');

    const [syncStats, setSyncStats] = useState<{ books: number; logs: number } | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [isFullyComplete, setIsFullyComplete] = useState(false);

    const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
    const stopPollingRef = useRef<boolean>(false);
    const joinInProgress = useRef<boolean>(false);

    // Host: Start sharing
    const startHosting = async (silent = false) => {
        if (!silent) {
            setStep('preparing');
            setMsg(t('sync_starting'));
            stopPollingRef.current = false;
        }

        try {
            const rawData = await exportDB();
            const newPin = Math.floor(1000 + Math.random() * 9000).toString();
            const newRoomId = Math.random().toString(36).substring(2, 10);

            setPin(newPin);
            setRoomId(newRoomId);

            const encrypted = await encryptData(rawData, newPin);

            const formData = new FormData();
            const blob = new Blob([encrypted], { type: 'text/plain' });
            formData.append('file', blob, 'sync.txt');

            // Upload via tmpfiles
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
                setMsg(t('sync_ready'));
                // Start polling for response from Joiner
                pollForResponse(newRoomId);
            }
            return { id, pin: newPin, roomId: newRoomId };
        } catch (e: any) {
            if (!silent) {
                setStep('error');
                setMsg('Failed to create sync session. Check your internet connection.');
            }
            throw e;
        }
    };

    // Signaling Polling (Host waits for Joiner to push back)
    const pollForResponse = async (targetRoom: string) => {
        if (stopPollingRef.current) return;

        try {
            // Long poll (approx 20s) via ntfy
            const res = await fetch(`https://ntfy.sh/readlog_sig_${targetRoom}/json?poll=1`);
            const text = await res.text();

            // ntfy can return multiple JSON objects in one stream if polled for longer
            const lines = text.trim().split('\n');
            for (const line of lines) {
                if (!line) continue;
                try {
                    const data = JSON.parse(line);
                    if (data.event === 'message' && data.message.includes('|')) {
                        const [respId, respPin] = data.message.split('|');
                        // Received response!
                        await startJoining(respId, respPin, true); // Pull response
                        return; // Stop polling
                    }
                } catch (e) { /* ignore parse error on partial lines */ }
            }

            // If we are still in 'ready' or 'success' (first half), keep polling
            if (!stopPollingRef.current && !isFullyComplete) {
                setTimeout(() => pollForResponse(targetRoom), 2000);
            }
        } catch (e) {
            console.error("Polling error", e);
            if (!stopPollingRef.current && !isFullyComplete) {
                setTimeout(() => pollForResponse(targetRoom), 5000);
            }
        }
    };

    // Join: Connect and merge
    const startJoining = async (targetId: string, targetPin: string, isResponse = false, targetRoomId?: string) => {
        if (!targetId || targetPin.length < 4 || joinInProgress.current) return;
        joinInProgress.current = true;

        if (isResponse) {
            setStep('merging');
            setMsg(t('sync_connecting'));
        } else {
            setStep('joining');
            setMsg(t('sync_connecting'));
        }

        try {
            const rawDlUrl = `https://tmpfiles.org/dl/${targetId}/sync.txt`;
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(rawDlUrl)}`;

            const res = await fetch(proxyUrl);
            if (!res.ok) throw new Error("DOWNLOAD_ERROR");
            const encrypted = await res.text();

            if (!encrypted || encrypted.length < 50) {
                if (encrypted.includes("not found") || encrypted.includes("404")) throw new Error("NOT_FOUND");
                throw new Error("EMPTY_PACKAGE");
            }

            const rawData = await decryptData(encrypted, targetPin);
            const stats = await importDB(rawData);

            setSyncStats({ books: stats.booksImported, logs: stats.logsImported });

            if (isResponse) {
                setIsFullyComplete(true);
                setStep('success');
                setMsg(t('sync_fully_complete'));
            } else {
                setStep('success');
                setMsg(t('sync_devices'));
                // AUTOMATIC RESPONSE: After merging, Joiner pushes their state back to Host
                if (targetRoomId) {
                    await sendResponseBack(targetRoomId);
                } else {
                    setIsFullyComplete(true);
                }
            }
        } catch (e: any) {
            console.error("Sync Error:", e);
            setStep('error');
            setMsg(e.message === 'INVALID_PIN' ? 'Incorrect Passcode.' : 'Sync failed. Please try again.');
        } finally {
            joinInProgress.current = false;
        }
    };

    const sendResponseBack = async (targetRoom: string) => {
        setMsg(t('sync_sending_response'));
        try {
            const rawData = await exportDB();
            const newPin = Math.floor(1000 + Math.random() * 9000).toString();
            const encrypted = await encryptData(rawData, newPin);

            const formData = new FormData();
            const blob = new Blob([encrypted], { type: 'text/plain' });
            formData.append('file', blob, 'sync.txt');

            const res = await fetch('https://tmpfiles.org/api/v1/upload', {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                const info = await res.json();
                const id = info.data.url.split('/').slice(-2, -1)[0];

                // Signal to Host through ntfy
                await fetch(`https://ntfy.sh/readlog_sig_${targetRoom}`, {
                    method: 'POST',
                    body: `${id}|${newPin}`
                });
            }
        } catch (e) {
            console.error("Auto response failed", e);
        } finally {
            setIsFullyComplete(true);
            setMsg(t('sync_fully_complete'));
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
                if (!html5QrCodeRef.current) html5QrCodeRef.current = new Html5Qrcode("reader");
                if (html5QrCodeRef.current.isScanning) return;

                await html5QrCodeRef.current.start(
                    { facingMode: "environment" },
                    { fps: 10, qrbox: 250 },
                    (text) => {
                        if (text.includes('|')) {
                            const [id, p, rid] = text.split('|');
                            stopScanner();
                            startJoining(id, p, false, rid);
                        }
                    },
                    () => { }
                );
            } catch (err) {
                setIsScanning(false);
            }
        }, 500);
    };

    useEffect(() => {
        return () => {
            stopPollingRef.current = true;
            stopScanner();
        };
    }, []);

    const qrValue = `${syncKey}|${pin}|${roomId}`;

    return (
        <div className="sync-modal-overlay">
            <div className={`sync-modal step-${step}`}>
                <div className="sync-header">
                    <h2>{t('sync_devices')}</h2>
                    <button className="close-btn" onClick={() => { stopPollingRef.current = true; stopScanner(); onClose(); }}>×</button>
                </div>

                <div className="sync-tabs">
                    <button
                        className={`tab-btn ${mode === 'host' ? 'active' : ''}`}
                        onClick={() => { setMode('host'); setStep('idle'); setIsFullyComplete(false); }}
                    >
                        📤 {t('sync_devices')} (Send)
                    </button>
                    <button
                        className={`tab-btn ${mode === 'join' ? 'active' : ''}`}
                        onClick={() => { setMode('join'); setStep('idle'); setIsFullyComplete(false); }}
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
                                                    placeholder="Room ID"
                                                    value={inputKey}
                                                    onChange={e => setInputKey(e.target.value.trim())}
                                                />
                                            </div>
                                            <div className="input-field">
                                                <label>{t('sync_passcode')}</label>
                                                <input
                                                    type="tel"
                                                    placeholder="PIN"
                                                    className="pin-input"
                                                    value={inputPin}
                                                    maxLength={4}
                                                    onChange={e => setInputPin(e.target.value.replace(/\D/g, ''))}
                                                />
                                            </div>
                                            {/* Legacy Room ID field for manual signaling if needed */}
                                            {inputKey.length > 10 && (
                                                <div className="input-field">
                                                    <label>Signal ID</label>
                                                    <input type="text" value={inputRoomId} onChange={e => setInputRoomId(e.target.value)} />
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            className="premium-btn"
                                            onClick={() => {
                                                if (inputKey.includes('|')) {
                                                    const [id, p, rid] = inputKey.split('|');
                                                    startJoining(id, p, false, rid);
                                                } else {
                                                    startJoining(inputKey, inputPin);
                                                }
                                            }}
                                            disabled={!inputKey || (inputKey.length < 5 && inputPin.length < 4)}
                                        >
                                            Connect & Sync
                                        </button>
                                    </div>
                                    <div className="divider"><span>OR SCAN QR CODE</span></div>
                                    <div className="scanner-container">
                                        {!isScanning ? (
                                            <button className="secondary-btn start-scan-btn" onClick={startScanner}>📷 Scan QR Code</button>
                                        ) : (
                                            <button className="secondary-btn stop-scan-btn" onClick={stopScanner}>⏹️ Stop Camera</button>
                                        )}
                                        <div id="reader" className="scanner-box" style={{ marginTop: '1.5rem', display: isScanning ? 'block' : 'none' }}></div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {(step === 'preparing' || step === 'joining' || step === 'merging') && (
                        <div className="loading-view">
                            <div className="sync-spinner"></div>
                            <p className="status-msg">{msg}</p>
                            <p className="pulsing-text">Please keep both devices open...</p>
                        </div>
                    )}

                    {step === 'ready' && (
                        <div className="ready-view animate-in">
                            <p className="instruction-text">{t('sync_how_to_host')}</p>
                            <div className="qr-card">
                                <QRCodeCanvas value={qrValue} size={220} includeMargin={true} />
                                <div className="id-details">
                                    <div className="id-item">
                                        <span className="label">Room ID</span>
                                        <code className="val">{syncKey}</code>
                                    </div>
                                    <div className="id-item">
                                        <span className="label">Passcode</span>
                                        <code className="val pin">{pin}</code>
                                    </div>
                                </div>
                            </div>
                            <div className="status-indicator">
                                <div className="pulse-dot"></div>
                                <span>{t('sync_waiting_response')}</span>
                            </div>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="success-view animate-in">
                            <div className="success-icon">{isFullyComplete ? '✅' : '📥'}</div>
                            <h3>{msg}</h3>
                            {syncStats && (
                                <div className="stats-results">
                                    <div className="stat"><strong>{syncStats.books}</strong><span>{t('books')}</span></div>
                                    <div className="stat"><strong>{syncStats.logs}</strong><span>{t('sessions')}</span></div>
                                </div>
                            )}

                            {isFullyComplete ? (
                                <button className="premium-btn" onClick={() => window.location.reload()}>Finish & Reload</button>
                            ) : (
                                <div className="loading-view" style={{ margin: 0 }}>
                                    <div className="sync-spinner small"></div>
                                    <p className="pulsing-text">{t('sync_sending_response')}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {step === 'error' && (
                        <div className="error-view animate-in">
                            <div className="error-icon">⚠️</div>
                            <h3>Sync Failed</h3>
                            <p className="desc">{msg}</p>
                            <button className="secondary-btn" onClick={() => { setStep('idle'); setIsFullyComplete(false); }}>Go Back</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
