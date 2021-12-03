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

  endpoints = new Map<Topic, Endpoint[]>()

  /**
   * Creates a subscriber for a given [[`Topic`]]. If a handler is provided, a new [[`Subscriber`]] instance is returned. If an existing Subscriber is provided, it is subscribed to the given topic and returned.
   * 
   * ```typescript
   * let subscriber = publisher.subscribe('topic.golang')
   * ```
   * 
   * ```typescript
   * let handler = async ({topic: string, message: any}) => {
   *   console.log('handled', topic, message)
   * }
   * 
   * publisher.subscribe('topic.golang', handler)
   * ```
   * 
   * @param topic The topic to subscribe to.
   * @param handlerOrSubscriber The handler or existing Subscriber to subscribe to the topic.
   * @returns
   */
  subscribe(topic: Topic, handlerOrSubscriber: SubscriberHandler|Subscriber): Subscriber {
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
   * Unsubscribes a [[`Subscriber`]] or a [[`SubscriberHandler`]] from a specific [[`Topic`]] pattern or from all topics it is subscribed to.
   * 
   * ```typescript
   * publisher.unsubscribe(subscriber) // unsubscribes a subsciber from all topics.
   * ```
   * 
   * ```typescript
   * publisher.unsubscribe('topic.golang', subscriber) // unsubscribes from a single topic.
   * ```
   * 
   * ```typescript
   * publisher.unsubscribe('topic.deno', handler)
   * ```
   * 
   * @param topicOrSubscriber A subscriber if used as the only argument, or a topic if the subscriber argument is also provided.
   * @param subscriber Only used if the first argument is a topic.
   * @returns The number of subscriptions unsubscribed.
   * @throws TypeError if the arguments are not as expected.
   */
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
   * @param topic Topic that this endpoint should receive.
   * @param endpointOrHandler An endpoint instance or handler.
   * @returns The endpoint
   */
  connect(topic: Topic, endpointOrHandler: Endpoint|EndpointOutboundHandler) {
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
   * This disconnects an endpoint from all topics or some.
   * 
   * @param topicOrEndpoint The topic to disconnect from, or the endpoint if it is the only argument.
   * @param endpoint The target endpoint if the first argument is a topic.
   * @returns
   */
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
   * Sends a message to all subscribers of a [[`Topic`]].
   * 
   * ```typescript
   * publisher.publish('topic.*', 'this is a message to subscribers of all topics')
   * publisher.publish('topic.golang', 'this is a message to subscribers of topic.golang (and topic.* subscribers!)')
   * ```
   * 
   * @param topic 
   * @param message 
   * @returns The number of subscribers who received the message.
   * @throws [[`PublishErrors`]] if any subscribers threw. Thrown _after_ all subscribers have been messaged.
   */
  async publish(topic: Topic, message: any): Promise<number>
  async publish(endpoint: Endpoint, message: EndpointMessage): Promise<number>
  async publish(topicOrEndpoint: Topic|Endpoint, message: any): Promise<number> {
    let targetEndpoint: Endpoint|undefined = undefined
    let topic: Topic|undefined = undefined
    if (typeof topicOrEndpoint === 'string') {
      topic = topicOrEndpoint
    } else {
      if (messageIsEndpointMessage(message)) {
        topic = message.topic
        message = message.message
      } else {
        topic = '*'
      }
      targetEndpoint = topicOrEndpoint
    }
    let errors: PublishError[] = []
    // Send to our subscribers.
    const results = this.getTopicSubscribers(topic)
    for (let result of results) {
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
      if (minimatch(topic, topicKey) || minimatch(topicKey, topic)) {
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

  getTopicEndpoints(topic: Topic): TopicEndpointResult[] {
    let ends: TopicEndpointResult[] = []
    for (let [topicKey, endpoints] of this.endpoints) {
      if (minimatch(topic, topicKey) || minimatch(topicKey, topic)) {
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
      if (minimatch(topicKey, topic)) {
        topics.push(topicKey)
      }
    }
    return topics
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