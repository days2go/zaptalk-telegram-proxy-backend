// Telegram Proxy Logic: This runs on the Vercel Serverless Function (api/upload.js)
const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const fetch = require('node-fetch');
const FormData = require('form-data');

// Get sensitive keys from Vercel Environment Variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

// Configure Multer for in-memory storage (Vercel best practice)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }); // Limit to 50MB for single file upload test

const app = express();

// Use body-parser for other requests
app.use(bodyParser.json());

// --- CORS FIX ---
// This forces the necessary headers to allow the ZapTalk front-end to connect.
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

// --- UPLOAD ENDPOINT ---
// Use multer middleware to handle file upload
module.exports = app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'File nahi mili.' });
    }

    if (!BOT_TOKEN || !CHANNEL_ID) {
        return res.status(500).json({ success: false, message: 'Server keys (BOT/CHANNEL ID) set nahi hain.' });
    }

    try {
        const file = req.file;
        const form = new FormData();
        
        // Telegram API requires the file to be sent as 'document' or 'photo'
        form.append('chat_id', CHANNEL_ID);
        form.append('document', file.buffer, {
            filename: file.originalname,
            contentType: file.mimetype,
        });

        // 1. Send file to Telegram
        const telegramUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`;
        const telegramResponse = await fetch(telegramUrl, {
            method: 'POST',
            body: form,
            // Telegram expects boundary headers to be set by the FormData object itself
            headers: form.getHeaders(), 
        });

        const telegramData = await telegramResponse.json();

        if (telegramData.ok) {
            // 2. Extract the permanent file ID
            const fileId = telegramData.result.document.file_id;
            
            return res.status(200).json({
                success: true,
                message: 'File successfully uploaded to Telegram.',
                telegramFileId: fileId,
                fileName: file.originalname,
                fileSize: file.size,
            });
        } else {
            console.error("Telegram Error:", telegramData);
            return res.status(500).json({ success: false, message: `Telegram upload failed: ${telegramData.description || 'Unknown error'}` });
        }

    } catch (error) {
        console.error("Internal Upload Error:", error);
        return res.status(500).json({ success: false, message: 'Internal server error during file processing.' });
    }
});


// --- DOWNLOAD ENDPOINT (Client will request this URL to get the file link) ---
app.get('/api/download/:fileId', async (req, res) => {
    const fileId = req.params.fileId;
    
    if (!BOT_TOKEN || !fileId) {
        return res.status(400).json({ success: false, message: 'Invalid request parameters.' });
    }

    try {
        // 1. Get file path from Telegram
        const getFilePathUrl = `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`;
        const filePathResponse = await fetch(getFilePathUrl);
        const filePathData = await filePathResponse.json();

        if (!filePathData.ok) {
            return res.status(404).json({ success: false, message: 'File not found on Telegram.' });
        }
        
        const filePath = filePathData.result.file_path;
        
        // 2. Construct the direct download URL
        const fileDownloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

        // 3. Redirect the client to the download URL
        res.redirect(fileDownloadUrl);

    } catch (error) {
        console.error("Download Error:", error);
        return res.status(500).json({ success: false, message: 'Error processing download request.' });
    }
});
