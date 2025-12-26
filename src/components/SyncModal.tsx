import React, { useState, useEffect, useRef } from 'react';
import Peer, { DataConnection } from 'peerjs';
import { QRCodeCanvas } from 'qrcode.react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { exportDB, importDB } from '../db';
import { useLanguage } from '../contexts/LanguageContext';
import './SyncModal.css';

interface SyncModalProps {
    onClose: () => void;
}

type SyncStatus = 'idle' | 'initializing' | 'waiting' | 'connecting' | 'exchanging' | 'success' | 'error';

export const SyncModal: React.FC<SyncModalProps> = ({ onClose }) => {
    const { t } = useLanguage();
    const [mode, setMode] = useState<'host' | 'join'>('host');
    const [status, setStatus] = useState<SyncStatus>('idle');
    const [statusMsg, setStatusMsg] = useState('');
    const [peerId, setPeerId] = useState('');
    const [targetId, setTargetId] = useState('');
    const [syncStats, setSyncStats] = useState<{ books: number, logs: number } | null>(null);
    const [knownPeers, setKnownPeers] = useState<string[]>([]);

    const peerRef = useRef<Peer | null>(null);
    const connRef = useRef<DataConnection | null>(null);

    useEffect(() => {
        const saved = localStorage.getItem('readlog_known_peers');
        if (saved) setKnownPeers(JSON.parse(saved));

        return () => {
            peerRef.current?.destroy();
        };
    }, []);

    const startPeer = (id?: string) => {
        setStatus('initializing');
        setStatusMsg('Waking up sync signal...');

        if (peerRef.current) peerRef.current.destroy();

        const myId = id || localStorage.getItem('readlog_peer_id') || Math.random().toString(36).substring(2, 10);
        const peer = new Peer(myId);
        peerRef.current = peer;

        peer.on('open', (id) => {
            setPeerId(id);
            localStorage.setItem('readlog_peer_id', id);
            setStatus('waiting');
            setStatusMsg(id ? `Ready! Room ID: ${id}` : 'Signal ready.');
        });

        peer.on('connection', (conn) => {
            handleConnection(conn);
        });

        peer.on('error', (err) => {
            setStatus('error');
            setStatusMsg(`Signal Error: ${err.type}`);
        });
    };

    const handleConnection = (conn: DataConnection) => {
        connRef.current = conn;
        setStatus('exchanging');
        setStatusMsg('Connected! Merging data...');

        conn.on('open', async () => {
            // Send our data first
            const localData = await exportDB();
            conn.send({ type: 'SYNC_DATA', payload: localData });
        });

        conn.on('data', async (data: any) => {
            if (data?.type === 'SYNC_DATA') {
                try {
                    const stats = await importDB(data.payload);
                    setSyncStats({ books: stats.booksImported, logs: stats.logsImported });
                    setStatus('success');
                    setStatusMsg('Sync successful!');

                    // Add to known peers
                    const peerId = conn.peer;
                    if (peerId && !knownPeers.includes(peerId)) {
                        const updated = [peerId, ...knownPeers].slice(0, 5);
                        setKnownPeers(updated);
                        localStorage.setItem('readlog_known_peers', JSON.stringify(updated));
                    }
                } catch (e) {
                    setStatus('error');
                    setStatusMsg('Failed to process received data.');
                }
            }
        });

        conn.on('close', () => {
            if (status !== 'success') {
                setStatus('error');
                setStatusMsg('Connection lost.');
            }
        });
    };

    const connectToPeer = (id: string) => {
        if (!id) return;
        if (!peerRef.current) {
            startPeer();
            // We need to wait for peer to be open... 
            // Better to let startPeer handle it or just require a button click
        }

        setStatus('connecting');
        setStatusMsg(`Searching for ${id}...`);

        const timer = setTimeout(() => {
            if (peerRef.current) {
                const conn = peerRef.current.connect(id);
                handleConnection(conn);
            }
        }, 500); // Small delay to let peer init if needed

        return () => clearTimeout(timer);
    };

    const copyId = () => {
        navigator.clipboard.writeText(peerId);
        setStatusMsg('ID copied to clipboard!');
        setTimeout(() => setStatusMsg(`Room ID: ${peerId}`), 2000);
    };

    // Scanner Effect
    useEffect(() => {
        let scanner: Html5QrcodeScanner | null = null;
        if (mode === 'join' && status === 'idle') {
            scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 }, false);
            scanner.render((text) => {
                scanner?.clear();
                connectToPeer(text);
            }, () => { });
        }
        return () => { scanner?.clear(); };
    }, [mode, status]);

    return (
        <div className="sync-modal-overlay">
            <div className={`sync-modal status-${status}`}>
                <div className="sync-header">
                    <h2>{t('sync_devices')}</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="sync-tabs">
                    <button className={`tab-btn ${mode === 'host' ? 'active' : ''}`} onClick={() => setMode('host')}>
                        📤 Host Data
                    </button>
                    <button className={`tab-btn ${mode === 'join' ? 'active' : ''}`} onClick={() => setMode('join')}>
                        📥 Join Room
                    </button>
                </div>

                <div className="sync-body">
                    <div className={`status-indicator status-${status}`}>
                        <span className="dot"></span>
                        <p>{statusMsg || t('sync_data_desc') || 'Ready to sync'}</p>
                    </div>

                    {status === 'idle' && (
                        <div className="mode-selection">
                            {mode === 'host' ? (
                                <div className="host-start">
                                    <p className="hint">Generate a QR code so another device can connect to you.</p>
                                    <button className="premium-btn" onClick={() => startPeer()}>
                                        Generate Sync Code
                                    </button>
                                </div>
                            ) : (
                                <div className="join-start">
                                    <div className="manual-join">
                                        <input
                                            type="text"
                                            placeholder="Enter Room ID"
                                            value={targetId}
                                            onChange={e => setTargetId(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && connectToPeer(targetId)}
                                        />
                                        <button className="join-btn" onClick={() => connectToPeer(targetId)}>Join</button>
                                    </div>
                                    <div className="scanner-wrapper">
                                        <div id="reader"></div>
                                    </div>
                                    {knownPeers.length > 0 && (
                                        <div className="recent-list">
                                            <p className="hint">Recent Devices</p>
                                            {knownPeers.map(id => (
                                                <button key={id} onClick={() => connectToPeer(id)}>📱 {id}</button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {status === 'waiting' && (
                        <div className="qr-box animate-in">
                            <QRCodeCanvas value={peerId} size={200} includeMargin={true} />
                            <div className="id-badge" onClick={copyId}>
                                <code>{peerId}</code>
                                <span className="copy-icon">📋</span>
                            </div>
                            <p className="hint">Scan this with your other device</p>
                        </div>
                    )}

                    {(status === 'connecting' || status === 'exchanging' || status === 'initializing') && (
                        <div className="sync-loader">
                            <div className="spinner"></div>
                            <p className="pulsing">Exchanging data packets...</p>
                        </div>
                    )}

                    {status === 'success' && (
                        <div className="success-view animate-in">
                            <div className="big-check">✅</div>
                            <h3>Sync Complete!</h3>
                            {syncStats && (
                                <div className="stats-summary">
                                    <div className="stat-item">
                                        <span className="val">{syncStats.books}</span>
                                        <span className="lab">New Books</span>
                                    </div>
                                    <div className="stat-item">
                                        <span className="val">{syncStats.logs}</span>
                                        <span className="lab">New Logs</span>
                                    </div>
                                </div>
                            )}
                            <button className="premium-btn" onClick={() => window.location.reload()}>
                                Reload App
                            </button>
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="error-view animate-in">
                            <div className="big-x">❌</div>
                            <h3>Something went wrong</h3>
                            <p className="hint">{statusMsg}</p>
                            <button className="secondary-btn" onClick={() => setStatus('idle')}>Try Again</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
