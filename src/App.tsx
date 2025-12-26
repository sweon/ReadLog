import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { BookDetail } from './components/BookDetail';
import './App.css';

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [fontSize, setFontSize] = useState<number>(16);
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    return Number(localStorage.getItem('sidebarWidth')) || 300;
  });
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    // Check system preference or saved theme
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const items = savedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(items);
    document.documentElement.setAttribute('data-theme', items);

    // Initial Font Size
    const savedFontSize = Number(localStorage.getItem('fontSize')) || 16;
    setFontSize(savedFontSize);
    document.documentElement.style.fontSize = `${savedFontSize}px`;
  }, []);

  const startResizing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsResizing(true);
    e.preventDefault();
  };

  const stopResizing = () => {
    setIsResizing(false);
  };

  const resize = (e: MouseEvent | TouchEvent) => {
    if (!isResizing) return;

    let clientX: number;
    if (e instanceof MouseEvent) {
      clientX = e.clientX;
    } else {
      clientX = e.touches[0].clientX;
    }

    // Min width based on header actions (ensure all icons are visible)
    const newWidth = Math.max(260, Math.min(600, clientX));
    setSidebarWidth(newWidth);
    localStorage.setItem('sidebarWidth', newWidth.toString());
  };

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
      window.addEventListener('touchmove', resize);
      window.addEventListener('touchend', stopResizing);
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      window.removeEventListener('touchmove', resize);
      window.removeEventListener('touchend', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      window.removeEventListener('touchmove', resize);
      window.removeEventListener('touchend', stopResizing);
    };
  }, [isResizing]);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  const handleFontSizeChange = (delta: number) => {
    setFontSize(prev => {
      const next = Math.max(10, Math.min(24, prev + delta));
      localStorage.setItem('fontSize', next.toString());
      document.documentElement.style.fontSize = `${next}px`;
      return next;
    });
  };

  return (
    <div className={`app-container ${isResizing ? 'resizing' : ''}`}>
      <div className="sidebar-wrapper" style={{ width: sidebarWidth }}>
        <Sidebar
          onSelectBook={setSelectedBookId}
          selectedBookId={selectedBookId}
          theme={theme}
          toggleTheme={toggleTheme}
          fontSize={fontSize}
          onFontSizeChange={handleFontSizeChange}
        />
        <div
          className="sidebar-resizer"
          onMouseDown={startResizing}
          onTouchStart={startResizing}
        />
      </div>

      <main className="main-content">
        <header className="top-bar">
          {/* Theme toggle moved to Sidebar */}
        </header>

        {selectedBookId ? (
          <BookDetail bookId={selectedBookId} onDelete={() => setSelectedBookId(null)} />
        ) : (
          <div className="empty-state-main">
            <h1>Select a book to view progress</h1>
            <p>Or create a new one to get started.</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
