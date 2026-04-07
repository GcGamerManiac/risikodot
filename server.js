const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// serve i file dalla cartella public
app.use(express.static(__dirname));

// =======================
// DATI GIOCO
// =======================
let rooms = {};

// crea territori base (t1 → t42)
function createTerritories() {
  let t = {};
  for (let i = 1; i <= 42; i++) {
    t["t" + i] = {
      owner: null,
      troops: 1
    };
  }
  return t;
}

// =======================
// SOCKET.IO
// =======================
io.on('connection', (socket) => {

  // manda ID al client
  socket.emit('init', { id: socket.id });

  // JOIN ROOM
  socket.on('joinRoom', ({ room, name }) => {
    socket.join(room);

    if (!rooms[room]) {
      rooms[room] = {
        players: {},
        territories: createTerritories(),
        turn: 0,
        order: []
      };
    }

    rooms[room].players[socket.id] = {
      id: socket.id,
      name: name
    };

    rooms[room].order = Object.keys(rooms[room].players);

    // assegna territori casualmente (solo se prima volta)
    assignTerritories(room);

    updateRoom(room);

    // =======================
    // ATTACCO
    // =======================
    socket.on('attack', ({ room, from, to }) => {
      const r = rooms[room];
      if (!r) return;

      const attacker = r.territories[from];
      const defender = r.territories[to];

      // controlli base
      if (!attacker || !defender) return;
      if (attacker.owner !== socket.id) return;
      if (attacker.troops < 2) return;

      // dadi Risiko reali
      const attackDice = Math.min(3, attacker.troops - 1);
      const defenseDice = Math.min(2, defender.troops);

      let a = [];
      let d = [];

      for (let i = 0; i < attackDice; i++) a.push(rand());
      for (let i = 0; i < defenseDice; i++) d.push(rand());

      a.sort((x, y) => y - x);
      d.sort((x, y) => y - x);

      let battles = Math.min(a.length, d.length);

      for (let i = 0; i < battles; i++) {
        if (a[i] > d[i]) {
          defender.troops--;
        } else {
          attacker.troops--;
        }
      }

      // conquista territorio
      if (defender.troops <= 0) {
        defender.owner = socket.id;
        defender.troops = attackDice; // sposta truppe
        attacker.troops -= attackDice;
      }

      io.to(room).emit('dice', { a, d });

      updateRoom(room);
    });

    // =======================
    // FINE TURNO
    // =======================
    socket.on('endTurn', ({ room }) => {
      const r = rooms[room];
      if (!r) return;

      r.turn = (r.turn + 1) % r.order.length;

      // rinforzi base
      giveReinforcements(room);

      updateRoom(room);
    });

    // DISCONNECT
    socket.on('disconnect', () => {
      const r = rooms[room];
      if (!r) return;

      delete r.players[socket.id];
      r.order = Object.keys(r.players);

      updateRoom(room);
    });

  });
});

// =======================
// FUNZIONI GIOCO
// =======================

// dadi
function rand() {
  return Math.ceil(Math.random() * 6);
}

// assegna territori random
function assignTerritories(room) {
  const r = rooms[room];
  const players = Object.keys(r.players);

  let i = 0;
  for (let t in r.territories) {
    if (!r.territories[t].owner) {
      let p = players[i % players.length];
      r.territories[t].owner = p;
      r.territories[t].troops = 1;
      i++;
    }
  }
}

// rinforzi
function giveReinforcements(room) {
  const r = rooms[room];
  const currentPlayer = r.order[r.turn];

  let owned = Object.values(r.territories)
    .filter(t => t.owner === currentPlayer).length;

  let reinforcements = Math.max(3, Math.floor(owned / 3));

  // aggiunge truppe random
  for (let i = 0; i < reinforcements; i++) {
    let myTerritories = Object.keys(r.territories)
      .filter(t => r.territories[t].owner === currentPlayer);

    let randomTerritory = myTerritories[Math.floor(Math.random() * myTerritories.length)];
    r.territories[randomTerritory].troops++;
  }
}

// aggiorna stato
function updateRoom(room) {
  const r = rooms[room];
  if (!r) return;

  const current = r.order[r.turn];
  r.turnName = current ? r.players[current]?.name : "";

  io.to(room).emit('state', r);
}

// =======================
// START SERVER
// =======================
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
