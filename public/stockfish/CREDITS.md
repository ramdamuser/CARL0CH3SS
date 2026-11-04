# Stockfish.js 19.0.1

Unmodified lite, single-threaded WebAssembly release from Nathan Rugg / Chess.com:
https://github.com/nmrugg/stockfish.js/releases/tag/v19.0.1

- stockfish-19-lite-single.js
- stockfish-19-lite-single.wasm

Copyright 2026 Chess.com, LLC; based on Stockfish by Tord Romstad, Marco Costalba,
Joona Kiiski, Gary Linscott, and contributors. Lite neural network by Chris Bao
(sscg13), nn-61e7af4bb97d.nnue, embedded in the WASM build.

License: GNU GPL version 3. Full license: COPYING.txt.
Corresponding upstream source and build scripts are provided alongside the engine:
stockfish.js-v19.0.1-source.tar.gz

Source archive:
https://github.com/nmrugg/stockfish.js/archive/refs/tags/v19.0.1.tar.gz
The upstream build.js / scripts/net.sh describe the build and fetch the exact net:
https://tests.stockfishchess.org/api/nn/nn-61e7af4bb97d.nnue

Build: Emscripten 6.0.9, `node build.js --single-threaded --lite -f`.
The source archive contains upstream build instructions. These are bundled third-party
engine assets, not generated application code. Retain the license, attribution, and
access to corresponding source when redistributing. Engine binaries are served locally;
no third-party engine requests occur during analysis.
