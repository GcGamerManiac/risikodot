const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// FIX CORS: Permette a GitHub Pages di comunicare con Render
const io = new Server(server, {
    cors: {
        origin: ["https://gcgamermaniac.github.io", "http://127.0.0.1:5500"],
        methods: ["GET", "POST"]
    }
});

app.use(express.static(__dirname));

let rooms = {};

function createTerritories() {
    let t = {};
    for (let i = 1; i <= 42; i++) {
        t["t" + i] = { owner: null, troops: 1 };
    }
    return t;
}

io.on('connection', (socket) => {
    socket.emit('init', { id: socket.id });

    socket.on('joinRoom', ({ room, name }) => {
        const rID = String(room);
        socket.join(rID);

        if (!rooms[rID]) {
            rooms[rID] = {
                players: {},
                territories: createTerritories(),
                turn: 0,
                order: [],
                initialRolls: {}, // Per gestire chi inizia
                gameStarted: false
            };
        }

        rooms[rID].players[socket.id] = { id: socket.id, name: name };
        rooms[rID].order = Object.keys(rooms[rID].players);

        // Notifica tutti nella stanza
        io.to(rID).emit('state', rooms[rID]);
        console.log(`${name} unito a stanza ${rID}`);
    });

    // LOGICA LANCIO DADI INIZIALE
    socket.on('initialRoll', ({ room, roll }) => {
        const r = rooms[room];
        if (!r) return;

        r.initialRolls[socket.id] = roll;

        const numRolls = Object.keys(r.initialRolls).length;
        const numPlayers = Object.keys(r.players).length;

        // Se tutti hanno tirato
        if (numRolls === numPlayers && numPlayers >= 2) {
            let maxRoll = -1;
            let winners = [];

            for (const [id, val] of Object.entries(r.initialRolls)) {
                if (val > maxRoll) {
                    maxRoll = val;
                    winners = [id];
                } else if (val === maxRoll) {
                    winners.push(id);
                }
            }

            if (winners.length === 1) {
                // Vincitore unico
                const winnerId = winners[0];
                r.order = Object.keys(r.players);
                // Sposta il vincitore all'inizio dell'ordine
                r.order = [winnerId, ...r.order.filter(id => id !== winnerId)];
                r.gameStarted = true;
                assignTerritories(room);
                
                io.to(room).emit('initialRollResult', { 
                    tie: false, 
                    winnerName: r.players[winnerId].name, 
                    roll: maxRoll 
                });
                updateRoom(room);
            } else {
                // Pareggio tra i più alti
                r.initialRolls = {}; // Resetta per ricalciare
                io.to(room).emit('initialRollResult', { tie: true });
            }
        }
    });

    socket.on('attack', ({ room, from, to }) => {
        const r = rooms[room];
        if (!r || !r.gameStarted) return;
        const attacker = r.territories[from];
        const defender = r.territories[to];

        if (!attacker || !defender || attacker.owner !== socket.id || attacker.troops < 2) return;

        const aDice = Math.min(3, attacker.troops - 1);
        const dDice = Math.min(2, defender.troops);
        let a = [], d = [];
        for (let i = 0; i < aDice; i++) a.push(Math.ceil(Math.random() * 6));
        for (let i = 0; i < dDice; i++) d.push(Math.ceil(Math.random() * 6));
        a.sort((x, y) => y - x);
        d.sort((x, y) => y - x);

        for (let i = 0; i < Math.min(a.length, d.length); i++) {
            if (a[i] > d[i]) defender.troops--; else attacker.troops--;
        }

        if (defender.troops <= 0) {
            defender.owner = socket.id;
            defender.troops = aDice;
            attacker.troops -= aDice;
        }
        io.to(room).emit('dice', { a, d });
        updateRoom(room);
    });

    socket.on('endTurn', ({ room }) => {
        const r = rooms[room];
        if (!r) return;
        r.turn = (r.turn + 1) % r.order.length;
        giveReinforcements(room);
        updateRoom(room);
    });
});

function assignTerritories(room) {
    const r = rooms[room];
    const players = r.order;
    let i = 0;
    for (let t in r.territories) {
        let p = players[i % players.length];
        r.territories[t].owner = p;
        r.territories[t].troops = 1;
        i++;
    }
}

function giveReinforcements(room) {
    const r = rooms[room];
    const currentPlayer = r.order[r.turn];
    let owned = Object.values(r.territories).filter(t => t.owner === currentPlayer).length;
    let reinforcements = Math.max(3, Math.floor(owned / 3));
    let myTers = Object.keys(r.territories).filter(t => r.territories[t].owner === currentPlayer);
    for (let i = 0; i < reinforcements; i++) {
        r.territories[myTers[Math.floor(Math.random() * myTers.length)]].troops++;
    }
}

function updateRoom(room) {
    const r = rooms[room];
    if (!r) return;
    const current = r.order[r.turn];
    r.turnName = current ? r.players[current].name : "";
    io.to(room).emit('state', r);
}

server.listen(process.env.PORT || 3000, () => console.log("Server pronto."));
