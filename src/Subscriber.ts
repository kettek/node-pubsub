import { Topic } from './Topic'

/**
 * Subscriber is the class that is returned from [[`Publisher.subscribe`]] method. A returned instance can be reused for future subscriptions.
 */
export class Subscriber {
  handler: SubscriberHandler
  constructor(handler?: SubscriberHandler) {
    if (handler) {
      this.handler = handler
    } else {
      this.handler = async (msg: any): Promise<void> => {}
    }
  }
}

/**
 * SubscriberHandler is the callback interface that is expected by [[`Publisher.subscribe`]].
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

  /**
   * Indicates that the message is from a subscriber and not the publisher or and endpoint.
   */
  fromSubscriber?: boolean
}
