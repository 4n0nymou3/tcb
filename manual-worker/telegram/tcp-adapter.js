import { connect } from "cloudflare:sockets";
export async function connectTcp(host, port) {
  const socket = connect({ hostname: host, port });
  await socket.opened;
  return {
    readable: socket.readable,
    writable: socket.writable,
    closed: socket.closed,
    close: () => socket.close()
  };
}
