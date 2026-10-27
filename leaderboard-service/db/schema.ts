import {integer,sqliteTable,text,index,primaryKey} from 'drizzle-orm/sqlite-core';
export const players=sqliteTable('players',{
  id:text('id').primaryKey(),tokenHash:text('token_hash').notNull().unique(),
  name:text('name').notNull(),createdAt:integer('created_at').notNull()
});
export const runs=sqliteTable('runs',{
  id:text('id').primaryKey(),playerId:text('player_id').notNull().references(()=>players.id),
  day:text('day').notNull(),version:text('version').notNull(),status:text('status').notNull(),
  startedAt:integer('started_at').notNull(),finishedAt:integer('finished_at'),
  elapsedMs:integer('elapsed_ms'),mistakes:integer('mistakes')
},table=>[index('runs_player').on(table.playerId,table.status)]);
export const scores=sqliteTable('scores',{
  day:text('day').notNull(),playerId:text('player_id').notNull().references(()=>players.id),
  elapsedMs:integer('elapsed_ms').notNull(),mistakes:integer('mistakes').notNull(),finishedAt:integer('finished_at').notNull()
},table=>[primaryKey({columns:[table.day,table.playerId]}),index('score_order').on(table.day,table.elapsedMs,table.mistakes,table.finishedAt)]);
export const rateLimits=sqliteTable('rate_limits',{
  key:text('key').primaryKey(),count:integer('count').notNull(),expires:integer('expires').notNull()
});
