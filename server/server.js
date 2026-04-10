const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
app.use(express.static('../client'));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// Omega-like queue system
let waitingQueue = []; // Array for multiple waiters
let rooms = new Map(); // Active pairs {roomId: [socket1, socket2]}

io.on("connection", (socket) => {
  console.log("👤 User connected:", socket.id);

  socket.on("join-queue", () => {
    // Add to queue
    waitingQueue.push(socket);
    socket.emit("queue-status", { position: waitingQueue.length, total: waitingQueue.length });
    io.emit("waiting-count", waitingQueue.length); // Broadcast count

    // Match if >=2 in queue
    if (waitingQueue.length >= 2) {
      const user1 = waitingQueue.shift();
      const user2 = waitingQueue.shift();
      const roomId = `room_${Date.now()}`;

      // Pair them
      rooms.set(roomId, [user1, user2]);
      user1.partner = user2;
      user2.partner = user1;
      user1.roomId = roomId;
      user2.roomId = roomId;

      // Notify match
user1.emit("matched");
user2.emit("matched");

      io.emit("waiting-count", waitingQueue.length);
    }
  });

  socket.on("signal", (data) => {
    if (socket.partner) {
      socket.partner.emit("signal", data);
    }
  });

  socket.on("chat", (msg) => {
    if (socket.partner) {
      socket.partner.emit("chat", msg);
    }
  });

  socket.on("next", () => {
    if (socket.partner) {
      socket.partner.emit("partner-left", "Stranger found new match");
      socket.partner.partner = null;
      
      // Clean room
      if (socket.roomId) {
        rooms.delete(socket.roomId);
      }
    }
    socket.partner = null;
    socket.roomId = null;

    // Re-queue
    socket.emit("queue-status", { position: 1, total: 1 });
    waitingQueue.push(socket);
    io.emit("waiting-count", waitingQueue.length);
  });

  socket.on("disconnect", () => {
    console.log("👤 User disconnected:", socket.id);
    
    // Remove from queue
    waitingQueue = waitingQueue.filter(u => u !== socket);
    
    // Notify partner
    if (socket.partner) {
      socket.partner.emit("partner-left", "Stranger disconnected");
      socket.partner.partner = null;
      
      // Re-queue partner
      waitingQueue.push(socket.partner);
      socket.partner.emit("queue-status", { position: 1, total: waitingQueue.length });
      io.emit("waiting-count", waitingQueue.length);
      
      socket.partner.roomId = null;
      socket.partner = null;
    }
    
    // Clean room
    if (socket.roomId && rooms.has(socket.roomId)) {
      rooms.delete(socket.roomId);
    }
    
    io.emit("waiting-count", waitingQueue.length);
  });
});

server.listen(3000, () => {
  console.log("🚀 Omega-like Server: http://localhost:3000 (Multi-queue ready!)");
});
