const socket = io();
const sessionIdInp = document.getElementById('uid-input');
const connectBtn = document.getElementById('connect-btn');
const downloadFilesContainer = document.getElementById('download-files-container');
const fileCountSpan = document.getElementById('file-count');
const fileSizeSpan = document.getElementById('file-size');
const downloadFiles = document.getElementById('download-files');
const downloadAllBtn = document.getElementById('download-all-btn');
const rcvDetailsContainer = document.getElementById('receive-details-container');
let peer;
let sessionId = location.pathname.replace(/receive|\//ig, '').trim();
sessionId = sessionId.length > 0 ? sessionId : undefined;
window.onload = () => {
    // Join the session using the unique ID
    if (sessionId) socket.emit('join-session', { sessionId });
};

connectBtn.addEventListener('click', () => {
    sessionId = sessionIdInp.value?.trim();
    if (sessionId && sessionId.length) socket.emit('join-session', { sessionId });
});

socket.on('signal', (data) => {
    // Create a new WebRTC peer
    if (!peer) {
        peer = new SimplePeer({
            initiator: false,
            trickle: false,
            config: {
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            }
        });

        // Send signaling data back to the host (Peer A)
        peer.on('signal', signalData => {
            // if (peer._pc.signalingState !== 'stable') {}
            socket.emit('signal', { targetSocketId: data.fromSocketId, signalData });
        });

        socket.on('file-metadata', (data) => {
            const { fileMetadata } = data;
            console.log(`Received file metadata:`, fileMetadata);
            // let filesText = '';
            downloadFiles.innerHTML = '';  // Clear the existing file list
            fileMetadata.forEach((file, index) => {
                // filesText += `<li class="download-file">
                //         <span class="file-name">${file.name}</span>
                //         <span class="file-size">${file.size}</span>
                //          <span class="material-symbols-outlined indv-dwnld-btn" id="download-file-${index}">
                //             download
                //         </span>
                //     </li>\n`;

                // convert the above code to create element format

                const li = document.createElement('li');
                li.className = 'download-file';

                // Create the <span> element for the file name
                const fileNameSpan = document.createElement('span');
                fileNameSpan.className = 'file-name';
                fileNameSpan.textContent = file.name;

                // Create the <span> element for the file size
                const fileSizeSpan = document.createElement('span');
                fileSizeSpan.className = 'file-size';
                fileSizeSpan.textContent = file.size;

                // Create the <span> element for the download button
                const downloadBtnSpan = document.createElement('span');
                downloadBtnSpan.className = 'material-symbols-outlined indv-dwnld-btn';
                downloadBtnSpan.id = `download-file-${index}`;
                downloadBtnSpan.textContent = 'download';

                // Append the child elements to the parent <li> element
                li.appendChild(fileNameSpan);
                li.appendChild(fileSizeSpan);
                li.appendChild(downloadBtnSpan);

                // Append the <li> element to the downloadFiles <ul> element
                downloadFiles.appendChild(li);

                // Attach event listener to download button
                document.getElementById(`download-file-${index}`).addEventListener('click', () => {
                    // Request the actual file from the sender
                    console.log(`Requesting file ${index} - ${file.name} from the sender`);
                    socket.emit('request-file', { sessionId, fileIndex: index });
                });
            });

            fileCountSpan.innerText = fileMetadata.length;
            let totalSize = fileMetadata.reduce((acc, file) => acc + file.size, 0);
            totalSize = formatBytes(totalSize);
            fileSizeSpan.innerText = totalSize;

            downloadAllBtn.addEventListener('click', () => {
                console.log('Requesting all files from the sender');
                socket.emit('request-all-files', { sessionId });
                // for (let index = 0; index < fileMetadata.length; index++) {
                //     socket.emit('request-file', { sessionId, fileIndex: index });
                // }
                // fileMetadata.forEach((file, index) => {
                //     socket.emit('request-file', { sessionId, fileIndex: index });
                // });
            });

            downloadFilesContainer.style.display = 'flex';
            rcvDetailsContainer.style.display = 'none';
        });


        let currentFile = null;

        peer.on('data', (data) => {
            console.log('Received data:', data?.size || data.length, 'bytes');
            try {
                const message = JSON.parse(data);

                if (message.type === 'file-info') {
                    // Start receiving a new file
                    console.log(`RECEIVING FILE: ${message.name} (${message.size} bytes)`);
                    currentFile = {
                        name: message.name,
                        size: message.size,
                        buffers: []
                    };
                } else if (message.type === 'file-complete') {
                    console.log('FILE TRANSFER COMPLETE:', currentFile.name);
                    // File transfer is complete, assemble the file and trigger download
                    const fileBlob = new Blob(currentFile.buffers);  // Combine chunks into a blob

                    const downloadLink = document.createElement('a');
                    downloadLink.href = URL.createObjectURL(fileBlob);
                    downloadLink.download = currentFile.name;  // Use the original file name
                    downloadLink.click();

                    currentFile = null;  // Reset for the next file
                }
            } catch (e) {
                // If the message is not JSON, it's file data
                if (currentFile) {
                    // Add the received chunk to the current file's buffer
                    currentFile.buffers.push(data);
                }
            }
        });



        // // Receive files from Peer A
        // peer.on('data', (fileBuffer) => {
        //     const blob = new Blob([fileBuffer]);
        //     const downloadUrl = URL.createObjectURL(blob);
        //     const a = document.createElement('a');
        //     a.href = downloadUrl;
        //     a.download = 'received-file';
        //     a.click();
        // });

        peer.signal(data.signalData); // Signal the initial offer from Peer A
    }
});

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes'

    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB']

    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}