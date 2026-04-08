const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Elenco sincronizzato esattamente con l'ordine del PDF 
const ALL_TERRITORIES = [
    "CASA DI VANNY", "CICCIO MELONE", "HOTEL MIRAMONTI", "LOCALE DI ANGELO", "VILLA COMUNALE",
    "LO STRADONE", "PLANET GAMES", "TUTTO PRONTO DA GIANNI (VERDE)", "MINALOCA", "SCANZOSSA",
    "MC DONALD'S", "MALESANGUE", "PRATI", "SABATELLI MACELLERIA", "ALCHEMICO",
    "SKIPPER", "PORTO", "MORTIFICATO", "OTTAGONO", "FARO",
    "IL PUNTO TOSSICO", "TUTTO PRONTO DA GIANNI (GIALLO)", "ZANZARA", "SABBIADORO", "RODEO",
    "TERME", "LIMONAIA", "CHIESA MADRE", "LA MANNA DEL POZZO", "L'AGRUMETO",
    "LA PUPA", "EL CHIRINGUITO DA LELLO", "PRESEPE VIVENTE", "CORSO NAZIONALE", "MUNICIPIO",
    "CASA DI GIANLUCA", "CLUBHOUSE", "VIA COSTA", "BADAWÏ", "CASA DI SANTE",
    "CASA DI RIKO", "CASA DI ANGELO"
];

const OBBIETTIVI = [
    "Distruggere le armate NERE o occupare 24 territori",
    "Distruggere le armate GIALLE o occupare 24 territori",
    "Distruggere le armate BLU o occupare 24 territori",
    "Distruggere le armate ROSSE o occupare 24 territori",
    "Distruggere le armate BIANCHE o occupare 24 territori",
    "Distruggere le armate VERDI o occupare 24 territori",
    "Conquista l'asse Salamina-Pezze-Pozzo con almeno 2 pedine",
    "Conquista la costa Torre Canne-Savelletri con almeno 2 pedine",
    "Conquista 3 continenti a scelta con almeno 2 pedine",
    "Conquista Pezze e Savelletri",
    "Conquista 24 territori a scelta",
    "Occupa Salamina con 80 pedine",
    "Conquista tutte le case (5) con 10 pedine su ogni casa",
    "Conquista entrambi i territori di Tutto pronto da Gianni con 30 pedine su ogni territorio",
    "Conquista Fasano e Salamina",
    "Distruggi 2 armate a scelta"
];

const IMPREVISTI = [
    "Se hai casa di vanny, Nicola ti fotte una pedina", "Pesca una carta probabilità",
    "Se hai più armate ne perdi 2 sul territorio che ne ha di più", "Al prossimo turno non puoi usare le carte territorio",
    "Se hai la casa di Riko ne perdi 2", "Se hai casa di Gianluca me perdi 2", "Se hai casa di Sante ne perdi 2",
    "Se hai casa di Angelo ne perdi 2", "Dopo aver mangiato al MC sei andato a cagare, se hai il MC perdi 3 armate",
    "Se su un territorio hai almeno 10 armate ne perdi una", "Perdi una carta territorio",
    "Al prossimo attacco, usi un dado in meno", "Al prossimo turno devi fare almeno 2 attacchi",
    "Se hai il Planet, perdi alle slot, perdi 2 armate", "Lancia i dadi, se fai 3 numeri pari perdi 3 armate"
];

const PROBABILITA = [
    "Se hai tutti e due i territori 'Tutto pronto da Gianni' prendi 4 armate", "Prendi 10 armate", "Prendi 10 armate",
    "Se hai casa di Riko prendi 2 armate", "Se hai casa di Angelo prendi 2 armate", "Se hai casa di Sante prendi 2 armate",
    "Se hai casa di Gianluca prendi 2 armate", "Se hai il locale prendi 2 armate", "Se hai almeno un continente prendi 2 armate",
    "Se hai la zanzara hai un carico di sigaretta gratis, ricevi 3 armate", "Puoi fare un altro spostamento",
    "Fino al prossimo turno non puoi essere attaccato", "Scegli a chi rubare una carta territorio",
    "Lancia 3 dadi, se fai >= 9 prendi 1 armata, se fai 18 ne prendi 3", "Lancia i dadi, se fai 3 numeri pari prendi 3 armate"
];

let rooms = {};

io.on('connection', (socket) => {
    socket.on('joinRoom', ({ room, name, color }) => {
        const rID = String(room);
        if (!rooms[rID]) {
            rooms[rID] = { players: {}, territories: {}, turnIndex: 0, order: [], phase: 'LOBBY', conqueredThisTurn: {}, objectives: {}, reinforcements: 0 };
        }
        const colorTaken = Object.values(rooms[rID].players).some(p => p.color === color);
        if (colorTaken) return socket.emit('errorMsg', "Colore già occupato!");

        rooms[rID].players[socket.id] = { id: socket.id, name, color, ready: false };
        rooms[rID].order = Object.keys(rooms[rID].players);
        socket.join(rID);
        io.to(rID).emit('state', rooms[rID]);
        socket.emit('init', { id: socket.id });
    });

    socket.on('startGameRequest', (room) => {
        const r = rooms[room];
        if (!r) return;
        r.phase = 'SETUP';
        distributeTerritories(r);
        let shuffledObj = [...OBBIETTIVI].sort(() => Math.random() - 0.5);
        r.order.forEach((pid, idx) => {
            r.objectives[pid] = shuffledObj[idx];
            r.conqueredThisTurn[pid] = false;
        });
        io.to(room).emit('state', r);
    });

    socket.on('confirmSetup', ({ room, placements }) => {
        const r = rooms[room];
        if (!r) return;
        Object.entries(placements).forEach(([t, troops]) => {
            if (r.territories[t]) r.territories[t].troops = troops;
        });
        r.players[socket.id].ready = true;
        if (Object.values(r.players).every(p => p.ready)) {
            r.phase = 'PLAY';
            calculateReinforcements(r);
        }
        io.to(room).emit('state', r);
    });

    socket.on('endTurn', ({ room }) => {
        const r = rooms[room];
        if (!r) return;
        let type = r.conqueredThisTurn[socket.id] ? "IMPREVISTO" : "PROBABILITA";
        let pool = r.conqueredThisTurn[socket.id] ? IMPREVISTI : PROBABILITA;
        let text = pool[Math.floor(Math.random() * pool.length)];
        
        io.to(room).emit('cardDrawn', { 
            player: socket.id, 
            playerName: r.players[socket.id].name,
            type, 
            text 
        });
    });

    socket.on('confirmCardAndNextTurn', ({ room }) => {
        const r = rooms[room];
        if (!r) return;
        r.conqueredThisTurn[r.order[r.turnIndex]] = false;
        r.turnIndex = (r.turnIndex + 1) % r.order.length;
        calculateReinforcements(r);
        io.to(room).emit('state', r);
        io.to(room).emit('closeCardSwal');
    });

    socket.on('conquestEvent', (room) => {
        if(rooms[room]) rooms[room].conqueredThisTurn[socket.id] = true;
    });
});

function calculateReinforcements(r) {
    const nextPlayerId = r.order[r.turnIndex];
    const territoryCount = Object.values(r.territories).filter(t => t.owner === nextPlayerId).length;
    r.reinforcements = Math.floor(territoryCount / 3);
}

function distributeTerritories(r) {
    let shuffled = [...ALL_TERRITORIES].sort(() => Math.random() - 0.5);
    shuffled.forEach((t, i) => {
        const owner = r.order[i % r.order.length];
        r.territories[t] = { owner, troops: 1 };
    });
}

server.listen(process.env.PORT || 3000);
