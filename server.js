const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const ALL_TERRITORIES = [
    "CASA DI RIKO", "CASA DI ANGELO", "CASA DI SANTE", "BADAWÏ", "CASA DI GIANLUCA",
    "VIA COSTA", "CLUBHOUSE", "PRESEPE VIVENTE", "CORSO NAZIONALE", "MUNICIPIO",
    "LA PUPA", "L'AGRUMETO", "LA MANNA DEL POZZO", "CHIESA MADRE", "LIMONAIA",
    "RODEO", "TERME", "SABBIADORO", "LIDO VERDE", "MONT'ALBANO", "SPEZIALE",
    "TORRE CANNE", "POZZO FACETO", "SAVELLETRI", "EGNAZIA", "FORCAT Ella",
    "COCCARO", "MASSERIA TORRE COCCARO", "MASSERIA SAN DOMENICO", "PETTOLECCHIA",
    "ZOO SAFARI", "SELVA DI FASANO", "LAURETO", "CANALE DI PIRRO", "COREGGIA",
    "GORGOfreddo", "L'ASSUNTA", "CAPITOLO", "SANTO STEFANO", "MONOPOLI",
    "POLIGNANO", "CASTELLANA"
];

let rooms = {};

io.on('connection', (socket) => {
    socket.on('joinRoom', ({ room, name }) => {
        const rID = String(room);
        socket.join(rID);
        if (!rooms[rID]) {
            rooms[rID] = { players: {}, territories: {}, turnIndex: 0, order: [], phase: 'LOBBY' };
        }
        rooms[rID].players[socket.id] = { id: socket.id, name: name, ready: false };
        rooms[rID].order = Object.keys(rooms[rID].players);
        io.to(rID).emit('state', rooms[rID]);
        socket.emit('init', { id: socket.id });
    });

    socket.on('startGameRequest', (room) => {
        const r = rooms[room];
        if (!r || Object.keys(r.players).length < 2) return;
        r.phase = 'SETUP';
        distributeTerritories(r);
        io.to(room).emit('state', r);
    });

    socket.on('confirmSetup', ({ room, placements }) => {
        const r = rooms[room];
        if (!r) return;
        for (const [tName, troops] of Object.entries(placements)) {
            if (r.territories[tName]) r.territories[tName].troops = troops;
        }
        r.players[socket.id].ready = true;
        if (Object.values(r.players).every(p => p.ready)) {
            r.phase = 'PLAY';
            r.turnIndex = 0;
        }
        io.to(room).emit('state', r);
    });

    socket.on('endTurn', ({ room }) => {
        const r = rooms[room];
        if (r && r.order[r.turnIndex] === socket.id) {
            r.turnIndex = (r.turnIndex + 1) % r.order.length;
            io.to(room).emit('state', r);
        }
    });
});

function distributeTerritories(r) {
    let shuffled = [...ALL_TERRITORIES].sort(() => Math.random() - 0.5);
    shuffled.forEach((tName, index) => {
        const ownerId = r.order[index % r.order.length];
        r.territories[tName] = { owner: ownerId, troops: 1 };
    });
}

server.listen(process.env.PORT || 3000);
