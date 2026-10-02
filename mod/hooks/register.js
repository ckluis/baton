// baton v7 hooks module (skeleton)
export function register(on, options) {
  on('session.start', async ($, e, next) => next(e))
}
