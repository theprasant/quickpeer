import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);


const PORT = process.env.PORT || 3000;

// import { dirname } from 'path';
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = dirname(__filename);
// import path from 'path';

app.set("view engine", "ejs");
app.set('views', path.join(__dirname, 'views'))
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let sessions = {}; // To store active sessions (unique IDs and peer connections)

import home from './routes/home.js';

app.use('/', home);

// Handle WebSocket connections via Socket.IO
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('create-session', () => {
        console.log('Creating a new session');
        const sessionId = uuidv4(); // Generate a unique ID
        sessions[sessionId] = { hostSocketId: socket.id };
        socket.join(sessionId);  // Join a room identified by the sessionId
        socket.emit('session-created', { sessionId });
    });

    socket.on('join-session', (data) => {
        const { sessionId } = data;
        const session = sessions[sessionId];

        console.log(`User ${socket.id} requested for joining session ${sessionId}`);

        if (session && session.hostSocketId) {
            socket.join(sessionId);  // Join a room identified by the sessionId
            // Notify the host that a peer wants to connect
            console.log(`Notifying host ${session.hostSocketId} about peer ${socket.id}`);
            io.to(session.hostSocketId).emit('peer-wants-to-connect', { peerSocketId: socket.id });
        } else {
            console.log('Session not found');
            console.log(`session: `, session);
            socket.emit('error', 'Session not found');
        }
    });

    socket.on('file-metadata', (data) => {
        const { sessionId, fileMetadata } = data;
        if(sessionId && sessions[sessionId]) sessions[sessionId].fileMetadata = fileMetadata;
        socket.to(sessionId).emit('file-metadata', { fileMetadata });
    });

    // Relay request-file signal from the receiver to the sender
    socket.on('request-file', (data) => {
        const { sessionId, fileIndex } = data;
        console.log(`User ${socket.id} requested file ${fileIndex} from session ${sessionId}`);
        socket.to(sessionId).emit('request-file', { fileIndex });
    });

    socket.on('request-all-files', (data) => {
        const { sessionId, fileIndex } = data;
        console.log(`User ${socket.id} requested file all from session ${sessionId}`);
        socket.to(sessionId).emit('request-all-files');
    });

    socket.on('signal', (data) => {
        const { targetSocketId, signalData } = data;
        io.to(targetSocketId).emit('signal', { signalData, fromSocketId: socket.id });
    });

    socket.on('disconnect', () => {
        console.log(`User ${socket.id} disconnected`);

        // Check if this is the host of an active session
        for (const sessionId in sessions) {
            if (sessions[sessionId].hostSocketId === socket.id) {
                // Notify all peers connected to this session that the host has disconnected
                socket.to(sessionId).emit('host-disconnected');
                delete sessions[sessionId]; // Clean up the session
            }
        }
    });
});


server.listen(PORT, () => {
    console.log('http://localhost:' + PORT);
})


// const servers = {
//     iceServers: [
//         {
//             urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
//         },
//     ],
//     iceCandidatePoolSize: 10,
// };

// // Global State
// const pc = new RTCPeerConnection(servers);