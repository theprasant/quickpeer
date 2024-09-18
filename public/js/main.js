const fileInp = document.getElementById('file_upload_pc');
const fileDropContainer = document.getElementById('file-drop-container');
const fileDropZone = document.getElementById('drop-file-zone');
const fileShareZone = document.getElementById('share-file-zone');
const fileCountSpan = document.getElementById('file-count');
const totalFileSizeSpan = document.getElementById('total-file-size');
const sndRcvBg = document.getElementById('snd-rcv-bg');
const shareLinkInp = document.getElementById('share-link');
const copyLinkIcon = document.getElementById('copy-link-icon');

const socket = io();
let sessionId;
let uploadedFiles = [];
let peers = {};

fileDropZone.addEventListener('click', () => {
    fileInp.click();
});


fileInp.addEventListener('change', e => handleFiles([...e.target.files]), false);

function handleFiles(files) {
    console.log(files);

    if (files?.length === 0) return alert('No files selected!');

    // Request the server to create a new session (generates a unique ID)
    socket.emit('create-session');
    uploadedFiles = files;
}

socket.on('session-created', (data) => {
    sessionId = data.sessionId;
    // sessionIdDisplay.innerText = `Share this ID: ${sessionId}`;
    console.log(`Session ID created: ${sessionId}`);

    let totalSize = uploadedFiles.reduce((acc, file) => acc + file.size, 0);
    totalSize = formatBytes(totalSize);
    fileCountSpan.innerHTML = uploadedFiles.length;
    totalFileSizeSpan.innerHTML = totalSize;
    shareLinkInp.value = `${window.location.href}receive/${sessionId}`;
    fileDropZone.style.display = 'none';
    fileShareZone.style.display = 'block';
    new QRCode(document.getElementById("qrcode"), `${window.location.href}receive/${sessionId}`);
});

socket.on('peer-wants-to-connect', (data) => {
    const peerSocketId = data.peerSocketId;
    console.log(`Peer ${peerSocketId} wants to connect`);

    // Check if the peer is already connected
    if (peers[peerSocketId]) {
        console.warn(`Peer ${peerSocketId} is already connected`);
        return;
    }

    // Create a new WebRTC peer
    peers[peerSocketId] = new SimplePeer({
        initiator: true,
        trickle: false,
        config: {
            iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }]
        }
    });

    // peers[peerSocketId] = peer;

    // Send signaling data to the receiver
    peers[peerSocketId].on('signal', signalData => {
        console.log('signalData', signalData);
        socket.emit(`signal`, { targetSocketId: peerSocketId, signalData });
    });

    // Send the selected files once the connection is established
    peers[peerSocketId].on('connect', () => {
        console.log('Peer connected! Sending files...');
        // Send file metadata to the receiver before sending the actual files
        const fileMetadata = uploadedFiles.map(file => ({
            name: file.name,
            size: file.size
        }));

        // Emit the file metadata to the receiver
        socket.emit('file-metadata', { sessionId, fileMetadata });

        // sendFiles(peer);
    });

    // Handle the "request-file" event, sent from the receiver when they want to download the file
    socket.on('request-file', (data) => {
        const { fileIndex } = data;
        const file = uploadedFiles[fileIndex];

        console.log(`Receiver requested file ${fileIndex}: ${file.name}`);

        // Send the file in chunks
        sendFileInChunks(fileIndex, file, peers[peerSocketId]);
    });

    socket.on('request-all-files', (data) => {
        console.log(`Receiver requested file all files`);
        sendAllFiles(uploadedFiles, peers[peerSocketId]);
    });

    // Receive signaling data from the receiver
    socket.on('signal', (data) => {
        peers[peerSocketId].signal(data.signalData);
    });
});

// Define chunk size (for example, 16 KB)
const CHUNK_SIZE = 16 * 1024;

