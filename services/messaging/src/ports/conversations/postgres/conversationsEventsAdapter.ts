import type { SqlClient } from '../../shared/sql';
import type {
  ConversationsEventsPort,
  ConversationEvent
} from '../conversationsEventsPort';

export type ConversationsEventsAdapterDeps = {
  sql: SqlClient;
  publish?: (event: ConversationEvent) => Promise<void>;
};

export const createPostgresConversationsEventsAdapter = ({ sql, publish }: ConversationsEventsAdapterDeps): ConversationsEventsPort => {
  return {
    async updateLastMessage(update) {
      await sql.query(
        `
        update messaging.conversations
        set last_message_id = $2,
            last_message_preview = $3,
            last_message_at = $4,
            updated_at = $4
        where id = $1
      `,
        [update.conversationId, update.messageId, update.preview, update.occurredAt]
      );
    },

    async publish(event) {
      if (publish) {
        await publish(event);
      }
    }
  };
};

