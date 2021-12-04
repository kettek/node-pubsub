import minimatch from 'minimatch'

import { Subscriber, SubscriberHandler } from './Subscriber'
import { Endpoint, EndpointMessage, EndpointOutboundHandler, messageIsEndpointMessage } from './Endpoint'
import { Topic } from './Topic'

/**
 * Publisher provides a class for creating new publisher/subscriber relations.
 * 
 * ```typescript
 * import { Publisher } from '@kettek/publisher'
 * 
 * let publisher = new Publisher()
 * 
 * let subscriber = publisher.subscribe('topic.golang', async ({topic: string, message: any}) => {
 *   console.log('received', message, 'on', topic)
 * })
 * 
 * // Also subscribe to topic.unix
 * publisher.subscribe('topic.unix', subscriber)
 * 
 * let subscriberAll = publisher.subscribe('topic.*', async ({topic: string, message: any}) => {
 *   console.log('received', message, 'on', topic)
 * })
 * 
 * publisher.publish('topic.golang', 'hello from golang')
 * publisher.publish('topic.*', 'hello from *')
 * publisher.publish('topic.deno', 'hello from deno')
 * 
 * // subscriber will receive "hello from *" and "hello from golang"
 * // subscriberAll will receive all messages.
 * 
 * publisher.unsubscribe(subscriberAll)
 * publisher.unsubscribe('topic.golang', subscriber) // unsubscribe from golang, but retain unix subscription.
 * ```
 */
export class Publisher {
  /**
   * A map of topics to subscribers.
   * @private
   */
  topics = new Map<Topic, Subscriber[]>()

  /**
   * A map of topics to endpoints
   * @private
   */
  endpoints = new Map<Topic, Endpoint[]>()

  /**
   * Subscribes a handler to a topic and returns a new, corresponding Subscriber.
   * 
   * ```typescript
   * 
   * publisher.subscribe('topic.golang', async ({topic, message}) => {
   *   console.log('handled', topic, message)
   * })
   * ```
   * @param topic 
   * @param handler
   * @returns A new subscriber containing the handler.
   */
  subscribe(topic: Topic, handler: SubscriberHandler): Subscriber
  /**
   * Subscribes a subscriber to a given topic.
   * 
   * ```typescript
   * let subscriber = publisher.subscribe('topic.golang')
   * 
   * publisher.subscribe('topic.unix', subscriber)
   * ```
   * @param topic 
   * @param subscriber
   * @returns The subscriber passed in.
   */
  subscribe(topic: Topic, subscriber: Subscriber): Subscriber
  /**
   * Creates a subscriber without a handler.
   * 
   * ```typescript
   * let subscriber = publisher.subscribe('topic.golang')
   * 
   * subscriber.handler = async ({topic, message}) => {
   *   console.log(message)
   * }
   * ```
   * @param topic 
   */
  subscribe(topic: Topic): Subscriber
  subscribe(topic: Topic, handlerOrSubscriber?: SubscriberHandler|Subscriber): Subscriber {
    if (handlerOrSubscriber instanceof Subscriber) {
      this.topics.set(topic, [
        ...this.topics.get(topic)||[],
        handlerOrSubscriber,
      ])

      return handlerOrSubscriber
    } else {
      let subscriber = new Subscriber(handlerOrSubscriber)

      this.topics.set(topic, [
        ...this.topics.get(topic)||[],
        subscriber,
      ])
      return subscriber
    }
  }

  /**
   * Unsubscribes a subscriber from a specific [[`Topic`]] pattern.
   * 
   * ```typescript
   * publisher.unsubscribe('topic.golang', subscriber) // unsubscribes from a single topic.
   * ```
   * 
   * ```typescript
   * publisher.unsubscribe('topic.deno', handler)
   * ```
   * 
   * @param topic
   * @param subscriber 
   * @returns The number of subscriptions unsubscribed.
   * @throws TypeError if the arguments are not as expected.
   */
  unsubscribe(topic: Topic, subscriber?: Subscriber|SubscriberHandler): number
  /**
   * Unsubscribes a subscriber from all topics it is subscribed to.
   * 
   * ```typescript
   * publisher.unsubscribe(subscriber) // unsubscribes a subsciber from all topics.
   * ```
   * 
   * @param subscriber
   * @returns The number of subscriptions unsubscribed.
   * @throws TypeError if the arguments are not as expected.
   */
  unsubscribe(subscriber: Subscriber|SubscriberHandler): number
  unsubscribe(topicOrSubscriber: Subscriber|SubscriberHandler|Topic, subscriber?: Subscriber|SubscriberHandler): number {
    let topic: Topic|undefined
    if (!subscriber) {
      if (topicOrSubscriber instanceof Subscriber || typeof topicOrSubscriber === 'function') {
        subscriber = topicOrSubscriber
      } else {
        throw TypeError('single argument unsubscribe must provide a Subscriber or handler')
      }
    } else {
      if (typeof topicOrSubscriber === 'string') {
        topic = topicOrSubscriber
      } else {
        throw TypeError('first argument must be a Topic')
      }
    }
    let removed: number = 0

    // Match against a specific topic key if given or all if not.
    let topicKeys: IterableIterator<Topic>|Topic[]
    if (topic) {
      topicKeys = this.getMatchingTopics(topic)
    } else {
      topicKeys = this.topics.keys()
    }

    let check: (v: any) => void

    if (typeof subscriber === 'function') {
      check = (s: Subscriber) => s.handler !== subscriber
    } else if (subscriber instanceof Subscriber) {
      check = (s: Subscriber) => s !== subscriber
    } else {
      throw TypeError('subscriber must be a Subscriber or handler')
    }

    for (let key of topicKeys) {
      this.topics.set(
        key, 
        (this.topics.get(key)||[]).filter(check)
      )
      if (this.topics.get(key)?.length === 0) {
        this.topics.delete(key)
      }
      removed++
    }

    return removed
  }

