import { Topic } from './Topic'

/**
 * Subscriber is the class that is returned from [[`PubSub.subscribe`]] method. A returned instance can be reused for future subscriptions.
 */
export class Subscriber {
  handler: SubscriberHandler
  constructor(handler: SubscriberHandler) {
    this.handler = handler
  }
}

/**
 * SubscriberHandler is the callback interface that is expected by [[`PubSub.subscribe`]].
 */
export interface SubscriberHandler {
  (result: PublishedMessage): Promise<void>
}

/**
 * PublishedMessage is the data interface that [[`SubscriberHandler`]]s expect.
 */
export interface PublishedMessage {
  /**
   * The topic that the subscription received the message from.
   */
  topic: Topic
  /**
   * An optional topic that indicates the original publish call's intended topic. Can be used to differentiate a publish directly intended for a topic or as part of a glob match.
   */
  sourceTopic?: Topic
  /**
   * The message published.
   */
  message: any
}
