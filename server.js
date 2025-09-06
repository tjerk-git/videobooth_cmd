const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { spawn } = require('child_process');
const QRCode = require('qrcode');

// Slug generation arrays
const animals = ['cat', 'dog', 'fox', 'bear', 'wolf', 'lion', 'tiger', 'eagle', 'hawk', 'owl', 'deer', 'rabbit', 'squirrel', 'otter', 'panda', 'koala', 'zebra', 'giraffe', 'elephant', 'dolphin', 'whale', 'shark', 'turtle', 'penguin', 'flamingo', 'parrot', 'butterfly', 'bee', 'dragonfly', 'spider'];

const designObjects = ['circle', 'triangle', 'square', 'diamond', 'star', 'heart', 'cloud', 'lightning', 'rainbow', 'spiral', 'wave', 'arrow', 'cross', 'dot', 'line', 'curve', 'polygon', 'hexagon', 'octagon', 'oval', 'rectangle', 'rhombus', 'trapezoid', 'crescent', 'gear', 'flower', 'leaf', 'branch', 'tree', 'mountain'];

function generateSlug() {
    const animal = animals[Math.floor(Math.random() * animals.length)];
    const design = designObjects[Math.floor(Math.random() * designObjects.length)];
    const number = Math.floor(Math.random() * 1000) + 100; // 3-digit number
    return `${animal}-${design}-${number}`;
}

const app = express();
const PORT = 3000;

// Define the directory for uploads
const uploadsDir = path.join(__dirname, 'uploads');
// Ensure the uploads directory exists
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Initialize SQLite database with better error handling
const dbPath = path.join(__dirname, 'videos.db');

// Check if database file exists
if (!fs.existsSync(dbPath)) {
    console.log('⚠️  Database not found. Please run: node init-db.js');
    process.exit(1);
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Failed to connect to database:', err.message);
        console.log('💡 Try running: node init-db.js');
        process.exit(1);
    }
    console.log('✅ Connected to SQLite database');
    
    // Verify table exists
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='videos'", (err, row) => {
        if (err) {
            console.error('❌ Database error:', err.message);
            process.exit(1);
        }
        if (!row) {
            console.error('❌ Videos table not found. Please run: node init-db.js');
            process.exit(1);
        }
        console.log('✅ Videos table verified');
    });
});

// Cleanup function
function runCleanup() {
    console.log('🧹 Running daily cleanup...');
    const cleanupProcess = spawn('node', ['cleanup-expired.js'], {
        cwd: __dirname,
        stdio: 'inherit'
    });

    cleanupProcess.on('close', (code) => {
        if (code === 0) {
            console.log('✅ Daily cleanup completed successfully');
        } else {
            console.error(`❌ Daily cleanup failed with exit code ${code}`);
        }
    });

    cleanupProcess.on('error', (err) => {
        console.error('❌ Error running cleanup:', err.message);
    });
}

// Schedule daily cleanup at 2 AM
function scheduleCleanup() {
    const now = new Date();
    const scheduledTime = new Date();
    scheduledTime.setHours(2, 0, 0, 0); // 2:00 AM
    
    // If it's already past 2 AM today, schedule for tomorrow
    if (now > scheduledTime) {
        scheduledTime.setDate(scheduledTime.getDate() + 1);
    }
    
    const timeUntilCleanup = scheduledTime.getTime() - now.getTime();
    
    console.log(`⏰ Next cleanup scheduled for: ${scheduledTime.toLocaleString()}`);
    
    setTimeout(() => {
        runCleanup();
        // Schedule the next cleanup for 24 hours later
        setInterval(runCleanup, 24 * 60 * 60 * 1000); // 24 hours in milliseconds
    }, timeUntilCleanup);
}

// Start cleanup scheduling
scheduleCleanup();

// Enable CORS for all routes
app.use(cors());
// Parse JSON request bodies
app.use(express.json());
// Serve static files from the 'public' directory
app.use(express.static('public'));
// Make the uploads directory available as a static folder
app.use('/uploads', express.static(uploadsDir));


// Configure Multer to use memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        // Set a file size limit of 50MB for uploads
        fileSize: 50 * 1024 * 1024
    }
});

