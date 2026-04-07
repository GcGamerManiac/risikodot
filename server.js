const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// Nomi dei territori estratti dal tuo PDF (42 territori, esclusi i 2 Jolly)
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
    console.log('Utente connesso:', socket.id);

    socket.on('joinRoom', ({ room, name }) => {
        const rID = String(room);
        socket.join(rID);

        if (!rooms[rID]) {
            rooms[rID] = {
                players: {},
                territories: {},
                turnIndex: 0,
                order: [],
                phase: 'LOBBY' // Fasi: LOBBY, SETUP, PLAY
            };
        }

        rooms[rID].players[socket.id] = { 
            id: socket.id, 
            name: name, 
            ready: false 
        };
        
        rooms[rID].order = Object.keys(rooms[rID].players);
        
        // Invia lo stato aggiornato a tutti nella stanza
        io.to(rID).emit('state', rooms[rID]);
        socket.emit('init', { id: socket.id });
    });

    socket.on('startGameRequest', (room) => {
        const r = rooms[room];
        if (!r || Object.keys(r.players).length < 2) return;

        r.phase = 'SETUP';
        
        // Mischia e distribuisce i territori
        distributeTerritories(r);
        
        io.to(room).emit('state', r);
    });

    socket.on('confirmSetup', ({ room, placements }) => {
        const r = rooms[room];
        if (!r) return;

        // Applica i posizionamenti truppe inviati dal client
        for (const [tName, troops] of Object.entries(placements)) {
            if (r.territories[tName]) {
                r.territories[tName].troops = troops;
            }
        }

        r.players[socket.id].ready = true;

        // Se tutti i giocatori hanno confermato il setup, si passa al gioco vero
        const allReady = Object.values(r.players).every(p => p.ready);
        if (allReady) {
            r.phase = 'PLAY';
            r.turnIndex = 0; // Inizia il primo giocatore
        }
        
        io.to(room).emit('state', r);
    });

    socket.on('endTurn', ({ room }) => {
        const r = rooms[room];
        if (!r || r.phase !== 'PLAY') return;

        // Verifica che sia effettivamente il turno di chi chiama endTurn
        if (r.order[r.turnIndex] === socket.id) {
            r.turnIndex = (r.turnIndex + 1) % r.order.length;
            io.to(room).emit('state', r);
        }
    });

    socket.on('disconnect', () => {
        console.log('Utente disconnesso:', socket.id);
        // Logica opzionale per rimuovere il giocatore dalla stanza
    });
});

function distributeTerritories(r) {
    // Mischia la lista dei territori
    let shuffled = [...ALL_TERRITORIES].sort(() => Math.random() - 0.5);
    const playerIds = r.order;
    const numPlayers = playerIds.length;

    shuffled.forEach((tName, index) => {
        // Assegna ciclicamente ai giocatori (garantisce parti uguali o scarto di 1 scelto dal caso del shuffle)
        const ownerId = playerIds[index % numPlayers];
        r.territories[tName] = {
            owner: ownerId,
            troops: 1 // Ogni territorio parte con 1 truppa di base
        };
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server attivo sulla porta ${PORT}`);
});
