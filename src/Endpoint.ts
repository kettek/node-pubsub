import { PublishedMessage } from './Subscriber'

/**
 * An Endpoint represents a way to replicate messages to and from a Publisher.
 */
export class Endpoint {
  outbound: EndpointOutboundHandler
  constructor(outbound?: EndpointOutboundHandler) {
    if (outbound) {
      this.outbound = outbound
    } else {
      this.outbound = async (msg: any): Promise<number> => {return 0}
    }
  }
}

/**
 * An Endpoint's handler is used to send messages to the endpoint's target, whether a separate system, a websockets connect, or otherwise. It should return the amount of subscribers it successfully sent to, as per [[`Publisher.publish`]]. If it throws, it will be captured by the Publisher.
 */
export interface EndpointOutboundHandler {
  (result: EndpointMessage): Promise<number>
}

/**
 * EndpointMessage extends PublishedMessage and is used for endpoint-to-publisher communications.
 */
export interface EndpointMessage extends PublishedMessage {
  wrapped: true
}

export function messageIsEndpointMessage(m: any): m is EndpointMessage {
  if (!(m instanceof Object)) return false
  return 'wrapped' in m
}