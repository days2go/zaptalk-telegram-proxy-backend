// Required packages
const express = require('express');
const multer = require('multer');
const FormData = require('form-data');
const fetch = require('node-fetch');
const cors = require('cors');

// Initialize Express app
const app = express();

// Use CORS to allow requests from your frontend
app.use(cors());

// Use Multer for handling file uploads in memory
const upload = multer({ storage: multer.memoryStorage() });

// Environment Variables (Yeh aap Vercel mein set karenge)
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
    console.error("Zaroori environment variables (BOT_TOKEN, CHAT_ID) set nahi hain.");
}

// The main upload route
app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!BOT_TOKEN || !CHAT_ID) {
        return res.status(500).json({ success: false, error: "Server configuration galat hai." });
    }
  
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'Koi file upload nahi hui.' });
    }

    try {
        const fileBuffer = req.file.buffer;
        const originalName = req.file.originalname;
        const fileSize = req.file.size;

        // Create a form and append the file
        const formData = new FormData();
        formData.append('document', fileBuffer, originalName);
        formData.append('chat_id', CHAT_ID);
        formData.append('caption', `File Upload: ${originalName}`);
        
        // Telegram Bot API URL
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`;

        // Send the file to Telegram
        const response = await fetch(url, {
            method: 'POST',
            body: formData,
        });

        const telegramResult = await response.json();

        // Check if Telegram returned success
        if (telegramResult.ok) {
            const fileId = telegramResult.result.document.file_id;
            res.status(200).json({
                success: true,
                telegramFileId: fileId,
                fileName: originalName,
                fileSize: fileSize,
            });
        } else {
            // If Telegram returned an error
            res.status(500).json({ success: false, error: telegramResult.description });
        }
    } catch (error) {
        console.error('Upload mein error:', error);
        res.status(500).json({ success: false, error: 'Internal server error.' });
    }
});

// Export the app for Vercel
module.exports = app;
