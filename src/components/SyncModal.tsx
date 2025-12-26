import React, { useState, useEffect, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { exportDB, importDB } from '../db';
import { useLanguage } from '../contexts/LanguageContext';
import './SyncModal.css';

interface SyncModalProps {
    onClose: () => void;
}

// Security Helper: Simple AES encryption using PIN as secret
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

    // Combine SALT + IV + ENCRYPTED_DATA
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
        throw new Error("Invalid PIN or corrupted data.");
    }
};

type Step = 'idle' | 'preparing' | 'ready' | 'joining' | 'merging' | 'success' | 'error';

export const SyncModal: React.FC<SyncModalProps> = ({ onClose }) => {
    const { t } = useLanguage();
    const [mode, setMode] = useState<'host' | 'join'>('host');
    const [step, setStep] = useState<Step>('idle');
    const [msg, setMsg] = useState('');
    const [syncKey, setSyncKey] = useState(''); // This is the file.io link or ID
    const [pin, setPin] = useState('');
    const [inputPin, setInputPin] = useState('');
    const [syncStats, setSyncStats] = useState<{ books: number; logs: number } | null>(null);

    // Host: Start sharing
    const startHosting = async () => {
        setStep('preparing');
        setMsg('Encrypting your book logs...');

        try {
            const rawData = await exportDB();
            // Generate a random 6-character PIN
            const newPin = Math.random().toString(36).substring(2, 8).toUpperCase();
            setPin(newPin);

            const encrypted = await encryptData(rawData, newPin);

            setMsg('Uploading to secure relay...');
            // Upload to file.io (anonymous one-time storage)
            const formData = new FormData();
            const blob = new Blob([encrypted], { type: 'text/plain' });
            formData.append('file', blob, 'readlog_sync.txt');

            const res = await fetch('https://file.io/?expires=5m', {
                method: 'POST',
                body: formData
            });

            if (!res.ok) throw new Error("Relay server busy.");
            const info = await res.json();

            setSyncKey(info.key); // This is the short ID
            setStep('ready');
            setMsg('Ready to share!');
        } catch (e: any) {
            setStep('error');
            setMsg(e.message);
        }
    };

    // Join: Connect and merge
    const startJoining = async (targetId: string, targetPin: string) => {
        if (!targetId || targetPin.length < 4) return;
        setStep('joining');
        setMsg('Connecting to relay...');

        try {
            const res = await fetch(`https://file.io/${targetId}`);
            if (!res.ok) throw new Error("Sync code expired or invalid.");
            const encrypted = await res.text();

            setMsg('Decrypting data...');
            const rawData = await decryptData(encrypted, targetPin.toUpperCase());

            setMsg('Merging library...');
            const stats = await importDB(rawData);

            setSyncStats({ books: stats.booksImported, logs: stats.logsImported });
            setStep('success');
            setMsg('Sync Success!');
        } catch (e: any) {
            setStep('error');
            setMsg(e.message);
        }
    };

    // Scanner Effect
    useEffect(() => {
        let scanner: Html5QrcodeScanner | null = null;
        if (mode === 'join' && step === 'idle') {
            scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 }, false);
            scanner.render((text) => {
                // Expected format: KEY|PIN
                if (text.includes('|')) {
                    const [key, p] = text.split('|');
                    scanner?.clear();
                    startJoining(key, p);
                } else {
                    setMsg("Invalid QR Code format.");
                }
            }, () => { });
        }
        return () => { scanner?.clear(); };
    }, [mode, step]);

    const qrValue = `${syncKey}|${pin}`;

    return (
        <div className="sync-modal-overlay">
            <div className={`sync-modal step-${step}`}>
                <div className="sync-header">
                    <h2>{t('sync_devices')}</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="sync-tabs">
                    <button className={`tab-btn ${mode === 'host' ? 'active' : ''}`} onClick={() => { setMode('host'); setStep('idle'); }}>
                        📤 Send Data
                    </button>
                    <button className={`tab-btn ${mode === 'join' ? 'active' : ''}`} onClick={() => { setMode('join'); setStep('idle'); }}>
                        📥 Receive Data
                    </button>
                </div>

                <div className="sync-body">
                    {step === 'idle' && (
                        <div className="idle-view animate-in">
                            {mode === 'host' ? (
                                <div className="host-init">
                                    <div className="sync-illustration">🛰️</div>
                                    <p className="desc">Generate a one-time secure link to sync your logs with another device.</p>
                                    <button className="premium-btn" onClick={startHosting}>Create Sync Session</button>
                                </div>
                            ) : (
                                <div className="join-init">
                                    <div className="manual-form">
                                        <div className="input-group">
                                            <input
                                                type="text"
                                                placeholder="Enter Room ID"
                                                value={syncKey}
                                                onChange={e => setSyncKey(e.target.value)}
                                            />
                                            <input
                                                type="text"
                                                placeholder="Enter PIN"
                                                className="pin-input"
                                                value={inputPin}
                                                maxLength={8}
                                                onChange={e => setInputPin(e.target.value)}
                                            />
                                        </div>
                                        <button className="premium-btn" onClick={() => startJoining(syncKey, inputPin)}>Join Room</button>
                                    </div>
                                    <div className="divider"><span>OR SCAN QR</span></div>
                                    <div id="reader" className="scanner-box"></div>
                                </div>
                            )}
                        </div>
                    )}

                    {(step === 'preparing' || step === 'joining' || step === 'merging') && (
                        <div className="loading-view">
                            <div className="sync-spinner"></div>
                            <p className="status-msg">{msg}</p>
                            <p className="pulsing-text">Please keep this window open</p>
                        </div>
                    )}

                    {step === 'ready' && (
                        <div className="ready-view animate-in">
                            <div className="qr-card">
                                <QRCodeCanvas value={qrValue} size={220} includeMargin={true} />
                                <div className="id-details">
                                    <div className="id-item">
                                        <span className="label">Room ID</span>
                                        <code className="val">{syncKey}</code>
                                    </div>
                                    <div className="id-item">
                                        <span className="label">Encryption PIN</span>
                                        <code className="val pin">{pin}</code>
                                    </div>
                                </div>
                            </div>
                            <p className="hint">The link expires in 5 minutes and works only once.</p>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="success-view animate-in">
                            <div className="success-icon">✨</div>
                            <h3>Library Synced!</h3>
                            {syncStats && (
                                <div className="stats-results">
                                    <div className="stat">
                                        <strong>{syncStats.books}</strong>
                                        <span>New Books</span>
                                    </div>
                                    <div className="stat">
                                        <strong>{syncStats.logs}</strong>
                                        <span>New Logs</span>
                                    </div>
                                </div>
                            )}
                            <button className="premium-btn" onClick={() => window.location.reload()}>Reload Library</button>
                        </div>
                    )}

                    {step === 'error' && (
                        <div className="error-view animate-in">
                            <div className="error-icon">⚠️</div>
                            <h3>Sync Failed</h3>
                            <p className="desc">{msg}</p>
                            <button className="secondary-btn" onClick={() => setStep('idle')}>Try Again</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
