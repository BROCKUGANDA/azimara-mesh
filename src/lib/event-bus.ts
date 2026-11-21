// Event transport abstraction. The outbox publisher writes to this interface;
// the in-process bus is the default so no new infrastructure is required. The
// NATS bus is opt-in via EVENT_BUS=nats and requires a running JetStream server
// (see deploy/services/compose.yaml).

export interface PublishedEvent {
  eventId: string
  workspaceId: string
  eventType: string
  payload: Record<string, unknown>
  correlationId?: string
}

export interface EventBus {
  publish(event: PublishedEvent): Promise<void>
}

class InProcessEventBus implements EventBus {
  private handlers: Array<(event: PublishedEvent) => void> = []

  async publish(event: PublishedEvent): Promise<void> {
    for (const handler of this.handlers) handler(event)
  }

  subscribe(handler: (event: PublishedEvent) => void): () => void {
    this.handlers.push(handler)
    return () => { this.handlers = this.handlers.filter((h) => h !== handler) }
  }
}

export const inProcessBus = new InProcessEventBus()

let natsBus: EventBus | null = null

async function getNatsBus(): Promise<EventBus> {
  if (natsBus) return natsBus
  const { connect, StringCodec } = await import('nats')
  const servers = (process.env.NATS_URL ?? '127.0.0.1:54222').split(',')
  const nc = await connect({ servers, maxReconnectAttempts: 10 })
  const js = nc.jetstream()
  const subject = process.env.NATS_SUBJECT ?? 'mesh.events'
  const codec = StringCodec()
  natsBus = {
    async publish(event) {
      // eventId as a NATS-Msg-Id header gives JetStream a dedupe key, so
      // re-publishing the same outbox row does not duplicate the message.
      await js.publish(subject, codec.encode(JSON.stringify(event)), {
        msgID: event.eventId,
      })
    },
  }
  return natsBus
}

/** Resolve the configured event bus. */
export async function getEventBus(): Promise<EventBus> {
  if ((process.env.EVENT_BUS ?? 'inprocess').toLowerCase() === 'nats') {
    return getNatsBus()
  }
  return inProcessBus
}
