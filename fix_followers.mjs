import { createConnection } from 'mysql2/promise';
import { readFileSync } from 'fs';
import { config } from 'dotenv';

// تحميل متغيرات البيئة
config({ path: '/home/ubuntu/sahaat-muhawara/.env.local' });
config({ path: '/home/ubuntu/sahaat-muhawara/.env' });

// قراءة DATABASE_URL من scripts/load-env.js
const envContent = readFileSync('/home/ubuntu/sahaat-muhawara/scripts/load-env.js', 'utf8');
const match = envContent.match(/DATABASE_URL['":\s]+['"]([^'"]+)['"]/);
let dbUrl = process.env.DATABASE_URL;

console.log('DATABASE_URL:', dbUrl ? dbUrl.substring(0, 60) + '...' : 'NOT FOUND');

if (!dbUrl) {
  console.error('DATABASE_URL not found');
  process.exit(1);
}

const conn = await createConnection({ 
  uri: dbUrl, 
  ssl: { rejectUnauthorized: true },
  connectTimeout: 15000
});

// عرض كل المستخدمين
const [allUsers] = await conn.execute(
  "SELECT id, name, appUserId, phoneNumber FROM users ORDER BY id DESC LIMIT 30"
);
console.log('All users:', JSON.stringify(allUsers, null, 2));

// عرض كل سجلات المتابعة
const [allFollows] = await conn.execute(
  "SELECT id, fromUserId, toUserId FROM user_interactions WHERE type = 'follow' LIMIT 30"
);
console.log('All follows:', JSON.stringify(allFollows, null, 2));

await conn.end();
