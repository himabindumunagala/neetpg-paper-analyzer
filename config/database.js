require('dotenv').config();
const mongoose = require('mongoose');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/neetpg';
const isMongoMode = true; // MongoDB is uniform across both local and production

let db;
let dbQuery = {};
let models = {};

// ==========================================
// MONGODB ATLAS INTEGRATION CONFIG (Mongoose)
// ==========================================

if (isMongoMode) {
  console.log('🔌 Database: MongoDB Atlas integration active.');

  const uploadHistorySchema = new mongoose.Schema(
    {
      Upload_ID: { type: String, required: true, unique: true, index: true },
      User_ID: { type: String, default: 'system_user' },
      File_Name: { type: String, required: true },
      File_Size: { type: Number, required: true },
      Upload_Date: { type: Date, required: true, index: true },
      Questions_Extracted: { type: Number, default: 0 },
      Processing_Status: {
        type: String,
        enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
        default: 'PENDING',
        index: true
      },
      File_Path: { type: String, default: null }
    },
    { versionKey: false }
  );

  const questionBankSchema = new mongoose.Schema(
    {
      Question_ID: { type: String, required: true, unique: true, index: true },
      Upload_ID: { type: String, required: true, index: true },
      Question_Number: { type: Number, index: true },
      Question_Text: { type: String, required: true },
      Option_A: { type: String, default: '' },
      Option_B: { type: String, default: '' },
      Option_C: { type: String, default: '' },
      Option_D: { type: String, default: '' },
      Correct_Answer: { type: String, default: null },
      Answer_Explanation: { type: String, default: null },
      Subject: { type: String, default: null, index: true },
      Chapter: { type: String, default: null },
      Topic: { type: String, default: null },
      Difficulty_Level: {
        type: String,
        enum: ['Easy', 'Medium', 'Hard'],
        default: 'Medium',
        index: true
      },
      Clinical_or_Conceptual: {
        type: String,
        enum: ['Clinical Scenario', 'Conceptual', 'Fact Recall'],
        default: 'Conceptual',
        index: true
      },
      Question_Type: {
        type: String,
        enum: ['Clinical Scenario', 'Single Best Answer', 'Image Based', 'Assertion Reason', 'Fact Recall'],
        default: 'Single Best Answer',
        index: true
      },
      Image_Present: { type: Boolean, default: false, index: true },
      Embedded_Image: { type: String, default: null },
      Image_Description: { type: String, default: null },
      Previous_Year: { type: Number, index: true },
      Page_Number: { type: Number },
      Keywords: [String],
      Similarity_Group_ID: { type: String, index: true },
      OCR_Confidence: {
        type: String,
        enum: ['High', 'Medium', 'Low'],
        default: 'High',
        index: true
      },
      Generation_Source: { type: String, default: 'Local Fallback' },
      Gemini_Enriched: { type: Boolean, default: false, index: true },
      Created_Date: { type: Date, default: Date.now },
      Updated_Date: { type: Date, default: Date.now }
    },
    { versionKey: false }
  );

  const imagesSchema = new mongoose.Schema(
    {
      Image_ID: { type: String, required: true, unique: true },
      Question_ID: { type: String, required: true, index: true },
      Image_Path: { type: String, required: true },
      Image_Description: { type: String, default: null },
      Image_Type: { type: String, default: null }
    },
    { versionKey: false }
  );

  const systemSettingsSchema = new mongoose.Schema(
    {
      Setting_Key: { type: String, required: true, unique: true },
      Setting_Value: { type: String, required: true }
    },
    { versionKey: false }
  );

  const UploadHistory = mongoose.model('UploadHistory', uploadHistorySchema, 'UploadHistory');
  const QuestionBank = mongoose.model('QuestionBank', questionBankSchema, 'QuestionBank');
  const Images = mongoose.model('Images', imagesSchema, 'Images');
  const SystemSettings = mongoose.model('SystemSettings', systemSettingsSchema, 'SystemSettings');

  models = { UploadHistory, QuestionBank, Images, SystemSettings };

  // Helper parser for mapping SQL parameter indexes to Mongoose query filters
  function parseQuestionBankFilterSql(sql, params) {
    const filter = {};
    let paramIndex = 0;

    if (sql.includes('AND Upload_ID = ?')) {
      filter.Upload_ID = params[paramIndex++];
    }
    if (sql.includes('AND Subject = ?')) {
      filter.Subject = params[paramIndex++];
    }
    if (sql.includes('AND Difficulty_Level = ?')) {
      filter.Difficulty_Level = params[paramIndex++];
    }
    if (sql.includes('AND Previous_Year = ?')) {
      filter.Previous_Year = parseInt(params[paramIndex++], 10);
    }
    if (sql.includes('AND Image_Present = ?')) {
      filter.Image_Present = params[paramIndex++] === 1;
    }
    if (sql.includes('AND (Question_Text LIKE ?')) {
      // Extract search query
      const searchWildcard = params[paramIndex];
      const cleanSearch = searchWildcard.replace(/%/g, '');
      filter.$or = [
        { Question_Text: { $regex: cleanSearch, $options: 'i' } },
        { Option_A: { $regex: cleanSearch, $options: 'i' } },
        { Option_B: { $regex: cleanSearch, $options: 'i' } },
        { Option_C: { $regex: cleanSearch, $options: 'i' } },
        { Option_D: { $regex: cleanSearch, $options: 'i' } },
        { Keywords: { $regex: cleanSearch, $options: 'i' } }
      ];
      paramIndex += 6; // skip duplicates mapped inside SQLite array
    }
    return { filter, consumed: paramIndex };
  }

  // SQLite-to-Mongoose queries adapter wrapper
  async function executeRun(sql, params) {
    const cleanSql = sql.replace(/\s+/g, ' ').trim();

    if (cleanSql.startsWith('INSERT INTO UploadHistory')) {
      const doc = {
        Upload_ID: params[0],
        User_ID: params[1],
        File_Name: params[2],
        File_Size: params[3],
        Upload_Date: new Date(params[4]),
        Questions_Extracted: params[5],
        Processing_Status: params[6],
        File_Path: params[7]
      };
      await UploadHistory.create(doc);
      return { lastID: doc.Upload_ID, changes: 1 };
    }

    if (cleanSql.startsWith('UPDATE UploadHistory SET Questions_Extracted = 0, Processing_Status = ? WHERE Upload_ID = ?')) {
      const res = await UploadHistory.updateOne(
        { Upload_ID: params[1] },
        { $set: { Questions_Extracted: 0, Processing_Status: params[0] } }
      );
      return { changes: res.modifiedCount };
    }

    if (cleanSql.startsWith('UPDATE UploadHistory SET Questions_Extracted = ?, Processing_Status = ? WHERE Upload_ID = ?')) {
      const res = await UploadHistory.updateOne(
        { Upload_ID: params[2] },
        { $set: { Questions_Extracted: params[0], Processing_Status: params[1] } }
      );
      return { changes: res.modifiedCount };
    }

    if (cleanSql.startsWith('UPDATE UploadHistory SET Processing_Status = ? WHERE Upload_ID = ?')) {
      const res = await UploadHistory.updateOne(
        { Upload_ID: params[1] },
        { $set: { Processing_Status: params[0] } }
      );
      return { changes: res.modifiedCount };
    }

    if (cleanSql.startsWith('DELETE FROM Images WHERE Question_ID IN (SELECT Question_ID FROM QuestionBank WHERE Upload_ID = ?)')) {
      const qIds = await QuestionBank.find({ Upload_ID: params[0] }).distinct('Question_ID');
      const res = await Images.deleteMany({ Question_ID: { $in: qIds } });
      return { changes: res.deletedCount };
    }

    if (cleanSql.startsWith('DELETE FROM QuestionBank WHERE Upload_ID = ?')) {
      const res = await QuestionBank.deleteMany({ Upload_ID: params[0] });
      return { changes: res.deletedCount };
    }

    if (cleanSql.startsWith('INSERT OR REPLACE INTO SystemSettings (Setting_Key, Setting_Value) VALUES (?, ?)')) {
      const res = await SystemSettings.updateOne(
        { Setting_Key: params[0] },
        { $set: { Setting_Value: params[1] } },
        { upsert: true }
      );
      return { changes: res.modifiedCount || res.upsertedCount };
    }

    if (cleanSql.startsWith('INSERT INTO SystemSettings (Setting_Key, Setting_Value) VALUES (?, ?)')) {
      await SystemSettings.create({ Setting_Key: params[0], Setting_Value: params[1] });
      return { changes: 1 };
    }

    if (cleanSql.startsWith('INSERT INTO QuestionBank')) {
      const doc = {
        Question_ID: params[0],
        Upload_ID: params[1],
        Question_Number: params[2],
        Question_Text: params[3],
        Option_A: params[4],
        Option_B: params[5],
        Option_C: params[6],
        Option_D: params[7],
        Correct_Answer: params[8],
        Answer_Explanation: params[9],
        Subject: params[10],
        Chapter: params[11],
        Topic: params[12],
        Difficulty_Level: params[13],
        Clinical_or_Conceptual: params[14],
        Question_Type: params[15],
        Image_Present: params[16] === 1,
        Embedded_Image: params[17],
        Image_Description: params[18],
        Previous_Year: params[19],
        Page_Number: params[20],
        Keywords: (params[21] || '').split(',').map(k => k.trim()).filter(Boolean),
        Similarity_Group_ID: params[22],
        OCR_Confidence: params[23],
        Generation_Source: params[24],
        Gemini_Enriched: params[25] === 1
      };
      await QuestionBank.create(doc);
      return { lastID: doc.Question_ID, changes: 1 };
    }

    if (cleanSql.startsWith('INSERT INTO Images')) {
      const doc = {
        Image_ID: params[0],
        Question_ID: params[1],
        Image_Path: params[2],
        Image_Description: params[3],
        Image_Type: params[4]
      };
      await Images.create(doc);
      return { lastID: doc.Image_ID, changes: 1 };
    }

    if (cleanSql.startsWith('DELETE FROM QuestionBank WHERE Question_ID = ?')) {
      // Cascade delete manually (simulate sqlite foreign keys delete cascade)
      await Images.deleteMany({ Question_ID: params[0] });
      const res = await QuestionBank.deleteOne({ Question_ID: params[0] });
      return { changes: res.deletedCount };
    }

    if (cleanSql.startsWith('DELETE FROM UploadHistory WHERE Upload_ID = ?')) {
      const qIds = await QuestionBank.find({ Upload_ID: params[0] }).distinct('Question_ID');
      await Images.deleteMany({ Question_ID: { $in: qIds } });
      await QuestionBank.deleteMany({ Upload_ID: params[0] });
      const res = await UploadHistory.deleteOne({ Upload_ID: params[0] });
      return { changes: res.deletedCount };
    }

    if (cleanSql.startsWith('UPDATE QuestionBank SET Answer_Explanation = ?, Subject = ?, Chapter = ?, Topic = ?, Difficulty_Level = ?, Clinical_or_Conceptual = ?, Question_Type = ?, Keywords = ?, OCR_Confidence = \'High\', Generation_Source = ?, Gemini_Enriched = 1 WHERE Question_ID = ?')) {
      const res = await QuestionBank.updateOne(
        { Question_ID: params[9] },
        {
          $set: {
            Answer_Explanation: params[0],
            Subject: params[1],
            Chapter: params[2],
            Topic: params[3],
            Difficulty_Level: params[4],
            Clinical_or_Conceptual: params[5],
            Question_Type: params[6],
            Keywords: (params[7] || '').split(',').map(k => k.trim()).filter(Boolean),
            Generation_Source: params[8],
            Gemini_Enriched: true
          }
        }
      );
      return { changes: res.modifiedCount };
    }

    throw new Error(`Unsupported run query for Mongo adapter: ${cleanSql}`);
  }

  async function executeGet(sql, params) {
    const cleanSql = sql.replace(/\s+/g, ' ').trim();

    if (cleanSql.startsWith("SELECT 1 FROM SystemSettings WHERE Setting_Key = 'admin_password'")) {
      const row = await SystemSettings.findOne({ Setting_Key: 'admin_password' }).lean();
      return row ? { 1: 1 } : null;
    }

    if (cleanSql.startsWith('SELECT * FROM UploadHistory WHERE Upload_ID = ?')) {
      return UploadHistory.findOne({ Upload_ID: params[0] }).lean();
    }

    if (cleanSql.startsWith('SELECT * FROM QuestionBank WHERE Question_ID = ?')) {
      return QuestionBank.findOne({ Question_ID: params[0] }).lean();
    }

    if (cleanSql === 'SELECT COUNT(*) as count FROM QuestionBank WHERE Image_Present = 1') {
      const count = await QuestionBank.countDocuments({ Image_Present: true });
      return { count };
    }

    if (cleanSql === 'SELECT COUNT(*) as count FROM QuestionBank') {
      const count = await QuestionBank.countDocuments({});
      return { count };
    }

    if (cleanSql.startsWith('SELECT COUNT(*) as count FROM QuestionBank WHERE')) {
      const { filter } = parseQuestionBankFilterSql(cleanSql, params);
      const count = await QuestionBank.countDocuments(filter);
      return { count };
    }

    if (cleanSql.startsWith('SELECT Setting_Value FROM SystemSettings WHERE Setting_Key = ?')) {
      const row = await SystemSettings.findOne({ Setting_Key: params[0] }).lean();
      return row ? { Setting_Value: row.Setting_Value } : null;
    }

    if (cleanSql.startsWith("SELECT Setting_Value FROM SystemSettings WHERE Setting_Key = '")) {
      const match = cleanSql.match(/Setting_Key\s*=\s*'([^']+)'/);
      const key = match ? match[1] : 'admin_password';
      const row = await SystemSettings.findOne({ Setting_Key: key }).lean();
      return row ? { Setting_Value: row.Setting_Value } : null;
    }

    throw new Error(`Unsupported get query for Mongo adapter: ${cleanSql}`);
  }

  async function executeAll(sql, params) {
    const cleanSql = sql.replace(/\s+/g, ' ').trim();

    if (cleanSql === 'SELECT * FROM UploadHistory ORDER BY Upload_Date DESC') {
      return UploadHistory.find({}).sort({ Upload_Date: -1 }).lean();
    }

    if (cleanSql.startsWith('SELECT * FROM QuestionBank WHERE 1=1')) {
      const { filter, consumed } = parseQuestionBankFilterSql(cleanSql, params);
      let limit = 0;
      let offset = 0;
      if (cleanSql.includes('ORDER BY Question_Number ASC LIMIT ? OFFSET ?')) {
        limit = parseInt(params[consumed], 10);
        offset = parseInt(params[consumed + 1], 10);
      }
      return QuestionBank.find(filter)
        .sort({ Question_Number: 1 })
        .skip(offset)
        .limit(limit)
        .lean();
    }

    if (cleanSql === 'SELECT * FROM Images WHERE Question_ID = ?') {
      return Images.find({ Question_ID: params[0] }).lean();
    }

    if (cleanSql === 'SELECT * FROM QuestionBank ORDER BY Question_Number ASC') {
      return QuestionBank.find({}).sort({ Question_Number: 1 }).lean();
    }

    if (cleanSql === 'SELECT * FROM QuestionBank WHERE Upload_ID = ? ORDER BY Question_Number ASC') {
      return QuestionBank.find({ Upload_ID: params[0] }).sort({ Question_Number: 1 }).lean();
    }

    if (cleanSql.startsWith('SELECT i.Image_ID, i.Question_ID, i.Image_Path, i.Image_Description, i.Image_Type, q.Question_Number, q.Subject FROM Images i JOIN QuestionBank q ON i.Question_ID = q.Question_ID')) {
      const filter = {};
      if (cleanSql.includes('WHERE q.Upload_ID = ?')) filter.Upload_ID = params[0];
      const qById = new Map();
      const qRows = await QuestionBank.find(filter, { Question_ID: 1, Question_Number: 1, Subject: 1, _id: 0 }).lean();
      qRows.forEach(q => qById.set(q.Question_ID, q));
      const imageQuery = qRows.length ? { Question_ID: { $in: qRows.map(q => q.Question_ID) } } : {};
      const images = await Images.find(imageQuery).lean();
      return images
        .filter(img => qById.has(img.Question_ID))
        .map(img => ({
          Image_ID: img.Image_ID,
          Question_ID: img.Question_ID,
          Image_Path: img.Image_Path,
          Image_Description: img.Image_Description,
          Image_Type: img.Image_Type,
          Question_Number: qById.get(img.Question_ID).Question_Number,
          Subject: qById.get(img.Question_ID).Subject
        }));
    }

    if (cleanSql === 'SELECT * FROM QuestionBank WHERE Upload_ID = ?') {
      return QuestionBank.find({ Upload_ID: params[0] }).lean();
    }

    if (cleanSql === 'SELECT Subject, COUNT(*) as count FROM QuestionBank GROUP BY Subject ORDER BY count DESC') {
      return QuestionBank.aggregate([
        { $group: { _id: '$Subject', count: { $sum: 1 } } },
        { $project: { _id: 0, Subject: '$_id', count: 1 } },
        { $sort: { count: -1 } }
      ]);
    }

    if (cleanSql === 'SELECT Chapter, COUNT(*) as count FROM QuestionBank GROUP BY Chapter ORDER BY count DESC') {
      return QuestionBank.aggregate([
        { $group: { _id: '$Chapter', count: { $sum: 1 } } },
        { $project: { _id: 0, Chapter: '$_id', count: 1 } },
        { $sort: { count: -1 } }
      ]);
    }

    if (cleanSql === 'SELECT OCR_Confidence, COUNT(*) as count FROM QuestionBank GROUP BY OCR_Confidence') {
      return QuestionBank.aggregate([
        { $group: { _id: '$OCR_Confidence', count: { $sum: 1 } } },
        { $project: { _id: 0, OCR_Confidence: '$_id', count: 1 } }
      ]);
    }

    if (cleanSql === 'SELECT Previous_Year as year, COUNT(*) as count FROM QuestionBank WHERE Previous_Year IS NOT NULL GROUP BY Previous_Year ORDER BY Previous_Year DESC') {
      return QuestionBank.aggregate([
        { $match: { Previous_Year: { $ne: null } } },
        { $group: { _id: '$Previous_Year', count: { $sum: 1 } } },
        { $project: { _id: 0, year: '$_id', count: 1 } },
        { $sort: { year: -1 } }
      ]);
    }

    if (cleanSql === "SELECT Upload_ID as uploadId, File_Name as fileName FROM UploadHistory WHERE Processing_Status = 'COMPLETED' ORDER BY Upload_Date DESC") {
      return UploadHistory.find(
        { Processing_Status: 'COMPLETED' },
        { _id: 0, Upload_ID: 1, File_Name: 1 }
      )
        .sort({ Upload_Date: -1 })
        .lean()
        .then(rows => rows.map(r => ({ uploadId: r.Upload_ID, fileName: r.File_Name })));
    }

    if (cleanSql === "SELECT Previous_Year as year, Subject, COUNT(*) as count FROM QuestionBank WHERE Previous_Year IS NOT NULL AND Subject IS NOT NULL AND Subject != '' GROUP BY Previous_Year, Subject ORDER BY Previous_Year DESC, count DESC") {
      return QuestionBank.aggregate([
        { $match: { Previous_Year: { $ne: null }, Subject: { $nin: [null, ''] } } },
        { $group: { _id: { year: '$Previous_Year', subject: '$Subject' }, count: { $sum: 1 } } },
        { $project: { _id: 0, year: '$_id.year', Subject: '$_id.subject', count: 1 } },
        { $sort: { year: -1, count: -1 } }
      ]);
    }

    if (cleanSql === 'SELECT Previous_Year as year, COUNT(*) as total FROM QuestionBank WHERE Previous_Year IS NOT NULL GROUP BY Previous_Year') {
      return QuestionBank.aggregate([
        { $match: { Previous_Year: { $ne: null } } },
        { $group: { _id: '$Previous_Year', total: { $sum: 1 } } },
        { $project: { _id: 0, year: '$_id', total: 1 } }
      ]);
    }

    if (cleanSql === "SELECT Previous_Year as year, COUNT(*) as imageCount FROM QuestionBank WHERE Previous_Year IS NOT NULL AND (Image_Present = 1 OR Image_Present = 'true') GROUP BY Previous_Year") {
      return QuestionBank.aggregate([
        { $match: { Previous_Year: { $ne: null }, Image_Present: true } },
        { $group: { _id: '$Previous_Year', imageCount: { $sum: 1 } } },
        { $project: { _id: 0, year: '$_id', imageCount: 1 } }
      ]);
    }

    if (cleanSql === "SELECT Previous_Year as year, COUNT(*) as clinicalCount FROM QuestionBank WHERE Previous_Year IS NOT NULL AND Clinical_or_Conceptual = 'Clinical Scenario' GROUP BY Previous_Year") {
      return QuestionBank.aggregate([
        { $match: { Previous_Year: { $ne: null }, Clinical_or_Conceptual: 'Clinical Scenario' } },
        { $group: { _id: '$Previous_Year', clinicalCount: { $sum: 1 } } },
        { $project: { _id: 0, year: '$_id', clinicalCount: 1 } }
      ]);
    }

    if (cleanSql === 'SELECT * FROM QuestionBank WHERE Gemini_Enriched = 0') {
      return QuestionBank.find({ Gemini_Enriched: false }).lean();
    }

    if (cleanSql === 'SELECT * FROM QuestionBank WHERE Gemini_Enriched = 0 AND Upload_ID = ?') {
      return QuestionBank.find({ Gemini_Enriched: false, Upload_ID: params[0] }).lean();
    }

    throw new Error(`Unsupported all query for Mongo adapter: ${cleanSql}`);
  }

  dbQuery = {
    async run(sql, params = []) {
      return executeRun(sql, params);
    },
    async get(sql, params = []) {
      return executeGet(sql, params);
    },
    async all(sql, params = []) {
      return executeAll(sql, params);
    }
  };
}

