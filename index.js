const express = require('express');
const axios = require('axios');

const app = express();
let blockData = []; // Array to store block data

// Function to fetch and cache block data
async function fetchAndCacheBlockData() {
    try {
        const response = await axios.get("http://blocking.middlewaresv.xyz/api/blockedip/all", { timeout: 1000 });
        const blockDataResponse = response.data;

        // Prepare a sorted array for binary search
        blockData = blockDataResponse.map(block => ({
            start: ipToLong(block.startip),
            end: ipToLong(block.endip),
            isBlocked: block.isBlocked
        })).sort((a, b) => a.start - b.start);
    } catch (error) {
        console.error("Error fetching block data:", error.message);
    }
}

// Convert IP address to long integer
function ipToLong(ip) {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

// Binary search function
function binarySearch(data, ip) {
    let low = 0;
    let high = data.length - 1;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);

        if (ip < data[mid].start) {
            high = mid - 1;
        } else if (ip > data[mid].end) {
            low = mid + 1;
        } else {
            return data[mid].isBlocked; // Return the block status directly
        }
    }

    return 2; // Not found, meaning not blocked
}

// Middleware to handle blocking
app.use(async (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const hash = ipToLong(ip);
    let blockValue = 0;

    // Fetch block data if it's not already loaded
    if (blockData.length === 0) {
        await fetchAndCacheBlockData();
    }

    // Check the block status using binary search
    if (blockData.length > 0) {
        blockValue = binarySearch(blockData, hash);
    }

    // Determine the redirect URL based on blockValue
    const port = req.socket.localPort ? `:${req.socket.localPort}` : '';
    let url;

    if (blockValue === 1) { // block
        url = `http://block-${req.headers.host}${port}${req.originalUrl}`;
    } else if (blockValue === 0) { // not blocked
        url = `http://front-${req.headers.host}${port}${req.originalUrl}`;
    } else { // whitelisted (if applicable, adjust logic if needed)
        url = `http://origi-${req.headers.host}${port}${req.originalUrl}`;
    }

    // Redirect to the appropriate URL
    res.redirect(302, url);
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});