import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const db=new PGlite();
try{
 await db.exec(fs.readFileSync('tests/integration/bootstrap.sql','utf8'));
 for(const file of ['supabase/full_schema.sql','supabase/migrate_existing_database.sql']) {
  // gen_random_uuid is built into modern PostgreSQL. PGlite does not ship pgcrypto.
  const sql=fs.readFileSync(file,'utf8').replace(/create extension if not exists pgcrypto;/ig,'');
  try{await db.exec(sql);console.log(`PASS ${file}`);}catch(e){console.error({file,message:e.message,detail:e.detail,where:e.where,position:e.position});process.exitCode=1;break;}
 }
}finally{await db.close();}
