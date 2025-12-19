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
    const [knownPeers, setKnownPeers] = useState<string[]>([]);
    const peerRef = useRef<Peer | null>(null);

    useEffect(() => {
        // Load known peers
        const savedPeers = localStorage.getItem('readlog_known_peers');
        if (savedPeers) {
            setKnownPeers(JSON.parse(savedPeers));
        }

        // Initialize Peer with persistent ID if possible
        let myId = localStorage.getItem('readlog_peer_id');
        if (!myId) {
            myId = crypto.randomUUID().substring(0, 8);
            localStorage.setItem('readlog_peer_id', myId);
        }

        const peer = new Peer(myId);
        peerRef.current = peer;

        peer.on('open', (id) => {
            setPeerId(id);
            if (localStorage.getItem('readlog_peer_id') !== id) {
                // If peerjs assigned a different ID (conflict?), save it
                localStorage.setItem('readlog_peer_id', id);
            }
            if (mode === 'send') {
                setStatus('Ready. Waiting for connection...');
            } else {
                setStatus('Select a device or scan QR code.');
            }
        });

        peer.on('connection', (conn) => {
            // Incoming connection (We are Host/Sender usually, but could be bidirectional later)
            // For now, if we are in 'send' mode, we send data.
            // If we are in 'receive' mode, we might be receiving data pushed to us.

            conn.on('open', async () => {
                if (mode === 'send') {
                    setStatus('Connected! Sending data...');
                    const data = await exportDB();
                    conn.send(data);
                    setStatus('Data sent!');
                    setProgress(100);
                }
            });

            conn.on('data', async (data) => {
                // If we receive data, we import it regardless of mode (Auto-sync)
                setStatus('Receiving data...');
                if (typeof data === 'string') {
                    try {
                        await importDB(data);
                        setStatus('Success! Data synced.');
                        setProgress(100);
                        setTimeout(() => window.location.reload(), 1500);
                    } catch (e) {
                        setStatus('Error importing data.');
                        console.error(e);
                    }
                }
            });
        });

        peer.on('error', (err) => {
            console.error(err);
            setStatus(`Error: ${err.type}`);
        });

        return () => {
            peer.destroy();
        };
    }, []); // Run once on mount

    const connectToHost = (hostId: string) => {
        if (!peerRef.current) return;
        setStatus(`Connecting to ${hostId}...`);

        const conn = peerRef.current.connect(hostId);

        conn.on('open', () => {
            setStatus('Connected! Waiting for data...');
            // Save to known peers
            if (!knownPeers.includes(hostId)) {
                const newPeers = [hostId, ...knownPeers].slice(0, 5); // Keep last 5
                setKnownPeers(newPeers);
                localStorage.setItem('readlog_known_peers', JSON.stringify(newPeers));
            }
        });

        conn.on('data', async (data) => {
            // ... same import logic
            setStatus('Receiving data...');
            if (typeof data === 'string') {
                try {
                    await importDB(data);
                    setStatus('Success! Data synced.');
                    setProgress(100);
                    setTimeout(() => window.location.reload(), 1500);
                } catch (e) {
                    setStatus('Error importing data.');
                    console.error(e);
                }
            }
        });

        conn.on('close', () => {
            setStatus('Connection closed.');
        });

        conn.on('error', (err) => {
            setStatus('Connection failed.');
            console.error(err);
        });
    };

    // Auto-scanner effect
    useEffect(() => {
        let scanner: Html5QrcodeScanner | null = null;
        if (mode === 'receive') {
            scanner = new Html5QrcodeScanner(
                "reader",
                { fps: 10, qrbox: { width: 250, height: 250 } },
                false
            );
            scanner.render(async (decodedText) => {
                if (decodedText && decodedText.length > 5) {
                    scanner?.clear();
                    connectToHost(decodedText);
                }
            }, (err) => console.warn(err));
        }
        return () => {
            if (scanner) {
                try { scanner.clear(); } catch (e) { }
            }
        };
    }, [mode]);

    return (
        <div className="sync-modal-overlay">
            <div className="sync-modal">
                <div className="sync-header">
                    <h2>Sync Data</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="sync-tabs">
                    <button className={`tab-btn ${mode === 'send' ? 'active' : ''}`} onClick={() => setMode('send')}>
                        My Code (Wait)
                    </button>
                    <button className={`tab-btn ${mode === 'receive' ? 'active' : ''}`} onClick={() => setMode('receive')}>
                        Connect (Scan)
                    </button>
                </div>

                <div className="sync-content">
                    <p className="status-text">{status}</p>

                    {mode === 'send' && peerId && (
                        <div className="qr-container">
                            <QRCodeCanvas value={peerId} size={180} />
                            <p className="peer-id-text">My ID: <strong>{peerId}</strong></p>
                        </div>
                    )}

                    {mode === 'receive' && (
                        <div className="receive-container">
                            {knownPeers.length > 0 && (
                                <div className="known-peers">
                                    <h4>Recent Devices</h4>
                                    {knownPeers.map(id => (
                                        <button key={id} className="peer-btn" onClick={() => connectToHost(id)}>
                                            Connect to {id}
                                        </button>
                                    ))}
                                    <div className="divider">or scan new</div>
                                </div>
                            )}
                            <div id="reader" className="scanner-container"></div>
                        </div>
                    )}

                    {progress === 100 && <div className="success-checkmark">✅</div>}
                </div>
            </div>
        </div>
    );
};
