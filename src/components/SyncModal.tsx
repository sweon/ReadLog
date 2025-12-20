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
    const [status, setStatus] = useState('Sync data with another device.');
    const [peerId, setPeerId] = useState('');
    const [progress, setProgress] = useState(0);
    const [knownPeers, setKnownPeers] = useState<string[]>([]);
    const [customRoomId, setCustomRoomId] = useState('');
    const [targetRoomId, setTargetRoomId] = useState('');
    const peerRef = useRef<Peer | null>(null);

    const initPeer = (id?: string) => {
        if (peerRef.current) {
            peerRef.current.destroy();
        }

        let myId = id;
        if (!myId) {
            myId = localStorage.getItem('readlog_peer_id') || crypto.randomUUID().substring(0, 8);
        }

        const peer = new Peer(myId);
        peerRef.current = peer;

        peer.on('open', (newId) => {
            setPeerId(newId);
            if (!id) {
                localStorage.setItem('readlog_peer_id', newId);
            }
            if (mode === 'send') {
                setStatus(id ? `Room "${id}" created!` : 'Ready. Waiting for connection...');
            }
        });

        peer.on('connection', (conn) => {
            conn.on('open', async () => {
                if (mode === 'send') {
                    setStatus('Connected! Exchanging data...');
                    const data = await exportDB();
                    conn.send(data);
                    setStatus('Data sent to guest.');
                    setProgress(50);
                }
            });
            conn.on('data', async (data) => {
                setStatus('Receiving data from guest...');
                if (typeof data === 'string') {
                    try {
                        await importDB(data);
                        setStatus('Sync complete! Refreshing...');
                        setProgress(100);
                        setTimeout(() => window.location.reload(), 1500);
                    } catch (e) { console.error(e); }
                }
            });
        });

        peer.on('error', (err) => {
            console.error(err);
            setStatus(`Error: ${err.type}`);
            if (err.type === 'unavailable-id') {
                setStatus(`Room "${myId}" is already taken.`);
            }
        });
    };

    useEffect(() => {
        // Load known peers
        const savedPeers = localStorage.getItem('readlog_known_peers');
        if (savedPeers) {
            setKnownPeers(JSON.parse(savedPeers));
        }

        // Initial setup - don't auto-start peer
        // initPeer();

        return () => {
            peerRef.current?.destroy();
        };
    }, []);

    const connectToHost = (hostId: string) => {
        if (!hostId) return;
        if (!peerRef.current) {
            initPeer();
            // Logic continues after re-init, but initPeer is async in effect (listeners). 
            // However, peerRef.current IS set synchronously in initPeer.
        }

        // Safety check again for TS
        if (!peerRef.current) return;

        setStatus(`Connecting to ${hostId}...`);

        const conn = peerRef.current.connect(hostId);

        conn.on('open', async () => {
            setStatus('Connected! Exchanging data...');

            // Bidirectional: Send my data to the host
            const data = await exportDB();
            conn.send(data);

            if (!knownPeers.includes(hostId)) {
                const newPeers = [hostId, ...knownPeers].slice(0, 5);
                setKnownPeers(newPeers);
                localStorage.setItem('readlog_known_peers', JSON.stringify(newPeers));
            }
        });

        conn.on('data', async (data) => {
            setStatus('Receiving data...');
            if (typeof data === 'string') {
                try {
                    await importDB(data);
                    setStatus('Sync complete! Refreshing...');
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

                    {mode === 'send' && (
                        <div className="host-container">
                            {!peerId ? (
                                <div className="start-host-prompt">
                                    <p className="sub-label">To share your data, start hosting to generate a QR code.</p>
                                    <button className="action-btn start-sync-btn" onClick={() => initPeer()}>
                                        Start Hosting & Show QR
                                    </button>
                                </div>
                            ) : (
                                <div className="qr-container">
                                    <QRCodeCanvas value={peerId} size={160} />
                                    <p className="peer-id-text">Room ID: <strong>{peerId}</strong></p>
                                </div>
                            )}
                            <div className="manual-input-group">
                                <p className="sub-label">Or set a custom Room ID:</p>
                                <div className="input-row">
                                    <input
                                        type="text"
                                        placeholder="e.g. my-room"
                                        value={customRoomId}
                                        onChange={(e) => setCustomRoomId(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && initPeer(customRoomId)}
                                    />
                                    <button onClick={() => initPeer(customRoomId)}>Set</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {mode === 'receive' && (
                        <div className="receive-container">
                            <div className="manual-input-group join-group">
                                <div className="input-row">
                                    <input
                                        type="text"
                                        placeholder="Enter Room ID"
                                        value={targetRoomId}
                                        onChange={(e) => setTargetRoomId(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && connectToHost(targetRoomId)}
                                    />
                                    <button onClick={() => connectToHost(targetRoomId)}>Join</button>
                                </div>
                            </div>

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