// Function to send file in chunks
function sendFileInChunks(fileIndex, file, peer) {

    // Send file metadata first through WebRTC (via peer connection)
    peer.send(JSON.stringify({ type: 'file-info', fileIndex, name: file.name, size: file.size }));

    console.log(`Sent file info: ${file.name}`);

    const reader = new FileReader();
    let offset = 0;

    // Read the file as an ArrayBuffer
    reader.onload = function (event) {
        const fileBuffer = event.target.result;

        function sendNextChunk() {
            const chunk = fileBuffer.slice(offset, offset + CHUNK_SIZE);
            peer.send(chunk);  // Send the chunk through WebRTC

            offset += CHUNK_SIZE;

            // Continue sending until the entire file is sent
            if (offset < fileBuffer.byteLength) {
                setTimeout(sendNextChunk, 0);  // Use a timeout to prevent blocking the UI
            } else {
                // Optionally, send a 'complete' message after the last chunk
                peer.send(JSON.stringify({ type: 'file-complete', fileIndex, name: file.name }));
            }
        }

        sendNextChunk();  // Start sending chunks
    };

    reader.readAsArrayBuffer(file);  // Start reading the file
}

function sendAllFiles(files, peer, fileIndex = 0) {

    if (fileIndex >= files.length) return peer.send(JSON.stringify({ type: 'all-files-sent', totalFiles: files.length, fileIndex }));
    const file = files[fileIndex];
    peer.send(JSON.stringify({ type: 'file-info', fileIndex, name: file.name, size: file.size }));
    // Send the file data in chunks
    const reader = new FileReader();
    let offset = 0;

    reader.onload = function (event) {
        const fileBuffer = event.target.result;

        function sendNextChunk() {
            const chunk = fileBuffer.slice(offset, offset + CHUNK_SIZE);
            peer.send(chunk);  // Send the current chunk

            offset += CHUNK_SIZE;

            if (offset < fileBuffer.byteLength) {
                setTimeout(sendNextChunk, 0);  // Continue sending chunks
            } else {
                // Optionally, send a 'complete' message when done with the file
                peer.send(JSON.stringify({ type: 'file-complete', name: file.name, fileIndex, fromTotalFiles: files.length }));
                console.log(`Sending file ${fileIndex + 1}: "${file.name}" after completion of file ${fileIndex}: "${files[fileIndex].name}"`);
                sendAllFiles(files, peer, fileIndex + 1);  // Send the next file
            }
        }

        sendNextChunk();  // Start sending chunks
    };

    reader.readAsArrayBuffer(file);  // Read file as ArrayBuffer for chunking


    // for (let index = 0; index < files.length; index++) {
    //     // Send the file metadata first (name, size)
    //     let file = files[index];
    //     // Send the file metadata first (name, size)
    //     peer.send(JSON.stringify({ type: 'file-info', fileIndex: index, name: file.name, size: file.size }));


    // }
}




function dropHandler(ev) {
    console.log("File(s) dropped");

    ev.preventDefault();
    let files = [];
    if (ev.dataTransfer.items) {
        for (const [i, item] of [...ev.dataTransfer.items].entries()) {
            if (item.kind === "file") {
                const file = item.getAsFile();
                files.push(file);
            }
        }
    } else {
        for (const [i, file] of [...ev.dataTransfer.files].entries()) {
            files.push(file);
        }
    }

    handleFiles(files);
}

function dragOverHandler(ev) {
    ev.preventDefault();
}

function rcvPage() {
    location.href = `/receive`;

    // sndRcvBg.style.right = 0;
    // sndRcvBg.style.left = "50%";
}
function sndPage() {
    sndRcvBg.style.left = 0;
    sndRcvBg.style.right = "50%";
}

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes'

    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB']

    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

function copyLink() {
    shareLinkInp.select();
    shareLinkInp.setSelectionRange(0, 99999); // For mobile devices

    // Copy the text inside the text field
    navigator.clipboard.writeText(shareLinkInp.value);
    //change copy icon (an svg inside #copy-btn) to checkmark for 1 second then back to copy with a animation

    copyLinkIcon.innerText = 'check';

    setTimeout(() => {
        copyLinkIcon.innerText = 'content_copy';
    }, 1000);
}


//window events
window.addEventListener('beforeunload', (e) => {
    if (sessionId) {
        e.preventDefault();
        socket.disconnect();
    }
});