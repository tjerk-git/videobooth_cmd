#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'videos.db');
const uploadsDir = path.join(__dirname, 'uploads');

console.log('🔧 Initializing database and directories...');

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
    try {
        fs.mkdirSync(uploadsDir, { recursive: true });
        console.log('✅ Created uploads directory');
    } catch (error) {
        console.error('❌ Failed to create uploads directory:', error.message);
        process.exit(1);
    }
} else {
    console.log('✅ Uploads directory already exists');
}

// Initialize database with proper error handling
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Failed to connect to database:', err.message);
        process.exit(1);
    }
    console.log('✅ Connected to SQLite database');
});

// Create the videos table
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        prompt TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        file_size INTEGER,
        duration INTEGER
    )`, (err) => {
        if (err) {
            console.error('❌ Failed to create videos table:', err.message);
            process.exit(1);
        }
        console.log('✅ Videos table created successfully');
        
        // Verify table structure
        db.all("PRAGMA table_info(videos)", (err, rows) => {
            if (err) {
                console.error('❌ Failed to verify table structure:', err.message);
            } else {
                console.log('✅ Table structure verified:');
                rows.forEach(row => {
                    console.log(`   - ${row.name}: ${row.type}${row.notnull ? ' NOT NULL' : ''}${row.pk ? ' PRIMARY KEY' : ''}`);
                });
            }
            
            // Close database connection
            db.close((err) => {
                if (err) {
                    console.error('❌ Error closing database:', err.message);
                } else {
                    console.log('✅ Database initialization complete!');
                }
            });
        });
    });
});