/**
 * Topic is a string that can contain glob pattern matching adhering to [minimatch](https://github.com/isaacs/minimatch)'s syntax.
 * 
 * The glob pattern matching can be used to define hierarchies using whatever delimiters desired. For continuity, this library uses '.' to delineate topics and sub-topics within documentation.
 * 
 * ```typescript
 * let topic1 = 'topic.golang'
 * let topic2 = 'topic.golang.news'
 * let topic3 = 'topic.unix'
 * let topic4 = 'topic.unix.news'
 * let topic5 = 'topic.*.news'      // Resolves the '.news' sub-topics of all topics of 'topic.'.
 * let topic6 = 'topic.*'           // Resolves all sub-topics of 'topic.'
 * let topic7 = '*.unix.*'          // Resolves any topic containing '.unix.'.
 * ```
 */
export type Topic = string & { branded?: never }