// Serve the main HTML file for the root URL
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.post('/api/upload/video', upload.single('video'), (req, res) => {
    console.log('=== VIDEO UPLOAD REQUEST ===');
    console.log('Request received at:', new Date().toISOString());
    console.log('File received:', !!req.file);
    if (req.file) {
        console.log('File size:', req.file.buffer.length);
        console.log('File mimetype:', req.file.mimetype);
    }
    console.log('Request body:', req.body);
    
    try {
        // Get the prompt text from the request body
        const promptText = req.body.prompt || 'no_prompt';
        // Sanitize the prompt text to be safe for filenames
        const sanitizedPrompt = promptText.replace(/[^a-zA-Z0-9-_\.]/g, '_').substring(0, 50); // Limit length to avoid too long filenames
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        // Add random string to ensure uniqueness like in screenshot endpoint
        const randomStr = Math.random().toString(36).substring(2, 8);
        // Construct the final filename including the sanitized prompt, timestamp and random string
        const finalFilename = `${sanitizedPrompt}_${timestamp}_${randomStr}.mp4`;
        const filePath = path.join(uploadsDir, finalFilename);

        fs.writeFileSync(filePath, req.file.buffer);

        // Generate unique slug
        let slug;
        let isUnique = false;
        
        // Keep generating until we get a unique slug
        const checkUniqueSlug = (callback) => {
            slug = generateSlug();
            // Check if slug already exists
            db.get('SELECT slug FROM videos WHERE slug = ?', [slug], (err, row) => {
                if (err) {
                    console.error('Database error checking slug:', err);
                    callback(err, false);
                } else {
                    callback(null, !row); // true if no row found (unique)
                }
            });
        };
        
        // Function to generate unique slug synchronously by using callback
        const generateUniqueSlug = (callback) => {
            checkUniqueSlug((err, unique) => {
                if (err) {
                    callback(err, null);
                } else if (unique) {
                    callback(null, slug);
                } else {
                    generateUniqueSlug(callback); // Try again
                }
            });
        };

        // Generate unique slug and save to database
        generateUniqueSlug((err, uniqueSlug) => {
            if (err) {
                console.error('Error generating unique slug:', err);
                return res.status(500).json({ success: false, error: 'Failed to generate unique identifier' });
            }

            // Calculate expiry date (14 days from now)
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + 14);

            // Debug: Database operation
            console.log('=== DATABASE DEBUG ===');
            console.log('About to insert into database:');
            console.log('- Filename:', finalFilename);
            console.log('- Slug:', uniqueSlug);
            console.log('- Prompt:', promptText);
            console.log('- File size:', req.file.buffer.length);
            console.log('- Expires at:', expiryDate.toISOString());
            
            // Save video record to database
            db.run(
                'INSERT INTO videos (filename, slug, prompt, file_size, expires_at) VALUES (?, ?, ?, ?, ?)',
                [finalFilename, uniqueSlug, promptText, req.file.buffer.length, expiryDate.toISOString()],
                function(err) {
                    if (err) {
                        console.error('❌ Database INSERT error:', err);
                        console.error('- Error code:', err.code);
                        console.error('- Error message:', err.message);
                        return res.status(500).json({ success: false, error: 'Failed to save video record' });
                    } else {
                        console.log(`✅ Video record saved with ID: ${this.lastID}, slug: ${uniqueSlug}`);
                        
                        // Debug: QR Code generation
                        console.log('=== QR CODE DEBUG ===');
                        console.log('Protocol:', req.protocol);
                        console.log('Host:', req.get('host'));
                        console.log('Headers:', req.headers);
                        const fullUrl = `${req.protocol}://${req.get('host')}/watch/${uniqueSlug}`;
                        console.log('Full URL for QR:', fullUrl);
                        
                        // Generate QR code for the full URL
                        QRCode.toDataURL(fullUrl, { width: 200, margin: 2 }, (qrErr, qrDataUrl) => {
                            if (qrErr) {
                                console.error('❌ QR code generation error:', qrErr);
                            } else {
                                console.log('✅ QR code generated successfully');
                            }
                            
                            res.json({
                                success: true,
                                message: 'Video recording saved successfully',
                                filename: finalFilename,
                                slug: uniqueSlug,
                                viewUrl: `/watch/${uniqueSlug}`,
                                fullUrl: fullUrl,
                                qrCode: qrDataUrl || null,
                                expiresAt: expiryDate.toISOString()
                            });
                        });
                    }
                }
            );
        });
    } catch (error) {
        console.error('Video upload error:', error);
        res.status(500).json({ success: false, error: 'Video upload failed' });
    }
});


app.post('/api/upload/screenshot', upload.single('screenshot'), (req, res) => {
    try {
        // Get the prompt text from the request body
        const promptText = req.body.prompt || 'no_prompt';
        // Sanitize the prompt text to be safe for filenames
        const sanitizedPrompt = promptText.replace(/[^a-zA-Z0-9-_\.]/g, '_').substring(0, 50); // Limit length
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        // Add random string to ensure uniqueness
        const randomStr = Math.random().toString(36).substring(2, 8);
        // Construct the final filename including the sanitized prompt, timestamp and random string
        const finalFilename = `${sanitizedPrompt}_${timestamp}_${randomStr}.png`;
        const filePath = path.join(uploadsDir, finalFilename);

        fs.writeFileSync(filePath, req.file.buffer);

        res.json({
            success: true,
            message: 'Screenshot saved successfully',
            filename: finalFilename
        });
    } catch (error) {
        console.error('Screenshot upload error:', error);
        res.status(500).json({ success: false, error: 'Screenshot upload failed' });
    }
});



