# @kettek/pubsub
This library provides a relatively simple PubSub implementation that supports glob matching for both subscriptions and for publishing.

## Installation

```bash
npm i @kettek/pubsub
```

## Documentation
See the [TypeDoc generated documentation](https://kettek.github.io/node-pubsub/).

## Usage

```typescript
import { Publisher } from '@kettek/pubsub'

const p = new Publisher()

let s = p.subscribe('topic.golang', async ({ message }) => {
	console.log(message)
})

p.publish('topic.golang', 'Hello from topic.golang!')
// Hello from topic.golang!

p.unsubscribe(s)
```

Wildcards can be used for subscriptions:

```typescript
let s = p.subscribe('topic.*', async ({ message }) => {
	console.log(message)
})

p.publish('topic.golang', 'Hello from topic.golang!')
p.publish('topic.rust', 'Hello from topic.rust!')
// Hello from topic.golang!
// Hello from topic.rust!
```

Wildcards can also be used for publishing:

```typescript
let s = p.subscribe('topic.golang', async ({ message }) => {
	console.log(message)
})
let s2 = p.subscribe('topic.rust', async ({ message }) => {
	console.log(message)
})

p.publish('topic.*', 'Hello from topic.*!')
// Hello from topic.*!
// Hello from topic.*!
```

Await can be used to wait for all subscribers to be published to:

```typescript
let s = p.subscribe('topic.golang', async ({ message }) => {
	console.log(message)
})

await p.publish('topic.golang', 'Hello from topic.golang!')
```

A single subscriber can be used for multiple topic subscriptions:

```typescript
let s = p.subscribe('topic.golang', async ({ message }) => {
	console.log(message)
})
p.subscribe('topic.rust', s)

p.publish('topic.golang', 'Hello from topic.golang!')
p.publish('topic.rust', 'Hello from topic.rust!')
// Hello from topic.golang!
// Hello from topic.rust!
```

A subscriber can be unsubscribed from a topic:

```typescript
p.unsubscribe('topic.rust', s)
// s is still subscribed to topic.golang
```

A subscriber can also be unsubscribed from all subscribed topics:

```typescript
p.unsubscribe(s)
// s is no longer subscribed to any topics.
```

A handler/callback can be used instead of a subscriber:

```typescript
let h = async ({message}) => {
	console.log('handled', message)
}

p.subscribe('topic.golang', h)
p.subscribe('topic.rust', h)

p.publish('topic.golang', 'Hello from topic.golang!')
p.publish('topic.rust', 'Hello from topic.rust!')
// Hello from topic.golang!
// Hello from topic.rust!

p.unsubscribe('topic.rust', h)
// h is now only subscribed to topic.golang.
p.unsubscribe(h)
// h is now unsubscribed from all subscriptions.
```
