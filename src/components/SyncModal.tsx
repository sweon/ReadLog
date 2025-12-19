import React, { useState, useEffect, useRef } from 'react';
import Peer from 'peerjs';
import { QRCodeCanvas } from 'qrcode.react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { exportDB, importDB } from '../db';
import './SyncModal.css';

interface SyncModalProps {
    onClose: () => void;
}

export const SyncModal: React.FC<SyncModalProps> = ({ onClose }) => {
    const [mode, setMode] = useState<'send' | 'receive'>('send');
    const [status, setStatus] = useState('Initializing...');
    const [peerId, setPeerId] = useState('');
    const [progress, setProgress] = useState(0);
    const peerRef = useRef<Peer | null>(null);

    // --- HOST / SEND LOGIC ---
    useEffect(() => {
        if (mode === 'send') {
            const peer = new Peer();
            peerRef.current = peer;

            peer.on('open', (id) => {
                setPeerId(id);
                setStatus('Ready to scan. Waiting for connection...');
            });

            peer.on('connection', (conn) => {
                setStatus('Connected! Preparing data...');
                conn.on('open', async () => {
                    setStatus('Sending data...');
                    const data = await exportDB();
                    conn.send(data);
                    setStatus('Data sent! You can close this window.');
                    setProgress(100);
                });
            });

            peer.on('error', (err) => {
                console.error(err);
                setStatus(`Error: ${err.type}`);
            });

            return () => {
                peer.destroy();
            };
        }
    }, [mode]);

    // --- GUEST / RECEIVE LOGIC ---
    useEffect(() => {
        if (mode === 'receive') {
            setStatus('Please scan the host QR code.');
            // Initialize scanner
            const scanner = new Html5QrcodeScanner(
                "reader",
                { fps: 10, qrbox: { width: 250, height: 250 } },
                /* verbose= */ false
            );

            scanner.render(async (decodedText) => {
                // Determine if decodedText is a UUID (PeerID)
                if (decodedText && decodedText.length > 10) {
                    scanner.clear();
                    connectToHost(decodedText);
                }
            }, (error) => {
                // specific scan failure, ignore or log
                console.warn(error);
            });

            return () => {
                try {
                    scanner.clear();
                } catch (e) {
                    // ignore cleanup errors
                }
            };
        }
    }, [mode]);

    const connectToHost = (hostId: string) => {
        setStatus(`Connecting to host: ${hostId}...`);
        const peer = new Peer();
        peerRef.current = peer;

        peer.on('open', () => {
            const conn = peer.connect(hostId);
            conn.on('open', () => {
                setStatus('Connected! Waiting for data...');
            });
            conn.on('data', async (data) => {
                setStatus('Receiving data...');
                if (typeof data === 'string') {
                    try {
                        await importDB(data);
                        setStatus('Success! Data synced completely. Refreshing...');
                        setProgress(100);
                        setTimeout(() => window.location.reload(), 2000);
                    } catch (e) {
                        setStatus('Error importing data.');
                        console.error(e);
                    }
                }
            });
        });

        peer.on('error', (err) => {
            setStatus(`Connection Error: ${err.message}`);
        });
    };

    return (
        <div className="sync-modal-overlay">
            <div className="sync-modal">
                <div className="sync-header">
                    <h2>Sync Data</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="sync-tabs">
                    <button
                        className={`tab-btn ${mode === 'send' ? 'active' : ''}`}
                        onClick={() => setMode('send')}
                    >
                        Send (Host)
                    </button>
                    <button
                        className={`tab-btn ${mode === 'receive' ? 'active' : ''}`}
                        onClick={() => setMode('receive')}
                    >
                        Receive (Scan)
                    </button>
                </div>

                <div className="sync-content">
                    <p className="status-text">{status}</p>

                    {mode === 'send' && peerId && (
                        <div className="qr-container">
                            <QRCodeCanvas value={peerId} size={200} />
                            <p className="peer-id-text">ID: {peerId}</p>
                        </div>
                    )}

                    {mode === 'receive' && (
                        <div id="reader" className="scanner-container"></div>
                    )}

                    {progress === 100 && <div className="success-checkmark">✅</div>}
                </div>
            </div>
        </div>
    );
};
