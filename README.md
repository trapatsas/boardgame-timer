# Board Game Timer PWA

A Progressive Web App (PWA) that provides a simple, multi-player timer for board game sessions. Keep track of turn times, total game duration, player statistics, and resume sessions across devices.

## Features

* **Turn Timer Modes**: Count down from a set limit or count up for unlimited turns.
* **Multiple Players**: Add, remove, rename, reorder (drag & drop), and shuffle player order.
* **Session Persistence**: Automatic saving of game state and event log to `localStorage`, allowing session restore after reload or tab switch.
* **Responsive UI**: Optimized desktop and mobile experiences, including a sticky mobile turn display.
* **Notifications**: Desktop notifications when a turn timer expires.
* **PWA-Ready**: Offline support via Service Worker, installable manifest, and app-like look & feel.
* **Statistics**: Track total time spent and number of turns per player, as well as total games played and rounds completed.

## Getting Started

### Prerequisites

* Node.js v14+ (for local development)
* A modern browser with PWA support (Chrome, Firefox, Edge, Safari)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/board-game-timer.git
   cd board-game-timer
   ```

2. **Install dependencies** (if using a bundler/toolchain)

   ```bash
   npm install
   ```

3. **Run a local dev server**

   ```bash
   npm start
   ```

   This will serve the app at `http://localhost:3000` (or your configured port).

### Building for Production

```bash
npm run build
```

The production-ready files will be output to the `dist/` directory (or configured build folder). Upload these to your static hosting provider.

## Usage

1. **Add Players**: Click **Add Player** to add new participants (minimum 2 required).
2. **Set Turn Timer**: Enter minutes in the **Turn Timer** field. Leave at `0` for count-up.
3. **Start Game**: Click **Start Game** to begin the session. Use **Pause** and **Reset Game** as needed.
4. **Next Player**: During play, click **Next Player** (or the sticky mobile button) to switch turns.
5. **Shuffle Order**: Randomize player order (resets current game).
6. **View Stats**: See per-player total time and turns taken, plus session info at the bottom.

## Configuration

* **`manifest.json`**: Defines app name, icons, theme color, and display mode.
* **`sw.js`**: Service Worker script for asset caching and offline support.
* **`src/app.js`**: Main application logic, including timer, persistence, and event logging.

## Folder Structure

```
├── public/
│   ├── favicon.ico
│   ├── icons/
│   ├── manifest.json
│   └── sw.js
├── src/
│   └── app.js
├── style.css
├── index.html
└── README.md
```

## Contributing

Contributions are welcome! Please fork the repo and submit a pull request. Ensure you:

* Follow existing code style and patterns.
* Add or update tests (if applicable).
* Update documentation when adding features.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

© 2025 Board Game Timer
