import { randomUUID } from 'node:crypto';

import type { MessageStatus } from '../../../domain/types/message.types';
import type { IsoDateTime, Uuid } from '../../shared/types';
import { type SqlClient, inTransaction } from '../../shared/sql';
import type { MessagesWritePort } from '../messagesWritePort';

export type MessagesWriteAdapterDeps = {
  sql: SqlClient;
  now: () => Date;
  generateId?: () => Uuid;
};

export const createPostgresMessagesWriteAdapter = ({
  sql,
  now,
  generateId = () => randomUUID()
}: MessagesWriteAdapterDeps): MessagesWritePort => {
  return {
    async create(command) {
      return inTransaction(sql, async client => {
        const id = generateId();
        const timestamp = now().toISOString();

        const existingId = command.idempotencyKey
          ? await findByIdempotency(client, command.input.senderId, command.idempotencyKey)
          : null;

        if (existingId) {
          return existingId;
        }

        await insertMessage(client, {
          id,
          ...command.input,
          status: 'sent',
          createdAt: timestamp,
          updatedAt: timestamp
        });

        if (command.idempotencyKey) {
          await upsertMessageIdempotency(client, {
            id,
            senderId: command.input.senderId,
            key: command.idempotencyKey,
            createdAt: timestamp
          });
        }

        return id;
      });
    },

    async updateStatus(id, status, at) {
      await sql.query(
        `
        update messaging.messages
        set status = $2,
            updated_at = $3,
            delivered_at = case when $2 = 'delivered' then $4 else delivered_at end,
            read_at = case when $2 = 'read' then $4 else read_at end
        where id = $1
      `,
        [id, status, now().toISOString(), at]
      );
    },

    async markAsRead(ids, at) {
      if (ids.length === 0) return;
      await sql.query(
        `
        update messaging.messages
        set status = 'read',
            read_at = $2,
            updated_at = $3
        where id = any($1)
      `,
        [ids, at, now().toISOString()]
      );
    },

    async softDelete(id, at) {
      await sql.query(
        `
        update messaging.messages
        set deleted_at = $2,
            updated_at = $3
        where id = $1
      `,
        [id, at, now().toISOString()]
      );
    }
  };
};

type InsertMessageInput = {
  id: Uuid;
  conversationId: Uuid;
  senderId: Uuid;
  type: string;
  status: MessageStatus;
  encryptedContent: string;
  metadata?: Record<string, unknown>;
  contentSize?: number;
  contentMimeType?: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
};

const insertMessage = (sql: SqlClient, input: InsertMessageInput) => {
  return sql.query(
    `
    insert into messaging.messages (
      id,
      conversation_id,
      sender_id,
      type,
      status,
      encrypted_content,
      metadata,
      content_size,
      content_mime_type,
      created_at,
      updated_at
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
    )
  `,
    [
      input.id,
      input.conversationId,
      input.senderId,
      input.type,
      input.status,
      input.encryptedContent,
      input.metadata ?? null,
      input.contentSize ?? null,
      input.contentMimeType ?? null,
      input.createdAt,
      input.updatedAt
    ]
  );
};

type IdempotencyRecord = {
  id: Uuid;
  senderId: Uuid;
  key: string;
  createdAt: IsoDateTime;
};

const findByIdempotency = async (
  sql: SqlClient,
  senderId: Uuid,
  key: string
): Promise<Uuid | null> => {
  const result = await sql.query<{ message_id: Uuid }>(
    `
    select message_id
    from messaging.message_idempotency
    where sender_id = $1 and key = $2
    limit 1
  `,
    [senderId, key]
  );
  return result.rows[0]?.message_id ?? null;
};

const upsertMessageIdempotency = (
  sql: SqlClient,
  record: IdempotencyRecord
) => {
  return sql.query(
    `
    insert into messaging.message_idempotency (sender_id, key, message_id, created_at)
    values ($1,$2,$3,$4)
    on conflict (sender_id, key) do update set message_id = excluded.message_id
  `,
    [record.senderId, record.key, record.id, record.createdAt]
  );
};
