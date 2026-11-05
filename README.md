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

- Enter a guest name and choose a Bullet, Blitz, Rapid, or Classical preset, or a custom time control.
- **Find an opponent** queues you against another connected player with the same starting time and increment. Random matches only Random, with colors randomly assigned. White matches only Black, and each player receives their requested color. Players with the same preference wait in arrival order.
- **Create a private room** assigns the selected or random color. Copy the invite link or share the eight-character room code. Clocks begin when both players join.
- Click a piece to reveal legal moves, then click a destination; desktop drag-and-drop also works. Promotion opens a queen/rook/bishop/knight selector.
- Flip the board, follow SAN move history, offer/accept a draw, or resign. Check, checkmate, stalemate, insufficient material, repetition, and fifty-move draws are detected.
- Before joining a room, the board is an **untimed local practice board** where you control both sides. Choose **Play bot** to play Stockfish instead. Select White or Black before starting, choose Beginner, Casual, Club, or Expert difficulty, and adjust the difficulty during the game. Bot games are untimed and run locally in the browser.
- A per-tab session token restores your seat after reconnecting or refreshing. Clocks continue while disconnected. Opening a seat in another tab transfers its connection.

## Socket contract

Client requests accept an acknowledgement `{ ok: true }` or `{ error: string }`. Mutations are throttled to one per 80ms per connection and payloads are capped at 4KB.

| Client event | Payload | Behavior |
|---|---|---|
| `create` | `{ name, minutes, increment, color: 'w' / 'b' / 'random' }` | Creates and seats host |
| `join` | `{ id, name }` | Takes remaining seat |
| `quick` | `{ name, minutes, increment, color }` | Joins matching time-control and compatible-color queue |
| `cancelQueue` | `{}` | Leaves matchmaking |
| `resume` | `{ id, token }` | Reclaims own seat with a secret token |
| `move` | `{ from, to, promotion? }` | Validates seat, turn, clock and move |
| `premove` | `{ from, to, promotion?, ply }` | Appends a premove while it is the opponent’s turn |
| `cancelPremoves` | `{}` | Clears only the requesting player’s premove queue |
| `draw` | `{}` | Offers draw or accepts opponent's offer |
| `resign` | `{}` | Ends game or closes waiting room |
| `leave` | `{}` | Leaves completed room |

Server events: `seated` sends `{ id, color, token }` privately; `state` broadcasts FEN, SAN history, last move, turn/check status, public player info, remaining clock times, result, draw offer and the receiving player’s private premove queue. `queued` confirms matchmaking; `notice` reports unsolicited errors. Tokens are never included in public state. The backend refreshes live clocks every 250ms and accounts for elapsed wall time before every move.

## Scope and rules policy

Rooms and queues are in memory. Restarting the server clears them. Disconnected rooms are cleaned up after one hour without activity. Use persistent storage and a coordinated game authority before deploying multiple server processes. Guest names are display names, not authenticated identities. Basic connection throttling is included; public internet deployments should add infrastructure-level abuse controls.

This application automatically ends a game at threefold repetition or 50 moves without a capture/pawn move; formal tournament rules can require a player claim instead. Timeout currently awards the opponent a win; the FIDE exception for positions where no legal sequence can produce mate is not implemented. Accordingly, it is a casual chess application, not a tournament adjudication system. Bot play, accounts, ratings, and spectators are outside this implementation.

Styling uses plain CSS rather than Tailwind, with no CSS build framework required. Chess symbols use system fonts; Google Fonts enhances headings and body text with system fallbacks when offline.

Engine reference: https://github.com/jhlywa/chess.js
Realtime room reference: https://socket.io/docs/v4/rooms/

## Sound effects

