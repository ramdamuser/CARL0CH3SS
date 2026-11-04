# CARL0CH3SS

A complete React/Vite + Express/Socket.io chess application. The server validates every multiplayer move with chess.js and owns the clocks. The responsive ivory-and-sage interface supports a dark theme, click or drag moves, and keyboard-accessible square buttons.

## Run locally

Requires Node.js 20.19+ (Node 22 LTS recommended) and npm.

```sh
npm install
npm run dev
```

Open **http://localhost:5173**. Vite proxies Socket.io and `/api` to the backend at port 3001. To play against yourself for verification, open a second browser tab, create a private room in the first, and join its code in the second. For two devices on your network, open the computer's LAN address on port 5173 on both devices, with the firewall allowing access.

```sh
npm test       # engine tests and real Socket.io client integration tests
npm run build # production frontend bundle
npm start     # serves the frontend and Socket.io at http://localhost:3001
```

In production, serve a single Node process behind an HTTPS reverse proxy supporting WebSocket upgrades. Set `CLIENT_ORIGIN` to your public browser origin and optionally `PORT` (default 3001). `.env.example` documents these; environment files are not automatically loaded. Either export variables or run `node --env-file=.env server/index.js` on supported Node versions.

## Project structure

```text
carl0ch3ss/
├── .env.example           # Backend environment settings
├── .gitignore
├── index.html             # Vite HTML entry
├── package.json           # Dependencies and commands
├── package-lock.json      # Reproducible install
├── vite.config.js         # React plugin and same-origin dev proxy
├── src/
│   ├── main.jsx           # React entry point
│   ├── App.jsx            # Complete lobby, board, dialogs, and socket client
│   └── styles.css         # Responsive styling and light/dark themes
├── server/
│   ├── index.js           # HTTP server, room lifecycle, queue, socket handlers
│   └── game.js            # Authoritative engine, clocks, results, snapshots
└── test/
    ├── game.test.js       # Rules, clocks, checkmate, repetition, special moves
    └── socket.test.js     # Rooms, synchronization, rejoin, draw, matchmaking
```

## Playing

- Enter a guest name and choose 3-, 5-, or 10-minute time control.
- **Find an opponent** queues you against another connected player with the same time control. Colors are randomly assigned when a match is found.
- **Create a private room** assigns the selected or random color. Copy the invite link or share the eight-character room code. Clocks begin when both players join.
- Click a piece to reveal legal moves, then click a destination; desktop drag-and-drop also works. Promotion opens a queen/rook/bishop/knight selector.
- Flip the board, follow SAN move history, offer/accept a draw, or resign. Check, checkmate, stalemate, insufficient material, repetition, and fifty-move draws are detected.
- Before joining a room, the board is an **untimed local practice board**: control both sides. This is not a computer opponent.
- A per-tab session token restores your seat after reconnecting or refreshing. Clocks continue while disconnected. Opening a seat in another tab transfers its connection.

## Socket contract

Client requests accept an acknowledgement `{ ok: true }` or `{ error: string }`. Mutations are throttled to one per 80ms per connection and payloads are capped at 4KB.

| Client event | Payload | Behavior |
|---|---|---|
| `create` | `{ name, minutes, color: 'w' / 'b' / 'random' }` | Creates and seats host |
| `join` | `{ id, name }` | Takes remaining seat |
| `quick` | `{ name, minutes }` | Joins matching time-control queue |
| `cancelQueue` | `{}` | Leaves matchmaking |
| `resume` | `{ id, token }` | Reclaims own seat with a secret token |
| `move` | `{ from, to, promotion? }` | Validates seat, turn, clock and move |
| `draw` | `{}` | Offers draw or accepts opponent's offer |
| `resign` | `{}` | Ends game or closes waiting room |
| `leave` | `{}` | Leaves completed room |

Server events: `seated` sends `{ id, color, token }` privately; `state` broadcasts FEN, SAN history, last move, turn/check status, public player info, remaining clock times, result and draw offer. `queued` confirms matchmaking; `notice` reports unsolicited errors. Tokens are never included in public state. The backend refreshes live clocks every 250ms and accounts for elapsed wall time before every move.

## Scope and rules policy

Rooms and queues are in memory. Restarting the server clears them. Disconnected rooms are cleaned up after one hour without activity. Use persistent storage and a coordinated game authority before deploying multiple server processes. Guest names are display names, not authenticated identities. Basic connection throttling is included; public internet deployments should add infrastructure-level abuse controls.

This application automatically ends a game at threefold repetition or 50 moves without a capture/pawn move; formal tournament rules can require a player claim instead. Timeout currently awards the opponent a win; the FIDE exception for positions where no legal sequence can produce mate is not implemented. Accordingly, it is a casual chess application, not a tournament adjudication system. Bot play, accounts, ratings, and spectators are outside this implementation.

Styling uses plain CSS rather than Tailwind, with no CSS build framework required. Chess symbols use system fonts; Google Fonts enhances headings and body text with system fallbacks when offline.

Engine reference: https://github.com/jhlywa/chess.js
Realtime room reference: https://socket.io/docs/v4/rooms/

## Sound effects

Downloaded CC0 recordings play for legal moves and captures in local and multiplayer games. Check uses two taps; game end uses three. The speaker button in the header mutes all game audio and remembers the preference. Audio unlocks after a pointer or keyboard interaction, as required by browsers. Reconnects, initial positions, and clock updates do not replay moves. Files are served locally from `public/sounds/`; no third-party audio requests occur during play. See [sound credits](public/sounds/CREDITS.md) for original creators, source links, and licenses.
# CARL0CH3SS
