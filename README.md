# ReadLog

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**ReadLog** is a lightweight, private, and local-only book reading progress tracker. It helps you stay focused on your reading goals without worrying about your data being shared or stored on any external servers.

Everything you record—your books, your reading sessions, and your progress—is stored directly in your browser's local database (IndexedDB).

## ✨ Features

- **📚 Essential Reading Tracking**: Easily add books and track your progress by recording the pages you've read in each session.
- **📊 Progress Visualization**: 
  - Visual charts showing both **Daily Progress** and **Cumulative Progress**.
  - Automatic calculation of completion percentage and remaining pages.
- **🔄 Private Device Sync**: Synchronize your data between multiple devices (e.g., PC and Mobile). 
  - **End-to-End Encrypted**: Data is encrypted using AES-GCM before leaving your device.
  - **Relay Signaling**: Seamless connection using Room IDs or QR Codes (no account required).
  - **Automatic Bidirectional Sync**: One device scans and both devices stay updated.
- **📂 Data Management**:
  - Export your entire library or specific books to a JSON file for backup.
  - Import data from backups to restore your history.
  - Factory reset option to wipe all local data when needed.
- **🌓 Modern UI/UX**:
  - **Dark/Light Mode** support.
  - **Customizable Font Size** for better readability.
  - **Responsive Design** with a resizable sidebar and mobile-optimized views.
- **📱 PWA (Progressive Web App)**: Install ReadLog as an app on your device for quick access and offline use.
- **🌐 Multi-language Support**: Fully localized in **English** and **Korean**.

## 🛠️ Tech Stack

- **Framework**: React 19 + TypeScript + Vite
- **Database**: Dexie.js (IndexedDB wrapper)
- **Synchronization**: AES-GCM Encryption + Relay Signaling (via ntfy & tmpfiles)
- **Visuals**: Recharts (Progress charts), QR Code (Easy sync)
- **Icons**: Emoji-based and CSS-styled icons
- **Styling**: Vanilla CSS with modern features (CSS Variables, Flexbox/Grid)

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (Latest LTS recommended)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/ReadLog.git
   cd ReadLog
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Build for production:
   ```bash
   npm run build
   ```

## 🔒 Privacy

ReadLog is designed with privacy as the top priority:
- **No Cloud Storage**: Your data never leaves your device unless you explicitly use the Sync feature.
- **Local Database**: All records are stored in your browser's IndexedDB via Dexie.js.
- **Serverless Sync**: Synchronization happens directly between devices via PeerJS; even during sync, your data is not stored on any intermediate server.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

*Read more, track better.*