Downloaded CC0 recordings play for legal moves and captures in local and multiplayer games. Check uses two taps; game end uses three. The speaker button in the header mutes all game audio and remembers the preference. Audio unlocks after a pointer or keyboard interaction, as required by browsers. Reconnects, initial positions, and clock updates do not replay moves. Files are served locally from `public/sounds/`; no third-party audio requests occur during play. See [sound credits](public/sounds/CREDITS.md) for original creators, source links, and licenses.
# CARL0CH3SS


## Expanded time controls

| Category | Presets (minutes + increment seconds) |
| --- | --- |
| Bullet | 1+0, 1+1, 2+1 |
| Blitz | 3+0, 3+2, 5+0, 5+5 |
| Rapid | 10+0, 10+5, 15+10, 30+0 |
| Classical | 60+0, 60+30, 90+30 |

Custom games allow 0.5–180 starting minutes in half-minute steps and 0–60 whole seconds of increment. For example, 3+2 gives each player three minutes, adding two seconds to their clock after each legal move. Increment is never awarded after a flag has fallen. The server validates both settings and matches only identical controls, including custom controls. Missing settings default to 5+0 for older clients; invalid values are rejected.

The app labels categories using starting time plus 40 increments: under 3 minutes is Bullet, under 10 Blitz, under 60 Rapid, and otherwise Classical. These are app labels rather than tournament rule classifications. Local practice remains untimed. Active long games are retained until completion even when both players are disconnected.


## Multiple premoves and clock precision

During an online opponent’s turn, click or drag your pieces to plan up to 20 successive premoves. The board previews your planned positions, highlights their squares, and lists the sequence beneath the board. Choose a promotion piece when planning a pawn promotion. Click **Clear premoves** or right-click the board to cancel the entire queue.

The server stores the queue privately and executes its next move immediately after the opponent moves, only if chess.js confirms it is legal. Each executed premove deducts exactly **100ms (0.1 seconds)** before the normal increment is awarded. With 100ms or less left, the player flags before the move executes; increment cannot rescue them. An illegal premove clears the remaining sequence without a premove charge. Game end and disconnection also clear the affected queues. Normal moves still consume elapsed server time, and the client cannot mark a normal move as a premove to bypass the clock.

Planning permits piece-shaped moves through currently blocked paths, since the future position is unknown. Execution always uses full legal validation, including checks, castling, and en passant. Local practice does not queue premoves because one person controls both sides.

Clocks display `m:ss` at 20 seconds or above and `0:ss.s` below 20 seconds. The browser interpolates the active clock every 50ms between server snapshots; the server remains authoritative for flagging and game outcomes.

## Reviewing previous moves

Use the buttons beneath the board to go to the starting position, step backward/forward one ply (one player's move), or return to **Live board / Latest**. Click any White or Black move in the history to see the position immediately after that move. The selected notation, last-move squares, side to move, and check highlight follow the reviewed position. This also works in local practice and after game end.

Review is read-only: moving pieces and adding premoves are disabled until you return to the latest position. Online clocks, incoming moves, and previously queued premoves continue normally. New moves do not change the historical position you are inspecting. The displayed clocks always represent the live game, not historical clock times. Starting a new game or resetting practice returns to the latest board.

## Game review

After a completed game, choose **Analyze game**, then **Review game**. You can also import a PGN in Analysis and review it. The browser analyzes each position with the bundled Stockfish worker, showing progress and allowing cancellation. The finished review adds move labels, separate classification counts for White and Black, a clickable evaluation graph, a position slider, and a suggested alternative for each move. Reviews are cached in this browser by PGN and engine settings, so reopening the same game does not require another full search. **Run review again** refreshes the result.

The review uses depth 16 and up to 2.5 seconds per nonterminal position. Classification symbols appear on the moved piece, and inaccuracies, mistakes, and blunders are marked on the evaluation graph. Feedback names the played move and the engine's stronger alternative. Its expected-score and move labels are estimates based on engine evaluations; they are not Chess.com classifications. Longer games can take several minutes. The existing engine panel remains available for deeper analysis of a selected position or variation.