// ==========================================
// SQLITE FALLBACK CONFIGURATION (SQLite3)
// ==========================================

if (!isMongoMode) {
  console.log('🔌 Database: SQLite local database active.');
  
  const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../neet_pg_bank_v2.db');
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening SQLite database:', err.message);
    } else {
      console.log('Connected to the SQLite database at:', dbPath);
      db.run('PRAGMA foreign_keys = ON;');
      db.run('PRAGMA journal_mode = WAL;');
    }
  });

  dbQuery = {
    run(sql, params = []) {
      return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
          if (err) reject(err);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      });
    },
    
    get(sql, params = []) {
      return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    },
    
    all(sql, params = []) {
      return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    }
  };
}

// ==========================================
// DATABASE INITALIZATION (Shared Migration)
// ==========================================

async function initDatabase() {
  if (isMongoMode) {
    await mongoose.connect(mongoUri, { autoIndex: true, serverSelectionTimeoutMS: 5000 });
    
    await models.SystemSettings.updateOne(
      { Setting_Key: 'admin_password' },
      { $setOnInsert: { Setting_Value: 'NeetPG2026!' } },
      { upsert: true }
    );

    // Subject normalization
    await models.QuestionBank.updateMany({ Subject: { $regex: /^anesthesia$/i } }, { $set: { Subject: 'Anaesthesia' } });
    await models.QuestionBank.updateMany({ Subject: { $regex: /^general medicine$/i } }, { $set: { Subject: 'Medicine' } });
    await models.QuestionBank.updateMany({ Subject: { $in: [/^embryology$/i, /^histology$/i] } }, { $set: { Subject: 'Anatomy' } });
    await models.QuestionBank.updateMany({ Subject: { $in: [/^obstetrics and gynecology$/i, /^obstetrics & gynecology$/i, /^obstetrics and gynaecology$/i] } }, { $set: { Subject: 'Gynaecology & Obstetrics' } });

    console.log('Connected to MongoDB and verified collections/indexes.');
  } else {
    // SQLite table creations
    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS UploadHistory (
        Upload_ID TEXT PRIMARY KEY,
        User_ID TEXT DEFAULT 'system_user',
        File_Name TEXT NOT NULL,
        File_Size INTEGER NOT NULL,
        Upload_Date DATETIME NOT NULL,
        Questions_Extracted INTEGER DEFAULT 0,
        Processing_Status TEXT CHECK (Processing_Status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
        File_Path TEXT
      );
    `);

    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS QuestionBank (
        Question_ID TEXT PRIMARY KEY,
        Upload_ID TEXT NOT NULL,
        Question_Number INTEGER,
        Question_Text TEXT NOT NULL,
        Option_A TEXT NOT NULL,
        Option_B TEXT NOT NULL,
        Option_C TEXT NOT NULL,
        Option_D TEXT NOT NULL,
        Correct_Answer TEXT,
        Answer_Explanation TEXT,
        Subject TEXT,
        Chapter TEXT,
        Topic TEXT,
        Difficulty_Level TEXT CHECK (Difficulty_Level IN ('Easy', 'Medium', 'Hard')),
        Clinical_or_Conceptual TEXT CHECK (Clinical_or_Conceptual IN ('Clinical Scenario', 'Conceptual', 'Fact Recall')),
        Question_Type TEXT CHECK (Question_Type IN ('Clinical Scenario', 'Single Best Answer', 'Image Based', 'Assertion Reason', 'Fact Recall')),
        Image_Present BOOLEAN DEFAULT FALSE,
        Embedded_Image TEXT,
        Image_Description TEXT,
        Previous_Year INTEGER,
        Page_Number INTEGER,
        Keywords TEXT,
        Similarity_Group_ID TEXT,
        OCR_Confidence TEXT CHECK (OCR_Confidence IN ('High', 'Medium', 'Low')),
        Generation_Source TEXT DEFAULT 'Local Fallback',
        Gemini_Enriched BOOLEAN DEFAULT 0,
        Created_Date DATETIME DEFAULT CURRENT_TIMESTAMP,
        Updated_Date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (Upload_ID) REFERENCES UploadHistory(Upload_ID) ON DELETE CASCADE
      );
    `);

    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS Images (
        Image_ID TEXT PRIMARY KEY,
        Question_ID TEXT NOT NULL,
        Image_Path TEXT NOT NULL,
        Image_Description TEXT,
        Image_Type TEXT,
        FOREIGN KEY (Question_ID) REFERENCES QuestionBank(Question_ID) ON DELETE CASCADE
      );
    `);

    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS SystemSettings (
        Setting_Key TEXT PRIMARY KEY,
        Setting_Value TEXT NOT NULL
      );
    `);

    try {
      const hasPasscode = await dbQuery.get("SELECT 1 FROM SystemSettings WHERE Setting_Key = 'admin_password'");
      if (!hasPasscode) {
        await dbQuery.run("INSERT INTO SystemSettings (Setting_Key, Setting_Value) VALUES ('admin_password', 'NeetPG2026!')");
        console.log('Database migration: Seeded default admin passcode.');
      }
    } catch (e) {
      console.error('Failed to seed default admin passcode:', e);
    }

    await dbQuery.run(`CREATE INDEX IF NOT EXISTS IDX_QB_Subject ON QuestionBank(Subject);`);
    await dbQuery.run(`CREATE INDEX IF NOT EXISTS IDX_QB_Upload ON QuestionBank(Upload_ID);`);
    await dbQuery.run(`CREATE INDEX IF NOT EXISTS IDX_QB_Confidence ON QuestionBank(OCR_Confidence);`);
    
    try { await dbQuery.run(`ALTER TABLE UploadHistory ADD COLUMN File_Path TEXT;`); } catch (e) {}
    try { await dbQuery.run(`ALTER TABLE QuestionBank ADD COLUMN Generation_Source TEXT DEFAULT 'Local Fallback';`); } catch (e) {}
    try { await dbQuery.run(`ALTER TABLE QuestionBank ADD COLUMN Gemini_Enriched BOOLEAN DEFAULT 0;`); } catch (e) {}

    try {
      await dbQuery.run(`UPDATE QuestionBank SET Subject = 'Anaesthesia' WHERE LOWER(TRIM(Subject)) = 'anesthesia'`);
      await dbQuery.run(`UPDATE QuestionBank SET Subject = 'Medicine' WHERE LOWER(TRIM(Subject)) = 'general medicine'`);
      await dbQuery.run(`UPDATE QuestionBank SET Subject = 'Anatomy' WHERE LOWER(TRIM(Subject)) = 'embryology' OR LOWER(TRIM(Subject)) = 'histology'`);
      await dbQuery.run(`UPDATE QuestionBank SET Subject = 'Gynaecology & Obstetrics' WHERE LOWER(TRIM(Subject)) = 'obstetrics and gynecology' OR LOWER(TRIM(Subject)) = 'obstetrics & gynecology' OR LOWER(TRIM(Subject)) = 'obstetrics and gynaecology'`);
    } catch (e) {}

    console.log('Database tables and indexes verified successfully.');
  }
}

module.exports = {
  db: isMongoMode ? mongoose.connection : db,
  dbQuery,
  initDatabase,
  models
};
