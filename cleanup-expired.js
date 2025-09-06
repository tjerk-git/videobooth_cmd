const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Database and uploads directory paths
const dbPath = path.join(__dirname, 'videos.db');
const uploadsDir = path.join(__dirname, 'uploads');

console.log('🧹 Starting cleanup of expired videos...');
console.log(`Database: ${dbPath}`);
console.log(`Uploads directory: ${uploadsDir}`);

// Open database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Error opening database:', err.message);
        process.exit(1);
    }
    console.log('✅ Connected to SQLite database');
});

// Find and delete expired videos
db.serialize(() => {
    // Get expired videos
    db.all(
        'SELECT * FROM videos WHERE expires_at <= datetime("now")',
        [],
        (err, rows) => {
            if (err) {
                console.error('❌ Database error:', err.message);
                db.close();
                process.exit(1);
            }

            if (rows.length === 0) {
                console.log('✨ No expired videos found. Database is clean!');
                db.close();
                process.exit(0);
            }

            console.log(`🗑️  Found ${rows.length} expired video(s) to clean up:`);
            
            let deletedFiles = 0;
            let deletedRecords = 0;
            let errors = [];

            rows.forEach((video, index) => {
                const filePath = path.join(uploadsDir, video.filename);
                const expiryDate = new Date(video.expires_at);
                
                console.log(`  ${index + 1}. ${video.slug} (${video.filename}) - expired ${expiryDate.toLocaleDateString()}`);
                
                // Delete file if it exists
                try {
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        deletedFiles++;
                        console.log(`    ✅ Deleted file: ${video.filename}`);
                    } else {
                        console.log(`    ⚠️  File not found: ${video.filename}`);
                    }
                } catch (err) {
                    console.error(`    ❌ Error deleting file ${video.filename}:`, err.message);
                    errors.push(`File deletion error for ${video.filename}: ${err.message}`);
                }
            });

            // Delete database records for expired videos
            db.run(
                'DELETE FROM videos WHERE expires_at <= datetime("now")',
                [],
                function(err) {
                    if (err) {
                        console.error('❌ Error deleting database records:', err.message);
                        errors.push(`Database deletion error: ${err.message}`);
                    } else {
                        deletedRecords = this.changes;
                        console.log(`✅ Deleted ${deletedRecords} database record(s)`);
                    }

                    // Summary
                    console.log('\n📊 Cleanup Summary:');
                    console.log(`  Files deleted: ${deletedFiles}`);
                    console.log(`  Database records deleted: ${deletedRecords}`);
                    
                    if (errors.length > 0) {
                        console.log(`  Errors: ${errors.length}`);
                        errors.forEach(error => console.log(`    ❌ ${error}`));
                    }

                    // Get remaining video count
                    db.get(
                        'SELECT COUNT(*) as count FROM videos',
                        [],
                        (err, row) => {
                            if (!err && row) {
                                console.log(`  Remaining videos: ${row.count}`);
                            }
                            
                            db.close((err) => {
                                if (err) {
                                    console.error('❌ Error closing database:', err.message);
                                } else {
                                    console.log('✅ Database connection closed');
                                }
                                
                                console.log('🏁 Cleanup completed!');
                                process.exit(errors.length > 0 ? 1 : 0);
                            });
                        }
                    );
                }
            );
        }
    );
});

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n⚠️  Cleanup interrupted by user');
    db.close();
    process.exit(1);
});

process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught exception:', err);
    db.close();
    process.exit(1);
});