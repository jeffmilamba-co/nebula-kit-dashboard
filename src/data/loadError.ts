/** A dataset couldn't be loaded; `messages` are written for the person who chose the files. */
export class LoadError extends Error {
  readonly messages: string[]
  constructor(messages: string[]) {
    super(messages.join('\n'))
    this.name = 'LoadError'
    this.messages = messages
  }
}