  /**
   * This creates or uses an endpoint for a topic and returns it.
   * 
   * ```typescript
   * let endpoint = publisher.connect('*', async (msg: EndpointMessage): Promise<number> => {
   *   return await conn.send(msg) // assume `conn` has a matching endpoint on the other side.
   * })
   * ```
   * 
   * @param topic Topic that this endpoint should receive.
   * @param endpointOrHandler An endpoint instance or handler.
   * @returns The endpoint
   */
  connect(topic: Topic, endpointOrHandler: Endpoint|EndpointOutboundHandler): Endpoint
  /**
   * This creates an endpoint for a topic.
   * 
   * ```typescript
   * let endpoint = publisher.connect('*')
   * 
   * endpoint.outbound = async (msg: EndpointMessage): Promise<number> => {
   *   return await conn.send(msg)
   * }
   * ```
   * 
   * @param topic 
   * @returns A new endpoint with a default handler.
   */
  connect(topic: Topic): Endpoint
  connect(topic: Topic, endpointOrHandler?: Endpoint|EndpointOutboundHandler): Endpoint {
    if (endpointOrHandler instanceof Endpoint) {
      this.endpoints.set(topic, [
        ...this.endpoints.get(topic)||[],
        endpointOrHandler,
      ])
      return endpointOrHandler
    } else {
      let endpoint = new Endpoint(endpointOrHandler)

      this.endpoints.set(topic, [
        ...this.endpoints.get(topic)||[],
        endpoint,
      ])
      return endpoint
    }
  }

  /**
   * This disconnects an endpoint from a topic.
   * 
   * ```typescript
   * publisher.disconnect('topic.*', endpoint)
   * ```
   * 
   * @param topic The topic to disconnect from.
   * @param endpoint The endpoint
   * @returns
   */
  disconnect(topic: Topic, endpoint: Endpoint|EndpointOutboundHandler): number
  /**
   * This disconnects an endpoint from all topics.
   * 
   * ```typescript
   * publisher.disconnect(endpoint)
   * ```
   * 
   * @param endpoint
   */
  disconnect(endpoint: Endpoint|EndpointOutboundHandler): number
  disconnect(topicOrEndpoint: Endpoint|EndpointOutboundHandler|Topic, endpoint?: Endpoint|EndpointOutboundHandler): number {
    let topic: Topic|undefined
    if (!endpoint) {
      if (topicOrEndpoint instanceof Endpoint || typeof topicOrEndpoint === 'function') {
        endpoint = topicOrEndpoint
      } else {
        throw TypeError('single argument disconnect must provide a Endpoint or handler')
      }
    } else {
      if (typeof topicOrEndpoint === 'string') {
        topic = topicOrEndpoint
      } else {
        throw TypeError('first argument must be a Topic')
      }
    }
    let removed: number = 0

    // Match against a specific topic key if given or all if not.
    let topicKeys: IterableIterator<Topic>|Topic[]
    if (topic) {
      topicKeys = this.getMatchingTopics(topic)
    } else {
      topicKeys = this.endpoints.keys()
    }

    let check: (v: any) => void

    if (typeof endpoint === 'function') {
      check = (e: Endpoint) => e.outbound !== endpoint
    } else if (endpoint instanceof Endpoint) {
      check = (e: Endpoint) => e !== endpoint
    } else {
      throw TypeError('endpoint must be a Endpoint or handler')
    }
    for (let key of topicKeys) {
      this.endpoints.set(
        key, 
        (this.endpoints.get(key)||[]).filter(check)
      )
      if (this.endpoints.get(key)?.length === 0) {
        this.endpoints.delete(key)
      }
      removed++
    }

    return removed
  }

