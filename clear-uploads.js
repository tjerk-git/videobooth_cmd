#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const uploadsDir = path.join(__dirname, 'uploads');
const dbPath = path.join(__dirname, 'videos.db');

function clearDatabase() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                reject(new Error(`Failed to connect to database: ${err.message}`));
                return;
            }
        });

        db.run("DELETE FROM videos", (err) => {
            if (err) {
                db.close();
                reject(new Error(`Failed to clear database: ${err.message}`));
                return;
            }

            // Get count of remaining records
            db.get("SELECT COUNT(*) as count FROM videos", (err, row) => {
                db.close();
                if (err) {
                    reject(new Error(`Failed to verify database cleanup: ${err.message}`));
                    return;
                }
                resolve(row.count);
            });
        });
    });
}

async function clearUploads() {
    try {
        // Check if uploads directory exists
        if (!fs.existsSync(uploadsDir)) {
            console.log('Uploads directory does not exist.');
            return;
        }

        // Read all files in uploads directory
        const files = fs.readdirSync(uploadsDir);
        
        if (files.length === 0) {
            console.log('Uploads directory is already empty.');
            return;
        }

        console.log(`Found ${files.length} files in uploads directory.`);
        
        let deletedCount = 0;
        let errorCount = 0;

        // Delete each file
        files.forEach(file => {
            const filePath = path.join(uploadsDir, file);
            
            try {
                // Check if it's a file (not a directory)
                const stats = fs.statSync(filePath);
                if (stats.isFile()) {
                    fs.unlinkSync(filePath);
                    console.log(`Deleted: ${file}`);
                    deletedCount++;
                } else {
                    console.log(`Skipped (not a file): ${file}`);
                }
            } catch (error) {
                console.error(`Error deleting ${file}:`, error.message);
                errorCount++;
            }
        });

        console.log(`\nFile cleanup complete!`);
        console.log(`Files deleted: ${deletedCount}`);
        if (errorCount > 0) {
            console.log(`File deletion errors: ${errorCount}`);
        }

        // Clear database records
        console.log(`\nClearing database records...`);
        try {
            // Check if database exists
            if (!fs.existsSync(dbPath)) {
                console.log('Database file does not exist. Skipping database cleanup.');
            } else {
                const remainingRecords = await clearDatabase();
                console.log(`Database cleared successfully. Remaining records: ${remainingRecords}`);
            }
        } catch (dbError) {
            console.error('Error clearing database:', dbError.message);
            console.log('File cleanup completed, but database cleanup failed.');
            process.exit(1);
        }

        console.log(`\n✅ Complete cleanup finished!`);

    } catch (error) {
        console.error('Error during cleanup:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    clearUploads();
}

module.exports = clearUploads;