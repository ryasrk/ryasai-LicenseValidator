/**
 * Node.js-only part of the instrumentation (see instrumentation.ts). Route handlers cannot
 * see the socket, so every incoming request is stamped here with the address it really came
 * from. Any value a client sent in that header is overwritten.
 */
import { Server, type IncomingMessage } from 'node:http'

import { PEER_ADDRESS_HEADER } from '@/server/middleware'

const flagged = Server.prototype as typeof Server.prototype & { __peerAddressPatched?: boolean }

if (!flagged.__peerAddressPatched) {
  flagged.__peerAddressPatched = true

  const emit = Server.prototype.emit
  Server.prototype.emit = function (this: InstanceType<typeof Server>, event: string | symbol, ...args: unknown[]) {
    if (event === 'request') {
      const request = args[0] as IncomingMessage
      delete request.headers[PEER_ADDRESS_HEADER]
      if (request.socket.remoteAddress) request.headers[PEER_ADDRESS_HEADER] = request.socket.remoteAddress
    }
    return emit.call(this, event, ...args)
  } as typeof emit
}