  /**
   * Sends a message to all subscribers and endpoints of a [[`Topic`]].
   * 
   * ```typescript
   * publisher.publish('topic.*', 'this is a message to subscribers of all topics')
   * publisher.publish('topic.golang', 'this is a message to subscribers of topic.golang (and topic.* subscribers!)')
   * ```
   * 
   * @param topic 
   * @param message 
   * @returns The number of subscribers who received the message.
   * @throws [[`PublishErrors`]] if any subscribers or endpoints threw. Thrown _after_ all subscribers have been messaged.
   */
  async publish(topic: Topic, message: any): Promise<number>
  /**
   * Publishes a message to all subscribers and endpoints on behalf of a subscriber, excluding the subscriber itself. The topic must be one the subscriber is subscribed to.
   * 
   * ```typescript
   * publisher.publish(subscriber, 'topic.golang', 'Greetings from a subscriber')
   * ```
   * 
   * @param subscriber The subscriber to send on behalf of.
   * @param topic A topic the subscriber is subscribed to.
   * @param message The message. The subscriber will never see this message.
   * @throws [[`SubscriberPublishError`]] if the subscriber sends to a topic it is not subscribed to.
   * @throws [[`PublishErrors`]] if any subscribers or endpoints threw. Thrown _after_ all subscribers have been messaged.
   */
  async publish(subscriber: Subscriber, topic: Topic, message: any): Promise<number>
  /**
   * Sends a message to all subscribers and endpoints, excluding the provided endpoint.
   * 
   * ```typescript
   * publisher.publish(endpoint, message)
   * ```
   * 
   * @param endpoint The endpoint to send on behalf of.
   * @param message An EndpointMessage for forwarding. The endpoint will never see this message.
   * @throws [[`EndpointPublishError`]] if the provided message is not an EndpointMessage.
   * @throws [[`PublishErrors`]] if any subscribers or endpoints threw. Thrown _after_ all subscribers have been messaged.
   */
  async publish(endpoint: Endpoint, message: EndpointMessage): Promise<number>
  async publish(topicOrEndpoint: Topic|Endpoint|Subscriber, topicOrMessage: any, message?: any): Promise<number> {
    let targetEndpoint: Endpoint|undefined = undefined
    let targetSubscriber: Subscriber|undefined = undefined
    let topic: Topic= '*'

    if (message === undefined) {
      message = topicOrMessage
    }

    if (typeof topicOrEndpoint === 'string') {
      topic = topicOrEndpoint
    } else if (topicOrEndpoint instanceof Subscriber) {
      targetSubscriber = topicOrEndpoint
      topic = topicOrMessage
    } else if (topicOrEndpoint instanceof Endpoint) {
      if (messageIsEndpointMessage(message)) {
        topic = message.topic
        message = message.message
      } else {
        throw new EndpointPublishError('not an EndpointMessage', topicOrEndpoint)
      }
      targetEndpoint = topicOrEndpoint
    }

    // Limit subscribers to sending only to their own subscription domains.
    if (targetSubscriber) {
      if (!this.isSubscribed(targetSubscriber, topic)) {
        throw new SubscriberPublishError('invalid permissions', targetSubscriber)
      }
    }

    let errors: PublishError[] = []
    // Send to our subscribers.
    const results = this.getTopicSubscribers(topic)
    for (let result of results) {
      if (result.subscriber === targetSubscriber) continue // Do not send subscriber publishes to itself.
      try {
        await result.subscriber.handler({topic: result.topic, sourceTopic: topic, message})
      } catch(err: any) {
        let publishError = new PublishError(err, result.subscriber)

        errors.push(publishError)
      }
    }
    // Send to our endpoints.
    let endPointResults = 0
    const topicEndpoints = this.getTopicEndpoints(topic)
    for (let topicEndpoint of topicEndpoints) {
      if (topicEndpoint.endpoint === targetEndpoint) continue // Do not send endpoint publishes to itself.
      try {
        endPointResults += await topicEndpoint.endpoint.outbound({wrapped: true, topic: topic, message})
      } catch(err: any) {
        let publishError = new PublishError(err, topicEndpoint.endpoint)

        errors.push(publishError)
      }
    }

    if (errors.length > 0) {
      throw new PublishErrors(errors)
    }
    return results.length + endPointResults
  }
 
  /**
   * Returns all subscribers of a given topic, using minimatch.
   * 
   * @private
   * @param topic 
   * @returns 
   */
  getTopicSubscribers(topic: Topic): TopicSubscriberResult[] {
    let subs: TopicSubscriberResult[] = []
    for (let [topicKey, subscribers] of this.topics) {
      if (this.matchTopic(topic, topicKey) || this.matchTopic(topicKey, topic)) {
        subs.push(...subscribers.map((sub: Subscriber): TopicSubscriberResult => {
          return {
            topic: topicKey,
            subscriber: sub,
          }
        }))
      }
    }
    return subs
  }

