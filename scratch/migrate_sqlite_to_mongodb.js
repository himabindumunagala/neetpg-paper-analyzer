const sqlite3 = require('sqlite3').verbose();
const mongoose = require('mongoose');
const path = require('path');
const { initDatabase, models } = require('../config/database');

// Configuration
const sqliteDbPath = path.resolve(__dirname, '../neet_pg_bank_v2.db');
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/neetpg';

async function migrate() {
  console.log('🏁 Starting SQLite to MongoDB migration...');
  
  // 1. Connect to SQLite
  const sqldb = new sqlite3.Database(sqliteDbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
      console.error('❌ Error opening SQLite database:', err.message);
      process.exit(1);
    }
  });

  const allQuery = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      sqldb.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  };

  try {
    // 2. Connect to MongoDB and initialize schemas
    console.log('Connecting to MongoDB at:', mongoUri);
    // Temporary override to force MongoDB connection during migration
    process.env.MONGODB_URI = mongoUri;
    await initDatabase();

    // 3. Migrate UploadHistory
    console.log('\nMigrating UploadHistory...');
    const uploadRows = await allQuery('SELECT * FROM UploadHistory');
    console.log(`Found ${uploadRows.length} uploads in SQLite.`);
    for (const row of uploadRows) {
      await models.UploadHistory.updateOne(
        { Upload_ID: row.Upload_ID },
        {
          Upload_ID: row.Upload_ID,
          User_ID: row.User_ID || 'system_user',
          File_Name: row.File_Name,
          File_Size: row.File_Size,
          Upload_Date: new Date(row.Upload_Date),
          Questions_Extracted: row.Questions_Extracted || 0,
          Processing_Status: row.Processing_Status || 'COMPLETED',
          File_Path: row.File_Path || null
        },
        { upsert: true }
      );
    }
    console.log('✅ UploadHistory migrated.');

    // 4. Migrate SystemSettings
    console.log('\nMigrating SystemSettings...');
    const settingsRows = await allQuery('SELECT * FROM SystemSettings');
    console.log(`Found ${settingsRows.length} settings in SQLite.`);
    for (const row of settingsRows) {
      await models.SystemSettings.updateOne(
        { Setting_Key: row.Setting_Key },
        { Setting_Key: row.Setting_Key, Setting_Value: row.Setting_Value },
        { upsert: true }
      );
    }
    console.log('✅ SystemSettings migrated.');

    // 5. Migrate Images
    console.log('\nMigrating Images...');
    const imageRows = await allQuery('SELECT * FROM Images');
    console.log(`Found ${imageRows.length} images in SQLite.`);
    for (const row of imageRows) {
      await models.Images.updateOne(
        { Image_ID: row.Image_ID },
        {
          Image_ID: row.Image_ID,
          Question_ID: row.Question_ID,
          Image_Path: row.Image_Path,
          Image_Description: row.Image_Description || null,
          Image_Type: row.Image_Type || null
        },
        { upsert: true }
      );
    }
    console.log('✅ Images migrated.');

    // 6. Migrate QuestionBank
    console.log('\nMigrating QuestionBank...');
    const questionRows = await allQuery('SELECT * FROM QuestionBank');
    console.log(`Found ${questionRows.length} questions in SQLite.`);
    
    let count = 0;
    for (const row of questionRows) {
      // Parse keywords if stored as string/json
      let keywords = [];
      if (row.Keywords) {
        try {
          keywords = JSON.parse(row.Keywords);
          if (!Array.isArray(keywords)) keywords = [];
        } catch (e) {
          keywords = row.Keywords.split(',').map(k => k.trim()).filter(Boolean);
        }
      }

      await models.QuestionBank.updateOne(
        { Question_ID: row.Question_ID },
        {
          Question_ID: row.Question_ID,
          Upload_ID: row.Upload_ID,
          Question_Number: row.Question_Number,
          Question_Text: row.Question_Text,
          Option_A: row.Option_A,
          Option_B: row.Option_B,
          Option_C: row.Option_C,
          Option_D: row.Option_D,
          Correct_Answer: row.Correct_Answer,
          Answer_Explanation: row.Answer_Explanation || null,
          Subject: row.Subject || null,
          Chapter: row.Chapter || null,
          Topic: row.Topic || null,
          Difficulty_Level: row.Difficulty_Level || 'Medium',
          Clinical_or_Conceptual: row.Clinical_or_Conceptual || 'Conceptual',
          Question_Type: row.Question_Type || 'Single Best Answer',
          Image_Present: row.Image_Present === 1 || row.Image_Present === true,
          Embedded_Image: row.Embedded_Image || null,
          Image_Description: row.Image_Description || null,
          Previous_Year: row.Previous_Year,
          Page_Number: row.Page_Number,
          Keywords: keywords,
          Similarity_Group_ID: row.Similarity_Group_ID || null,
          OCR_Confidence: row.OCR_Confidence || 'High',
          Generation_Source: row.Generation_Source || 'Local Fallback',
          Gemini_Enriched: row.Gemini_Enriched === 1 || row.Gemini_Enriched === true,
          Created_Date: row.Created_Date ? new Date(row.Created_Date) : new Date(),
          Updated_Date: row.Updated_Date ? new Date(row.Updated_Date) : new Date()
        },
        { upsert: true }
      );
      
      count++;
      if (count % 200 === 0) {
        console.log(`Migrated ${count}/${questionRows.length} questions...`);
      }
    }
    console.log(`✅ ${questionRows.length} questions successfully migrated.`);

    console.log('\n🎉 SQLite to MongoDB Migration completed successfully!');

  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    sqldb.close();
    await mongoose.disconnect();
  }
}

migrate();