app.get('/api/video/file/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(uploadsDir, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    // Check if this is a WebM file that needs conversion
    const isWebMFile = filename.endsWith('.webm');
    
    // Read first few bytes to check if it's actually WebM content
    try {
        const buffer = fs.readFileSync(filePath, { start: 0, end: 11 });
        const isActuallyWebM = buffer.toString('ascii', 0, 4) === 'RIFF' || 
                              buffer.toString('hex', 0, 4) === '1a45dfa3'; // WebM signature

        if (isWebMFile || isActuallyWebM) {
            console.log(`🔄 Converting WebM to MP4 for: ${filename}`);
            
            // Create converted filename
            const convertedPath = filePath.replace('.webm', '_converted.mp4');
            
            // Check if converted version already exists
            if (fs.existsSync(convertedPath)) {
                console.log('✅ Serving existing converted MP4');
                return res.sendFile(convertedPath);
            }
            
            // Convert WebM to MP4
            const tempPath = filePath.replace('.webm', '_temp.mp4');
            const ffmpeg = spawn('ffmpeg', [
                '-i', filePath,
                '-c:v', 'libx264',
                '-c:a', 'aac',
                '-movflags', 'faststart',
                '-y', // overwrite output file
                tempPath
            ]);

            let conversionError = null;

            ffmpeg.stderr.on('data', (data) => {
                // FFmpeg outputs to stderr, this is normal
                console.log(`FFmpeg: ${data.toString().trim()}`);
            });

            ffmpeg.on('close', (code) => {
                if (code === 0 && !conversionError) {
                    try {
                        // Move temp file to converted file
                        fs.renameSync(tempPath, convertedPath);
                        console.log('✅ WebM converted to MP4 successfully');
                        res.sendFile(convertedPath);
                    } catch (moveError) {
                        console.error('❌ Error moving converted file:', moveError);
                        res.status(500).json({ error: 'Conversion completed but file move failed' });
                    }
                } else {
                    console.error(`❌ FFmpeg conversion failed with exit code ${code}`);
                    // Clean up temp file if it exists
                    if (fs.existsSync(tempPath)) {
                        fs.unlinkSync(tempPath);
                    }
                    // Serve original file as fallback
                    res.sendFile(filePath);
                }
            });

            ffmpeg.on('error', (err) => {
                console.error('❌ FFmpeg error:', err);
                conversionError = err;
                // Clean up temp file if it exists
                if (fs.existsSync(tempPath)) {
                    fs.unlinkSync(tempPath);
                }
                // Serve original file as fallback
                res.sendFile(filePath);
            });
            
        } else {
            // File is already MP4 or other format, serve as-is
            res.sendFile(filePath);
        }
        
    } catch (readError) {
        console.error('Error reading file for format check:', readError);
        // Fallback to serving the file as-is
        res.sendFile(filePath);
    }
});

app.get('/api/images', (req, res) => {
    try {
        // Read all files in the uploads directory
        const files = fs.readdirSync(uploadsDir);
        // Filter for image files (e.g., .png, .jpg, .jpeg, .gif)
        const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'];
        const imageFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return imageExtensions.includes(ext);
        });

        // Sort files by modification time, newest last
        const sortedImageFiles = imageFiles
            .map(file => ({
                file,
                mtime: fs.statSync(path.join(uploadsDir, file)).mtime
            }))
            .sort((a, b) => a.mtime - b.mtime) // oldest first, newest last
            .map(obj => obj.file);

        // Only return the last 9 images
        const lastEightImages = sortedImageFiles.slice(-6);

        res.json({ images: lastEightImages });
    } catch (error) {
        console.error('Error fetching images:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch images' });
    }
});


app.get('/api/videos', (req, res) => {
    try {
        // Read all files in the uploads directory
        const files = fs.readdirSync(uploadsDir);
        // Filter for video files (e.g., .mp4, .webm, .mov, .avi)
        const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
        const videoFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return videoExtensions.includes(ext);
        });

        // Sort files by modification time, newest first
        const sortedVideoFiles = videoFiles
            .map(file => ({
                file,
                mtime: fs.statSync(path.join(uploadsDir, file)).mtime
            }))
            .sort((a, b) => b.mtime - a.mtime) // newest first
            .map(obj => obj.file);

        res.json({ videos: sortedVideoFiles });
    } catch (error) {
        console.error('Error fetching videos:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch videos' });
    }
});

// Get video by slug
app.get('/api/video/:slug', (req, res) => {
    const slug = req.params.slug;
    db.get(
        'SELECT * FROM videos WHERE slug = ? AND expires_at > datetime("now")',
        [slug],
        (err, row) => {
            if (err) {
                console.error('Database error:', err);
                res.status(500).json({ success: false, error: 'Database error' });
            } else if (!row) {
                res.status(404).json({ success: false, error: 'Video not found or expired' });
            } else {
                res.json({ success: true, video: row });
            }
        }
    );
});

// Serve individual video watch page
app.get('/watch/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'watch-video.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Uploads directory: ${uploadsDir}`);
    
    // Debug: Process user information
    console.log('=== PROCESS DEBUG INFO ===');
    console.log('Process UID:', process.getuid());
    console.log('Process GID:', process.getgid());
    try {
        const os = require('os');
        console.log('User info:', os.userInfo());
    } catch (e) {
        console.log('Could not get user info:', e.message);
    }
    console.log('Current working directory:', process.cwd());
    console.log('========================');
});

process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    process.exit(0);
});