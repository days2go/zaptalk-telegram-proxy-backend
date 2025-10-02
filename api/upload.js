const express = require('express');
const fetch = require('node-fetch');
const multer = require('multer');
const FormData = require('form-data');
const cors = require('cors');

// Get keys from Vercel Environment Variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

// Set Multer memory storage and file limit (100 MB)
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 } 
}); 

const app = express();

// CRITICAL FIX: Enable CORS for all origins (Network fix)
app.use(cors());

// Define the root endpoint (for Vercel's serverless function structure)
const handler = async (req, res) => {
    // Check for necessary keys
    if (!BOT_TOKEN || !CHANNEL_ID) {
        return res.status(500).json({ success: false, message: "Server configuration missing (BOT_TOKEN or CHANNEL_ID)." });
    }

    // Handle file upload requests
    if (req.url === '/api/upload' && req.method === 'POST') {
        upload.single('file')(req, res, async (err) => {
            if (err instanceof multer.MulterError) {
                return res.status(400).json({ success: false, message: `Multer Error: ${err.message}` });
            } else if (err) {
                return res.status(500).json({ success: false, message: `Unknown Upload Error: ${err.message}` });
            }

            const file = req.file;

            if (!file) {
                return res.status(400).json({ success: false, message: "File data nahi mila." });
            }

            const form = new FormData();
            form.append('chat_id', CHANNEL_ID);
            form.append('caption', `Cozy Messenger File: ${file.originalname}`);

            // Determine Telegram API endpoint based on file type for powerful handling
            let telegramMethod;
            if (file.mimetype.startsWith('image/')) {
                telegramMethod = 'sendPhoto';
                form.append('photo', file.buffer, { filename: file.originalname, contentType: file.mimetype });
            } else if (file.mimetype.startsWith('video/')) {
                telegramMethod = 'sendVideo';
                form.append('video', file.buffer, { filename: file.originalname, contentType: file.mimetype });
            } else {
                telegramMethod = 'sendDocument';
                form.append('document', file.buffer, { filename: file.originalname, contentType: file.mimetype });
            }

            try {
                const telegramResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${telegramMethod}`, {
                    method: 'POST',
                    body: form,
                    headers: form.getHeaders()
                });

                const telegramResult = await telegramResponse.json();

                if (telegramResult.ok) {
                    let telegramFileId;
                    // Extract file ID reliably based on media type for later download
                    const message = telegramResult.result;
                    if (message.photo) {
                         // Photo sends an array; take the largest size file_id
                         telegramFileId = message.photo.pop().file_id;
                    } else if (message.video) {
                        telegramFileId = message.video.file_id;
                    } else if (message.document) {
                        telegramFileId = message.document.file_id;
                    }
                    // Fallback check for file_id
                    if (!telegramFileId) {
                         return res.status(500).json({ success: false, message: "Telegram ne File ID nahi diya, lekin upload successful raha.", raw: telegramResult });
                    }


                    return res.status(200).json({
                        success: true,
                        message: "File successfully uploaded to Telegram.",
                        telegramFileId: telegramFileId,
                        fileName: file.originalname,
                        fileSize: file.size
                    });
                } else {
                    return res.status(500).json({ success: false, message: "Telegram API Error.", details: telegramResult });
                }
            } catch (error) {
                console.error("Telegram Upload Failed:", error);
                return res.status(500).json({ success: false, message: `Internal Server Error: ${error.message}` });
            }
        });
    } 
    
    // Handle file download requests (GET /api/download/FILE_ID)
    else if (req.url.startsWith('/api/download/')) {
         const fileId = req.url.split('/').pop();
         if (!fileId || fileId === 'download' || fileId === 'api') {
              return res.status(400).json({ success: false, message: "Invalid File ID" });
         }

         try {
             // 1. Get file path from Telegram
             const pathResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
             const pathResult = await pathResponse.json();

             if (!pathResult.ok) {
                 return res.status(500).json({ success: false, message: "Telegram file path nahi mila.", details: pathResult });
             }

             const filePath = pathResult.result.file_path;
             const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

             // 2. Redirect user to the Telegram CDN link for direct download
             res.setHeader('Location', downloadUrl);
             return res.status(302).send('Redirecting to download...');

         } catch (error) {
              console.error("Download Failed:", error);
              return res.status(500).json({ success: false, message: `Download Error: ${error.message}` });
         }

    } 
    
    // Default Vercel route handling
    else {
        res.status(200).send('Cozy Messenger Proxy is Running.');
    }
};

module.exports = handler;
