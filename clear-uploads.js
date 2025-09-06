#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const uploadsDir = path.join(__dirname, 'uploads');

function clearUploads() {
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

        console.log(`\nCleanup complete!`);
        console.log(`Files deleted: ${deletedCount}`);
        if (errorCount > 0) {
            console.log(`Errors encountered: ${errorCount}`);
        }

    } catch (error) {
        console.error('Error clearing uploads directory:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    clearUploads();
}

module.exports = clearUploads;