  /**
   * Checks if the subscriber is subscribed to a particular topic.
   * 
   * For example, if a subscriber has been subscribed to `topic.*` and `topic.golang` is checked for, then this will return true.
   * @param subscriber The subscriber to check
   * @param topic The topic to check for
   * @private
   * @returns Whether or not the subscriber is subscribed to the topic
   */
  isSubscribed(subscriber: Subscriber, topic: Topic): boolean {
    for (let [topicKey, subscribers] of this.topics) {
      if (!subscribers.includes(subscriber)) continue
      if (this.matchTopic(topic, topicKey)) {
        return true
      }
    }
    return false
  }

  /**
   * Returns all endpoints for a given topic.
   * 
   * @private
   * @param topic 
   * @returns 
   */
  getTopicEndpoints(topic: Topic): TopicEndpointResult[] {
    let ends: TopicEndpointResult[] = []
    for (let [topicKey, endpoints] of this.endpoints) {
      if (this.matchTopic(topic, topicKey) || this.matchTopic(topicKey, topic)) {
        ends.push(...endpoints.map((end: Endpoint): TopicEndpointResult => {
          return {
            topic: topicKey,
            endpoint: end,
          }
        }))
      }
    }
    return ends
  }
 
  /**
   * Returns all existing topics that match the provided topic.
   * 
   * @private
   * @param topic 
   * @returns 
   */
  getMatchingTopics(topic: Topic): Topic[] {
    let topics: Topic[] = []
    for (let topicKey of this.topics.keys()) {
      if (this.matchTopic(topicKey, topic)) {
        topics.push(topicKey)
      }
    }
    return topics
  }

  /**
   * Checks if topicA is matched by topicB.
   * 
   * @private
   */
  matchTopic(topicA: Topic, topicB: Topic) {
    return minimatch(topicA, topicB)
  }
}

/**
 * TopicSubscriberResult is an internally used interface for collecting and sending
 * messages to subscribers.
 *
 * @private
 */
export interface TopicSubscriberResult {
  topic: string
  subscriber: Subscriber
}

/**
 * TopicEndpointResult is an internally used interface for collecting and sending
 * messages to endpoints.
 *
 * @private
 */
export interface TopicEndpointResult {
  topic: string
  endpoint: Endpoint
}

/**
 * PublishResult is the result of a call to [[`Publisher.publish`]].
 */
export interface PublishResult {
  /**
   * The number of subscribers successfully messaged.
   */
  count: number
  /**
   * An array of [[`PublishError`]] instances.
   */
  errors?: PublishError[]
}
 
/**
 * This error is created when an error occurs in a subscriber's handler during a publish. It is only ever provided via [[`PublishErrors`]]
 */
export class PublishError extends Error {
  /**
   * A reference to the subscriber that caused the error.
   */
  subscriber?: Subscriber
  /**
   * A reference to the endpoint that caused the error.
   */
  endpoint?: Endpoint
  /**
   * The wrapped error that the subscriber threw.
   */
  error: any
  constructor(e: any, target: Subscriber|Endpoint) {
    super()
    this.error = e
    if (target instanceof Subscriber) {
      this.subscriber = target
    } else if (target instanceof Endpoint) {
      this.endpoint = target
    }
  }
}

/**
 * This error is thrown by [[`Publisher.publish`]] if there were any subscriber errors during publishing. This is a collection of one or more [[`PublishError`]] errors. 
 * 
 * ```typescript
 * try {
 *   await publisher.publish('topic.golang', 'hello')
 * } catch(err: any) {
 *   if (err instanceof PublishErrors) {
 *     for (let error of err.errors) {
 *       console.log('subscriber', error.subscriber, 'got an error: ', error.error)
 *     }
 *   }
 * }
 * ```
 */
export class PublishErrors extends Error {
  /**
   * An array of errors that occurred.
   */
  errors: PublishError[]
  constructor(errors: PublishError[]) {
    super()
    this.errors = errors
  }
}

/**
 * This error is thrown when a subscriber publish request does not match its permissions.
 */
export class SubscriberPublishError extends Error {
  /**
   * A reference to the subscriber that caused the error.
   */
  subscriber: Subscriber

  constructor(m: string, target: Subscriber) {
    super(m)
    this.subscriber = target
  }
}

/**
 * This error is thrown when a non-endpoint message is attempted to be sent on behalf of an endpoint.
 */
export class EndpointPublishError extends Error {
  /**
   * A reference to the endpoint that caused the error.
   */
  endpoint: Endpoint

  constructor(m: string, target: Endpoint) {
    super(m)
    this.endpoint = target
  }
}